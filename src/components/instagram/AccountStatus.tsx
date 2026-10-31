import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Instagram, KeyRound } from "lucide-react";

interface IgStatus {
  configured: boolean; // existe conta salva
  connected: boolean; // a Graph API respondeu com o token
  username?: string | null;
  followers?: number | null;
  profile_picture_url?: string | null;
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
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  // O token nunca vai para o navegador: tudo vem da edge function instagram-admin.
  const { data: status, isLoading, error: fnError } = useQuery({
    queryKey: ["ig_status"],
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<IgStatus> => {
      const { data, error } = await supabase.functions.invoke("instagram-admin", { body: { action: "status" } });
      if (error) throw error;
      return data as IgStatus;
    },
  });

  const expires = fmtDate(status?.token_expires_at);
  const username = status?.username;

  const saveToken = async () => {
    const t = token.trim();
    if (!t) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("instagram-admin", {
        body: { action: "set_token", token: t },
      });
      if (error) {
        // erros 4xx/5xx da função trazem a mensagem no corpo da resposta
        let msg = error.message;
        try {
          const j = await (error as { context?: Response }).context?.json();
          if (j?.error) msg = j.error;
        } catch {
          /* mantém a mensagem padrão */
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      if (data?.subscribed === false) {
        toast.warning(
          `Token salvo${data.username ? ` (@${data.username})` : ""}, mas a assinatura do webhook falhou${data.subscribe_error ? `: ${data.subscribe_error}` : ""}.`,
        );
      } else {
        toast.success(`Instagram conectado${data?.username ? `: @${data.username}` : ""}.`);
      }
      setToken("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["ig_status"] });
    } catch (e) {
      toast.error(`Não foi possível salvar o token: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const tokenButton = (variant: "outline" | "default", label: string) => (
    <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
      <KeyRound className="h-4 w-4 mr-1" /> {label}
    </Button>
  );

  const avatar = status?.profile_picture_url ? (
    <img src={status.profile_picture_url} alt={username ?? ""} className="h-10 w-10 rounded-full object-cover" />
  ) : (
    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
      <Instagram className="h-5 w-5 text-white" />
    </div>
  );

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
      ) : fnError || !status ? (
        <div className="flex items-center gap-3 flex-wrap">
          <Instagram className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Não foi possível consultar o status da conta{fnError ? `: ${(fnError as Error).message}` : ""}.
          </p>
          <div className="ml-auto">{tokenButton("outline", "Colar token")}</div>
        </div>
      ) : status.configured ? (
        <div className="flex items-center gap-3 flex-wrap">
          {avatar}
          <div className="min-w-0">
            <p className="font-semibold text-sm flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${status.connected ? "bg-emerald-500" : "bg-amber-500"}`} />
              {username ? `@${username}` : "Conta do Instagram"}
              {typeof status.followers === "number" && (
                <span className="text-xs font-normal text-muted-foreground">
                  {status.followers.toLocaleString("pt-BR")} seguidores
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {status.connected
                ? `Acesso renovado automaticamente${expires ? ` (vale até ${expires})` : ""}`
                : `Conta configurada, mas a verificação falhou${status.error ? `: ${status.error}` : ""}`}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {status.connected ? (
              <Badge variant="outline" className="text-emerald-600 border-emerald-500/40 bg-emerald-500/10">
                Conectado
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-500/40 bg-amber-500/10">
                Verificação falhou
              </Badge>
            )}
            {tokenButton("outline", "Trocar token")}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Instagram className="h-10 w-10 text-muted-foreground/40" />
          <div>
            <p className="font-semibold">Nenhuma conta conectada</p>
            <p className="text-sm text-muted-foreground">
              Cole o token do seu Instagram profissional para começar a automatizar
            </p>
          </div>
          <div className="mt-1">{tokenButton("default", "Colar token")}</div>
        </div>
      )}
      <Dialog open={open} onOpenChange={(o) => { if (!saving) { setOpen(o); if (!o) setToken(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{status?.configured ? "Trocar token" : "Colar token"} do Instagram</DialogTitle>
            <DialogDescription>
              Gere o token no painel do app da Meta → Configuração da API com login unificado → Gerar token, e cole aqui.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            autoComplete="off"
            placeholder="Token do Instagram"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveToken(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={saveToken} disabled={saving || !token.trim()}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
