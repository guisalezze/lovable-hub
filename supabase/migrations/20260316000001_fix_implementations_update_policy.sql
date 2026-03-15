-- Ajustar política RLS para permitir que qualquer usuário autenticado possa atualizar mentorias
-- Isso permite que membros da equipe (como Marília) possam editar mentorias mesmo que não sejam assigned_to

DROP POLICY IF EXISTS "implementations_update" ON public.implementations;

CREATE POLICY "implementations_update" ON public.implementations 
FOR UPDATE 
TO authenticated 
USING (true) 
WITH CHECK (true);
