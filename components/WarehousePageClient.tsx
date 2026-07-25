"use client";

import { useState } from "react";
import { Product, Profile, Supplier } from "@/types/database";
import WarehouseClient from "./WarehouseClient";
import ForecastClient from "./ForecastClient";

export default function WarehousePageClient({
  profile,
  products,
  suppliers = [],
  deliveryByProduct = {},
}: {
  profile: Profile;
  products: Product[];
  suppliers?: Supplier[];
  deliveryByProduct?: Record<string, string>;
}) {
  const [tab, setTab] = useState<"stok" | "forecast">("stok");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("stok")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "stok"
              ? "bg-primary-600 text-white"
              : "bg-white border text-slate-600"
          }`}
        >
          Stok Warehouse
        </button>
        <button
          type="button"
          onClick={() => setTab("forecast")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "forecast"
              ? "bg-primary-600 text-white"
              : "bg-white border text-slate-600"
          }`}
        >
          Forecast Restock
        </button>
      </div>
      {tab === "stok" ? (
        <WarehouseClient
          products={products}
          suppliers={suppliers}
          deliveryByProduct={deliveryByProduct}
        />
      ) : (
        <ForecastClient profile={profile} />
      )}
    </div>
  );
}
