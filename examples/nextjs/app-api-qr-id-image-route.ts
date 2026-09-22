// app/api/qr/[id]/image/route.ts — serve the print-ready SVG without exposing the key.
// Check that the signed-in user owns `id` before serving it.
import { QRFlow } from "qrflow";

const qr = new QRFlow(process.env.QRFLOW_KEY!);

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const svg = await qr.image(id, 1024);
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=3600" } });
}
