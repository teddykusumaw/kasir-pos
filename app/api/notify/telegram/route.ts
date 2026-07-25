import { NextRequest, NextResponse } from "next/server";
import { sendTelegram, type TelegramSettings } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { settings, message, chat_id } = body as {
      settings: TelegramSettings;
      message: string;
      chat_id?: string;
    };
    if (!message || !settings) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    const result = await sendTelegram(settings, message, chat_id);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
