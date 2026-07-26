-- FIFO batch + expiry management
ALTER TABLE public.stock_batches
  ADD COLUMN IF NOT EXISTS expiry_date DATE;

CREATE INDEX IF NOT EXISTS idx_batches_expiry
  ON public.stock_batches(product_id, expiry_date ASC NULLS LAST)
  WHERE qty_remaining > 0;

CREATE INDEX IF NOT EXISTS idx_batches_fifo
  ON public.stock_batches(product_id, received_at ASC)
  WHERE qty_remaining > 0;

COMMENT ON COLUMN public.stock_batches.expiry_date IS 'Tanggal kedaluwarsa batch; NULL = tidak ada ED';
