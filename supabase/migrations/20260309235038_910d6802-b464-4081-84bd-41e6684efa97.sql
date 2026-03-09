
-- Reprocess all webhook_logs from Feb 2026 to repopulate leads and sales
-- This uses a DO block to iterate webhook_logs and upsert correctly

DO $$
DECLARE
  r RECORD;
  v_email TEXT;
  v_name TEXT;
  v_phone TEXT;
  v_city TEXT;
  v_state TEXT;
  v_country TEXT;
  v_code TEXT;
  v_amount NUMERIC;
  v_raw_status TEXT;
  v_sale_status TEXT;
  v_raw_payment_type TEXT;
  v_payment_type TEXT;
  v_raw_payment_method TEXT;
  v_payment_method TEXT;
  v_product_name TEXT;
  v_product_code TEXT;
  v_plan_code TEXT;
  v_plan_name TEXT;
  v_date_created TIMESTAMPTZ;
  v_date_approved TIMESTAMPTZ;
  v_billet_url TEXT;
  v_lead_status TEXT;
  v_utm_source TEXT;
  v_utm_medium TEXT;
  v_utm_campaign TEXT;
  v_checkout_type TEXT;
  v_sale_status_detail TEXT;
BEGIN
  FOR r IN
    SELECT payload, created_at
    FROM webhook_logs
    WHERE source = 'perfectpay'
      AND created_at >= '2026-02-01'
    ORDER BY created_at ASC
  LOOP
    v_email := LOWER(TRIM(r.payload->'customer'->>'email'));
    
    -- Skip invalid emails
    IF v_email IS NULL OR v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      CONTINUE;
    END IF;
    
    v_name := r.payload->'customer'->>'full_name';
    v_phone := COALESCE(r.payload->'customer'->>'phone_formated_ddi', r.payload->'customer'->>'phone_formated');
    v_city := r.payload->'customer'->>'city';
    v_state := r.payload->'customer'->>'state';
    v_country := r.payload->'customer'->>'country';
    v_code := COALESCE(r.payload->>'code', 'PP-' || EXTRACT(EPOCH FROM r.created_at)::TEXT);
    v_amount := COALESCE((r.payload->>'sale_amount')::NUMERIC, 0);
    v_product_name := r.payload->'product'->>'name';
    v_product_code := r.payload->'product'->>'code';
    v_plan_code := r.payload->'plan'->>'code';
    v_plan_name := r.payload->'plan'->>'name';
    v_billet_url := r.payload->>'billet_url';
    v_checkout_type := COALESCE(r.payload->>'checkout_type_enum', 'default');
    v_sale_status_detail := r.payload->>'sale_status_detail';
    v_utm_source := r.payload->'metadata'->>'utm_source';
    v_utm_medium := r.payload->'metadata'->>'utm_medium';
    v_utm_campaign := r.payload->'metadata'->>'utm_campaign';
    
    -- Parse date_created
    BEGIN
      v_date_created := (r.payload->>'date_created')::TIMESTAMPTZ;
    EXCEPTION WHEN OTHERS THEN
      v_date_created := r.created_at;
    END;
    
    BEGIN
      v_date_approved := (r.payload->>'date_approved')::TIMESTAMPTZ;
    EXCEPTION WHEN OTHERS THEN
      v_date_approved := NULL;
    END;
    
    -- Map numeric sale_status_enum
    v_raw_status := r.payload->>'sale_status_enum';
    v_sale_status := CASE v_raw_status
      WHEN '0' THEN 'none'
      WHEN '1' THEN 'pending'
      WHEN '2' THEN 'approved'
      WHEN '3' THEN 'in_process'
      WHEN '4' THEN 'in_mediation'
      WHEN '5' THEN 'rejected'
      WHEN '6' THEN 'cancelled'
      WHEN '7' THEN 'refunded'
      WHEN '9' THEN 'charged_back'
      WHEN '11' THEN 'checkout_error'
      WHEN '12' THEN 'abandono'
      WHEN '13' THEN 'expired'
      WHEN '16' THEN 'in_review'
      WHEN '17' THEN 'pre_chargeback'
      WHEN '18' THEN 'pre_refunded'
      ELSE COALESCE(v_raw_status, 'none')
    END;
    
    -- Map payment_type_enum
    v_raw_payment_type := r.payload->>'payment_type_enum';
    v_payment_type := CASE v_raw_payment_type
      WHEN '0' THEN 'none'
      WHEN '1' THEN 'credit_card'
      WHEN '2' THEN 'ticket'
      WHEN '3' THEN 'paypal'
      WHEN '4' THEN 'credit_card_recurrent'
      WHEN '5' THEN 'free_price'
      WHEN '6' THEN 'credit_card_upsell'
      WHEN '7' THEN 'pix'
      ELSE COALESCE(v_raw_payment_type, 'none')
    END;
    
    -- Map payment_method_enum
    v_raw_payment_method := r.payload->>'payment_method_enum';
    v_payment_method := CASE v_raw_payment_method
      WHEN '0' THEN 'none'
      WHEN '1' THEN 'visa'
      WHEN '2' THEN 'bolbradesco'
      WHEN '3' THEN 'amex'
      WHEN '4' THEN 'elo'
      WHEN '5' THEN 'hipercard'
      WHEN '6' THEN 'master'
      WHEN '7' THEN 'melicard'
      WHEN '9' THEN 'pix'
      ELSE COALESCE(v_raw_payment_method, 'none')
    END;
    
    -- Determine lead status
    v_lead_status := CASE
      WHEN v_sale_status = 'approved' THEN 'comprou'
      WHEN v_sale_status IN ('pending', 'in_process', 'in_review') THEN 'quase_comprou'
      WHEN v_sale_status IN ('refunded', 'charged_back', 'cancelled', 'rejected', 'pre_chargeback', 'pre_refunded') THEN 'perdido'
      ELSE 'novo'
    END;
    
    -- Upsert lead
    INSERT INTO leads (email, full_name, phone_e164, phone_formatted, city, state, country,
      last_sale_status_enum, last_sale_amount, last_product, last_date_created, last_date_approved,
      last_payment_type, last_billet_url, utm_source, utm_medium, utm_campaign, status)
    VALUES (v_email, v_name, v_phone, v_phone, v_city, v_state, v_country,
      v_sale_status, v_amount, v_product_name, v_date_created, v_date_approved,
      v_payment_type, v_billet_url, v_utm_source, v_utm_medium, v_utm_campaign, v_lead_status::lead_status)
    ON CONFLICT (email) DO UPDATE SET
      full_name = COALESCE(EXCLUDED.full_name, leads.full_name),
      phone_e164 = COALESCE(EXCLUDED.phone_e164, leads.phone_e164),
      phone_formatted = COALESCE(EXCLUDED.phone_formatted, leads.phone_formatted),
      city = COALESCE(EXCLUDED.city, leads.city),
      state = COALESCE(EXCLUDED.state, leads.state),
      country = COALESCE(EXCLUDED.country, leads.country),
      last_sale_status_enum = EXCLUDED.last_sale_status_enum,
      last_sale_amount = EXCLUDED.last_sale_amount,
      last_product = COALESCE(EXCLUDED.last_product, leads.last_product),
      last_date_created = EXCLUDED.last_date_created,
      last_date_approved = COALESCE(EXCLUDED.last_date_approved, leads.last_date_approved),
      last_payment_type = EXCLUDED.last_payment_type,
      last_billet_url = COALESCE(EXCLUDED.last_billet_url, leads.last_billet_url),
      utm_source = COALESCE(EXCLUDED.utm_source, leads.utm_source),
      utm_medium = COALESCE(EXCLUDED.utm_medium, leads.utm_medium),
      utm_campaign = COALESCE(EXCLUDED.utm_campaign, leads.utm_campaign),
      status = EXCLUDED.status,
      updated_at = NOW();
    
    -- Upsert sale (skip if no code)
    IF v_code IS NOT NULL AND v_code != '' THEN
      INSERT INTO sales (code, lead_email, sale_amount, sale_status_enum, sale_status_detail,
        product_code, product_name, plan_code, plan_name, payment_type_enum, payment_method_enum,
        checkout_type_enum, billet_url, date_created, date_approved)
      VALUES (v_code, v_email, v_amount, v_sale_status, v_sale_status_detail,
        v_product_code, v_product_name, v_plan_code, v_plan_name, v_payment_type, v_payment_method,
        v_checkout_type, v_billet_url, v_date_created, v_date_approved)
      ON CONFLICT (code) DO UPDATE SET
        sale_status_enum = EXCLUDED.sale_status_enum,
        sale_amount = EXCLUDED.sale_amount,
        date_approved = COALESCE(EXCLUDED.date_approved, sales.date_approved);
    END IF;
    
  END LOOP;
END $$;
