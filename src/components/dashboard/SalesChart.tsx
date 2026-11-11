import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface SalesChartProps {
  data?: { produto: string; vendas: number }[];
  isLoading?: boolean;
}

// Cores vindas do design ativo (ver --chart-main e tokens em index.css)
const MAIN = "hsl(var(--chart-main))";
const GRID = "hsl(var(--border))";
const AXIS = "hsl(var(--muted-foreground))";

export function SalesChart({ data, isLoading }: SalesChartProps) {
  return (
    <div className="material-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Vendas por Produto</h3>
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
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" stroke={AXIS} fontSize={11} />
              <YAxis dataKey="produto" type="category" stroke={AXIS} fontSize={11} width={120} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "hsl(var(--popover-foreground))",
                }}
              />
              <Bar dataKey="vendas" fill={MAIN} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
