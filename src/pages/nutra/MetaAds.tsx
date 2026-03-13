import { useState } from "react";
import { format, subDays } from "date-fns";
import { RefreshCw, Play, Pause, Settings2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMetaAdAccounts, useMetaAdCampaigns, useSyncMetaAds, useMetaAction } from "@/hooks/useMetaAds";
import { MetaOAuthButton } from "@/components/nutra/MetaOAuthButton";
import { MetaRulesDialog } from "@/components/nutra/MetaRulesDialog";
import { useToast } from "@/hooks/use-toast";

const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function MetaAdsPage() {
  const [since, setSince] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [until, setUntil] = useState(format(new Date(), "yyyy-MM-dd"));
  const [rulesOpen, setRulesOpen] = useState(false);
  const { toast } = useToast();

  const { data: accounts = [], isLoading: accountsLoading } = useMetaAdAccounts();
  const activeAccount = accounts[0];
  const { data: campaigns = [], isLoading: campaignsLoading } = useMetaAdCampaigns(activeAccount?.id, since, until);
  const syncMutation = useSyncMetaAds();
  const actionMutation = useMetaAction();

  const totalSpend = campaigns.reduce((s, c) => s + Number(c.spend || 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + Number(c.clicks || 0), 0);
  const totalConversions = campaigns.reduce((s, c) => s + Number(c.conversions || 0), 0);
  const totalRevenue = campaigns.reduce((s, c) => s + Number(c.revenue || 0), 0);
  const avgRoas = totalSpend > 0 ? (totalRevenue / totalSpend).toFixed(2) : "–";

  const handleSync = () => {
    if (!activeAccount) return;
    syncMutation.mutate(activeAccount.id, {
      onSuccess: () => toast({ title: "Sincronização concluída" }),
      onError: (e) => toast({ title: "Erro na sincronização", description: String(e), variant: "destructive" }),
    });
  };

  const handleAction = (campaignId: string, action: string) => {
    actionMutation.mutate(
      { action, campaign_id: campaignId },
      {
        onSuccess: () => toast({ title: `Ação "${action}" executada` }),
        onError: (e) => toast({ title: "Erro", description: String(e), variant: "destructive" }),
      }
    );
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

      {!activeAccount && !accountsLoading ? (
        <div className="glass-card p-12 text-center space-y-4">
          <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold text-foreground">Conecte sua conta Meta Ads</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Conecte uma conta de anúncios para visualizar métricas, gerenciar campanhas e criar regras automáticas.
          </p>
          <MetaOAuthButton />
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Gasto</TableHead>
                <TableHead className="text-right">Cliques</TableHead>
                <TableHead className="text-right">Conv.</TableHead>
                <TableHead className="text-right">CPA</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaignsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                    Nenhuma campanha encontrada no período
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-sm max-w-[200px] truncate">{c.campaign_name}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px]">
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">{fmtBRL(Number(c.spend || 0))}</TableCell>
                    <TableCell className="text-right text-sm">{Number(c.clicks || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm">{Number(c.conversions || 0)}</TableCell>
                    <TableCell className="text-right text-sm">
                      {Number(c.conversions || 0) > 0 ? fmtBRL(Number(c.spend || 0) / Number(c.conversions)) : "–"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {Number(c.spend || 0) > 0 ? `${(Number(c.revenue || 0) / Number(c.spend)).toFixed(2)}x` : "–"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {c.status === "ACTIVE" ? (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleAction(c.campaign_id, "pause")}>
                            <Pause className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleAction(c.campaign_id, "resume")}>
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {activeAccount && (
        <MetaRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} accountId={activeAccount.id} />
      )}
    </div>
  );
}
