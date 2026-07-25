"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Profile, Supplier } from "@/types/database";
import { Plus, Pencil, Trash2, Search } from "lucide-react";

const empty = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  is_active: true,
};

export default function SuppliersClient({ profile }: { profile: Profile }) {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const supabase = createClient();
  const isAdmin = profile.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("suppliers")
      .select("*")
      .order("name");
    setRows((data as Supplier[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.contact_person || "").toLowerCase().includes(q) ||
      (s.phone || "").includes(q)
    );
  });

  const save = async () => {
    if (!isAdmin || !form.name.trim()) {
      setMsg("Nama supplier wajib");
      return;
    }
    setLoading(true);
    const payload = {
      name: form.name.trim(),
      contact_person: form.contact_person.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };
    if (editing) {
      const { error } = await supabase
        .from("suppliers")
        .update(payload)
        .eq("id", editing.id);
      setMsg(error ? error.message : "Supplier diupdate");
    } else {
      const { error } = await supabase.from("suppliers").insert(payload);
      setMsg(error ? error.message : "Supplier ditambahkan");
    }
    setLoading(false);
    setOpen(false);
    setEditing(null);
    setForm(empty);
    load();
  };

  const remove = async (id: string) => {
    if (!isAdmin || !confirm("Hapus supplier? Produk terkait tidak ikut terhapus.")) return;
    await supabase.from("suppliers").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Supplier</h1>
          <p className="text-sm text-slate-500">
            Data pemasok — ditautkan ke produk & pengiriman stok
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setForm(empty);
              setOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium"
          >
            <Plus size={16} /> Tambah Supplier
          </button>
        )}
      </div>

      {msg && (
        <p className="text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">{msg}</p>
      )}

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama / kontak / telepon"
          className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm"
        />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Nama</th>
              <th className="text-left px-3 py-2">Kontak</th>
              <th className="text-left px-3 py-2">Telepon</th>
              <th className="text-left px-3 py-2">Email</th>
              <th className="text-left px-3 py-2">Status</th>
              {isAdmin && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-400">
                  Memuat...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-400">
                  Belum ada supplier
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2">{s.contact_person || "-"}</td>
                  <td className="px-3 py-2">{s.phone || "-"}</td>
                  <td className="px-3 py-2">{s.email || "-"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        s.is_active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {s.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        className="text-primary-600 p-1"
                        onClick={() => {
                          setEditing(s);
                          setForm({
                            name: s.name,
                            contact_person: s.contact_person || "",
                            phone: s.phone || "",
                            email: s.email || "",
                            address: s.address || "",
                            notes: s.notes || "",
                            is_active: s.is_active,
                          });
                          setOpen(true);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="text-red-500 p-1"
                        onClick={() => remove(s.id)}
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

      {open && isAdmin && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-5 space-y-3 shadow-xl">
            <h2 className="font-semibold text-lg">
              {editing ? "Edit Supplier" : "Tambah Supplier"}
            </h2>
            {(
              [
                ["name", "Nama *"],
                ["contact_person", "Contact person"],
                ["phone", "Telepon"],
                ["email", "Email"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="text-xs text-slate-500">{label}</label>
                <input
                  value={(form as any)[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-slate-500">Alamat</label>
              <textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                rows={2}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Catatan</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                rows={2}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) =>
                  setForm({ ...form, is_active: e.target.checked })
                }
              />
              Aktif
            </label>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm border rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={save}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
