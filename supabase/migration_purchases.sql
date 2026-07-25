-- Pembelian dari supplier (untuk stok + hutang)
CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_no TEXT,
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'partial', 'paid', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON public.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON public.purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON public.purchase_items(purchase_id);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read purchases" ON public.purchases;
CREATE POLICY "Auth read purchases" ON public.purchases
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin manage purchases" ON public.purchases;
CREATE POLICY "Admin manage purchases" ON public.purchases
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Auth read purchase_items" ON public.purchase_items;
CREATE POLICY "Auth read purchase_items" ON public.purchase_items
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin manage purchase_items" ON public.purchase_items;
CREATE POLICY "Admin manage purchase_items" ON public.purchase_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Optional: link payables to supplier
ALTER TABLE public.payables
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;
ALTER TABLE public.payables
  ADD COLUMN IF NOT EXISTS purchase_id UUID REFERENCES public.purchases(id) ON DELETE SET NULL;
