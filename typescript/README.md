# qrflow

The official client for the [QRFLOW.codes](https://qrflow.codes) API: create QR codes from your code, **change where a printed code points without reprinting**, print codes on **your own domain**, read **scan analytics**, and verify **webhooks**.

Zero dependencies. Runs anywhere `fetch` runs: Node 18+, Bun, Deno, Cloudflare Workers, Vercel Edge, Supabase Edge Functions. Full TypeScript types. ESM and CommonJS.

```bash
npm install qrflow
```

## Five lines

```ts
import { QRFlow } from "qrflow";

const qr = new QRFlow(process.env.QRFLOW_KEY!);            // Business API key, server-side only

const { code } = await qr.createCode({
  type: "url",
  destination_data: { url: "https://acme.com/menu" },
  label: "Table tents",
});
console.log(code.short_url);                                // print this

await qr.updateCode(code.id, { destination_data: { url: "https://acme.com/menu-fall" } });
// the printed code now opens the fall menu. Nothing was reprinted.
```

## What you need

- A QRFLOW.codes account on the **Business** plan ($29/month) and an API key from **Account › API keys**. Keys look like `qrf_live_…` and are shown once.
- Keep the key on the server. The API refuses browser origins on purpose; call it from a route handler, server action, edge function or backend.

No key yet? The MCP server at `https://qrflow.codes/mcp` works on every plan from Claude, ChatGPT, Cursor and Claude Code, and the free generator at qrflow.codes makes static codes with no account.

## The one concept that matters

A **static** code has the content inside the picture; it can never change. A **dynamic** code (url, phone, email, sms, location on paid plans) contains a short link, `code.short_url`, that QRFLOW redirects. You print `short_url` once and change the destination as often as you like. Every scan is counted.

`short_url` is `https://qrflow.codes/q/<short_code>` until you connect a domain on the Account page, then `https://go.yourbrand.com/<slug or short_code>`. Set link names (`slug`) *before* printing; changing one changes the link.

## Everything the client does

```ts
const qr = new QRFlow(key, { baseUrl?, fetch?, retries? });

await qr.me();                                   // plan, features, limits, scopes
await qr.catalog();                              // every kind of code and the fields it needs
await qr.listCodes({ limit: 50, q: "menu" });    // newest first
await qr.getCode(id);
await qr.createCode({ type, destination_data, label?, fg_color?, bg_color?, frame_style?, frame_caption?, domain_id? });
await qr.updateCode(id, { destination_data?, label?, paused?, expires_at?, slug?, domain_id?, ... });
await qr.makeDynamic(id);                        // static -> dynamic (re-render afterwards)
await qr.deleteCode(id);                         // permanent; prefer { paused: true } when a print exists
await qr.scans(id, { from?, to?, group: "day" | "device" | "country" | "city" | "browser" | "os" | "referrer" });
await qr.bulkCreate([{ destination, label? }, ...]);   // up to 2,000 dynamic url codes per call
await qr.domains();                              // your link domains and the default
await qr.listWebhooks(); qr.createWebhook({ url, events }); qr.testWebhook(id); qr.deleteWebhook(id);
qr.imageUrl(id, size);                           // the SVG address (needs the Authorization header)
await qr.image(id, size);                        // the print-ready SVG as a string
```

Every error is a `QRFlowError` with `status`, `code` (`invalid_token`, `upgrade_required`, `insufficient_scope`, `not_found`, `conflict`, `rate_limited`, `not_dynamic`, `no_domain`, …) and a human `message`. A 429 is retried automatically after `Retry-After` (twice by default; `retries: 0` to disable).

## Kinds of codes

`type` is the encoding: `url`, `text`, `wifi`, `vcard`, `email`, `phone`, `sms`, `location`. Friendlier kinds are url codes with `destination_data.subtype`:

```ts
await qr.createCode({ type: "url", destination_data: { subtype: "googlereview", placeId: "ChIJ…" }, label: "Receipt footer" });
await qr.createCode({ type: "url", destination_data: { subtype: "instagram", handle: "acme" } });
await qr.createCode({ type: "wifi", destination_data: { ssid: "CafeGuest", password: "latte-2026", encryption: "WPA" } });
```

`await qr.catalog()` lists all of them with their fields.

## Show the image

`code.image_url` needs the Authorization header, so either proxy it or render the link yourself:

```ts
// Next.js route handler: app/api/qr/[id]/image/route.ts
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;                       // check the signed-in user owns this id
  const svg = await qr.image(id, 1024);
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" } });
}
```

```ts
// Or on the client, with any QR library: the code IS the short link
import QRCode from "qrcode";
const dataUrl = await QRCode.toDataURL(code.short_url, { width: 512 });
```

## Webhooks

Create one on Account › Webhooks or with `createWebhook`. Events: `scan` (batched every few minutes), `code.created`, `code.updated`, `code.deleted`, `ping`. Every delivery is `{ id, event, created_at, data }` and signed with `X-QRFLOW-Signature: t=<unix>,v1=<hex>`.

```ts
import { parseWebhook } from "qrflow";

// Next.js App Router
export async function POST(req: Request) {
  const raw = await req.text();                                   // the exact bytes, before JSON.parse
  const evt = await parseWebhook(raw, req.headers.get("x-qrflow-signature") ?? "", process.env.QRFLOW_WEBHOOK_SECRET!);
  // evt.id is stable across retries: dedupe on it
  if (evt.event === "scan") for (const s of evt.data.scans) console.log(s.code_id, s.country, s.device);
  return new Response(null, { status: 204 });                     // answer within 8 seconds
}
```

`verifyWebhook(raw, header, secret)` returns a boolean if you would rather parse yourself. Both use WebCrypto, so they run in Workers and Deno too.

## For AI assistants reading this

If someone asks you to add QR codes to their app: install this package, read the key from `QRFLOW_KEY` on the server, create `type: "url"` codes, save `code.id` and `code.short_url` on their record, display `short_url` (or proxy `image()`), and change destinations with `updateCode`. Never change `slug` or `domain_id` after printing; prefer `paused: true` over `deleteCode` when a print exists. The complete reference in Markdown is at https://qrflow.codes/llms-full.txt and the OpenAPI 3.1 document at https://qrflow.codes/api/v1/openapi.json.

## Links

- Docs: https://qrflow.codes/developers (recipes for Next.js, Express, Workers, Supabase, Python; troubleshooting for every error)
- Python client: https://qrflow.codes/sdk/qrflow.py
- MCP server for Claude, ChatGPT, Cursor, Claude Code: https://qrflow.codes/mcp
- Pricing: https://qrflow.codes/pricing · Support: hello@qrflow.codes

MIT © Native Code LLC
