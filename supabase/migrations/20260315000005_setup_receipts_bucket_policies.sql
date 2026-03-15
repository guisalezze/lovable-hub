-- Setup storage bucket 'receipts' with RLS policies
-- Este script configura as políticas de segurança para o bucket de comprovantes PIX

-- 1. Criar o bucket se não existir (via storage.buckets)
-- Nota: Se o bucket já foi criado manualmente no dashboard, esta parte pode falhar silenciosamente
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  true, -- bucket público para leitura
  NULL, -- sem limite de tamanho (ou defina um valor em bytes, ex: 5242880 para 5MB)
  NULL  -- sem restrição de MIME types (ou defina array, ex: ARRAY['image/jpeg', 'image/png', 'image/webp'])
)
ON CONFLICT (id) DO NOTHING;

-- 2. Habilitar RLS no bucket
-- (RLS já é habilitado por padrão em buckets, mas garantimos)

-- 3. Remover políticas existentes (se houver) e criar novas
DROP POLICY IF EXISTS "Public read access for receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete receipts" ON storage.objects;

-- 4. Política: Permitir leitura pública (SELECT) - necessário para exibir imagens
CREATE POLICY "Public read access for receipts"
ON storage.objects
FOR SELECT
USING (bucket_id = 'receipts');

-- 5. Política: Permitir upload apenas para usuários autenticados (INSERT)
CREATE POLICY "Authenticated users can upload receipts"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'receipts' 
  AND auth.role() = 'authenticated'
);

-- 6. Política: Permitir atualização apenas para usuários autenticados (UPDATE)
CREATE POLICY "Authenticated users can update receipts"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'receipts' 
  AND auth.role() = 'authenticated'
);

-- 7. Política: Permitir exclusão apenas para usuários autenticados (DELETE)
CREATE POLICY "Authenticated users can delete receipts"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'receipts' 
  AND auth.role() = 'authenticated'
);
