"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  buildRestockForecast,
  formatRestockWhatsAppMessage,
  fillDailySeries,
  type ProductSalesStat,
  type RestockRecommendation,
} from "@/lib/forecast";
import { fetchWhatsAppSettings, sendWhatsApp } from "@/lib/whatsapp";
import {
  fetchTelegramSettings,
  sendTelegram,
  toTelegramHtml,
} from "@/lib/telegram";
import { notifyRestock } from "@/lib/notify";
import { Profile } from "@/types/database";
import { Bell, RefreshCw, MessageCircle, Send } from "lucide-react";

export default function ForecastClient({ profile }: { profile: Profile }) {
  const [recs, setRecs] = useState<RestockRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [coverDays, setCoverDays] = useState(14);
  const [leadTime, setLeadTime] = useState(3);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    const { data: products } = await supabase
      .from("products")
      .select("id, name, stock, min_stock")
      .or("status.eq.active,status.is.null");

    const { data: sales } = await supabase
      .from("sales")
      .select("id, created_at")
      .gte("created_at", start.toISOString());
    const saleIds = (sales || []).map((s) => s.id);
    const saleDate: Record<string, string> = {};
    for (const s of sales || []) {
      saleDate[s.id] = s.created_at.slice(0, 10);
    }

    // product -> list of {date, qty}
    const raw: Record<string, { date: string; qty: number }[]> = {};
    for (let i = 0; i < saleIds.length; i += 80) {
      const chunk = saleIds.slice(i, i + 80);
      if (!chunk.length) break;
      const { data: items } = await supabase
        .from("sale_items")
        .select("product_id, quantity, sale_id")
        .in("sale_id", chunk);
      for (const it of items || []) {
        const d = saleDate[it.sale_id] || startStr;
        if (!raw[it.product_id]) raw[it.product_id] = [];
        raw[it.product_id].push({ date: d, qty: Number(it.quantity) });
      }
    }

    const { data: stockouts } = await supabase
      .from("stockout_events")
      .select("product_id, occurred_at")
      .gte("occurred_at", start.toISOString());
    const soMap: Record<string, string[]> = {};
    for (const e of stockouts || []) {
      if (!soMap[e.product_id]) soMap[e.product_id] = [];
      soMap[e.product_id].push(String(e.occurred_at).slice(0, 10));
    }

    const stats: ProductSalesStat[] = (products || []).map((p: any) => ({
      product_id: p.id,
      product_name: p.name,
      stock: Number(p.stock),
      min_stock: Number(p.min_stock || 5),
      daily: fillDailySeries(startStr, endStr, raw[p.id] || []),
      stockout_dates: soMap[p.id] || [],
      days_window: days,
    }));

    setRecs(
      buildRestockForecast(stats, {
        coverDays,
        leadTimeDays: leadTime,
        serviceLevelZ: 1.65,
        smoothAlpha: 0.35,
      })
    );
    setLoading(false);
  }, [days, coverDays, leadTime, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const sendWa = async () => {
    setSending(true);
    setMsg("");
    const wa = await fetchWhatsAppSettings(supabase);
    if (!wa.notify_restock) {
      setMsg("Notifikasi restock nonaktif di pengaturan WhatsApp");
      setSending(false);
      return;
    }
    const text = formatRestockWhatsAppMessage(recs, "Kasir POS");
    if (!text) {
      setMsg("Tidak ada item prioritas critical/high");
      setSending(false);
      return;
    }
    const result = await sendWhatsApp(wa, text);
    setSending(false);
    if (result.success) {
      if (result.link) {
        window.open(result.link, "_blank");
        setMsg("Mode link: WhatsApp dibuka");
      } else setMsg("WhatsApp Business API: pesan terkirim");
    } else if (result.link) {
      window.open(result.link, "_blank");
      setMsg((result.error || "Gagal API") + " — fallback wa.me");
    } else setMsg(result.error || "Gagal kirim");
  };

  
  const sendTg = async () => {
    setSending(true);
    setMsg("");
    const tg = await fetchTelegramSettings(supabase);
    if (!tg.notify_restock) {
      setMsg("Notifikasi restock Telegram nonaktif di pengaturan");
      setSending(false);
      return;
    }
    const text = formatRestockWhatsAppMessage(recs, "Kasir POS");
    if (!text) {
      setMsg("Tidak ada item prioritas critical/high");
      setSending(false);
      return;
    }
    const result = await sendTelegram(
      { ...tg, enabled: true },
      toTelegramHtml(text)
    );
    setSending(false);
    setMsg(
      result.success
        ? "Notifikasi Telegram terkirim"
        : result.error || "Gagal kirim Telegram"
    );
  };


  const sendAll = async () => {
    setSending(true);
    setMsg("");
    const text = formatRestockWhatsAppMessage(recs, "Kasir POS");
    if (!text) {
      setMsg("Tidak ada item prioritas critical/high");
      setSending(false);
      return;
    }
    const r = await notifyRestock(text);
    const parts: string[] = [];
    if (r.whatsapp.success) parts.push("WA OK");
    else if (r.whatsapp.link) {
      window.open(r.whatsapp.link!, "_blank");
      parts.push("WA link dibuka");
    } else parts.push("WA: " + (r.whatsapp.error || "skip"));
    if (r.telegram.success) parts.push("Telegram OK");
    else parts.push("TG: " + (r.telegram.error || "skip"));
    setSending(false);
    setMsg(parts.join(" · "));
  };

const badge = (p: RestockRecommendation["priority"]) => {
    const map = {
      critical: "bg-red-100 text-red-700",
      high: "bg-orange-100 text-orange-700",
      medium: "bg-amber-100 text-amber-700",
      low: "bg-slate-100 text-slate-600",
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[p]}`}>
        {p}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bell size={18} /> Forecast Restock
          </h2>
          <p className="text-xs text-slate-500">
            Exponential smoothing + tren + safety stock + skor sold-out
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="text-xs text-slate-500">Analisa (hari)</label>
            <input
              type="number"
              min={14}
              max={90}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 30)}
              className="block w-20 px-2 py-1.5 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Cover (hari)</label>
            <input
              type="number"
              min={7}
              max={60}
              value={coverDays}
              onChange={(e) => setCoverDays(Number(e.target.value) || 14)}
              className="block w-20 px-2 py-1.5 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Lead time</label>
            <input
              type="number"
              min={1}
              max={30}
              value={leadTime}
              onChange={(e) => setLeadTime(Number(e.target.value) || 3)}
              className="block w-20 px-2 py-1.5 border rounded-lg text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="px-3 py-1.5 rounded-lg border text-sm flex items-center gap-1"
          >
            <RefreshCw size={14} /> Muat
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={sendWa}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm flex items-center gap-1 disabled:opacity-50"
          >
            <MessageCircle size={14} />
            {sending ? "Mengirim..." : "Kirim WA"}
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={sendTg}
            className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-sm flex items-center gap-1 disabled:opacity-50"
          >
            <Send size={14} />
            {sending ? "Mengirim..." : "Kirim Telegram"}
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={sendAll}
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm flex items-center gap-1 disabled:opacity-50"
          >
            <Bell size={14} />
            {sending ? "Mengirim..." : "Kirim Semua"}
          </button>
        </div>
      </div>

      {msg && (
        <p className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{msg}</p>
      )}

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Produk</th>
              <th className="text-right px-3 py-2">Stok</th>
              <th className="text-right px-3 py-2">Avg</th>
              <th className="text-right px-3 py-2">Forecast</th>
              <th className="text-right px-3 py-2">Cover</th>
              <th className="text-right px-3 py-2">Safety</th>
              <th className="text-right px-3 py-2">SO skor</th>
              <th className="text-right px-3 py-2">Saran</th>
              <th className="text-left px-3 py-2">Prioritas</th>
              <th className="text-left px-3 py-2">Confidence</th>
              <th className="text-left px-3 py-2">Alasan</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="text-center py-8 text-slate-400">
                  Menganalisis deret harian...
                </td>
              </tr>
            ) : recs.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-8 text-slate-400">
                  Tidak ada rekomendasi
                </td>
              </tr>
            ) : (
              recs.map((r) => (
                <tr key={r.product_id} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.product_name}</td>
                  <td className="px-3 py-2 text-right">{r.stock}</td>
                  <td className="px-3 py-2 text-right">{r.avg_daily_sales}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {r.forecast_daily}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.days_of_cover === null ? "∞" : r.days_of_cover}
                  </td>
                  <td className="px-3 py-2 text-right">{r.safety_stock}</td>
                  <td className="px-3 py-2 text-right">
                    {(r.stockout_score * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-primary-600">
                    +{r.suggested_qty}
                  </td>
                  <td className="px-3 py-2">{badge(r.priority)}</td>
                  <td className="px-3 py-2 text-xs capitalize">{r.confidence}</td>
                  <td className="px-3 py-2 text-xs text-slate-500 max-w-[220px]">
                    {r.reason}
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
