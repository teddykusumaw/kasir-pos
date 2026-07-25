CREATE TABLE IF NOT EXISTS public.receivables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'cancelled')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'cancelled')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receivables_status ON public.receivables(status);
CREATE INDEX IF NOT EXISTS idx_payables_status ON public.payables(status);

ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth read receivables" ON public.receivables;
CREATE POLICY "Auth read receivables" ON public.receivables FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin manage receivables" ON public.receivables;
CREATE POLICY "Admin manage receivables" ON public.receivables FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Auth read payables" ON public.payables;
CREATE POLICY "Auth read payables" ON public.payables FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin manage payables" ON public.payables;
CREATE POLICY "Admin manage payables" ON public.payables FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
