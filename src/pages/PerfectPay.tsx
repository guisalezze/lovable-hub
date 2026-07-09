import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, apiDelete, API_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, ChevronLeft, Copy, ShoppingCart } from "lucide-react";

interface PerfectPayIntegration {
  id: string;
  name: string;
  token: string;
  dynamic_list_id: string | null;
  wa_session_id: string | null;
  wa_messages: Array<{ type: string; content: string; delay_ms: number }>;
  wa_initial_delay_ms: number;
  wa_interval_ms: number;
  filter_products: string[];
  only_approved: boolean;
  is_active: boolean;
  created_at: string;
}

interface PerfectPayEvent {
  id: string;
  event_type: string;
  buyer_email: string;
  buyer_name: string;
  buyer_phone: string | null;
  product_name: string | null;
  sale_amount: number | null;
  sale_id: string | null;
  status: "processed" | "skipped" | "error";
  wa_sent: boolean;
  error_message: string | null;
  received_at: string;
}

interface DynamicList {
  id: string;
  name: string;
  slug: string;
}

interface Session {
  id: string;
  session_id: string;
  display_name: string | null;
  status: string;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    processed: "bg-emerald-500/20 text-emerald-600",
    skipped: "bg-yellow-500/20 text-yellow-600",
    error: "bg-destructive/20 text-destructive",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

function IntegrationDialog({
  open,
  onClose,
  integration,
  lists,
  sessions,
}: {
  open: boolean;
  onClose: () => void;
  integration?: PerfectPayIntegration;
  lists: DynamicList[];
  sessions: Session[];
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(integration?.name ?? "");
  const [dynamicListId, setDynamicListId] = useState(integration?.dynamic_list_id ?? "");
  const [waSessionId, setWaSessionId] = useState(integration?.wa_session_id ?? "");
  const [filterProducts, setFilterProducts] = useState((integration?.filter_products ?? []).join(", "));
  const [onlyApproved, setOnlyApproved] = useState(integration?.only_approved ?? true);
  const [initialDelay, setInitialDelay] = useState(String(integration?.wa_initial_delay_ms ?? 5000));
  const [interval, setInterval_] = useState(String(integration?.wa_interval_ms ?? 2000));
  const [messages, setMessages] = useState<Array<{ type: string; content: string; delay_ms: number }>>(
    integration?.wa_messages ?? []
  );

  const save = useMutation({
    mutationFn: () => {
      if (!name) throw new Error("Nome obrigatório");
      const payload = {
        name,
        dynamic_list_id: dynamicListId || null,
        wa_session_id: waSessionId || null,
        wa_messages: messages,
        wa_initial_delay_ms: parseInt(initialDelay) || 5000,
        wa_interval_ms: parseInt(interval) || 2000,
        filter_products: filterProducts.split(",").map(s => s.trim()).filter(Boolean),
        only_approved: onlyApproved,
      };
      return integration
        ? apiPut(`/perfectpay-integrations/${integration.id}`, payload)
        : apiPost("/perfectpay-integrations", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["perfectpay-integrations"] });
      toast.success(integration ? "Integração atualizada" : "Integração criada");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMsg = () => setMessages(prev => [...prev, { type: "text", content: "", delay_ms: 1000 }]);
  const removeMsg = (i: number) => setMessages(prev => prev.filter((_, idx) => idx !== i));
  const updateMsg = (i: number, field: string, value: string | number) =>
    setMessages(prev => prev.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{integration ? "Editar integração" : "Nova integração PerfectPay"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Produto Principal" className="mt-1" />
          </div>

          <div>
            <Label>Lista dinâmica (opcional)</Label>
            <Select value={dynamicListId || "__none"} onValueChange={v => setDynamicListId(v === "__none" ? "" : v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Nenhuma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Nenhuma</SelectItem>
                {lists.map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Compradores serão adicionados automaticamente</p>
          </div>

          <div>
            <Label>Sessão WhatsApp (opcional)</Label>
            <Select value={waSessionId || "__none"} onValueChange={v => setWaSessionId(v === "__none" ? "" : v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Nenhuma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Nenhuma</SelectItem>
                {sessions.map(s => (
                  <SelectItem key={s.session_id} value={s.session_id}>
                    {s.display_name || s.session_id} ({s.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Filtrar produtos (opcional)</Label>
            <Input
              value={filterProducts}
              onChange={e => setFilterProducts(e.target.value)}
              placeholder="Produto A, Produto B"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">Separar com vírgula. Vazio = todos os produtos</p>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={onlyApproved} onCheckedChange={setOnlyApproved} />
            <Label>Apenas vendas aprovadas</Label>
          </div>

          {waSessionId && (
            <div className="space-y-3 border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Sequência WhatsApp pós-compra</Label>
                <Button size="sm" variant="outline" onClick={addMsg}>+ Mensagem</Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Delay inicial (ms)</Label>
                  <Input value={initialDelay} onChange={e => setInitialDelay(e.target.value)} className="mt-1" type="number" />
                </div>
                <div>
                  <Label className="text-xs">Intervalo entre msgs (ms)</Label>
                  <Input value={interval} onChange={e => setInterval_(e.target.value)} className="mt-1" type="number" />
                </div>
              </div>
              {messages.map((msg, i) => (
                <div key={i} className="border rounded p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Select value={msg.type} onValueChange={v => updateMsg(i, "type", v)}>
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Texto</SelectItem>
                        <SelectItem value="image">Imagem</SelectItem>
                        <SelectItem value="audio">Áudio</SelectItem>
                        <SelectItem value="video">Vídeo</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      placeholder="delay ms"
                      value={msg.delay_ms}
                      onChange={e => updateMsg(i, "delay_ms", parseInt(e.target.value) || 0)}
                      className="w-24 h-8 text-xs"
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8 ml-auto" onClick={() => removeMsg(i)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                  <Input
                    value={msg.content}
                    onChange={e => updateMsg(i, "content", e.target.value)}
                    placeholder={msg.type === "text" ? "Olá {{nome}}, seu acesso está pronto!" : "URL da mídia"}
                    className="text-xs"
                  />
                  {msg.type === "text" && (
                    <p className="text-[10px] text-muted-foreground">
                      Variáveis: {`{{nome}} {{email}} {{produto}} {{valor}}`}
                    </p>
                  )}
                </div>
              ))}
              {messages.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">Nenhuma mensagem. Clique em + Mensagem.</p>
              )}
            </div>
          )}
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

function EventsView({ integration, onBack }: { integration: PerfectPayIntegration; onBack: () => void }) {
  const { data: events = [], isLoading } = useQuery<PerfectPayEvent[]>({
    queryKey: ["perfectpay-events", integration.id],
    queryFn: () => apiGet(`/perfectpay-integrations/${integration.id}/events`),
    refetchInterval: 15000,
  });

  const webhookUrl = `${API_URL}/webhook/perfectpay/${integration.token}`;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Voltar
      </button>
      <div>
        <h2 className="text-lg font-semibold">{integration.name}</h2>
        <div className="flex items-center gap-2 mt-1">
          <code className="text-xs bg-muted px-2 py-1 rounded truncate max-w-xs">{webhookUrl}</code>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("URL copiada"); }}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Configure esta URL no painel da PerfectPay como URL de postback</p>
      </div>

      <div className="border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-3 py-2 text-xs font-medium">Data</th>
              <th className="text-left px-3 py-2 text-xs font-medium">Evento</th>
              <th className="text-left px-3 py-2 text-xs font-medium">Comprador</th>
              <th className="text-left px-3 py-2 text-xs font-medium">Produto</th>
              <th className="text-left px-3 py-2 text-xs font-medium">Valor</th>
              <th className="text-left px-3 py-2 text-xs font-medium">Status</th>
              <th className="text-left px-3 py-2 text-xs font-medium">WA</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>
            ) : events.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum evento ainda</td></tr>
            ) : events.map(ev => (
              <tr key={ev.id} className="border-b hover:bg-muted/20">
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(ev.received_at).toLocaleString("pt-BR")}
                </td>
                <td className="px-3 py-2 text-xs font-mono">{ev.event_type}</td>
                <td className="px-3 py-2">
                  <div className="text-xs font-medium">{ev.buyer_name || "—"}</div>
                  <div className="text-[10px] text-muted-foreground">{ev.buyer_email}</div>
                </td>
                <td className="px-3 py-2 text-xs">{ev.product_name || "—"}</td>
                <td className="px-3 py-2 text-xs">
                  {ev.sale_amount ? `R$ ${ev.sale_amount.toFixed(2)}` : "—"}
                </td>
                <td className="px-3 py-2">{statusBadge(ev.status)}</td>
                <td className="px-3 py-2 text-xs">
                  {ev.wa_sent ? (
                    <span className="text-emerald-600">Enviado</span>
                  ) : integration.wa_session_id ? (
                    <span className="text-muted-foreground">Não</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PerfectPay() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PerfectPayIntegration | undefined>();
  const [viewEvents, setViewEvents] = useState<PerfectPayIntegration | null>(null);

  const { data: integrations = [], isLoading } = useQuery<PerfectPayIntegration[]>({
    queryKey: ["perfectpay-integrations"],
    queryFn: () => apiGet("/perfectpay-integrations"),
  });

  const { data: lists = [] } = useQuery<DynamicList[]>({
    queryKey: ["dynamic-lists"],
    queryFn: () => apiGet("/dynamic-lists"),
  });

  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["sessions"],
    queryFn: () => apiGet("/sessions"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/perfectpay-integrations/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["perfectpay-integrations"] }); toast.success("Integração removida"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      apiPut(`/perfectpay-integrations/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["perfectpay-integrations"] }),
  });

  if (viewEvents) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <EventsView integration={viewEvents} onBack={() => setViewEvents(null)} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6" /> PerfectPay
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Integração com webhook PerfectPay — captura leads, registra vendas e dispara WhatsApp
          </p>
        </div>
        <Button onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova integração
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : integrations.length === 0 ? (
        <div className="border rounded-lg p-12 text-center">
          <ShoppingCart className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-muted-foreground">Nenhuma integração ainda.</p>
          <Button className="mt-4" onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Criar primeira integração
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {integrations.map(integ => {
            const webhookUrl = `${API_URL}/webhook/perfectpay/${integ.token}`;
            const list = lists.find(l => l.id === integ.dynamic_list_id);
            return (
              <div key={integ.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{integ.name}</span>
                      {!integ.is_active && (
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Inativo</span>
                      )}
                      {integ.only_approved && (
                        <span className="text-xs bg-emerald-500/10 text-emerald-700 px-2 py-0.5 rounded-full">Só aprovadas</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs bg-muted px-2 py-0.5 rounded truncate max-w-xs">{webhookUrl}</code>
                      <button
                        onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("URL copiada"); }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                      {list && <span>Lista: <span className="text-foreground">{list.name}</span></span>}
                      {integ.wa_session_id && (
                        <span>WA: <span className="text-foreground">{integ.wa_messages.length} msg(s)</span></span>
                      )}
                      {integ.filter_products.length > 0 && (
                        <span>Filtro: <span className="text-foreground">{integ.filter_products.join(", ")}</span></span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch
                      checked={integ.is_active}
                      onCheckedChange={v => toggleActive.mutate({ id: integ.id, is_active: v })}
                    />
                    <Button size="sm" variant="ghost" onClick={() => setViewEvents(integ)}>
                      Eventos
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setEditing(integ); setDialogOpen(true); }}
                    >
                      Editar
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => { if (confirm("Remover integração?")) remove.mutate(integ.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <IntegrationDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(undefined); }}
        integration={editing}
        lists={lists}
        sessions={sessions}
      />
    </div>
  );
}
