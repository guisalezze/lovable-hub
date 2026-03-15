import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Loader2, ShoppingCart, ClipboardList } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { showSaleToast } from "@/hooks/useSaleRealtime";
import { showTaskToast, getProfileName } from "@/hooks/useTaskRealtime";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

export function PushNotificationsCard() {
  const { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications();
  const [testingSale, setTestingSale] = useState(false);
  const [testingTask, setTestingTask] = useState(false);

  const handleTestSale = async () => {
    setTestingSale(true);
    try {
      // Dispara o toast visual + som (e push nativo se inscrito)
      await showSaleToast(97, "Fature 10k");
      toast.success("Notificação de venda disparada!", { duration: 2000 });
    } catch (err) {
      toast.error("Erro ao testar notificação de venda");
    } finally {
      setTestingSale(false);
    }
  };

  const handleTestTask = async () => {
    setTestingTask(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const myName = user ? await getProfileName(user.id) : "Você";

      // Dispara o toast visual + som
      showTaskToast(myName, "Tarefa de teste — verificando notificações");

      // Envia push nativo se inscrito
      if (isSubscribed && user) {
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              userId: user.id,
              title: "Tarefa Criada!",
              body: `${myName} criou uma tarefa pra você: Tarefa de teste`,
              icon: "/logo.png",
              tag: `task-test-${Date.now()}`,
              data: { url: "/tarefas", type: "task" },
            }),
          });
        }
      }

      toast.success("Notificação de tarefa disparada!", { duration: 2000 });
    } catch (err) {
      toast.error("Erro ao testar notificação de tarefa");
    } finally {
      setTestingTask(false);
    }
  };

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações Push
          </CardTitle>
          <CardDescription>
            Seu navegador não suporta notificações push.
          </CardDescription>
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
          Receba notificações mesmo com o app fechado. Você será notificado sobre vendas aprovadas e tarefas atribuídas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {permission === "denied" ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">
              Permissão de notificações foi negada. Para ativar, acesse as configurações do navegador e permita notificações para este site.
            </p>
          </div>
        ) : isSubscribed ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Notificações push ativadas
            </div>
            <Button
              variant="outline"
              onClick={unsubscribe}
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Desativando...
                </>
              ) : (
                <>
                  <BellOff className="h-4 w-4 mr-2" />
                  Desativar Notificações
                </>
              )}
            </Button>
          </div>
        ) : (
          <Button
            onClick={subscribe}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Ativando...
              </>
            ) : (
              <>
                <Bell className="h-4 w-4 mr-2" />
                Ativar Notificações Push
              </>
            )}
          </Button>
        )}

        {/* Seção de teste de notificações */}
        <div className="border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">
            Testar Notificações
            <span className="ml-1 font-normal">(gera no PC, veja no celular)</span>
          </p>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestSale}
              disabled={testingSale}
              className="w-full justify-start gap-2 text-xs"
            >
              {testingSale ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShoppingCart className="h-3.5 w-3.5 text-emerald-500" />
              )}
              Testar Notificação de Venda
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestTask}
              disabled={testingTask}
              className="w-full justify-start gap-2 text-xs"
            >
              {testingTask ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ClipboardList className="h-3.5 w-3.5 text-primary" />
              )}
              Testar Notificação de Tarefa
            </Button>
          </div>
          {!isSubscribed && (
            <p className="text-[10px] text-muted-foreground mt-2">
              * Ative as notificações push para receber no celular mesmo com o app fechado.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
