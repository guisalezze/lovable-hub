-- Quadro branco: um quadro por linha, cena inteira em JSON (versão 1).
-- Permissões no padrão do CRM (copy_projects): qualquer usuário logado lê;
-- só admin/team cria, edita e exclui.

CREATE TABLE public.whiteboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Sem título',
  scene jsonb NOT NULL DEFAULT '{"version":1,"elements":[]}'::jsonb,
  thumbnail text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whiteboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whiteboards_select" ON public.whiteboards FOR SELECT TO authenticated USING (true);
CREATE POLICY "whiteboards_insert" ON public.whiteboards FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'team')
);
CREATE POLICY "whiteboards_update" ON public.whiteboards FOR UPDATE TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'team')
);
CREATE POLICY "whiteboards_delete" ON public.whiteboards FOR DELETE TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'team')
);

CREATE TRIGGER update_whiteboards_updated_at BEFORE UPDATE ON public.whiteboards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
