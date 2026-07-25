/**
 * Notifikasi terpadu: WhatsApp + Telegram
 */
import { createClient } from "@/lib/supabase/client";
import {
  fetchWhatsAppSettings,
  sendWhatsApp,
  type WhatsAppSettings,
} from "@/lib/whatsapp";
import {
  fetchTelegramSettings,
  sendTelegram,
  toTelegramHtml,
  type TelegramSettings,
} from "@/lib/telegram";

export interface NotifyResult {
  whatsapp: { success: boolean; error?: string; link?: string };
  telegram: { success: boolean; error?: string };
}

export async function notifyAll(
  message: string,
  opts?: {
    forceWhatsApp?: boolean;
    forceTelegram?: boolean;
    /** plain text for WA; HTML-ish for TG will be converted */
    telegramHtml?: string;
  }
): Promise<NotifyResult> {
  const supabase = createClient();
  const [wa, tg] = await Promise.all([
    fetchWhatsAppSettings(supabase),
    fetchTelegramSettings(supabase),
  ]);

  const waEnabled = opts?.forceWhatsApp || wa.enabled;
  const tgEnabled = opts?.forceTelegram || tg.enabled;

  const whatsapp = waEnabled
    ? await sendWhatsApp({ ...wa, enabled: true }, message)
    : { success: false, error: "WhatsApp nonaktif" };

  const tgText = opts?.telegramHtml || toTelegramHtml(message);
  const telegram = tgEnabled
    ? await sendTelegram({ ...tg, enabled: true }, tgText)
    : { success: false, error: "Telegram nonaktif" };

  return { whatsapp, telegram };
}

export async function notifyRestock(message: string): Promise<NotifyResult> {
  const supabase = createClient();
  const [wa, tg] = await Promise.all([
    fetchWhatsAppSettings(supabase),
    fetchTelegramSettings(supabase),
  ]);

  const whatsapp =
    wa.enabled && wa.notify_restock
      ? await sendWhatsApp(wa, message)
      : { success: false, error: "WA restock off" };

  const telegram =
    tg.enabled && tg.notify_restock
      ? await sendTelegram(tg, toTelegramHtml(message))
      : { success: false, error: "TG restock off" };

  return { whatsapp, telegram };
}

export async function notifyDebtDue(message: string): Promise<NotifyResult> {
  const supabase = createClient();
  const [wa, tg] = await Promise.all([
    fetchWhatsAppSettings(supabase),
    fetchTelegramSettings(supabase),
  ]);

  const whatsapp =
    wa.enabled && wa.notify_debt_due
      ? await sendWhatsApp(wa, message)
      : { success: false, error: "WA debt off" };

  const telegram =
    tg.enabled && tg.notify_debt_due
      ? await sendTelegram(tg, toTelegramHtml(message))
      : { success: false, error: "TG debt off" };

  return { whatsapp, telegram };
}

export type { WhatsAppSettings, TelegramSettings };
