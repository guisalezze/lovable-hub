import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CopyHook {
  headline: string;
  hook: string;
}

export interface StructuredContent {
  hooks: CopyHook[];
  body: string; // HTML string
  cta: string;
}

export const defaultStructuredContent = (): StructuredContent => ({
  hooks: [{ headline: "", hook: "" }],
  body: "",
  cta: "",
});

export interface CopyItem {
  id: string;
  copy_project_id: string;
  type: string;
  title: string;
  content: string;
  structured_content: StructuredContent | null;
  translated_content: StructuredContent | null;
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
      return (data as any[]).map((item) => ({
        ...item,
        structured_content: item.structured_content ?? null,
        translated_content: item.translated_content ?? null,
      })) as CopyItem[];
    },
  });

  const create = useMutation({
    mutationFn: async (values: { type: string; title: string; content?: string }) => {
      if (!copyProjectId) {
        throw new Error("copy_project_id é obrigatório");
      }
      const { data: { user } } = await supabase.auth.getUser();
      
      // Insert básico primeiro (sem structured_content para evitar problemas de tipo JSON)
      const { data, error } = await supabase
        .from("copy_items")
        .insert({
          type: values.type,
          title: values.title || "",
          content: values.content || "",
          copy_project_id: copyProjectId,
          created_by: user?.id,
          is_validated: false,
          sort_order: 0,
        })
        .select()
        .single();
        
      if (error) {
        console.error("Error creating copy item:", error);
        throw error;
      }

      // Depois atualiza com structured_content
      try {
        await (supabase as any)
          .from("copy_items")
          .update({ structured_content: defaultStructuredContent() })
          .eq("id", data.id);
      } catch (e: any) {
        // Se a coluna não existir (PGRST204), ignora
        if (e?.code === "PGRST204") {
          console.warn("structured_content column not found, skipping update");
        } else {
          console.error("Error setting structured_content:", e);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copy_items", copyProjectId] });
    },
    onError: (err: any) => {
      console.error("Create copy item error:", err);
      toast.error(err.message || "Erro ao criar bloco");
    },
  });

  const updateContent = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("copy_items").update({ content }).eq("id", id);
      if (error) throw error;
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

  /** Save structured_content and optionally translated_content */
  const updateStructured = useMutation({
    mutationFn: async ({
      id,
      structured_content,
      translated_content,
    }: {
      id: string;
      structured_content: StructuredContent;
      translated_content?: StructuredContent | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const payload: any = { structured_content };
      if (translated_content !== undefined) payload.translated_content = translated_content;

      const { error } = await supabase
        .from("copy_items")
        .update(payload)
        .eq("id", id);
      if (error) throw error;

      // Save a version snapshot (serialise structured content as JSON string)
      await supabase.from("copy_item_versions").insert({
        copy_item_id: id,
        content: JSON.stringify(structured_content),
        saved_by: user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copy_items", copyProjectId] });
      toast.success("Copy salva!");
    },
    onError: () => toast.error("Erro ao salvar copy"),
  });

  const updateItem = useMutation({
    mutationFn: async ({
      id,
      ...values
    }: {
      id: string;
      title?: string;
      tags?: string[];
      is_validated?: boolean;
    }) => {
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

  return { ...query, create, updateContent, updateStructured, updateItem, remove };
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
