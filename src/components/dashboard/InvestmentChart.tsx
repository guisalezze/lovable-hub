import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";

interface DailySpend {
  date_start: string;
  spend: string;
}

interface InvestmentChartProps {
  daily: DailySpend[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function InvestmentChart({ daily, isLoading, error }: InvestmentChartProps) {
  const chartData = (daily || []).map((d) => ({
    date: d.date_start.slice(5), // MM-DD
    spend: parseFloat(d.spend),
  }));

  return (
    <div className="glass-card p-5 animate-fade-in">
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
                  <stop offset="5%" stopColor="hsl(172, 66%, 50%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(172, 66%, 50%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 16%, 18%)" />
              <XAxis dataKey="date" stroke="hsl(215, 15%, 55%)" fontSize={11} />
              <YAxis stroke="hsl(215, 15%, 55%)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(220, 18%, 10%)",
                  border: "1px solid hsl(220, 16%, 18%)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number) => [`R$ ${value.toFixed(2)}`, "Investimento"]}
              />
              <Area
                type="monotone"
                dataKey="spend"
                stroke="hsl(172, 66%, 50%)"
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
