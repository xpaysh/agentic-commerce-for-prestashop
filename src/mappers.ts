/**
 * PrestaShop Webservice REST shapes → adapter-contract value types.
 */

import type {
  Address,
  Cart,
  Image,
  LineItem,
  Money,
  Order,
  OrderStatus,
  Product,
  ProductVariant,
} from "@xpaysh/adapter-contract";

import { pickLang } from "./prestashop-client";

// --- PrestaShop wire shapes (subset) ----------------------------------

export interface PsProduct {
  id: number | string;
  reference?: string; // SKU
  name?: unknown; // multilang
  description?: unknown;
  description_short?: unknown;
  link_rewrite?: unknown;
  price?: string;
  active?: string | number;
  available_for_order?: string | number;
  quantity?: string | number;
  manufacturer_name?: string;
  category_default?: string;
  associations?: {
    images?: { image?: Array<{ id: string | number }> | { id: string | number } };
    product_option_values?: Array<{ id: string | number }>;
  };
}

export interface PsCartRow {
  id: number | string;
  id_currency?: string | number;
  id_lang?: string | number;
  id_customer?: string | number;
  date_upd?: string;
  associations?: {
    cart_rows?: Array<{
      id_product: string | number;
      id_product_attribute?: string | number;
      quantity: string | number;
    }>;
  };
}

export interface PsOrderRow {
  id: number | string;
  reference?: string;
  current_state?: string | number;
  date_add?: string;
  date_upd?: string;
  total_paid?: string;
  total_paid_tax_incl?: string;
  total_paid_tax_excl?: string;
  total_products?: string;
  id_currency?: string | number;
  id_customer?: string | number;
  module?: string;
  payment?: string;
  associations?: {
    order_rows?: Array<{
      id: string | number;
      product_id: string | number;
      product_name: string;
      product_reference?: string;
      product_quantity: string | number;
      product_price: string;
      unit_price_tax_incl?: string;
      total_price_tax_incl?: string;
    }>;
  };
}

export interface PsAddress {
  firstname?: string;
  lastname?: string;
  company?: string;
  address1?: string;
  address2?: string;
  postcode?: string;
  city?: string;
  id_country?: string | number;
  id_state?: string | number;
  phone?: string;
  phone_mobile?: string;
  iso_code?: string;
}

// --- Money helper -----------------------------------------------------

export function toMoney(amount: string | number | undefined | null, currency = "USD"): Money {
  if (amount === undefined || amount === null) return { amount: 0, currency };
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  const safe = Number.isFinite(n) ? n : 0;
  return { amount: Math.round(safe * 100), currency: currency.toUpperCase() };
}

// --- Product ----------------------------------------------------------

export function mapProduct(p: PsProduct, languageId: number, siteUrl: string, currency = "USD"): Product {
  const name = pickLang(p.name, languageId) || `Product ${p.id}`;
  const descShort = pickLang(p.description_short, languageId);
  const desc = pickLang(p.description, languageId);
  const slug = pickLang(p.link_rewrite, languageId);
  const url = slug
    ? joinUrl(siteUrl, `${p.id}-${slug}.html`)
    : joinUrl(siteUrl, `index.php?controller=product&id_product=${p.id}`);

  const qty = typeof p.quantity === "string" ? parseInt(p.quantity, 10) : (p.quantity ?? 0);
  const inStock =
    Number(p.active ?? 1) === 1 && Number(p.available_for_order ?? 1) === 1 && qty > 0;

  const price = toMoney(p.price, currency);
  const variants: ProductVariant[] = [
    {
      id: String(p.id),
      sku: p.reference || String(p.id),
      price,
      inventory: Number.isFinite(qty) ? Number(qty) : null,
      inStock,
    },
  ];

  return {
    id: String(p.id),
    sku: p.reference,
    name,
    description: stripHtml(desc || descShort),
    price,
    brand: p.manufacturer_name,
    url,
    images: mapImages(p, siteUrl),
    variants,
    categories: p.category_default ? [String(p.category_default)] : undefined,
  };
}

