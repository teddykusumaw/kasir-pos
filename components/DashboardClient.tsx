"use client";

import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import {
  TrendingUp,
  ShoppingBag,
  Package,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { Profile, Product, DailySales, TopProduct } from "@/types/database";

interface Props {
  profile: Profile;
  lowStock: Product[];
  todayTotal: number;
  todayCount: number;
  productCount: number;
  stockValue: number;
}

type Range = "7d" | "30d" | "90d";

export default function DashboardClient({
  profile,
  lowStock,
  todayTotal,
  todayCount,
  productCount,
  stockValue,
}: Props) {
  const [range, setRange] = useState<Range>("7d");
  const [dailySales, setDailySales] = useState<DailySales[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchChartData();
  }, [range]);

  const fetchChartData = async () => {
    setLoading(true);
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    const start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);

    // Daily sales
    const { data: sales } = await supabase
      .from("sales")
      .select("created_at, total")
      .gte("created_at", start.toISOString())
      .order("created_at");

    const map: Record<string, { total: number; count: number }> = {};
    for (let i = 0; i <= days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      map[key] = { total: 0, count: 0 };
    }
    sales?.forEach((s) => {
      const key = s.created_at.slice(0, 10);
      if (map[key]) {
        map[key].total += Number(s.total);
        map[key].count += 1;
      }
    });
    setDailySales(
      Object.entries(map).map(([date, v]) => ({
        date,
        total: v.total,
        count: v.count,
      }))
    );

    // Top products: ambil sale_id di rentang tanggal dulu, lalu sale_items
    const prodMap: Record<string, TopProduct> = {};
    const { data: salesInRange } = await supabase
      .from("sales")
      .select("id")
      .gte("created_at", start.toISOString());

    const saleIds = (salesInRange || []).map((s) => s.id);
    if (saleIds.length > 0) {
      // Supabase .in() terbatas; chunk jika banyak
      const chunkSize = 100;
      for (let i = 0; i < saleIds.length; i += chunkSize) {
        const chunk = saleIds.slice(i, i + chunkSize);
        const { data: saleItems, error: itemsErr } = await supabase
          .from("sale_items")
          .select("quantity, subtotal, product_id, products(name)")
          .in("sale_id", chunk);

        if (itemsErr) {
          console.error("sale_items error:", itemsErr.message);
          continue;
        }

        saleItems?.forEach((item: any) => {
          const id = item.product_id;
          if (!prodMap[id]) {
            prodMap[id] = {
              product_id: id,
              product_name: item.products?.name || "Unknown",
              total_qty: 0,
              total_revenue: 0,
            };
          }
          prodMap[id].total_qty += item.quantity;
          prodMap[id].total_revenue += Number(item.subtotal);
        });
      }
    }

    setTopProducts(
      Object.values(prodMap)
        .sort((a, b) => b.total_qty - a.total_qty)
        .slice(0, 8)
    );

    setLoading(false);
  };

  const stats = [
    {
      label: "Penjualan Hari Ini",
      value: formatCurrency(todayTotal),
      sub: `${todayCount} transaksi`,
      icon: TrendingUp,
      color: "bg-emerald-500",
    },
    {
      label: "Total Produk",
      value: productCount.toString(),
      sub: "item terdaftar",
      icon: Package,
      color: "bg-blue-500",
    },
    {
      label: "Nilai Stok",
      value: formatCurrency(stockValue),
      sub: "modal warehouse",
      icon: ShoppingBag,
      color: "bg-violet-500",
    },
    {
      label: "Stok Menipis",
      value: lowStock.length.toString(),
      sub: "perlu restock",
      icon: AlertTriangle,
      color: "bg-amber-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Halo, {profile.full_name} 👋
          </h1>
          <p className="text-slate-500">Ringkasan operasional toko Anda</p>
        </div>
        <div className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 p-1">
          {(["7d", "30d", "90d"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                range === r
                  ? "bg-primary-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {r === "7d" ? "7 Hari" : r === "30d" ? "30 Hari" : "90 Hari"}
            </button>
          ))}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">{s.label}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {s.value}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">{s.sub}</p>
                </div>
                <div className={`${s.color} p-2.5 rounded-lg text-white`}>
                  <Icon size={20} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Calendar size={18} />
            Grafik Penjualan
          </h2>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-slate-400">
              Memuat...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={dailySales}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) =>
                    new Date(v).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                    })
                  }
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  tickFormatter={(v) =>
                    v >= 1000000
                      ? `${(v / 1000000).toFixed(1)}jt`
                      : v >= 1000
                      ? `${(v / 1000).toFixed(0)}rb`
                      : v
                  }
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  labelFormatter={(l) => formatDateShort(l)}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#3b82f6"
                  fill="url(#colorTotal)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Item Terlaris
          </h2>
          {loading ? (
            <div className="h-64 flex items-center justify-center text-slate-400">
              Memuat...
            </div>
          ) : topProducts.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-10">
              Belum ada data penjualan
            </p>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {topProducts.map((p, i) => (
                <div
                  key={p.product_id}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">
                      {p.product_name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {p.total_qty} terjual · {formatCurrency(p.total_revenue)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Low Stock Alert */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-500" />
          Stok Menipis di Warehouse
        </h2>
        {lowStock.length === 0 ? (
          <p className="text-slate-400 text-sm">Semua stok aman 👍</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="pb-2 font-medium">Produk</th>
                  <th className="pb-2 font-medium">Barcode</th>
                  <th className="pb-2 font-medium">Stok</th>
                  <th className="pb-2 font-medium">Min. Stok</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-2.5 font-medium text-slate-800">
                      {p.name}
                    </td>
                    <td className="py-2.5 text-slate-500">{p.barcode || "-"}</td>
                    <td className="py-2.5 font-semibold text-red-600">
                      {p.stock}
                    </td>
                    <td className="py-2.5 text-slate-500">{p.min_stock}</td>
                    <td className="py-2.5">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        Restock!
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
