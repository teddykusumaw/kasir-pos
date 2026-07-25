/**
 * Analisis & proyeksi arus kas
 */

export interface DailyCashPoint {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
  cumulative: number;
}

export interface DueItem {
  kind: "piutang" | "hutang";
  contact: string;
  amount: number;
  due_date: string;
  days: number;
}

export interface CashFlowInsight {
  series: DailyCashPoint[];
  totalIn: number;
  totalOut: number;
  netPeriod: number;
  avgDailyNet: number;
  /** Proyeksi kas = currentCash + piutang jatuh tempo 30h - hutang jatuh tempo 30h */
  projectedCash30d: number;
  dueReceivables30: DueItem[];
  duePayables30: DueItem[];
  alerts: string[];
}

function daysBetween(from: string, to: string) {
  const a = new Date(from);
  const b = new Date(to);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function buildCashFlowSeries(
  startDate: string,
  endDate: string,
  inflows: { date: string; amount: number }[],
  outflows: { date: string; amount: number }[],
  openingCash: number
): DailyCashPoint[] {
  const map: Record<string, { in: number; out: number }> = {};
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    map[key] = { in: 0, out: 0 };
  }
  for (const x of inflows) {
    const k = x.date.slice(0, 10);
    if (map[k]) map[k].in += x.amount;
  }
  for (const x of outflows) {
    const k = x.date.slice(0, 10);
    if (map[k]) map[k].out += x.amount;
  }
  let cum = openingCash;
  const series: DailyCashPoint[] = [];
  for (const date of Object.keys(map).sort()) {
    const net = map[date].in - map[date].out;
    cum += net;
    series.push({
      date,
      inflow: map[date].in,
      outflow: map[date].out,
      net,
      cumulative: cum,
    });
  }
  return series;
}

export function analyzeCashFlow(params: {
  series: DailyCashPoint[];
  currentCash: number;
  receivables: { contact_name: string; amount: number; amount_paid: number; due_date: string | null; status: string }[];
  payables: { contact_name: string; amount: number; amount_paid: number; due_date: string | null; status: string }[];
  today?: string;
}): CashFlowInsight {
  const today = params.today || new Date().toISOString().slice(0, 10);
  const totalIn = params.series.reduce((s, p) => s + p.inflow, 0);
  const totalOut = params.series.reduce((s, p) => s + p.outflow, 0);
  const netPeriod = totalIn - totalOut;
  const days = Math.max(1, params.series.length);
  const avgDailyNet = netPeriod / days;

  const dueReceivables30: DueItem[] = [];
  const duePayables30: DueItem[] = [];
  let recvDue = 0;
  let payDue = 0;

  for (const r of params.receivables) {
    if (r.status === "paid" || r.status === "cancelled") continue;
    const rem = Math.max(0, r.amount - r.amount_paid);
    if (!rem || !r.due_date) continue;
    const d = daysBetween(today, r.due_date);
    if (d >= 0 && d <= 30) {
      dueReceivables30.push({
        kind: "piutang",
        contact: r.contact_name,
        amount: rem,
        due_date: r.due_date,
        days: d,
      });
      recvDue += rem;
    }
  }
  for (const p of params.payables) {
    if (p.status === "paid" || p.status === "cancelled") continue;
    const rem = Math.max(0, p.amount - p.amount_paid);
    if (!rem || !p.due_date) continue;
    const d = daysBetween(today, p.due_date);
    if (d >= 0 && d <= 30) {
      duePayables30.push({
        kind: "hutang",
        contact: p.contact_name,
        amount: rem,
        due_date: p.due_date,
        days: d,
      });
      payDue += rem;
    }
  }

  dueReceivables30.sort((a, b) => a.days - b.days);
  duePayables30.sort((a, b) => a.days - b.days);

  const projectedCash30d = params.currentCash + recvDue - payDue;

  const alerts: string[] = [];
  if (netPeriod < 0) alerts.push("Arus kas periode ini negatif (pengeluaran > penerimaan).");
  if (projectedCash30d < 0)
    alerts.push("Proyeksi kas 30 hari ke depan negatif — prioritaskan penagihan piutang.");
  if (params.currentCash < payDue)
    alerts.push("Kas saat ini lebih kecil dari hutang yang jatuh tempo 30 hari.");
  const overduePay = duePayables30.filter((x) => x.days === 0);
  const overdueRecv = dueReceivables30.filter((x) => x.days === 0);
  if (overduePay.length) alerts.push(`${overduePay.length} hutang jatuh tempo hari ini.`);
  if (overdueRecv.length) alerts.push(`${overdueRecv.length} piutang jatuh tempo hari ini.`);
  if (avgDailyNet < 0)
    alerts.push(`Rata-rata kas harian ${avgDailyNet.toFixed(0)} (defisit) — tinjau beban.`);

  return {
    series: params.series,
    totalIn,
    totalOut,
    netPeriod,
    avgDailyNet,
    projectedCash30d,
    dueReceivables30,
    duePayables30,
    alerts,
  };
}
