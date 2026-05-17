# agentic-commerce-for-prestashop

**Multi-protocol agentic-commerce layer for [PrestaShop](https://www.prestashop.com/) 1.7+.** Speaks ACP, UCP, AP2; emits real-standard discovery files; signed-JWT cart-deeplinks; rail-agnostic.

Runs as a Node sidecar talking to PrestaShop over its Webservice REST API. Needs only an API key. Implements [`@xpaysh/adapter-contract`](https://www.npmjs.com/package/@xpaysh/adapter-contract) — same contract as the WooCommerce, commercetools, BigCommerce, Magento, and Saleor siblings.

> A native PrestaShop module (PHP, installable via Composer or back-office upload) is on the v0.3 roadmap. v0.1 ships as a Node sidecar so it can run on the same host as your storefront without touching the PrestaShop codebase.

## What v0.1 ships

### Discovery

| Path | Standard |
|---|---|
| `GET /llms.txt` | [llmstxt.org](https://llmstxt.org) |
| `GET /.well-known/ucp` | UCP profile |
| `GET /.well-known/oauth-protected-resource` | RFC 9728 (opt-in) |
| `GET /.well-known/agent-card.json` | A2A 1.0 (opt-in) |
| `GET /robots.txt` | RFC 9309 + AI-bot allowlist |
| `GET /api/v1/jsonld/product/:id` | schema.org JSON-LD |

### Protocols

- **UCP**: catalog search/lookup, cart CRUD, checkout, order lookup
- **ACP**: `checkout_sessions` create / get / update / complete
- **AP2**: structural mandate verification, mandate-bound checkout

### Cart handoff

`GET /cart/deeplink?token=<jwt>` redeems an HS256-signed JWT and lands the agent on the storefront's order-flow with a pre-filled cart.

## Capabilities

```
cart                ✓
checkout            ✓  (hands off to storefront payment module)
catalogSearch       ✓
catalogLookup       ✓
order               ✓
inventoryRealtime   ✓
refunds             —  v0.3
disputes            —  v0.3
webhooks            —  v0.3 (PrestaShop hook subscriptions)
```

## Quickstart (Docker)

```bash
git clone https://github.com/xpaysh/agentic-commerce-for-prestashop.git
cd agentic-commerce-for-prestashop
cp .env.example .env
# Fill in XPAY_MERCHANT_SLUG, SITE_URL, XPAY_API_KEY,
# PRESTASHOP_BASE_URL, PRESTASHOP_API_KEY

docker compose -f examples/docker-compose.yml up --build
```

## Manual run

```bash
npm install
cp .env.example .env       # fill in
npm run build
node --env-file=.env dist/server.js
```

## Get a PrestaShop API key

1. PrestaShop Back Office → **Advanced Parameters → Webservice**
2. Confirm **Enable PrestaShop's webservice** is ON
3. **Add new webservice key**:
   - Key: auto-generate (32 chars)
   - Key description: `xpay agentic commerce`
   - Permissions: **GET** on `products`, `orders`, `customers`, `addresses`, `combinations`, `images`; **GET + POST + PUT** on `carts`
4. Save → copy the **Key** into `PRESTASHOP_API_KEY`
5. If multi-shop, set `PRESTASHOP_SHOP_ID` to the shop id. If multilingual, set `PRESTASHOP_LANGUAGE_ID` to your primary language id.

## Multilang note

PrestaShop returns multilingual fields as `{ language: [ { @attributes: { id: "1" }, @value: "..." } ] }`. The mapper picks the value for your configured `PRESTASHOP_LANGUAGE_ID` and falls back to the first non-empty value if absent — so multi-language stores work out of the box with sensible defaults.

## Architecture

This package is one of a family of `agentic-commerce-for-<platform>` repos under [xpaysh](https://github.com/xpaysh) that all implement the same `@xpaysh/adapter-contract`:

- [agentic-commerce-for-woocommerce](https://github.com/xpaysh/agentic-commerce-for-woocommerce) — PHP-native reference
- [agentic-commerce-for-commercetools](https://github.com/xpaysh/agentic-commerce-for-commercetools)
- [agentic-commerce-for-bigcommerce](https://github.com/xpaysh/agentic-commerce-for-bigcommerce)
- [agentic-commerce-for-magento](https://github.com/xpaysh/agentic-commerce-for-magento)
- [agentic-commerce-for-saleor](https://github.com/xpaysh/agentic-commerce-for-saleor)
- [agentic-commerce-for-prestashop](https://github.com/xpaysh/agentic-commerce-for-prestashop) — *this repo*

Per-platform delta is ~3 files (`prestashop-client.ts`, `adapter.ts`, `mappers.ts`); every protocol route handler and discovery emitter is shared.

## License

Apache-2.0
