import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CheckSquare, AlertTriangle, Phone, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

export function OperationCards() {
  const today = format(new Date(), "yyyy-MM-dd");
  const navigate = useNavigate();

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[100px]" />)}
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
      onClick: () => navigate("/tarefas"),
    },
    {
      icon: AlertTriangle,
      label: "Atrasadas",
      count: data?.overdue.length || 0,
      items: data?.overdue.map((t: any) => t.title) || [],
      color: "text-destructive",
      bg: "bg-destructive/10",
      onClick: () => navigate("/tarefas?filter=overdue"),
    },
    {
      icon: Phone,
      label: "Calls Hoje",
      count: data?.todayCalls.length || 0,
      items: data?.todayCalls.map((c: any) => `${format(new Date(c.start_at), "HH:mm")} - ${c.lead_email || "Sem lead"}`) || [],
      color: "text-chart-2",
      bg: "bg-chart-2/10",
      onClick: () => navigate("/agenda"),
    },
    {
      icon: Users,
      label: "Leads Pendentes",
      count: data?.pendingLeads.length || 0,
      items: data?.pendingLeads.map((l: any) => l.full_name || l.email) || [],
      color: "text-warning",
      bg: "bg-warning/10",
      onClick: () => navigate("/leads?status=novo"),
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="glass-card p-3 cursor-pointer hover:shadow-md transition-shadow"
          onClick={card.onClick}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-muted-foreground">{card.label}</span>
            <div className={`h-6 w-6 rounded-md ${card.bg} flex items-center justify-center`}>
              <card.icon className={`h-3 w-3 ${card.color}`} />
            </div>
          </div>
          <p className={`text-lg font-bold ${card.color}`}>{card.count}</p>
          {card.items.length > 0 && (
            <ul className="mt-1 space-y-0">
              {card.items.slice(0, 2).map((item, i) => (
                <li key={i} className="text-[10px] text-muted-foreground truncate">• {item}</li>
              ))}
              {card.items.length > 2 && (
                <li className="text-[9px] text-muted-foreground/60">+{card.items.length - 2} mais</li>
              )}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
