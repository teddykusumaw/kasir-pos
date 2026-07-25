/**
 * Print settings (localStorage)
 */

export type PrintMethod = "serial" | "bluetooth" | "browser";

export interface PrintSettings {
  method: PrintMethod;
  autoPrint: boolean;
  copies: number;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  paperWidth: 32 | 42 | 48;
  baudRate: number;
  autoCut: boolean;
  characterSet: string;
  openDrawer: boolean;
  kitchenEnabled: boolean;
  kitchenAutoPrint: boolean;
  kitchenCategories: string;
  /** Last Bluetooth device name (display only) */
  lastBluetoothName: string;
}

const STORAGE_KEY = "kasir-pos-print-settings";

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  method: "browser",
  autoPrint: false,
  copies: 1,
  storeName: "TOKO ANDA",
  storeAddress: "Jl. Contoh No. 123",
  storePhone: "0812-3456-7890",
  paperWidth: 42,
  baudRate: 9600,
  autoCut: true,
  characterSet: "pc437_usa",
  openDrawer: false,
  kitchenEnabled: false,
  kitchenAutoPrint: true,
  kitchenCategories: "",
  lastBluetoothName: "",
};

export function getPrintSettings(): PrintSettings {
  if (typeof window === "undefined") return DEFAULT_PRINT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRINT_SETTINGS;
    const parsed = JSON.parse(raw);
    if (parsed.method === "qz") parsed.method = "browser";
    const method =
      parsed.method === "serial" || parsed.method === "bluetooth"
        ? parsed.method
        : "browser";
    return { ...DEFAULT_PRINT_SETTINGS, ...parsed, method };
  } catch {
    return DEFAULT_PRINT_SETTINGS;
  }
}

export function savePrintSettings(settings: Partial<PrintSettings>): PrintSettings {
  const current = getPrintSettings();
  const next = { ...current, ...settings };
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function getKitchenCategoryList(settings?: PrintSettings): string[] {
  const s = settings || getPrintSettings();
  return s.kitchenCategories
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}
