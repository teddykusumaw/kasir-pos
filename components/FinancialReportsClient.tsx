"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { Profile } from "@/types/database";
import {
  emptySalesAgg,
  calcPnL,
  calcCashReport,
  calcCashFlow,
  calcBalanceSheet,
  DEFAULT_FINANCE,
  type PeriodSalesAgg,
  type ExpenseRow,
  type FinanceOpening,
} from "@/lib/finance";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  TrendingUp,
  Wallet,
  ArrowLeftRight,
  Scale,
  Plus,
  Trash2,
  Download,
  FileSpreadsheet,
  BookOpen,
} from "lucide-react";
import { PRESET_EXPENSE_CATEGORIES } from "@/lib/expenseCategories";
import { downloadExcel } from "@/lib/exportExcel";
import DebtClient from "./DebtClient";
import {
  buildCashFlowSeries,
  analyzeCashFlow,
  type CashFlowInsight,
} from "@/lib/cashFlowAnalysis";

type Tab = "laba-rugi" | "kas" | "cashflow" | "neraca" | "beban" | "hutang-piutang";

interface Props {
  profile: Profile;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default function FinancialReportsClient({ profile }: Props) {
  const [tab, setTab] = useState<Tab>("laba-rugi");
  const [startDate, setStartDate] = useState(monthStart());
  const [endDate, setEndDate] = useState(todayStr());
  const [loading, setLoading] = useState(false);
  const [salesAgg, setSalesAgg] = useState<PeriodSalesAgg>(emptySalesAgg());
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [finance, setFinance] = useState<FinanceOpening>(DEFAULT_FINANCE);
  const [allTimeNet, setAllTimeNet] = useState(0);
  const [cashAllTime, setCashAllTime] = useState(0);
  const [piutangOpen, setPiutangOpen] = useState(0);
  const [hutangOpen, setHutangOpen] = useState(0);
  const [cfInsight, setCfInsight] = useState<CashFlowInsight | null>(null);

  // expense form
  const [expDate, setExpDate] = useState(todayStr());
  const [expCat, setExpCat] = useState("Operasional");
  const [expDesc, setExpDesc] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expMethod, setExpMethod] = useState("cash");
  const [expSaving, setExpSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const supabase = createClient();
  const isAdmin = profile.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Sales in period
    const { data: sales } = await supabase
      .from("sales")
      .select("id, total, subtotal, tax_amount, payment_method")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());

    const agg = emptySalesAgg();
    const saleIds = (sales || []).map((s) => s.id);
    for (const s of sales || []) {
      agg.revenue += Number(s.subtotal || 0);
      // fallback if subtotal 0 (old rows): use total
      if (!s.subtotal && s.total) agg.revenue += Number(s.total);
      else if (!s.subtotal) {
        /* skip */
      }
      // fix double-count: if subtotal exists don't add total
      if (s.subtotal != null && Number(s.subtotal) > 0) {
        // already added subtotal
      } else if (Number(s.total) > 0 && !(Number(s.subtotal) > 0)) {
        // for old data without subtotal, revenue = total (approx)
      }
      agg.tax += Number(s.tax_amount || 0);
      agg.grandTotal += Number(s.total || 0);
      agg.count += 1;
      const m = s.payment_method || "cash";
      agg.byMethod[m] = (agg.byMethod[m] || 0) + Number(s.total || 0);
    }
    // Recalculate revenue cleanly
    agg.revenue = 0;
    for (const s of sales || []) {
      const sub = Number(s.subtotal || 0);
      agg.revenue += sub > 0 ? sub : Number(s.total || 0) - Number(s.tax_amount || 0);
    }

    // COGS from sale_items
    if (saleIds.length) {
      for (let i = 0; i < saleIds.length; i += 100) {
        const chunk = saleIds.slice(i, i + 100);
        const { data: items } = await supabase
          .from("sale_items")
          .select("quantity, cost, price, product_id, products(cost)")
          .in("sale_id", chunk);
        for (const it of items || []) {
          const unitCost =
            Number((it as any).cost) > 0
              ? Number((it as any).cost)
              : Number((it as any).products?.cost || 0);
          agg.cogs += unitCost * Number(it.quantity);
        }
      }
    }
    setSalesAgg(agg);

