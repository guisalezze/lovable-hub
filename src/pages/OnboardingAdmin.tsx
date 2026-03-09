import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Copy, CheckCircle2, Clock, ExternalLink, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

function useOnboardings() {
  return useQuery({
    queryKey: ["onboardings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_responses" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
    staleTime: 30_000,
  });
}

export default function OnboardingAdminPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const qc = useQueryClient();

  const { data: onboardings = [], isLoading } = useOnboardings();

  const { data: leads = [] } = useQuery({
    queryKey: ["leads-select"],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("id, full_name, email").order("created_at", { ascending: false }).limit(100);
      return data || [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data || [];
    },
    staleTime: Infinity,
  });

  const createOnboarding = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("onboarding_responses" as any).insert({
        lead_id: leadId || null,
        assigned_to: assignedTo || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboardings"] });
      toast.success("Link de onboarding criado!");
      setCreateOpen(false);
      setLeadId("");
      setAssignedTo("");
    },
    onError: () => toast.error("Erro ao criar onboarding"),
  });

  function copyLink(token: string) {
    const url = `${window.location.origin}/onboarding/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Onboarding</h1>
          <p className="text-sm text-muted-foreground mt-1">{onboardings.length} links gerados</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Novo link
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : (
        <div className="space-y-3">
          {onboardings.map((o: any) => (
            <div key={o.id} className="glass-card p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  {o.status === "completed"
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    : <Clock className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {o.full_name || "Sem resposta"}
                    </span>
                    <Badge variant={o.status === "completed" ? "default" : "secondary"} className="text-[10px]">
                      {o.status === "completed" ? "Respondido" : "Pendente"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Criado em {format(parseISO(o.created_at), "d 'de' MMM 'de' yyyy", { locale: ptBR })}
                  </p>
                  {o.status === "completed" && o.niche && (
                    <p className="text-[11px] text-muted-foreground">Nicho: {o.niche} · {o.current_revenue}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => copyLink(o.token)}>
                  <Copy className="h-3 w-3" /> Copiar link
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" asChild>
                  <a href={`/onboarding/${o.token}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            </div>
          ))}
          {onboardings.length === 0 && (
            <div className="text-center py-12 space-y-2">
              <User className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">Nenhum onboarding criado ainda</p>
            </div>
          )}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Link de Onboarding</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Vincular a um lead (opcional)</label>
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger><SelectValue placeholder="Sem vínculo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem vínculo</SelectItem>
                  {leads.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>{l.full_name || l.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Responsável (opcional)</label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {profiles.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">
              Será gerado um link único. Você pode copiar e enviar pro cliente via WhatsApp.
            </p>

            <Button className="w-full" onClick={() => createOnboarding.mutate()} disabled={createOnboarding.isPending}>
              {createOnboarding.isPending ? "Criando..." : "Gerar link"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
