/**
 * FIFO inventory: kurangi batch tertua dulu, hitung HPP
 */
import { createClient } from "@/lib/supabase/client";

export interface FifoAllocation {
  batch_id: string;
  qty: number;
  unit_cost: number;
}

export interface FifoResult {
  allocations: FifoAllocation[];
  totalCost: number;
  /** unit cost rata-rata tertimbang untuk baris sale_item */
  avgUnitCost: number;
}

/**
 * Alokasi qty dari batch FIFO (read-only plan).
 * Caller harus apply update batch + stock.
 */
export async function planFifoConsume(
  productId: string,
  qty: number
): Promise<FifoResult> {
  const supabase = createClient();
  const { data: batches, error } = await supabase
    .from("stock_batches")
    .select("id, qty_remaining, unit_cost, received_at")
    .eq("product_id", productId)
    .gt("qty_remaining", 0)
    .order("received_at", { ascending: true });

  if (error) throw new Error(error.message);

  let need = qty;
  const allocations: FifoAllocation[] = [];
  let totalCost = 0;

  for (const b of batches || []) {
    if (need <= 0) break;
    const take = Math.min(Number(b.qty_remaining), need);
    allocations.push({
      batch_id: b.id,
      qty: take,
      unit_cost: Number(b.unit_cost),
    });
    totalCost += take * Number(b.unit_cost);
    need -= take;
  }

  if (need > 0) {
    // Fallback: sisa tanpa batch (pakai cost produk)
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

/** Apply pengurangan batch setelah plan */
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

/** Tambah batch saat restock / produk baru */
export async function addStockBatch(
  productId: string,
  qty: number,
  unitCost: number,
  note?: string
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
  });
}
