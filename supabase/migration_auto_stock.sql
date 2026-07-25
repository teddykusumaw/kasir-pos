-- Manajemen stok otomatis: trigger + log pergerakan

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty_change INTEGER NOT NULL,
  stock_after INTEGER,
  reason TEXT NOT NULL, -- sale | purchase | adjustment | return
  ref_id UUID,
  note TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product
  ON public.stock_movements(product_id, created_at DESC);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth read stock_movements" ON public.stock_movements;
CREATE POLICY "Auth read stock_movements" ON public.stock_movements
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Auth write stock_movements" ON public.stock_movements;
CREATE POLICY "Auth write stock_movements" ON public.stock_movements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Kurangi stok otomatis saat sale_items masuk
CREATE OR REPLACE FUNCTION public.fn_sale_item_decrease_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_stock INTEGER;
BEGIN
  UPDATE public.products
  SET stock = GREATEST(0, stock - NEW.quantity),
      updated_at = NOW()
  WHERE id = NEW.product_id
  RETURNING stock INTO new_stock;

  INSERT INTO public.stock_movements (product_id, qty_change, stock_after, reason, ref_id, note)
  VALUES (NEW.product_id, -NEW.quantity, new_stock, 'sale', NEW.sale_id, 'Auto dari penjualan');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_item_stock ON public.sale_items;
CREATE TRIGGER trg_sale_item_stock
  AFTER INSERT ON public.sale_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sale_item_decrease_stock();

-- Naikkan stok otomatis saat purchase_items masuk
CREATE OR REPLACE FUNCTION public.fn_purchase_item_increase_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_stock INTEGER;
BEGIN
  UPDATE public.products
  SET stock = stock + NEW.quantity,
      cost = CASE WHEN NEW.unit_cost > 0 THEN NEW.unit_cost ELSE cost END,
      updated_at = NOW()
  WHERE id = NEW.product_id
  RETURNING stock INTO new_stock;

  INSERT INTO public.stock_movements (product_id, qty_change, stock_after, reason, ref_id, note)
  VALUES (NEW.product_id, NEW.quantity, new_stock, 'purchase', NEW.purchase_id, 'Auto dari pembelian');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_item_stock ON public.purchase_items;
CREATE TRIGGER trg_purchase_item_stock
  AFTER INSERT ON public.purchase_items
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_purchase_item_increase_stock();
