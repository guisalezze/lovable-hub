import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Plus, Trash2, GitBranch, ArrowDown, Upload, Loader2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WMessage {
  type: "text" | "image" | "buttons";
  content: string;
  delay_ms: number;
  media_url?: string;
}

interface FunnelStep {
  id: string;
  delay_ms: number;
  messages: WMessage[];
}

interface Funnel {
  id: string;
  name: string;
  session_id: string;
  trigger_type: "webhook_event" | "manual";
  trigger_event_type: string;
  steps: FunnelStep[];
  is_active: boolean;
  created_at: string;
}

interface Stats {
  active: number;
  completed: number;
  error: number;
  canceled: number;
  total: number;
}

interface Session {
  session_id: string;
  display_name: string | null;
  status: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function genId() { return "s_" + Math.random().toString(36).slice(2, 10); }

function msToHuman(ms: number): { value: number; unit: "minutos" | "horas" | "dias" } {
  if (ms < 3_600_000) return { value: Math.round(ms / 60_000), unit: "minutos" };
  if (ms < 86_400_000) return { value: Math.round(ms / 3_600_000), unit: "horas" };
  return { value: Math.round(ms / 86_400_000), unit: "dias" };
}

function humanToMs(value: number, unit: "minutos" | "horas" | "dias"): number {
  if (unit === "minutos") return value * 60_000;
  if (unit === "horas") return value * 3_600_000;
  return value * 86_400_000;
}

function formatDelay(ms: number): string {
  if (ms === 0) return "Imediatamente";
  const { value, unit } = msToHuman(ms);
  return `Após ${value} ${unit}`;
}

function emptyStep(): FunnelStep {
  return { id: genId(), delay_ms: 0, messages: [{ type: "text", content: "", delay_ms: 1000 }] };
}

// ─── MsgEditor ────────────────────────────────────────────────────────────────

function MsgEditor({
  msg, index, onChange, onDelete,
}: {
  msg: WMessage; index: number;
  onChange: (m: WMessage) => void; onDelete: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = (e) => res((e.target?.result as string).split(",")[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const result = await apiPost<{ url: string }>("/upload/automation-media", {
        filename: file.name, data: base64, contentType: file.type,
      });
      onChange({ ...msg, media_url: result.url });
      toast.success("Imagem enviada!");
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally { setUploading(false); }
  }

  return (
    <div className="border border-border rounded p-2 space-y-1.5 bg-background text-xs">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground w-4 shrink-0">{index + 1}.</span>
        <Select value={msg.type} onValueChange={(v) => onChange({ ...msg, type: v as WMessage["type"] })}>
          <SelectTrigger className="h-6 text-xs w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Texto</SelectItem>
            <SelectItem value="image">Imagem</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-muted-foreground text-[10px]">Delay:</span>
          <Input
            type="number" min={0}
            value={msg.delay_ms / 1000}
            onChange={(e) => onChange({ ...msg, delay_ms: Math.max(0, Number(e.target.value)) * 1000 })}
            className="h-6 w-12 text-xs"
          />
          <span className="text-muted-foreground text-[10px]">s</span>
        </div>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={onDelete}>
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </div>

      {msg.type === "image" && (
        <div className="space-y-1">
          <div className="flex gap-1">
            <Input
              placeholder="URL da imagem ou faça upload →"
              value={msg.media_url || ""}
              onChange={(e) => onChange({ ...msg, media_url: e.target.value })}
              className="h-6 text-xs flex-1 font-mono"
            />
            <Button size="sm" variant="outline" className="h-6 px-1.5 shrink-0 gap-1"
              disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Upload className="h-2.5 w-2.5" />}
            </Button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
          </div>
          {msg.media_url && (
            <img src={msg.media_url} alt="preview" className="h-16 rounded border object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
        </div>
      )}

      <Textarea
        placeholder="Texto da mensagem… use {{nome}}, {{email}}, {{produto}}, {{valor}}"
        value={msg.content}
        onChange={(e) => onChange({ ...msg, content: e.target.value })}
        className="text-xs min-h-[48px] resize-none"
      />
    </div>
  );
}

// ─── StepCard ─────────────────────────────────────────────────────────────────

function StepCard({
  step, index, total, onChange, onDelete,
}: {
  step: FunnelStep; index: number; total: number;
  onChange: (s: FunnelStep) => void; onDelete: () => void;
}) {
  const human = msToHuman(step.delay_ms === 0 ? 0 : step.delay_ms || 3_600_000);
  const [delayVal, setDelayVal] = useState(step.delay_ms === 0 ? 0 : human.value);
  const [delayUnit, setDelayUnit] = useState<"minutos" | "horas" | "dias">(human.unit);

  function applyDelay(val: number, unit: "minutos" | "horas" | "dias") {
    setDelayVal(val); setDelayUnit(unit);
    onChange({ ...step, delay_ms: humanToMs(val, unit) });
  }

  return (
    <div className="space-y-1.5">
      {/* Delay connector (not shown for step 0 if delay is 0) */}
      {(index > 0 || step.delay_ms > 0) && (
        <div className="flex items-center gap-2 py-1">
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <div className="w-px h-2 bg-border" />
            <Clock className="h-3 w-3 text-muted-foreground" />
            <div className="w-px h-2 bg-border" />
          </div>
          <div className="flex items-center gap-1 flex-1">
            {index === 0 ? (
              <span className="text-[10px] text-muted-foreground italic">Imediatamente após o gatilho</span>
            ) : (
              <>
                <span className="text-[10px] text-muted-foreground">Aguardar</span>
                <Input
                  type="number" min={0}
                  value={delayVal}
                  onChange={(e) => applyDelay(Math.max(0, Number(e.target.value)), delayUnit)}
                  className="h-6 w-14 text-xs"
                />
                <Select value={delayUnit} onValueChange={(v) => applyDelay(delayVal, v as typeof delayUnit)}>
                  <SelectTrigger className="h-6 text-xs w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutos">minutos</SelectItem>
                    <SelectItem value="horas">horas</SelectItem>
                    <SelectItem value="dias">dias</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </div>
      )}

      {/* Step box */}
      <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
              {index + 1}
            </div>
            <span className="text-xs font-semibold">
              {index === 0 ? "Etapa inicial" : `Etapa ${index + 1}`}
            </span>
            {step.delay_ms > 0 && index > 0 && (
              <span className="text-[10px] text-muted-foreground">· {formatDelay(step.delay_ms)}</span>
            )}
          </div>
          {total > 1 && (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onDelete}>
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          )}
        </div>

        <div className="space-y-1.5">
          {step.messages.map((msg, mi) => (
            <MsgEditor
              key={mi} msg={msg} index={mi}
              onChange={(m) => {
                const n = [...step.messages]; n[mi] = m;
                onChange({ ...step, messages: n });
              }}
              onDelete={() => onChange({ ...step, messages: step.messages.filter((_, i) => i !== mi) })}
            />
          ))}
          <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground gap-1 w-full"
            onClick={() => onChange({ ...step, messages: [...step.messages, { type: "text", content: "", delay_ms: 1000 }] })}>
            <Plus className="h-2.5 w-2.5" /> Adicionar mensagem
          </Button>
        </div>
      </div>

      {/* Arrow connector to next step */}
      {index < total - 1 && (
        <div className="flex justify-center">
          <ArrowDown className="h-4 w-4 text-muted-foreground/50" />
        </div>
      )}
    </div>
  );
}

// ─── FunilTab ─────────────────────────────────────────────────────────────────

export function FunilTab({ sessions }: { sessions: Session[] }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const defaultForm = (): Partial<Funnel> => ({
    name: "",
    session_id: sessions[0]?.session_id || "",
    trigger_type: "webhook_event",
    trigger_event_type: "purchase_approved",
    steps: [emptyStep()],
    is_active: true,
  });

  const [form, setForm] = useState<Partial<Funnel>>(defaultForm());

  const { data: funnels = [] } = useQuery<Funnel[]>({
    queryKey: ["funnels"],
    queryFn: () => apiGet("/funnels"),
    refetchInterval: 20_000,
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["funnel-stats", selectedId],
    queryFn: () => apiGet(`/funnels/${selectedId}/stats`),
    enabled: !!selectedId && !isNew,
    refetchInterval: 15_000,
  });

  function selectFunnel(f: Funnel) {
    setSelectedId(f.id);
    setIsNew(false);
    setForm({ ...f, steps: f.steps?.length ? f.steps : [emptyStep()] });
  }

  function startNew() {
    setSelectedId(null);
    setIsNew(true);
    setForm(defaultForm());
  }

  function updateStep(index: number, step: FunnelStep) {
    const steps = [...(form.steps || [])];
    steps[index] = step;
    setForm((f) => ({ ...f, steps }));
  }

  function deleteStep(index: number) {
    setForm((f) => ({ ...f, steps: (f.steps || []).filter((_, i) => i !== index) }));
  }

  function addStep() {
    const steps = form.steps || [];
    const newStep = emptyStep();
    newStep.delay_ms = 3_600_000; // default 1h for steps after first
    setForm((f) => ({ ...f, steps: [...steps, newStep] }));
  }

  async function handleSave() {
    if (!form.name?.trim()) { toast.error("Nome obrigatório"); return; }
    if (!form.session_id) { toast.error("Selecione uma sessão"); return; }
    if ((form.steps || []).length === 0) { toast.error("Adicione ao menos uma etapa"); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name,
        session_id: form.session_id,
        trigger_type: form.trigger_type || "webhook_event",
        trigger_event_type: form.trigger_event_type || "all",
        steps: form.steps,
        is_active: form.is_active ?? true,
      };
      if (isNew) {
        const result = await apiPost<Funnel>("/funnels", body);
        setSelectedId(result.id);
        setIsNew(false);
        setForm(result);
      } else {
        const result = await apiPut<Funnel>(`/funnels/${selectedId}`, body);
        setForm(result);
      }
      qc.invalidateQueries({ queryKey: ["funnels"] });
      toast.success("Funil salvo!");
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!selectedId || !confirm("Excluir este funil e todos os contatos matriculados?")) return;
    try {
      await apiDelete(`/funnels/${selectedId}`);
      setSelectedId(null); setIsNew(false); setForm(defaultForm());
      qc.invalidateQueries({ queryKey: ["funnels"] });
      toast.success("Funil excluído.");
    } catch (e: any) { toast.error(e.message); }
  }

  const showEditor = isNew || selectedId !== null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left list ─────────────────────────────────────────────────────── */}
      <div className="w-56 shrink-0 border-r border-border bg-background flex flex-col">
        <div className="p-3 border-b border-border">
          <Button size="sm" className="w-full h-8 text-xs gap-1" onClick={startNew}>
            <Plus className="h-3 w-3" /> Novo funil
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {funnels.length === 0 ? (
            <div className="p-6 text-center space-y-2">
              <GitBranch className="h-7 w-7 mx-auto opacity-20" />
              <p className="text-xs text-muted-foreground">Nenhum funil criado.</p>
            </div>
          ) : (
            funnels.map((f) => (
              <button
                key={f.id}
                onClick={() => selectFunnel(f)}
                className={cn(
                  "w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/50 transition-colors",
                  selectedId === f.id && "bg-muted"
                )}
              >
                <div className="flex items-center gap-2">
                  <GitBranch className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-xs font-medium truncate flex-1">{f.name}</span>
                  <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", f.is_active ? "bg-emerald-500" : "bg-muted-foreground")} />
                </div>
                <p className="text-[10px] text-muted-foreground truncate pl-5 mt-0.5">
                  {sessions.find((s) => s.session_id === f.session_id)?.display_name || f.session_id}
                </p>
                <p className="text-[10px] text-primary/70 truncate pl-5">
                  {EVENTS.find((e) => e.value === f.trigger_event_type)?.label || f.trigger_event_type}
                </p>
                <p className="text-[10px] text-muted-foreground pl-5">
                  {f.steps?.length || 0} etapas
                </p>
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      {/* ── Right editor ──────────────────────────────────────────────────── */}
      {showEditor ? (
        <ScrollArea className="flex-1">
          <div className="p-4 max-w-2xl space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{isNew ? "Novo funil" : "Editar funil"}</h3>
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

            {/* Config */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Nome do funil</Label>
                <Input
                  value={form.name || ""}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Nutrição pós-compra"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sessão WhatsApp</Label>
                <Select value={form.session_id || ""} onValueChange={(v) => setForm((f) => ({ ...f, session_id: v }))}>
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
              <div className="space-y-1">
                <Label className="text-xs">Gatilho</Label>
                <Select value={form.trigger_event_type || "all"} onValueChange={(v) => setForm((f) => ({ ...f, trigger_event_type: v }))}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENTS.map((ev) => (
                      <SelectItem key={ev.value} value={ev.value}>{ev.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Ativos", value: stats.active, color: "text-blue-500" },
                  { label: "Concluídos", value: stats.completed, color: "text-emerald-500" },
                  { label: "Erros", value: stats.error, color: "text-destructive" },
                  { label: "Total", value: stats.total, color: "text-foreground" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="border border-border rounded-lg p-2 text-center">
                    <p className={cn("text-lg font-bold", color)}>{value}</p>
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Steps */}
            <div className="space-y-0">
              <p className="text-xs font-semibold mb-3">Etapas do funil</p>
              {(form.steps || []).map((step, i) => (
                <StepCard
                  key={step.id}
                  step={step}
                  index={i}
                  total={(form.steps || []).length}
                  onChange={(s) => updateStep(i, s)}
                  onDelete={() => deleteStep(i)}
                />
              ))}
              <div className="flex justify-center pt-2">
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={addStep}>
                  <Plus className="h-3 w-3" /> Adicionar etapa
                </Button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2 border-t border-border">
              <Button onClick={handleSave} disabled={saving} size="sm" className="flex-1 h-8 text-xs">
                {saving ? "Salvando…" : "Salvar funil"}
              </Button>
              {!isNew && (
                <Button variant="destructive" size="sm" className="h-8 px-3" onClick={handleDelete}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </ScrollArea>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center space-y-2">
            <GitBranch className="h-10 w-10 mx-auto opacity-15" />
            <p className="text-sm font-medium">Selecione um funil</p>
            <p className="text-xs opacity-60">ou crie um novo para começar</p>
          </div>
        </div>
      )}
    </div>
  );
}
