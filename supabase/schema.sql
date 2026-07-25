-- =============================================
-- KASIR POS - Supabase Schema
-- Jalankan di SQL Editor Supabase
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin', 'cashier')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Products / Items
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  barcode TEXT UNIQUE,
  price NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  cost NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  min_stock INTEGER NOT NULL DEFAULT 5 CHECK (min_stock >= 0),
  category TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sales / Transactions
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cashier_id UUID NOT NULL REFERENCES public.profiles(id),
  total NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'qris', 'transfer', 'card')),
  cash_received NUMERIC(15,2),
  change_amount NUMERIC(15,2),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sale Items
CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price NUMERIC(15,2) NOT NULL CHECK (price >= 0),
  subtotal NUMERIC(15,2) NOT NULL CHECK (subtotal >= 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_cashier ON public.sales(cashier_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON public.sale_items(product_id);

-- Auto update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'cashier')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admin can insert profiles"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can update any profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Products policies
CREATE POLICY "Authenticated can view products"
  ON public.products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin can manage products"
  ON public.products FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Sales policies
CREATE POLICY "Authenticated can view sales"
  ON public.sales FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert sales"
  ON public.sales FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = cashier_id);

-- Sale items policies
CREATE POLICY "Authenticated can view sale_items"
  ON public.sale_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert sale_items"
  ON public.sale_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Function to reduce stock after sale
CREATE OR REPLACE FUNCTION public.reduce_stock_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.products
  SET stock = stock - NEW.quantity
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_sale_item_insert
  AFTER INSERT ON public.sale_items
  FOR EACH ROW EXECUTE FUNCTION public.reduce_stock_on_sale();

-- Sample data (optional - uncomment if needed)
-- INSERT INTO public.products (name, barcode, price, cost, stock, min_stock, category) VALUES
-- ('Indomie Goreng', '8998866100010', 3500, 2800, 100, 10, 'Makanan'),
-- ('Aqua 600ml', '8996001300015', 4000, 3000, 50, 10, 'Minuman'),
-- ('Teh Botol Sosro', '8996001600010', 5000, 4000, 30, 5, 'Minuman');

-- Product status (active / inactive)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'inactive'));

CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);

-- =============================================
-- PPN / Tax columns + app_settings
-- =============================================

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.sales.subtotal IS 'Total sebelum PPN';
COMMENT ON COLUMN public.sales.tax_rate IS 'Persentase PPN saat transaksi (%)';
COMMENT ON COLUMN public.sales.tax_amount IS 'Nominal PPN';
COMMENT ON COLUMN public.sales.total IS 'Grand total (subtotal + tax jika exclusive)';

-- App settings (PPN rate, mode, dll.)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read settings" ON public.app_settings;
CREATE POLICY "Authenticated can read settings"
  ON public.app_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin can upsert settings" ON public.app_settings;
CREATE POLICY "Admin can upsert settings"
  ON public.app_settings FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Default PPN 11% exclusive (harga belum termasuk PPN)
INSERT INTO public.app_settings (key, value)
VALUES (
  'tax',
  '{"enabled": true, "rate": 11, "name": "PPN", "mode": "exclusive"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- Beban operasional (untuk Laba Rugi & Cash Flow)
-- =============================================
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL DEFAULT 'Operasional',
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'transfer', 'qris', 'card', 'other')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read expenses" ON public.expenses;
CREATE POLICY "Auth read expenses"
  ON public.expenses FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin manage expenses" ON public.expenses;
CREATE POLICY "Admin manage expenses"
  ON public.expenses FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Simpan cost saat jual (HPP historis)
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS cost NUMERIC(15,2) NOT NULL DEFAULT 0;

-- Opening balance defaults
INSERT INTO public.app_settings (key, value)
VALUES (
  'finance',
  '{"opening_cash": 0, "opening_equity": 0, "as_of": null}'::jsonb
)
ON CONFLICT (key) DO NOTHING;


-- See migration_ar_ap.sql for receivables & payables
