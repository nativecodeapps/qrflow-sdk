// qrflow: the QRFLOW.codes API client. One file, no dependencies. Runs where
// fetch runs: Node 18+, Bun, Deno, Cloudflare Workers, Vercel Edge.
// Docs: https://qrflow.codes/developers · Markdown for agents: https://qrflow.codes/llms-full.txt
//
//   import { QRFlow } from "qrflow";
//   const qr = new QRFlow(process.env.QRFLOW_KEY!);
//   const { code } = await qr.createCode({ type: "url", destination_data: { url: "https://acme.com/menu" }, label: "Menu" });
//   console.log(code.short_url);   // print this; change the destination later without reprinting

export type Plan = "free" | "premium" | "business";
export type CodeType = "url" | "text" | "wifi" | "vcard" | "email" | "phone" | "sms" | "location";
export type ScanGroup = "day" | "device" | "country" | "city" | "browser" | "os" | "referrer";
export type WebhookEventName = "scan" | "code.created" | "code.updated" | "code.deleted";

/** A QR code as the API returns it. `short_url` is what to print for a dynamic code. */
export interface Code {
  id: string;
  label: string | null;
  /** Catalog id: url, wifi, instagram, googlereview, ... */
  kind: string;
  kind_label: string;
  type: CodeType | string;
  destination_data: Record<string, string>;
  /** One-line summary of destination_data. */
  destination: string;
  /** True when scans go through QRFLOW and the destination can change after printing. */
  dynamic: boolean;
  dynamic_capable: boolean;
  short_code: string;
  /** The exact string inside the code; includes your domain and link name when set. */
  short_url: string;
  domain_id: string | null;
  fg_color: string;
  bg_color: string;
  has_logo: boolean;
  frame_style: string | null;
  frame_caption: string | null;
  frame_caption2: string | null;
  scans: number;
  created_at: string;
  updated_at: string;
  manage_url: string;
  /** GET with the Authorization header; not a public image URL. Use image() or proxy it. */
  image_url: string;
  /** Print-ready SVG through a signed link: no header needed, valid 24 hours. Good for <img>, scripts, one-off saves. */
  svg_download_url: string;
  /** Plain PNG (no frame or logo) through a signed link: no header needed, valid 24 hours. */
  png_download_url: string;
  /** When the two download links lapse; any read of the code returns fresh ones. */
  download_expires_at: string;
}

export interface CreateCode {
  type: CodeType;
  /** The type's fields, plus `subtype` for kinds such as instagram or googlereview (see catalog()). */
  destination_data: Record<string, string>;
  label?: string;
  fg_color?: string;
  bg_color?: string;
  frame_style?: string;
  frame_caption?: string;
  frame_caption2?: string;
  /** Which of your link domains this code prints with; omit for the default. */
  domain_id?: string | null;
}

export interface UpdateCode {
  /** Dynamic codes only. The printed code keeps working. */
  destination_data?: Record<string, string>;
  label?: string | null;
  paused?: boolean;
  /** ISO 8601, or null to clear. */
  expires_at?: string | null;
  /** Link name on your domain (go.brand.com/<slug>). Changes the printed link: set before printing. */
  slug?: string | null;
  domain_id?: string | null;
  fg_color?: string;
  bg_color?: string;
  frame_style?: string;
  frame_caption?: string | null;
  frame_caption2?: string | null;
}

export interface Scans { code_id: string; from: string; to: string; group: ScanGroup; total: number; rows: Array<{ key: string; scans: number }> }
export interface Domain { id: string; host: string; status: string; active: boolean; is_default: boolean; verified_at: string | null; grace_until: string | null }
export interface Webhook { id: string; url: string; events: WebhookEventName[]; active: boolean; last_status: number | null; last_delivery_at: string | null; consecutive_failures: number; /** Only on create. */ secret?: string }
export interface Me { id: string; email: string; plan: Plan; paid: boolean; features: Record<string, boolean>; limits: Record<string, number | null>; auth: "oauth" | "api_key"; scopes: string[] }
export interface CatalogKind { id: string; label: string; group: string; requiresPlan: Plan; type: CodeType; subtype: string | null; dynamic: boolean; fields: Array<{ key: string; label: string; optional?: boolean; type?: string; options?: Array<{ value: string; label: string }> }> }
export interface BulkResult { codes: Code[]; rejected: Array<{ destination: string; reason: string }>; remaining_this_month: number }

