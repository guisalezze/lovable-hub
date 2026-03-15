import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { playTaskSound } from "@/lib/sounds";

/**
 * Hook que escuta Supabase Realtime na tabela `tasks` e dispara
 * um toast + som quando uma nova tarefa é atribuída ao usuário atual.
 *
 * Condições para mostrar notificação:
 *  - INSERT: assigned_to = meu ID e created_by ≠ meu ID
 *  - UPDATE: assigned_to mudou para meu ID e updated_by/created_by ≠ meu ID
 */
export function useTaskRealtime() {
  // Guardar o ID do usuário atual para comparação no callback
  const myUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Buscar dados do usuário atual
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      myUserIdRef.current = user.id;
    });

    const channel = supabase
      .channel("task-realtime-notifications")
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "tasks",
        },
        async (payload: {
          new: {
            id?: string;
            title?: string;
            assigned_to?: string | null;
            created_by?: string | null;
          };
        }) => {
          const task = payload.new;
          const myId = myUserIdRef.current;
          if (!myId) return;

          // Só notificar se foi atribuída a mim e criada por outra pessoa
          if (task.assigned_to === myId && task.created_by !== myId) {
            const creatorName = await getProfileName(task.created_by);
            showTaskToast(creatorName, task.title ?? "Nova tarefa", task.id);
            sendTaskPushNotification(creatorName, task.title ?? "Nova tarefa", myId, task.id);
          }
        }
      )
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "tasks",
        },
        async (payload: {
          new: {
            id?: string;
            title?: string;
            assigned_to?: string | null;
            created_by?: string | null;
          };
          old: {
            assigned_to?: string | null;
          };
        }) => {
          const task = payload.new;
          const oldTask = payload.old;
          const myId = myUserIdRef.current;
          if (!myId) return;

          // Só notificar se assigned_to MUDOU para mim (reatribuição)
          const wasAssignedToMe = oldTask.assigned_to === myId;
          const isNowAssignedToMe = task.assigned_to === myId;

          if (!wasAssignedToMe && isNowAssignedToMe && task.created_by !== myId) {
            const creatorName = await getProfileName(task.created_by);
            showTaskToast(creatorName, task.title ?? "Tarefa atualizada", task.id);
            sendTaskPushNotification(creatorName, task.title ?? "Tarefa atualizada", myId, task.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}

/** Busca o nome de um usuário pelo ID */
export async function getProfileName(userId?: string | null): Promise<string> {
  if (!userId) return "Alguém";
  try {
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    return data?.full_name ?? "Alguém";
  } catch {
    return "Alguém";
  }
}

/** Exibe toast de tarefa atribuída com som */
export function showTaskToast(creatorName: string, taskTitle: string, taskId?: string) {
  playTaskSound();

  toast("Tarefa Criada!", {
    description: `${creatorName} criou uma tarefa pra você: ${taskTitle}`,
    duration: 7000,
    position: "top-center",
    style: {
      background: "#18181b",
      border: "1px solid rgba(99,102,241,0.3)",
      color: "#fff",
      borderRadius: "12px",
    },
    action: taskId
      ? {
          label: "Ver",
          onClick: () => {
            window.location.href = `/tarefas`;
          },
        }
      : undefined,
  });
}

/** Envia push notification de tarefa atribuída */
async function sendTaskPushNotification(
  creatorName: string,
  taskTitle: string,
  userId: string,
  taskId?: string
) {
  try {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    let { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.debug("[useTaskRealtime] Sem sessão válida, push não enviado:", sessionError);
      return;
    }
    
    // Renovar token se expirado
    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at && session.expires_at < now + 60) {
      const { data: { session: newSession } } = await supabase.auth.refreshSession();
      if (newSession) session = newSession;
    }

    await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        userId,
        title: "Tarefa Criada!",
        body: `${creatorName} criou uma tarefa pra você: ${taskTitle}`,
        icon: "/logo.png",
        tag: `task-${taskId || Date.now()}`,
        data: {
          url: "/tarefas",
          type: "task",
          taskId,
        },
      }),
    });
  } catch (error) {
    // Silenciosamente falha se push não estiver disponível
    console.debug("Task push notification não enviada:", error);
  }
}
