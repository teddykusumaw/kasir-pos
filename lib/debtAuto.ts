/**
 * Pelunasan otomatis FIFO per kontak
 */

export interface DebtLike {
  id: string;
  contact_name: string;
  amount: number;
  amount_paid: number;
  status: string;
  due_date?: string | null;
  created_at?: string;
}

export function remaining(d: DebtLike) {
  return Math.max(0, Number(d.amount) - Number(d.amount_paid));
}

export function deriveStatus(amount: number, paid: number): "open" | "partial" | "paid" {
  if (paid <= 0) return "open";
  if (paid >= amount) return "paid";
  return "partial";
}

/**
 * Alokasi pembayaran FIFO ke daftar tagihan terbuka (urut due_date lalu created)
 * Return list update: { id, amount_paid, status }
 */
export function allocatePaymentFifo(
  openItems: DebtLike[],
  paymentAmount: number
): { id: string; amount_paid: number; status: "open" | "partial" | "paid" }[] {
  let left = paymentAmount;
  const sorted = [...openItems].sort((a, b) => {
    const da = a.due_date || a.created_at || "";
    const db = b.due_date || b.created_at || "";
    return da.localeCompare(db);
  });
  const updates: { id: string; amount_paid: number; status: "open" | "partial" | "paid" }[] = [];
  for (const item of sorted) {
    if (left <= 0) break;
    const rem = remaining(item);
    if (rem <= 0) continue;
    const pay = Math.min(rem, left);
    const newPaid = Number(item.amount_paid) + pay;
    updates.push({
      id: item.id,
      amount_paid: newPaid,
      status: deriveStatus(Number(item.amount), newPaid),
    });
    left -= pay;
  }
  return updates;
}