export interface ScanEvent { code_id: string; label: string | null; short_code: string | null; slug: string | null; scanned_at: string; device: string | null; country: string | null; city: string | null; referrer: string | null; browser: string | null; os: string | null; language: string | null }
/** Every delivery is { id, event, created_at, data }. `id` is stable across retries: dedupe on it. */
export type WebhookEvent =
  | { id: string; event: "scan"; created_at: string; data: { count: number; from: string; to: string; scans: ScanEvent[] } }
  | { id: string; event: "code.created"; created_at: string; data: { code: Code; source: string } | { bulk: true; count: number; codes: Code[]; source: string } }
  | { id: string; event: "code.updated"; created_at: string; data: { code: Code; changed: string[] } }
  | { id: string; event: "code.deleted"; created_at: string; data: { code: { id: string; label: string | null; short_code: string; slug: string | null } } }
  | { id: string; event: "ping"; created_at: string; data: { webhook_id: string; message: string } };

/** Thrown for any non-2xx answer. `code` is the API's error code (invalid_token, upgrade_required, rate_limited, ...). */
export class QRFlowError extends Error {
  /** HTTP status. */
  readonly status: number;
  /** API error code: invalid_request, invalid_token, upgrade_required, insufficient_scope, not_found, conflict, rate_limited, ... */
  readonly code: string;
  /** Seconds to wait, on 429. */
  readonly retryAfter?: number;
  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.name = "QRFlowError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export interface QRFlowOptions {
  /** Defaults to https://qrflow.codes/api/v1. */
  baseUrl?: string;
  /** Your own fetch (tests, custom agents). */
  fetch?: typeof fetch;
  /** How many times a 429 is retried after waiting Retry-After. Default 2. 0 disables. */
  retries?: number;
}

export class QRFlow {
  private readonly key: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retries: number;

  /** @param key A Business API key (qrf_live_…) or an OAuth access token. Keep it on the server. */
  constructor(key: string, options: QRFlowOptions = {}) {
    if (!key) throw new Error("QRFlow: an API key is required (Account › API keys on qrflow.codes).");
    this.key = key;
    this.base = (options.baseUrl ?? "https://qrflow.codes/api/v1").replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? fetch;
    this.retries = options.retries ?? 2;
  }

