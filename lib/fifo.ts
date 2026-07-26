/**
 * FIFO / FEFO inventory:
 * - FEFO: batch dengan expiry_date paling dekat dipakai dulu
 * - Batch tanpa ED / belum expired: urut received_at (FIFO)
 * - Batch sudah lewat ED: tetap bisa dikonsumsi terakhir (atau diisolasi di UI)
 */
import { createClient } from "@/lib/supabase/client";

export interface FifoAllocation {
  batch_id: string;
  qty: number;
  unit_cost: number;
  expiry_date?: string | null;
}

export interface FifoResult {
  allocations: FifoAllocation[];
  totalCost: number;
  avgUnitCost: number;
}

export interface StockBatchRow {
  id: string;
  product_id: string;
  qty_remaining: number;
  qty_initial: number;
  unit_cost: number;
  received_at: string;
  delivery_date: string | null;
  expiry_date: string | null;
  supplier_id: string | null;
  note: string | null;
}

export type BatchMeta = {
  supplier_id?: string | null;
  delivery_date?: string | null;
  expiry_date?: string | null;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Sort FEFO lalu FIFO */
export function sortBatchesForConsume<
  T extends { expiry_date?: string | null; received_at: string }
>(batches: T[]): T[] {
  const today = todayISO();
  return [...batches].sort((a, b) => {
    const ae = a.expiry_date || null;
    const be = b.expiry_date || null;
    // Yang sudah expired diurutan paling akhir
    const aExp = ae && ae < today;
    const bExp = be && be < today;
    if (aExp !== bExp) return aExp ? 1 : -1;
    // Keduanya punya ED: yang lebih dekat dulu
    if (ae && be && ae !== be) return ae < be ? -1 : 1;
    if (ae && !be) return -1;
    if (!ae && be) return 1;
    // FIFO received_at
    return a.received_at < b.received_at ? -1 : 1;
  });
}

export async function planFifoConsume(
  productId: string,
  qty: number,
  opts?: { allowExpired?: boolean }
): Promise<FifoResult> {
  const supabase = createClient();
  const { data: batches, error } = await supabase
    .from("stock_batches")
    .select("id, qty_remaining, unit_cost, received_at, expiry_date")
    .eq("product_id", productId)
    .gt("qty_remaining", 0);

  if (error) throw new Error(error.message);

  const today = todayISO();
  let list = batches || [];
  if (!opts?.allowExpired) {
    // prioritaskan non-expired; expired tetap fallback jika stok kurang
    const fresh = list.filter((b) => !b.expiry_date || b.expiry_date >= today);
    const expired = list.filter((b) => b.expiry_date && b.expiry_date < today);
    list = [...sortBatchesForConsume(fresh), ...sortBatchesForConsume(expired)];
  } else {
    list = sortBatchesForConsume(list);
  }

  let need = qty;
  const allocations: FifoAllocation[] = [];
  let totalCost = 0;

  for (const b of list) {
    if (need <= 0) break;
    const take = Math.min(Number(b.qty_remaining), need);
    allocations.push({
      batch_id: b.id,
      qty: take,
      unit_cost: Number(b.unit_cost),
      expiry_date: b.expiry_date,
    });
    totalCost += take * Number(b.unit_cost);
    need -= take;
  }

  if (need > 0) {
    const { data: prod } = await supabase
      .from("products")
      .select("cost")
      .eq("id", productId)
      .single();
    const unit = Number(prod?.cost || 0);
    allocations.push({ batch_id: "", qty: need, unit_cost: unit });
    totalCost += need * unit;
  }

  const avgUnitCost = qty > 0 ? totalCost / qty : 0;
  return { allocations, totalCost, avgUnitCost };
}

export async function applyFifoConsume(allocations: FifoAllocation[]) {
  const supabase = createClient();
  for (const a of allocations) {
    if (!a.batch_id) continue;
    const { data: b } = await supabase
      .from("stock_batches")
      .select("qty_remaining")
      .eq("id", a.batch_id)
      .single();
    if (!b) continue;
    const next = Math.max(0, Number(b.qty_remaining) - a.qty);
    await supabase
      .from("stock_batches")
      .update({ qty_remaining: next })
      .eq("id", a.batch_id);
  }
}

export async function addStockBatch(
  productId: string,
  qty: number,
  unitCost: number,
  note?: string,
  meta?: BatchMeta
) {
  if (qty <= 0) return;
  const supabase = createClient();
  await supabase.from("stock_batches").insert({
    product_id: productId,
    qty_remaining: qty,
    qty_initial: qty,
    unit_cost: unitCost,
    received_at: new Date().toISOString(),
    note: note || "Restock",
    supplier_id: meta?.supplier_id || null,
    delivery_date: meta?.delivery_date || todayISO(),
    expiry_date: meta?.expiry_date || null,
  });
}

export async function listProductBatches(productId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stock_batches")
    .select(
      "id, product_id, qty_remaining, qty_initial, unit_cost, received_at, delivery_date, expiry_date, supplier_id, note, suppliers(name)"
    )
    .eq("product_id", productId)
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("received_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function updateBatchExpiry(
  batchId: string,
  expiryDate: string | null
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("stock_batches")
    .update({ expiry_date: expiryDate })
    .eq("id", batchId);
  if (error) throw new Error(error.message);
}

export async function adjustBatchQty(
  batchId: string,
  qtyRemaining: number,
  note?: string
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("stock_batches")
    .update({
      qty_remaining: Math.max(0, qtyRemaining),
      note: note || undefined,
    })
    .eq("id", batchId);
  if (error) throw new Error(error.message);
}

/** Batch yang ED-nya dalam N hari / sudah lewat */
export async function listExpiringBatches(withinDays = 30) {
  const supabase = createClient();
  const today = new Date();
  const until = new Date();
  until.setDate(until.getDate() + withinDays);
  const from = today.toISOString().slice(0, 10);
  const to = until.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("stock_batches")
    .select(
      "id, product_id, qty_remaining, expiry_date, unit_cost, products(name, unit), suppliers(name)"
    )
    .gt("qty_remaining", 0)
    .not("expiry_date", "is", null)
    .lte("expiry_date", to)
    .order("expiry_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((b: any) => ({
    ...b,
    is_expired: b.expiry_date < from,
    days_left: Math.ceil(
      (new Date(b.expiry_date).getTime() - today.getTime()) / 86400000
    ),
  }));
}
