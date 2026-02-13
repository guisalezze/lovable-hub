import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Video, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Call {
  id: string;
  lead_email: string | null;
  start_at: string;
  end_at: string | null;
  status: string;
  meet_link: string | null;
  notes: string | null;
}

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from("calls")
        .select("*")
        .order("start_at", { ascending: true });
      setCalls((data as Call[]) || []);
      setLoading(false);
    }
    fetch();
  }, []);

  const today = new Date().toISOString().split("T")[0];
  const todayCalls = calls.filter((c) => c.start_at.startsWith(today));
  const upcoming = calls.filter((c) => c.start_at > new Date().toISOString() && c.status === "scheduled");

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Calls</h1>
        <p className="text-sm text-muted-foreground mt-1">Agenda de reuniões</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Calls de Hoje
          </h3>
          {loading ? (
            <p className="text-muted-foreground text-sm">Carregando...</p>
          ) : todayCalls.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhuma call hoje</p>
          ) : (
            <div className="space-y-3">
              {todayCalls.map((call) => (
                <CallCard key={call.id} call={call} />
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            Próximas Calls
          </h3>
          {upcoming.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhuma call agendada</p>
          ) : (
            <div className="space-y-3">
              {upcoming.slice(0, 10).map((call) => (
                <CallCard key={call.id} call={call} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CallCard({ call }: { call: Call }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-md bg-secondary/30 hover:bg-secondary/50 transition-colors">
      <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <Video className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{call.lead_email || "Call"}</p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(call.start_at), "dd MMM · HH:mm", { locale: ptBR })}
        </p>
      </div>
      {call.meet_link && (
        <a
          href={call.meet_link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-primary hover:underline shrink-0"
        >
          Entrar
        </a>
      )}
    </div>
  );
}
