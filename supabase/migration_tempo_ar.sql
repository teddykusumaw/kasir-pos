-- Izinkan metode bayar tempo + tautan sale ke piutang
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method IN ('cash', 'qris', 'transfer', 'card', 'tempo'));

ALTER TABLE public.receivables
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL;

ALTER TABLE public.payables
  ADD COLUMN IF NOT EXISTS reference TEXT;

CREATE INDEX IF NOT EXISTS idx_receivables_sale ON public.receivables(sale_id);
CREATE INDEX IF NOT EXISTS idx_receivables_contact ON public.receivables(contact_name);
CREATE INDEX IF NOT EXISTS idx_payables_contact ON public.payables(contact_name);
