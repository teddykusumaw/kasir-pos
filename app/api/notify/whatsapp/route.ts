import { NextRequest, NextResponse } from "next/server";
import { sendWhatsApp, type WhatsAppSettings } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { settings, message, phone } = body as {
      settings: WhatsAppSettings;
      message: string;
      phone?: string;
    };
    if (!message || !settings) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const result = await sendWhatsApp(settings, message, phone);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
