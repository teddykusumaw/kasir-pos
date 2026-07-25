"use client";

import { formatCurrency, formatDate } from "@/lib/utils";

interface ReceiptProps {
  sale: {
    id: string;
    total: number;
    subtotal?: number;
    tax_rate?: number;
    tax_amount?: number;
    tax_name?: string;
    payment_method: string;
    cash_received?: number | null;
    change_amount?: number | null;
    created_at: string;
    cashier?: { full_name: string };
    items: {
      product: { name: string; price: number };
      quantity: number;
      subtotal: number;
    }[];
  };
}

export default function Receipt({ sale }: ReceiptProps) {
  const hasTax = (sale.tax_amount || 0) > 0;

  return (
    <div className="receipt-print p-4 font-mono text-sm">
      <div className="text-center mb-4">
        <h2 className="text-lg font-bold">TOKO ANDA</h2>
        <p className="text-xs text-slate-500">Jl. Contoh No. 123</p>
        <p className="text-xs text-slate-500">Telp: 0812-3456-7890</p>
      </div>

      <div className="border-t border-b border-dashed border-slate-300 py-2 mb-3 text-xs space-y-0.5">
        <div className="flex justify-between">
          <span>No:</span>
          <span>{sale.id.slice(0, 8).toUpperCase()}</span>
        </div>
        <div className="flex justify-between">
          <span>Tanggal:</span>
          <span>{formatDate(sale.created_at)}</span>
        </div>
        <div className="flex justify-between">
          <span>Kasir:</span>
          <span>{sale.cashier?.full_name || "-"}</span>
        </div>
      </div>

      <div className="space-y-2 mb-3">
        {sale.items.map((item, i) => (
          <div key={i}>
            <p className="font-medium">{item.product.name}</p>
            <div className="flex justify-between text-xs text-slate-600">
              <span>
                {item.quantity} x {formatCurrency(item.product.price)}
              </span>
              <span>{formatCurrency(item.subtotal)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-slate-300 pt-2 space-y-1 text-sm">
        {hasTax && (
          <>
            <div className="flex justify-between text-xs">
              <span>Subtotal</span>
              <span>{formatCurrency(sale.subtotal ?? sale.total)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>
                {sale.tax_name || "PPN"} ({sale.tax_rate || 0}%)
              </span>
              <span>{formatCurrency(sale.tax_amount || 0)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between font-bold text-base">
          <span>TOTAL</span>
          <span>{formatCurrency(sale.total)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span>Bayar ({sale.payment_method})</span>
          <span>
            {sale.payment_method === "cash" && sale.cash_received
              ? formatCurrency(sale.cash_received)
              : formatCurrency(sale.total)}
          </span>
        </div>
        {sale.payment_method === "cash" && sale.change_amount != null && (
          <div className="flex justify-between text-xs">
            <span>Kembalian</span>
            <span>{formatCurrency(sale.change_amount)}</span>
          </div>
        )}
      </div>

      <div className="text-center mt-6 text-xs text-slate-500">
        <p>Terima kasih atas kunjungan Anda</p>
        <p className="mt-1">Barang yang sudah dibeli tidak dapat dikembalikan</p>
      </div>
    </div>
  );
}
