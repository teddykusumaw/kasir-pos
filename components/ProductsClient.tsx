"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Search, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { Product, Supplier } from "@/types/database";
import { addStockBatch } from "@/lib/fifo";
import { SUPPLIER_OPTION_SELECT } from "@/lib/supplierQueries";

interface Props {
  initialProducts: Product[];
}

const emptyForm = {
  name: "",
  barcode: "",
  price: "",
  cost: "",
  stock: "",
  min_stock: "5",
  category: "",
  category_id: "",
  supplier_id: "",
  unit: "pcs",
  status: "active",
};

export default function ProductsClient({ initialProducts }: Props) {
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("suppliers")
      .select(SUPPLIER_OPTION_SELECT)
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setSuppliers((data as Supplier[]) || []));
    supabase
      .from("product_categories")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setCategories(data || []));
  }, [supabase]);

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode && p.barcode.includes(search)) ||
      (p.category && p.category.toLowerCase().includes(search.toLowerCase()))
  );

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      barcode: p.barcode || "",
      price: String(p.price),
      cost: String(p.cost),
      stock: String(p.stock),
      min_stock: String(p.min_stock),
      category: p.category || "",
      category_id: (p as any).category_id || "",
      supplier_id: p.supplier_id || "",
      unit: p.unit || "pcs",
      status: p.status || "active",
    });
    setError("");
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      barcode: form.barcode.trim() || null,
      price: Number(form.price),
      cost: Number(form.cost),
      stock: Number(form.stock),
      min_stock: Number(form.min_stock),
      category: form.category.trim() || categories.find((x) => x.id === form.category_id)?.name || null,
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
      unit: form.unit.trim() || "pcs",
      status: form.status === "inactive" ? "inactive" : "active",
    };

    try {
      if (editing) {
        const { data, error: err } = await supabase
          .from("products")
          .update(payload)
          .eq("id", editing.id)
          .select()
          .single();
        if (err) throw err;
        // FIFO: stok naik → batch baru
        const delta = Number(payload.stock) - Number(editing.stock);
        if (delta > 0) {
          await addStockBatch(editing.id, delta, Number(payload.cost) || 0, "Update stok", {
            supplier_id: payload.supplier_id || null,
            delivery_date: new Date().toISOString().slice(0, 10),
          });
        }
        setProducts((prev) =>
          prev.map((p) => (p.id === editing.id ? data : p))
        );
      } else {
        const { data, error: err } = await supabase
          .from("products")
          .insert(payload)
          .select()
          .single();
        if (err) throw err;
        if (Number(payload.stock) > 0) {
          await addStockBatch(data.id, Number(payload.stock), Number(payload.cost) || 0, "Stok awal", {
            supplier_id: payload.supplier_id || null,
            delivery_date: new Date().toISOString().slice(0, 10),
          });
        }
        setProducts((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setShowModal(false);
    } catch (err: any) {
      setError(err.message || "Gagal menyimpan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Manajemen Produk</h1>
          <p className="text-slate-500">Tambah & update item + stok</p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition"
        >
          <Plus size={18} />
          Tambah Produk
        </button>
      </div>

      <div className="relative max-w-md">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama, barcode, kategori..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Produk</th>
                <th className="text-left px-4 py-3 font-medium">Barcode</th>
                <th className="text-left px-4 py-3 font-medium">Harga</th>
                <th className="text-left px-4 py-3 font-medium">Modal</th>
                <th className="text-left px-4 py-3 font-medium">Stok</th>
                <th className="text-left px-4 py-3 font-medium">Kategori</th>
                <th className="text-left px-4 py-3 font-medium">Supplier</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-400">
                    <Package size={32} className="mx-auto mb-2 opacity-50" />
                    Tidak ada produk
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {p.name}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                      {p.barcode || "-"}
                    </td>
                    <td className="px-4 py-3">{formatCurrency(p.price)}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatCurrency(p.cost)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-semibold ${
                          p.stock <= p.min_stock
                            ? "text-red-600"
                            : "text-slate-800"
                        }`}
                      >
                        {p.stock}
                      </span>
                      <span className="text-xs text-slate-400 ml-1">
                        {p.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {p.category || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          (p.status || "active") === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {(p.status || "active") === "active" ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-primary-600"
                      >
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b">
              <h2 className="text-lg font-semibold">
                {editing ? "Edit Produk" : "Tambah Produk"}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nama Produk *
                </label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Barcode
                  </label>
                  <input
                    value={form.barcode}
                    onChange={(e) =>
                      setForm({ ...form, barcode: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Kategori
                  </label>
                  <select
                    value={form.category_id}
                    onChange={(e) => {
                      const id = e.target.value;
                      const nm = categories.find((x) => x.id === id)?.name || "";
                      setForm({ ...form, category_id: id, category: nm });
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  >
                    <option value="">— Pilih kategori —</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Supplier
                  </label>
                  <select
                    value={form.supplier_id}
                    onChange={(e) =>
                      setForm({ ...form, supplier_id: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  >
                    <option value="">— Tanpa supplier —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Harga Jual *
                  </label>
                  <input
                    required
                    type="number"
                    min="0"
                    value={form.price}
                    onChange={(e) =>
                      setForm({ ...form, price: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Harga Modal
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.cost}
                    onChange={(e) =>
                      setForm({ ...form, cost: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Stok *
                  </label>
                  <input
                    required
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={(e) =>
                      setForm({ ...form, stock: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Min. Stok
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.min_stock}
                    onChange={(e) =>
                      setForm({ ...form, min_stock: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Satuan
                  </label>
                  <input
                    value={form.unit}
                    onChange={(e) =>
                      setForm({ ...form, unit: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Status
                </label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                >
                  {loading ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
