"use client";

import { useState, useEffect } from "react";
import { Download, FileSpreadsheet, Filter } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface SaleRow {
  id: string;
  created_at: string;
  total: number;
  payment_method: string;
  cashier_name: string;
  item_count: number;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
}

export default function ReportsClient() {
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [paymentFilter, setPaymentFilter] = useState("all");
  const supabase = createClient();

  useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = async () => {
    setLoading(true);
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    let query = supabase
      .from("sales")
      .select(
        `
        id,
        created_at,
        subtotal,
        tax_rate,
        tax_amount,
        total,
        payment_method,
        cashier_id,
        profiles!sales_cashier_id_fkey ( full_name ),
        sale_items ( id )
      `
      )
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .order("created_at", { ascending: false });

    if (paymentFilter !== "all") {
      query = query.eq("payment_method", paymentFilter);
    }

    const { data, error } = await query;
    if (error) {
      // fallback tanpa embed profiles jika nama FK berbeda
      console.warn("reports query:", error.message);
      const { data: fallback } = await supabase
        .from("sales")
        .select("id, created_at, subtotal, tax_rate, tax_amount, total, payment_method, cashier_id, sale_items(id)")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false });

      let profileMap: Record<string, string> = {};
      const cashierIds = [...new Set((fallback || []).map((s: any) => s.cashier_id).filter(Boolean))];
      if (cashierIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", cashierIds);
        profiles?.forEach((p: any) => {
          profileMap[p.id] = p.full_name;
        });
      }

      setSales(
        (fallback || []).map((s: any) => ({
          id: s.id,
          created_at: s.created_at,
          subtotal: Number(s.subtotal || 0),
          tax_amount: Number(s.tax_amount || 0),
          tax_rate: Number(s.tax_rate || 0),
          total: Number(s.total),
          payment_method: s.payment_method,
          cashier_name: profileMap[s.cashier_id] || "-",
          item_count: s.sale_items?.length || 0,
        }))
      );
    } else if (data) {
      setSales(
        data.map((s: any) => ({
          id: s.id,
          created_at: s.created_at,
          subtotal: Number(s.subtotal || 0),
          tax_amount: Number(s.tax_amount || 0),
          tax_rate: Number(s.tax_rate || 0),
          total: Number(s.total),
          payment_method: s.payment_method,
          cashier_name: s.profiles?.full_name || "-",
          item_count: s.sale_items?.length || 0,
        }))
      );
    }
    setLoading(false);
  };

  const totalRevenue = sales.reduce((s, r) => s + r.total, 0);
  const totalTax = sales.reduce((s, r) => s + (r.tax_amount || 0), 0);
  const totalTx = sales.length;

  const exportCSV = () => {
    const headers = ["ID", "Tanggal", "Kasir", "Metode", "Item", "Subtotal", "PPN", "Total"];
    const rows = sales.map((s) => [
      s.id.slice(0, 8),
      formatDate(s.created_at),
      s.cashier_name,
      s.payment_method,
      s.item_count,
      s.subtotal || 0,
      s.tax_amount || 0,
      s.total,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-penjualan-${startDate}_${endDate}.csv`;
    a.click();
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Laporan Penjualan", 14, 20);
    doc.setFontSize(10);
    doc.text(`Periode: ${startDate} s/d ${endDate}`, 14, 28);
    doc.text(
      `Total Transaksi: ${totalTx} | Total Omzet: ${formatCurrency(totalRevenue)} | Total PPN: ${formatCurrency(totalTax)}`,
      14,
      34
    );

    autoTable(doc, {
      startY: 40,
      head: [["Tanggal", "Kasir", "Metode", "Item", "Subtotal", "PPN", "Total"]],
      body: sales.map((s) => [
        formatDate(s.created_at),
        s.cashier_name,
        s.payment_method,
        s.item_count,
        formatCurrency(s.subtotal || 0),
        formatCurrency(s.tax_amount || 0),
        formatCurrency(s.total),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    doc.save(`laporan-penjualan-${startDate}_${endDate}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Laporan Keuangan</h1>
          <p className="text-slate-500">Filter & export laporan penjualan</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            disabled={sales.length === 0}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-medium"
          >
            <FileSpreadsheet size={16} />
            CSV
          </button>
          <button
            onClick={exportPDF}
            disabled={sales.length === 0}
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-medium"
          >
            <Download size={16} />
            PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Dari Tanggal</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Sampai Tanggal</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Metode Bayar</label>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none"
          >
            <option value="all">Semua</option>
            <option value="cash">Tunai</option>
            <option value="qris">QRIS</option>
            <option value="transfer">Transfer</option>
            <option value="card">Kartu</option>
          </select>
        </div>
        <button
          onClick={fetchSales}
          className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Filter size={16} />
          Terapkan Filter
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500">Total Transaksi</p>
          <p className="text-2xl font-bold">{totalTx}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500">Total Omzet</p>
          <p className="text-2xl font-bold text-primary-600">
            {formatCurrency(totalRevenue)}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500">Total PPN</p>
          <p className="text-2xl font-bold text-amber-600">
            {formatCurrency(totalTax)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Tanggal</th>
                <th className="text-left px-4 py-3 font-medium">ID</th>
                <th className="text-left px-4 py-3 font-medium">Kasir</th>
                <th className="text-left px-4 py-3 font-medium">Metode</th>
                <th className="text-left px-4 py-3 font-medium">Item</th>
                <th className="text-right px-4 py-3 font-medium">Subtotal</th>
                <th className="text-right px-4 py-3 font-medium">PPN</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-400">
                    Memuat...
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-400">
                    Tidak ada data
                  </td>
                </tr>
              ) : (
                sales.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5">{formatDate(s.created_at)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      {s.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-4 py-2.5">{s.cashier_name}</td>
                    <td className="px-4 py-2.5 capitalize">{s.payment_method}</td>
                    <td className="px-4 py-2.5">{s.item_count}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">
                      {formatCurrency(s.subtotal || 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">
                      {formatCurrency(s.tax_amount || 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold">
                      {formatCurrency(s.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
