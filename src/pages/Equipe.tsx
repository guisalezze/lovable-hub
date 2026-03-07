import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Crown, Medal, Award, ArrowLeft, CheckCircle2, Phone, DollarSign, Target } from "lucide-react";
import { PeriodSelector } from "@/components/dashboard/PeriodSelector";
import { PerformanceDashboard } from "@/components/equipe/PerformanceDashboard";
import { TeamMemberCard } from "@/components/equipe/TeamMemberCard";
import {
  useIsAdmin,
  useMyPerformance,
  useTeamMembers,
  useMemberPerformance,
} from "@/hooks/useTeamPerformance";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface TeamMemberStats {
  id: string;
  name: string;
  email: string;
  tasksCompleted: number;
  callsDone: number;
  salesAmount: number;
  taskGoal: number;
  callGoal: number;
  salesGoal: number;
}

function useTeamStats(since: string, until: string) {
  return useQuery({
    queryKey: ["team-stats", since, until],
    queryFn: async () => {
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email");
      const { data: tasks } = await supabase.from("tasks").select("assigned_to")
        .eq("status", "concluido")
        .gte("completed_at", `${since}T00:00:00`)
        .lte("completed_at", `${until}T23:59:59`);
      const { data: calls } = await supabase.from("calls").select("owner_user_id")
        .eq("status", "completed")
        .gte("start_at", `${since}T00:00:00`)
        .lte("start_at", `${until}T23:59:59`);
      const { data: sales } = await supabase.from("sales").select("lead_email, sale_amount")
        .eq("sale_status_enum", "approved")
        .gte("created_at", `${since}T00:00:00`)
        .lte("created_at", `${until}T23:59:59`);

      return (profiles || []).map((p: any) => ({
        id: p.id,
        name: p.full_name || p.email,
        email: p.email,
        tasksCompleted: (tasks || []).filter((t: any) => t.assigned_to === p.id).length,
        callsDone: (calls || []).filter((c: any) => c.owner_user_id === p.id).length,
        salesAmount: 0, // sales don't have owner, so skip silently
        taskGoal: 20,
        callGoal: 10,
        salesGoal: 5000,
      })) as TeamMemberStats[];
    },
    staleTime: 60_000,
  });
}

const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function progressColor(pct: number) {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-primary";
  return "bg-yellow-500";
}

export default function Equipe() {
  const { data: isAdmin, isLoading: loadingAdmin } = useIsAdmin();
  const { data: myKpis, isLoading: loadingKpis } = useMyPerformance();
  const { data: members } = useTeamMembers();
  const [selectedMember, setSelectedMember] = useState<{
    id: string; full_name: string; email: string; avatar_url: string | null;
  } | null>(null);
  const { data: memberKpis } = useMemberPerformance(selectedMember?.id ?? null);

  const [since, setSince] = useState(format(subDays(new Date(), 29), "yyyy-MM-dd"));
  const [until, setUntil] = useState(format(new Date(), "yyyy-MM-dd"));
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const { data: teamStats = [] } = useTeamStats(since, until);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  const ranked = useMemo(() =>
    [...teamStats].sort((a, b) => (b.tasksCompleted + b.callsDone) - (a.tasksCompleted + a.callsDone)),
    [teamStats]
  );

  const chartData = useMemo(() =>
    teamStats.map(m => ({
      name: m.name.split(" ")[0],
      Tarefas: m.tasksCompleted,
      Calls: m.callsDone,
    })),
    [teamStats]
  );

  // My stats
  const myStats = useMemo(() => teamStats.find(m => m.id === currentUserId), [teamStats, currentUserId]);

  if (loadingAdmin || loadingKpis) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Equipe</h1>
        <PeriodSelector since={since} until={until} onChange={(s, u) => { setSince(s); setUntil(u); }} />
      </div>

      <Tabs defaultValue={isAdmin ? "ranking" : "minha"}>
        <TabsList>
          <TabsTrigger value="minha">Minha Performance</TabsTrigger>
          {isAdmin && <TabsTrigger value="ranking">Ranking</TabsTrigger>}
          {isAdmin && <TabsTrigger value="grafico">Comparativo</TabsTrigger>}
        </TabsList>

        {/* Minha Performance */}
        <TabsContent value="minha">
          {myKpis && <PerformanceDashboard kpis={myKpis} />}
          {myStats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div className="glass-card p-4 space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="h-4 w-4" /><span className="text-xs font-medium">Tarefas Concluídas</span></div>
                <p className="text-2xl font-bold text-foreground">{myStats.tasksCompleted}</p>
                <Progress value={Math.min((myStats.tasksCompleted / myStats.taskGoal) * 100, 100)} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground">Meta: {myStats.taskGoal}</p>
              </div>
              <div className="glass-card p-4 space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /><span className="text-xs font-medium">Calls Realizadas</span></div>
                <p className="text-2xl font-bold text-foreground">{myStats.callsDone}</p>
                <Progress value={Math.min((myStats.callsDone / myStats.callGoal) * 100, 100)} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground">Meta: {myStats.callGoal}</p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Ranking */}
        {isAdmin && (
          <TabsContent value="ranking">
            {selectedMember ? (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setSelectedMember(null)} className="gap-2">
                  <ArrowLeft className="h-4 w-4" />Voltar
                </Button>
                {memberKpis && (
                  <PerformanceDashboard kpis={memberKpis} userName={selectedMember.full_name || selectedMember.email} />
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                {ranked.map((member, idx) => {
                  const taskPct = Math.min((member.tasksCompleted / member.taskGoal) * 100, 100);
                  const callPct = Math.min((member.callsDone / member.callGoal) * 100, 100);
                  const isMe = member.id === currentUserId;

                  return (
                    <div
                      key={member.id}
                      onClick={() => {
                        const m = members?.find(mm => mm.id === member.id);
                        if (m) setSelectedMember(m);
                      }}
                      className="glass-card p-4 cursor-pointer hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          {/* Position Icon */}
                          <div className="w-8 h-8 flex items-center justify-center">
                            {idx === 0 && <Crown className="h-5 w-5 text-yellow-500" />}
                            {idx === 1 && <Medal className="h-5 w-5 text-muted-foreground" />}
                            {idx === 2 && <Award className="h-5 w-5 text-amber-600" />}
                            {idx > 2 && <span className="text-sm font-bold text-muted-foreground">{idx + 1}º</span>}
                          </div>
                          {/* Avatar */}
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold">
                              {member.name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase()).join("")}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                {member.name.split(" ")[0]}
                                {isMe && <Badge variant="secondary" className="text-[9px] px-1">Você</Badge>}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{member.email}</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Progress bars */}
                      <div className="space-y-2.5">
                        <div>
                          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                            <span>Tarefas</span><span>{member.tasksCompleted}/{member.taskGoal}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${progressColor(taskPct)}`} style={{ width: `${taskPct}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                            <span>Calls</span><span>{member.callsDone}/{member.callGoal}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${progressColor(callPct)}`} style={{ width: `${callPct}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        )}

        {/* Comparativo */}
        {isAdmin && (
          <TabsContent value="grafico">
            <div className="glass-card p-4 mt-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Atividades por membro</h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Tarefas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Calls" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período</p>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
