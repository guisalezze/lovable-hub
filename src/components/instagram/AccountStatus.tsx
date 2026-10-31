import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Instagram, RefreshCw } from "lucide-react";

const SUPABASE_URL = "https://lqrlvefeznfaauwgvubl.supabase.co";
export const OAUTH_URL = `${SUPABASE_URL}/functions/v1/instagram-oauth`;

interface IgStatus {
  connected: boolean;
  username?: string | null;
  followers?: number | null;
  token_expires_at?: string | null;
  error?: string | null;
}

const fmtDate = (iso?: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(iso))
    : null;

export default function AccountStatus() {
  const { data: config, isLoading } = useQuery({
    queryKey: ["ig_config"],
    queryFn: async () => {
      const { data } = await supabase.from("ig_config").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  const { data: status } = useQuery({
    queryKey: ["ig_status"],
    enabled: !!config,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<IgStatus> => {
      const { data, error } = await supabase.functions.invoke("instagram-admin", { body: { action: "status" } });
      if (error) throw error;
      return data as IgStatus;
    },
  });

  const username = status?.username ?? config?.username;
  const expires = fmtDate(status?.token_expires_at ?? config?.token_expires_at);
  // Se a função de status falhar, mostra o que está salvo no banco (não acusa desconexão).
  const ok = status ? status.connected : true;

  return (
    <div className="rounded-xl border border-border p-4">
      {isLoading ? (
        <div className="h-12 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
          <div className="space-y-1.5">
            <div className="h-3 w-32 bg-muted animate-pulse rounded" />
            <div className="h-3 w-24 bg-muted animate-pulse rounded" />
          </div>
        </div>
      ) : config ? (
        <div className="flex items-center gap-3 flex-wrap">
          {config.profile_picture_url ? (
            <img src={config.profile_picture_url} alt={username ?? ""} className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
              <Instagram className="h-5 w-5 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-sm flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-destructive"}`} />
              @{username}
              {typeof status?.followers === "number" && (
                <span className="text-xs font-normal text-muted-foreground">
                  {status.followers.toLocaleString("pt-BR")} seguidores
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {ok
                ? `Acesso renovado automaticamente${expires ? ` (vale até ${expires})` : ""}`
                : `Problema no acesso${status?.error ? `: ${status.error}` : ""}. Reconecte a conta.`}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {ok ? (
              <Badge variant="outline" className="text-emerald-600 border-emerald-500/40 bg-emerald-500/10">
                Conectado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-destructive border-destructive/40 bg-destructive/10">
                Desconectado
              </Badge>
            )}
            <Button size="sm" variant="outline" asChild>
              <a href={OAUTH_URL} title="Reconectar">
                <RefreshCw className="h-4 w-4 mr-1" /> Reconectar
              </a>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Instagram className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-semibold">Nenhuma conta conectada</p>
            <p className="text-sm text-muted-foreground">
              Conecte seu Instagram profissional para começar a automatizar
            </p>
          </div>
          <Button asChild className="mt-1">
            <a href={OAUTH_URL}>
              <Instagram className="h-4 w-4 mr-2" /> Conectar Instagram
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
