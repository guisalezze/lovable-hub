import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CopyItem {
  id: string;
  copy_project_id: string;
  type: string;
  title: string;
  content: string;
  tags: string[];
  is_validated: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CopyItemVersion {
  id: string;
  copy_item_id: string;
  content: string;
  saved_by: string | null;
  created_at: string;
}

export function useCopyItems(copyProjectId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["copy_items", copyProjectId],
    enabled: !!copyProjectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("copy_items")
        .select("*")
        .eq("copy_project_id", copyProjectId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as CopyItem[];
    },
  });

  const create = useMutation({
    mutationFn: async (values: { type: string; title: string; content?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("copy_items")
        .insert({ ...values, copy_project_id: copyProjectId!, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copy_items", copyProjectId] });
    },
    onError: () => toast.error("Erro ao criar bloco"),
  });

  const updateContent = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      // Update item
      const { error } = await supabase.from("copy_items").update({ content }).eq("id", id);
      if (error) throw error;
      // Create version
      await supabase.from("copy_item_versions").insert({
        copy_item_id: id,
        content,
        saved_by: user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copy_items", copyProjectId] });
    },
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, ...values }: { id: string; title?: string; tags?: string[]; is_validated?: boolean }) => {
      const { error } = await supabase.from("copy_items").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copy_items", copyProjectId] });
    },
    onError: () => toast.error("Erro ao atualizar bloco"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("copy_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copy_items", copyProjectId] });
      toast.success("Bloco removido!");
    },
    onError: () => toast.error("Erro ao remover bloco"),
  });

  return { ...query, create, updateContent, updateItem, remove };
}

export function useCopyItemVersions(copyItemId: string | undefined) {
  return useQuery({
    queryKey: ["copy_item_versions", copyItemId],
    enabled: !!copyItemId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("copy_item_versions")
        .select("*")
        .eq("copy_item_id", copyItemId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as CopyItemVersion[];
    },
  });
}
