import type { Product } from "@/types/database";

export type ProductRow = {
  id: string;
  name: string;
  barcode?: string | null;
  price?: number | null;
  cost?: number | null;
  stock?: number | null;
  min_stock?: number | null;
  category?: string | null;
  category_id?: string | null;
  unit?: string | null;
  status?: string | null;
  supplier_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export function mapToProduct(
  row: ProductRow | null | undefined,
): Product | null {
  if (!row?.id || !row.name) return null;

  const status = row.status === "inactive" ? "inactive" : "active";

  return {
    id: row.id,
    name: row.name,
    barcode: row.barcode ?? null,
    price: Number(row.price ?? 0),
    cost: Number(row.cost ?? 0),
    stock: Number(row.stock ?? 0),
    min_stock: Number(row.min_stock ?? 0),
    category: row.category ?? null,
    category_id: row.category_id ?? null,
    unit: row.unit ?? "pcs",
    status,
    supplier_id: row.supplier_id ?? null,
    created_at: row.created_at ?? new Date(0).toISOString(),
    updated_at: row.updated_at ?? new Date(0).toISOString(),
  };
}
