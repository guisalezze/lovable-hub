import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useGoogleAuth() {
  const qc = useQueryClient();

  const { data: isConnected = false, isLoading } = useQuery({
    queryKey: ["google-auth-status"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      // Use raw fetch since google_tokens isn't in the generated types yet
      const res = await fetch(
        `https://lqrlvefeznfaauwgvubl.supabase.co/rest/v1/google_tokens?user_id=eq.${user.id}&select=user_id`,
        {
          headers: {
            apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxcmx2ZWZlem5mYWF1d2d2dWJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTA4NzEsImV4cCI6MjA4NjUyNjg3MX0.umhDSKFm4yQRox1EkA_eqnHR1_N6pXyX9FstT_qkrfE",
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
        }
      );
      const data = await res.json();
      return Array.isArray(data) && data.length > 0;
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
        "https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/google-auth-start",
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: { session } } = await supabase.auth.getSession();
      await fetch(
        `https://lqrlvefeznfaauwgvubl.supabase.co/rest/v1/google_tokens?user_id=eq.${user.id}`,
        {
          method: "DELETE",
          headers: {
            apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxcmx2ZWZlem5mYWF1d2d2dWJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NTA4NzEsImV4cCI6MjA4NjUyNjg3MX0.umhDSKFm4yQRox1EkA_eqnHR1_N6pXyX9FstT_qkrfE",
            Authorization: `Bearer ${session?.access_token}`,
          },
        }
      );

      qc.invalidateQueries({ queryKey: ["google-auth-status"] });
      toast.success("Google desconectado");
    } catch {
      toast.error("Erro ao desconectar");
    }
  };

  const createCalendarEvent = async (params: {
    title: string;
    start: string;
    end?: string;
    type: "call" | "task";
  }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const res = await fetch(
      "https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/google-calendar-event",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      }
    );

    if (!res.ok) return null;
    return res.json();
  };

  return { isConnected, isLoading, connect, disconnect, createCalendarEvent };
}
