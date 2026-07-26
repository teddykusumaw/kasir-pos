export type UserRole = "admin" | "cashier";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

/** Status jual produk */
export type ProductStatus = "active" | "inactive";

/** Master kategori produk */
export interface ProductCategory {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

/** Master supplier */
export interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Produk (master + stok)
 * Relasi opsional: supplier, category_rel (hasil join)
 */
export interface Product {
  id: string;
  name: string;
  barcode: string | null;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  /** Label kategori (denormalized, kompatibel filter lama) */
  category: string | null;
  /** FK ke product_categories */
  category_id: string | null;
  unit: string;
  status: ProductStatus;
  /** FK ke suppliers */
  supplier_id: string | null;
  created_at: string;
  updated_at: string;
  /** Join opsional */
  supplier?: Pick<Supplier, "id" | "name"> | Supplier | null;
  category_rel?: Pick<ProductCategory, "id" | "name"> | ProductCategory | null;
}

/** Payload insert/update produk (form) */
export interface ProductInput {
  name: string;
  barcode?: string | null;
  price: number;
  cost?: number;
  stock?: number;
  min_stock?: number;
  category?: string | null;
  category_id?: string | null;
  unit?: string;
  status?: ProductStatus;
  supplier_id?: string | null;
}

/** Baris partial dari query select terbatas (barcode lookup) */
export type ProductPartial = Partial<Product> &
  Pick<Product, "id" | "name">;

/** Log pergerakan stok */
export interface StockMovement {
  id: string;
  product_id: string;
  qty_change: number;
  stock_after: number | null;
  reason: "sale" | "purchase" | "adjustment" | "return" | string;
  ref_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  product?: Pick<Product, "id" | "name" | "barcode"> | null;
}

export interface Sale {
  id: string;
  cashier_id: string;
  /** Total sebelum PPN */
  subtotal: number;
  /** Persentase PPN saat transaksi */
  tax_rate: number;
  /** Nominal PPN */
  tax_amount: number;
  /** Grand total */
  total: number;
  payment_method: string;
  cash_received: number | null;
  change_amount: number | null;
  note: string | null;
  created_at: string;
  cashier?: Profile;
  items?: SaleItem[];
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  price: number;
  subtotal: number;
  product?: Product;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface SalesReportRow {
  id: string;
  created_at: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  payment_method: string;
  cashier_name: string;
  item_count: number;
}

export interface TopProduct {
  product_id: string;
  product_name: string;
  total_qty: number;
  total_revenue: number;
}

export interface DailySales {
  date: string;
  total: number;
  count: number;
}


export interface Expense {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  payment_method: string;
  created_by: string | null;
  created_at: string;
}


export interface Receivable {
  id: string;
  contact_name: string;
  description: string;
  amount: number;
  amount_paid: number;
  due_date: string | null;
  status: "open" | "partial" | "paid" | "cancelled";
  created_by: string | null;
  created_at: string;
}

export type Payable = Receivable;

