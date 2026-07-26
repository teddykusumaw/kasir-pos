"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import {
  listExpiringBatches,
  listProductBatches,
  updateBatchExpiry,
  adjustBatchQty,
  addStockBatch,
} from "@/lib/fifo";
import { Product, Profile } from "@/types/database";
import { AlertTriangle, Plus } from "lucide-react";

export default function BatchesClient({ profile }: { profile: Profile }) {
  const [expiring, setExpiring] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [batches, setBatches] = useState<any[]>([]);
  const [days, setDays] = useState(30);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addQty, setAddQty] = useState("1");
  const [addCost, setAddCost] = useState("0");
  const [addExpiry, setAddExpiry] = useState("");
  const supabase = createClient();
  const isAdmin = profile.role === "admin";

  const loadExpiring = useCallback(async () => {
    try {
      const rows = await listExpiringBatches(days);
      setExpiring(rows);
    } catch (e: any) {
      setMsg(e.message);
    }
  }, [days]);

  const loadProducts = useCallback(async () => {
    const { data } = await supabase
      .from("products")
      .select("id, name, cost, stock, unit")
      .order("name");
    setProducts((data as Product[]) || []);
  }, [supabase]);

  const loadBatches = useCallback(async () => {
    if (!productId) {
      setBatches([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await listProductBatches(productId);
      setBatches(rows);
    } catch (e: any) {
      setMsg(e.message);
    }
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    loadExpiring();
    loadProducts();
  }, [loadExpiring, loadProducts]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const saveExpiry = async (id: string, value: string) => {
    if (!isAdmin) return;
    await updateBatchExpiry(id, value || null);
    setMsg("ED batch diperbarui");
    loadBatches();
    loadExpiring();
  };

  const saveQty = async (id: string, value: string) => {
    if (!isAdmin) return;
    await adjustBatchQty(id, Number(value) || 0, "Adjust qty batch");
    setMsg("Qty batch diperbarui");
    loadBatches();
  };

  const addBatch = async () => {
    if (!isAdmin || !productId) return;
    const qty = Number(addQty);
    if (qty <= 0) return;
    setLoading(true);
    await addStockBatch(productId, qty, Number(addCost) || 0, "Manual batch", {
      expiry_date: addExpiry || null,
      delivery_date: new Date().toISOString().slice(0, 10),
    });
    // stok produk: naikkan manual (bukan lewat purchase trigger)
    const prod = products.find((p) => p.id === productId);
    if (prod) {
      await supabase
        .from("products")
        .update({ stock: Number(prod.stock) + qty })
        .eq("id", productId);
    }
    setShowAdd(false);
    setAddQty("1");
    setAddExpiry("");
    setMsg("Batch ditambahkan");
    setLoading(false);
    loadBatches();
    loadProducts();
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Batch Stok & ED</h1>
        <p className="text-sm text-slate-500">
          FIFO/FEFO — batch hampir / sudah kedaluwarsa, kelola ED per batch
        </p>
      </div>

      {msg && (
        <p className="text-sm bg-slate-50 px-3 py-2 rounded-lg">{msg}</p>
      )}

      {/* Alert expiring */}
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            Peringatan ED
          </h2>
          <div className="flex items-center gap-2 text-sm">
            <span>Dalam</span>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="border rounded-lg px-2 py-1"
            >
              <option value={7}>7 hari</option>
              <option value={14}>14 hari</option>
              <option value={30}>30 hari</option>
              <option value={60}>60 hari</option>
              <option value={90}>90 hari</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-3 py-2">Produk</th>
                <th className="text-left px-3 py-2">ED</th>
                <th className="text-right px-3 py-2">Sisa qty</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {expiring.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-slate-400">
                    Tidak ada batch dalam rentang ED
                  </td>
                </tr>
              ) : (
                expiring.map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="px-3 py-2 font-medium">
                      {b.products?.name || b.product_id}
                    </td>
                    <td className="px-3 py-2">{b.expiry_date}</td>
                    <td className="px-3 py-2 text-right">
                      {b.qty_remaining} {b.products?.unit || ""}
                    </td>
                    <td className="px-3 py-2">
                      {b.is_expired ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                          Expired
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          {b.days_left} hari lagi
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per produk */}
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-end justify-between">
          <div>
            <label className="text-xs text-slate-500">Pilih produk</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="block mt-1 px-3 py-2 border rounded-lg text-sm min-w-[220px]"
            >
              <option value="">— Produk —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (stok {p.stock})
                </option>
              ))}
            </select>
          </div>
          {isAdmin && productId && (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm"
            >
              <Plus size={14} /> Batch baru
            </button>
          )}
        </div>

        {showAdd && isAdmin && (
          <div className="grid sm:grid-cols-4 gap-2 p-3 bg-slate-50 rounded-lg">
            <input
              type="number"
              placeholder="Qty"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
              className="px-2 py-1.5 border rounded-lg text-sm"
            />
            <input
              type="number"
              placeholder="Harga modal"
              value={addCost}
              onChange={(e) => setAddCost(e.target.value)}
              className="px-2 py-1.5 border rounded-lg text-sm"
            />
            <input
              type="date"
              value={addExpiry}
              onChange={(e) => setAddExpiry(e.target.value)}
              className="px-2 py-1.5 border rounded-lg text-sm"
              title="Expiry date"
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={addBatch}
                disabled={loading}
                className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm"
              >
                Simpan
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="px-3 py-1.5 border rounded-lg text-sm"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-3 py-2">Masuk</th>
                <th className="text-left px-3 py-2">ED</th>
                <th className="text-right px-3 py-2">Sisa / Awal</th>
                <th className="text-right px-3 py-2">Modal</th>
                <th className="text-left px-3 py-2">Supplier</th>
                <th className="text-left px-3 py-2">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {!productId ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-slate-400">
                    Pilih produk
                  </td>
                </tr>
              ) : loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-slate-400">
                    Memuat...
                  </td>
                </tr>
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-slate-400">
                    Belum ada batch
                  </td>
                </tr>
              ) : (
                batches.map((b) => {
                  const expired = b.expiry_date && b.expiry_date < today;
                  const soon =
                    b.expiry_date &&
                    !expired &&
                    b.expiry_date <=
                      new Date(Date.now() + days * 86400000)
                        .toISOString()
                        .slice(0, 10);
                  return (
                    <tr
                      key={b.id}
                      className={`border-t ${
                        expired
                          ? "bg-red-50"
                          : soon
                            ? "bg-amber-50"
                            : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-xs">
                        {formatDateShort(b.received_at)}
                      </td>
                      <td className="px-3 py-2">
                        {isAdmin ? (
                          <input
                            type="date"
                            defaultValue={b.expiry_date || ""}
                            onBlur={(e) =>
                              e.target.value !== (b.expiry_date || "") &&
                              saveExpiry(b.id, e.target.value)
                            }
                            className="px-2 py-1 border rounded text-xs"
                          />
                        ) : (
                          b.expiry_date || "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isAdmin ? (
                          <input
                            type="number"
                            className="w-20 px-2 py-1 border rounded text-xs text-right"
                            defaultValue={b.qty_remaining}
                            onBlur={(e) =>
                              Number(e.target.value) !==
                                Number(b.qty_remaining) &&
                              saveQty(b.id, e.target.value)
                            }
                          />
                        ) : (
                          b.qty_remaining
                        )}
                        <span className="text-slate-400 text-xs">
                          {" "}
                          / {b.qty_initial}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(b.unit_cost)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {b.suppliers?.name || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {b.note || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400">
          Saat penjualan, sistem memakai FEFO (ED terdekat) lalu FIFO (masuk
          lebih dulu). Batch expired dipakai hanya jika stok non-expired habis.
        </p>
      </div>
    </div>
  );
}
