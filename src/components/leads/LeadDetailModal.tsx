import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Phone, Mail, Copy, ExternalLink, Clock, X, DollarSign, FileText, ArrowRight, Plus, Send, Trash2, Video } from "lucide-react";
import { CreateCallFromLeadDialog } from "./CreateCallFromLeadDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format, parseISO, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type LeadStatus = "novo" | "quase_comprou" | "comprou" | "perdido";

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
  source?: string | null;
  follow_up_at?: string | null;
  follow_up_note?: string | null;
}

interface LeadDetailModalProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
}

const statusOptions: { value: LeadStatus; label: string; dot: string }[] = [
  { value: "novo", label: "Novo", dot: "bg-primary" },
  { value: "quase_comprou", label: "Quase Comprou", dot: "bg-yellow-500" },
  { value: "comprou", label: "Comprou", dot: "bg-emerald-500" },
  { value: "perdido", label: "Perdido", dot: "bg-destructive" },
];

const SOURCE_OPTIONS = [
  { value: "meta_ads", label: "Meta Ads", icon: "📱" },
  { value: "organic", label: "Orgânico", icon: "🌱" },
  { value: "referral", label: "Indicação", icon: "🤝" },
  { value: "whatsapp", label: "WhatsApp Direto", icon: "💬" },
  { value: "other", label: "Outro", icon: "📌" },
];

const saleStatusLabel: Record<string, { label: string; color: string }> = {
  approved: { label: "Aprovado", color: "bg-emerald-500/20 text-emerald-600" },
  pending: { label: "Pendente", color: "bg-yellow-500/20 text-yellow-600" },
  refunded: { label: "Reembolso", color: "bg-muted text-muted-foreground" },
  chargeback: { label: "Chargeback", color: "bg-destructive/20 text-destructive" },
  canceled: { label: "Cancelado", color: "bg-destructive/20 text-destructive" },
  complete: { label: "Completo", color: "bg-emerald-500/20 text-emerald-600" },
};

