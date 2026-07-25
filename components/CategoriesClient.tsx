"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ProductCategory, Profile } from "@/types/database";
import { Plus, Pencil, Trash2 } from "lucide-react";

export default function CategoriesClient({ profile }: { profile: Profile }) {
  const [rows, setRows] = useState<ProductCategory[]>([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [editing, setEditing] = useState<ProductCategory | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const isAdmin = profile.role === "admin";

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("product_categories")
      .select("*")
      .order("name");
    setRows((data as ProductCategory[]) || []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!isAdmin || !name.trim()) {
      setMsg("Nama kategori wajib");
      return;
    }
    setLoading(true);
    if (editing) {
      const { error } = await supabase
        .from("product_categories")
        .update({
          name: name.trim(),
          description: desc.trim() || null,
        })
        .eq("id", editing.id);
      // sync text category on products
      await supabase
        .from("products")
        .update({ category: name.trim() })
        .eq("category_id", editing.id);
      setMsg(error ? error.message : "Kategori diupdate");
    } else {
      const { error } = await supabase.from("product_categories").insert({
        name: name.trim(),
        description: desc.trim() || null,
      });
      setMsg(error ? error.message : "Kategori ditambahkan");
    }
    setLoading(false);
    setName("");
    setDesc("");
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    if (!isAdmin || !confirm("Hapus kategori? Produk tetap ada, relasi dilepas."))
      return;
    await supabase
      .from("products")
      .update({ category_id: null })
      .eq("category_id", id);
    await supabase.from("product_categories").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Kategori Produk</h2>
        <p className="text-xs text-slate-500">
          Master kategori — dipakai di form produk & filter warehouse
        </p>
      </div>

      {msg && (
        <p className="text-sm bg-slate-50 px-3 py-2 rounded-lg">{msg}</p>
      )}

      {isAdmin && (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium">
            {editing ? "Edit kategori" : "Tambah kategori"}
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama kategori *"
              className="px-3 py-2 border rounded-lg text-sm"
            />
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Deskripsi (opsional)"
              className="px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={save}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm"
            >
              {loading ? "..." : "Simpan"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setName("");
                  setDesc("");
                }}
                className="px-4 py-2 border rounded-lg text-sm"
              >
                Batal
              </button>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Nama</th>
              <th className="text-left px-3 py-2">Deskripsi</th>
              <th className="text-left px-3 py-2">Status</th>
              {isAdmin && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-slate-400">
                  Belum ada kategori
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {r.description || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        r.is_active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {r.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      <button
                        type="button"
                        className="text-primary-600 p-1"
                        onClick={() => {
                          setEditing(r);
                          setName(r.name);
                          setDesc(r.description || "");
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="text-red-500 p-1"
                        onClick={() => remove(r.id)}
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
