import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, apiDelete, apiPatch } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  MessageSquare, Send, FileText, Zap, Settings, Plus, Trash2, RefreshCw,
  CheckCircle2, XCircle, Loader2, ChevronRight, User, Lock, Unlock, X
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Account {
  id: string;
  name: string;
  phone_number: string | null;
  phone_number_id: string;
  waba_id: string;
  is_active: boolean;
  created_at: string;
}

interface Conversation {
  id: string;
  account_id: string;
  status: string;
  assigned_to: string | null;
  last_message_at: string;
  window_expires_at: string | null;
  wa_contacts: { phone: string; name: string | null; tags: string[] } | null;
  whatsapp_api_accounts: { name: string } | null;
}

interface WaMessage {
  id: string;
  direction: string;
  type: string;
  content: string | null;
  status: string | null;
  created_at: string;
}

interface Template {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string | null;
  body_preview: string | null;
}

// ─── Inbox ────────────────────────────────────────────────────────────────────
function InboxTab({ accounts }: { accounts: Account[] }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [filter, setFilter] = useState<"open" | "closed">("open");
  const [text, setText] = useState("");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: convs = [] } = useQuery<Conversation[]>({
    queryKey: ["wa-conversations", filter, accountFilter],
    queryFn: () => {
      let path = `/api-oficial/conversations?status=${filter}`;
      if (accountFilter !== "all") path += `&account_id=${accountFilter}`;
      return apiGet(path);
    },
    refetchInterval: 5000,
  });

  const { data: messages = [] } = useQuery<WaMessage[]>({
    queryKey: ["wa-messages", selected?.id],
    queryFn: () => apiGet(`/api-oficial/conversations/${selected!.id}/messages`),
    enabled: !!selected,
    refetchInterval: 3000,
  });

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("wa-inbox-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["wa-messages"] });
        qc.invalidateQueries({ queryKey: ["wa-conversations"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["wa-conversations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMsg = useMutation({
    mutationFn: () => {
      if (!text.trim()) throw new Error("Mensagem vazia");
      return apiPost(`/api-oficial/conversations/${selected!.id}/send`, { text });
    },
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: ["wa-messages", selected?.id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeConv = useMutation({
    mutationFn: () => apiPost(`/api-oficial/conversations/${selected!.id}/status`, { status: "closed" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-conversations"] }); setSelected(null); toast.success("Conversa encerrada"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const windowOpen = selected?.window_expires_at && new Date(selected.window_expires_at) > new Date();

  return (
    <div className="flex gap-4 h-[calc(100vh-200px)] min-h-[500px]">
      {/* Lista de conversas */}
      <div className="w-72 shrink-0 flex flex-col gap-2">
        <div className="flex gap-2">
          <Button size="sm" variant={filter === "open" ? "default" : "outline"} onClick={() => setFilter("open")} className="flex-1">Abertas</Button>
          <Button size="sm" variant={filter === "closed" ? "default" : "outline"} onClick={() => setFilter("closed")} className="flex-1">Fechadas</Button>
        </div>
        {accounts.length > 1 && (
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as contas</SelectItem>
              {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="flex-1 overflow-y-auto space-y-1">
          {convs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Nenhuma conversa</p>
          ) : convs.map(c => {
            const isSelected = selected?.id === c.id;
            return (
              <button
                key={c.id}
                onClick={() => { setSelected(c); apiPost(`/api-oficial/conversations/${c.id}/read`).catch(() => {}); }}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
              >
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.wa_contacts?.name || c.wa_contacts?.phone || "Contato"}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(c.last_message_at), "dd/MM HH:mm")}</p>
                  </div>
                  {c.assigned_to && <div className="h-2 w-2 rounded-full bg-primary shrink-0" title="Atribuída" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Área de mensagens */}
      {selected ? (
        <div className="flex-1 flex flex-col glass-card overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
            <div>
              <p className="font-medium text-foreground">{selected.wa_contacts?.name || selected.wa_contacts?.phone}</p>
              <p className="text-xs text-muted-foreground">{selected.wa_contacts?.phone}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {windowOpen ? (
                <Badge variant="outline" className="text-emerald-600 border-emerald-500/50 gap-1 text-xs"><Unlock className="h-3 w-3" /> Janela aberta</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground gap-1 text-xs"><Lock className="h-3 w-3" /> Janela fechada</Badge>
              )}
              <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => closeConv.mutate()}>
                <X className="h-3 w-3" /> Encerrar
              </Button>
            </div>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm ${m.direction === "out" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted text-foreground rounded-tl-sm"}`}>
                  <p className="whitespace-pre-wrap break-words">{m.content || `[${m.type}]`}</p>
                  <p className={`text-[10px] mt-1 ${m.direction === "out" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {format(new Date(m.created_at), "HH:mm")}
                    {m.direction === "out" && m.status && ` · ${m.status}`}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-3 shrink-0">
            {!windowOpen && (
              <p className="text-xs text-destructive mb-2">⚠️ Janela de 24h expirada — só é possível enviar templates</p>
            )}
            <div className="flex gap-2">
              <Textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={windowOpen ? "Digite uma mensagem..." : "Janela fechada — use a aba Disparo para enviar template"}
                disabled={!windowOpen}
                rows={2}
                className="resize-none text-sm"
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg.mutate(); } }}
              />
              <Button onClick={() => sendMsg.mutate()} disabled={sendMsg.isPending || !windowOpen || !text.trim()} className="shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 glass-card flex items-center justify-center">
          <div className="text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Selecione uma conversa</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Templates ────────────────────────────────────────────────────────────────
function TemplatesTab({ accounts }: { accounts: Account[] }) {
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["wa-templates", accountId],
    queryFn: () => apiGet(`/api-oficial/accounts/${accountId}/templates`),
    enabled: !!accountId,
  });

  const sync = useMutation({
    mutationFn: () => apiPost(`/api-oficial/accounts/${accountId}/sync-templates`),
    onSuccess: (data: any) => { qc.invalidateQueries({ queryKey: ["wa-templates", accountId] }); toast.success(`${data.synced} templates sincronizados`); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Conta..." /></SelectTrigger>
          <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending || !accountId} className="gap-1">
          <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? "animate-spin" : ""}`} /> Sincronizar
        </Button>
      </div>

      {isLoading ? <div className="glass-card p-8 text-center text-sm text-muted-foreground">Carregando...</div> :
        templates.length === 0 ? <div className="glass-card p-8 text-center text-sm text-muted-foreground">Nenhum template. Clique em Sincronizar.</div> :
        <div className="grid gap-2">
          {templates.map(t => (
            <div key={t.id} className="glass-card p-4 flex items-start gap-3">
              <div className={`h-2.5 w-2.5 rounded-full mt-1.5 shrink-0 ${t.status === "APPROVED" ? "bg-emerald-500" : "bg-yellow-500"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground text-sm font-mono">{t.name}</p>
                  <Badge variant="outline" className="text-xs">{t.language}</Badge>
                  {t.category && <Badge variant="secondary" className="text-xs">{t.category}</Badge>}
                </div>
                {t.body_preview && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.body_preview}</p>}
              </div>
              <span className={`text-xs font-medium ${t.status === "APPROVED" ? "text-emerald-600" : "text-yellow-600"}`}>{t.status}</span>
            </div>
          ))}
        </div>
      }
    </div>
  );
}

// ─── Disparo (Broadcast) ──────────────────────────────────────────────────────
function BroadcastTab({ accounts }: { accounts: Account[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [templateName, setTemplateName] = useState("");
  const [phones, setPhones] = useState("");
  const [listTag, setListTag] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["wa-templates", accountId],
    queryFn: () => apiGet(`/api-oficial/accounts/${accountId}/templates`),
    enabled: !!accountId,
  });

  const { data: job, isLoading: loadingJob } = useQuery({
    queryKey: ["wa-broadcast-job", jobId],
    queryFn: () => apiGet<{ total: number; sent: number; status: string; errors: unknown[] }>(`/api-oficial/broadcast/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data as any;
      return data?.status === "done" ? false : 2000;
    },
  });

  const broadcast = useMutation({
    mutationFn: () => {
      if (!accountId || !templateName || !phones.trim()) throw new Error("Conta, template e telefones são obrigatórios");
      const phoneList = phones.split(/[\n,;]/).map(p => p.trim()).filter(Boolean);
      return apiPost<{ job_id: string; total: number }>("/api-oficial/broadcast", {
        account_id: accountId,
        template_name: templateName,
        phones: phoneList,
        list_tag: listTag || undefined,
      });
    },
    onSuccess: (data) => { setJobId(data.job_id); toast.success(`Disparo iniciado: ${data.total} contatos`); },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: errReport = [] } = useQuery<any[]>({
    queryKey: ["wa-sends-report"],
    queryFn: () => apiGet("/api-oficial/sends-report"),
  });

  const progress = job ? Math.round((job.sent / job.total) * 100) : 0;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex gap-3">
        <div className="flex-1">
          <Label>Conta WhatsApp</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar conta..." /></SelectTrigger>
            <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <Label>Template</Label>
          <Select value={templateName} onValueChange={setTemplateName}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar template..." /></SelectTrigger>
            <SelectContent>
              {templates.filter(t => t.status === "APPROVED").map(t => (
                <SelectItem key={t.id} value={t.name}>{t.name} ({t.language})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Tag da lista (opcional)</Label>
        <Input value={listTag} onChange={e => setListTag(e.target.value)} placeholder="Ex: lancamento-jan-2025" className="mt-1" />
        <p className="text-xs text-muted-foreground mt-1">Adiciona esta tag nos contatos após o disparo</p>
      </div>

      <div>
        <Label>Telefones</Label>
        <Textarea value={phones} onChange={e => setPhones(e.target.value)} placeholder={"5511999999999\n5521888888888\n5531777777777"} rows={6} className="font-mono text-xs mt-1" />
        <p className="text-xs text-muted-foreground mt-1">
          {phones.split(/[\n,;]/).filter(p => p.trim().length > 0).length} telefones · Formato: DDI + DDD + número (ex: 5511999999999)
        </p>
      </div>

      <Button onClick={() => broadcast.mutate()} disabled={broadcast.isPending} className="gap-2">
        <Send className="h-4 w-4" /> {broadcast.isPending ? "Iniciando..." : "Disparar"}
      </Button>

      {jobId && job && (
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Progresso do disparo</span>
            {job.status === "done" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{job.sent} de {job.total} enviados</span>
            {(job.errors as any[]).length > 0 && <span className="text-destructive">{(job.errors as any[]).length} erro(s)</span>}
          </div>
          {job.status === "done" && <p className="text-xs text-emerald-600 font-medium">✅ Disparo concluído</p>}
        </div>
      )}

      {errReport.length > 0 && (
        <div className="glass-card p-4 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Últimos erros</h3>
          {errReport.slice(0, 5).map((r, i) => (
            <div key={i} className="text-xs p-2 bg-destructive/5 rounded border border-destructive/20">
              <p className="font-mono text-muted-foreground">{r.phone}</p>
              <p className="text-destructive">{r.explanation}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Configurar Contas ────────────────────────────────────────────────────────
function AccountDialog({ open, onClose, account }: { open: boolean; onClose: () => void; account?: Account }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: account?.name ?? "",
    phone_number: account?.phone_number ?? "",
    phone_number_id: account?.phone_number_id ?? "",
    waba_id: account?.waba_id ?? "",
    access_token: "",
    app_secret: "",
    verify_token: "",
  });

  const upd = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => {
      if (!form.name || !form.phone_number_id || !form.waba_id) throw new Error("Campos obrigatórios: nome, Phone Number ID, WABA ID");
      return account
        ? apiPut(`/api-oficial/accounts/${account.id}`, form)
        : apiPost("/api-oficial/accounts", form);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-accounts"] }); toast.success(account ? "Conta atualizada" : "Conta criada"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{account ? "Editar conta" : "Nova conta WhatsApp Oficial"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Nome</Label><Input value={form.name} onChange={upd("name")} placeholder="Minha Empresa" className="mt-1" /></div>
          <div><Label>Telefone</Label><Input value={form.phone_number} onChange={upd("phone_number")} placeholder="+5511..." className="mt-1" /></div>
          <div><Label>Phone Number ID</Label><Input value={form.phone_number_id} onChange={upd("phone_number_id")} placeholder="123456..." className="mt-1" /></div>
          <div><Label>WABA ID</Label><Input value={form.waba_id} onChange={upd("waba_id")} placeholder="123456..." className="mt-1" /></div>
          <div><Label>Verify Token</Label><Input value={form.verify_token} onChange={upd("verify_token")} placeholder="seu-token-secreto" className="mt-1" /></div>
          <div className="col-span-2"><Label>Access Token</Label><Input value={form.access_token} onChange={upd("access_token")} type="password" placeholder={account ? "Deixe em branco para manter" : "EAABs..."} className="mt-1" /></div>
          <div className="col-span-2"><Label>App Secret</Label><Input value={form.app_secret} onChange={upd("app_secret")} type="password" placeholder={account ? "Deixe em branco para manter" : "app secret"} className="mt-1" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfigTab({ accounts }: { accounts: Account[] }) {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Account | undefined>();

  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/api-oficial/accounts/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["wa-accounts"] }); toast.success("Conta removida"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(undefined); setShowDialog(true); }} className="gap-2"><Plus className="h-4 w-4" /> Nova Conta</Button>
      </div>
      {accounts.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-muted-foreground">Nenhuma conta configurada</div>
      ) : (
        <div className="grid gap-3">
          {accounts.map(a => (
            <div key={a.id} className="glass-card p-4 flex items-center gap-4">
              <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${a.is_active ? "bg-emerald-500" : "bg-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{a.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{a.phone_number || a.phone_number_id}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setEditing(a); setShowDialog(true); }}>Editar</Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { if (confirm("Remover conta?")) del.mutate(a.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showDialog && <AccountDialog open onClose={() => setShowDialog(false)} account={editing} />}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WhatsAppOficialPage() {
  const [activeTab, setActiveTab] = useState("inbox");

  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ["wa-accounts"],
    queryFn: () => apiGet("/api-oficial/accounts"),
  });

  if (isLoading) return <div className="glass-card p-12 text-center text-sm text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">WhatsApp Oficial</h1>
        <p className="text-sm text-muted-foreground mt-1">Meta Cloud API — inbox multiagente, templates e broadcasts</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="inbox" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Atendimento</TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Templates</TabsTrigger>
          <TabsTrigger value="broadcast" className="gap-1.5"><Send className="h-3.5 w-3.5" /> Disparo</TabsTrigger>
          <TabsTrigger value="config" className="gap-1.5"><Settings className="h-3.5 w-3.5" /> Contas</TabsTrigger>
        </TabsList>

        {accounts.length === 0 && activeTab !== "config" ? (
          <div className="glass-card p-12 text-center space-y-4 mt-4">
            <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Nenhuma conta configurada ainda</p>
            <p className="text-xs text-muted-foreground">Adicione sua conta Meta Cloud API na aba Contas</p>
            <Button onClick={() => setActiveTab("config")} variant="outline">Ir para Contas</Button>
          </div>
        ) : (
          <>
            <TabsContent value="inbox" className="mt-4"><InboxTab accounts={accounts} /></TabsContent>
            <TabsContent value="templates" className="mt-6"><TemplatesTab accounts={accounts} /></TabsContent>
            <TabsContent value="broadcast" className="mt-6"><BroadcastTab accounts={accounts} /></TabsContent>
          </>
        )}
        <TabsContent value="config" className="mt-6"><ConfigTab accounts={accounts} /></TabsContent>
      </Tabs>
    </div>
  );
}
