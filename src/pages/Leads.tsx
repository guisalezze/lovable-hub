import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Mail, Copy, ExternalLink, Plus, Search, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { format, parseISO, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LeadDetailModal } from "@/components/leads/LeadDetailModal";

type LeadStatus = "novo" | "quase_comprou" | "comprou" | "perdido";

type LeadSource = "meta_ads" | "organic" | "referral" | "whatsapp" | "other" | "manual";

interface Lead {
  id: string;
  email: string;
  full_name: string | null;
  phone_formatted: string | null;
  phone_e164: string | null;
  status: LeadStatus;
  last_product: string | null;
  last_sale_amount: number | null;
  last_sale_status_enum: string | null;
  last_billet_url: string | null;
  created_at: string;
  source?: LeadSource | null;
  follow_up_at?: string | null;
  follow_up_note?: string | null;
}

const columns: { status: LeadStatus; label: string; color: string; dot: string }[] = [
  { status: "novo", label: "Novo", color: "bg-primary/20 text-primary", dot: "bg-primary" },
  { status: "quase_comprou", label: "Quase Comprou", color: "bg-yellow-500/20 text-yellow-600", dot: "bg-yellow-500" },
  { status: "comprou", label: "Comprou", color: "bg-emerald-500/20 text-emerald-600", dot: "bg-emerald-500" },
  { status: "perdido", label: "Perdido", color: "bg-destructive/20 text-destructive", dot: "bg-destructive" },
];

const SOURCE_OPTIONS = [
  { value: "meta_ads", label: "Meta Ads", icon: "📱" },
  { value: "organic", label: "Orgânico", icon: "🌱" },
  { value: "referral", label: "Indicação", icon: "🤝" },
  { value: "whatsapp", label: "WhatsApp", icon: "💬" },
  { value: "other", label: "Outro", icon: "📌" },
];

function useLeads() {
  return useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as Lead[]) || [];
    },
    staleTime: 30_000,
  });
}

function useUpdateLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: LeadStatus }) => {
      const { error } = await supabase.from("leads").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["leads"] });
      const prev = qc.getQueryData<Lead[]>(["leads"]);
      qc.setQueryData<Lead[]>(["leads"], old => old?.map(l => l.id === id ? { ...l, status } : l) ?? []);
      return { prev };
    },
    onError: (_e, _v, ctx) => { qc.setQueryData(["leads"], ctx?.prev); toast.error("Erro ao atualizar status"); },
    onSuccess: () => toast.success("Status atualizado"),
  });
}

