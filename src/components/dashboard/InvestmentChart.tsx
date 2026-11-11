import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";

// Cores do design ativo (mesmo padrão de RevenueChart/SalesChart)
const MAIN = "hsl(var(--chart-main))";
const GRID = "hsl(var(--border))";
const AXIS = "hsl(var(--muted-foreground))";

interface DailySpend {
  date_start: string;
  spend_brl: string;
  spend_usd: string;
}

interface InvestmentChartProps {
  daily: DailySpend[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function InvestmentChart({ daily, isLoading, error }: InvestmentChartProps) {
  const chartData = (daily || []).map((d) => ({
    date: d.date_start.slice(5), // MM-DD
    spend: parseFloat(d.spend_brl || d.spend_usd || "0"),
  }));

  return (
    <div className="material-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Investimento por Dia</h3>
      <div className="h-64">
        {isLoading ? (
          <div className="flex flex-col gap-2 h-full justify-center">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full gap-2 text-destructive text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>{error.message}</span>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Sem dados para o período selecionado
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={MAIN} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={MAIN} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="date" stroke={AXIS} fontSize={11} />
              <YAxis stroke={AXIS} fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  color: "hsl(var(--popover-foreground))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number) => [`R$ ${value.toFixed(2)}`, "Investimento"]}
              />
              <Area
                type="monotone"
                dataKey="spend"
                stroke={MAIN}
                fillOpacity={1}
                fill="url(#colorSpend)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
