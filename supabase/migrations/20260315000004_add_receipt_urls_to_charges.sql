-- Add receipt URL fields for PIX payment proofs
-- entry_receipt_url: comprovante da entrada (se for PIX)
-- receipt_url: comprovante de cada parcela (se for PIX)

ALTER TABLE public.charges
  ADD COLUMN IF NOT EXISTS entry_receipt_url text DEFAULT NULL;

ALTER TABLE public.charge_installments
  ADD COLUMN IF NOT EXISTS receipt_url text DEFAULT NULL;

COMMENT ON COLUMN public.charges.entry_receipt_url IS 'URL do comprovante PIX da entrada (upload opcional)';
COMMENT ON COLUMN public.charge_installments.receipt_url IS 'URL do comprovante PIX da parcela (upload opcional)';
