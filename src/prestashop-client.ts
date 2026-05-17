/**
 * Thin REST wrapper around the PrestaShop Webservice API.
 *
 * Auth: HTTP Basic — username = api_key, password = "". Equivalent
 * to passing `?ws_key=<key>` but cleaner.
 *
 * Wire format: we always request `output_format=JSON` and
 * `Accept: application/json` to avoid PrestaShop's default XML payloads.
 *
 * PrestaShop quirks to keep in mind:
 *   - Resource roots: /api/products, /api/carts, /api/orders, etc.
 *   - Multilang text fields come back as
 *       { "language": [ { "@attributes": { "id": "1" }, "@value": "..." } ] }
 *     when JSON output is enabled.
 *   - POST / PUT bodies expect XML by default; we POST JSON via the
 *     `input_format=JSON` query param.
 */

import type { PrestaShopCredentials } from "./config";

export class PrestaShopError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
    public readonly url: string,
  ) {
    super(`PrestaShop ${status} ${statusText} at ${url}`);
    this.name = "PrestaShopError";
  }
}

export class PrestaShopClient {
  constructor(private readonly creds: PrestaShopCredentials) {}

  async fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = this.apiUrl(path);
    const headers = new Headers(init.headers || {});
    headers.set("authorization", `Basic ${Buffer.from(`${this.creds.apiKey}:`).toString("base64")}`);
    headers.set("accept", "application/json");
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const res = await fetch(url, { ...init, headers });
    const text = await res.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!res.ok) {
      throw new PrestaShopError(res.status, res.statusText, body, url);
    }
    return body as T;
  }

  private apiUrl(path: string): string {
    const base = this.creds.baseUrl;
    const p = path.startsWith("/") ? path : `/${path}`;
    const withApi = p.startsWith("/api/") ? p : `/api${p}`;
    // Always force JSON in/out.
    const sep = withApi.includes("?") ? "&" : "?";
    const u = `${base}${withApi}${sep}output_format=JSON&input_format=JSON&display=full`;
    return u;
  }

  get languageId(): number {
    return this.creds.languageId;
  }
  get shopId(): number {
    return this.creds.shopId;
  }
}

// Multilang helper — pulls the language-id'd value out of PrestaShop's
// "@value" wrapping when JSON output is enabled.
export function pickLang(
  field: unknown,
  languageId: number,
): string | undefined {
  if (typeof field === "string") return field;
  if (!field || typeof field !== "object") return undefined;
  const f = field as { language?: unknown };
  if (!f.language) return undefined;
  const arr = Array.isArray(f.language) ? f.language : [f.language];
  for (const entry of arr) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { "@attributes"?: { id?: string | number }; "@value"?: string; id?: string | number };
    const id = e["@attributes"]?.id ?? e.id;
    const val = e["@value"];
    if (id !== undefined && String(id) === String(languageId) && typeof val === "string") {
      return val;
    }
  }
  // Fallback: first non-empty value.
  for (const entry of arr) {
    if (entry && typeof entry === "object") {
      const v = (entry as { "@value"?: string })["@value"];
      if (typeof v === "string" && v.trim()) return v;
    }
  }
  return undefined;
}
