-- ============================================================
-- KASIR POS — RLS policies lengkap (siap tempel di Supabase)
-- Jalankan di SQL Editor setelah schema/migrasi tabel ada
-- ============================================================

-- Helper: cek admin tanpa recursion bermasalah pada profiles
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT auth.uid() IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_authenticated() TO authenticated;

-- ------------------------------------------------------------
-- PROFILES
-- ------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_admin_insert"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR id = auth.uid());

-- ------------------------------------------------------------
-- PRODUCTS
-- ------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select_auth" ON public.products;
DROP POLICY IF EXISTS "products_write_admin" ON public.products;
DROP POLICY IF EXISTS "Auth read products" ON public.products;
DROP POLICY IF EXISTS "Admin manage products" ON public.products;

CREATE POLICY "products_select_auth"
  ON public.products FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "products_write_admin"
  ON public.products FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Kasir boleh update stok saja lewat trigger; update manual stok dari POS
-- diizinkan untuk authenticated pada UPDATE (opsional longgar):
DROP POLICY IF EXISTS "products_update_stock_auth" ON public.products;
CREATE POLICY "products_update_stock_auth"
  ON public.products FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------
-- PRODUCT CATEGORIES
-- ------------------------------------------------------------
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_select_auth" ON public.product_categories;
DROP POLICY IF EXISTS "categories_write_admin" ON public.product_categories;
DROP POLICY IF EXISTS "Auth read categories" ON public.product_categories;
DROP POLICY IF EXISTS "Admin manage categories" ON public.product_categories;

CREATE POLICY "categories_select_auth"
  ON public.product_categories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "categories_write_admin"
  ON public.product_categories FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- SUPPLIERS
-- ------------------------------------------------------------
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_select_auth" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_write_admin" ON public.suppliers;
DROP POLICY IF EXISTS "Auth read suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Admin manage suppliers" ON public.suppliers;

CREATE POLICY "suppliers_select_auth"
  ON public.suppliers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "suppliers_write_admin"
  ON public.suppliers FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- SALES + SALE ITEMS
-- ------------------------------------------------------------
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_select_auth" ON public.sales;
DROP POLICY IF EXISTS "sales_insert_auth" ON public.sales;
DROP POLICY IF EXISTS "sales_admin_all" ON public.sales;
DROP POLICY IF EXISTS "sale_items_select_auth" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_insert_auth" ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_admin_all" ON public.sale_items;

CREATE POLICY "sales_select_auth"
  ON public.sales FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "sales_insert_auth"
  ON public.sales FOR INSERT TO authenticated
  WITH CHECK (cashier_id = auth.uid() OR public.is_admin());

CREATE POLICY "sales_admin_update_delete"
  ON public.sales FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "sale_items_select_auth"
  ON public.sale_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "sale_items_insert_auth"
  ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "sale_items_admin_all"
  ON public.sale_items FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- PURCHASES + PURCHASE ITEMS
-- ------------------------------------------------------------
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchases_select_auth" ON public.purchases;
DROP POLICY IF EXISTS "purchases_write_admin" ON public.purchases;
DROP POLICY IF EXISTS "purchase_items_select_auth" ON public.purchase_items;
DROP POLICY IF EXISTS "purchase_items_write_admin" ON public.purchase_items;
DROP POLICY IF EXISTS "Auth read purchases" ON public.purchases;
DROP POLICY IF EXISTS "Admin manage purchases" ON public.purchases;
DROP POLICY IF EXISTS "Auth read purchase_items" ON public.purchase_items;
DROP POLICY IF EXISTS "Admin manage purchase_items" ON public.purchase_items;

CREATE POLICY "purchases_select_auth"
  ON public.purchases FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "purchases_write_admin"
  ON public.purchases FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "purchase_items_select_auth"
  ON public.purchase_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "purchase_items_write_admin"
  ON public.purchase_items FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- STOCK BATCHES
-- ------------------------------------------------------------
ALTER TABLE public.stock_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "batches_select_auth" ON public.stock_batches;
DROP POLICY IF EXISTS "batches_write_auth" ON public.stock_batches;
DROP POLICY IF EXISTS "Auth read batches" ON public.stock_batches;
DROP POLICY IF EXISTS "Auth write batches" ON public.stock_batches;

CREATE POLICY "batches_select_auth"
  ON public.stock_batches FOR SELECT TO authenticated
  USING (true);

-- Kasir/admin boleh insert/update batch (FIFO + restock)
CREATE POLICY "batches_write_auth"
  ON public.stock_batches FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------
-- STOCK MOVEMENTS
-- ------------------------------------------------------------
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stock_movements_select_auth" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_write_auth" ON public.stock_movements;
DROP POLICY IF EXISTS "Auth read stock_movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Auth write stock_movements" ON public.stock_movements;

CREATE POLICY "stock_movements_select_auth"
  ON public.stock_movements FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stock_movements_write_auth"
  ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "stock_movements_admin_all"
  ON public.stock_movements FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- STOCKOUT EVENTS
-- ------------------------------------------------------------
ALTER TABLE public.stockout_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stockout_select_auth" ON public.stockout_events;
DROP POLICY IF EXISTS "stockout_write_auth" ON public.stockout_events;
DROP POLICY IF EXISTS "Auth stockout" ON public.stockout_events;

CREATE POLICY "stockout_select_auth"
  ON public.stockout_events FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "stockout_write_auth"
  ON public.stockout_events FOR INSERT TO authenticated
  WITH CHECK (true);

-- ------------------------------------------------------------
-- EXPENSES
-- ------------------------------------------------------------
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses_select_auth" ON public.expenses;
DROP POLICY IF EXISTS "expenses_write_admin" ON public.expenses;

CREATE POLICY "expenses_select_auth"
  ON public.expenses FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "expenses_write_admin"
  ON public.expenses FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- RECEIVABLES (piutang)
-- ------------------------------------------------------------
ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receivables_select_auth" ON public.receivables;
DROP POLICY IF EXISTS "receivables_write_auth" ON public.receivables;

CREATE POLICY "receivables_select_auth"
  ON public.receivables FOR SELECT TO authenticated
  USING (true);

-- Kasir boleh buat piutang tempo; admin full
CREATE POLICY "receivables_insert_auth"
  ON public.receivables FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "receivables_update_auth"
  ON public.receivables FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "receivables_admin_delete"
  ON public.receivables FOR DELETE TO authenticated
  USING (public.is_admin());

-- ------------------------------------------------------------
-- PAYABLES (hutang)
-- ------------------------------------------------------------
ALTER TABLE public.payables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payables_select_auth" ON public.payables;
DROP POLICY IF EXISTS "payables_write_admin" ON public.payables;

CREATE POLICY "payables_select_auth"
  ON public.payables FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payables_write_admin"
  ON public.payables FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- APP SETTINGS
-- ------------------------------------------------------------
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_select_auth" ON public.app_settings;
DROP POLICY IF EXISTS "settings_write_admin" ON public.app_settings;

CREATE POLICY "settings_select_auth"
  ON public.app_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "settings_write_admin"
  ON public.app_settings FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------
-- VIEW (jika ada v_supplier_ledger)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'v_supplier_ledger'
  ) THEN
    GRANT SELECT ON public.v_supplier_ledger TO authenticated;
  END IF;
END $$;

-- ------------------------------------------------------------
-- Pastikan role authenticated bisa akses schema
-- ------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Trigger functions tetap SECURITY DEFINER (stok otomatis)
-- (tidak diubah di sini jika sudah ada di migration_auto_stock)

-- ============================================================
-- SELESAI
-- Cek:
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' ORDER BY 1, 2;
-- ============================================================
