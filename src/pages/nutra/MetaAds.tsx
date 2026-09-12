import { useState } from "react";
import { format, subDays } from "date-fns";
import { RefreshCw, Settings2, BarChart3, AlertTriangle, ArrowRight, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMetaAdAccounts, useCampaignMetrics, useSyncMetaAds, useMetaConnection, useAdPerformance } from "@/hooks/useMetaAds";
import { MetaRulesDialog } from "@/components/nutra/MetaRulesDialog";
import { CampaignMetricsTable } from "@/components/nutra/CampaignMetricsTable";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function MetaAdsPage() {
  const [since, setSince] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [until, setUntil] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rulesOpen, setRulesOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data: accounts = [], isLoading: accountsLoading } = useMetaAdAccounts();
  const { data: connection, isLoading: connectionLoading } = useMetaConnection();
  const activeAccount = accounts[0];
  // Conta conectada via legado (app_settings) mas ainda não migrada para meta_ad_accounts
  const legacyConnected = !activeAccount && !accountsLoading && connection?.configured === true;
  const { data: campaignRows = [] } = useCampaignMetrics(activeAccount?.id, since, until);
  const syncMutation = useSyncMetaAds();
  const { data: adPerformance = [], isLoading: adPerformanceLoading } = useAdPerformance(activeAccount?.id, since, until);

  const totalSpend = campaignRows.reduce((s, r) => s + r.spend, 0);
  const totalClicks = campaignRows.reduce((s, r) => s + r.clicks, 0);
  const totalConversions = campaignRows.reduce((s, r) => s + r.conversions, 0);
  const totalRevenue = campaignRows.reduce((s, r) => s + (r.revenue || 0), 0);
  const avgRoas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : "–";

  const handleSync = () => {
    if (!activeAccount) return;
    syncMutation.mutate(activeAccount.id, {
      onSuccess: () => toast({ title: "Sincronização concluída" }),
      onError: (e) => toast({ title: "Erro na sincronização", description: String(e), variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Meta Ads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gestão de campanhas e métricas</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={since} onChange={(e) => setSince(e.target.value)} className="h-8 text-xs w-[130px]" />
          <span className="text-xs text-muted-foreground">→</span>
          <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="h-8 text-xs w-[130px]" />
          <Button size="sm" variant="outline" onClick={handleSync} disabled={syncMutation.isPending || !activeAccount}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Sync
          </Button>
          {activeAccount && (
            <Button size="sm" variant="outline" onClick={() => setRulesOpen(true)}>
              <Settings2 className="h-3.5 w-3.5 mr-1" />
              Regras
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Investimento", value: fmtBRL(totalSpend) },
          { label: "Cliques", value: totalClicks.toLocaleString("pt-BR") },
          { label: "Conversões", value: totalConversions.toLocaleString("pt-BR") },
          { label: "Receita", value: fmtBRL(totalRevenue) },
          { label: "ROAS", value: `${avgRoas}x` },
        ].map((kpi) => (
          <div key={kpi.label} className="glass-card p-4">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
            <p className="text-xl font-bold text-foreground mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      {legacyConnected ? (
        /* Conta conectada via Integrações (legado) — pede para reconectar para habilitar gestão de campanhas */
        <div className="glass-card p-8 space-y-4 border border-yellow-500/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">
                Conta conectada — reconexão necessária
              </h2>
              <p className="text-sm text-muted-foreground">
                Sua conta <span className="font-medium text-foreground">{(connection as any)?.meta_ads_account_id || "Meta Ads"}</span> está configurada via Integrações.
                Para habilitar a gestão de campanhas, salve novamente suas credenciais em <strong>Integrações</strong>.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => navigate("/integracoes")} className="gap-2">
            Ir para Integrações
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : !activeAccount && !accountsLoading && !connectionLoading ? (
        /* Sem conta configurada */
        <div className="glass-card p-12 text-center space-y-4">
          <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold text-foreground">Conecte sua conta Meta Ads</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Configure sua conta de anúncios no menu Integrações para visualizar métricas e gerenciar campanhas.
          </p>
          <Button onClick={() => navigate("/integracoes")} className="gap-2">
            Configurar em Integrações
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Tabs defaultValue="campanhas">
          <TabsList>
            <TabsTrigger value="campanhas">Campanhas</TabsTrigger>
            <TabsTrigger value="atribuicao">
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Atribuição
            </TabsTrigger>
          </TabsList>
          <TabsContent value="campanhas">
            <CampaignMetricsTable accountId={activeAccount?.id} since={since} until={until} />
          </TabsContent>
          <TabsContent value="atribuicao">
            <div className="glass-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Anúncio</TableHead>
                    <TableHead>Conjunto</TableHead>
                    <TableHead>Campanha</TableHead>
                    <TableHead className="text-right">Gasto</TableHead>
                    <TableHead className="text-right">Vendas</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">CPA</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                    <TableHead className="text-right">Lucro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adPerformanceLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : adPerformance.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                        Nenhum anúncio com dados de atribuição no período
                      </TableCell>
                    </TableRow>
                  ) : (
                    adPerformance.map((a: any) => (
                      <TableRow key={`${a.ad_id}-${a.date}`}>
                        <TableCell className="font-medium text-sm max-w-[200px] truncate">{a.ad_name || a.ad_id}</TableCell>
                        <TableCell className="text-sm max-w-[160px] truncate">{a.adset_name || "–"}</TableCell>
                        <TableCell className="text-sm max-w-[160px] truncate">{a.campaign_name || "–"}</TableCell>
                        <TableCell className="text-right text-sm">{fmtBRL(Number(a.spend || 0))}</TableCell>
                        <TableCell className="text-right text-sm">{Number(a.sales_count || 0)}</TableCell>
                        <TableCell className="text-right text-sm">{fmtBRL(Number(a.revenue || 0))}</TableCell>
                        <TableCell className="text-right text-sm">{a.cpa != null ? fmtBRL(Number(a.cpa)) : "–"}</TableCell>
                        <TableCell className="text-right text-sm">{a.roas != null ? `${Number(a.roas).toFixed(2)}x` : "–"}</TableCell>
                        <TableCell className={`text-right text-sm ${Number(a.profit || 0) < 0 ? "text-destructive" : "text-green-600"}`}>
                          {fmtBRL(Number(a.profit || 0))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {activeAccount && (
        <MetaRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} accountId={activeAccount.id} />
      )}
    </div>
  );
}
