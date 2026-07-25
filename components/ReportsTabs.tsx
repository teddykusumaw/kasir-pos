"use client";

import { useState } from "react";
import { Profile } from "@/types/database";
import ReportsClient from "./ReportsClient";
import FinancialReportsClient from "./FinancialReportsClient";

interface Props {
  profile: Profile;
}

export default function ReportsTabs({ profile }: Props) {
  const [tab, setTab] = useState<"sales" | "finance">("sales");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("sales")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === "sales"
              ? "bg-primary-600 text-white"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          Laporan Penjualan
        </button>
        <button
          type="button"
          onClick={() => setTab("finance")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            tab === "finance"
              ? "bg-primary-600 text-white"
              : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          Laporan Keuangan
        </button>
      </div>

      {tab === "sales" ? (
        <ReportsClient />
      ) : (
        <FinancialReportsClient profile={profile} />
      )}
    </div>
  );
}
