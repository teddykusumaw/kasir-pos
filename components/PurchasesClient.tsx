"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { Profile, Supplier, Product } from "@/types/database";
import { addStockBatch } from "@/lib/fifo";
import {
  SUPPLIER_OPTION_SELECT,
  PRODUCT_OPTION_SELECT,
  PURCHASE_LIST_SELECT,
} from "@/lib/supplierQueries";
import { Plus, Trash2 } from "lucide-react";

type Line = { product_id: string; quantity: string; unit_cost: string };

function deriveStatus(total: number, paid: number) {
  if (paid <= 0) return "open" as const;
  if (paid >= total) return "paid" as const;
  return "partial" as const;
}

export default function PurchasesClient({ profile }: { profile: Profile }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);

  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [invoiceNo, setInvoiceNo] = useState("");
  const [amountPaid, setAmountPaid] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { product_id: "", quantity: "1", unit_cost: "0" },
  ]);

  const [payId, setPayId] = useState<string | null>(null);
  const [payAmt, setPayAmt] = useState("");

  const supabase = createClient();
  const isAdmin = profile.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: p }, { data: pur }] = await Promise.all([
      supabase.from("suppliers").select(SUPPLIER_OPTION_SELECT).eq("is_active", true).order("name"),
      supabase.from("products").select(PRODUCT_OPTION_SELECT).order("name"),
      supabase
        .from("purchases")
        .select(PURCHASE_LIST_SELECT)
        .order("purchase_date", { ascending: false })
        .limit(100),
    ]);
    setSuppliers((s as Supplier[]) || []);
    setProducts((p as Product[]) || []);
    setRows(pur || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const lineTotal = useMemo(() => {
    return lines.reduce((sum, l) => {
      const q = Number(l.quantity) || 0;
      const c = Number(l.unit_cost) || 0;
      return sum + q * c;
    }, 0);
  }, [lines]);

  const savePurchase = async () => {
    if (!isAdmin) return;
    if (!supplierId) {
      setMsg("Pilih supplier");
      return;
    }
    const validLines = lines.filter(
      (l) => l.product_id && Number(l.quantity) > 0
    );
    if (!validLines.length) {
      setMsg("Minimal 1 item");
      return;
    }
    const subtotal = validLines.reduce(
      (s, l) => s + Number(l.quantity) * Number(l.unit_cost || 0),
      0
    );
    const paid = Math.min(subtotal, Number(amountPaid) || 0);
    const status = deriveStatus(subtotal, paid);

    setLoading(true);
    const { data: purchase, error } = await supabase
      .from("purchases")
      .insert({
        supplier_id: supplierId,
        purchase_date: purchaseDate,
        invoice_no: invoiceNo.trim() || null,
        subtotal,
        amount_paid: paid,
        status,
        notes: notes.trim() || null,
        created_by: profile.id,
      })
      .select()
      .single();

    if (error || !purchase) {
      setMsg(error?.message || "Gagal simpan pembelian");
      setLoading(false);
      return;
    }

    const items = validLines.map((l) => ({
      purchase_id: purchase.id,
      product_id: l.product_id,
      quantity: Number(l.quantity),
      unit_cost: Number(l.unit_cost) || 0,
      subtotal: Number(l.quantity) * Number(l.unit_cost || 0),
    }));
    const { error: itemErr } = await supabase
      .from("purchase_items")
      .insert(items);
    if (itemErr) {
      setMsg(itemErr.message);
      setLoading(false);
      return;
    }

    // Update stok + FIFO batch
    for (const l of validLines) {
      const qty = Number(l.quantity);
      const cost = Number(l.unit_cost) || 0;
      const prod = products.find((x) => x.id === l.product_id);
      if (!prod) continue;
      await supabase
        .from("products")
        .update({
          stock: Number(prod.stock) + qty,
          cost: cost > 0 ? cost : prod.cost,
          supplier_id: supplierId,
        })
        .eq("id", l.product_id);
      await addStockBatch(l.product_id, qty, cost, `PO ${invoiceNo || purchase.id.slice(0, 8)}`, {
        supplier_id: supplierId,
        delivery_date: purchaseDate,
      });
    }

    // Hutang otomatis jika belum lunas
    const remaining = subtotal - paid;
    if (remaining > 0.001) {
      const sup = suppliers.find((x) => x.id === supplierId);
      await supabase.from("payables").insert({
        contact_name: sup?.name || "Supplier",
        description: `Pembelian ${invoiceNo || purchase.id.slice(0, 8)}`,
        amount: subtotal,
        amount_paid: paid,
        due_date: purchaseDate,
        status,
        supplier_id: supplierId,
        purchase_id: purchase.id,
        created_by: profile.id,
      });
    }

    setLoading(false);
    setOpen(false);
    setMsg("Pembelian tersimpan — stok & hutang diperbarui");
    setLines([{ product_id: "", quantity: "1", unit_cost: "0" }]);
    setAmountPaid("0");
    setInvoiceNo("");
    setNotes("");
    load();
  };

  const recordPay = async () => {
    if (!isAdmin || !payId) return;
    const row = rows.find((r) => r.id === payId);
    if (!row) return;
    const add = Number(payAmt);
    if (!add || add <= 0) return;
    const total = Number(row.subtotal);
    const newPaid = Math.min(total, Number(row.amount_paid) + add);
    const status = deriveStatus(total, newPaid);
    await supabase
      .from("purchases")
      .update({
        amount_paid: newPaid,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payId);
    // sync payable
    await supabase
      .from("payables")
      .update({ amount_paid: newPaid, status, updated_at: new Date().toISOString() })
      .eq("purchase_id", payId);
    setPayId(null);
    setPayAmt("");
    setMsg("Pembayaran dicatat");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3 items-center">
        <div>
          <h1 className="text-2xl font-bold">Pembelian Supplier</h1>
          <p className="text-sm text-slate-500">
            Catat barang masuk, nominal, pembayaran, dan sisa hutang
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm"
          >
            <Plus size={16} /> Pembelian baru
          </button>
        )}
      </div>

      {msg && (
        <p className="text-sm bg-slate-50 px-3 py-2 rounded-lg">{msg}</p>
      )}

      {payId && isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex flex-wrap gap-2 items-end">
          <div>
            <label className="text-xs text-slate-500">Bayar hutang</label>
            <input
              type="number"
              value={payAmt}
              onChange={(e) => setPayAmt(e.target.value)}
              className="block px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <button
            type="button"
            onClick={recordPay}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
          >
            Catat
          </button>
          <button type="button" onClick={() => setPayId(null)} className="text-sm text-slate-500">
            Batal
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Tanggal</th>
              <th className="text-left px-3 py-2">Supplier</th>
              <th className="text-left px-3 py-2">Invoice</th>
              <th className="text-right px-3 py-2">Item</th>
              <th className="text-right px-3 py-2">Total</th>
              <th className="text-right px-3 py-2">Dibayar</th>
              <th className="text-right px-3 py-2">Sisa</th>
              <th className="text-left px-3 py-2">Status</th>
              {isAdmin && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-slate-400">
                  Memuat...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-slate-400">
                  Belum ada pembelian
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const total = Number(r.subtotal);
                const paid = Number(r.amount_paid);
                const sisa = Math.max(0, total - paid);
                const itemCount = (r.purchase_items || []).reduce(
                  (s: number, i: any) => s + Number(i.quantity || 0),
                  0
                );
                return (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{formatDateShort(r.purchase_date)}</td>
                    <td className="px-3 py-2 font-medium">
                      {r.suppliers?.name || "-"}
                    </td>
                    <td className="px-3 py-2">{r.invoice_no || "-"}</td>
                    <td className="px-3 py-2 text-right">{itemCount}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(total)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(paid)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-amber-700">
                      {formatCurrency(sisa)}
                    </td>
                    <td className="px-3 py-2 capitalize">{r.status}</td>
                    {isAdmin && (
                      <td className="px-3 py-2">
                        {r.status !== "paid" && r.status !== "cancelled" && (
                          <button
                            type="button"
                            className="text-xs text-blue-600"
                            onClick={() => {
                              setPayId(r.id);
                              setPayAmt(String(sisa));
                            }}
                          >
                            Bayar
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {open && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full p-5 space-y-3 my-8">
            <h2 className="font-semibold text-lg">Pembelian baru</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Supplier *</label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">Pilih...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Tanggal kirim</label>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">No. invoice</label>
                <input
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Dibayar sekarang</label>
                <input
                  type="number"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Item</p>
              {lines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <select
                    className="col-span-6 px-2 py-1.5 border rounded-lg text-sm"
                    value={l.product_id}
                    onChange={(e) => {
                      const next = [...lines];
                      const prod = products.find((x) => x.id === e.target.value);
                      next[idx] = {
                        ...next[idx],
                        product_id: e.target.value,
                        unit_cost: prod ? String(prod.cost) : next[idx].unit_cost,
                      };
                      setLines(next);
                    }}
                  >
                    <option value="">Produk...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className="col-span-2 px-2 py-1.5 border rounded-lg text-sm"
                    placeholder="Qty"
                    value={l.quantity}
                    onChange={(e) => {
                      const next = [...lines];
                      next[idx] = { ...next[idx], quantity: e.target.value };
                      setLines(next);
                    }}
                  />
                  <input
                    type="number"
                    className="col-span-3 px-2 py-1.5 border rounded-lg text-sm"
                    placeholder="Harga modal"
                    value={l.unit_cost}
                    onChange={(e) => {
                      const next = [...lines];
                      next[idx] = { ...next[idx], unit_cost: e.target.value };
                      setLines(next);
                    }}
                  />
                  <button
                    type="button"
                    className="col-span-1 text-red-500"
                    onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-sm text-primary-600"
                onClick={() =>
                  setLines([
                    ...lines,
                    { product_id: "", quantity: "1", unit_cost: "0" },
                  ])
                }
              >
                + Tambah baris
              </button>
            </div>

            <div className="flex justify-between text-sm font-semibold border-t pt-2">
              <span>Total pembelian</span>
              <span>{formatCurrency(lineTotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-amber-700">
              <span>Sisa hutang (estimasi)</span>
              <span>
                {formatCurrency(
                  Math.max(0, lineTotal - (Number(amountPaid) || 0))
                )}
              </span>
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan"
              className="w-full px-3 py-2 border rounded-lg text-sm"
              rows={2}
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 border rounded-lg text-sm"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={savePurchase}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {loading ? "Menyimpan..." : "Simpan pembelian"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
