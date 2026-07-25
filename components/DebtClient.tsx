"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { Profile } from "@/types/database";
import { Plus, Trash2, Zap } from "lucide-react";
import { allocatePaymentFifo, remaining as remDebt } from "@/lib/debtAuto";

type Kind = "receivables" | "payables";
type Status = "open" | "partial" | "paid" | "cancelled";

interface DebtRow {
  id: string;
  contact_name: string;
  description: string;
  amount: number;
  amount_paid: number;
  due_date: string | null;
  status: Status;
}

function remaining(r: DebtRow) {
  return Math.max(0, r.amount - r.amount_paid);
}

function deriveStatus(amount: number, paid: number): Status {
  if (paid <= 0) return "open";
  if (paid >= amount) return "paid";
  return "partial";
}

export default function DebtClient({ profile }: { profile: Profile }) {
  const [kind, setKind] = useState<Kind>("receivables");
  const [rows, setRows] = useState<DebtRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [due, setDue] = useState("");
  const [payId, setPayId] = useState<string | null>(null);
  const [payAmt, setPayAmt] = useState("");
  const [msg, setMsg] = useState("");
  const [autoContact, setAutoContact] = useState("");
  const [autoAmount, setAutoAmount] = useState("");
  const [autoLoading, setAutoLoading] = useState(false);
  const supabase = createClient();
  const isAdmin = profile.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from(kind)
      .select("*")
      .order("created_at", { ascending: false });
    setRows(
      (data || []).map((r: any) => ({
        id: r.id,
        contact_name: r.contact_name,
        description: r.description,
        amount: Number(r.amount),
        amount_paid: Number(r.amount_paid),
        due_date: r.due_date,
        status: r.status,
      }))
    );
    setLoading(false);
  }, [kind, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const openTotal = rows
    .filter((r) => r.status === "open" || r.status === "partial")
    .reduce((s, r) => s + remaining(r), 0);

  const add = async () => {
    if (!isAdmin) return;
    const amt = Number(amount);
    if (!name.trim() || !amt || amt <= 0) {
      setMsg("Nama & nominal wajib");
      return;
    }
    const { error } = await supabase.from(kind).insert({
      contact_name: name.trim(),
      description: desc.trim(),
      amount: amt,
      amount_paid: 0,
      due_date: due || null,
      status: "open",
      created_by: profile.id,
    });
    if (error) setMsg(error.message);
    else {
      setName("");
      setDesc("");
      setAmount("");
      setDue("");
      setMsg("Tersimpan");
      load();
    }
  };

  const recordPayment = async () => {
    if (!isAdmin || !payId) return;
    const row = rows.find((r) => r.id === payId);
    if (!row) return;
    const addPay = Number(payAmt);
    if (!addPay || addPay <= 0) return;
    const newPaid = Math.min(row.amount, row.amount_paid + addPay);
    const status = deriveStatus(row.amount, newPaid);
    const { error } = await supabase
      .from(kind)
      .update({
        amount_paid: newPaid,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payId);
    if (error) setMsg(error.message);
    else {
      setPayId(null);
      setPayAmt("");
      setMsg("Pembayaran dicatat");
      load();
    }
  };

  const remove = async (id: string) => {
    if (!isAdmin || !confirm("Hapus?")) return;
    await supabase.from(kind).delete().eq("id", id);
    load();
  };

  const autoSettleFifo = async () => {
    if (!isAdmin) return;
    const pay = Number(autoAmount);
    if (!autoContact.trim() || !pay || pay <= 0) {
      setMsg("Isi nama kontak & nominal pelunasan");
      return;
    }
    setAutoLoading(true);
    const open = rows.filter(
      (r) =>
        r.contact_name.toLowerCase() === autoContact.trim().toLowerCase() &&
        (r.status === "open" || r.status === "partial")
    );
    if (!open.length) {
      setMsg("Tidak ada tagihan terbuka untuk kontak ini");
      setAutoLoading(false);
      return;
    }
    const updates = allocatePaymentFifo(
      open.map((r) => ({
        id: r.id,
        contact_name: r.contact_name,
        amount: r.amount,
        amount_paid: r.amount_paid,
        status: r.status,
        due_date: r.due_date,
      })),
      pay
    );
    for (const u of updates) {
      await supabase
        .from(kind)
        .update({
          amount_paid: u.amount_paid,
          status: u.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", u.id);
    }
    setAutoLoading(false);
    setAutoAmount("");
    setMsg(
      `Pelunasan otomatis: ${updates.length} tagihan diupdate (FIFO jatuh tempo)`
    );
    load();
  };

  const statusBadge = (s: Status) => {
    const map: Record<Status, string> = {
      open: "bg-amber-100 text-amber-700",
      partial: "bg-blue-100 text-blue-700",
      paid: "bg-emerald-100 text-emerald-700",
      cancelled: "bg-slate-200 text-slate-600",
    };
    const label: Record<Status, string> = {
      open: "Belum lunas",
      partial: "Sebagian",
      paid: "Lunas",
      cancelled: "Batal",
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[s]}`}>
        {label[s]}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setKind("receivables")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              kind === "receivables" ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            Piutang
          </button>
          <button
            type="button"
            onClick={() => setKind("payables")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              kind === "payables" ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            Hutang
          </button>
        </div>
        <div className="text-sm">
          Sisa {kind === "receivables" ? "piutang" : "hutang"}:{" "}
          <strong className="text-primary-600">{formatCurrency(openTotal)}</strong>
        </div>
      </div>

      {msg && <p className="text-sm text-emerald-600">{msg}</p>}

      {isAdmin && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <h3 className="font-semibold text-sm">
            Tambah {kind === "receivables" ? "Piutang" : "Hutang"}
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "receivables" ? "Nama pelanggan" : "Nama supplier"}
              className="px-3 py-2 rounded-lg border text-sm"
            />
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Keterangan"
              className="px-3 py-2 rounded-lg border text-sm"
            />
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Nominal"
              className="px-3 py-2 rounded-lg border text-sm"
            />
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="px-3 py-2 rounded-lg border text-sm"
            />
          </div>
          <button
            type="button"
            onClick={add}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm flex items-center gap-1"
          >
            <Plus size={14} /> Simpan
          </button>
        </div>
      )}

      {isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <h3 className="font-semibold text-sm flex items-center gap-1">
            <Zap size={14} /> Pelunasan otomatis (FIFO)
          </h3>
          <p className="text-xs text-slate-500">
            Nominal dialokasikan ke tagihan kontak yang sama, urut jatuh tempo (FIFO).
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              value={autoContact}
              onChange={(e) => setAutoContact(e.target.value)}
              placeholder="Nama kontak"
              className="px-3 py-2 rounded-lg border text-sm"
            />
            <input
              type="number"
              value={autoAmount}
              onChange={(e) => setAutoAmount(e.target.value)}
              placeholder="Nominal bayar"
              className="px-3 py-2 rounded-lg border text-sm"
            />
            <button
              type="button"
              disabled={autoLoading}
              onClick={autoSettleFifo}
              className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm disabled:opacity-50"
            >
              {autoLoading ? "Memproses..." : "Lunasi Otomatis"}
            </button>
          </div>
        </div>
      )}

      {payId && isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-wrap gap-2 items-end">
          <div>
            <label className="text-xs text-slate-500">Jumlah bayar / terima</label>
            <input
              type="number"
              value={payAmt}
              onChange={(e) => setPayAmt(e.target.value)}
              className="block px-3 py-2 rounded-lg border text-sm"
            />
          </div>
          <button
            type="button"
            onClick={recordPayment}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm"
          >
            Catat
          </button>
          <button
            type="button"
            onClick={() => setPayId(null)}
            className="px-3 py-2 text-sm text-slate-500"
          >
            Batal
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Kontak</th>
              <th className="text-left px-3 py-2">Keterangan</th>
              <th className="text-right px-3 py-2">Total</th>
              <th className="text-right px-3 py-2">Dibayar</th>
              <th className="text-right px-3 py-2">Sisa</th>
              <th className="text-left px-3 py-2">Jatuh tempo</th>
              <th className="text-left px-3 py-2">Status</th>
              {isAdmin && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-slate-400">
                  Memuat...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8 text-slate-400">
                  Belum ada data
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.contact_name}</td>
                  <td className="px-3 py-2 text-slate-500">{r.description || "-"}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(r.amount)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(r.amount_paid)}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatCurrency(remaining(r))}
                  </td>
                  <td className="px-3 py-2">
                    {r.due_date ? formatDateShort(r.due_date) : "-"}
                  </td>
                  <td className="px-3 py-2">{statusBadge(r.status)}</td>
                  {isAdmin && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.status !== "paid" && r.status !== "cancelled" && (
                        <button
                          type="button"
                          onClick={() => {
                            setPayId(r.id);
                            setPayAmt(String(remaining(r)));
                          }}
                          className="text-xs text-blue-600 mr-2"
                        >
                          Bayar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        className="text-red-500"
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
      </div>
    </div>
  );
}
