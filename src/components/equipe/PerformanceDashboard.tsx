import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { PerformanceKPIs } from "@/hooks/useTeamPerformance";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { CheckCircle2, TrendingUp, ListChecks, Loader2 } from "lucide-react";

interface Props {
  kpis: PerformanceKPIs;
  userName?: string;
}

export function PerformanceDashboard({ kpis, userName }: Props) {
  const maxSpeed = 14; // max days for speed bar (inverted)
  const speedPercent = Math.max(0, 100 - (kpis.avgSpeed / maxSpeed) * 100);

  return (
    <div className="space-y-6">
      {userName && (
        <h2 className="text-lg font-semibold text-foreground">{userName}</h2>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Taxa de Conclusão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {kpis.completionRate.toFixed(0)}%
            </p>
            <Progress value={kpis.completionRate} className="mt-2 h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Produtividade Média
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {kpis.avgProductivity.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">tarefas/dia (30d)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              Tarefas Ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {kpis.activeTasks}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4" />
              Em Andamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-foreground">
              {kpis.inProgressTasks}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Performance Individual */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Performance Individual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Conclusão no Prazo</span>
              <span className="font-medium text-foreground">
                {kpis.onTimeRate.toFixed(0)}%
              </span>
            </div>
            <Progress value={kpis.onTimeRate} className="h-2" />
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">
                Velocidade Média ({kpis.avgSpeed.toFixed(1)}d)
              </span>
              <span className="font-medium text-foreground">
                {speedPercent.toFixed(0)}%
              </span>
            </div>
            <Progress value={speedPercent} className="h-2" />
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">
                Volume Semanal ({kpis.weeklyVolume}/{kpis.weeklyGoal})
              </span>
              <span className="font-medium text-foreground">
                {Math.min(100, (kpis.weeklyVolume / kpis.weeklyGoal) * 100).toFixed(0)}%
              </span>
            </div>
            <Progress
              value={Math.min(100, (kpis.weeklyVolume / kpis.weeklyGoal) * 100)}
              className="h-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tendência 7 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={kpis.chartData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--foreground))",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  fillOpacity={1}
                  fill="url(#colorCount)"
                  name="Concluídas"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
