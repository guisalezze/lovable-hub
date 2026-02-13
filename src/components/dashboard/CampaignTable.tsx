import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";

interface Campaign {
  campaign_id: string;
  campaign_name: string;
  spend: string;
  clicks: string;
  impressions: string;
}

interface CampaignTableProps {
  campaigns: Campaign[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function CampaignTable({ campaigns, isLoading, error }: CampaignTableProps) {
  const sorted = [...(campaigns || [])].sort(
    (a, b) => parseFloat(b.spend) - parseFloat(a.spend)
  );

  return (
    <div className="glass-card p-5 animate-fade-in">
      <h3 className="text-sm font-semibold text-foreground mb-4">Gasto por Campanha</h3>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-32 gap-2 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4" />
          <span>{error.message}</span>
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          Sem campanhas no período
        </div>
      ) : (
        <div className="overflow-auto max-h-80">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Campanha</TableHead>
                <TableHead className="text-xs text-right">Spend</TableHead>
                <TableHead className="text-xs text-right">Clicks</TableHead>
                <TableHead className="text-xs text-right">Impressões</TableHead>
                <TableHead className="text-xs text-right">CPC</TableHead>
                <TableHead className="text-xs text-right">CTR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((c) => {
                const spend = parseFloat(c.spend);
                const clicks = parseInt(c.clicks);
                const impressions = parseInt(c.impressions);
                const cpc = clicks > 0 ? (spend / clicks).toFixed(2) : "–";
                const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) + "%" : "–";

                return (
                  <TableRow key={c.campaign_id}>
                    <TableCell className="text-xs font-medium max-w-[200px] truncate">
                      {c.campaign_name}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      R$ {spend.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      {clicks.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      {impressions.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">
                      {cpc !== "–" ? `R$ ${cpc}` : cpc}
                    </TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{ctr}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
