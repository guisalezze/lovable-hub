import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { WhiteboardRow } from "@/lib/whiteboard/api";

export interface WhiteboardListItem {
  id: string;
  title: string;
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
}

const LIST_KEY = ["whiteboards"];

/** Lista e ações dos quadros. A lista não traz a cena (pesada): só o necessário para os cartões. */
export function useWhiteboards() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: LIST_KEY });

  const list = useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whiteboards")
        .select("id,title,thumbnail,created_at,updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as WhiteboardListItem[];
    },
  });

  const create = useMutation({
    mutationFn: async (title?: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("whiteboards")
        .insert({ title: title?.trim() || "Sem título", created_by: user?.id })
        .select("id,title")
        .single();
      if (error) throw error;
      return data as { id: string; title: string };
    },
    onSuccess: refresh,
    onError: () => toast.error("Não consegui criar o quadro"),
  });

  const rename = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase.from("whiteboards").update({ title: title.trim() || "Sem título" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: () => toast.error("Não consegui renomear o quadro"),
  });

  const duplicate = useMutation({
    mutationFn: async (id: string) => {
      const { data: source, error: readError } = await supabase.from("whiteboards").select("title,scene").eq("id", id).single();
      if (readError) throw readError;
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("whiteboards")
        .insert({ title: `${source.title} (cópia)`, scene: source.scene, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success("Quadro duplicado");
    },
    onError: () => toast.error("Não consegui duplicar o quadro"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("whiteboards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success("Quadro excluído");
    },
    onError: () => toast.error("Não consegui excluir o quadro"),
  });

  return { list, create, rename, duplicate, remove };
}

/** Um quadro inteiro (com a cena). Carrega uma vez: o editor é a fonte da verdade enquanto está aberto. */
export function useWhiteboard(id: string | undefined) {
  return useQuery({
    queryKey: ["whiteboard", id],
    enabled: !!id,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("whiteboards").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as WhiteboardRow;
    },
  });
}
