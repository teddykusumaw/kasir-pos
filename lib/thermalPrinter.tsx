/**
 * ESC/POS generate + print via Web Serial / Web Bluetooth / Browser
 * Menggunakan builder murni (lib/escpos.ts) — tidak pakai react-thermal-printer
 * agar tidak error parse TypeScript di node_modules.
 */

import { getPrintSettings } from "./printSettings";
import {
  buildEscPosReceipt,
  buildEscPosKitchen,
  type EscPosReceiptItem,
} from "./escpos";
import { isWebSerialSupported, printSerial } from "./webSerialPrinter";
import {
  isWebBluetoothSupported,
  printBluetooth,
  isBluetoothConnected,
  connectBluetoothPrinter,
} from "./webBluetoothPrinter";

export interface ThermalSaleItem {
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  category?: string | null;
}

export interface ThermalSale {
  id: string;
  total: number;
  subtotal?: number;
  tax_rate?: number;
  tax_amount?: number;
  tax_name?: string;
  payment_method: string;
  cash_received?: number | null;
  change_amount?: number | null;
  created_at: string;
  cashier_name?: string;
  items: ThermalSaleItem[];
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
}

function toItems(items: ThermalSaleItem[]): EscPosReceiptItem[] {
  return items.map((i) => ({
    name: i.name,
    quantity: i.quantity,
    price: i.price,
    subtotal: i.subtotal,
    category: i.category,
  }));
}

export async function buildThermalReceipt(sale: ThermalSale): Promise<Uint8Array> {
  const settings = getPrintSettings();
  return buildEscPosReceipt({
    storeName: sale.storeName || settings.storeName || "TOKO ANDA",
    storeAddress: sale.storeAddress || settings.storeAddress,
    storePhone: sale.storePhone || settings.storePhone,
    id: sale.id,
    created_at: sale.created_at,
    cashier_name: sale.cashier_name,
    items: toItems(sale.items),
    total: sale.total,
    subtotal: sale.subtotal,
    tax_rate: sale.tax_rate,
    tax_amount: sale.tax_amount,
    tax_name: sale.tax_name,
    payment_method: sale.payment_method,
    cash_received: sale.cash_received,
    change_amount: sale.change_amount,
    paperWidth: settings.paperWidth,
    autoCut: settings.autoCut,
    openDrawer: settings.openDrawer,
  });
}

export async function buildKitchenTicket(
  sale: ThermalSale,
  items: ThermalSaleItem[]
): Promise<Uint8Array> {
  const settings = getPrintSettings();
  return buildEscPosKitchen({
    id: sale.id,
    created_at: sale.created_at,
    cashier_name: sale.cashier_name,
    items: toItems(items),
    paperWidth: settings.paperWidth,
    autoCut: settings.autoCut,
  });
}

export { isWebSerialSupported, isWebBluetoothSupported };

export async function printThermalReceipt(
  sale: ThermalSale,
  mode: "auto" | "serial" | "bluetooth" | "browser" = "auto"
): Promise<{ success: boolean; method: string; error?: string }> {
  const settings = getPrintSettings();
  sale.storeName = sale.storeName || settings.storeName;
  sale.storeAddress = sale.storeAddress || settings.storeAddress;
  sale.storePhone = sale.storePhone || settings.storePhone;

  const target = mode === "auto" ? settings.method : mode;

  try {
    if (target === "browser") {
      return { success: true, method: "browser" };
    }

    const data = await buildThermalReceipt(sale);
    const copies = Math.max(1, settings.copies || 1);

    if (target === "bluetooth") {
      if (!isWebBluetoothSupported()) {
        return {
          success: false,
          method: "bluetooth",
          error: "Web Bluetooth tidak didukung. Gunakan Chrome/Edge (HTTPS).",
        };
      }
      for (let i = 0; i < copies; i++) {
        await printBluetooth(data);
      }
      return { success: true, method: "bluetooth" };
    }

    if (!isWebSerialSupported()) {
      return {
        success: false,
        method: "serial",
        error: "Web Serial tidak didukung. Gunakan Chrome/Edge.",
      };
    }
    for (let i = 0; i < copies; i++) {
      await printSerial(data, settings.baudRate || 9600);
    }
    return { success: true, method: "serial" };
  } catch (err: any) {
    if (err?.name === "NotFoundError") {
      return {
        success: false,
        method: target,
        error: "Pemilihan perangkat dibatalkan",
      };
    }
    return {
      success: false,
      method: target,
      error: err?.message || "Gagal mencetak",
    };
  }
}

export async function printKitchenSerial(
  sale: ThermalSale,
  items: ThermalSaleItem[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!items.length) return { success: true };
    const settings = getPrintSettings();
    const data = await buildKitchenTicket(sale, items);

    if (settings.method === "bluetooth" && isWebBluetoothSupported()) {
      await printBluetooth(data);
      return { success: true };
    }
    if (isWebSerialSupported()) {
      await printSerial(data, settings.baudRate || 9600);
      return { success: true };
    }
    return {
      success: false,
      error: "Tidak ada metode serial/bluetooth tersedia",
    };
  } catch (err: any) {
    if (err?.name === "NotFoundError") {
      return { success: false, error: "Pemilihan perangkat dibatalkan" };
    }
    return { success: false, error: err?.message || "Gagal cetak dapur" };
  }
}

export { connectBluetoothPrinter, isBluetoothConnected };
