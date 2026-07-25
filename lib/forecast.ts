/**
 * Forecast restock — akurasi ditingkatkan:
 * - Exponential smoothing (bobot penjualan terbaru lebih besar)
 * - Tren (regresi linear sederhana per minggu)
 * - Frekuensi & recency stockout
 * - Safety stock (z * σ demand)
 * - Lead time + review period
 */

export interface DailySalePoint {
  date: string; // YYYY-MM-DD
  qty: number;
}

export interface ProductSalesStat {
  product_id: string;
  product_name: string;
  stock: number;
  min_stock: number;
  /** qty per hari (urutan kronologis, termasuk 0) */
  daily: DailySalePoint[];
  /** timestamp stockout dalam jendela */
  stockout_dates: string[];
  days_window: number;
}

export interface RestockRecommendation {
  product_id: string;
  product_name: string;
  stock: number;
  min_stock: number;
  avg_daily_sales: number;
  /** demand forecast harian (smoothed + trend) */
  forecast_daily: number;
  days_of_cover: number | null;
  stockout_count: number;
  stockout_score: number;
  suggested_qty: number;
  safety_stock: number;
  priority: "critical" | "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  reason: string;
}

function mean(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdev(arr: number[]) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

/** Exponential smoothing — alpha lebih besar = lebih reaktif ke data baru */
function expSmooth(values: number[], alpha = 0.3): number {
  if (!values.length) return 0;
  let s = values[0];
  for (let i = 1; i < values.length; i++) {
    s = alpha * values[i] + (1 - alpha) * s;
  }
  return s;
}

/**
 * Tren linear sederhana pada agregat mingguan.
 * Return slope per hari (approx slope_mingguan / 7).
 */
function dailyTrend(dailyQty: number[]): number {
  if (dailyQty.length < 14) return 0;
  const weeks: number[] = [];
  for (let i = 0; i + 7 <= dailyQty.length; i += 7) {
    weeks.push(dailyQty.slice(i, i + 7).reduce((a, b) => a + b, 0));
  }
  if (weeks.length < 2) return 0;
  const n = weeks.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += weeks[i];
    sumXY += i * weeks[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  const slopeWeek = (n * sumXY - sumX * sumY) / denom;
  return slopeWeek / 7; // per hari
}

/**
 * Skor stockout 0–1: frekuensi + seberapa baru event terakhir
 */
function stockoutScore(dates: string[], windowDays: number, today: string): number {
  if (!dates.length) return 0;
  const freq = Math.min(1, dates.length / Math.max(3, windowDays / 10));
  const sorted = [...dates].sort();
  const last = sorted[sorted.length - 1];
  const daysSince =
    (new Date(today).getTime() - new Date(last).getTime()) / 86400000;
  const recency = Math.max(0, 1 - daysSince / windowDays);
  return Math.min(1, 0.55 * freq + 0.45 * recency);
}

export function buildRestockForecast(
  stats: ProductSalesStat[],
  options?: {
    coverDays?: number;
    leadTimeDays?: number;
    serviceLevelZ?: number;
    smoothAlpha?: number;
  }
): RestockRecommendation[] {
  const coverDays = options?.coverDays ?? 14;
  const leadTime = options?.leadTimeDays ?? 3;
  const z = options?.serviceLevelZ ?? 1.65; // ~95%
  const alpha = options?.smoothAlpha ?? 0.35;
  const today = new Date().toISOString().slice(0, 10);
  const recs: RestockRecommendation[] = [];

  for (const s of stats) {
    const qtySeries = s.daily.map((d) => d.qty);
    const simpleAvg = mean(qtySeries);
    const smoothed = expSmooth(qtySeries, alpha);
    const trend = dailyTrend(qtySeries);
    // Forecast harian: smoothing + setengah tren ke depan (anti overshoot)
    let forecastDaily = Math.max(0, smoothed + trend * 0.5);
    // Blend dengan simple avg agar stabil jika data sedikit
    if (qtySeries.filter((q) => q > 0).length < 5) {
      forecastDaily = 0.6 * simpleAvg + 0.4 * forecastDaily;
    }

    const sigma = stdev(qtySeries);
    // Safety stock untuk lead time + review (cover sebagai review period proxy)
    const horizon = leadTime + Math.min(7, coverDays / 2);
    const safety = Math.ceil(z * sigma * Math.sqrt(Math.max(1, horizon)));

    const soScore = stockoutScore(s.stockout_dates, s.days_window, today);
    // Extra buffer jika sering/baru sold-out
    const stockoutBuffer = Math.ceil(soScore * Math.max(forecastDaily, 0.5) * coverDays * 0.35);

    const demandCover = Math.ceil(forecastDaily * coverDays);
    const demandLead = Math.ceil(forecastDaily * leadTime);
    let suggested = Math.max(
      0,
      demandCover + demandLead + safety + stockoutBuffer - s.stock
    );

    if (s.stock <= s.min_stock) {
      suggested = Math.max(
        suggested,
        s.min_stock - s.stock + Math.ceil(forecastDaily * 7) + safety
      );
    }
    if (s.stock === 0) {
      suggested = Math.max(
        suggested,
        Math.ceil(forecastDaily * coverDays) + safety + stockoutBuffer ||
          s.min_stock ||
          10
      );
    }

    const daysOfCover =
      forecastDaily > 0 ? s.stock / forecastDaily : s.stock > 0 ? null : 0;

    // Confidence: banyak hari berjualan & stabilitas
    const nonzero = qtySeries.filter((q) => q > 0).length;
    let confidence: RestockRecommendation["confidence"] = "low";
    if (nonzero >= 12 && sigma / (simpleAvg || 1) < 1.5) confidence = "high";
    else if (nonzero >= 5) confidence = "medium";

    let priority: RestockRecommendation["priority"] = "low";
    let reason = "Stok relatif aman vs forecast.";

    if (s.stock === 0) {
      priority = "critical";
      reason = `Sold-out. Forecast ${forecastDaily.toFixed(2)}/hari, safety ${safety}.`;
    } else if (soScore >= 0.55 && forecastDaily > 0) {
      priority = "high";
      reason = `Pola sold-out kuat (skor ${(soScore * 100).toFixed(0)}%). Buffer ditambah.`;
    } else if (daysOfCover !== null && daysOfCover < leadTime + 3) {
      priority = "high";
      reason = `Cover ~${daysOfCover.toFixed(1)} hari < lead time + buffer.`;
    } else if (s.stock <= s.min_stock || (daysOfCover !== null && daysOfCover < coverDays)) {
      priority = "medium";
      reason =
        s.stock <= s.min_stock
          ? "Di bawah stok minimum."
          : `Cover di bawah target ${coverDays} hari.`;
    } else if (trend > 0.05 * (simpleAvg || 0.1)) {
      priority = "medium";
      reason = "Tren penjualan naik — antisipasi demand.";
      suggested = Math.max(suggested, Math.ceil(trend * coverDays));
    }

    if (suggested <= 0 && priority === "low") continue;

    recs.push({
      product_id: s.product_id,
      product_name: s.product_name,
      stock: s.stock,
      min_stock: s.min_stock,
      avg_daily_sales: Math.round(simpleAvg * 100) / 100,
      forecast_daily: Math.round(forecastDaily * 100) / 100,
      days_of_cover: daysOfCover === null ? null : Math.round(daysOfCover * 10) / 10,
      stockout_count: s.stockout_dates.length,
      stockout_score: Math.round(soScore * 100) / 100,
      suggested_qty: suggested,
      safety_stock: safety,
      priority,
      confidence,
      reason,
    });
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  return recs.sort(
    (a, b) =>
      order[a.priority] - order[b.priority] ||
      b.stockout_score - a.stockout_score ||
      b.suggested_qty - a.suggested_qty
  );
}

export function formatRestockWhatsAppMessage(
  recs: RestockRecommendation[],
  storeName?: string
) {
  const top = recs
    .filter((r) => r.priority === "critical" || r.priority === "high")
    .slice(0, 10);
  if (!top.length) return null;
  const lines = [
    `*${storeName || "Kasir POS"} — Alert Restock*`,
    `Tanggal: ${new Date().toLocaleString("id-ID")}`,
    "",
    ...top.map(
      (r, i) =>
        `${i + 1}. *${r.product_name}*\n` +
        `   Stok: ${r.stock} | Forecast: ${r.forecast_daily}/hari\n` +
        `   Saran: +${r.suggested_qty} (safety ${r.safety_stock})\n` +
        `   ${r.reason}`
    ),
    "",
    "_Forecast: exponential smoothing + tren + stockout score._",
  ];
  return lines.join("\n");
}

/** Bangun deret harian lengkap (isi 0 di hari tanpa penjualan) */
export function fillDailySeries(
  startDate: string,
  endDate: string,
  points: { date: string; qty: number }[]
): DailySalePoint[] {
  const map: Record<string, number> = {};
  for (const p of points) {
    const k = p.date.slice(0, 10);
    map[k] = (map[k] || 0) + p.qty;
  }
  const out: DailySalePoint[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, qty: map[key] || 0 });
  }
  return out;
}
