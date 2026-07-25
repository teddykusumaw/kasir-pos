import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegram, type TelegramSettings } from "@/lib/telegram";

/**
 * Webhook Telegram
 * Set URL: https://YOUR_DOMAIN/api/telegram/webhook?secret=YOUR_SECRET
 *
 * Commands:
 * /start — daftar & simpan chat_id
 * /help — bantuan
 * /status — status bot
 * /id — tampilkan chat id
 */

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

async function getTelegramSettings(): Promise<TelegramSettings | null> {
  try {
    const supabase = adminClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "telegram")
      .maybeSingle();
    if (!data?.value) return null;
    return data.value as TelegramSettings;
  } catch {
    return null;
  }
}

async function reply(settings: TelegramSettings, chatId: string, text: string) {
  return sendTelegram({ ...settings, enabled: true, chat_id: chatId }, text);
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get("secret");
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expected && secret !== expected) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const update = await req.json();
    const message = update?.message || update?.edited_message;
    if (!message?.chat?.id) {
      return NextResponse.json({ ok: true });
    }

    const chatId = String(message.chat.id);
    const text = String(message.text || "").trim();
    const from = message.from?.username || message.from?.first_name || "user";

    const settings = await getTelegramSettings();
    if (!settings?.bot_token) {
      return NextResponse.json({ ok: true, skipped: "no bot token" });
    }

    const cmd = text.split(/\s+/)[0].toLowerCase();

    if (cmd === "/start") {
      // Simpan chat_id terakhir ke settings (opsional overwrite)
      try {
        const supabase = adminClient();
        const next = {
          ...settings,
          chat_id: settings.chat_id || chatId,
          enabled: true,
        };
        await supabase.from("app_settings").upsert(
          {
            key: "telegram",
            value: next,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );
      } catch {
        // ignore
      }
      await reply(
        settings,
        chatId,
        `✅ <b>Kasir POS Bot</b>\nHalo, ${from}!\nChat ID kamu: <code>${chatId}</code>\n\nPerintah:\n/help — bantuan\n/status — status\n/id — chat id`
      );
    } else if (cmd === "/help") {
      await reply(
        settings,
        chatId,
        `<b>Perintah bot</b>\n/start — aktifkan\n/status — status notifikasi\n/id — lihat chat id\n/help — bantuan\n\nAlert restock & jatuh tempo dikirim otomatis dari aplikasi.`
      );
    } else if (cmd === "/id") {
      await reply(settings, chatId, `Chat ID: <code>${chatId}</code>`);
    } else if (cmd === "/status") {
      await reply(
        settings,
        chatId,
        `<b>Status</b>\nEnabled: ${settings.enabled ? "ya" : "tidak"}\nRestock: ${settings.notify_restock ? "on" : "off"}\nDebt due: ${settings.notify_debt_due ? "on" : "off"}\nChat tersimpan: <code>${settings.chat_id || "-"}</code>`
      );
    } else if (text.startsWith("/")) {
      await reply(settings, chatId, "Perintah tidak dikenal. Ketik /help");
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("telegram webhook", e);
    return NextResponse.json({ ok: true }); // always 200 to Telegram
  }
}

/** GET: info + setWebhook helper */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected && secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getTelegramSettings();
  if (!settings?.bot_token) {
    return NextResponse.json({
      ok: false,
      error: "Bot token belum dikonfigurasi di app_settings",
    });
  }

  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const webhookUrl = `${base.replace(/\/$/, "")}/api/telegram/webhook${
    expected ? `?secret=${expected}` : ""
  }`;

  const action = req.nextUrl.searchParams.get("action");
  if (action === "set") {
    const res = await fetch(
      `https://api.telegram.org/bot${settings.bot_token}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ["message"],
          drop_pending_updates: true,
        }),
      }
    );
    const data = await res.json();
    return NextResponse.json({ webhookUrl, setWebhook: data });
  }

  if (action === "info") {
    const res = await fetch(
      `https://api.telegram.org/bot${settings.bot_token}/getWebhookInfo`
    );
    const data = await res.json();
    return NextResponse.json({ webhookUrl, info: data });
  }

  if (action === "delete") {
    const res = await fetch(
      `https://api.telegram.org/bot${settings.bot_token}/deleteWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drop_pending_updates: true }),
      }
    );
    const data = await res.json();
    return NextResponse.json({ deleted: data });
  }

  return NextResponse.json({
    ok: true,
    webhookUrl,
    actions: {
      set: `${webhookUrl}${webhookUrl.includes("?") ? "&" : "?"}action=set`,
      info: `...&action=info`,
      delete: `...&action=delete`,
    },
  });
}
