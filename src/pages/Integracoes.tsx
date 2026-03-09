import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plug, CheckCircle, Copy, LogOut, Calendar as CalendarIcon, TrendingUp, Loader2, Save, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { useGoogleAuth } from "@/hooks/useGoogleAuth";
import { supabase } from "@/integrations/supabase/client";
import { useMetaSpend } from "@/hooks/useMetaSpend";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function IntegracoesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isConnected, isLoading, connect, disconnect } = useGoogleAuth();

  // Meta Ads state
  const [metaAccountId, setMetaAccountId] = useState("");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [metaConfigured, setMetaConfigured] = useState(false);
  const [metaLastSync, setMetaLastSync] = useState<string | null>(null);
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaLoading, setMetaLoading] = useState(true);

  // Date range for initial extraction
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 7));
  const [dateTo, setDateTo] = useState<Date>(new Date());

  const since = format(dateFrom, "yyyy-MM-dd");
  const until = format(dateTo, "yyyy-MM-dd");

  const { data: spendData, error: spendError, isLoading: spendLoading } = useMetaSpend({
    since: metaConfigured ? since : "",
    until: metaConfigured ? until : "",
  });

  useEffect(() => {
    if (searchParams.get("google") === "connected") {
      toast.success("Google Calendar conectado com sucesso!");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Load Meta Ads config
  useEffect(() => {
    async function loadConfig() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-ads-config`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
          }
        );
        if (res.ok) {
          const config = await res.json();
          const acctId = typeof config.meta_ads_account_id === "string"
            ? config.meta_ads_account_id.replace(/^"|"$/g, "")
            : "";
          if (acctId) setMetaAccountId(acctId);
          if (config.meta_ads_last_sync && config.meta_ads_last_sync !== "null") {
            const syncVal = typeof config.meta_ads_last_sync === "string"
              ? config.meta_ads_last_sync.replace(/^"|"$/g, "")
              : "";
            setMetaLastSync(syncVal);
          }
          setMetaConfigured(!!acctId && (config.has_token === true));
        }
      } catch (e) {
        console.error("Failed to load meta config", e);
      } finally {
        setMetaLoading(false);
      }
    }
    loadConfig();
  }, []);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/perfectpay-webhook`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  };

  const handleSaveMeta = async () => {
    if (!metaAccountId.trim() || !metaAccessToken.trim()) {
      toast.error("Preencha o Account ID e o Token de Acesso");
      return;
    }

    setMetaSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-ads-config`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            account_id: metaAccountId.trim(),
            access_token: metaAccessToken.trim(),
          }),
        }
      );

      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "Erro ao salvar credenciais");
        return;
      }

      toast.success(`Meta Ads conectado! Conta: ${result.account_name}`);
      setMetaConfigured(true);
      setMetaLastSync(new Date().toISOString());
      setMetaAccessToken("");
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setMetaSaving(false);
    }
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
            <CalendarIcon className="h-6 w-6 text-primary" />
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
                <p className="text-xs text-muted-foreground">✓ Calls → Evento no Calendar + link do Meet</p>
                <p className="text-xs text-muted-foreground">✓ Tarefas com data → Evento de dia inteiro</p>
              </div>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={disconnect}>
                <LogOut className="h-3.5 w-3.5 mr-1" />
                Desconectar
              </Button>
            </div>
          ) : (
            <Button onClick={connect} disabled={isLoading}>
              <CalendarIcon className="h-4 w-4 mr-2" />
              Conectar com Google
            </Button>
          )}
        </div>
      </div>

      {/* Meta Ads */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-foreground">Meta Ads</h3>
            <p className="text-xs text-muted-foreground">
              {metaConfigured
                ? "Insights de investimento sincronizados automaticamente"
                : "Configure para extrair gastos e insights de campanhas"}
            </p>
          </div>
          {metaLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : metaConfigured ? (
            <Badge variant="outline" className="text-success border-success/30 bg-success/10">
              <CheckCircle className="h-3 w-3 mr-1" />
              Conectado
            </Badge>
          ) : null}
        </div>

        <div className="mt-4 space-y-4">
          {/* Config form */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="meta-account-id" className="text-xs">
                Account ID (act_)
              </Label>
              <Input
                id="meta-account-id"
                placeholder="Ex: 123456789"
                value={metaAccountId}
                onChange={(e) => setMetaAccountId(e.target.value)}
                className="text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                ID da conta de anúncios sem o prefixo "act_"
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meta-token" className="text-xs">
                Token de Acesso (Usuário de Sistema)
              </Label>
              <div className="relative">
                <Input
                  id="meta-token"
                  type={showToken ? "text" : "password"}
                  placeholder={metaConfigured ? "••••••••••••••••" : "Cole o token do usuário de sistema"}
                  value={metaAccessToken}
                  onChange={(e) => setMetaAccessToken(e.target.value)}
                  className="text-sm pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Gere em Business Manager → Configurações → Usuários do sistema → Gerar token
              </p>
            </div>

            {/* Date range for extraction */}
            <div className="space-y-1.5">
              <Label className="text-xs">Período para extração de insights</Label>
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "flex-1 justify-start text-left font-normal text-sm",
                        !dateFrom && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                      {format(dateFrom, "dd/MM/yyyy", { locale: ptBR })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={(d) => d && setDateFrom(d)}
                      disabled={(date) => date > new Date()}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <span className="text-xs text-muted-foreground">até</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "flex-1 justify-start text-left font-normal text-sm",
                        !dateTo && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                      {format(dateTo, "dd/MM/yyyy", { locale: ptBR })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={(d) => d && setDateTo(d)}
                      disabled={(date) => date > new Date()}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Selecione o período desejado para extrair os insights de gastos
              </p>
            </div>

            <Button onClick={handleSaveMeta} disabled={metaSaving} className="w-full">
              {metaSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {metaConfigured ? "Atualizar Credenciais" : "Conectar Meta Ads"}
            </Button>
          </div>

          {/* Sync info + spend summary */}
          {metaConfigured && (
            <div className="p-3 rounded-md bg-secondary/50 space-y-2">
              {metaLastSync && (
                <p className="text-xs text-muted-foreground">
                  Última sincronização:{" "}
                  {format(new Date(metaLastSync), "dd/MM/yyyy HH:mm")}
                </p>
              )}
              {spendLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Carregando insights...
                </div>
              ) : spendError ? (
                <p className="text-xs text-destructive">{spendError.message}</p>
              ) : spendData ? (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Gasto de {format(dateFrom, "dd/MM", { locale: ptBR })} a {format(dateTo, "dd/MM", { locale: ptBR })}:
                  </p>
                  <span className="text-sm font-semibold text-foreground">
                    R$ {spendData.total_spend.toFixed(2)}
                  </span>
                </div>
              ) : null}
              <p className="text-[10px] text-muted-foreground">
                ✓ Insights atualizam automaticamente a cada 5 minutos
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
