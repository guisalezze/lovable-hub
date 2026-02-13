import { User } from "lucide-react";
import { useRecentLeads } from "@/hooks/useDashboardData";
import { Skeleton } from "@/components/ui/skeleton";

const statusStyles: Record<string, string> = {
  approved: "bg-success/15 text-success",
  comprou: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  quase_comprou: "bg-warning/15 text-warning",
  in_process: "bg-warning/15 text-warning",
  refunded: "bg-destructive/15 text-destructive",
  charged_back: "bg-destructive/15 text-destructive",
  perdido: "bg-destructive/15 text-destructive",
  novo: "bg-muted text-muted-foreground",
};

export function RecentLeads() {
  const { data: leads, isLoading } = useRecentLeads();

  return (
    <div className="glass-card p-5 animate-fade-in">
      <h3 className="text-sm font-semibold text-foreground mb-4">Leads Recentes</h3>
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-3 w-24 mb-1" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
          ))
        ) : !leads?.length ? (
          <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
            Nenhum lead encontrado
          </div>
        ) : (
          leads.map((lead) => (
            <div key={lead.email} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{lead.name}</p>
                <p className="text-xs text-muted-foreground truncate">{lead.product}</p>
              </div>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusStyles[lead.status] || statusStyles.novo}`}>
                {lead.status}
              </span>
              <span className="text-[10px] text-muted-foreground w-10 text-right">{lead.time}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
