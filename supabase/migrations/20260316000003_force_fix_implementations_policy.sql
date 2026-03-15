-- FORÇAR correção da política RLS para permitir que qualquer membro da equipe edite mentorias
-- Esta migration remove TODAS as políticas de update e cria uma nova permissiva

-- Remove TODAS as políticas de update existentes (pode haver múltiplas)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'implementations' 
        AND policyname LIKE '%update%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.implementations', r.policyname);
    END LOOP;
END $$;

-- Cria a nova política permissiva que permite qualquer usuário autenticado atualizar
CREATE POLICY "implementations_update" ON public.implementations 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Verificar se foi criada corretamente
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'implementations' 
        AND policyname = 'implementations_update'
        AND cmd = 'UPDATE'
    ) THEN
        RAISE EXCEPTION 'FALHA: Política implementations_update não foi criada corretamente';
    ELSE
        RAISE NOTICE 'SUCESSO: Política implementations_update criada e ativa';
    END IF;
END $$;
