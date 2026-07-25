"use client";

import { useState, useMemo } from "react";
import { Search, Download, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Product, Supplier } from "@/types/database";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Props {
  products: Product[];
  suppliers?: Supplier[];
  /** product_id -> latest delivery_date from batches */
  deliveryByProduct?: Record<string, string>;
}

type StockFilter = "all" | "low" | "out" | "ok";

export default function WarehouseClient({
  products,
  suppliers = [],
  deliveryByProduct = {},
}: Props) {
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [deliveryFrom, setDeliveryFrom] = useState("");
  const [deliveryTo, setDeliveryTo] = useState("");

  const categories = useMemo(() => {
    const cats = new Set(
      products.map((p) => p.category).filter(Boolean) as string[]
    );
    return Array.from(cats).sort();
  }, [products]);

  const supplierName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of suppliers) m[s.id] = s.name;
    return m;
  }, [suppliers]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode && p.barcode.includes(search));
      const matchCat =
        categoryFilter === "all" || p.category === categoryFilter;
      const sid = (p as any).supplier_id as string | null | undefined;
      const matchSup =
        supplierFilter === "all" ||
        (supplierFilter === "none" && !sid) ||
        sid === supplierFilter;
      let matchStock = true;
      if (stockFilter === "low") matchStock = p.stock > 0 && p.stock <= p.min_stock;
      if (stockFilter === "out") matchStock = p.stock === 0;
      if (stockFilter === "ok") matchStock = p.stock > p.min_stock;
      const deliv = deliveryByProduct[p.id] || "";
      let matchDeliv = true;
      if (deliveryFrom && deliv && deliv < deliveryFrom) matchDeliv = false;
      if (deliveryTo && deliv && deliv > deliveryTo) matchDeliv = false;
      if ((deliveryFrom || deliveryTo) && !deliv) matchDeliv = false;
      return matchSearch && matchCat && matchSup && matchStock && matchDeliv;
    });
  }, [
    products,
    search,
    stockFilter,
    categoryFilter,
    supplierFilter,
    deliveryFrom,
    deliveryTo,
    deliveryByProduct,
  ]);

  const totalItems = filtered.length;
  const totalStock = filtered.reduce((s, p) => s + p.stock, 0);
  const totalValue = filtered.reduce((s, p) => s + p.stock * Number(p.cost), 0);
  const lowCount = products.filter((p) => p.stock <= p.min_stock).length;

  const exportCSV = () => {
    const headers = ["Nama", "Barcode", "Kategori", "Supplier", "Kirim terakhir", "Stok", "Min Stok", "Satuan", "Harga", "Modal", "Nilai Stok"];
    const rows = filtered.map((p) => [
      p.name,
      p.barcode || "",
      p.category || "",
      supplierName[(p as any).supplier_id] || "",
      deliveryByProduct[p.id] || "",
      p.stock,
      p.min_stock,
      p.unit,
      p.price,
      p.cost,
      p.stock * Number(p.cost),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-warehouse-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Laporan Warehouse / Stok", 14, 20);
    doc.setFontSize(10);
    doc.text(`Tanggal: ${new Date().toLocaleDateString("id-ID")}`, 14, 28);
    doc.text(`Total Item: ${totalItems} | Total Stok: ${totalStock} | Nilai: ${formatCurrency(totalValue)}`, 14, 34);

    autoTable(doc, {
      startY: 40,
      head: [["Nama", "Barcode", "Kategori", "Stok", "Min", "Harga", "Nilai"]],
      body: filtered.map((p) => [
        p.name,
        p.barcode || "-",
        p.category || "-",
        p.stock,
        p.min_stock,
        formatCurrency(p.price),
        formatCurrency(p.stock * Number(p.cost)),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    doc.save(`laporan-warehouse-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Warehouse</h1>
          <p className="text-slate-500">Laporan stok & inventori</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-medium"
          >
            <FileSpreadsheet size={16} />
            CSV
          </button>
          <button
            onClick={exportPDF}
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-medium"
          >
            <Download size={16} />
            PDF
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500">Total Item</p>
          <p className="text-xl font-bold">{totalItems}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500">Total Unit Stok</p>
          <p className="text-xl font-bold">{totalStock}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500">Nilai Stok (Modal)</p>
          <p className="text-xl font-bold">{formatCurrency(totalValue)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <AlertTriangle size={12} className="text-amber-500" /> Stok Menipis
          </p>
          <p className="text-xl font-bold text-amber-600">{lowCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari produk..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <select
          value={stockFilter}
          onChange={(e) => setStockFilter(e.target.value as StockFilter)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none"
        >
          <option value="all">Semua Stok</option>
          <option value="ok">Stok Aman</option>
          <option value="low">Stok Menipis</option>
          <option value="out">Habis</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none"
        >
          <option value="all">Semua Kategori</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none"
        >
          <option value="all">Semua Supplier</option>
          <option value="none">Tanpa supplier</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={deliveryFrom}
          onChange={(e) => setDeliveryFrom(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
          title="Kirim dari tanggal"
        />
        <input
          type="date"
          value={deliveryTo}
          onChange={(e) => setDeliveryTo(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
          title="Kirim sampai tanggal"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Produk</th>
                <th className="text-left px-4 py-3 font-medium">Barcode</th>
                <th className="text-left px-4 py-3 font-medium">Kategori</th>
                <th className="text-left px-4 py-3 font-medium">Supplier</th>
                <th className="text-left px-4 py-3 font-medium">Kirim terakhir</th>
                <th className="text-left px-4 py-3 font-medium">Stok</th>
                <th className="text-left px-4 py-3 font-medium">Min</th>
                <th className="text-left px-4 py-3 font-medium">Harga</th>
                <th className="text-left px-4 py-3 font-medium">Nilai Stok</th>
                <th className="text-left px-4 py-3 font-medium">Stok Status</th>
                <th className="text-left px-4 py-3 font-medium">Item Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const isLow = p.stock <= p.min_stock;
                const isOut = p.stock === 0;
                return (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-medium">{p.name}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-500">
                      {p.barcode || "-"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {p.category || "-"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {supplierName[(p as any).supplier_id] || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">
                      {deliveryByProduct[p.id] || "—"}
                    </td>
                    <td className="px-4 py-2.5 font-semibold">
                      {p.stock} {p.unit}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{p.min_stock}</td>
                    <td className="px-4 py-2.5">{formatCurrency(p.price)}</td>
                    <td className="px-4 py-2.5">
                      {formatCurrency(p.stock * Number(p.cost))}
                    </td>
                    <td className="px-4 py-2.5">
                      {isOut ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                          Habis
                        </span>
                      ) : isLow ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                          Menipis
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">
                          Aman
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        (p.status || "active") === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-600"
                      }`}>
                        {(p.status || "active") === "active" ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