  private async call<T>(method: string, path: string, body?: unknown, query?: Record<string, string | number | undefined>, attempt = 0): Promise<T> {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const res = await this.fetchImpl(url, {
      method,
      headers: { authorization: `Bearer ${this.key}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let json: any = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON body: fall through to the status */ }
    if (res.status === 429 && attempt < this.retries) {
      const wait = Math.min(60, Math.max(1, Number(res.headers.get("retry-after") ?? 5)));
      await new Promise((r) => setTimeout(r, wait * 1000));
      return this.call<T>(method, path, body, query, attempt + 1);
    }
    if (!res.ok) throw new QRFlowError(res.status, json.error ?? "http_error", json.message ?? `HTTP ${res.status}`, res.status === 429 ? Number(res.headers.get("retry-after") ?? 60) : undefined);
    return json as T;
  }

  /** Who the key belongs to: plan, features, limits, scopes. A good first call. */
  me() { return this.call<Me>("GET", "/me"); }
  /** Every kind of code and the fields it needs. No key needed on the API; the client sends yours anyway. */
  catalog() { return this.call<{ kinds: CatalogKind[] }>("GET", "/catalog"); }
  /** Newest first. `limit` up to 100, `q` searches labels. */
  listCodes(opts: { limit?: number; q?: string } = {}) { return this.call<{ codes: Code[] }>("GET", "/codes", undefined, opts); }
  getCode(id: string) { return this.call<{ code: Code }>("GET", `/codes/${id}`); }
  /** Create a code. url/phone/email/sms/location are dynamic on paid plans. Save code.id and code.short_url. */
  createCode(input: CreateCode) { return this.call<{ code: Code }>("POST", "/codes", input); }
  /** Send only what changes. */
  updateCode(id: string, patch: UpdateCode) { return this.call<{ code: Code }>("PATCH", `/codes/${id}`, patch); }
  /** Permanent. Prefer updateCode(id, { paused: true }) when a print exists. */
  deleteCode(id: string) { return this.call<void>("DELETE", `/codes/${id}`); }
  /** Convert a static url/phone/email/sms/location code to dynamic (paid plans). Re-render and re-print afterwards. */
  makeDynamic(id: string) { return this.call<{ code: Code }>("POST", `/codes/${id}/dynamic`); }
  /** Scan analytics, up to 92 days per call, default the last 30. */
  scans(id: string, opts: { from?: string; to?: string; group?: ScanGroup } = {}) { return this.call<Scans>("GET", `/codes/${id}/scans`, undefined, opts); }
  /** Many dynamic url codes in one call (Business: 2,000 per request). */
  bulkCreate(rows: Array<{ destination: string; label?: string }>, colors: { fg_color?: string; bg_color?: string } = {}) { return this.call<BulkResult>("POST", "/codes/bulk", { rows, ...colors }); }
  domains() { return this.call<{ default_base: string; domains: Domain[] }>("GET", "/domains"); }
  listWebhooks() { return this.call<{ webhooks: Webhook[] }>("GET", "/webhooks"); }
  /** The signing secret comes back once, on this call. */
  createWebhook(input: { url: string; events: WebhookEventName[]; description?: string }) { return this.call<{ webhook: Webhook }>("POST", "/webhooks", input); }
  testWebhook(id: string) { return this.call<{ test: { ok: boolean; status: number | null; error: string | null } }>("POST", `/webhooks/${id}`); }
  deleteWebhook(id: string) { return this.call<void>("DELETE", `/webhooks/${id}`); }

  /** Absolute URL of the print-ready SVG. It needs the Authorization header, so fetch it server-side (see image()). */
  imageUrl(id: string, size = 1024) { return `${this.base}/codes/${id}/image.svg?size=${size}`; }
  /** Absolute URL of the plain PNG (no frame or logo). Needs the Authorization header like imageUrl(); or use code.png_download_url. */
  pngUrl(id: string, size = 1024) { return `${this.base}/codes/${id}/image.png?size=${size}`; }
  /** The plain PNG as bytes. Write it to disk or return it from your own route. */
  async png(id: string, size = 1024): Promise<Uint8Array> {
    const res = await this.fetchImpl(this.pngUrl(id, size), { headers: { authorization: `Bearer ${this.key}`, accept: "image/png" } });
    if (!res.ok) {
      let json: any = {};
      try { json = JSON.parse(await res.text()); } catch { /* ignore */ }
      throw new QRFlowError(res.status, json.error ?? "http_error", json.message ?? `HTTP ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
  /** The print-ready SVG (frame, colors, logo) as a string. Serve it from your own route, or convert to PNG with sharp/resvg. */
  async image(id: string, size = 1024): Promise<string> {
    const res = await this.fetchImpl(this.imageUrl(id, size), { headers: { authorization: `Bearer ${this.key}`, accept: "image/svg+xml" } });
    if (!res.ok) {
      let json: any = {};
      try { json = JSON.parse(await res.text()); } catch { /* ignore */ }
      throw new QRFlowError(res.status, json.error ?? "http_error", json.message ?? `HTTP ${res.status}`);
    }
    return res.text();
  }
}

// ---- webhooks ---------------------------------------------------------------

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Verify a delivery. `signatureHeader` is the X-QRFLOW-Signature header
 * ("t=<unix seconds>,v1=<hex>"); `rawBody` must be the exact bytes received,
 * before any JSON parsing. Uses WebCrypto, so it runs everywhere the client does.
 */
export async function verifyWebhook(rawBody: string | Uint8Array, signatureHeader: string, secret: string, toleranceSeconds = 300): Promise<boolean> {
  const t = /t=(\d+)/.exec(signatureHeader)?.[1];
  const v1 = /v1=([a-f0-9]+)/.exec(signatureHeader)?.[1];
  if (!t || !v1 || Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds) return false;
  const body = typeof rawBody === "string" ? enc.encode(rawBody) : rawBody;
  const signed = new Uint8Array(t.length + 1 + body.length);
  signed.set(enc.encode(`${t}.`), 0);
  signed.set(body, t.length + 1);
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, signed));
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

/** Verify and parse in one step. Throws QRFlowError(401, "invalid_signature") when the signature does not check out. */
export async function parseWebhook(rawBody: string | Uint8Array, signatureHeader: string, secret: string, toleranceSeconds = 300): Promise<WebhookEvent> {
  if (!(await verifyWebhook(rawBody, signatureHeader, secret, toleranceSeconds))) throw new QRFlowError(401, "invalid_signature", "The webhook signature did not verify.");
  const text = typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody);
  return JSON.parse(text) as WebhookEvent;
}

export default QRFlow;
