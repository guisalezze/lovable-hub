import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";
import { toast } from "sonner";

export interface CopyProject {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useCopyProjects() {
  const { currentProject } = useProject();
  const queryClient = useQueryClient();
  const projectId = currentProject?.id;

  const query = useQuery({
    queryKey: ["copy_projects", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("copy_projects")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CopyProject[];
    },
  });

  const create = useMutation({
    mutationFn: async (values: { name: string; description?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("copy_projects")
        .insert({ ...values, project_id: projectId!, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copy_projects", projectId] });
      toast.success("Projeto de copy criado!");
    },
    onError: () => toast.error("Erro ao criar projeto de copy"),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...values }: { id: string; name?: string; description?: string; status?: string }) => {
      const { error } = await supabase.from("copy_projects").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copy_projects", projectId] });
      toast.success("Projeto atualizado!");
    },
    onError: () => toast.error("Erro ao atualizar projeto"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("copy_projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copy_projects", projectId] });
      toast.success("Projeto removido!");
    },
    onError: () => toast.error("Erro ao remover projeto"),
  });

  return { ...query, create, update, remove };
}
