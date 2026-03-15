import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PushNotificationsCard() {
  const { isSupported, permission, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications();

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
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
