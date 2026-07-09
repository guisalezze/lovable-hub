import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, apiDelete, API_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, ChevronLeft, Copy, RefreshCw, Zap, Play } from "lucide-react";

interface Webhook {
  id: string;
  name: string;
  token: string;
  session_id: string;
  is_active: boolean;
  messages: Array<{ type: string; content: string; delay_ms: number }>;
  initial_delay_ms: number;
  interval_ms: number;
  created_at: string;
}

interface WebhookLog {
  id: string;
  webhook_id: string;
  phone: string | null;
  status: "pending" | "sent" | "error";
  error_message: string | null;
  triggered_at: string;
  sent_at: string | null;
}

interface Session {
  id: string;
  session_id: string;
  display_name: string | null;
  status: string;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    sent: "bg-emerald-500/20 text-emerald-600",
    error: "bg-destructive/20 text-destructive",
    pending: "bg-yellow-500/20 text-yellow-600",
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || "bg-muted text-muted-foreground"}`}>{status}</span>;
}

function WebhookDialog({
  open,
  onClose,
  webhook,
  sessions,
}: {
  open: boolean;
  onClose: () => void;
  webhook?: Webhook;
  sessions: Session[];
}) {
  const qc = useQueryClient();
  const isEdit = !!webhook;

  const [name, setName] = useState(webhook?.name ?? "");
  const [sessionId, setSessionId] = useState(webhook?.session_id ?? "");
  const [initialDelay, setInitialDelay] = useState(String(webhook?.initial_delay_ms ?? 0));
  const [interval, setInterval] = useState(String(webhook?.interval_ms ?? 1000));
  const [messages, setMessages] = useState<Array<{ type: string; content: string; delay_ms: number }>>(
    webhook?.messages ?? [{ type: "text", content: "", delay_ms: 1000 }]
  );

  const addMsg = () => setMessages(m => [...m, { type: "text", content: "", delay_ms: 1000 }]);
  const removeMsg = (i: number) => setMessages(m => m.filter((_, idx) => idx !== i));
  const updateMsg = (i: number, field: string, value: string | number) =>
    setMessages(m => m.map((msg, idx) => idx === i ? { ...msg, [field]: value } : msg));

  const save = useMutation({
    mutationFn: () => {
      if (!name || !sessionId) throw new Error("Nome e sessão obrigatórios");
      const payload = { name, session_id: sessionId, messages, initial_delay_ms: parseInt(initialDelay) || 0, interval_ms: parseInt(interval) || 1000 };
      return isEdit ? apiPut(`/webhooks/${webhook!.id}`, payload) : apiPost("/webhooks", payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks"] }); toast.success(isEdit ? "Webhook atualizado" : "Webhook criado"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Editar webhook" : "Novo webhook"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Sequência Lançamento" className="mt-1" />
          </div>
          <div>
            <Label>Sessão WhatsApp</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecionar sessão..." />
              </SelectTrigger>
              <SelectContent>
                {sessions.map(s => (
                  <SelectItem key={s.session_id} value={s.session_id}>
                    {s.display_name || s.session_id} ({s.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Delay inicial (ms)</Label>
              <Input type="number" value={initialDelay} onChange={e => setInitialDelay(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Intervalo entre msgs (ms)</Label>
              <Input type="number" value={interval} onChange={e => setInterval(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Sequência de mensagens</Label>
              <Button size="sm" variant="outline" onClick={addMsg} className="gap-1 h-7 text-xs"><Plus className="h-3 w-3" /> Adicionar</Button>
            </div>
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Mensagem {i + 1}</span>
                    {messages.length > 1 && (
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => removeMsg(i)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <Select value={msg.type} onValueChange={v => updateMsg(i, "type", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto</SelectItem>
                      <SelectItem value="image">Imagem (URL)</SelectItem>
                      <SelectItem value="video">Vídeo (URL)</SelectItem>
                      <SelectItem value="audio">Áudio (URL)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={msg.content}
                    onChange={e => updateMsg(i, "content", e.target.value)}
                    placeholder={msg.type === "text" ? "Olá {{name}}, tudo bem?" : "https://exemplo.com/arquivo.mp4"}
                    rows={3}
                    className="text-sm"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Use <code className="bg-muted px-1 rounded">{"{{campo}}"}</code> para substituir por dados do payload</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LogsView({ webhook, onBack }: { webhook: Webhook; onBack: () => void }) {
  const qc = useQueryClient();

  const { data: logs = [], isLoading } = useQuery<WebhookLog[]>({
    queryKey: ["webhook-logs", webhook.id],
    queryFn: () => apiGet(`/webhooks/${webhook.id}/logs`),
    refetchInterval: 5000,
  });

  const resend = useMutation({
    mutationFn: (logId: string) => apiPost(`/webhooks/${webhook.id}/logs/${logId}/resend`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhook-logs", webhook.id] }); toast.success("Reenvio iniciado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={onBack} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Button>
        <h2 className="text-xl font-bold text-foreground">{webhook.name} — Logs</h2>
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium text-foreground">URL do Webhook</span>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-muted px-3 py-2 rounded text-xs font-mono break-all">{API_URL}/webhook/{webhook.token}</code>
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(`${API_URL}/webhook/${webhook.token}`); toast.success("Copiado"); }}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">POST com: <code className="bg-muted px-1 rounded">phone</code> (obrigatório) + campos para substituição nas mensagens</p>
      </div>

      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhum disparo ainda</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Telefone</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Status</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Disparado em</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Erro</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3 font-mono text-foreground text-xs">{log.phone || "—"}</td>
                  <td className="px-4 py-3">{statusBadge(log.status)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(log.triggered_at).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 text-destructive text-xs max-w-[200px] truncate">{log.error_message || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {log.status !== "sent" && (
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => resend.mutate(log.id)} disabled={resend.isPending}>
                        <RefreshCw className="h-3 w-3" /> Reenviar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function WebhooksAutomacoesPage() {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Webhook | undefined>();
  const [viewingLogs, setViewingLogs] = useState<Webhook | null>(null);

  const { data: webhooks = [], isLoading } = useQuery<Webhook[]>({
    queryKey: ["webhooks"],
    queryFn: () => apiGet("/webhooks"),
  });

  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["sessions"],
    queryFn: () => apiGet("/sessions"),
  });

  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => apiPut(`/webhooks/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/webhooks/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks"] }); toast.success("Webhook removido"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (viewingLogs) return <LogsView webhook={viewingLogs} onBack={() => setViewingLogs(null)} />;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Webhooks & Automações</h1>
          <p className="text-sm text-muted-foreground mt-1">Recebe POST e dispara sequência de mensagens WhatsApp</p>
        </div>
        <Button onClick={() => { setEditing(undefined); setShowDialog(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Webhook
        </Button>
      </div>

      {isLoading ? (
        <div className="glass-card p-12 text-center text-muted-foreground text-sm">Carregando...</div>
      ) : webhooks.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Zap className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhum webhook criado ainda</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Nome</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Sessão</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Msgs</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Ativo</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {webhooks.map(w => (
                <tr key={w.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{w.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">/webhook/{w.token.slice(0, 8)}...</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{w.session_id}</td>
                  <td className="px-4 py-3"><Badge variant="secondary">{w.messages?.length || 0}</Badge></td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={w.is_active}
                      onCheckedChange={v => toggle.mutate({ id: w.id, is_active: v })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setViewingLogs(w)}>
                        <Play className="h-3 w-3" /> Logs
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditing(w); setShowDialog(true); }}>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => { if (confirm("Remover webhook?")) del.mutate(w.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showDialog && (
        <WebhookDialog
          open={showDialog}
          onClose={() => setShowDialog(false)}
          webhook={editing}
          sessions={sessions}
        />
      )}
    </div>
  );
}
