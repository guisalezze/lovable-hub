import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Instagram, KeyRound, Link2, LogOut, RefreshCw, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { igAdmin } from "@/lib/instagramAdmin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const fmtDay = (day: string) => {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
};

// Seguidores dos últimos 90 dias (ig_follower_history, gravado pelo worker 1×/dia).
function FollowerChart() {
  const { data, isLoading } = useQuery({
    queryKey: ["ig_follower_history"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("ig_follower_history")
        .select("day, followers")
        .gte("day", since)
        .order("day", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return null;
  const points = data ?? [];
  if (points.length < 2) {
    return <p className="mt-3 text-xs text-muted-foreground">O histórico de seguidores é gravado pelo worker 1×/dia.</p>;
  }
  const diff = points[points.length - 1].followers - points[0].followers;

  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-2 mb-1">
        <p className="text-xs font-medium">Seguidores (90 dias)</p>
        <span className={`text-xs ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : "text-muted-foreground"}`}>
          {diff > 0 ? "+" : ""}
          {diff.toLocaleString("pt-BR")} desde {fmtDay(points[0].day)}
        </span>
      </div>
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 10 }} minTickGap={24} stroke="hsl(var(--muted-foreground))" />
            <YAxis
              domain={["dataMin", "dataMax"]}
              tick={{ fontSize: 10 }}
              width={48}
              allowDecimals={false}
              tickFormatter={(v: number) => v.toLocaleString("pt-BR")}
              stroke="hsl(var(--muted-foreground))"
            />
            <Tooltip
              labelFormatter={(d) => fmtDay(String(d))}
              formatter={(v) => [Number(v).toLocaleString("pt-BR"), "Seguidores"]}
              contentStyle={{ fontSize: 12, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
            />
            <Line type="monotone" dataKey="followers" stroke="#ec4899" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function ConnectionCard() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const statusQ = useQuery({ queryKey: ["ig_admin_status"], staleTime: 60_000, retry: false, queryFn: igAdmin.status });
  const status = statusQ.data;
  const keySet = !!status?.key_set;
  const hasProfile = !!status?.profile_id;

  const profilesQ = useQuery({
    queryKey: ["ig_admin_profiles"],
    enabled: keySet,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: igAdmin.profiles,
  });
  const accountsQ = useQuery({
    queryKey: ["ig_admin_accounts", status?.profile_id],
    enabled: keySet && hasProfile,
    staleTime: 60_000,
    retry: false,
    queryFn: igAdmin.accounts,
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["ig_admin_status"] });
    qc.invalidateQueries({ queryKey: ["ig_admin_accounts"] });
  };

  // Volta do Zernio depois de conectar uma conta nova.
  useEffect(() => {
    if (params.get("connected") === "instagram") {
      toast.success("Conta conectada no Zernio. Escolha a conta abaixo.");
      refreshAll();
      const next = new URLSearchParams(params);
      next.delete("connected");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onErr = (e: Error) => toast.error(e.message);

  const setProfile = useMutation({
    mutationFn: igAdmin.setProfile,
    onSuccess: () => {
      toast.success("Perfil do Zernio salvo e webhook registrado.");
      refreshAll();
    },
    onError: onErr,
  });
  const selectAccount = useMutation({
    mutationFn: igAdmin.selectAccount,
    onSuccess: (r) => {
      toast.success(r.account?.username ? `Conta @${r.account.username} selecionada.` : "Conta selecionada.");
      refreshAll();
    },
    onError: onErr,
  });
  const connect = useMutation({
    mutationFn: () => igAdmin.connect(`${window.location.origin}/instagram-automacoes?connected=instagram`),
    onSuccess: (r) => {
      window.location.href = r.auth_url;
    },
    onError: onErr,
  });
  const disconnect = useMutation({
    mutationFn: igAdmin.disconnect,
    onSuccess: () => {
      toast.success("Conta desconectada.");
      refreshAll();
    },
    onError: onErr,
  });

  const account = status?.account;
  const workerAt = status?.last_worker_at ? new Date(status.last_worker_at) : null;
  const workerStale = !workerAt || Date.now() - workerAt.getTime() > 10 * 60_000;
  const currentAccountId = accountsQ.data?.find((a) => a.ig_user_id && a.ig_user_id === account?.ig_user_id)?.id;

  return (
    <section className="rounded-xl border border-border p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Instagram className="h-5 w-5 text-pink-500" />
        <h2 className="font-semibold">Conexão</h2>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={refreshAll}
          disabled={statusQ.isFetching}
          aria-label="Atualizar conexão"
        >
          <RefreshCw className={`h-4 w-4 ${statusQ.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {statusQ.isLoading ? (
        <div className="h-16 rounded-lg bg-muted animate-pulse" />
      ) : statusQ.error ? (
        <p className="text-sm text-destructive">Não foi possível ler a conexão: {(statusQ.error as Error).message}</p>
      ) : !keySet ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <KeyRound className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Configure o segredo <code className="font-mono">ZERNIO_API_KEY</code> no Supabase (
            <code className="font-mono">npx supabase secrets set ZERNIO_API_KEY=...</code>) e recarregue a página.
          </span>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Perfil do Zernio</Label>
              <Select
                value={status?.profile_id ?? undefined}
                onValueChange={(v) => setProfile.mutate(v)}
                disabled={profilesQ.isLoading || setProfile.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder={profilesQ.isLoading ? "Carregando..." : "Escolha um perfil"} />
                </SelectTrigger>
                <SelectContent>
                  {(profilesQ.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name || p.id}
                    </SelectItem>
                  ))}
                  {status?.profile_id && !(profilesQ.data ?? []).some((p) => p.id === status.profile_id) && (
                    <SelectItem value={status.profile_id}>{status.profile_id}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {profilesQ.error && <p className="text-xs text-destructive">{(profilesQ.error as Error).message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Conta do Instagram</Label>
              <div className="flex gap-2">
                <Select
                  value={currentAccountId}
                  onValueChange={(v) => selectAccount.mutate(v)}
                  disabled={!hasProfile || accountsQ.isLoading || selectAccount.isPending}
                >
                  <SelectTrigger className="min-w-0">
                    <SelectValue
                      placeholder={
                        !hasProfile
                          ? "Escolha o perfil antes"
                          : accountsQ.isLoading
                            ? "Carregando..."
                            : account?.username
                              ? `@${account.username}`
                              : "Escolha uma conta"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(accountsQ.data ?? []).map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.username ? `@${a.username}` : a.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() => connect.mutate()}
                  disabled={!hasProfile || connect.isPending}
                  className="shrink-0"
                >
                  <Link2 className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Conectar nova conta</span>
                </Button>
              </div>
              {accountsQ.error && <p className="text-xs text-destructive">{(accountsQ.error as Error).message}</p>}
              {hasProfile && accountsQ.data?.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhuma conta neste perfil. Use “Conectar nova conta”.</p>
              )}
            </div>
          </div>

          {account ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="font-semibold">@{account.username ?? account.ig_user_id}</span>
              {account.followers_count != null && (
                <span className="text-muted-foreground">
                  {account.followers_count.toLocaleString("pt-BR")} seguidores
                </span>
              )}
              {status?.webhook_ok ? (
                <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> Webhook ok
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-red-500/40 text-red-700 dark:text-red-400">
                  <XCircle className="h-3 w-3" /> Webhook não registrado
                </Badge>
              )}
              <span className={`flex items-center gap-1 text-xs ${workerStale ? "text-amber-600" : "text-muted-foreground"}`}>
                {workerStale && <AlertTriangle className="h-3 w-3" />}
                {workerAt
                  ? `Worker visto ${formatDistanceToNow(workerAt, { addSuffix: true, locale: ptBR })}`
                  : "Worker ainda não rodou"}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-destructive hover:text-destructive"
                onClick={() => setConfirmDisconnect(true)}
                disabled={disconnect.isPending}
              >
                <LogOut className="h-4 w-4 mr-1" /> Desconectar
              </Button>
            </div>
          ) : (
            hasProfile && <p className="text-sm text-muted-foreground">Nenhuma conta do Instagram selecionada.</p>
          )}

          {account && <FollowerChart />}
        </>
      )}

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar a conta?</AlertDialogTitle>
            <AlertDialogDescription>
              As campanhas param de responder até você escolher uma conta de novo. Nada é apagado no Zernio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => disconnect.mutate()}>Desconectar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
