import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { QRFlow, QRFlowError, verifyWebhook, parseWebhook } from "../src/index.ts";

type Call = { url: string; init: RequestInit };
function mockFetch(handler: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const f = (async (input: any, init: RequestInit = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    return handler(call);
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

test("requires a key", () => {
  assert.throws(() => new QRFlow(""), /API key is required/);
});

test("sends the bearer header, JSON body and query", async () => {
  const m = mockFetch(() => json({ code: { id: "c1", short_url: "https://qrflow.codes/q/abc" } }, 201));
  const qr = new QRFlow("qrf_live_test", { fetch: m.fetch });
  const { code } = await qr.createCode({ type: "url", destination_data: { url: "https://acme.com/menu" }, label: "Menu" });
  assert.equal(code.short_url, "https://qrflow.codes/q/abc");
  const c = m.calls[0];
  assert.equal(c.url, "https://qrflow.codes/api/v1/codes");
  assert.equal(c.init.method, "POST");
  assert.equal((c.init.headers as Record<string, string>).authorization, "Bearer qrf_live_test");
  assert.equal(JSON.parse(String(c.init.body)).destination_data.url, "https://acme.com/menu");

  await qr.listCodes({ limit: 5, q: "menu" });
  assert.equal(m.calls[1].url, "https://qrflow.codes/api/v1/codes?limit=5&q=menu");
  await qr.scans("c1", { group: "country" });
  assert.equal(m.calls[2].url, "https://qrflow.codes/api/v1/codes/c1/scans?group=country");
});

test("204 resolves to undefined", async () => {
  const m = mockFetch(() => new Response(null, { status: 204 }));
  const qr = new QRFlow("k", { fetch: m.fetch });
  assert.equal(await qr.deleteCode("c1"), undefined);
  assert.equal(m.calls[0].init.method, "DELETE");
});

test("errors become QRFlowError with the API code", async () => {
  const m = mockFetch(() => json({ error: "upgrade_required", message: "Dynamic codes need QRFLOW.codes Premium." }, 402));
  const qr = new QRFlow("k", { fetch: m.fetch });
  await assert.rejects(qr.makeDynamic("c1"), (e: unknown) => e instanceof QRFlowError && e.status === 402 && e.code === "upgrade_required" && /Premium/.test(e.message));
});

test("429 is retried after Retry-After, then surfaces", async () => {
  let n = 0;
  const m = mockFetch(() => (n++ === 0 ? json({ error: "rate_limited", message: "slow down" }, 429, { "retry-after": "0" }) : json({ codes: [] })));
  const qr = new QRFlow("k", { fetch: m.fetch, retries: 1 });
  const out = await qr.listCodes();
  assert.deepEqual(out, { codes: [] });
  assert.equal(m.calls.length, 2);

  const m2 = mockFetch(() => json({ error: "rate_limited", message: "slow down" }, 429, { "retry-after": "7" }));
  const qr2 = new QRFlow("k", { fetch: m2.fetch, retries: 0 });
  await assert.rejects(qr2.listCodes(), (e: unknown) => e instanceof QRFlowError && e.status === 429 && e.retryAfter === 7);
});

test("custom baseUrl and imageUrl", async () => {
  const qr = new QRFlow("k", { baseUrl: "https://example.test/api/v1/" });
  assert.equal(qr.imageUrl("c1", 512), "https://example.test/api/v1/codes/c1/image.svg?size=512");
});

test("image() returns the SVG text", async () => {
  const m = mockFetch(() => new Response("<svg/>", { status: 200, headers: { "content-type": "image/svg+xml" } }));
  const qr = new QRFlow("k", { fetch: m.fetch });
  assert.equal(await qr.image("c1"), "<svg/>");
  assert.match(m.calls[0].url, /\/codes\/c1\/image\.svg\?size=1024$/);
});

function sign(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

test("verifyWebhook matches the server's HMAC (string and bytes)", async () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "d1", event: "ping", created_at: "2026-09-22T00:00:00Z", data: { webhook_id: "w1", message: "hi" } });
  const header = sign(secret, body);
  assert.equal(await verifyWebhook(body, header, secret), true);
  assert.equal(await verifyWebhook(new TextEncoder().encode(body), header, secret), true);
  assert.equal(await verifyWebhook(body + " ", header, secret), false, "changed body");
  assert.equal(await verifyWebhook(body, header, "other"), false, "wrong secret");
  assert.equal(await verifyWebhook(body, sign(secret, body, Math.floor(Date.now() / 1000) - 600), secret), false, "stale timestamp");
  assert.equal(await verifyWebhook(body, "garbage", secret), false);
});

test("parseWebhook returns the typed event or throws", async () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "d2", event: "code.updated", created_at: "2026-09-22T00:00:00Z", data: { code: { id: "c1" }, changed: ["destination_data"] } });
  const evt = await parseWebhook(body, sign(secret, body), secret);
  assert.equal(evt.event, "code.updated");
  if (evt.event === "code.updated") assert.deepEqual(evt.data.changed, ["destination_data"]);
  await assert.rejects(parseWebhook(body, sign("nope", body), secret), (e: unknown) => e instanceof QRFlowError && e.code === "invalid_signature");
});
