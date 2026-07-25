"use client";

import { useState } from "react";
import { Profile } from "@/types/database";
import SuppliersClient from "./SuppliersClient";
import SupplierLedgerClient from "./SupplierLedgerClient";

export default function SuppliersPageClient({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<"data" | "rekap">("data");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("data")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "data" ? "bg-primary-600 text-white" : "bg-white border text-slate-600"
          }`}
        >
          Data Supplier
        </button>
        <button
          type="button"
          onClick={() => setTab("rekap")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "rekap" ? "bg-primary-600 text-white" : "bg-white border text-slate-600"
          }`}
        >
          Rekap & Hutang
        </button>
      </div>
      {tab === "data" ? (
        <SuppliersClient profile={profile} />
      ) : (
        <SupplierLedgerClient />
      )}
    </div>
  );
}
