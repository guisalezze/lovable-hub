
INSERT INTO public.implementation_templates (name) 
SELECT 'Padrão' WHERE NOT EXISTS (SELECT 1 FROM public.implementation_templates WHERE name = 'Padrão');

DO $$
DECLARE tmpl_id uuid;
BEGIN
  SELECT id INTO tmpl_id FROM public.implementation_templates WHERE name = 'Padrão' LIMIT 1;
  IF tmpl_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.implementation_template_steps WHERE template_id = tmpl_id) THEN
    INSERT INTO public.implementation_template_steps (template_id, title, order_index) VALUES
      (tmpl_id, 'Diagnóstico inicial', 0),
      (tmpl_id, 'Planejamento estratégico', 1),
      (tmpl_id, 'Implementação fase 1', 2),
      (tmpl_id, 'Implementação fase 2', 3),
      (tmpl_id, 'Revisão e ajustes', 4),
      (tmpl_id, 'Entrega final', 5);
  END IF;
END $$;
