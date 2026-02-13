import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CheckSquare, AlertTriangle, Phone, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export function OperationCards() {
  const today = format(new Date(), "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["operation-cards", today],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { myTasks: [], overdue: [], todayCalls: [], pendingLeads: [] };

      const [myTasksRes, overdueRes, callsRes, leadsRes] = await Promise.all([
        supabase.from("tasks").select("id, title, priority, status").eq("assigned_to", user.id).neq("status", "concluido").order("created_at", { ascending: false }).limit(5),
        supabase.from("tasks").select("id, title, priority, due_date").lt("due_date", today).neq("status", "concluido").order("due_date", { ascending: true }).limit(5),
        supabase.from("calls").select("id, start_at, lead_email, status").gte("start_at", `${today}T00:00:00`).lte("start_at", `${today}T23:59:59`).eq("status", "scheduled").order("start_at"),
        supabase.from("leads").select("id, full_name, email, last_sale_status_enum").in("last_sale_status_enum", ["pending"]).limit(5),
      ]);

      return {
        myTasks: myTasksRes.data || [],
        overdue: overdueRes.data || [],
        todayCalls: callsRes.data || [],
        pendingLeads: leadsRes.data || [],
      };
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[140px]" />)}
      </div>
    );
  }

  const cards = [
    {
      icon: CheckSquare,
      label: "Minhas Tarefas",
      count: data?.myTasks.length || 0,
      items: data?.myTasks.map((t: any) => t.title) || [],
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      icon: AlertTriangle,
      label: "Atrasadas",
      count: data?.overdue.length || 0,
      items: data?.overdue.map((t: any) => `${t.title} (${t.due_date})`) || [],
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
    {
      icon: Phone,
      label: "Calls de Hoje",
      count: data?.todayCalls.length || 0,
      items: data?.todayCalls.map((c: any) => `${format(new Date(c.start_at), "HH:mm")} - ${c.lead_email || "Sem lead"}`) || [],
      color: "text-chart-2",
      bg: "bg-chart-2/10",
    },
    {
      icon: Users,
      label: "Leads Pendentes",
      count: data?.pendingLeads.length || 0,
      items: data?.pendingLeads.map((l: any) => l.full_name || l.email) || [],
      color: "text-warning",
      bg: "bg-warning/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground">{card.label}</span>
            <div className={`h-8 w-8 rounded-md ${card.bg} flex items-center justify-center`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </div>
          <p className={`text-2xl font-bold ${card.color}`}>{card.count}</p>
          {card.items.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {card.items.slice(0, 3).map((item, i) => (
                <li key={i} className="text-[11px] text-muted-foreground truncate">• {item}</li>
              ))}
              {card.items.length > 3 && (
                <li className="text-[10px] text-muted-foreground/60">+{card.items.length - 3} mais</li>
              )}
            </ul>
          )}
          {card.items.length === 0 && (
            <p className="text-[11px] text-muted-foreground/50 mt-2">Nenhum item</p>
          )}
        </div>
      ))}
    </div>
  );
}
