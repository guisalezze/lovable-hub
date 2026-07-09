import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Send, Plus, Trash2, Edit2, X, Mail, Clock, BarChart2, Settings, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Sender {
  id: string;
  from_email: string;
  display_name: string;
  reply_to: string | null;
  is_active: boolean;
  created_at: string;
}

interface Campaign {
  id: string;
  sender_id: string;
  subject: string;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number;
  sent_count: number;
  created_at: string;
  email_senders: { from_email: string; display_name: string } | null;
}

interface DynamicList { id: string; name: string; slug: string }

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Rascunho",  cls: "bg-muted text-muted-foreground" },
  sending:   { label: "Enviando",  cls: "bg-blue-500/20 text-blue-600" },
  scheduled: { label: "Agendada",  cls: "bg-yellow-500/20 text-yellow-600" },
  sent:      { label: "Enviada",   cls: "bg-emerald-500/20 text-emerald-600" },
  failed:    { label: "Falhou",    cls: "bg-destructive/20 text-destructive" },
  cancelled: { label: "Cancelada", cls: "bg-muted text-muted-foreground" },
};

// ─── Remetentes ───────────────────────────────────────────────────────────────
function SenderDialog({ open, onClose, sender }: { open: boolean; onClose: () => void; sender?: Sender }) {
  const qc = useQueryClient();
  const [fromEmail, setFromEmail] = useState(sender?.from_email ?? "");
  const [displayName, setDisplayName] = useState(sender?.display_name ?? "");
  const [replyTo, setReplyTo] = useState(sender?.reply_to ?? "");
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  const save = useMutation({
    mutationFn: () => {
      if (!fromEmail || !displayName) throw new Error("Email e nome obrigatórios");
      const payload: Record<string, unknown> = { from_email: fromEmail, display_name: displayName, reply_to: replyTo || null };
      if (apiKey) payload.brevo_api_key = apiKey;
      if (webhookSecret) payload.webhook_secret = webhookSecret;
      return sender
        ? apiPatch(`/email/senders/${sender.id}`, payload)
        : apiPost("/email/senders", { ...payload, brevo_api_key: apiKey });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-senders"] }); toast.success(sender ? "Remetente atualizado" : "Remetente criado"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{sender ? "Editar remetente" : "Novo remetente"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Nome do remetente</Label><Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Minha Empresa" className="mt-1" /></div>
          <div><Label>Email remetente</Label><Input value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="noreply@minhaempresa.com" className="mt-1" /></div>
          <div><Label>Reply-to (opcional)</Label><Input value={replyTo} onChange={e => setReplyTo(e.target.value)} placeholder="contato@minhaempresa.com" className="mt-1" /></div>
          <div>
            <Label>Brevo API Key</Label>
            <Input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" placeholder={sender ? "Deixe em branco para manter" : "xkeysib-..."} className="mt-1" />
          </div>
          <div>
            <Label>Webhook Secret (Brevo, opcional)</Label>
            <Input value={webhookSecret} onChange={e => setWebhookSecret(e.target.value)} type="password" placeholder={sender ? "Deixe em branco para manter" : "secret..."} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SendersTab() {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Sender | undefined>();

  const { data: senders = [], isLoading } = useQuery<Sender[]>({
    queryKey: ["email-senders"],
    queryFn: () => apiGet("/email/senders"),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/email/senders/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-senders"] }); toast.success("Remetente removido"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(undefined); setShowDialog(true); }} className="gap-2"><Plus className="h-4 w-4" /> Novo Remetente</Button>
      </div>
      {isLoading ? <div className="glass-card p-8 text-center text-sm text-muted-foreground">Carregando...</div> :
        senders.length === 0 ? <div className="glass-card p-8 text-center text-sm text-muted-foreground">Nenhum remetente cadastrado</div> :
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border"><th className="text-left px-4 py-3 text-muted-foreground font-medium">Remetente</th><th className="text-left px-4 py-3 text-muted-foreground font-medium">Email</th><th className="text-left px-4 py-3 text-muted-foreground font-medium">Status</th><th className="px-4 py-3" /></tr></thead>
            <tbody>
              {senders.map(s => (
                <tr key={s.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{s.display_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.from_email}</td>
                  <td className="px-4 py-3"><Badge variant={s.is_active ? "default" : "secondary"}>{s.is_active ? "Ativo" : "Inativo"}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditing(s); setShowDialog(true); }}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => { if (confirm("Remover remetente?")) del.mutate(s.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
      {showDialog && <SenderDialog open onClose={() => setShowDialog(false)} sender={editing} />}
    </div>
  );
}

// ─── Disparar ─────────────────────────────────────────────────────────────────
function SendTab({ senders, lists }: { senders: Sender[]; lists: DynamicList[] }) {
  const qc = useQueryClient();
  const [senderId, setSenderId] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [audienceType, setAudienceType] = useState<"paste" | "captacao">("paste");
  const [pasteEmails, setPasteEmails] = useState("");
  const [listId, setListId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseEmails = (text: string) =>
    text.split(/[\n,;]/).map(e => e.trim()).filter(e => e.includes("@")).map(email => ({ email }));

  const send = useMutation({
    mutationFn: () => {
      if (!senderId || !subject || !html) throw new Error("Remetente, assunto e corpo são obrigatórios");
      const recipients = audienceType === "paste" ? parseEmails(pasteEmails) : [];
      if (audienceType === "paste" && recipients.length === 0) throw new Error("Cole pelo menos 1 email");
      if (audienceType === "captacao" && !listId) throw new Error("Selecione uma lista");
      const meta = audienceType === "paste" ? { type: "paste" } : { type: "captacao", list_id: listId };
      return apiPost("/email/send", { sender_id: senderId, subject, html, recipients, audience_meta: meta, scheduled_at: scheduledAt || undefined });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-campaigns"] }); toast.success(scheduledAt ? "Campanha agendada!" : "Disparo iniciado!"); setSubject(""); setHtml(""); setPasteEmails(""); setScheduledAt(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendTest = useMutation({
    mutationFn: () => {
      if (!senderId || !subject || !html || !testEmail) throw new Error("Preencha remetente, assunto, corpo e email de teste");
      return apiPost("/email/test", { sender_id: senderId, subject, html, to: testEmail });
    },
    onSuccess: () => toast.success(`Email de teste enviado para ${testEmail}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file?.name.endsWith(".html")) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const content = ev.target?.result as string;
      setHtml(content);
      if (!subject) {
        const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) setSubject(titleMatch[1]);
      }
      toast.success("HTML carregado");
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <Label>Remetente</Label>
        <Select value={senderId} onValueChange={setSenderId}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar remetente..." /></SelectTrigger>
          <SelectContent>
            {senders.filter(s => s.is_active).map(s => (
              <SelectItem key={s.id} value={s.id}>{s.display_name} &lt;{s.from_email}&gt;</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div><Label>Assunto</Label><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Assunto do email" className="mt-1" /></div>

      <div>
        <Label>Corpo HTML</Label>
        <p className="text-xs text-muted-foreground mb-1">Arraste um arquivo .html aqui ou cole o código</p>
        <div
          className="border-2 border-dashed border-border rounded-lg"
          onDragOver={e => e.preventDefault()}
          onDrop={handleFileDrop}
        >
          <Textarea
            value={html}
            onChange={e => setHtml(e.target.value)}
            placeholder="<html>...</html> ou arraste um arquivo .html"
            rows={8}
            className="border-0 rounded-lg font-mono text-xs"
          />
        </div>
        {html && <p className="text-xs text-muted-foreground mt-1">{html.length.toLocaleString()} caracteres</p>}
      </div>

      <div>
        <Label>Destinatários</Label>
        <div className="flex gap-2 mt-1 mb-2">
          <Button size="sm" variant={audienceType === "paste" ? "default" : "outline"} onClick={() => setAudienceType("paste")}>Colar emails</Button>
          <Button size="sm" variant={audienceType === "captacao" ? "default" : "outline"} onClick={() => setAudienceType("captacao")}>Lista dinâmica</Button>
        </div>
        {audienceType === "paste" ? (
          <div>
            <Textarea value={pasteEmails} onChange={e => setPasteEmails(e.target.value)} placeholder={"email1@exemplo.com\nemail2@exemplo.com, email3@exemplo.com"} rows={5} className="font-mono text-xs" />
            {pasteEmails && <p className="text-xs text-muted-foreground mt-1">{parseEmails(pasteEmails).length} emails</p>}
          </div>
        ) : (
          <Select value={listId} onValueChange={setListId}>
            <SelectTrigger><SelectValue placeholder="Selecionar lista..." /></SelectTrigger>
            <SelectContent>
              {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div>
        <Label>Agendar para (opcional)</Label>
        <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="mt-1" />
      </div>

      <div className="flex gap-3 items-end pt-2">
        <div className="flex-1">
          <Label>Email de teste</Label>
          <Input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="seu@email.com" className="mt-1" />
        </div>
        <Button variant="outline" onClick={() => sendTest.mutate()} disabled={sendTest.isPending} className="gap-1">
          <Send className="h-3.5 w-3.5" /> {sendTest.isPending ? "Enviando..." : "Testar"}
        </Button>
        <Button onClick={() => send.mutate()} disabled={send.isPending} className="gap-1">
          <Send className="h-4 w-4" /> {send.isPending ? "Disparando..." : scheduledAt ? "Agendar" : "Disparar agora"}
        </Button>
      </div>
    </div>
  );
}

// ─── Agendadas ────────────────────────────────────────────────────────────────
function ScheduledTab() {
  const qc = useQueryClient();

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["email-campaigns"],
    queryFn: () => apiGet("/email/campaigns"),
    refetchInterval: 10000,
  });

  const scheduled = campaigns.filter(c => ["scheduled", "sending", "draft"].includes(c.status));

  const cancel = useMutation({
    mutationFn: (id: string) => apiPost(`/email/campaigns/${id}/cancel`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-campaigns"] }); toast.success("Campanha cancelada"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {isLoading ? <div className="glass-card p-8 text-center text-sm text-muted-foreground">Carregando...</div> :
        scheduled.length === 0 ? <div className="glass-card p-8 text-center text-sm text-muted-foreground">Nenhuma campanha agendada</div> :
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border"><th className="text-left px-4 py-3 text-muted-foreground font-medium">Assunto</th><th className="text-left px-4 py-3 text-muted-foreground font-medium">Remetente</th><th className="text-left px-4 py-3 text-muted-foreground font-medium">Agendado</th><th className="text-left px-4 py-3 text-muted-foreground font-medium">Status</th><th className="px-4 py-3" /></tr></thead>
            <tbody>
              {scheduled.map(c => {
                const cfg = STATUS_CFG[c.status] || STATUS_CFG.draft;
                return (
                  <tr key={c.id} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">{c.subject}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{c.email_senders?.from_email}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{c.scheduled_at ? format(new Date(c.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>{cfg.label}</span></td>
                    <td className="px-4 py-3 text-right">
                      {["scheduled", "draft"].includes(c.status) && (
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" onClick={() => cancel.mutate(c.id)}>
                          <X className="h-3 w-3" /> Cancelar
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      }
    </div>
  );
}

// ─── Estatísticas ─────────────────────────────────────────────────────────────
function StatsTab() {
  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["email-campaigns"],
    queryFn: () => apiGet("/email/campaigns"),
  });

  const sent = campaigns.filter(c => c.status === "sent");

  return (
    <div className="space-y-4">
      {isLoading ? <div className="glass-card p-8 text-center text-sm text-muted-foreground">Carregando...</div> :
        sent.length === 0 ? <div className="glass-card p-8 text-center text-sm text-muted-foreground">Nenhuma campanha enviada ainda</div> :
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border"><th className="text-left px-4 py-3 text-muted-foreground font-medium">Campanha</th><th className="text-left px-4 py-3 text-muted-foreground font-medium">Enviados</th><th className="text-left px-4 py-3 text-muted-foreground font-medium">Enviado em</th><th className="text-left px-4 py-3 text-muted-foreground font-medium">Status</th></tr></thead>
            <tbody>
              {sent.map(c => (
                <tr key={c.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">{c.subject}</td>
                  <td className="px-4 py-3 text-foreground font-mono text-xs">{(c.sent_count || 0).toLocaleString()}/{(c.recipient_count || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{c.sent_at ? format(new Date(c.sent_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CFG[c.status]?.cls}`}>{STATUS_CFG[c.status]?.label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function EmailMarketingPage() {
  const { data: senders = [] } = useQuery<Sender[]>({ queryKey: ["email-senders"], queryFn: () => apiGet("/email/senders") });
  const { data: lists = [] } = useQuery<DynamicList[]>({ queryKey: ["dynamic-lists"], queryFn: () => apiGet("/dynamic-lists") });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Email Marketing</h1>
        <p className="text-sm text-muted-foreground mt-1">Multi-remetente via Brevo</p>
      </div>

      <Tabs defaultValue="send">
        <TabsList>
          <TabsTrigger value="send" className="gap-1.5"><Send className="h-3.5 w-3.5" /> Disparar</TabsTrigger>
          <TabsTrigger value="scheduled" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Agendadas</TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5"><BarChart2 className="h-3.5 w-3.5" /> Histórico</TabsTrigger>
          <TabsTrigger value="senders" className="gap-1.5"><Settings className="h-3.5 w-3.5" /> Remetentes</TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="mt-6"><SendTab senders={senders} lists={lists} /></TabsContent>
        <TabsContent value="scheduled" className="mt-6"><ScheduledTab /></TabsContent>
        <TabsContent value="stats" className="mt-6"><StatsTab /></TabsContent>
        <TabsContent value="senders" className="mt-6"><SendersTab /></TabsContent>
      </Tabs>
    </div>
  );
}
