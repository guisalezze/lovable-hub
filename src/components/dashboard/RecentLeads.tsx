import { User } from "lucide-react";

const mockLeads = [
  { name: "João Silva", email: "joao@email.com", product: "Mentoria Pro", status: "approved", time: "2min" },
  { name: "Maria Santos", email: "maria@email.com", product: "Curso Elite", status: "pending", time: "15min" },
  { name: "Pedro Costa", email: "pedro@email.com", product: "Mentoria Pro", status: "approved", time: "32min" },
  { name: "Ana Oliveira", email: "ana@email.com", product: "Pack Digital", status: "refunded", time: "1h" },
  { name: "Carlos Lima", email: "carlos@email.com", product: "Curso Elite", status: "pending", time: "2h" },
];

const statusStyles: Record<string, string> = {
  approved: "bg-success/15 text-success",
  pending: "bg-warning/15 text-warning",
  refunded: "bg-destructive/15 text-destructive",
};

export function RecentLeads() {
  return (
    <div className="glass-card p-5 animate-fade-in">
      <h3 className="text-sm font-semibold text-foreground mb-4">Leads Recentes</h3>
      <div className="space-y-3">
        {mockLeads.map((lead) => (
          <div key={lead.email} className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{lead.name}</p>
              <p className="text-xs text-muted-foreground truncate">{lead.product}</p>
            </div>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusStyles[lead.status]}`}>
              {lead.status}
            </span>
            <span className="text-[10px] text-muted-foreground w-10 text-right">{lead.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