    // Expenses in period
    const { data: exps } = await supabase
      .from("expenses")
      .select("*")
      .gte("expense_date", startDate)
      .lte("expense_date", endDate)
      .order("expense_date", { ascending: false });
    setExpenses(
      (exps || []).map((e: any) => ({
        id: e.id,
        expense_date: e.expense_date,
        category: e.category,
        description: e.description,
        amount: Number(e.amount),
        payment_method: e.payment_method,
      }))
    );

    // Inventory value
    const { data: products } = await supabase
      .from("products")
      .select("stock, cost");
    let inv = 0;
    for (const p of products || []) {
      inv += Number(p.stock || 0) * Number(p.cost || 0);
    }
    setInventoryValue(inv);

    // Finance opening
    const { data: fin } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "finance")
      .maybeSingle();
    const opening: FinanceOpening = {
      ...DEFAULT_FINANCE,
      ...(fin?.value || {}),
    };
    setFinance(opening);

    // All-time retained earnings (simplified: all sales revenue - cogs - all expenses)
    const { data: allSales } = await supabase
      .from("sales")
      .select("id, total, subtotal, tax_amount");
    let allRev = 0;
    const allIds = (allSales || []).map((s) => s.id);
    for (const s of allSales || []) {
      const sub = Number(s.subtotal || 0);
      allRev += sub > 0 ? sub : Number(s.total || 0) - Number(s.tax_amount || 0);
    }
    let allCogs = 0;
    for (let i = 0; i < allIds.length; i += 100) {
      const chunk = allIds.slice(i, i + 100);
      if (!chunk.length) break;
      const { data: items } = await supabase
        .from("sale_items")
        .select("quantity, cost, products(cost)")
        .in("sale_id", chunk);
      for (const it of items || []) {
        const unitCost =
          Number((it as any).cost) > 0
            ? Number((it as any).cost)
            : Number((it as any).products?.cost || 0);
        allCogs += unitCost * Number(it.quantity);
      }
    }
    const { data: allExp } = await supabase.from("expenses").select("amount, payment_method");
    let allExpSum = 0;
    let cashExpAll = 0;
    for (const e of allExp || []) {
      allExpSum += Number(e.amount);
      if (e.payment_method === "cash") cashExpAll += Number(e.amount);
    }
    setAllTimeNet(allRev - allCogs - allExpSum);

    // Cash balance: opening + all cash sales - all cash expenses
    let cashSalesAll = 0;
    const { data: cashSales } = await supabase
      .from("sales")
      .select("total")
      .eq("payment_method", "cash");
    for (const s of cashSales || []) cashSalesAll += Number(s.total);
    setCashAllTime(opening.opening_cash + cashSalesAll - cashExpAll);

    // Piutang & Hutang outstanding
    const { data: recv } = await supabase
      .from("receivables")
      .select("amount, amount_paid, status")
      .in("status", ["open", "partial"]);
    let piutang = 0;
    for (const r of recv || []) {
      piutang += Math.max(0, Number(r.amount) - Number(r.amount_paid));
    }
    setPiutangOpen(piutang);

    const { data: pay } = await supabase
      .from("payables")
      .select("amount, amount_paid, status")
      .in("status", ["open", "partial"]);
    let hutang = 0;
    for (const p of pay || []) {
      hutang += Math.max(0, Number(p.amount) - Number(p.amount_paid));
    }
    setHutangOpen(hutang);

    // Analisis arus kas harian
    const inflows: { date: string; amount: number }[] = [];
    const { data: salesForCf } = await supabase
      .from("sales")
      .select("created_at, total, payment_method")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());
    for (const s of salesForCf || []) {
      // tempo tidak masuk kas sampai dilunasi — skip tempo dari inflow kas
      if (s.payment_method === "tempo") continue;
      inflows.push({
        date: s.created_at.slice(0, 10),
        amount: Number(s.total),
      });
    }
    const outflows: { date: string; amount: number }[] = [];
    for (const e of exps || []) {
      outflows.push({
        date: String(e.expense_date).slice(0, 10),
        amount: Number(e.amount),
      });
    }
    const series = buildCashFlowSeries(
      startDate,
      endDate,
      inflows,
      outflows,
      opening.opening_cash
    );
    const { data: allRecv } = await supabase.from("receivables").select("contact_name, amount, amount_paid, due_date, status");
    const { data: allPay } = await supabase.from("payables").select("contact_name, amount, amount_paid, due_date, status");
    const cashNow = opening.opening_cash + cashSalesAll - cashExpAll;
    setCfInsight(
      analyzeCashFlow({
        series,
        currentCash: cashNow,
        receivables: allRecv || [],
        payables: allPay || [],
      })
    );

    setLoading(false);
  }, [startDate, endDate, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const pnl = calcPnL(salesAgg, expensesTotal);
  const cash = calcCashReport(salesAgg, expenses, finance.opening_cash);
  const cf = calcCashFlow(salesAgg, expensesTotal);
  const neraca = calcBalanceSheet({
    inventoryValue,
    cashBalance: cashAllTime,
    openingEquity: finance.opening_equity,
    retainedEarnings: allTimeNet,
  });

  const addExpense = async () => {
    if (!isAdmin) return;
    const amount = Number(expAmount);
    if (!amount || amount <= 0) {
      setMsg("Nominal beban tidak valid");
      return;
    }
    setExpSaving(true);
    const { error } = await supabase.from("expenses").insert({
      expense_date: expDate,
      category: expCat.trim() || "Operasional",
      description: expDesc.trim(),
      amount,
      payment_method: expMethod,
      created_by: profile.id,
    });
    setExpSaving(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setExpDesc("");
    setExpAmount("");
    setMsg("Beban tersimpan");
    load();
  };

  const deleteExpense = async (id: string) => {
    if (!isAdmin) return;
    if (!confirm("Hapus beban ini?")) return;
    await supabase.from("expenses").delete().eq("id", id);
    load();
  };

  const saveOpening = async () => {
    if (!isAdmin) return;
    await supabase.from("app_settings").upsert(
      {
        key: "finance",
        value: finance,
        updated_at: new Date().toISOString(),
        updated_by: profile.id,
      },
      { onConflict: "key" }
    );
    setMsg("Saldo awal disimpan");
    load();
  };

  const exportPdf = (title: string, rows: string[][], head: string[]) => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(title, 14, 18);
    doc.setFontSize(10);
    doc.text(`Periode: ${startDate} s/d ${endDate}`, 14, 26);
    autoTable(doc, {
      startY: 32,
      head: [head],
      body: rows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
    });
    doc.save(`${title.replace(/\s+/g, "-").toLowerCase()}-${startDate}_${endDate}.pdf`);
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "laba-rugi", label: "Laba Rugi", icon: TrendingUp },
    { id: "kas", label: "Laporan Kas", icon: Wallet },
    { id: "cashflow", label: "Cash Flow", icon: ArrowLeftRight },
    { id: "neraca", label: "Neraca", icon: Scale },
    { id: "hutang-piutang", label: "Hutang/Piutang", icon: BookOpen },
    { id: "beban", label: "Beban", icon: Plus },
  ];

  const Row = ({
    label,
    value,
    bold,
    muted,
  }: {
    label: string;
    value: string;
    bold?: boolean;
    muted?: boolean;
  }) => (
    <div
      className={`flex justify-between py-2 border-b border-slate-100 ${
        bold ? "font-semibold text-slate-900" : "text-slate-700"
      } ${muted ? "text-slate-400" : ""}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Laporan Keuangan</h1>
        <p className="text-slate-500 text-sm">
          Laba Rugi, Kas, Cash Flow, dan Neraca (berbasis penjualan, HPP & beban)
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Dari</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Sampai</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
        >
          Terapkan
        </button>
        {msg && <span className="text-sm text-emerald-600">{msg}</span>}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                tab === t.id
                  ? "border-primary-600 text-primary-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-slate-400 text-center py-12">Memuat...</p>
      ) : (
        <>
          {/* LABA RUGI */}
          {tab === "laba-rugi" && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 max-w-xl space-y-1">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-semibold text-lg">Laporan Laba Rugi</h2>
                <button
                  type="button"
                  className="text-xs flex items-center gap-1 text-primary-600"
                  onClick={() =>
                    exportPdf(
                      "Laporan Laba Rugi",
                      [
                        ["Pendapatan (DPP)", formatCurrency(pnl.revenue)],
                        ["HPP (COGS)", formatCurrency(pnl.cogs)],
                        ["Laba Kotor", formatCurrency(pnl.grossProfit)],
                        ["Beban Operasional", formatCurrency(pnl.expenses)],
                        ["Laba Bersih", formatCurrency(pnl.netProfit)],
                        ["PPN Dipungut", formatCurrency(pnl.taxCollected)],
                      ],
                      ["Keterangan", "Nominal"]
                    )
                  }
                >
                  <Download size={14} /> PDF
                </button>
              </div>
              <Row label="Pendapatan penjualan (DPP)" value={formatCurrency(pnl.revenue)} />
              <Row label="HPP (Harga Pokok Penjualan)" value={formatCurrency(pnl.cogs)} />
              <Row label="Laba Kotor" value={formatCurrency(pnl.grossProfit)} bold />
              <Row
                label={`Margin kotor`}
                value={`${pnl.marginGross.toFixed(1)}%`}
                muted
              />
              <Row label="Beban operasional" value={formatCurrency(pnl.expenses)} />
              <Row label="Laba (Rugi) Bersih" value={formatCurrency(pnl.netProfit)} bold />
              <Row
                label="Margin bersih"
                value={`${pnl.marginNet.toFixed(1)}%`}
                muted
              />
              <div className="pt-3 mt-2 border-t border-dashed">
                <Row
                  label="PPN dipungut (bukan pendapatan)"
                  value={formatCurrency(pnl.taxCollected)}
                  muted
                />
                <Row
                  label="Total transaksi"
                  value={String(salesAgg.count)}
                  muted
                />
              </div>
              <p className="text-xs text-slate-400 pt-3">
                HPP dihitung dari cost produk × qty. Isi field <strong>cost</strong> di
                master produk agar akurat.
              </p>
            </div>
          )}

          {/* LAPORAN KAS */}
          {tab === "kas" && (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-1">
                <h2 className="font-semibold text-lg mb-3">Penerimaan (periode)</h2>
                {Object.entries(cash.cashIn).map(([k, v]) => (
                  <Row key={k} label={k.toUpperCase()} value={formatCurrency(v)} />
                ))}
                <Row label="Total penerimaan" value={formatCurrency(cash.totalIn)} bold />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-1">
                <h2 className="font-semibold text-lg mb-3">Pengeluaran beban</h2>
                {Object.entries(cash.cashOut).map(([k, v]) =>
                  v > 0 ? (
                    <Row key={k} label={k.toUpperCase()} value={formatCurrency(v)} />
                  ) : null
                )}
                <Row label="Total pengeluaran" value={formatCurrency(cash.totalOut)} bold />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5 md:col-span-2 space-y-1">
                <h2 className="font-semibold text-lg mb-3">Posisi kas tunai</h2>
                <Row label="Saldo awal kas (setting)" value={formatCurrency(finance.opening_cash)} />
                <Row label="+ Penerimaan tunai (periode)" value={formatCurrency(cash.cashIn.cash || 0)} />
                <Row label="- Pengeluaran tunai (periode)" value={formatCurrency(cash.cashOut.cash || 0)} />
                <Row
                  label="Estimasi kas tunai (periode + awal)"
                  value={formatCurrency(cash.physicalCash)}
                  bold
                />
                <Row
                  label="Estimasi kas tunai kumulatif (semua waktu)"
                  value={formatCurrency(cashAllTime)}
                  bold
                />
              </div>
            </div>
          )}

          {/* CASH FLOW */}
          {tab === "cashflow" && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5 max-w-xl space-y-1">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="font-semibold text-lg">Laporan Arus Kas</h2>
                  <button
                    type="button"
                    className="text-xs flex items-center gap-1 text-primary-600"
                    onClick={() =>
                      exportPdf(
                        "Laporan Arus Kas",
                        [
                          ["Penerimaan operasional", formatCurrency(cf.operatingIn)],
                          ["Pengeluaran operasional", formatCurrency(cf.operatingOut)],
                          ["Arus kas operasi bersih", formatCurrency(cf.netOperating)],
                          ["Perubahan kas bersih", formatCurrency(cf.netChange)],
                        ],
                        ["Keterangan", "Nominal"]
                      )
                    }
                  >
                    <Download size={14} /> PDF
                  </button>
                </div>
                <p className="text-xs text-slate-500 mb-2 font-medium">Aktivitas Operasi</p>
                <Row label="Penerimaan dari pelanggan" value={formatCurrency(cf.operatingIn)} />
                <Row label="Pembayaran beban operasional" value={formatCurrency(cf.operatingOut)} />
                <Row label="Arus kas operasi bersih" value={formatCurrency(cf.netOperating)} bold />
                <div className="pt-2 mt-2 border-t">
                  <Row label="Kenaikan/(Penurunan) kas" value={formatCurrency(cf.netChange)} bold />
                </div>
                <p className="text-xs text-slate-400 pt-2">
                  Penjualan tempo tidak dihitung penerimaan kas sampai piutang dilunasi.
                </p>
              </div>

              {cfInsight && (
                <>
                  <div className="grid sm:grid-cols-4 gap-3">
                    <div className="bg-white rounded-xl border p-4">
                      <p className="text-xs text-slate-500">Total masuk</p>
                      <p className="text-lg font-bold text-emerald-600">
                        {formatCurrency(cfInsight.totalIn)}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border p-4">
                      <p className="text-xs text-slate-500">Total keluar</p>
                      <p className="text-lg font-bold text-red-600">
                        {formatCurrency(cfInsight.totalOut)}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border p-4">
                      <p className="text-xs text-slate-500">Net periode</p>
                      <p className={`text-lg font-bold ${cfInsight.netPeriod >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {formatCurrency(cfInsight.netPeriod)}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border p-4">
                      <p className="text-xs text-slate-500">Proyeksi kas 30 hari</p>
                      <p className={`text-lg font-bold ${cfInsight.projectedCash30d >= 0 ? "text-primary-600" : "text-red-600"}`}>
                        {formatCurrency(cfInsight.projectedCash30d)}
                      </p>
                    </div>
                  </div>

                  {cfInsight.alerts.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
                      <p className="text-sm font-semibold text-amber-800">Analisis & peringatan</p>
                      {cfInsight.alerts.map((a, i) => (
                        <p key={i} className="text-sm text-amber-900">• {a}</p>
                      ))}
                      <p className="text-xs text-amber-700 pt-1">
                        Rata-rata net harian: {formatCurrency(cfInsight.avgDailyNet)}
                      </p>
                    </div>
                  )}

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-white rounded-xl border p-4">
                      <h3 className="font-semibold text-sm mb-2">Piutang jatuh tempo ≤ 30 hari</h3>
                      {cfInsight.dueReceivables30.length === 0 ? (
                        <p className="text-xs text-slate-400">Tidak ada</p>
                      ) : (
                        <ul className="text-sm space-y-1">
                          {cfInsight.dueReceivables30.slice(0, 8).map((d, i) => (
                            <li key={i} className="flex justify-between gap-2">
                              <span className="truncate">{d.contact} ({d.days}h)</span>
                              <span className="font-medium">{formatCurrency(d.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="bg-white rounded-xl border p-4">
                      <h3 className="font-semibold text-sm mb-2">Hutang jatuh tempo ≤ 30 hari</h3>
                      {cfInsight.duePayables30.length === 0 ? (
                        <p className="text-xs text-slate-400">Tidak ada</p>
                      ) : (
                        <ul className="text-sm space-y-1">
                          {cfInsight.duePayables30.slice(0, 8).map((d, i) => (
                            <li key={i} className="flex justify-between gap-2">
                              <span className="truncate">{d.contact} ({d.days}h)</span>
                              <span className="font-medium">{formatCurrency(d.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="px-4 py-2 border-b bg-slate-50 flex justify-between items-center">
                      <h3 className="font-semibold text-sm">Arus kas harian (periode)</h3>
                      <button
                        type="button"
                        className="text-xs text-emerald-700"
                        onClick={() => {
                          if (!cfInsight) return;
                          downloadExcel(`arus-kas-${startDate}_${endDate}`, [
                            {
                              name: "Arus Kas Harian",
                              headers: ["Tanggal", "Masuk", "Keluar", "Net", "Kumulatif"],
                              rows: cfInsight.series.map((p) => [
                                p.date,
                                p.inflow,
                                p.outflow,
                                p.net,
                                p.cumulative,
                              ]),
                            },
                          ]);
                        }}
                      >
                        Export Excel
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2">Tanggal</th>
                            <th className="text-right px-3 py-2">Masuk</th>
                            <th className="text-right px-3 py-2">Keluar</th>
                            <th className="text-right px-3 py-2">Net</th>
                            <th className="text-right px-3 py-2">Kumulatif</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cfInsight.series.map((p) => (
                            <tr key={p.date} className="border-t border-slate-100">
                              <td className="px-3 py-1.5">{p.date}</td>
                              <td className="px-3 py-1.5 text-right text-emerald-600">
                                {p.inflow ? formatCurrency(p.inflow) : "-"}
                              </td>
                              <td className="px-3 py-1.5 text-right text-red-600">
                                {p.outflow ? formatCurrency(p.outflow) : "-"}
                              </td>
                              <td className={`px-3 py-1.5 text-right font-medium ${p.net >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                                {formatCurrency(p.net)}
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                {formatCurrency(p.cumulative)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* NERACA */}
          {tab === "neraca" && (
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-1">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="font-semibold text-lg">Aset</h2>
                  <button
                    type="button"
                    onClick={() => {
                      const totalAset = neraca.assets.cash + neraca.assets.inventory + piutangOpen;
                      const totalLiab = hutangOpen;
                      const totalEq = neraca.equity.total;
                      downloadExcel(`neraca-${startDate}_${endDate}`, [
                        {
                          name: "Neraca",
                          headers: ["Pos", "Nominal"],
                          rows: [
                            ["Kas & setara kas", neraca.assets.cash],
                            ["Piutang usaha", piutangOpen],
                            ["Persediaan", neraca.assets.inventory],
                            ["Total Aset", totalAset],
                            ["Hutang usaha", hutangOpen],
                            ["Total Kewajiban", totalLiab],
                            ["Modal awal", neraca.equity.capital],
                            ["Laba ditahan", neraca.equity.retained],
                            ["Total Ekuitas", totalEq],
                            ["Total Kewajiban + Ekuitas", totalLiab + totalEq],
                          ],
                        },
                      ]);
                    }}
                    className="text-xs flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg"
                  >
                    <FileSpreadsheet size={14} /> Export Excel
                  </button>
                </div>
                <Row label="Kas & setara kas" value={formatCurrency(neraca.assets.cash)} />
                <Row label="Piutang usaha" value={formatCurrency(piutangOpen)} />
                <Row label="Persediaan (stok × cost)" value={formatCurrency(neraca.assets.inventory)} />
                <Row
                  label="Total Aset"
                  value={formatCurrency(neraca.assets.cash + neraca.assets.inventory + piutangOpen)}
                  bold
                />
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-1">
                <h2 className="font-semibold text-lg mb-3">Kewajiban & Ekuitas</h2>
                <Row label="Hutang usaha" value={formatCurrency(hutangOpen)} />
                <Row label="Total Kewajiban" value={formatCurrency(hutangOpen)} bold />
                <Row label="Modal awal" value={formatCurrency(neraca.equity.capital)} />
                <Row label="Laba ditahan (kumulatif)" value={formatCurrency(neraca.equity.retained)} />
                <Row label="Total Ekuitas" value={formatCurrency(neraca.equity.total)} bold />
                <Row
                  label="Total Kewajiban + Ekuitas"
                  value={formatCurrency(hutangOpen + neraca.equity.total)}
                  bold
                />
                <p className="text-xs text-slate-400 pt-2">
                  Piutang & hutang dari menu Hutang/Piutang. Export Excel untuk laporan formal.
                </p>
              </div>

              {isAdmin && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 md:col-span-2 space-y-3">
                  <h3 className="font-semibold">Saldo awal (Admin)</h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500">Kas awal</label>
                      <input
                        type="number"
                        value={finance.opening_cash}
                        onChange={(e) =>
                          setFinance({
                            ...finance,
                            opening_cash: Number(e.target.value) || 0,
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Modal awal</label>
                      <input
                        type="number"
                        value={finance.opening_equity}
                        onChange={(e) =>
                          setFinance({
                            ...finance,
                            opening_equity: Number(e.target.value) || 0,
                          })
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={saveOpening}
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm"
                  >
                    Simpan saldo awal
                  </button>
                </div>
              )}
            </div>
          )}

          {/* HUTANG PIUTANG */}
          {tab === "hutang-piutang" && <DebtClient profile={profile} />}

          {/* BEBAN */}
          {tab === "beban" && (
            <div className="space-y-4">
              {isAdmin && (
                <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                  <h2 className="font-semibold">Tambah Beban</h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <input
                      type="date"
                      value={expDate}
                      onChange={(e) => setExpDate(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                    <select
                      value={expCat}
                      onChange={(e) => setExpCat(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    >
                      {PRESET_EXPENSE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <input
                      value={expDesc}
                      onChange={(e) => setExpDesc(e.target.value)}
                      placeholder="Keterangan"
                      className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                    <input
                      type="number"
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      placeholder="Nominal"
                      className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    />
                    <select
                      value={expMethod}
                      onChange={(e) => setExpMethod(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-300 text-sm"
                    >
                      <option value="cash">Tunai</option>
                      <option value="transfer">Transfer</option>
                      <option value="qris">QRIS</option>
                      <option value="card">Kartu</option>
                      <option value="other">Lainnya</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={expSaving}
                    onClick={addExpense}
                    className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {expSaving ? "Menyimpan..." : "Simpan Beban"}
                  </button>
                </div>
              )}

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="text-left px-4 py-3">Tanggal</th>
                      <th className="text-left px-4 py-3">Kategori</th>
                      <th className="text-left px-4 py-3">Keterangan</th>
                      <th className="text-left px-4 py-3">Metode</th>
                      <th className="text-right px-4 py-3">Nominal</th>
                      {isAdmin && <th className="px-4 py-3" />}
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="text-center py-8 text-slate-400"
                        >
                          Belum ada beban di periode ini
                        </td>
                      </tr>
                    ) : (
                      expenses.map((e) => (
                        <tr key={e.id} className="border-t border-slate-100">
                          <td className="px-4 py-2.5">
                            {formatDateShort(e.expense_date)}
                          </td>
                          <td className="px-4 py-2.5">{e.category}</td>
                          <td className="px-4 py-2.5">{e.description || "-"}</td>
                          <td className="px-4 py-2.5 capitalize">{e.payment_method}</td>
                          <td className="px-4 py-2.5 text-right font-medium">
                            {formatCurrency(e.amount)}
                          </td>
                          {isAdmin && (
                            <td className="px-4 py-2.5">
                              <button
                                type="button"
                                onClick={() => deleteExpense(e.id)}
                                className="text-red-500 hover:bg-red-50 p-1 rounded"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <div className="px-4 py-3 border-t bg-slate-50 flex justify-between text-sm font-semibold">
                  <span>Total beban periode</span>
                  <span>{formatCurrency(expensesTotal)}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
