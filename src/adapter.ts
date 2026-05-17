/**
 * PrestaShopAdapter — implements @xpaysh/adapter-contract's PlatformAdapter
 * against the PrestaShop 1.7+ Webservice REST API.
 *
 * v0.1 scope:
 *   - Catalog read (search by name, lookup by id)
 *   - Cart create / read / update (PrestaShop "cart" resource)
 *   - Order read / list (PrestaShop "order" resource)
 *   - completeCheckout defers to storefront PSP — pre-fills cart and
 *     surfaces the storefront checkout URL.
 *
 * v0.3 will add: native Composer/PrestaShop module (vs Node sidecar),
 * order placement (PrestaShop's order creation requires module-side hooks
 * for payment), webhook subscriptions (PrestaShop has stockMovement hooks).
 */

import type {
  PlatformAdapter,
  AdapterCapabilities,
  Product,
  ProductQuery,
  Paginated,
  ProductId,
  CartId,
  Cart,
  CreateCartInput,
  CartMutation,
  CompleteCheckoutInput,
  Order,
  OrderId,
  OrderQuery,
  RefundResult,
  DisputeHandle,
} from "@xpaysh/adapter-contract";

import { PrestaShopClient, PrestaShopError, pickLang } from "./prestashop-client";
import {
  mapProduct,
  mapCart,
  mapOrder,
  type PsProduct,
  type PsCartRow,
  type PsOrderRow,
} from "./mappers";

export class NotImplementedError extends Error {
  constructor(method: string) {
    super(`${method} is not implemented in v0.1`);
    this.name = "NotImplementedError";
  }
}

export interface PrestaShopAdapterOptions {
  prestashop: PrestaShopClient;
  siteUrl: string;
  defaultCurrency?: string;
}

interface PsListResponse<TKey extends string, T> {
  // Wire shape is { "<resource>": [items...] } when display=full
  // We type-assert at call sites; this interface is informational.
  [key: string]: T[] | unknown;
}

export class PrestaShopAdapter implements PlatformAdapter {
  readonly platformName = "prestashop";

  readonly capabilities: AdapterCapabilities = {
    cart: true,
    checkout: true,
    catalogSearch: true,
    catalogLookup: true,
    order: true,
    refunds: false, // v0.3
    disputes: false, // v0.3
    inventoryRealtime: true,
    webhooks: false, // v0.3
    extras: {},
  };

  private ps: PrestaShopClient;
  private siteUrl: string;
  private defaultCurrency: string;

  constructor(opts: PrestaShopAdapterOptions) {
    this.ps = opts.prestashop;
    this.siteUrl = opts.siteUrl.endsWith("/") ? opts.siteUrl : opts.siteUrl + "/";
    this.defaultCurrency = opts.defaultCurrency || "USD";
  }

  // -- Catalog -------------------------------------------------------------

  async listProducts(query: ProductQuery): Promise<Paginated<Product>> {
    const params = new URLSearchParams();
    const limit = Math.min(query.limit ?? 24, 100);
    const offset = query.cursor ? Math.max(0, parseInt(query.cursor, 10) || 0) : 0;
    params.set("limit", `${offset},${limit}`);
    // Always filter for active + available_for_order
    params.set("filter[active]", "1");
    params.set("filter[available_for_order]", "1");
    if (query.q) params.set("filter[name]", `%[${query.q}]%`);
    if (query.sku) params.set("filter[reference]", `[${query.sku}]`);
    if (query.category) params.set("filter[id_category_default]", query.category);
    if (query.sort === "price_asc") params.set("sort", "[price_ASC]");
    else if (query.sort === "price_desc") params.set("sort", "[price_DESC]");
    else if (query.sort === "newest") params.set("sort", "[date_add_DESC]");

    const data = await this.ps.fetchJson<{ products: PsProduct[] }>(`/products?${params.toString()}`);
    const products = data.products ?? [];
    const items = products.map((p) => mapProduct(p, this.ps.languageId, this.siteUrl, this.defaultCurrency));
    const hasMore = products.length === limit;
    return {
      items,
      nextCursor: hasMore ? String(offset + limit) : null,
    };
  }

  async getProduct(id: ProductId): Promise<Product | null> {
    try {
      const data = await this.ps.fetchJson<{ product: PsProduct }>(
        `/products/${encodeURIComponent(id)}`,
      );
      if (!data.product) return null;
      return mapProduct(data.product, this.ps.languageId, this.siteUrl, this.defaultCurrency);
    } catch (err) {
      if (err instanceof PrestaShopError && err.status === 404) return null;
      throw err;
    }
  }

  // -- Cart ----------------------------------------------------------------

