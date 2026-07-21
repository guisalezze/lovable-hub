import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, apiDelete, API_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Plus, Trash2, Copy, Zap, ArrowRight, Upload, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WButton {
  id: string;
  text: string;
}

interface WMessage {
  type: "text" | "image" | "buttons";
  content: string;
  delay_ms: number;
  media_url?: string;
  buttons?: WButton[];
}

interface Webhook {
  id: string;
  name: string;
  token: string;
  session_id: string;
  is_active: boolean;
  event_type: string;
  messages: WMessage[];
  initial_delay_ms: number;
  interval_ms: number;
  created_at: string;
}

interface ButtonFlow {
  button_id: string;
  messages: WMessage[];
}

interface Session {
  session_id: string;
  display_name: string | null;
  status: string;
  live_status?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genButtonId(): string {
  return "btn_" + Math.random().toString(36).slice(2, 10);
}

function emptyMsg(type: WMessage["type"] = "text"): WMessage {
  return {
    type,
    content: "",
    delay_ms: type === "text" ? 2000 : 0,
    buttons: type === "buttons" ? [{ id: genButtonId(), text: "" }] : undefined,
  };
}

const VARS = ["{{nome}}", "{{email}}", "{{produto}}", "{{valor}}"];

const EVENTS = [
  { value: "all",                    label: "Todos os eventos" },
  { value: "purchase_approved",      label: "Compra Aprovada" },
  { value: "purchase_refused",       label: "Cartão Recusado" },
  { value: "purchase_generated",     label: "Pix / Boleto Gerado" },
  { value: "purchase_canceled",      label: "Compra Cancelada" },
  { value: "purchase_refunded",      label: "Reembolso" },
  { value: "purchase_chargeback",    label: "Chargeback" },
  { value: "abandoned_cart",         label: "Carrinho Abandonado" },
  { value: "subscription_activated", label: "Assinatura Ativada" },
  { value: "subscription_canceled",  label: "Assinatura Cancelada" },
];

// ─── MessageRow ───────────────────────────────────────────────────────────────

function MessageRow({
  msg,
  index,
  onChange,
  onDelete,
  onSelectButton,
  selectedButtonId,
}: {
  msg: WMessage;
  index: number;
  onChange: (m: WMessage) => void;
  onDelete: () => void;
  onSelectButton: (id: string | null) => void;
  selectedButtonId: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileUpload(file: File) {
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await apiPost<{ url: string }>("/upload/automation-media", {
        filename: file.name,
        data: base64,
        contentType: file.type,
      });
      onChange({ ...msg, media_url: result.url });
      toast.success("Imagem enviada!");
    } catch (e: any) {
      toast.error("Erro no upload: " + e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-background text-xs">
      {/* Row header */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground font-medium w-5 shrink-0">{index + 1}.</span>
        <Select
          value={msg.type}
          onValueChange={(v) =>
            onChange({
              ...msg,
              type: v as WMessage["type"],
              buttons: v === "buttons" ? [{ id: genButtonId(), text: "" }] : undefined,
            })
          }
        >
          <SelectTrigger className="h-7 text-xs w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Texto</SelectItem>
            <SelectItem value="buttons">Botões</SelectItem>
            <SelectItem value="image">Imagem</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 ml-auto">
          <span className="text-muted-foreground">Delay:</span>
          <Input
            type="number"
            value={msg.delay_ms / 1000}
            onChange={(e) => onChange({ ...msg, delay_ms: Math.max(0, Number(e.target.value)) * 1000 })}
            className="h-7 w-14 text-xs"
            min={0}
          />
          <span className="text-muted-foreground">s</span>
        </div>

        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={onDelete}>
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </div>

      {/* Image upload */}
      {msg.type === "image" && (
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            <Input
              placeholder="URL da imagem ou faça upload →"
              value={msg.media_url || ""}
              onChange={(e) => onChange({ ...msg, media_url: e.target.value })}
              className="h-7 text-xs flex-1 font-mono"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 shrink-0 gap-1"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              Upload
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = "";
              }}
            />
          </div>
          {msg.media_url && (
            <img
              src={msg.media_url}
              alt="preview"
              className="h-20 rounded border border-border object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
        </div>
      )}

      {/* Content */}
      <Textarea
        placeholder={
          msg.type === "buttons"
            ? "Texto do menu de botões…"
            : "Conteúdo… use {{nome}}, {{email}}, {{produto}}, {{valor}}"
        }
        value={msg.content}
        onChange={(e) => onChange({ ...msg, content: e.target.value })}
        className="text-xs min-h-[56px] resize-none"
      />

      {/* Buttons editor */}
      {msg.type === "buttons" && (
        <div className="space-y-1.5 pt-0.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Botões (máx. 3)
          </p>
          {(msg.buttons || []).map((btn, bi) => {
            const isSelected = selectedButtonId === btn.id;
            return (
              <div key={btn.id} className="flex items-center gap-1.5">
                <button
                  onClick={() => onSelectButton(isSelected ? null : btn.id)}
                  title="Ver/editar fluxo deste botão"
                  className={cn(
                    "flex items-center gap-1 text-xs px-2 py-1 rounded border shrink-0 transition-colors",
                    isSelected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/40 text-muted-foreground"
                  )}
                >
                  <ArrowRight className="h-2.5 w-2.5" />
                  Fluxo
                </button>
                <Input
                  placeholder={`Botão ${bi + 1}`}
                  value={btn.text}
                  onChange={(e) => {
                    const nb = [...(msg.buttons || [])];
                    nb[bi] = { ...btn, text: e.target.value };
                    onChange({ ...msg, buttons: nb });
                  }}
                  className="h-7 text-xs flex-1"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 shrink-0"
                  onClick={() => {
                    const nb = (msg.buttons || []).filter((_, i) => i !== bi);
                    onChange({ ...msg, buttons: nb });
                    if (selectedButtonId === btn.id) onSelectButton(null);
                  }}
                  disabled={(msg.buttons || []).length <= 1}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            );
          })}

          {(msg.buttons || []).length < 3 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs text-muted-foreground gap-1"
              onClick={() =>
                onChange({ ...msg, buttons: [...(msg.buttons || []), { id: genButtonId(), text: "" }] })
              }
            >
              <Plus className="h-2.5 w-2.5" /> Adicionar botão
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ButtonFlowEditor ─────────────────────────────────────────────────────────

function ButtonFlowEditor({
  buttonId,
  buttonText,
  flows,
  onFlowChange,
}: {
  buttonId: string;
  buttonText: string;
  flows: ButtonFlow[];
  onFlowChange: (buttonId: string, messages: WMessage[]) => void;
}) {
  const flow = flows.find((f) => f.button_id === buttonId);
  const msgs = flow?.messages || [];

  return (
    <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 space-y-2 ml-4">
      <div className="flex items-center gap-1.5">
        <ArrowRight className="h-3 w-3 text-primary shrink-0" />
        <p className="text-xs font-semibold text-primary">
          Fluxo após botão: &ldquo;{buttonText || buttonId}&rdquo;
        </p>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Mensagens enviadas automaticamente quando o contato pressionar este botão.
      </p>

      <div className="space-y-2">
        {msgs.map((msg, i) => (
          <MessageRow
            key={i}
            msg={msg}
            index={i}
            onChange={(m) => {
              const n = [...msgs];
              n[i] = m;
              onFlowChange(buttonId, n);
            }}
            onDelete={() => onFlowChange(buttonId, msgs.filter((_, idx) => idx !== i))}
            onSelectButton={() => {}}
            selectedButtonId={null}
          />
        ))}
        <Button
          size="sm"
          variant="outline"
          className="w-full h-7 text-xs"
          onClick={() => onFlowChange(buttonId, [...msgs, emptyMsg("text")])}
        >
          <Plus className="h-3 w-3 mr-1" /> Adicionar mensagem de fluxo
        </Button>
      </div>
    </div>
  );
}

// ─── AutomacoesTab ────────────────────────────────────────────────────────────

export function AutomacoesTab({ sessions }: { sessions: Session[] }) {
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedButtonId, setSelectedButtonId] = useState<string | null>(null);

  const defaultForm = (): Partial<Webhook> => ({
    name: "",
    session_id: sessions[0]?.session_id || "",
    is_active: true,
    event_type: "all",
    messages: [],
    initial_delay_ms: 5000,
    interval_ms: 2000,
  });

  const [form, setForm] = useState<Partial<Webhook>>(defaultForm());
  const [buttonFlows, setButtonFlows] = useState<ButtonFlow[]>([]);

  // ── Load webhooks ────────────────────────────────────────────────────────────
  const { data: webhooks = [] } = useQuery<Webhook[]>({
    queryKey: ["webhooks"],
    queryFn: () => apiGet("/webhooks"),
    refetchInterval: 20000,
  });

  // ── Load button flows for selected webhook ───────────────────────────────────
  const { data: dbFlows } = useQuery<ButtonFlow[]>({
    queryKey: ["button-flows", selectedId],
    queryFn: () => apiGet(`/webhooks/${selectedId}/button-flows`),
    enabled: !!selectedId && !isNew,
  });

  useEffect(() => {
    if (dbFlows) setButtonFlows(dbFlows);
  }, [dbFlows]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  function selectWebhook(wh: Webhook) {
    setSelectedId(wh.id);
    setIsNew(false);
    setSelectedButtonId(null);
    setForm({
      name: wh.name,
      session_id: wh.session_id,
      is_active: wh.is_active,
      event_type: wh.event_type || "all",
      messages: wh.messages || [],
      initial_delay_ms: wh.initial_delay_ms,
      interval_ms: wh.interval_ms,
    });
    setButtonFlows([]);
  }

  function startNew() {
    setSelectedId(null);
    setIsNew(true);
    setSelectedButtonId(null);
    setForm(defaultForm());
    setButtonFlows([]);
  }

  function updateFlow(buttonId: string, messages: WMessage[]) {
    setButtonFlows((prev) => {
      const exists = prev.some((f) => f.button_id === buttonId);
      if (exists) return prev.map((f) => (f.button_id === buttonId ? { ...f, messages } : f));
      return [...prev, { button_id: buttonId, messages }];
    });
  }

  async function handleSave() {
    if (!form.name?.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!form.session_id) { toast.error("Selecione uma sessão"); return; }
    setSaving(true);
    try {
      let id = selectedId;
      if (isNew) {
        const result = await apiPost<Webhook>("/webhooks", {
          name: form.name,
          session_id: form.session_id,
          event_type: form.event_type || "all",
          messages: form.messages || [],
          initial_delay_ms: form.initial_delay_ms ?? 5000,
          interval_ms: form.interval_ms ?? 2000,
        });
        id = result.id;
        setSelectedId(id);
        setIsNew(false);
      } else {
        await apiPut(`/webhooks/${id}`, {
          name: form.name,
          session_id: form.session_id,
          is_active: form.is_active,
          event_type: form.event_type || "all",
          messages: form.messages || [],
          initial_delay_ms: form.initial_delay_ms,
          interval_ms: form.interval_ms,
        });
      }

      // Save button flows (only if there are any)
      if (id && buttonFlows.length > 0) {
        await apiPut(`/webhooks/${id}/button-flows`, {
          flows: buttonFlows.map((f) => ({ button_id: f.button_id, messages: f.messages })),
        });
      }

      qc.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Automação salva!");
    } catch (e: any) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId || !confirm("Excluir esta automação?")) return;
    try {
      await apiDelete(`/webhooks/${selectedId}`);
      setSelectedId(null);
      setIsNew(false);
      setForm(defaultForm());
      setButtonFlows([]);
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      toast.success("Automação excluída.");
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  const selectedWebhook = webhooks.find((w) => w.id === selectedId);
  const webhookUrl = selectedWebhook ? `${API_URL}/webhook/${selectedWebhook.token}` : null;

  // All buttons in current form messages
  const allButtons: { id: string; text: string }[] = [];
  (form.messages || []).forEach((msg) => {
    if (msg.type === "buttons") {
      (msg.buttons || []).forEach((b) => { if (b.id) allButtons.push({ id: b.id, text: b.text }); });
    }
  });

  const selectedButton = allButtons.find((b) => b.id === selectedButtonId);

  const showEditor = selectedId !== null || isNew;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: list ────────────────────────────────────────────────────────── */}
      <div className="w-56 shrink-0 border-r border-border bg-background flex flex-col">
        <div className="p-3 border-b border-border">
          <Button size="sm" className="w-full h-8 text-xs gap-1" onClick={startNew}>
            <Plus className="h-3 w-3" /> Nova automação
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {webhooks.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <Zap className="h-7 w-7 mx-auto opacity-20" />
              <p className="text-xs text-muted-foreground">Nenhuma automação criada.</p>
            </div>
          ) : (
            webhooks.map((wh) => (
              <button
                key={wh.id}
                onClick={() => selectWebhook(wh)}
                className={cn(
                  "w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/50 transition-colors",
                  selectedId === wh.id && "bg-muted"
                )}
              >
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-xs font-medium truncate flex-1">{wh.name}</span>
                  <div
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      wh.is_active ? "bg-emerald-500" : "bg-muted-foreground"
                    )}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground truncate pl-5 mt-0.5">
                  {sessions.find((s) => s.session_id === wh.session_id)?.display_name || wh.session_id}
                </p>
                {wh.event_type && wh.event_type !== "all" && (
                  <p className="text-[10px] truncate pl-5 text-primary/70 font-medium">
                    {EVENTS.find((e) => e.value === wh.event_type)?.label || wh.event_type}
                  </p>
                )}
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      {/* ── Right: editor ─────────────────────────────────────────────────────── */}
      {showEditor ? (
        <ScrollArea className="flex-1">
          <div className="p-4 max-w-2xl space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {isNew ? "Nova automação" : "Editar automação"}
              </h3>
              {!isNew && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Ativo</span>
                  <Switch
                    checked={form.is_active ?? true}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                  />
                </div>
              )}
            </div>

            {/* Basic fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <Label className="text-xs">Nome</Label>
                <Input
                  value={form.name || ""}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Compra aprovada"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <Label className="text-xs">Sessão WhatsApp</Label>
                <Select
                  value={form.session_id || ""}
                  onValueChange={(v) => setForm((f) => ({ ...f, session_id: v }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.session_id} value={s.session_id}>
                        {s.display_name || s.session_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Evento do webhook</Label>
                <Select
                  value={form.event_type || "all"}
                  onValueChange={(v) => setForm((f) => ({ ...f, event_type: v }))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENTS.map((ev) => (
                      <SelectItem key={ev.value} value={ev.value}>
                        {ev.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Esta automação só dispara quando o evento recebido no webhook corresponde ao selecionado.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Delay inicial (s)</Label>
                <Input
                  type="number"
                  value={((form.initial_delay_ms ?? 5000) / 1000)}
                  onChange={(e) => setForm((f) => ({ ...f, initial_delay_ms: Math.max(0, Number(e.target.value)) * 1000 }))}
                  className="h-8 text-xs"
                  min={0}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Intervalo entre msgs (s)</Label>
                <Input
                  type="number"
                  value={((form.interval_ms ?? 2000) / 1000)}
                  onChange={(e) => setForm((f) => ({ ...f, interval_ms: Math.max(0.5, Number(e.target.value)) * 1000 }))}
                  className="h-8 text-xs"
                  min={0.5}
                  step={0.5}
                />
              </div>
            </div>

            {/* Webhook URL */}
            {webhookUrl && (
              <div className="space-y-1">
                <Label className="text-xs">URL do Webhook</Label>
                <div className="flex gap-2">
                  <Input value={webhookUrl} readOnly className="text-xs h-8 font-mono bg-muted" />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("Copiado!"); }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Configure esta URL na plataforma desejada. O payload deve conter o telefone em um dos campos:{" "}
                  <code className="bg-muted rounded px-1">phone</code>,{" "}
                  <code className="bg-muted rounded px-1">telefone</code>,{" "}
                  <code className="bg-muted rounded px-1">celular</code> ou{" "}
                  <code className="bg-muted rounded px-1">whatsapp</code>.
                </p>
              </div>
            )}

            {/* Variables hint */}
            <div className="rounded-lg border border-border/50 bg-muted/40 p-2.5">
              <p className="text-[10px] font-semibold text-muted-foreground mb-1.5">
                Variáveis disponíveis — clique para copiar (equivalências entre plataformas):
              </p>
              <div className="flex flex-wrap gap-1">
                {VARS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    title="Clique para copiar"
                    onClick={() => { navigator.clipboard.writeText(v); toast.success(`${v} copiado!`); }}
                    className="text-[10px] bg-background border border-border rounded px-1.5 py-0.5 font-mono cursor-pointer hover:bg-primary/10 hover:border-primary/40 transition-colors"
                  >
                    {v}
                  </button>
                ))}
                <span className="text-[10px] text-muted-foreground self-center">
                  + qualquer campo do payload
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                São equivalências: <code className="bg-background rounded px-0.5">nome</code> mapeia <code className="bg-background rounded px-0.5">name</code>, <code className="bg-background rounded px-0.5">buyer.name</code>, etc.
              </p>
            </div>

            {/* Message sequence */}
            <div className="space-y-2">
              <p className="text-xs font-semibold">Sequência de mensagens</p>
              {(form.messages || []).length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  Nenhuma mensagem. Adicione abaixo.
                </p>
              )}
              {(form.messages || []).map((msg, i) => (
                <div key={i}>
                  <MessageRow
                    msg={msg}
                    index={i}
                    onChange={(m) => {
                      const n = [...(form.messages || [])];
                      n[i] = m;
                      setForm((f) => ({ ...f, messages: n }));
                    }}
                    onDelete={() =>
                      setForm((f) => ({ ...f, messages: (f.messages || []).filter((_, idx) => idx !== i) }))
                    }
                    onSelectButton={(btnId) =>
                      setSelectedButtonId(btnId === selectedButtonId ? null : btnId)
                    }
                    selectedButtonId={selectedButtonId}
                  />
                  {/* Inline button flow editor */}
                  {msg.type === "buttons" &&
                    selectedButtonId &&
                    msg.buttons?.some((b) => b.id === selectedButtonId) &&
                    selectedButton && (
                      <div className="mt-1">
                        <ButtonFlowEditor
                          buttonId={selectedButton.id}
                          buttonText={selectedButton.text}
                          flows={buttonFlows}
                          onFlowChange={updateFlow}
                        />
                      </div>
                    )}
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs gap-1"
                onClick={() =>
                  setForm((f) => ({ ...f, messages: [...(f.messages || []), emptyMsg()] }))
                }
              >
                <Plus className="h-3 w-3" /> Adicionar mensagem
              </Button>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-border">
              <Button onClick={handleSave} disabled={saving} size="sm" className="flex-1 h-8 text-xs">
                {saving ? "Salvando…" : "Salvar automação"}
              </Button>
              {!isNew && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8 px-3"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </ScrollArea>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center space-y-2">
            <Zap className="h-10 w-10 mx-auto opacity-15" />
            <p className="text-sm font-medium">Selecione uma automação</p>
            <p className="text-xs opacity-60">ou crie uma nova para começar</p>
          </div>
        </div>
      )}
    </div>
  );
}