function mapImages(p: PsProduct, siteUrl: string): Image[] {
  const imgsRaw = p.associations?.images?.image;
  if (!imgsRaw) return [];
  const imgs = Array.isArray(imgsRaw) ? imgsRaw : [imgsRaw];
  return imgs.map<Image>((i) => ({
    url: joinUrl(siteUrl, `img/p/${i.id}.jpg`),
  }));
}

function stripHtml(s?: string): string | undefined {
  if (!s) return undefined;
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || undefined;
}

function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base : base + "/";
  const p = path.startsWith("/") ? path.slice(1) : path;
  return `${b}${p}`;
}

// --- Cart -------------------------------------------------------------

export function mapCart(c: PsCartRow, currency = "USD"): Cart {
  const rows = c.associations?.cart_rows ?? [];
  const items: LineItem[] = rows.map((r) => {
    const qty = Number(r.quantity);
    return {
      id: `${r.id_product}-${r.id_product_attribute ?? 0}`,
      productId: String(r.id_product),
      variantId: r.id_product_attribute ? String(r.id_product_attribute) : undefined,
      sku: String(r.id_product),
      name: `Product ${r.id_product}`,
      quantity: Number.isFinite(qty) ? qty : 0,
      unitPrice: { amount: 0, currency },
      lineTotal: { amount: 0, currency },
    };
  });
  return {
    id: String(c.id),
    items,
    subtotal: { amount: 0, currency },
    total: { amount: 0, currency },
    updatedAt: c.date_upd,
    meta: {
      ps_cart_id: c.id,
      ps_currency_id: c.id_currency,
      ps_customer_id: c.id_customer,
    },
  };
}

// --- Order ------------------------------------------------------------

export function mapOrder(o: PsOrderRow, currency = "USD"): Order {
  const rows = o.associations?.order_rows ?? [];
  const items: LineItem[] = rows.map((r) => {
    const qty = Number(r.product_quantity);
    const unit = toMoney(r.unit_price_tax_incl ?? r.product_price, currency);
    const total = toMoney(r.total_price_tax_incl ?? (Number(r.product_price) * qty), currency);
    return {
      id: String(r.id),
      productId: String(r.product_id),
      sku: r.product_reference || String(r.product_id),
      name: r.product_name,
      quantity: Number.isFinite(qty) ? qty : 0,
      unitPrice: unit,
      lineTotal: total,
    };
  });
  const subtotal = toMoney(o.total_products, currency);
  const total = toMoney(o.total_paid_tax_incl ?? o.total_paid, currency);
  return {
    id: o.reference || String(o.id),
    status: mapStatus(Number(o.current_state ?? 0)),
    items,
    subtotal,
    total,
    createdAt: o.date_add ?? new Date().toISOString(),
    updatedAt: o.date_upd,
    meta: {
      ps_order_id: o.id,
      ps_state_id: o.current_state,
      ps_module: o.module,
      ps_payment: o.payment,
    },
  };
}

// PrestaShop's default Order State IDs:
//   1 = Awaiting cheque, 2 = Payment accepted, 3 = Processing in progress,
//   4 = Shipped, 5 = Delivered, 6 = Canceled, 7 = Refunded, 8 = Payment error,
//   9 = On backorder (paid), 10 = Awaiting bank wire, 11 = Awaiting PayPal payment,
//   12 = Remote payment accepted
function mapStatus(stateId: number): OrderStatus {
  switch (stateId) {
    case 2:
    case 12:
      return "confirmed";
    case 3:
    case 9:
      return "processing";
    case 4:
      return "shipped";
    case 5:
      return "delivered";
    case 6:
      return "cancelled";
    case 7:
      return "refunded";
    case 1:
    case 8:
    case 10:
    case 11:
    default:
      return "created";
  }
}

export function contractAddressToPs(addr: Address): PsAddress {
  const parts = (addr.name ?? "").trim().split(/\s+/);
  return {
    firstname: parts[0] || "",
    lastname: parts.slice(1).join(" ") || parts[0] || "",
    company: addr.company,
    address1: addr.line1,
    address2: addr.line2,
    postcode: addr.postalCode,
    city: addr.city,
    iso_code: addr.country,
    phone: addr.phone,
  };
}
