import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface SalesChartProps {
  data?: { produto: string; vendas: number }[];
  isLoading?: boolean;
}

export function SalesChart({ data, isLoading }: SalesChartProps) {
  return (
    <div className="glass-card p-5 animate-fade-in">
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
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 16%, 18%)" horizontal={false} />
              <XAxis type="number" stroke="hsl(215, 15%, 55%)" fontSize={11} />
              <YAxis dataKey="produto" type="category" stroke="hsl(215, 15%, 55%)" fontSize={11} width={120} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(220, 18%, 10%)",
                  border: "1px solid hsl(220, 16%, 18%)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="vendas" fill="hsl(172, 66%, 50%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
