// Cloudflare Worker: POST { url, label } → a dynamic QR code.
// wrangler secret put QRFLOW_KEY
import { QRFlow } from "qrflow";

export default {
  async fetch(req: Request, env: { QRFLOW_KEY: string }) {
    if (req.method !== "POST") return new Response("POST { url, label }", { status: 405 });
    const { url, label } = await req.json<{ url: string; label?: string }>();
    const qr = new QRFlow(env.QRFLOW_KEY);
    const { code } = await qr.createCode({ type: "url", destination_data: { url }, label });
    return Response.json({ id: code.id, short_url: code.short_url });
  },
};
