-- Remove venda de teste: Icaro Gava, produto Retatrutida, R$ 1.700
-- Criada apenas para teste e não deve aparecer nas métricas

DELETE FROM sales
WHERE product_name = 'Retatrutida'
  AND sale_amount BETWEEN 1600 AND 1800
  AND sale_status_enum = 'approved';
