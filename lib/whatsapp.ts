/**
 * WhatsApp integrations:
 * - meta: WhatsApp Business Cloud API (official)
 * - fonnte: gateway pihak ketiga
 * - webhook: custom endpoint
 * - link: wa.me manual
 */

export interface WhatsAppSettings {
  enabled: boolean;
  phone: string;
  provider: "meta" | "fonnte" | "webhook" | "link";
  api_token: string;
  webhook_url?: string;
  /** Meta Cloud API */
  meta_phone_number_id?: string;
  meta_api_version?: string;
  notify_restock: boolean;
  notify_debt_due: boolean;
}

export const DEFAULT_WA: WhatsAppSettings = {
  enabled: false,
  phone: "",
  provider: "meta",
  api_token: "",
  webhook_url: "",
  meta_phone_number_id: "",
  meta_api_version: "v21.0",
  notify_restock: true,
  notify_debt_due: true,
};

export function normalizePhone(phone: string): string {
  let p = phone.replace(/\D/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  if (!p.startsWith("62") && p.length >= 9) p = "62" + p;
  return p;
}

export function waMeLink(phone: string, text: string) {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
}

async function sendMetaCloud(
  settings: WhatsAppSettings,
  message: string,
  targetPhone: string
): Promise<{ success: boolean; error?: string; link?: string }> {
  const token = settings.api_token;
  const phoneId = settings.meta_phone_number_id;
  const ver = settings.meta_api_version || "v21.0";
  if (!token || !phoneId) {
    return {
      success: false,
      error: "Isi Permanent Token + Phone Number ID (Meta)",
      link: waMeLink(targetPhone, message),
    };
  }
  const url = `https://graph.facebook.com/${ver}/${phoneId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: targetPhone,
        type: "text",
        text: { preview_url: false, body: message },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg =
        data?.error?.message ||
        data?.error?.error_user_msg ||
        `Meta API HTTP ${res.status}`;
      return {
        success: false,
        error: errMsg,
        link: waMeLink(targetPhone, message),
      };
    }
    return { success: true };
  } catch (e: any) {
    return {
      success: false,
      error: e?.message || "Gagal Meta Cloud API",
      link: waMeLink(targetPhone, message),
    };
  }
}

export async function sendWhatsApp(
  settings: WhatsAppSettings,
  message: string,
  targetPhone?: string
): Promise<{ success: boolean; error?: string; link?: string }> {
  if (!settings.enabled) {
    return { success: false, error: "Notifikasi WhatsApp nonaktif" };
  }
  const phone = normalizePhone(targetPhone || settings.phone);
  if (!phone) return { success: false, error: "Nomor WhatsApp belum diisi" };

  if (settings.provider === "link") {
    return { success: true, link: waMeLink(phone, message) };
  }

  if (settings.provider === "meta") {
    return sendMetaCloud(settings, message, phone);
  }

  if (settings.provider === "webhook") {
    const url = settings.webhook_url || settings.api_token;
    if (!url) return { success: false, error: "Webhook URL kosong" };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, message }),
      });
      if (!res.ok) return { success: false, error: `Webhook HTTP ${res.status}` };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || "Webhook gagal" };
    }
  }

  // Fonnte
  if (!settings.api_token) {
    return {
      success: false,
      error: "API token Fonnte kosong",
      link: waMeLink(phone, message),
    };
  }
  try {
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: settings.api_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target: phone, message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status === false) {
      return {
        success: false,
        error: data.reason || `Fonnte HTTP ${res.status}`,
        link: waMeLink(phone, message),
      };
    }
    return { success: true };
  } catch (e: any) {
    return {
      success: false,
      error: e?.message || "Gagal kirim Fonnte",
      link: waMeLink(phone, message),
    };
  }
}

export async function fetchWhatsAppSettings(supabase: any): Promise<WhatsAppSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "whatsapp")
    .maybeSingle();
  return { ...DEFAULT_WA, ...(data?.value || {}) };
}
