/**
 * Public package entry. Exports the adapter + the request handler factory
 * for use as a library (e.g. embedded in another Node service).
 */

export { PrestaShopAdapter, NotImplementedError } from "./adapter";
export type { PrestaShopAdapterOptions } from "./adapter";
export { PrestaShopClient, PrestaShopError } from "./prestashop-client";
export { loadConfig } from "./config";
export type { AppConfig, PrestaShopCredentials } from "./config";
export { buildHandler } from "./server";
export * as mappers from "./mappers";
