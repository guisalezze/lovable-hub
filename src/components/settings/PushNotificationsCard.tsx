import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Button } from "@/components/ui/button";
import {
  Bell, BellOff, Loader2, ShoppingCart, ClipboardList,
  AlertCircle, Copy, FlaskConical, CheckCircle2, XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { showSaleToast } from "@/hooks/useSaleRealtime";
import { showTaskToast, getProfileName } from "@/hooks/useTaskRealtime";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

type DiagResult = { ok: boolean; log: Record<string, unknown> } | null;

export function PushNotificationsCard() {
  const { isSupported, permission, isSubscribed, isLoading, lastError, subscribe, unsubscribe } =
    usePushNotifications();

  const [testingSale, setTestingSale] = useState(false);
  const [testingTask, setTestingTask] = useState(false);
  const [testingDirect, setTestingDirect] = useState(false);
  const [diagResult, setDiagResult] = useState<DiagResult>(null);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

  // ── helpers ────────────────────────────────────────────────────────────────

  async function getValidSession() {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sessão não encontrada. Faça login novamente.");
    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at && session.expires_at < now + 60) {
      const { data: { session: fresh }, error } = await supabase.auth.refreshSession();
      if (error || !fresh) throw new Error(`Erro ao renovar sessão: ${error?.message}`);
      session = fresh;
    }
    return session;
  }

  // ── test handlers ──────────────────────────────────────────────────────────

  const handleTestSale = async () => {
    setTestingSale(true);
    try {
      await showSaleToast(97, "Fature 10k");
      toast.success("Notificação de venda disparada!", { duration: 2000 });
    } catch (err: unknown) {
      toast.error(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTestingSale(false);
    }
  };

  const handleTestTask = async () => {
    setTestingTask(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const myName = user ? await getProfileName(user.id) : "Você";
      showTaskToast(myName, "Tarefa de teste — verificando notificações");

      if (isSubscribed && user) {
        const session = await getValidSession();
        const response = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            userId: user.id,
            title: "Tarefa Criada!",
            body: `${myName} criou uma tarefa: Tarefa de teste`,
            icon: "/logo.png",
            tag: `task-test-${Date.now()}`,
            data: { url: "/tarefas", type: "task" },
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
      }
      toast.success("Notificação de tarefa disparada!", { duration: 2000 });
    } catch (err: unknown) {
      toast.error(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTestingTask(false);
    }
  };

  /** Chama a edge function via GET — diagnóstico completo sem precisar de subscription */
  const handleTestDirect = async () => {
    setTestingDirect(true);
    setDiagResult(null);
    try {
      const session = await getValidSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const raw = await res.json();
      // Normaliza: garante que sempre tem campo `log`
      const normalized: DiagResult = {
        ok: raw?.ok ?? false,
        log: raw?.log ?? (raw?.error ? { error: raw.error, dica: "A edge function pode estar desatualizada no Supabase. Faça o deploy via: supabase functions deploy send-push-notification" } : { raw: JSON.stringify(raw) }),
      };
      setDiagResult(normalized);
      if (normalized.ok) {
        toast.success("Push enviado com sucesso! Verifique o dispositivo inscrito.");
      } else {
        toast.error("Falha no envio — veja o diagnóstico abaixo.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDiagResult({ ok: false, log: { error: msg } });
      toast.error(`Erro: ${msg}`);
    } finally {
      setTestingDirect(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações Push
          </CardTitle>
          <CardDescription>Seu navegador não suporta notificações push.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isSubscribed ? <Bell className="h-5 w-5 text-primary" /> : <BellOff className="h-5 w-5" />}
          Notificações Push
        </CardTitle>
        <CardDescription>
          Receba notificações mesmo com o app fechado — vendas aprovadas e tarefas atribuídas.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Erro de ativação */}
        {lastError && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-destructive">Erro ao ativar</p>
              <p className="text-xs text-destructive/80 mt-0.5 break-words">{lastError}</p>
            </div>
            <button
              onClick={() => { navigator.clipboard?.writeText(lastError); toast.success("Copiado!"); }}
              className="shrink-0 text-destructive/60 hover:text-destructive"
              title="Copiar erro"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Status da subscription */}
        {permission === "denied" ? (
          <p className="text-sm text-destructive">
            Permissão negada. Ative nas configurações do navegador e recarregue a página.
          </p>
        ) : isSubscribed ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Notificações push ativadas neste dispositivo
            </div>
            <Button variant="outline" onClick={unsubscribe} disabled={isLoading} className="w-full">
              {isLoading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Desativando...</>
              ) : (
                <><BellOff className="h-4 w-4 mr-2" />Desativar Notificações</>
              )}
            </Button>
          </div>
        ) : (
          <Button onClick={subscribe} disabled={isLoading} className="w-full">
            {isLoading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ativando...</>
            ) : (
              <><Bell className="h-4 w-4 mr-2" />Ativar Notificações Push</>
            )}
          </Button>
        )}

        {/* Seção de testes */}
        <div className="border-t border-border pt-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Testar Notificações</p>

          {/* Teste direto (GET) — diagnóstico completo */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestDirect}
            disabled={testingDirect}
            className="w-full justify-start gap-2 text-xs"
          >
            {testingDirect ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FlaskConical className="h-3.5 w-3.5 text-violet-500" />
            )}
            Diagnóstico Completo (GET)
          </Button>

          {/* Resultado do diagnóstico */}
          {diagResult !== null && (
            <div className={`rounded-lg border p-3 text-xs space-y-1 ${diagResult.ok ? "bg-green-500/10 border-green-500/30" : "bg-destructive/10 border-destructive/30"}`}>
              <div className="flex items-center gap-1.5 font-medium">
                {diagResult.ok
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                {diagResult.ok ? "Push enviado com sucesso" : "Falha no envio"}
              </div>
              {Object.entries(diagResult.log).map(([k, v]) => (
                <div key={k} className="flex gap-1 text-muted-foreground">
                  <span className="font-mono shrink-0">{k}:</span>
                  <span className="break-all">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                </div>
              ))}
              <button
                onClick={() => { navigator.clipboard?.writeText(JSON.stringify(diagResult, null, 2)); toast.success("Copiado!"); }}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground mt-1"
              >
                <Copy className="h-3 w-3" /> Copiar log completo
              </button>
            </div>
          )}

          {/* Testes de toast + push */}
          <p className="text-[10px] text-muted-foreground">
            💡 Os botões abaixo disparam toast visual + push nativo (se inscrito neste dispositivo).
          </p>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestSale}
              disabled={testingSale}
              className="w-full justify-start gap-2 text-xs"
            >
              {testingSale ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingCart className="h-3.5 w-3.5 text-emerald-500" />}
              Testar Notificação de Venda
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestTask}
              disabled={testingTask}
              className="w-full justify-start gap-2 text-xs"
            >
              {testingTask ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5 text-primary" />}
              Testar Notificação de Tarefa
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