  async createCart(input: CreateCartInput): Promise<Cart> {
    // PrestaShop cart create accepts cart_rows nested in the resource body.
    const body = {
      cart: {
        id_currency: 1, // default currency; v0.2 will resolve by code
        id_lang: this.ps.languageId,
        id_shop: this.ps.shopId,
        associations: {
          cart_rows: {
            cart_row: input.items.map((it) => ({
              id_product: it.sku, // PS expects numeric id_product; agents pass sku — best-effort
              id_product_attribute: 0,
              quantity: it.quantity,
            })),
          },
        },
      },
    };
    const data = await this.ps.fetchJson<{ cart: PsCartRow }>(`/carts`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return mapCart(data.cart, this.defaultCurrency);
  }

  async getCart(id: CartId): Promise<Cart | null> {
    try {
      const data = await this.ps.fetchJson<{ cart: PsCartRow }>(`/carts/${encodeURIComponent(id)}`);
      if (!data.cart) return null;
      return mapCart(data.cart, this.defaultCurrency);
    } catch (err) {
      if (err instanceof PrestaShopError && err.status === 404) return null;
      throw err;
    }
  }

  async updateCart(id: CartId, mutation: CartMutation): Promise<Cart> {
    // PrestaShop's PUT replaces the resource. Fetch current, apply mutation
    // in-memory, then PUT the result.
    const current = await this.ps.fetchJson<{ cart: PsCartRow }>(`/carts/${encodeURIComponent(id)}`);
    if (!current.cart) throw new Error(`updateCart: cart ${id} not found`);
    const cart = current.cart;
    const existing = new Map<string, { id_product: string; id_product_attribute: string; quantity: number }>();
    for (const r of cart.associations?.cart_rows ?? []) {
      existing.set(String(r.id_product), {
        id_product: String(r.id_product),
        id_product_attribute: String(r.id_product_attribute ?? 0),
        quantity: Number(r.quantity),
      });
    }
    if (Array.isArray(mutation.setItems)) {
      const target = new Map(mutation.setItems.map((it) => [it.sku, it]));
      for (const sku of existing.keys()) {
        if (!target.has(sku)) existing.delete(sku);
      }
      for (const [sku, t] of target.entries()) {
        const ex = existing.get(sku);
        if (ex) {
          ex.quantity = t.quantity;
        } else {
          existing.set(sku, { id_product: sku, id_product_attribute: "0", quantity: t.quantity });
        }
      }
    }
    if (Array.isArray(mutation.removeSkus)) {
      for (const s of mutation.removeSkus) existing.delete(s);
    }

    const putBody = {
      cart: {
        id: cart.id,
        id_currency: cart.id_currency ?? 1,
        id_lang: cart.id_lang ?? this.ps.languageId,
        id_customer: cart.id_customer,
        associations: {
          cart_rows: {
            cart_row: Array.from(existing.values()),
          },
        },
      },
    };
    const updated = await this.ps.fetchJson<{ cart: PsCartRow }>(
      `/carts/${encodeURIComponent(id)}`,
      { method: "PUT", body: JSON.stringify(putBody) },
    );
    return mapCart(updated.cart, this.defaultCurrency);
  }

  // -- Checkout / Order ----------------------------------------------------

  async completeCheckout(input: CompleteCheckoutInput): Promise<Order> {
    // PrestaShop order placement runs through payment modules; v0.1 defers
    // to the storefront's order flow. We surface a pending Order pointing
    // at the storefront's order-confirmation URL with the cart id.
    const orderUrl = `${this.siteUrl}index.php?controller=order&id_cart=${encodeURIComponent(input.cartId)}`;
    return {
      id: `pending:${input.cartId}`,
      cartId: input.cartId,
      status: "created",
      items: [],
      subtotal: { amount: 0, currency: this.defaultCurrency },
      total: { amount: 0, currency: this.defaultCurrency },
      shippingAddress: input.shippingAddress,
      billingAddress: input.billingAddress ?? input.shippingAddress,
      createdAt: new Date().toISOString(),
      meta: { storefront_checkout_url: orderUrl, ps_cart_id: input.cartId },
    };
  }

  async getOrder(id: OrderId): Promise<Order | null> {
    // Try numeric id first; fall back to reference filter.
    if (/^\d+$/.test(id)) {
      try {
        const data = await this.ps.fetchJson<{ order: PsOrderRow }>(`/orders/${id}`);
        if (!data.order) return null;
        return mapOrder(data.order, this.defaultCurrency);
      } catch (err) {
        if (err instanceof PrestaShopError && err.status === 404) return null;
        throw err;
      }
    }
    const data = await this.ps.fetchJson<{ orders: PsOrderRow[] }>(
      `/orders?filter[reference]=[${encodeURIComponent(id)}]`,
    );
    if (!data.orders || data.orders.length === 0) return null;
    return mapOrder(data.orders[0], this.defaultCurrency);
  }

  async listOrders(query: OrderQuery): Promise<Paginated<Order>> {
    const params = new URLSearchParams();
    const limit = Math.min(query.limit ?? 24, 100);
    const offset = query.cursor ? Math.max(0, parseInt(query.cursor, 10) || 0) : 0;
    params.set("limit", `${offset},${limit}`);
    if (query.createdAfter) params.set("filter[date_add]", `>[${query.createdAfter}]`);
    if (query.externalId) params.set("filter[reference]", `[${query.externalId}]`);
    params.set("sort", "[date_add_DESC]");

    const data = await this.ps.fetchJson<{ orders: PsOrderRow[] }>(
      `/orders?${params.toString()}`,
    );
    const orders = data.orders ?? [];
    const items = orders.map((o) => mapOrder(o, this.defaultCurrency));
    return {
      items,
      nextCursor: orders.length === limit ? String(offset + limit) : null,
    };
  }

  async refundOrder(): Promise<RefundResult> {
    throw new NotImplementedError("refundOrder");
  }

  async openDispute(): Promise<DisputeHandle> {
    throw new NotImplementedError("openDispute");
  }
}

// Re-export the helper used by mappers — referenced elsewhere.
export { pickLang };
