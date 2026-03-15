-- Verificar e garantir que a política RLS está correta
-- Este script pode ser executado múltiplas vezes sem problemas

-- Primeiro, remove a política antiga se existir
DROP POLICY IF EXISTS "implementations_update" ON public.implementations;

-- Cria a nova política que permite qualquer usuário autenticado atualizar
CREATE POLICY "implementations_update" ON public.implementations 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Verificar se a política foi criada (isso vai dar erro se não existir, mas não é problema)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'implementations' 
    AND policyname = 'implementations_update'
  ) THEN
    RAISE EXCEPTION 'Política implementations_update não foi criada';
  END IF;
END $$;
