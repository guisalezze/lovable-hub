
-- Insert lead
INSERT INTO public.leads (email, full_name, phone_e164, phone_formatted, status, last_product, last_sale_amount, last_sale_status_enum, last_date_approved, last_date_created, source)
VALUES ('icaro.gava@outlook.com', 'Icaro Gava', '+5527995296860', '(27) 99529-6860', 'comprou', 'Retatrutida', 1700, 'approved', now(), now(), 'manual');

-- Insert sale
INSERT INTO public.sales (lead_email, code, product_name, product_code, sale_amount, sale_status_enum, date_created, date_approved, payment_type_enum)
VALUES ('icaro.gava@outlook.com', 'MANUAL-' || gen_random_uuid(), 'Retatrutida', 'reta-40mg', 1700, 'approved', now(), now(), 'one_time');
