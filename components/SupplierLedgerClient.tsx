"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { downloadExcel } from "@/lib/exportExcel";
import { PURCHASE_LEDGER_SELECT } from "@/lib/supplierQueries";
import { FileSpreadsheet } from "lucide-react";

interface LedgerRow {
  supplier_id: string;
  name: string;
  qty_items: number;
  total_purchase: number;
  total_paid: number;
  remaining: number;
  purchase_count: number;
}

export default function SupplierLedgerClient() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);

    // 1) Coba view agregasi (lebih ringan)
    if (!from && !to) {
      const { data: viewData, error: viewErr } = await supabase
        .from("v_supplier_ledger")
        .select(
          "supplier_id, supplier_name, purchase_count, qty_items, total_purchase, total_paid, remaining"
        )
        .order("remaining", { ascending: false });
      if (!viewErr && viewData) {
        setRows(
          viewData.map((r: any) => ({
            supplier_id: r.supplier_id,
            name: r.supplier_name,
            qty_items: Number(r.qty_items) || 0,
            total_purchase: Number(r.total_purchase) || 0,
            total_paid: Number(r.total_paid) || 0,
            remaining: Math.max(0, Number(r.remaining) || 0),
            purchase_count: Number(r.purchase_count) || 0,
          }))
        );
        setLoading(false);
        return;
      }
    }

    // 2) Fallback: join kolom minimal + agregasi di client
    let q = supabase
      .from("purchases")
      .select(PURCHASE_LEDGER_SELECT)
      .neq("status", "cancelled");
    if (from) q = q.gte("purchase_date", from);
    if (to) q = q.lte("purchase_date", to);
    const { data } = await q;

    const map: Record<string, LedgerRow> = {};
    for (const p of data || []) {
      const sid = p.supplier_id as string;
      if (!map[sid]) {
        map[sid] = {
          supplier_id: sid,
          name: (p as any).suppliers?.name || "—",
          qty_items: 0,
          total_purchase: 0,
          total_paid: 0,
          remaining: 0,
          purchase_count: 0,
        };
      }
      const qty = ((p as any).purchase_items || []).reduce(
        (s: number, i: any) => s + Number(i.quantity || 0),
        0
      );
      map[sid].qty_items += qty;
      map[sid].total_purchase += Number(p.subtotal);
      map[sid].total_paid += Number(p.amount_paid);
      map[sid].purchase_count += 1;
    }
    const list = Object.values(map).map((r) => ({
      ...r,
      remaining: Math.max(0, r.total_purchase - r.total_paid),
    }));
    list.sort((a, b) => b.remaining - a.remaining);
    setRows(list);
    setLoading(false);
  }, [supabase, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = rows.reduce(
    (a, r) => ({
      qty: a.qty + r.qty_items,
      purchase: a.purchase + r.total_purchase,
      paid: a.paid + r.total_paid,
      remain: a.remain + r.remaining,
    }),
    { qty: 0, purchase: 0, paid: 0, remain: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Rekap Supplier</h2>
          <p className="text-xs text-slate-500">
            Qty item · nominal · dibayar · sisa hutang (query optimasi)
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="px-2 py-1.5 border rounded-lg text-sm"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-2 py-1.5 border rounded-lg text-sm"
          />
          <button
            type="button"
            onClick={() => load()}
            className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm"
          >
            Filter
          </button>
          <button
            type="button"
            className="px-3 py-1.5 border rounded-lg text-sm flex items-center gap-1"
            onClick={() =>
              downloadExcel("rekap-supplier", [
                {
                  name: "Rekap",
                  headers: [
                    "Supplier",
                    "Jml PO",
                    "Qty item",
                    "Total beli",
                    "Dibayar",
                    "Sisa hutang",
                  ],
                  rows: rows.map((r) => [
                    r.name,
                    r.purchase_count,
                    r.qty_items,
                    r.total_purchase,
                    r.total_paid,
                    r.remaining,
                  ]),
                },
              ])
            }
          >
            <FileSpreadsheet size={14} /> Excel
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        <div className="bg-white border rounded-xl p-3">
          <p className="text-xs text-slate-500">Total qty item</p>
          <p className="text-lg font-bold">{totals.qty}</p>
        </div>
        <div className="bg-white border rounded-xl p-3">
          <p className="text-xs text-slate-500">Total pembelian</p>
          <p className="text-lg font-bold">{formatCurrency(totals.purchase)}</p>
        </div>
        <div className="bg-white border rounded-xl p-3">
          <p className="text-xs text-slate-500">Sudah dibayar</p>
          <p className="text-lg font-bold text-emerald-600">
            {formatCurrency(totals.paid)}
          </p>
        </div>
        <div className="bg-white border rounded-xl p-3">
          <p className="text-xs text-slate-500">Sisa hutang</p>
          <p className="text-lg font-bold text-amber-600">
            {formatCurrency(totals.remain)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Supplier</th>
              <th className="text-right px-3 py-2">PO</th>
              <th className="text-right px-3 py-2">Qty item</th>
              <th className="text-right px-3 py-2">Total beli</th>
              <th className="text-right px-3 py-2">Dibayar</th>
              <th className="text-right px-3 py-2">Sisa hutang</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-400">
                  Memuat...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-400">
                  Belum ada data pembelian
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.supplier_id} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-right">{r.purchase_count}</td>
                  <td className="px-3 py-2 text-right">{r.qty_items}</td>
                  <td className="px-3 py-2 text-right">
                    {formatCurrency(r.total_purchase)}
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-700">
                    {formatCurrency(r.total_paid)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-amber-700">
                    {formatCurrency(r.remaining)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
