import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Plug, CheckCircle, ExternalLink, Copy, LogOut, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useGoogleAuth } from "@/hooks/useGoogleAuth";

export default function IntegracoesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isConnected, isLoading, connect, disconnect } = useGoogleAuth();

  useEffect(() => {
    if (searchParams.get("google") === "connected") {
      toast.success("Google Calendar conectado com sucesso!");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const webhookUrl = "https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/perfectpay-webhook";

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
        <p className="text-sm text-muted-foreground mt-1">Conexões com plataformas externas</p>
      </div>

      {/* Perfect Pay */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Plug className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">Perfect Pay</h3>
            <p className="text-xs text-muted-foreground">Webhook de vendas configurado</p>
          </div>
          <Badge variant="outline" className="text-success border-success/30 bg-success/10">
            <CheckCircle className="h-3 w-3 mr-1" />
            Ativo
          </Badge>
        </div>
        <div className="mt-4 p-3 rounded-md bg-secondary/50 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">Endpoint do Webhook:</p>
            <code className="text-xs text-foreground break-all">{webhookUrl}</code>
          </div>
          <Button size="icon" variant="ghost" className="shrink-0" onClick={() => copyToClipboard(webhookUrl)}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Google Calendar + Meet */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Calendar className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">Google Calendar + Meet</h3>
            <p className="text-xs text-muted-foreground">
              {isConnected
                ? "Calls criam eventos com link do Meet automaticamente"
                : "Conecte para sincronizar calls e tarefas com o Google Calendar"}
            </p>
          </div>
          {isLoading ? (
            <span className="text-xs text-muted-foreground">Verificando...</span>
          ) : isConnected ? (
            <Badge variant="outline" className="text-success border-success/30 bg-success/10">
              <CheckCircle className="h-3 w-3 mr-1" />
              Conectado
            </Badge>
          ) : null}
        </div>
        <div className="mt-4">
          {isConnected ? (
            <div className="flex items-center justify-between p-3 rounded-md bg-secondary/50">
              <div>
                <p className="text-xs text-muted-foreground">
                  ✓ Calls → Evento no Calendar + link do Meet
                </p>
                <p className="text-xs text-muted-foreground">
                  ✓ Tarefas com data → Evento de dia inteiro
                </p>
              </div>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={disconnect}>
                <LogOut className="h-3.5 w-3.5 mr-1" />
                Desconectar
              </Button>
            </div>
          ) : (
            <Button onClick={connect} disabled={isLoading}>
              <Calendar className="h-4 w-4 mr-2" />
              Conectar com Google
            </Button>
          )}
        </div>
      </div>

      {/* Meta Ads */}
      <div className="glass-card p-5 opacity-60">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-secondary flex items-center justify-center">
            <ExternalLink className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">Meta Ads</h3>
            <p className="text-xs text-muted-foreground">Em breve — tráfego e UTMs automáticos</p>
          </div>
          <span className="text-xs text-muted-foreground">Em breve</span>
        </div>
      </div>
    </div>
  );
}
