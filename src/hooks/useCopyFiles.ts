import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CopyFile {
  id: string;
  copy_project_id: string;
  copy_item_id: string | null;
  folder: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size_kb: number | null;
  uploaded_by: string | null;
  created_at: string;
}

export function useCopyFiles(copyProjectId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["copy_files", copyProjectId],
    enabled: !!copyProjectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("copy_files")
        .select("*")
        .eq("copy_project_id", copyProjectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CopyFile[];
    },
  });

  const upload = useMutation({
    mutationFn: async ({ file, folder, copyItemId }: { file: File; folder: string; copyItemId?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const path = `${copyProjectId}/${folder}/${Date.now()}_${file.name}`;

      const { error: storageError } = await supabase.storage
        .from("copy-files")
        .upload(path, file);
      if (storageError) throw storageError;

      const { data: { publicUrl } } = supabase.storage.from("copy-files").getPublicUrl(path);

      const { error } = await supabase.from("copy_files").insert({
        copy_project_id: copyProjectId!,
        copy_item_id: copyItemId || null,
        folder,
        file_name: file.name,
        file_url: publicUrl,
        file_type: file.type,
        file_size_kb: Math.round(file.size / 1024),
        uploaded_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copy_files", copyProjectId] });
      toast.success("Arquivo enviado!");
    },
    onError: () => toast.error("Erro ao enviar arquivo"),
  });

  const remove = useMutation({
    mutationFn: async ({ id, fileUrl }: { id: string; fileUrl: string }) => {
      // Extract path from URL
      const urlParts = fileUrl.split("/copy-files/");
      if (urlParts[1]) {
        await supabase.storage.from("copy-files").remove([urlParts[1]]);
      }
      const { error } = await supabase.from("copy_files").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copy_files", copyProjectId] });
      toast.success("Arquivo removido!");
    },
    onError: () => toast.error("Erro ao remover arquivo"),
  });

  return { ...query, upload, remove };
}
