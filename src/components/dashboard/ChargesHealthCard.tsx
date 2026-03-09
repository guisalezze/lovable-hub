import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isBefore, isAfter, startOfDay, parseISO, addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Clock, TrendingUp, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

function useChargesHealth() {
  return useQuery({
    queryKey: ["charges-health"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("charge_installments")
          .select("id, due_date, amount, status, charges:charge_id(client_name, product_name)")
          .neq("status", "paid");
        if (error) throw error;

        const today = startOfDay(new Date());
        const in30 = addDays(today, 30);

        const overdue = (data || []).filter((i: any) => isBefore(startOfDay(parseISO(i.due_date)), today));
        const dueToday = (data || []).filter((i: any) => {
          const d = startOfDay(parseISO(i.due_date));
          return d.getTime() === today.getTime();
        });
        const next30 = (data || []).filter((i: any) => {
          const d = startOfDay(parseISO(i.due_date));
          return isAfter(d, today) && isBefore(d, in30);
        });

        const totalNext30 = next30.reduce((acc: number, i: any) => acc + Number(i.amount), 0);
        const totalOverdue = overdue.reduce((acc: number, i: any) => acc + Number(i.amount), 0);

        return { overdue, dueToday, next30, totalNext30, totalOverdue };
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });
}

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function ChargesHealthCard() {
  const { data, isLoading } = useChargesHealth();
  const navigate = useNavigate();

  if (isLoading || !data) return null;

  const { overdue, dueToday, next30, totalNext30, totalOverdue } = data;

  return (
    <div className="glass-card p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Saúde das Cobranças</h3>
        <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={() => navigate("/cobrancas")}>
          Ver todas <ChevronRight className="h-3 w-3" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className={`rounded-lg p-3 text-center ${overdue.length > 0 ? "bg-destructive/10 border border-destructive/20" : "bg-secondary"}`}>
          <div className="flex items-center justify-center gap-1 mb-1">
            <AlertTriangle className={`h-3 w-3 ${overdue.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            <span className="text-[10px] text-muted-foreground">Atrasadas</span>
          </div>
          <p className={`text-lg font-bold ${overdue.length > 0 ? "text-destructive" : "text-foreground"}`}>{overdue.length}</p>
          {totalOverdue > 0 && <p className="text-[10px] text-destructive">{fmt(totalOverdue)}</p>}
        </div>

        <div className={`rounded-lg p-3 text-center ${dueToday.length > 0 ? "bg-yellow-500/10 border border-yellow-500/20" : "bg-secondary"}`}>
          <div className="flex items-center justify-center gap-1 mb-1">
            <Clock className={`h-3 w-3 ${dueToday.length > 0 ? "text-yellow-500" : "text-muted-foreground"}`} />
            <span className="text-[10px] text-muted-foreground">Hoje</span>
          </div>
          <p className={`text-lg font-bold ${dueToday.length > 0 ? "text-yellow-500" : "text-foreground"}`}>{dueToday.length}</p>
        </div>

        <div className="rounded-lg p-3 text-center bg-secondary">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">30 dias</span>
          </div>
          <p className="text-lg font-bold text-foreground">{next30.length}</p>
          {totalNext30 > 0 && <p className="text-[10px] text-muted-foreground">{fmt(totalNext30)}</p>}
        </div>
      </div>

      {next30.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Próximos vencimentos</p>
          {next30.slice(0, 4).map((i: any) => (
            <div key={i.id} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
              <span className="text-foreground truncate">{(i.charges as any)?.client_name} — {(i.charges as any)?.product_name}</span>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="text-muted-foreground">{format(parseISO(i.due_date), "d MMM", { locale: ptBR })}</span>
                <span className="font-medium text-foreground">{fmt(Number(i.amount))}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
