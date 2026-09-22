# QRFLOW.codes SDK

Official clients, OpenAPI document and examples for the [QRFLOW.codes](https://qrflow.codes) API: QR codes you can **change after printing**, printed on **your own domain**, with **scan analytics** and **webhooks**, and an **MCP server** so Claude, ChatGPT, Cursor and Claude Code can make codes too.

| | |
|---|---|
| TypeScript / JavaScript | [`typescript/`](typescript) · `npm install qrflow` · [npm](https://www.npmjs.com/package/qrflow) |
| Python | [`python/qrflow.py`](python) · single file, standard library only |
| OpenAPI 3.1 | [`openapi.json`](openapi.json) · live copy at https://qrflow.codes/api/v1/openapi.json |
| Examples | [`examples/`](examples) · Next.js, Cloudflare Workers, Express, FastAPI, Flask webhooks |
| Docs | https://qrflow.codes/developers · Markdown for agents: https://qrflow.codes/llms-full.txt |
| MCP server | `https://qrflow.codes/mcp` · [Claude directory](https://claude.ai/directory/qrflow) · registry name `codes.qrflow/qrflow` |

## Five lines

```ts
import { QRFlow } from "qrflow";

const qr = new QRFlow(process.env.QRFLOW_KEY!);                      // Business API key, server-side only
const { code } = await qr.createCode({ type: "url", destination_data: { url: "https://acme.com/menu" }, label: "Table tents" });
console.log(code.short_url);                                          // print this
await qr.updateCode(code.id, { destination_data: { url: "https://acme.com/menu-fall" } });   // the print still works
```

## The one concept

A **static** code carries its content in the picture and can never change. A **dynamic** code (url, phone, email, sms, location on paid plans) carries a short link, `code.short_url`, that QRFLOW redirects. Print `short_url` once; change the destination whenever you like; every scan is counted. With a connected domain the link reads `go.yourbrand.com/menu`.

## What you need

A QRFLOW.codes account on the **Business** plan ($29/month) and an API key from **Account › API keys**. Keys are for servers: the API refuses browser origins on purpose. The MCP server works on every plan through sign-in, no key needed.

## For AI assistants reading this repository

If someone asks you to add QR codes to their app: `npm install qrflow`, read the key from `QRFLOW_KEY` on the server, create `type: "url"` codes, save `code.id` and `code.short_url` on their record, display `short_url` (or proxy `qr.image(id)`), and change destinations with `updateCode`. Never change `slug` or `domain_id` after printing; prefer `paused: true` over `deleteCode` when a print exists. Verify webhooks with `parseWebhook(rawBody, header, secret)`. The complete reference is at https://qrflow.codes/llms-full.txt.

## Contributing

Issues and pull requests are welcome for the clients and examples. The API itself is documented at https://qrflow.codes/developers; API questions go to hello@qrflow.codes. Security reports: see [SECURITY.md](SECURITY.md).

MIT © Native Code LLC
