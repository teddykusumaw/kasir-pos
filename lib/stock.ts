/**
 * Manajemen stok otomatis (client helpers)
 * Trigger DB menangani sale_items / purchase_items.
 * Helper ini untuk penyesuaian manual & FIFO batch.
 */
import { createClient } from "@/lib/supabase/client";
import { addStockBatch, applyFifoConsume, planFifoConsume } from "@/lib/fifo";

/** Sesuaikan stok manual (admin) + log movement */
export async function adjustStock(params: {
  productId: string;
  /** delta: + tambah, - kurangi */
  delta: number;
  note?: string;
  userId?: string;
  /** jika positif, buat batch FIFO */
  unitCost?: number;
  supplierId?: string | null;
}) {
  const { productId, delta, note, userId, unitCost, supplierId } = params;
  if (!delta) return;

  const supabase = createClient();
  const { data: prod, error } = await supabase
    .from("products")
    .select("stock")
    .eq("id", productId)
    .single();
  if (error || !prod) throw new Error(error?.message || "Produk tidak ditemukan");

  const next = Math.max(0, Number(prod.stock) + delta);
  await supabase
    .from("products")
    .update({ stock: next, updated_at: new Date().toISOString() })
    .eq("id", productId);

  await supabase.from("stock_movements").insert({
    product_id: productId,
    qty_change: delta,
    stock_after: next,
    reason: "adjustment",
    note: note || "Penyesuaian manual",
    created_by: userId || null,
  });

  if (delta > 0) {
    await addStockBatch(productId, delta, unitCost ?? 0, note || "Adjustment", {
      supplier_id: supplierId || null,
      delivery_date: new Date().toISOString().slice(0, 10),
    });
  } else if (delta < 0) {
    try {
      const plan = await planFifoConsume(productId, Math.abs(delta));
      await applyFifoConsume(plan.allocations);
    } catch {
      // batch optional
    }
  }

  return next;
}

/** Setelah penjualan: FIFO batch (stok produk diurus trigger sale_items) */
export async function onSaleStock(productId: string, qty: number) {
  const plan = await planFifoConsume(productId, qty);
  await applyFifoConsume(plan.allocations);
  return plan;
}

/** Sinkron products.stock = sum batch remaining (perbaikan data) */
export async function syncStockFromBatches(productId: string) {
  const supabase = createClient();
  const { data: batches } = await supabase
    .from("stock_batches")
    .select("qty_remaining")
    .eq("product_id", productId);
  const sum = (batches || []).reduce(
    (s, b) => s + Number(b.qty_remaining || 0),
    0
  );
  await supabase
    .from("products")
    .update({ stock: sum, updated_at: new Date().toISOString() })
    .eq("id", productId);
  return sum;
}
