// src/components/nutra/CampaignMetricsTable.tsx
import { useState, useMemo } from "react";
import { Settings2, DollarSign, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCampaignMetrics, useAdsetMetrics, useAdMetrics, useMetaAction } from "@/hooks/useMetaAds";
import { METRIC_CATALOG, METRIC_GROUPS, DEFAULT_VISIBLE_METRICS, formatMetricValue, type MetricGroup, type MetricRow } from "@/lib/metaMetrics";
import { EditBudgetDialog } from "./EditBudgetDialog";
import { useToast } from "@/hooks/use-toast";

type Level = "campaign" | "adset" | "ad";

const STORAGE_KEY = "meta-ads-visible-metrics";

function loadVisibleMetrics(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_METRICS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_VISIBLE_METRICS;
  } catch {
    return DEFAULT_VISIBLE_METRICS;
  }
}

interface CampaignMetricsTableProps {
  accountId?: string;
  since: string;
  until: string;
}

export function CampaignMetricsTable({ accountId, since, until }: CampaignMetricsTableProps) {
  const [level, setLevel] = useState<Level>("campaign");
  const [visibleMetrics, setVisibleMetrics] = useState<string[]>(loadVisibleMetrics);
  const [budgetTarget, setBudgetTarget] = useState<{ level: "campaign" | "adset"; row: MetricRow } | null>(null);
  const { toast } = useToast();
  const actionMutation = useMetaAction();

  const campaignQuery = useCampaignMetrics(level === "campaign" ? accountId : undefined, since, until);
  const adsetQuery = useAdsetMetrics(level === "adset" ? accountId : undefined, since, until);
  const adQuery = useAdMetrics(level === "ad" ? accountId : undefined, since, until);

  const { data: rows, isLoading } =
    level === "campaign" ? campaignQuery : level === "adset" ? adsetQuery : adQuery;

  const activeMetrics = useMemo(
    () => METRIC_CATALOG.filter((m) => visibleMetrics.includes(m.id)),
    [visibleMetrics]
  );

  const toggleMetric = (id: string) => {
    setVisibleMetrics((prev) => {
      const next = prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleToggleStatus = (row: MetricRow) => {
    actionMutation.mutate(
      { action: row.status === "ACTIVE" ? "pause" : "resume", campaign_id: row.graphId },
      {
        onSuccess: () => toast({ title: "Status atualizado" }),
        onError: (e) => toast({ title: "Erro", description: String(e), variant: "destructive" }),
      }
    );
  };

  const groups = Object.keys(METRIC_GROUPS) as MetricGroup[];
  const nameColumnLabel = level === "campaign" ? "Campanha" : level === "adset" ? "Conjunto" : "Anúncio";
  const showActions = level !== "ad";
  const colCount = 2 + activeMetrics.length + (showActions ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <ToggleGroup type="single" value={level} onValueChange={(v) => v && setLevel(v as Level)} className="justify-start">
          <ToggleGroupItem value="campaign" className="text-xs">Campanha</ToggleGroupItem>
          <ToggleGroupItem value="adset" className="text-xs">Conjunto</ToggleGroupItem>
          <ToggleGroupItem value="ad" className="text-xs">Anúncio</ToggleGroupItem>
        </ToggleGroup>

        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              <Settings2 className="h-3.5 w-3.5 mr-1" />
              Colunas
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 max-h-96 overflow-y-auto" align="end">
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group} className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {METRIC_GROUPS[group]}
                  </p>
                  {METRIC_CATALOG.filter((m) => m.group === group).map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`metric-${m.id}`}
                        checked={visibleMetrics.includes(m.id)}
                        onCheckedChange={() => toggleMetric(m.id)}
                      />
                      <Label htmlFor={`metric-${m.id}`} className="text-sm font-normal cursor-pointer">
                        {m.label}
                      </Label>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="glass-card overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{nameColumnLabel}</TableHead>
              <TableHead>Status</TableHead>
              {activeMetrics.map((m) => (
                <TableHead key={m.id} className="text-right whitespace-nowrap">{m.label}</TableHead>
              ))}
              {showActions && <TableHead className="text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: colCount }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !rows || rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center text-sm text-muted-foreground py-8">
                  Nenhum dado encontrado no período
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={`${row.id}-${row.date}`}>
                  <TableCell className="font-medium text-sm max-w-[200px] truncate">{row.name || row.graphId}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px]">
                      {row.status}
                    </Badge>
                  </TableCell>
                  {activeMetrics.map((m) => (
                    <TableCell key={m.id} className="text-right text-sm whitespace-nowrap">
                      {formatMetricValue(m.compute(row), m.format)}
                    </TableCell>
                  ))}
                  {showActions && (
                    <TableCell className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {level === "campaign" && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleToggleStatus(row)}>
                            {row.status === "ACTIVE" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => setBudgetTarget({ level: level as "campaign" | "adset", row })}
                        >
                          <DollarSign className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {budgetTarget && (
        <EditBudgetDialog
          open={!!budgetTarget}
          onOpenChange={(open) => { if (!open) setBudgetTarget(null); }}
          level={budgetTarget.level}
          id={budgetTarget.row.graphId}
          name={budgetTarget.row.name}
          currentDaily={budgetTarget.row.daily_budget}
          currentLifetime={budgetTarget.row.lifetime_budget}
        />
      )}
    </div>
  );
}
