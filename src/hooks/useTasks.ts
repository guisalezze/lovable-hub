import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TaskStatus = "backlog" | "em_andamento" | "bloqueado" | "concluido";
export type TaskPriority = "baixa" | "media" | "alta" | "urgente";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  lead_email: string | null;
  assigned_to: string | null;
  created_by: string | null;
  tags: string[];
  checklist: { text: string; done: boolean }[];
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  owner_user_id: string | null;
}

export function useTasks(filter?: { assignedToMe?: boolean; status?: TaskStatus; overdue?: boolean }) {
  return useQuery({
    queryKey: ["tasks", filter],
    queryFn: async () => {
      let query = supabase.from("tasks").select("*").order("created_at", { ascending: false });

      if (filter?.assignedToMe) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) query = query.eq("assigned_to", user.id);
      }
      if (filter?.status) {
        query = query.eq("status", filter.status);
      }
      if (filter?.overdue) {
        query = query.lt("due_date", new Date().toISOString().split("T")[0]).neq("status", "concluido");
      }

      const { data } = await query;
      return (data as Task[]) || [];
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: Partial<Task> & { title: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("tasks").insert({
        title: task.title,
        description: task.description || null,
        status: task.status || "backlog",
        priority: task.priority || "media",
        due_date: task.due_date || null,
        assigned_to: task.assigned_to || null,
        lead_email: task.lead_email || null,
        tags: task.tags || [],
        checklist: task.checklist || [],
        created_by: user?.id || null,
        owner_user_id: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Task> & { id: string }) => {
      const { error } = await supabase.from("tasks").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useTeamMembers() {
  return useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data || [];
    },
  });
}

export function useTaskComments(taskId: string) {
  return useQuery({
    queryKey: ["task-comments", taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from("task_comments")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!taskId,
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, message, mentions }: { taskId: string; message: string; mentions?: string[] }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("task_comments").insert({
        task_id: taskId,
        user_id: user.id,
        message,
        mentions: mentions || [],
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["task-comments", vars.taskId] }),
  });
}
