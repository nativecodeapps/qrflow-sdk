// app/api/qrflow/route.ts — receive and verify QRFLOW webhooks.
// Create the webhook on Account › Webhooks; put the whsec_… secret in QRFLOW_WEBHOOK_SECRET.
import { parseWebhook, QRFlowError } from "qrflow";

export async function POST(req: Request) {
  const raw = await req.text(); // the exact bytes; verify before JSON.parse
  let evt;
  try {
    evt = await parseWebhook(raw, req.headers.get("x-qrflow-signature") ?? "", process.env.QRFLOW_WEBHOOK_SECRET!);
  } catch (e) {
    if (e instanceof QRFlowError) return new Response("bad signature", { status: 401 });
    throw e;
  }
  // evt.id is stable across retries: store it and skip duplicates.
  switch (evt.event) {
    case "scan":
      for (const s of evt.data.scans) console.log("scan", s.code_id, s.country, s.device, s.scanned_at);
      break;
    case "code.created":
    case "code.updated":
    case "code.deleted":
      console.log(evt.event, evt.data);
      break;
    case "ping":
      break;
  }
  return new Response(null, { status: 204 }); // answer within 8 seconds; do slow work after
}
