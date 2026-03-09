
-- Clean up test leads and their related data
DO $$
BEGIN
  -- Delete sales referencing test leads
  DELETE FROM public.sales WHERE lead_email LIKE 'email+%@gmail.com';
  
  -- Delete lead_products referencing test leads
  DELETE FROM public.lead_products WHERE lead_email LIKE 'email+%@gmail.com';
  
  -- Delete lead_notes referencing test leads
  DELETE FROM public.lead_notes WHERE lead_id IN (
    SELECT id FROM public.leads WHERE email LIKE 'email+%@gmail.com' AND full_name = 'Test Lead'
  );
  
  -- Delete tasks referencing test leads
  UPDATE public.tasks SET lead_email = NULL WHERE lead_email LIKE 'email+%@gmail.com';
  
  -- Delete calls referencing test leads
  DELETE FROM public.calls WHERE lead_email LIKE 'email+%@gmail.com';
  
  -- Finally delete the test leads
  DELETE FROM public.leads WHERE email LIKE 'email+%@gmail.com' AND full_name = 'Test Lead';
END $$;
