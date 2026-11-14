-- Arquivos do quadro (imagens, áudios e vídeos): bucket privado, no mesmo padrão de permissões da tabela whiteboards.
-- Qualquer usuário logado lê; só admin/team envia, troca e apaga. Limite de 50 MB por arquivo.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whiteboard-files',
  'whiteboard-files',
  false,
  52428800,
  ARRAY['image/*', 'audio/*', 'video/*']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "whiteboard_files_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'whiteboard-files');

CREATE POLICY "whiteboard_files_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'whiteboard-files' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'team')));

CREATE POLICY "whiteboard_files_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'whiteboard-files' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'team')));

CREATE POLICY "whiteboard_files_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'whiteboard-files' AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'team')));
