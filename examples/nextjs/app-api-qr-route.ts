// app/api/qr/route.ts — create a dynamic QR code from a Next.js App Router route.
// npm install qrflow · QRFLOW_KEY in .env.local (never NEXT_PUBLIC_)
import { NextResponse } from "next/server";
import { QRFlow, QRFlowError } from "qrflow";

const qr = new QRFlow(process.env.QRFLOW_KEY!);

export async function POST(req: Request) {
  const { url, label } = await req.json();
  try {
    const { code } = await qr.createCode({ type: "url", destination_data: { url }, label });
    // Save code.id and code.short_url on your own record. short_url is what gets printed.
    return NextResponse.json({ id: code.id, short_url: code.short_url });
  } catch (e) {
    if (e instanceof QRFlowError) return NextResponse.json({ error: e.code, message: e.message }, { status: e.status });
    throw e;
  }
}
