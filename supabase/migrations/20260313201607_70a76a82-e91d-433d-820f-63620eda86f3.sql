ALTER TABLE public.investments ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id);

UPDATE public.investments SET project_id = (SELECT id FROM public.projects WHERE slug = 'educacional' LIMIT 1) WHERE project_id IS NULL;