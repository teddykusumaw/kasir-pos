"use client";

import { useState } from "react";
import { Product, Profile } from "@/types/database";
import ProductsClient from "./ProductsClient";
import CategoriesClient from "./CategoriesClient";

export default function ProductsPageClient({
  profile,
  initialProducts,
}: {
  profile: Profile;
  initialProducts: Product[];
}) {
  const [tab, setTab] = useState<"produk" | "kategori">("produk");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("produk")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "produk"
              ? "bg-primary-600 text-white"
              : "bg-white border text-slate-600"
          }`}
        >
          Produk
        </button>
        <button
          type="button"
          onClick={() => setTab("kategori")}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            tab === "kategori"
              ? "bg-primary-600 text-white"
              : "bg-white border text-slate-600"
          }`}
        >
          Kategori
        </button>
      </div>
      {tab === "produk" ? (
        <ProductsClient initialProducts={initialProducts} />
      ) : (
        <CategoriesClient profile={profile} />
      )}
    </div>
  );
}
