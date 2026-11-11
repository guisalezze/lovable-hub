import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface RevenueChartProps {
  data?: { date: string; receita: number }[];
  isLoading?: boolean;
}

// Cores vindas do design ativo (ver --chart-main e tokens em index.css)
const MAIN = "hsl(var(--chart-main))";
const GRID = "hsl(var(--border))";
const AXIS = "hsl(var(--muted-foreground))";

export function RevenueChart({ data, isLoading }: RevenueChartProps) {
  return (
    <div className="material-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Receita por Dia</h3>
      <div className="h-64">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Skeleton className="h-full w-full rounded-md" />
          </div>
        ) : !data?.length ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Sem dados no período
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
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
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "hsl(var(--popover-foreground))",
                }}
                labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                formatter={(value: number) => [`R$ ${value.toFixed(2)}`, "Receita"]}
              />
              <Area type="monotone" dataKey="receita" stroke={MAIN} fillOpacity={1} fill="url(#colorReceita)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
