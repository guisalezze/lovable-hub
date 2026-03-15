-- Adiciona coluna paid_amount para rastrear quanto já foi recebido em cada mentoria/implementação
ALTER TABLE public.implementations
  ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.implementations.paid_amount IS 'Valor já recebido do cliente (entradas + parcelas PIX confirmadas)';
