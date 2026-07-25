-- Index optimasi filter/join supplier
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON public.products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_stock_batches_product_delivery
  ON public.stock_batches(product_id, delivery_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_date
  ON public.purchases(supplier_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON public.purchases(status);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON public.purchase_items(product_id);

-- View rekap supplier (agregasi di DB, lebih ringan dari loop client)
CREATE OR REPLACE VIEW public.v_supplier_ledger AS
SELECT
  s.id AS supplier_id,
  s.name AS supplier_name,
  COUNT(p.id)::int AS purchase_count,
  COALESCE(SUM(pi_agg.qty), 0)::bigint AS qty_items,
  COALESCE(SUM(p.subtotal), 0)::numeric AS total_purchase,
  COALESCE(SUM(p.amount_paid), 0)::numeric AS total_paid,
  COALESCE(SUM(p.subtotal - p.amount_paid), 0)::numeric AS remaining
FROM public.suppliers s
LEFT JOIN public.purchases p
  ON p.supplier_id = s.id AND p.status IS DISTINCT FROM 'cancelled'
LEFT JOIN (
  SELECT purchase_id, SUM(quantity)::bigint AS qty
  FROM public.purchase_items
  GROUP BY purchase_id
) pi_agg ON pi_agg.purchase_id = p.id
GROUP BY s.id, s.name;

-- RLS view mengikuti tabel dasar (security invoker di PG15+)
-- Untuk Supabase: grant select ke authenticated
GRANT SELECT ON public.v_supplier_ledger TO authenticated;
