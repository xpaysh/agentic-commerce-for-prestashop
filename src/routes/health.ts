import type { PrestaShopClient } from "../prestashop-client";
import type { RouteHandler } from "./types";

export function buildHealthRoute(ps: PrestaShopClient, version: string): RouteHandler {
  return async () => {
    let reachable = false;
    let err: string | undefined;
    try {
      await ps.fetchJson("/products?limit=1");
      reachable = true;
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    return {
      status: reachable ? 200 : 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      body: JSON.stringify({
        ok: reachable,
        prestashop_reachable: reachable,
        prestashop_error: err,
        version,
        ts: new Date().toISOString(),
      }),
    };
  };
}
