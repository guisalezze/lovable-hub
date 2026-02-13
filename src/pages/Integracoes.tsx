import { Plug, CheckCircle, ExternalLink } from "lucide-react";

export default function IntegracoesPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Integrações</h1>
        <p className="text-sm text-muted-foreground mt-1">Conexões com plataformas externas</p>
      </div>

      <div className="glass-card p-5">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <Plug className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">Perfect Pay</h3>
            <p className="text-xs text-muted-foreground">Webhook de vendas configurado</p>
          </div>
          <div className="flex items-center gap-1 text-success text-xs font-medium">
            <CheckCircle className="h-3.5 w-3.5" />
            Ativo
          </div>
        </div>
        <div className="mt-4 p-3 rounded-md bg-secondary/50">
          <p className="text-xs text-muted-foreground mb-1">Endpoint do Webhook:</p>
          <code className="text-xs text-foreground break-all">
            POST /functions/v1/perfectpay-webhook
          </code>
        </div>
      </div>

      <div className="glass-card p-5 opacity-60">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-secondary flex items-center justify-center">
            <ExternalLink className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">Google Calendar</h3>
            <p className="text-xs text-muted-foreground">Em breve — agendamento de calls automático</p>
          </div>
          <span className="text-xs text-muted-foreground">Em breve</span>
        </div>
      </div>

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
