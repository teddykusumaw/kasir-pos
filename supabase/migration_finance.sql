-- Migrasi: Beban + cost pada sale_items + finance settings
-- Jalankan di SQL Editor Supabase

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) NOT NULL DEFAULT 0;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS cost NUMERIC(15,2) NOT NULL DEFAULT 0;

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

INSERT INTO public.app_settings (key, value)
VALUES (
  'tax',
  '{"enabled": true, "rate": 11, "name": "PPN", "mode": "exclusive"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings (key, value)
VALUES (
  'finance',
  '{"opening_cash": 0, "opening_equity": 0, "as_of": null}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