const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function LeadsPage() {
  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState("all");
  const [valueFilter, setValueFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showFollowUpOnly, setShowFollowUpOnly] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const { data: leads = [], isLoading } = useLeads();
  const updateStatus = useUpdateLeadStatus();

  const products = useMemo(() => {
    const set = new Set(leads.map(l => l.last_product).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [leads]);

  const followUpTodayCount = useMemo(() =>
    leads.filter(l => l.follow_up_at && isSameDay(parseISO(l.follow_up_at), new Date())).length
  , [leads]);

  const filtered = useMemo(() => {
    let result = leads;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        (l.full_name || "").toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q)
      );
    }
    if (productFilter !== "all") result = result.filter(l => l.last_product === productFilter);
    if (sourceFilter !== "all") result = result.filter(l => l.source === sourceFilter);
    if (showFollowUpOnly) {
      result = result.filter(l => l.follow_up_at && isSameDay(parseISO(l.follow_up_at), new Date()));
    }
    if (valueFilter !== "all") {
      result = result.filter(l => {
        const v = Number(l.last_sale_amount ?? 0);
        if (valueFilter === "sem_venda") return v === 0;
        if (valueFilter === "ate500") return v > 0 && v <= 500;
        if (valueFilter === "500a2000") return v > 500 && v <= 2000;
        if (valueFilter === "acima2000") return v > 2000;
        return true;
      });
    }
    return result;
  }, [leads, search, productFilter, valueFilter, sourceFilter, showFollowUpOnly]);

  const getLeadsByStatus = (status: LeadStatus) => filtered.filter(l => l.status === status);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const handleStatusChange = (id: string, status: LeadStatus) => {
    updateStatus.mutate({ id, status });
    if (selectedLead?.id === id) setSelectedLead(prev => prev ? { ...prev, status } : null);
  };

  const hasFilters = search || productFilter !== "all" || valueFilter !== "all" || sourceFilter !== "all" || showFollowUpOnly;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {leads.length} leads no total{hasFilters ? ` · ${filtered.length} filtrados` : ""}
          </p>
        </div>
        <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Novo Lead</Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-border" />
        </div>
        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue placeholder="Produto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos produtos</SelectItem>
            {products.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={valueFilter} onValueChange={setValueFilter}>
          <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue placeholder="Valor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Qualquer valor</SelectItem>
            <SelectItem value="sem_venda">Sem venda</SelectItem>
            <SelectItem value="ate500">Até R$ 500</SelectItem>
            <SelectItem value="500a2000">R$ 500 – R$ 2.000</SelectItem>
            <SelectItem value="acima2000">Acima de R$ 2.000</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas origens</SelectItem>
            {SOURCE_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.icon} {s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant={showFollowUpOnly ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={() => setShowFollowUpOnly(!showFollowUpOnly)}
        >
          <Clock className="h-3 w-3" />
          Follow-up hoje
          {followUpTodayCount > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-0.5">{followUpTodayCount}</Badge>
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 overflow-x-auto">
          {columns.map((col) => {
            const colLeads = getLeadsByStatus(col.status);
            const totalValor = colLeads.reduce((acc, l) => acc + Number(l.last_sale_amount ?? 0), 0);
            return (
              <div key={col.status} className="min-w-[280px]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                    <span className="text-xs font-semibold text-foreground">{col.label}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${col.color}`}>{colLeads.length}</span>
                  </div>
                  {totalValor > 0 && (
                    <span className="text-[10px] font-medium text-muted-foreground">{fmtBRL(totalValor)}</span>
                  )}
                </div>
                <div className="space-y-2">
                  {colLeads.map((lead) => {
                    const sourceInfo = SOURCE_OPTIONS.find(s => s.value === lead.source);
                    return (
                      <div
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className="glass-card p-4 hover:border-primary/30 transition-colors cursor-pointer group"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{lead.full_name || "Sem nome"}</p>
                            <p className="text-xs text-muted-foreground truncate">{lead.email}</p>
                          </div>
                        </div>
                        {lead.last_product && (
                          <p className="text-xs text-muted-foreground mb-1">
                            {lead.last_product}{" "}
                            {lead.last_sale_amount != null && (
                              <span className="text-foreground font-medium">R$ {Number(lead.last_sale_amount).toFixed(2)}</span>
                            )}
                          </p>
                        )}
                        {/* Source badge */}
                        {sourceInfo && (
                          <span className="text-[10px] text-muted-foreground">
                            {sourceInfo.icon} {sourceInfo.label}
                          </span>
                        )}
                        {/* Follow-up indicator */}
                        {lead.follow_up_at && (
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-primary">
                            <Clock className="h-3 w-3" />
                            {format(parseISO(lead.follow_up_at), "d MMM", { locale: ptBR })}
                          </div>
                        )}
                        <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {lead.phone_e164 && (
                            <a href={`https://wa.me/${lead.phone_e164.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-emerald-500" title="WhatsApp" onClick={e => e.stopPropagation()}>
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); copyToClipboard(lead.email, "Email"); }} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" title="Copiar email">
                            <Mail className="h-3.5 w-3.5" />
                          </button>
                          {lead.phone_formatted && (
                            <button onClick={(e) => { e.stopPropagation(); copyToClipboard(lead.phone_formatted!, "Telefone"); }} className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" title="Copiar telefone">
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {lead.last_billet_url && (
                            <a href={lead.last_billet_url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" title="Boleto/PIX" onClick={e => e.stopPropagation()}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                        <div className="flex gap-1 mt-2 pt-2 border-t border-border/50">
                          {columns.filter(c => c.status !== lead.status).map(c => (
                            <button
                              key={c.status}
                              onClick={(e) => { e.stopPropagation(); handleStatusChange(lead.id, c.status); }}
                              className={`text-[9px] px-1.5 py-0.5 rounded ${c.color} opacity-0 group-hover:opacity-100 transition-opacity`}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {colLeads.length === 0 && (
                    <div className="text-center py-8 text-xs text-muted-foreground">Nenhum lead</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <LeadDetailModal
        lead={selectedLead}
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
