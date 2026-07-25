/**
 * Query helper join supplier — pilih kolom minimal, hindari select("*")
 */

/** Kolom produk untuk list + join supplier/kategori */
export const PRODUCT_LIST_SELECT = [
  "id",
  "name",
  "barcode",
  "price",
  "cost",
  "stock",
  "min_stock",
  "category",
  "category_id",
  "unit",
  "status",
  "supplier_id",
  "created_at",
  "updated_at",
  "suppliers!products_supplier_id_fkey(id, name)",
  "product_categories!products_category_id_fkey(id, name)",
].join(", ");

/** Alternatif embed tanpa nama constraint (PostgREST default) */
export const PRODUCT_LIST_SELECT_SIMPLE =
  "id, name, barcode, price, cost, stock, min_stock, category, category_id, unit, status, supplier_id, created_at, updated_at, suppliers(id, name), product_categories(id, name)";

/** Warehouse: stok + supplier filter */
export const PRODUCT_WAREHOUSE_SELECT =
  "id, name, barcode, price, cost, stock, min_stock, category, unit, status, supplier_id";

/** Dropdown produk di form pembelian */
export const PRODUCT_OPTION_SELECT = "id, name, cost, stock, supplier_id";

/** Supplier untuk dropdown */
export const SUPPLIER_OPTION_SELECT =
  "id, name, contact_person, phone, is_active";

/** Supplier full (halaman master) */
export const SUPPLIER_FULL_SELECT =
  "id, name, contact_person, phone, email, address, notes, is_active, created_at, updated_at";

/** List pembelian + nama supplier + qty item */
export const PURCHASE_LIST_SELECT =
  "id, supplier_id, purchase_date, invoice_no, subtotal, amount_paid, status, notes, created_at, suppliers(id, name), purchase_items(quantity)";

/** Rekap ledger — tanpa * */
export const PURCHASE_LEDGER_SELECT =
  "id, supplier_id, subtotal, amount_paid, status, purchase_date, suppliers(name), purchase_items(quantity)";

/** Batch delivery date per produk (latest) */
export const BATCH_DELIVERY_SELECT =
  "product_id, delivery_date, received_at, supplier_id";

export function mapProductJoins<T extends Record<string, any>>(rows: T[] | null) {
  return (rows || []).map((p) => ({
    ...p,
    supplier: p.suppliers ?? null,
    category_rel: p.product_categories ?? null,
    category: p.category || p.product_categories?.name || null,
  }));
}
