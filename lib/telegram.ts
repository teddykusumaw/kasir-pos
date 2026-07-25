/**
 * Integrasi Telegram Bot API
 * https://api.telegram.org/bot{token}/sendMessage
 */

export interface TelegramSettings {
  enabled: boolean;
  bot_token: string;
  /** Chat ID user/group/channel (bisa negatif untuk group) */
  chat_id: string;
  notify_restock: boolean;
  notify_debt_due: boolean;
  notify_daily_summary: boolean;
}

export const DEFAULT_TELEGRAM: TelegramSettings = {
  enabled: false,
  bot_token: "",
  chat_id: "",
  notify_restock: true,
  notify_debt_due: true,
  notify_daily_summary: false,
};

export async function fetchTelegramSettings(
  supabase: any
): Promise<TelegramSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "telegram")
    .maybeSingle();
  return { ...DEFAULT_TELEGRAM, ...(data?.value || {}) };
}

export async function saveTelegramSettings(
  supabase: any,
  settings: TelegramSettings,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: "telegram",
      value: settings,
      updated_at: new Date().toISOString(),
      updated_by: userId || null,
    },
    { onConflict: "key" }
  );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Kirim pesan teks ke Telegram
 * parse_mode: HTML agar formatting aman
 */
export async function sendTelegram(
  settings: TelegramSettings,
  message: string,
  chatIdOverride?: string
): Promise<{ success: boolean; error?: string }> {
  if (!settings.enabled) {
    return { success: false, error: "Notifikasi Telegram nonaktif" };
  }
  const token = settings.bot_token?.trim();
  const chatId = (chatIdOverride || settings.chat_id || "").trim();
  if (!token) return { success: false, error: "Bot token belum diisi" };
  if (!chatId) return { success: false, error: "Chat ID belum diisi" };

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return {
        success: false,
        error: data?.description || `Telegram HTTP ${res.status}`,
      };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "Gagal kirim Telegram" };
  }
}

/** Konversi pesan markdown-ish restock ke HTML Telegram */
export function toTelegramHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*([^*]+)\*/g, "<b>$1</b>")
    .replace(/_([^_]+)_/g, "<i>$1</i>");
}

export async function testTelegramConnection(
  settings: TelegramSettings
): Promise<{ success: boolean; error?: string; botName?: string }> {
  const token = settings.bot_token?.trim();
  if (!token) return { success: false, error: "Bot token kosong" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    if (!data.ok) {
      return { success: false, error: data.description || "Token tidak valid" };
    }
    return { success: true, botName: data.result?.username };
  } catch (e: any) {
    return { success: false, error: e?.message || "Gagal koneksi" };
  }
}
