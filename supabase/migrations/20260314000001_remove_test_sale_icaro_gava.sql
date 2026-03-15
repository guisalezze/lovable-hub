-- Remove venda de teste: Icaro Gava, R$ 1.700, projeto Educacional
-- Esta venda foi criada apenas para teste e não deve aparecer nas métricas

DO $$
DECLARE
  v_lead_email TEXT;
BEGIN
  -- Encontrar e remover a venda de teste
  -- Critérios: comprador Icaro Gava, valor ~1700, produto Retatrutida (ou similar)
  DELETE FROM sales
  WHERE (
    LOWER(lead_email) LIKE '%icaro%gava%'
    OR LOWER(lead_email) LIKE '%icarogava%'
    OR LOWER(lead_email) LIKE '%icaro.gava%'
  )
  AND sale_amount BETWEEN 1600 AND 1800;

  -- Também tentar por nome completo caso o email não bata
  DELETE FROM sales
  WHERE LOWER(lead_name) LIKE '%icaro%gava%'
    AND sale_amount BETWEEN 1600 AND 1800;
END;
$$;
