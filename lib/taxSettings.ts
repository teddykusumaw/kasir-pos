/**
 * Pengaturan PPN / pajak
 * Disimpan di Supabase app_settings (key = 'tax')
 * Cache singkat di memory + fallback default
 */

import { createClient } from "@/lib/supabase/client";

export type TaxMode = "exclusive" | "inclusive" | "disabled";

export interface TaxSettings {
  /** Aktifkan PPN */
  enabled: boolean;
  /** Persentase, contoh 11 atau 12 */
  rate: number;
  /** Label di struk, default "PPN" */
  name: string;
  /**
   * exclusive = harga item belum termasuk PPN (PPN ditambah)
   * inclusive = harga item sudah termasuk PPN (PPN dipecah)
   * disabled  = tidak hitung PPN
   */
  mode: TaxMode;
}

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  enabled: true,
  rate: 11,
  name: "PPN",
  mode: "exclusive",
};

export interface TaxBreakdown {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  taxName: string;
  mode: TaxMode;
}

/** Hitung PPN dari total harga item (sum price * qty) */
export function calculateTax(
  itemsTotal: number,
  settings: TaxSettings
): TaxBreakdown {
  const taxName = settings.name || "PPN";
  const rate = Math.max(0, Number(settings.rate) || 0);

  if (!settings.enabled || settings.mode === "disabled" || rate <= 0) {
    return {
      subtotal: itemsTotal,
      taxRate: 0,
      taxAmount: 0,
      total: itemsTotal,
      taxName,
      mode: "disabled",
    };
  }

  if (settings.mode === "inclusive") {
    // Harga sudah termasuk PPN
    const total = itemsTotal;
    const taxAmount = Math.round((total * rate) / (100 + rate));
    const subtotal = total - taxAmount;
    return {
      subtotal,
      taxRate: rate,
      taxAmount,
      total,
      taxName,
      mode: "inclusive",
    };
  }

  // exclusive — PPN ditambahkan
  const subtotal = itemsTotal;
  const taxAmount = Math.round((subtotal * rate) / 100);
  const total = subtotal + taxAmount;
  return {
    subtotal,
    taxRate: rate,
    taxAmount,
    total,
    taxName,
    mode: "exclusive",
  };
}

let cached: TaxSettings | null = null;
let cacheAt = 0;
const CACHE_MS = 30_000;

export async function fetchTaxSettings(): Promise<TaxSettings> {
  if (cached && Date.now() - cacheAt < CACHE_MS) return cached;

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "tax")
      .maybeSingle();

    if (error || !data?.value) {
      cached = DEFAULT_TAX_SETTINGS;
      cacheAt = Date.now();
      return cached;
    }

    const v = data.value as Partial<TaxSettings>;
    cached = {
      enabled: v.enabled !== false,
      rate: typeof v.rate === "number" ? v.rate : DEFAULT_TAX_SETTINGS.rate,
      name: typeof v.name === "string" && v.name ? v.name : "PPN",
      mode:
        v.mode === "inclusive" || v.mode === "disabled" || v.mode === "exclusive"
          ? v.mode
          : "exclusive",
    };
    cacheAt = Date.now();
    return cached;
  } catch {
    return DEFAULT_TAX_SETTINGS;
  }
}

export function clearTaxSettingsCache() {
  cached = null;
  cacheAt = 0;
}

export async function saveTaxSettings(
  settings: TaxSettings,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient();
    const { error } = await supabase.from("app_settings").upsert(
      {
        key: "tax",
        value: settings,
        updated_at: new Date().toISOString(),
        updated_by: userId || null,
      },
      { onConflict: "key" }
    );
    if (error) return { success: false, error: error.message };
    cached = settings;
    cacheAt = Date.now();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "Gagal simpan" };
  }
}
