
-- Add columns to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS follow_up_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS follow_up_note text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_source_idx ON public.leads(source);
CREATE INDEX IF NOT EXISTS leads_follow_up_at_idx ON public.leads(follow_up_at);
CREATE INDEX IF NOT EXISTS leads_assigned_to_idx ON public.leads(assigned_to);

-- Lead notes table
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_notes_lead_id_idx ON public.lead_notes(lead_id);

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_notes_select" ON public.lead_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "lead_notes_insert" ON public.lead_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "lead_notes_delete" ON public.lead_notes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role) OR created_by = auth.uid());
