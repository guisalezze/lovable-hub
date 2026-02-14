import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, startOfDay, format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface PerformanceKPIs {
  completionRate: number;
  avgProductivity: number;
  activeTasks: number;
  inProgressTasks: number;
  onTimeRate: number;
  avgSpeed: number; // days
  weeklyVolume: number;
  weeklyGoal: number;
  chartData: { day: string; count: number }[];
}

function calculateKPIs(tasks: any[]): PerformanceKPIs {
  const now = new Date();
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "concluido");
  const completionRate = total > 0 ? (completed.length / total) * 100 : 0;

  // Productivity: completed in last 30 days / 30
  const thirtyDaysAgo = subDays(now, 30);
  const completed30d = completed.filter(
    (t) => t.completed_at && new Date(t.completed_at) >= thirtyDaysAgo
  );
  const avgProductivity = completed30d.length / 30;

  const activeTasks = tasks.filter((t) => t.status !== "concluido").length;
  const inProgressTasks = tasks.filter((t) => t.status === "em_andamento").length;

  // On-time rate
  const completedWithDue = completed.filter((t) => t.due_date && t.completed_at);
  const onTime = completedWithDue.filter(
    (t) => new Date(t.completed_at!) <= new Date(t.due_date + "T23:59:59")
  );
  const onTimeRate =
    completedWithDue.length > 0 ? (onTime.length / completedWithDue.length) * 100 : 100;

  // Avg speed
  const speeds = completed
    .filter((t) => t.completed_at)
    .map((t) => differenceInDays(new Date(t.completed_at!), new Date(t.created_at)));
  const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;

  // Weekly volume
  const sevenDaysAgo = subDays(now, 7);
  const completedWeek = completed.filter(
    (t) => t.completed_at && new Date(t.completed_at) >= sevenDaysAgo
  );
  const weeklyVolume = completedWeek.length;

  // Chart data (7 days)
  const chartData: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = subDays(now, i);
    const dayStart = startOfDay(day);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const count = completed.filter((t) => {
      if (!t.completed_at) return false;
      const d = new Date(t.completed_at);
      return d >= dayStart && d < dayEnd;
    }).length;
    chartData.push({
      day: format(day, "EEE", { locale: ptBR }),
      count,
    });
  }

  return {
    completionRate,
    avgProductivity,
    activeTasks,
    inProgressTasks,
    onTimeRate,
    avgSpeed,
    weeklyVolume,
    weeklyGoal: 10,
    chartData,
  };
}

export function useIsAdmin() {
  return useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return false;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
  });
}

export function useMyPerformance() {
  return useQuery({
    queryKey: ["my-performance"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return calculateKPIs([]);
      const { data } = await supabase
        .from("tasks")
        .select("*")
        .eq("assigned_to", user.id);
      return calculateKPIs(data || []);
    },
  });
}

export function useTeamMembers() {
  return useQuery({
    queryKey: ["team-members-with-roles"],
    queryFn: async () => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url");
      return profiles || [];
    },
  });
}

export function useMemberPerformance(userId: string | null) {
  return useQuery({
    queryKey: ["member-performance", userId],
    queryFn: async () => {
      if (!userId) return calculateKPIs([]);
      const { data } = await supabase
        .from("tasks")
        .select("*")
        .eq("assigned_to", userId);
      return calculateKPIs(data || []);
    },
    enabled: !!userId,
  });
}
