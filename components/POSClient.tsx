"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  CreditCard,
  Printer,
  X,
  Barcode,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { Product, CartItem, Profile } from "@/types/database";
import Receipt from "./Receipt";
import { useBarcodeScanner, playScanBeep } from "@/hooks/useBarcodeScanner";
import {
  printThermalReceipt,
  printKitchenSerial,
  isWebSerialSupported,
  isWebBluetoothSupported,
  type ThermalSale,
} from "@/lib/thermalPrinter";
import { getPrintSettings, getKitchenCategoryList } from "@/lib/printSettings";
import {
  fetchTaxSettings,
  calculateTax,
  type TaxSettings,
  type TaxBreakdown,
} from "@/lib/taxSettings";
import { planFifoConsume, applyFifoConsume } from "@/lib/fifo";

interface Props {
  profile: Profile;
}

export default function POSClient({ profile }: Props) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [tempoCustomer, setTempoCustomer] = useState("");
  const [processing, setProcessing] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [taxSettings, setTaxSettings] = useState<TaxSettings | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const productsRef = useRef<Product[]>([]);
  const supabase = createClient();

  // Keep productsRef in sync for scanner callback
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  useEffect(() => {
    fetchProducts();
    fetchTaxSettings().then(setTaxSettings);
    barcodeRef.current?.focus();
  }, []);

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("status", "active")
      .order("name")
      .limit(500);
    if (!error && data) {
      setProducts(data);
    } else {
      // fallback jika kolom status belum dimigrasi
      const { data: all } = await supabase
        .from("products")
        .select("*")
        .order("name")
        .limit(500);
      setProducts(
        (all || []).filter((p: any) => (p.status || "active") === "active"),
      );
    }
  };

  const showMsg = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const addToCart = useCallback((product: Product, qty = 1) => {
    if (product.stock < 1) {
      showMsg("error", `${product.name} stok habis!`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        const newQty = existing.quantity + qty;
        if (newQty > product.stock) {
          showMsg("error", `Stok ${product.name} hanya ${product.stock}`);
          return prev;
        }
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, quantity: newQty } : c,
        );
      }
      return [...prev, { product, quantity: qty }];
    });
    setSearch("");
    setShowSearch(false);
    barcodeRef.current?.focus();
  }, []);

  // ---------- Smart Barcode Scanner (onscan.js) ----------
  const handleScannedCode = useCallback(
    async (code: string) => {
      if (processing) return;

      // 1. Cache lokal: barcode exact + aktif + ada stok
      let found = productsRef.current.find(
        (p) => p.barcode === code && (p.status || "active") === "active",
      );

      // 2. Fallback Supabase (kolom minimal + index barcode)
      if (!found) {
        const { data } = await supabase
          .from("products")
          .select(
            "id, name, barcode, price, cost, stock, min_stock, category, unit, status, supplier_id",
          )
          .eq("barcode", code)
          .eq("status", "active")
          .maybeSingle();
        found = (data as unknown as Product) || undefined;
        if (found) {
          // sisipkan ke cache lokal
          setProducts((prev) =>
            prev.some((x) => x.id === found!.id) ? prev : [...prev, found!],
          );
        }
      }

      if (!found) {
        playScanBeep(false);
        showMsg("error", `Barcode "${code}" tidak ditemukan`);
        return;
      }
      if (found.stock < 1) {
        playScanBeep(false);
        showMsg("error", `${found.name} stok habis`);
        return;
      }

      addToCart(found);
      playScanBeep(true);
      showMsg("success", `✓ ${found.name}`);
      // kosongkan search box setelah scan hardware
      setSearch("");
      setShowSearch(false);
    },
    [addToCart, supabase, processing],
  );

  useBarcodeScanner({
    onScan: handleScannedCode,
    enabled: !processing,
    minLength: 3,
    avgTimeByChar: 50,
    debounceMs: 600,
  });

  // Manual search (typing + Enter still works for name search)
  const handleManualKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key !== "Enter") {
      const q = (e.target as HTMLInputElement).value;
      if (q.length >= 2) {
        const results = products.filter(
          (p) =>
            p.name.toLowerCase().includes(q.toLowerCase()) ||
            (p.barcode && p.barcode.includes(q)),
        );
        setSearchResults(results.slice(0, 8));
        setShowSearch(true);
      } else {
        setShowSearch(false);
      }
      return;
    }

    // Enter pressed while typing → try barcode first, then name
    const code = search.trim();
    if (!code) return;

    let found = products.find((p) => p.barcode === code);
    if (!found) {
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("barcode", code)
        .maybeSingle();
      found = (data as Product | null) || undefined;
    }

    if (found) {
      addToCart(found);
    } else {
      const results = products.filter(
        (p) =>
          p.name.toLowerCase().includes(code.toLowerCase()) ||
          (p.barcode && p.barcode.includes(code)),
      );
      if (results.length === 1) {
        addToCart(results[0]);
      } else if (results.length > 1) {
        setSearchResults(results);
        setShowSearch(true);
      } else {
        showMsg("error", `Produk "${code}" tidak ditemukan`);
      }
    }
    setSearch("");
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.product.id !== productId) return c;
          const newQty = c.quantity + delta;
          if (newQty > c.product.stock) {
            showMsg("error", `Stok hanya ${c.product.stock}`);
            return c;
          }
          return { ...c, quantity: newQty };
        })
        .filter((c) => c.quantity > 0),
    );
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((c) => c.product.id !== productId));
  };

  const itemsTotal = cart.reduce(
    (sum, c) => sum + c.product.price * c.quantity,
    0,
  );
  const taxBreakdown: TaxBreakdown = calculateTax(
    itemsTotal,
    taxSettings || { enabled: false, rate: 0, name: "PPN", mode: "disabled" },
  );
  const total = taxBreakdown.total;
  const change =
    paymentMethod === "cash" && cashReceived ? Number(cashReceived) - total : 0;

  const handleCheckout = async () => {
    if (cart.length === 0) {
      showMsg("error", "Keranjang kosong");
      return;
    }
    if (paymentMethod === "cash" && Number(cashReceived) < total) {
      showMsg("error", "Uang diterima kurang");
      return;
    }
    if (paymentMethod === "tempo" && !tempoCustomer.trim()) {
      showMsg("error", "Isi nama pelanggan untuk penjualan tempo");
      return;
    }

    setProcessing(true);
    try {
      const { data: sale, error: saleErr } = await supabase
        .from("sales")
        .insert({
          cashier_id: profile.id,
          subtotal: taxBreakdown.subtotal,
          tax_rate: taxBreakdown.taxRate,
          tax_amount: taxBreakdown.taxAmount,
          total: taxBreakdown.total,
          payment_method: paymentMethod,
          cash_received: paymentMethod === "cash" ? Number(cashReceived) : null,
          change_amount: paymentMethod === "cash" ? change : null,
        })
        .select()
        .single();

      if (saleErr) throw saleErr;

      // FIFO: alokasi batch & HPP per item
      const items: any[] = [];
      const allAllocations: {
        batch_id: string;
        qty: number;
        unit_cost: number;
      }[] = [];
      for (const c of cart) {
        let unitCost = c.product.cost || 0;
        try {
          const fifo = await planFifoConsume(c.product.id, c.quantity);
          unitCost = fifo.avgUnitCost;
          allAllocations.push(...fifo.allocations);
        } catch (e) {
          console.warn("FIFO fallback", e);
        }
        items.push({
          sale_id: sale.id,
          product_id: c.product.id,
          quantity: c.quantity,
          price: c.product.price,
          cost: unitCost,
          subtotal: c.product.price * c.quantity,
        });
      }

      const { error: itemsErr } = await supabase
        .from("sale_items")
        .insert(items);
      if (itemsErr) throw itemsErr;

      try {
        await applyFifoConsume(allAllocations);
      } catch (e) {
        console.warn("FIFO apply", e);
      }

      // Log stockout jika stok habis
      for (const c of cart) {
        const { data: prod } = await supabase
          .from("products")
          .select("stock")
          .eq("id", c.product.id)
          .single();
        if (prod && Number(prod.stock) === 0) {
          await supabase.from("stockout_events").insert({
            product_id: c.product.id,
          });
        }
      }

      // Auto-piutang jika bayar tempo
      if (paymentMethod === "tempo") {
        const due = new Date();
        due.setDate(due.getDate() + 30);
        const { error: arErr } = await supabase.from("receivables").insert({
          contact_name: tempoCustomer.trim(),
          description: `Penjualan tempo #${sale.id.slice(0, 8).toUpperCase()}`,
          amount: taxBreakdown.total,
          amount_paid: 0,
          due_date: due.toISOString().slice(0, 10),
          status: "open",
          sale_id: sale.id,
          created_by: profile.id,
        });
        if (arErr) {
          console.warn("auto piutang:", arErr.message);
          showMsg(
            "error",
            "Transaksi OK, tapi piutang gagal dibuat: " + arErr.message,
          );
        }
      }

      await fetchProducts();

      const salePayload = {
        ...sale,
        subtotal: sale.subtotal ?? taxBreakdown.subtotal,
        tax_rate: sale.tax_rate ?? taxBreakdown.taxRate,
        tax_amount: sale.tax_amount ?? taxBreakdown.taxAmount,
        tax_name: taxBreakdown.taxName,
        items: cart.map((c) => ({
          ...c,
          subtotal: c.product.price * c.quantity,
        })),
        cashier: profile,
      };
      setLastSale(salePayload);
      // Update stok lokal (DB sudah via trigger)
      setProducts((prev) =>
        prev.map((p) => {
          const sold = cart.find((c) => c.product.id === p.id);
          if (!sold) return p;
          return { ...p, stock: Math.max(0, p.stock - sold.quantity) };
        }),
      );
      setCart([]);
      setCashReceived("");
      setTempoCustomer("");
      setShowReceipt(true);
      showMsg("success", "Transaksi berhasil!");

      // Auto-print receipt + kitchen
      const settings = getPrintSettings();
      const thermalSale: ThermalSale = {
        id: sale.id,
        total: sale.total,
        subtotal: sale.subtotal ?? taxBreakdown.subtotal,
        tax_rate: sale.tax_rate ?? taxBreakdown.taxRate,
        tax_amount: sale.tax_amount ?? taxBreakdown.taxAmount,
        tax_name: taxBreakdown.taxName,
        payment_method: sale.payment_method,
        cash_received: sale.cash_received,
        change_amount: sale.change_amount,
        created_at: sale.created_at,
        cashier_name: profile.full_name,
        items: salePayload.items.map((i: any) => ({
          name: i.product.name,
          quantity: i.quantity,
          price: i.product.price,
          subtotal: i.subtotal,
          category: i.product.category,
        })),
      };

      if (settings.autoPrint) {
        printThermalReceipt(thermalSale, "auto").then((result) => {
          if (result.success) {
            if (result.method === "browser") {
              setTimeout(() => window.print(), 400);
            } else {
              showMsg(
                "success",
                `Struk dicetak via ${result.method.toUpperCase()}`,
              );
            }
          } else if (result.error) {
            showMsg("error", result.error);
          }
        });
      }

      // Kitchen ticket
      if (settings.kitchenEnabled && settings.kitchenAutoPrint) {
        const cats = getKitchenCategoryList(settings);
        const kitchenItems = thermalSale.items.filter((it) => {
          if (!cats.length) return true;
          return it.category && cats.includes(it.category.toLowerCase());
        });
        if (kitchenItems.length > 0) {
          printKitchenSerial(thermalSale, kitchenItems).then((r) => {
            if (!r.success && r.error) showMsg("error", r.error);
          });
        }
      }
    } catch (err: any) {
      showMsg("error", err.message || "Gagal menyimpan transaksi");
    } finally {
      setProcessing(false);
    }
  };

  // ---------- Print helpers ----------
  const buildThermalSale = (): ThermalSale | null => {
    if (!lastSale) return null;
    return {
      id: lastSale.id,
      total: lastSale.total,
      subtotal: lastSale.subtotal,
      tax_rate: lastSale.tax_rate,
      tax_amount: lastSale.tax_amount,
      tax_name: lastSale.tax_name,
      payment_method: lastSale.payment_method,
      cash_received: lastSale.cash_received,
      change_amount: lastSale.change_amount,
      created_at: lastSale.created_at,
      cashier_name: lastSale.cashier?.full_name,
      items: lastSale.items.map((i: any) => ({
        name: i.product.name,
        quantity: i.quantity,
        price: i.product.price,
        subtotal: i.subtotal,
        category: i.product.category,
      })),
    };
  };

  const handlePrint = async (
    mode: "auto" | "serial" | "bluetooth" | "browser",
  ) => {
    const thermalSale = buildThermalSale();
    if (!thermalSale) return;

    if (mode === "browser") {
      window.print();
      return;
    }

    setPrinting(true);
    const result = await printThermalReceipt(thermalSale, mode);
    setPrinting(false);

    if (result.success) {
      showMsg("success", `Struk dikirim via ${result.method.toUpperCase()}`);
    } else {
      showMsg("error", result.error || "Gagal mencetak");
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col lg:flex-row gap-4">
      {/* Left: Product search & barcode */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-slate-900">Kasir / POS</h1>
            <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200">
              <Barcode size={12} />
              Scanner aktif
            </span>
          </div>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Barcode size={18} />
            </div>
            <input
              ref={barcodeRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleManualKeyDown}
              placeholder="Scan barcode (otomatis) atau ketik nama produk..."
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm"
              autoFocus
            />
            {showSearch && searchResults.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center justify-between text-sm border-b border-slate-50 last:border-0"
                  >
                    <div>
                      <p className="font-medium text-slate-800">{p.name}</p>
                      <p className="text-xs text-slate-400">
                        {p.barcode || "-"} · Stok: {p.stock}
                      </p>
                    </div>
                    <span className="font-semibold text-primary-600">
                      {formatCurrency(p.price)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Scanner hardware terdeteksi otomatis (onscan.js). Tidak perlu fokus
            ke input.
          </p>
        </div>

        {/* Quick product grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">
            Produk Cepat
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {products.slice(0, 20).map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                disabled={p.stock < 1}
                className="p-3 rounded-lg border border-slate-200 hover:border-primary-400 hover:bg-primary-50 transition text-left disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <p className="text-sm font-medium text-slate-800 truncate">
                  {p.name}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Stok: {p.stock}</p>
                <p className="text-sm font-semibold text-primary-600 mt-1">
                  {formatCurrency(p.price)}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-full lg:w-96 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <ShoppingCart size={18} className="text-primary-600" />
          <h2 className="font-semibold text-slate-900">
            Keranjang ({cart.length})
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cart.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-10">
              Belum ada item — scan barcode atau pilih produk
            </p>
          ) : (
            cart.map((c) => (
              <div
                key={c.product.id}
                className="flex items-center gap-2 p-2 rounded-lg bg-slate-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {c.product.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatCurrency(c.product.price)} × {c.quantity}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateQty(c.product.id, -1)}
                    className="p-1 rounded bg-white border hover:bg-slate-100"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-6 text-center text-sm font-medium">
                    {c.quantity}
                  </span>
                  <button
                    onClick={() => updateQty(c.product.id, 1)}
                    className="p-1 rounded bg-white border hover:bg-slate-100"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    onClick={() => removeItem(c.product.id)}
                    className="p-1 rounded text-red-500 hover:bg-red-50 ml-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Payment */}
        <div className="p-4 border-t border-slate-100 space-y-3">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatCurrency(taxBreakdown.subtotal)}</span>
            </div>
            {taxBreakdown.taxAmount > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>
                  {taxBreakdown.taxName} ({taxBreakdown.taxRate}%)
                  {taxBreakdown.mode === "inclusive" ? " incl." : ""}
                </span>
                <span>{formatCurrency(taxBreakdown.taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-1 border-t border-slate-100">
              <span>Total</span>
              <span className="text-primary-600">{formatCurrency(total)}</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">
              Metode Bayar
            </label>
            <div className="grid grid-cols-5 gap-1">
              {["cash", "qris", "transfer", "card", "tempo"].map((m) => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`py-1.5 text-xs rounded-md capitalize transition ${
                    paymentMethod === m
                      ? "bg-primary-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {m === "cash" ? "Tunai" : m === "tempo" ? "Tempo" : m}
                </button>
              ))}
            </div>
          </div>

          {paymentMethod === "cash" && (
            <div>
              <label className="text-xs text-slate-500 mb-1 block">
                Uang Diterima
              </label>
              <input
                type="number"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="0"
              />
              {cashReceived && Number(cashReceived) >= total && (
                <p className="text-sm text-emerald-600 mt-1">
                  Kembalian: {formatCurrency(change)}
                </p>
              )}
            </div>
          )}

          {paymentMethod === "tempo" && (
            <div>
              <label className="text-xs text-slate-500 mb-1 block">
                Nama pelanggan (tempo)
              </label>
              <input
                type="text"
                value={tempoCustomer}
                onChange={(e) => setTempoCustomer(e.target.value)}
                placeholder="Nama pelanggan"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-xs text-amber-600 mt-1">
                Otomatis membuat piutang (jatuh tempo +30 hari)
              </p>
            </div>
          )}

          <button
            onClick={handleCheckout}
            disabled={processing || cart.length === 0}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition"
          >
            <CreditCard size={18} />
            {processing ? "Memproses..." : "Bayar & Simpan"}
          </button>
        </div>
      </div>

      {/* Toast */}
      {message && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            message.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && lastSale && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between no-print">
              <h3 className="font-semibold">Struk Pembelian</h3>
              <button onClick={() => setShowReceipt(false)}>
                <X size={20} />
              </button>
            </div>

            <Receipt sale={lastSale} />

            <div className="p-4 border-t space-y-2 no-print">
              {isWebSerialSupported() && (
                <button
                  onClick={() => handlePrint("serial")}
                  disabled={printing}
                  className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm font-medium"
                >
                  <Printer size={16} />
                  {printing ? "Mengirim..." : "Cetak USB (Web Serial)"}
                </button>
              )}

              {isWebBluetoothSupported() && (
                <button
                  onClick={() => handlePrint("bluetooth")}
                  disabled={printing}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm font-medium"
                >
                  {printing ? "Mengirim..." : "Cetak Bluetooth (BLE)"}
                </button>
              )}

              <button
                onClick={() => handlePrint("browser")}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm font-medium"
              >
                <Printer size={16} />
                Cetak via Browser
              </button>

              <button
                onClick={async () => {
                  const ts = buildThermalSale();
                  if (!ts) return;
                  const settings = getPrintSettings();
                  if (!settings.kitchenEnabled) {
                    showMsg(
                      "error",
                      "Printer dapur belum diaktifkan di Pengaturan",
                    );
                    return;
                  }
                  const cats = getKitchenCategoryList(settings);
                  const kitchenItems = ts.items.filter((it) => {
                    if (!cats.length) return true;
                    return (
                      it.category && cats.includes(it.category.toLowerCase())
                    );
                  });
                  setPrinting(true);
                  const r = await printKitchenSerial(ts, kitchenItems);
                  setPrinting(false);
                  if (r.success) showMsg("success", "Ticket dapur dicetak");
                  else showMsg("error", r.error || "Gagal cetak dapur");
                }}
                disabled={printing}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white py-2.5 rounded-lg flex items-center justify-center gap-2 text-sm font-medium"
              >
                Cetak Ticket Dapur
              </button>

              <button
                onClick={() => setShowReceipt(false)}
                className="w-full bg-slate-100 text-slate-700 py-2 rounded-lg text-sm font-medium"
              >
                Tutup
              </button>

              <p className="text-xs text-slate-400 text-center">
                Atur default & auto-print di menu Pengaturan
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
