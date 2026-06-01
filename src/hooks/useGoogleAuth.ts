import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export function useGoogleAuth() {
  const qc = useQueryClient();

  const { data: isConnected = false, isLoading } = useQuery({
    queryKey: ["google-auth-status"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;

      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/google-auth-status`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!res.ok) return false;
      const data = await res.json();
      return data.connected === true;
    },
  });

  const connect = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Você precisa estar logado");
        return;
      }

      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/google-auth-start`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error("Erro ao iniciar conexão com Google");
      }
    } catch {
      toast.error("Erro ao conectar com Google");
    }
  };

  const disconnect = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/google-disconnect`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao desconectar");
      }

      qc.invalidateQueries({ queryKey: ["google-auth-status"] });
      toast.success("Google desconectado");
    } catch (e: any) {
      toast.error("Erro ao desconectar: " + e.message);
    }
  };

  const createCalendarEvent = async (params: {
    title: string;
    start: string;
    end?: string;
    type: "call" | "task";
    targetUserId?: string;
  }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/google-calendar-event`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: params.title,
          start: params.start,
          end: params.end,
          type: params.type,
          target_user_id: params.targetUserId,
        }),
      }
    );

    if (!res.ok) return null;
    return res.json();
  };

  return { isConnected, isLoading, connect, disconnect, createCalendarEvent };
}