const copy = (text: string, label: string) => {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copiado!`);
};

// --- Hooks ---

function useLeadNotes(leadId: string) {
  return useQuery({
    queryKey: ["lead-notes", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_notes")
        .select("*, profiles:created_by(full_name, email)")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
    enabled: !!leadId,
  });
}

function useAddLeadNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, content }: { leadId: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("lead_notes").insert({
        lead_id: leadId,
        content,
        created_by: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["lead-notes", vars.leadId] });
      qc.invalidateQueries({ queryKey: ["lead-timeline", vars.leadId] });
      toast.success("Nota adicionada");
    },
    onError: () => toast.error("Erro ao adicionar nota"),
  });
}

function useUpdateLeadField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: any }) => {
      const { error } = await supabase.from("leads").update({ [field]: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

function useLeadTimeline(leadEmail: string) {
  return useQuery({
    queryKey: ["lead-timeline", leadEmail],
    queryFn: async () => {
      const events: { id: string; type: string; title: string; subtitle?: string; date: string; color: string }[] = [];

      // Sales
      try {
        const { data: sales } = await supabase
          .from("sales")
          .select("id, sale_amount, sale_status_enum, created_at, product_name")
          .eq("lead_email", leadEmail)
          .order("created_at", { ascending: false });

        (sales || []).forEach((s: any) => {
          const amt = s.sale_amount ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(s.sale_amount) : "";
          const statusLabel = s.sale_status_enum === "approved" ? "Aprovado" : (s.sale_status_enum || "");
          events.push({
            id: s.id,
            type: "sale",
            title: s.product_name || "Venda",
            subtitle: [amt, statusLabel].filter(Boolean).join(" · "),
            date: s.created_at,
            color: s.sale_status_enum === "approved" ? "bg-emerald-500" : "bg-yellow-500",
          });
        });
      } catch {}

      // Notes
      try {
        const { data: notes } = await supabase
          .from("lead_notes")
          .select("id, content, created_at")
          .eq("lead_id", leadEmail); // This won't work — we need lead_id (uuid), not email
        // Fallback: notes are loaded separately via useLeadNotes
      } catch {}

      return events.sort((a, b) => b.date.localeCompare(a.date));
    },
    staleTime: 30_000,
    enabled: !!leadEmail,
  });
}

function useLeadTimelineById(leadId: string, leadEmail: string) {
  return useQuery({
    queryKey: ["lead-timeline", leadId],
    queryFn: async () => {
      const events: { id: string; type: string; title: string; subtitle?: string; date: string; color: string }[] = [];

      // Sales via lead_email
      try {
        const { data: sales } = await supabase
          .from("sales")
          .select("id, sale_amount, sale_status_enum, created_at, product_name")
          .eq("lead_email", leadEmail)
          .order("created_at", { ascending: false });

        (sales || []).forEach((s: any) => {
          const amt = s.sale_amount ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(s.sale_amount) : "";
          const statusLabel = s.sale_status_enum === "approved" ? "Aprovado" : (s.sale_status_enum || "");
          events.push({
            id: s.id, type: "sale",
            title: s.product_name || "Venda",
            subtitle: [amt, statusLabel].filter(Boolean).join(" · "),
            date: s.created_at,
            color: s.sale_status_enum === "approved" ? "bg-emerald-500" : "bg-yellow-500",
          });
        });
      } catch {}

      // Notes via lead_id
      try {
        const { data: notes } = await supabase
          .from("lead_notes")
          .select("id, content, created_at, profiles:created_by(full_name)")
          .eq("lead_id", leadId)
          .order("created_at", { ascending: false });

        (notes || []).forEach((n: any) => {
          events.push({
            id: n.id, type: "note",
            title: "Nota adicionada",
            subtitle: n.content,
            date: n.created_at,
            color: "bg-primary",
          });
        });
      } catch {}

      return events.sort((a, b) => b.date.localeCompare(a.date));
    },
    staleTime: 30_000,
    enabled: !!leadId,
  });
}

// --- Component ---

export function LeadDetailModal({ lead, open, onClose, onStatusChange }: LeadDetailModalProps) {
  const [noteText, setNoteText] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNoteInput, setFollowUpNoteInput] = useState("");
  const [showCreateCall, setShowCreateCall] = useState(false);

  const { data: notes = [] } = useLeadNotes(lead?.id || "");
  const addNote = useAddLeadNote();
  const updateField = useUpdateLeadField();
  const { data: timeline = [] } = useLeadTimelineById(lead?.id || "", lead?.email || "");
  const qc = useQueryClient();

  const deleteSale = useMutation({
    mutationFn: async (saleId: string) => {
      const { error } = await supabase.from("sales").delete().eq("id", saleId);
      if (error) throw error;
      // Se não restarem vendas aprovadas, reverter status do lead
      if (lead?.email) {
        const { data: remaining } = await supabase
          .from("sales")
          .select("id")
          .eq("lead_email", lead.email)
          .eq("sale_status_enum", "approved");
        if (!remaining || remaining.length === 0) {
          await supabase
            .from("leads")
            .update({ status: "novo" })
            .eq("email", lead.email)
            .eq("status", "comprou");
        }
      }
    },
    onSuccess: () => {
      toast.success("Venda removida com sucesso!");
      qc.invalidateQueries({ queryKey: ["lead-timeline", lead?.id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (err: any) => toast.error("Erro ao remover venda: " + err.message),
  });

  if (!lead) return null;

  const initials = (lead.full_name || lead.email)
    .split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

  const saleInfo = lead.last_sale_status_enum ? saleStatusLabel[lead.last_sale_status_enum] : null;
  const sourceInfo = SOURCE_OPTIONS.find(s => s.value === lead.source);

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addNote.mutate({ leadId: lead.id, content: noteText.trim() });
    setNoteText("");
  };

  const handleScheduleFollowUp = () => {
    if (!followUpDate) return;
    updateField.mutate({ id: lead.id, field: "follow_up_at", value: followUpDate });
    if (followUpNoteInput.trim()) {
      updateField.mutate({ id: lead.id, field: "follow_up_note", value: followUpNoteInput.trim() });
    }
    setFollowUpDate("");
    setFollowUpNoteInput("");
    toast.success("Follow-up agendado!");
  };

  const handleClearFollowUp = () => {
    updateField.mutate({ id: lead.id, field: "follow_up_at", value: null });
    updateField.mutate({ id: lead.id, field: "follow_up_note", value: null });
    toast.success("Follow-up removido");
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold truncate">{lead.full_name || "Sem nome"}</p>
              <p className="text-xs text-muted-foreground font-normal">{lead.email}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details" className="mt-2">
          <TabsList className="w-full h-8">
            <TabsTrigger value="details" className="flex-1 text-xs">Detalhes</TabsTrigger>
            <TabsTrigger value="notes" className="flex-1 text-xs">Notas ({notes.length})</TabsTrigger>
            <TabsTrigger value="timeline" className="flex-1 text-xs">Timeline</TabsTrigger>
          </TabsList>

          {/* === DETALHES === */}
          <TabsContent value="details" className="space-y-4 mt-3">
            {/* Status + Source */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                <Select value={lead.status} onValueChange={(v) => onStatusChange(lead.id, v as LeadStatus)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                          {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Origem</label>
                <Select
                  value={lead.source || ""}
                  onValueChange={(v) => {
                    updateField.mutate({ id: lead.id, field: "source", value: v });
                    toast.success("Origem atualizada");
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="📌 Origem..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.icon} {s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Contact */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Contato</label>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between glass-card px-3 py-2">
                  <span className="text-sm truncate">{lead.email}</span>
                  <button onClick={() => copy(lead.email, "Email")} className="text-muted-foreground hover:text-foreground">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                {lead.phone_formatted && (
                  <div className="flex items-center justify-between glass-card px-3 py-2">
                    <span className="text-sm">{lead.phone_formatted}</span>
                    <div className="flex gap-1">
                      <button onClick={() => copy(lead.phone_formatted!, "Telefone")} className="text-muted-foreground hover:text-foreground">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {lead.phone_e164 && (
                        <a href={`https://wa.me/${lead.phone_e164.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-emerald-500">
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {/* Agendar Call */}
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full gap-1.5 text-xs h-8"
                onClick={() => setShowCreateCall(true)}
              >
                <Video className="h-3.5 w-3.5 text-primary" />
                Agendar Call
              </Button>
            </div>

            {/* Last Sale */}
            {lead.last_product && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Última Venda</label>
                <div className="glass-card px-3 py-2 space-y-1">
                  <p className="text-sm font-medium">{lead.last_product}</p>
                  <div className="flex items-center gap-2">
                    {lead.last_sale_amount != null && (
                      <span className="text-sm font-semibold text-foreground">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(lead.last_sale_amount))}
                      </span>
                    )}
                    {saleInfo && (
                      <Badge variant="secondary" className={`text-[10px] ${saleInfo.color}`}>{saleInfo.label}</Badge>
                    )}
                  </div>
                  {lead.last_billet_url && (
                    <a href={lead.last_billet_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                      <ExternalLink className="h-3 w-3" /> Boleto/PIX
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Follow-up */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block flex items-center gap-1">
                <Clock className="h-3 w-3" /> Follow-up
              </label>
              {lead.follow_up_at ? (
                <div className="glass-card px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {format(parseISO(lead.follow_up_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
                    </p>
                    {lead.follow_up_note && <p className="text-xs text-muted-foreground">{lead.follow_up_note}</p>}
                  </div>
                  <button onClick={handleClearFollowUp} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <Input
                    type="datetime-local"
                    value={followUpDate}
                    onChange={e => setFollowUpDate(e.target.value)}
                    className="h-7 text-xs bg-card flex-1"
                  />
                  <Input
                    placeholder="Nota..."
                    value={followUpNoteInput}
                    onChange={e => setFollowUpNoteInput(e.target.value)}
                    className="h-7 text-xs bg-card flex-1"
                  />
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleScheduleFollowUp} disabled={!followUpDate}>
                    Agendar
                  </Button>
                </div>
              )}
            </div>

            {/* Date + Actions */}
            <p className="text-xs text-muted-foreground">
              Cadastrado em {format(parseISO(lead.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
            <div className="flex gap-2">
              {lead.phone_e164 && (
                <Button size="sm" variant="outline" className="gap-1.5 flex-1" asChild>
                  <a href={`https://wa.me/${lead.phone_e164.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                    <Phone className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                </Button>
              )}
              <Button size="sm" variant="outline" className="gap-1.5 flex-1" onClick={() => copy(lead.email, "Email")}>
                <Mail className="h-3.5 w-3.5" /> Copiar email
              </Button>
            </div>
          </TabsContent>

          {/* === NOTAS === */}
          <TabsContent value="notes" className="space-y-3 mt-3">
            <div className="flex gap-1.5">
              <Input
                placeholder="Adicionar nota..."
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && noteText.trim()) handleAddNote(); }}
                className="h-8 text-xs bg-card flex-1"
              />
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={handleAddNote} disabled={!noteText.trim() || addNote.isPending}>
                <Send className="h-3 w-3" /> Adicionar
              </Button>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {notes.map((note: any) => (
                <div key={note.id} className="glass-card px-3 py-2 flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    {((note.profiles as any)?.full_name || (note.profiles as any)?.email || "?")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{note.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {(note.profiles as any)?.full_name || (note.profiles as any)?.email || "Desconhecido"} · {format(parseISO(note.created_at), "d MMM, HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              ))}
              {notes.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhuma nota ainda</p>}
            </div>
          </TabsContent>

          {/* === TIMELINE === */}
          <TabsContent value="timeline" className="mt-3">
            {timeline.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Nenhum evento registrado</p>
            ) : (
              <div className="relative">
                <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
                <div className="space-y-3">
                  {timeline.map(event => (
                    <div key={event.id} className="flex gap-3 relative">
                      <div className={`w-6 h-6 rounded-full ${event.color} flex items-center justify-center shrink-0 z-10`}>
                        {event.type === "sale" && <DollarSign className="h-3 w-3 text-white" />}
                        {event.type === "note" && <FileText className="h-3 w-3 text-white" />}
                      </div>
                      <div className="min-w-0 flex-1 pb-1">
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{event.title}</p>
                            {event.subtitle && <p className="text-xs text-muted-foreground">{event.subtitle}</p>}
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {format(parseISO(event.date), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                          {event.type === "sale" && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                                  title="Remover venda"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remover venda?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja remover a venda <strong>{event.title}</strong>
                                    {event.subtitle && <> · {event.subtitle}</>}?
                                    Esta ação é irreversível.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteSale.mutate(event.id)}
                                    disabled={deleteSale.isPending}
                                    className="bg-destructive hover:bg-destructive/90"
                                  >
                                    {deleteSale.isPending ? "Removendo..." : "Remover"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

    {/* Dialog de criar call pre-preenchida com dados do lead */}
    <CreateCallFromLeadDialog
      open={showCreateCall}
      onOpenChange={setShowCreateCall}
      leadEmail={lead.email}
      leadName={lead.full_name}
    />
    </>
  );
}
