-- Master kategori produk
CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_categories_name ON public.product_categories(name);

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);

-- Seed dari kategori teks yang sudah ada
INSERT INTO public.product_categories (name)
SELECT DISTINCT trim(category)
FROM public.products
WHERE category IS NOT NULL AND trim(category) <> ''
ON CONFLICT (name) DO NOTHING;

UPDATE public.products p
SET category_id = c.id
FROM public.product_categories c
WHERE p.category IS NOT NULL
  AND lower(trim(p.category)) = lower(c.name)
  AND p.category_id IS NULL;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth read categories" ON public.product_categories;
CREATE POLICY "Auth read categories" ON public.product_categories
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin manage categories" ON public.product_categories;
CREATE POLICY "Admin manage categories" ON public.product_categories
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
