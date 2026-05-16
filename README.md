# Agentic Commerce for PrestaShop

Multi-protocol agentic-commerce layer for [PrestaShop](https://www.prestashop.com/). Speaks **[ACP](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol)**, **[UCP](https://github.com/Universal-Commerce-Protocol/ucp)**, and **[AP2](https://github.com/google-agentic-commerce/AP2)** out of the box, emits real-standard discovery files (`/llms.txt`, schema.org JSON-LD, real-AI-crawler `robots.txt`), and settles through your existing PrestaShop payment module — cards, [Stripe MPP](https://mpp.dev), [x402](https://x402.org), stablecoins.

> Scaffold for the [`agentic-commerce-for-*`](https://github.com/xpaysh?q=agentic-commerce-for-) family. Full implementation lands in coming weeks alongside the [plugin template](https://github.com/xpaysh/agentic-commerce-plugin-template).

## What this gives a PrestaShop merchant

- **Agent-readable storefront** — your PrestaShop catalog (~7,600 active stores worldwide) gets exposed to ChatGPT, Claude, Gemini, and Perplexity via [llms.txt](https://llmstxt.org), schema.org JSON-LD on PDPs and category pages, and a `robots.txt` allowlist for real AI crawlers.
- **Multi-protocol checkout endpoints** — ACP `POST /checkout_sessions` + `/delegate_payment` backed by PrestaShop's Cart + Order; UCP REST surface with [RFC 9421](https://datatracker.ietf.org/doc/rfc9421/) signed-request verification; AP2 mandate acceptance.
- **No new processor.** Agents settle through your existing PrestaShop payment module (PrestaShop Checkout, Stripe, PayPal, Adyen, regional providers). Optional MPP / x402 / stablecoin rails are configurable.
- **Cart deeplinks** — JWT-signed (commercial mode) or query-string (standalone) — pre-fill a PrestaShop cart and redirect the buyer to your existing checkout.
- **Two-mode operation** — *standalone* (no xpay backend) or *commercial* (xpay backend adds catalog hosting, attribution, multi-region analytics).

## Distribution shape

PrestaShop modules are PHP packages installed via the back-office module manager or uploaded as zip. Distribution channels:

- **PrestaShop Addons Marketplace** — submission once v1.0.0 lands
- **Direct GitHub release** — zip download for self-hosted stores

```
   AI Agent  ───►  PrestaShop store (with agentic-commerce module)  ───►  PrestaShop Webservice API
                  (ACP / UCP / AP2 endpoints                              (Cart, Order, Product)
                   exposed via /modules/agentic_commerce/*)
                          │
                          └──►  Merchant's existing payment module
                                (Stripe, PayPal, PrestaShop Checkout, MPP, x402, …)
```

PrestaShop is the strongest EU presence in the family; the long-tail of EU-regional payment modules (Mollie, Klarna, regional iDEAL/Bancontact variants) all keep working — the agentic layer doesn't touch settlement.

## Status

- 🚧 **Scaffold** — README + LICENSE only. PHP/Symfony ecosystem; closely shares engineering shape with the Magento and WooCommerce siblings.
- Completely uncontested space — no existing `agentic-commerce-*` module on GitHub for PrestaShop today (as of 2026-05-16 survey).
- Track progress and adjacent platforms in the [awesome-agentic-commerce](https://github.com/xpaysh/awesome-agentic-commerce) registry.

## See also

- [Plugin template](https://github.com/xpaysh/agentic-commerce-plugin-template) — shared TypeScript core
- [awesome-agentic-commerce](https://github.com/xpaysh/awesome-agentic-commerce) — ecosystem registry
- [Agentic Commerce for WooCommerce](https://github.com/xpaysh/agentic-commerce-for-woocommerce) · [Agentic Commerce for Magento](https://github.com/xpaysh/agentic-commerce-for-magento) — sibling PHP plugins
- [ACP vs UCP vs AP2 — Technical Comparison](https://docs.xpay.sh/agentic-commerce-protocols/comparison)
- [PrestaShop Dev Docs](https://devdocs.prestashop-project.org/) · [Addons Marketplace](https://addons.prestashop.com/)

## License

Apache-2.0.
