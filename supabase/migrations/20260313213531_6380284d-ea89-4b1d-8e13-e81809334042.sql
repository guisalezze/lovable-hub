
-- 1. copy_projects
CREATE TABLE public.copy_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'ativo',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.copy_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copy_projects_select" ON public.copy_projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "copy_projects_insert" ON public.copy_projects FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'team')
);
CREATE POLICY "copy_projects_update" ON public.copy_projects FOR UPDATE TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'team')
);
CREATE POLICY "copy_projects_delete" ON public.copy_projects FOR DELETE TO authenticated USING (
  has_role(auth.uid(), 'admin')
);

CREATE TRIGGER update_copy_projects_updated_at BEFORE UPDATE ON public.copy_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. copy_items
CREATE TABLE public.copy_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copy_project_id uuid NOT NULL REFERENCES public.copy_projects(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'criativo',
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  tags text[] DEFAULT '{}',
  is_validated boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.copy_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copy_items_select" ON public.copy_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "copy_items_insert" ON public.copy_items FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'team')
);
CREATE POLICY "copy_items_update" ON public.copy_items FOR UPDATE TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'team')
);
CREATE POLICY "copy_items_delete" ON public.copy_items FOR DELETE TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'team')
);

CREATE TRIGGER update_copy_items_updated_at BEFORE UPDATE ON public.copy_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. copy_item_versions
CREATE TABLE public.copy_item_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copy_item_id uuid NOT NULL REFERENCES public.copy_items(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  saved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.copy_item_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copy_item_versions_select" ON public.copy_item_versions FOR SELECT TO authenticated USING (true);
CREATE POLICY "copy_item_versions_insert" ON public.copy_item_versions FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'team')
);

-- 4. copy_files
CREATE TABLE public.copy_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copy_project_id uuid NOT NULL REFERENCES public.copy_projects(id) ON DELETE CASCADE,
  copy_item_id uuid REFERENCES public.copy_items(id) ON DELETE SET NULL,
  folder text NOT NULL DEFAULT 'referencias',
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size_kb integer DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.copy_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "copy_files_select" ON public.copy_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "copy_files_insert" ON public.copy_files FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'team')
);
CREATE POLICY "copy_files_delete" ON public.copy_files FOR DELETE TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'team')
);

-- 5. Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('copy-files', 'copy-files', false);

CREATE POLICY "copy_files_storage_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'copy-files');
CREATE POLICY "copy_files_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'copy-files');
CREATE POLICY "copy_files_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'copy-files');
