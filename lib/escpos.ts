/**
 * Minimal ESC/POS command builder (tanpa react-thermal-printer)
 * Kompatibel printer Epson/Xprinter/dll.
 */

export type PaperWidth = 32 | 42 | 48;

const ESC = 0x1b;
const GS = 0x1d;

function encoder(): TextEncoder {
  // Prefer latin1-ish for thermal; fallback
  try {
    return new TextEncoder("latin1");
  } catch {
    return new TextEncoder("utf-8");
  }
}

function enc(text: string): Uint8Array {
  return encoder().encode(text);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function line(text: string, width: number): string {
  if (text.length <= width) return text + "\n";
  return text.slice(0, width) + "\n";
}

function row(left: string, right: string, width: number): string {
  const space = width - left.length - right.length;
  if (space < 1) {
    return line(left, width) + line(right.padStart(width), width);
  }
  return left + " ".repeat(space) + right + "\n";
}

function init(): Uint8Array {
  return new Uint8Array([ESC, 0x40]); // ESC @
}

function align(n: 0 | 1 | 2): Uint8Array {
  return new Uint8Array([ESC, 0x61, n]); // 0 left, 1 center, 2 right
}

function bold(on: boolean): Uint8Array {
  return new Uint8Array([ESC, 0x45, on ? 1 : 0]);
}

function doubleSize(on: boolean): Uint8Array {
  // GS ! n — bit 0x11 = double width+height
  return new Uint8Array([GS, 0x21, on ? 0x11 : 0x00]);
}

function cut(): Uint8Array {
  // GS V 0 — full cut
  return new Uint8Array([GS, 0x56, 0x00]);
}

function cashDrawer(): Uint8Array {
  // ESC p m t1 t2 — pin 2
  return new Uint8Array([ESC, 0x70, 0x00, 0x19, 0x19]);
}

function feed(n: number): Uint8Array {
  return new Uint8Array([ESC, 0x64, n]);
}

export interface EscPosReceiptItem {
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  category?: string | null;
}

export interface EscPosReceiptData {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  id: string;
  created_at: string;
  cashier_name?: string;
  items: EscPosReceiptItem[];
  total: number;
  subtotal?: number;
  tax_rate?: number;
  tax_amount?: number;
  tax_name?: string;
  payment_method: string;
  cash_received?: number | null;
  change_amount?: number | null;
  paperWidth?: PaperWidth;
  autoCut?: boolean;
  openDrawer?: boolean;
}

function formatIdr(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDateId(d: string): string {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(d));
  } catch {
    return d;
  }
}

export function buildEscPosReceipt(data: EscPosReceiptData): Uint8Array {
  const w = data.paperWidth || 42;
  const parts: Uint8Array[] = [init()];

  parts.push(align(1), bold(true), doubleSize(true));
  parts.push(enc(line(data.storeName, Math.floor(w / 2))));
  parts.push(doubleSize(false), bold(false));
  if (data.storeAddress) parts.push(enc(line(data.storeAddress, w)));
  if (data.storePhone) parts.push(enc(line(data.storePhone, w)));
  parts.push(enc("\n"), align(0));
  parts.push(enc("-".repeat(w) + "\n"));
  parts.push(enc(row("No", data.id.slice(0, 8).toUpperCase(), w)));
  parts.push(enc(row("Tanggal", formatDateId(data.created_at), w)));
  parts.push(enc(row("Kasir", data.cashier_name || "-", w)));
  parts.push(enc("-".repeat(w) + "\n"));

  for (const item of data.items) {
    parts.push(enc(line(item.name, w)));
    parts.push(
      enc(
        row(
          `${item.quantity} x ${formatIdr(item.price)}`,
          formatIdr(item.subtotal),
          w
        )
      )
    );
  }

  parts.push(enc("-".repeat(w) + "\n"));
  if ((data.tax_amount || 0) > 0) {
    parts.push(enc(row("Subtotal", formatIdr(data.subtotal ?? data.total), w)));
    parts.push(
      enc(
        row(
          `${data.tax_name || "PPN"} (${data.tax_rate || 0}%)`,
          formatIdr(data.tax_amount || 0),
          w
        )
      )
    );
  }
  parts.push(bold(true));
  parts.push(enc(row("TOTAL", formatIdr(data.total), w)));
  parts.push(bold(false));
  parts.push(
    enc(
      row(
        `Bayar (${data.payment_method})`,
        data.payment_method === "cash" && data.cash_received != null
          ? formatIdr(data.cash_received)
          : formatIdr(data.total),
        w
      )
    )
  );
  if (data.payment_method === "cash" && data.change_amount != null) {
    parts.push(enc(row("Kembalian", formatIdr(data.change_amount), w)));
  }
  parts.push(enc("-".repeat(w) + "\n"));
  parts.push(align(1));
  parts.push(enc(line("Terima kasih atas kunjungan Anda", w)));
  parts.push(enc(line("Barang yang sudah dibeli", w)));
  parts.push(enc(line("tidak dapat dikembalikan", w)));
  parts.push(align(0), feed(3));

  if (data.openDrawer) parts.push(cashDrawer());
  if (data.autoCut !== false) parts.push(cut());
  else parts.push(feed(2));

  return concat(...parts);
}

export function buildEscPosKitchen(
  data: {
    id: string;
    created_at: string;
    cashier_name?: string;
    items: EscPosReceiptItem[];
    paperWidth?: PaperWidth;
    autoCut?: boolean;
  }
): Uint8Array {
  const w = data.paperWidth || 42;
  const parts: Uint8Array[] = [init()];

  parts.push(align(1), bold(true), doubleSize(true));
  parts.push(enc(line("DAPUR / KITCHEN", Math.floor(w / 2))));
  parts.push(doubleSize(false), bold(false), enc("\n"), align(0));
  parts.push(enc("-".repeat(w) + "\n"));
  parts.push(enc(row("Order", data.id.slice(0, 8).toUpperCase(), w)));
  parts.push(enc(row("Waktu", formatDateId(data.created_at), w)));
  parts.push(enc(row("Kasir", data.cashier_name || "-", w)));
  parts.push(enc("-".repeat(w) + "\n"));

  for (const item of data.items) {
    parts.push(bold(true), doubleSize(true));
    parts.push(enc(line(`${item.quantity}x  ${item.name}`, Math.floor(w / 2))));
    parts.push(doubleSize(false), bold(false));
    if (item.category) parts.push(enc(line(`  [${item.category}]`, w)));
    parts.push(enc("\n"));
  }

  parts.push(enc("-".repeat(w) + "\n"));
  parts.push(align(1), enc(line("--- SELESAI ---", w)), align(0), feed(3));
  if (data.autoCut !== false) parts.push(cut());

  return concat(...parts);
}
