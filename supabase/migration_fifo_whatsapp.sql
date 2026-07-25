-- FIFO stock batches
CREATE TABLE IF NOT EXISTS public.stock_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty_remaining INTEGER NOT NULL CHECK (qty_remaining >= 0),
  qty_initial INTEGER NOT NULL CHECK (qty_initial > 0),
  unit_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_batches_product_fifo
  ON public.stock_batches(product_id, received_at ASC)
  WHERE qty_remaining > 0;

ALTER TABLE public.stock_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth read batches" ON public.stock_batches;
CREATE POLICY "Auth read batches" ON public.stock_batches FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Auth write batches" ON public.stock_batches;
CREATE POLICY "Auth write batches" ON public.stock_batches FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Stockout log (untuk forecast sold-out)
CREATE TABLE IF NOT EXISTS public.stockout_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stockout_product ON public.stockout_events(product_id, occurred_at DESC);

ALTER TABLE public.stockout_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth stockout" ON public.stockout_events;
CREATE POLICY "Auth stockout" ON public.stockout_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed batch dari stok produk yang ada (sekali)
INSERT INTO public.stock_batches (product_id, qty_remaining, qty_initial, unit_cost, received_at, note)
SELECT id, stock, GREATEST(stock, 1), cost, NOW(), 'Migrasi awal'
FROM public.products
WHERE stock > 0
  AND NOT EXISTS (SELECT 1 FROM public.stock_batches b WHERE b.product_id = products.id);

INSERT INTO public.app_settings (key, value)
VALUES (
  'whatsapp',
  '{"enabled": false, "phone": "", "provider": "fonnte", "api_token": "", "notify_restock": true, "notify_debt_due": true}'::jsonb
)
ON CONFLICT (key) DO NOTHING;
