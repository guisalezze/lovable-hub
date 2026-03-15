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
  project_id: string | null;
}

export function useTasks(filter?: { assignedToMe?: boolean; status?: TaskStatus; overdue?: boolean; projectId?: string | null }) {
  return useQuery({
    queryKey: ["tasks", filter],
    queryFn: async () => {
      let query = supabase.from("tasks").select("*").order("created_at", { ascending: false }) as any;

      if (filter?.projectId) {
        query = query.eq("project_id", filter.projectId);
      }
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
      return (data as unknown as Task[]) || [];
    },
    enabled: filter?.projectId !== undefined ? !!filter.projectId : true,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (task: Partial<Task> & { title: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: inserted, error } = await supabase.from("tasks").insert({
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
        project_id: task.project_id || null,
      }).select("id").single();
      if (error) throw error;

      // Google Calendar sync removed — using WhatsApp notifications only

      // Trigger WhatsApp notification if assigned to someone else
      if (task.assigned_to && user && task.assigned_to !== user.id && inserted) {
        supabase.functions.invoke("task-notify-assignment", {
          body: { task_id: inserted.id, assigned_to: task.assigned_to },
        }).catch(() => {});
      }

      // Send WhatsApp message for high/urgent priority tasks
      if (task.assigned_to && inserted && (task.priority === "alta" || task.priority === "urgente")) {
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, phone_e164")
            .eq("id", task.assigned_to)
            .single();

          if (profile?.phone_e164) {
            const prioLabel = task.priority === "urgente" ? "🔴 URGENTE" : "🟠 Alta";
            const prazo = task.due_date
              ? new Date(task.due_date + "T12:00:00").toLocaleDateString("pt-BR")
              : "Sem prazo definido";
            const mensagem = `📋 *Nova tarefa ${prioLabel}*\n\n*Tarefa:* ${task.title}\n*Prazo:* ${prazo}\n*Prioridade:* ${prioLabel}\n\nAcesse o sistema para mais detalhes.`;
            const telefone = profile.phone_e164.replace(/\D/g, "");

            supabase.functions.invoke("send-whatsapp", {
              body: {
                nomeCliente: profile.full_name || "Responsável",
                telefoneCliente: telefone,
                mensagem,
              },
            }).catch(() => {});
          }
        } catch {}
      }
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

      // Google Calendar sync removed — using WhatsApp notifications only

      // If assigned_to changed, trigger WhatsApp notification
      if (updates.assigned_to) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && updates.assigned_to !== user.id) {
          supabase.functions.invoke("task-notify-assignment", {
            body: { task_id: id, assigned_to: updates.assigned_to },
          }).catch(() => {});
        }
      }
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
