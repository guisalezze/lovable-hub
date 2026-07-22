import { useState, useRef, useEffect } from "react";
import { apiPost, apiGet } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Upload, Send, Plus, Trash2, CheckCircle2, XCircle,
  Loader2, GitBranch, Zap, X, Shuffle, ChevronDown, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Session {
  session_id: string;
  display_name: string | null;
  status: string;
  live_status?: string;
}

interface Contact {
  phone: string;
  name: string;
}

interface BtnDef {
  id: string;
  text: string;
  action: "none" | "messages" | "funnel";
  followUp: string[];
  funnelId: string;
}

interface MsgBlock {
  type: "text" | "buttons";
  variations: string[];
  buttons: BtnDef[];
}

interface JobStatus {
  total: number;
  sent: number;
  errors: { phone: string; error: string }[];
  status: "running" | "done";
}

interface BatchResult {
  enrolled: number;
  errors: { phone: string; error: string }[];
  total: number;
}

interface Funnel {
  id: string;
  name: string;
  session_id: string;
  graph: { nodes: unknown[]; edges: unknown[] };
  is_active: boolean;
}

type Mode = "direto" | "funil";

function cleanPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

function parseText(text: string): Contact[] {
  return text.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    const phone = cleanPhone(parts[0] || "") || "";
    const name = parts[1] || "";
    return { phone, name };
  }).filter((c) => c.phone.length >= 10);
}

function makeBtn(): BtnDef {
  return { id: `btn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, text: "", action: "none", followUp: [""], funnelId: "" };
}

function makeBlock(type: MsgBlock["type"] = "text"): MsgBlock {
  return { type, variations: [""], buttons: type === "buttons" ? [makeBtn()] : [] };
}

// ─── Button Follow-up Editor ──────────────────────────────────────────────────
function BtnFollowupEditor({
  btn, funnels, disabled,
  onChange,
}: {
  btn: BtnDef;
  funnels: Funnel[];
  disabled?: boolean;
  onChange: (b: BtnDef) => void;
}) {
  const [open, setOpen] = useState(false);

  const hasAction = btn.action !== "none";

  return (
    <div className="border border-border rounded-md overflow-hidden">
      {/* Button row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-muted/20">
        <Input
          value={btn.text}
          onChange={(e) => onChange({ ...btn, text: e.target.value })}
          placeholder="Texto do botão"
          className="h-7 text-xs flex-1"
          disabled={disabled}
        />
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-1 rounded transition-colors shrink-0",
            hasAction ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
          title="Configurar ação ao clicar"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {hasAction ? "Ação ativa" : "Ao clicar…"}
        </button>
      </div>

      {/* Action config */}
      {open && (
        <div className="p-2 space-y-2 border-t border-border bg-background">
          <div className="flex items-center gap-1.5">
            <Label className="text-[10px] text-muted-foreground shrink-0">Ação:</Label>
            <Select value={btn.action} onValueChange={(v) => onChange({ ...btn, action: v as BtnDef["action"] })} disabled={disabled}>
              <SelectTrigger className="h-6 text-[10px] flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhuma</SelectItem>
                <SelectItem value="messages">Enviar mensagens</SelectItem>
                <SelectItem value="funnel">Entrar em funil</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {btn.action === "messages" && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground">Mensagens ao clicar (em ordem):</p>
              {btn.followUp.map((msg, i) => (
                <div key={i} className="flex gap-1 items-start">
                  <Textarea
                    value={msg}
                    onChange={(e) => {
                      const fu = [...btn.followUp];
                      fu[i] = e.target.value;
                      onChange({ ...btn, followUp: fu });
                    }}
                    placeholder={`Mensagem ${i + 1}…`}
                    className="text-xs h-14 resize-none flex-1"
                    disabled={disabled}
                  />
                  {btn.followUp.length > 1 && (
                    <button
                      onClick={() => onChange({ ...btn, followUp: btn.followUp.filter((_, j) => j !== i) })}
                      disabled={disabled}
                      className="mt-1 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              <Button
                size="sm" variant="ghost"
                className="h-6 text-[10px] gap-1 text-muted-foreground w-full"
                onClick={() => onChange({ ...btn, followUp: [...btn.followUp, ""] })}
                disabled={disabled}
              >
                <Plus className="h-2.5 w-2.5" /> Adicionar mensagem
              </Button>
            </div>
          )}

          {btn.action === "funnel" && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">Funil para enrollar o contato:</p>
              <Select value={btn.funnelId} onValueChange={(v) => onChange({ ...btn, funnelId: v })} disabled={disabled}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Selecionar funil…" />
                </SelectTrigger>
                <SelectContent>
                  {funnels.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      <div className="flex items-center gap-2">
                        <div className={cn("h-1.5 w-1.5 rounded-full", f.is_active ? "bg-emerald-500" : "bg-muted-foreground")} />
                        {f.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Block Editor ─────────────────────────────────────────────────────────────
function BlockEditor({
  block, index, total, disabled, funnels,
  onChange, onRemove,
}: {
  block: MsgBlock;
  index: number;
  total: number;
  disabled?: boolean;
  funnels: Funnel[];
  onChange: (b: MsgBlock) => void;
  onRemove: () => void;
}) {
  function setType(type: MsgBlock["type"]) {
    onChange({
      ...block,
      type,
      buttons: type === "buttons" && block.buttons.length === 0 ? [makeBtn()] : block.buttons,
    });
  }

  function updateBtn(bi: number, btn: BtnDef) {
    onChange({ ...block, buttons: block.buttons.map((b, i) => i === bi ? btn : b) });
  }

  function removeBtn(bi: number) {
    onChange({ ...block, buttons: block.buttons.filter((_, i) => i !== bi) });
  }

  return (
    <div className="border border-border rounded-lg p-3 space-y-2.5 bg-muted/10">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground shrink-0">BLOCO #{index + 1}</span>
        {block.variations.length > 1 && (
          <span className="flex items-center gap-0.5 text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
            <Shuffle className="h-2.5 w-2.5" />{block.variations.length} var.
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Select value={block.type} onValueChange={(v) => setType(v as MsgBlock["type"])} disabled={disabled}>
            <SelectTrigger className="h-6 text-[10px] w-28 px-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Texto</SelectItem>
              <SelectItem value="buttons">Com Botões</SelectItem>
            </SelectContent>
          </Select>
          {total > 1 && (
            <button onClick={onRemove} disabled={disabled} className="text-muted-foreground hover:text-destructive transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Variations */}
      <div className="space-y-1.5">
        {block.variations.map((v, vi) => (
          <div key={vi} className="flex gap-1 items-start">
            {block.variations.length > 1 && (
              <span className="text-[9px] text-muted-foreground mt-1.5 w-4 shrink-0 text-center font-mono">{vi + 1}</span>
            )}
            <Textarea
              value={v}
              onChange={(e) => {
                const vars = [...block.variations];
                vars[vi] = e.target.value;
                onChange({ ...block, variations: vars });
              }}
              placeholder={block.type === "buttons"
                ? `Texto acima dos botões${block.variations.length > 1 ? ` — variação ${vi + 1}` : ""}…`
                : `Mensagem${block.variations.length > 1 ? ` — variação ${vi + 1}` : ""}… {{nome}}, {{telefone}}`}
              className="text-xs h-16 resize-none flex-1"
              disabled={disabled}
            />
            {block.variations.length > 1 && (
              <button
                onClick={() => onChange({ ...block, variations: block.variations.filter((_, i) => i !== vi) })}
                disabled={disabled}
                className="mt-1.5 text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <Button
          size="sm" variant="ghost"
          className="h-6 text-[10px] gap-1 text-muted-foreground w-full"
          onClick={() => onChange({ ...block, variations: [...block.variations, ""] })}
          disabled={disabled}
        >
          <Plus className="h-2.5 w-2.5" /> Adicionar variação
        </Button>
      </div>

      {/* Buttons */}
      {block.type === "buttons" && (
        <div className="space-y-1.5 pt-2 border-t border-border">
          <p className="text-[10px] font-medium text-muted-foreground">Botões (máx. 3) — clique em "Ao clicar…" para configurar ação</p>
          {block.buttons.map((btn, bi) => (
            <div key={btn.id} className="relative">
              <BtnFollowupEditor
                btn={btn} funnels={funnels} disabled={disabled}
                onChange={(b) => updateBtn(bi, b)}
              />
              {block.buttons.length > 1 && (
                <button
                  onClick={() => removeBtn(bi)}
                  disabled={disabled}
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
          ))}
          {block.buttons.length < 3 && (
            <Button
              size="sm" variant="outline"
              className="w-full h-7 text-xs gap-1"
              onClick={() => onChange({ ...block, buttons: [...block.buttons, makeBtn()] })}
              disabled={disabled}
            >
              <Plus className="h-3 w-3" /> Adicionar botão
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Contacts Input ───────────────────────────────────────────────────────────
function ContactsInput({
  contacts, rawText, onChange, disabled,
}: {
  contacts: Contact[];
  rawText: string;
  onChange: (raw: string, parsed: Contact[]) => void;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || "";
      onChange(text, parseText(text));
      toast.success(`${parseText(text).length} contatos carregados`);
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Contatos</Label>
        {contacts.length > 0 && <span className="text-[10px] text-muted-foreground">{contacts.length} carregados</span>}
      </div>
      <div
        className={cn("border border-dashed border-border rounded-lg p-3 text-center transition-colors", !disabled && "cursor-pointer hover:bg-muted/30")}
        onClick={() => !disabled && fileRef.current?.click()}
      >
        <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
        <p className="text-[10px] text-muted-foreground">Clique para importar CSV</p>
        <p className="text-[10px] text-muted-foreground/60">formato: telefone, nome (opcional)</p>
      </div>
      <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <Textarea
        value={rawText}
        onChange={(e) => onChange(e.target.value, parseText(e.target.value))}
        placeholder={"Ou cole os números:\n5511999999999\n5511988888888, João Silva"}
        className="text-xs font-mono h-24 resize-none"
        disabled={disabled}
      />
    </div>
  );
}

// ─── Mode: Envio Direto ───────────────────────────────────────────────────────
function ModoDirecto({ sessions }: { sessions: Session[] }) {
  const [sessionId, setSessionId] = useState(sessions[0]?.session_id || "");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [rawText, setRawText] = useState("");
  const [blocks, setBlocks] = useState<MsgBlock[]>([makeBlock("text")]);
  const [intervalMs, setIntervalMs] = useState(3000);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [launching, setLaunching] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: funnels = [] } = useQuery<Funnel[]>({
    queryKey: ["funnels"],
    queryFn: () => apiGet("/funnels"),
  });

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function startBroadcast() {
    if (!sessionId) { toast.error("Selecione uma sessão"); return; }
    if (!contacts.length) { toast.error("Adicione contatos"); return; }
    const validBlocks = blocks.filter((b) => b.variations.some((v) => v.trim()));
    if (!validBlocks.length) { toast.error("Adicione pelo menos uma mensagem"); return; }

    setLaunching(true);
    try {
      const result = await apiPost<{ job_id: string; total: number }>("/baileys-broadcast", {
        session_id: sessionId,
        contacts,
        blocks: validBlocks,
        interval_ms: Math.max(500, intervalMs),
      });
      setJobId(result.job_id);
      setJob({ total: result.total, sent: 0, errors: [], status: "running" });

      pollRef.current = setInterval(async () => {
        try {
          const status = await apiGet<JobStatus>(`/baileys-broadcast/${result.job_id}`);
          setJob({ ...status });
          if (status.status === "done") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            toast.success(`Concluído! ${status.sent}/${status.total} enviados`);
          }
        } catch {}
      }, 2000);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLaunching(false);
    }
  }

  function reset() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setJobId(null); setJob(null); setContacts([]); setRawText("");
    setBlocks([makeBlock("text")]);
  }

  const progress = job ? Math.round((job.sent / job.total) * 100) : 0;
  const isRunning = job?.status === "running";

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-80 flex flex-col border-r border-border bg-background shrink-0">
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Sessão</Label>
              <Select value={sessionId} onValueChange={setSessionId} disabled={!!jobId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => (
                    <SelectItem key={s.session_id} value={s.session_id}>{s.display_name || s.session_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ContactsInput
              contacts={contacts} rawText={rawText}
              onChange={(raw, parsed) => { setRawText(raw); setContacts(parsed); }}
              disabled={!!jobId}
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Mensagens</Label>
                <span className="text-[10px] text-muted-foreground">{blocks.length} bloco(s)</span>
              </div>
              {blocks.map((block, i) => (
                <BlockEditor
                  key={i} block={block} index={i} total={blocks.length}
                  disabled={!!jobId} funnels={funnels}
                  onChange={(b) => setBlocks((prev) => prev.map((bl, idx) => idx === i ? b : bl))}
                  onRemove={() => setBlocks((prev) => prev.filter((_, idx) => idx !== i))}
                />
              ))}
              <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1"
                onClick={() => setBlocks((b) => [...b, makeBlock()])} disabled={!!jobId}>
                <Plus className="h-3 w-3" /> Adicionar bloco
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Intervalo entre envios (ms)</Label>
              <Input type="number" value={intervalMs}
                onChange={(e) => setIntervalMs(Number(e.target.value))}
                className="h-8 text-xs" min={500} step={500} disabled={!!jobId} />
              <p className="text-[10px] text-muted-foreground">Recomendado: 3000–5000ms</p>
            </div>

            {!jobId ? (
              <Button className="w-full gap-1.5" onClick={startBroadcast} disabled={launching || !contacts.length}>
                {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Disparar ({contacts.length})
              </Button>
            ) : (
              <Button className="w-full" variant="outline" onClick={reset} disabled={isRunning}>
                {isRunning ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Disparando…</> : "Novo Disparo"}
              </Button>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Status */}
      <div className="flex-1 flex flex-col bg-muted/10 overflow-hidden">
        {!job ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Zap className="h-14 w-14 opacity-10" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">Envio Direto</p>
              <p className="text-xs opacity-60 max-w-xs">Blocos com variações sorteiam uma versão por contato. Botões podem disparar sequências ou entrar em funil ao serem clicados.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full p-4 gap-4">
            <div className="space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{isRunning ? "Disparando…" : "Concluído"}</span>
                <span className="text-xs text-muted-foreground font-mono">{job.sent}/{job.total}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-500", job.status === "done" ? "bg-emerald-500" : "bg-primary")} style={{ width: `${progress}%` }} />
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" />{job.sent - job.errors.length} enviados</span>
                <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-500" />{job.errors.length} erros</span>
                <span className="ml-auto">{progress}%</span>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-medium mb-2 text-muted-foreground">Contatos ({contacts.length})</p>
              <ScrollArea className="h-full border border-border rounded-md bg-background">
                <div className="p-2 space-y-0.5">
                  {contacts.map((c, i) => {
                    const err = job.errors.find((e) => e.phone === c.phone);
                    const done = !err && i < job.sent;
                    return (
                      <div key={i} className={cn("flex items-center gap-2 px-2 py-1 rounded text-xs",
                        err && "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400",
                        done && "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400",
                        !err && !done && "text-muted-foreground")}>
                        {err ? <XCircle className="h-3 w-3 shrink-0" /> : done ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <div className="h-3 w-3 rounded-full border border-current shrink-0 opacity-40" />}
                        <span className="font-mono shrink-0">{c.phone}</span>
                        {c.name && <span className="text-[10px] opacity-70 truncate">{c.name}</span>}
                        {err && <span className="ml-auto text-[10px] truncate max-w-[140px]">{err.error}</span>}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Mode: Via Funil ──────────────────────────────────────────────────────────
function ModoFunil({ sessions }: { sessions: Session[] }) {
  const [funnelId, setFunnelId] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [rawText, setRawText] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [result, setResult] = useState<BatchResult | null>(null);

  const { data: funnels = [] } = useQuery<Funnel[]>({
    queryKey: ["funnels"],
    queryFn: () => apiGet("/funnels"),
  });

  const selectedFunnel = funnels.find((f) => f.id === funnelId);

  async function enroll() {
    if (!funnelId) { toast.error("Selecione um funil"); return; }
    if (!contacts.length) { toast.error("Adicione contatos"); return; }
    setEnrolling(true); setResult(null);
    try {
      const res = await apiPost<BatchResult>(`/funnels/${funnelId}/enroll-batch`, { contacts });
      setResult(res);
      toast.success(`${res.enrolled} contatos enrollados!`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEnrolling(false);
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-80 flex flex-col border-r border-border bg-background shrink-0">
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Funil</Label>
              <Select value={funnelId} onValueChange={setFunnelId} disabled={enrolling}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar funil…" /></SelectTrigger>
                <SelectContent>
                  {funnels.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground text-center">Nenhum funil criado</div>}
                  {funnels.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      <div className="flex items-center gap-2">
                        <div className={cn("h-1.5 w-1.5 rounded-full", f.is_active ? "bg-emerald-500" : "bg-muted-foreground")} />
                        {f.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedFunnel && (
                <div className="text-[10px] text-muted-foreground bg-muted/40 rounded-md px-2 py-1.5 space-y-0.5">
                  <p>{selectedFunnel.graph?.nodes?.length || 0} nós · {selectedFunnel.graph?.edges?.length || 0} conexões</p>
                  {!selectedFunnel.is_active && <p className="text-amber-600">⚠ Funil inativo</p>}
                </div>
              )}
            </div>
            <ContactsInput contacts={contacts} rawText={rawText}
              onChange={(raw, parsed) => { setRawText(raw); setContacts(parsed); }}
              disabled={enrolling} />
            <div className="rounded-md bg-muted/30 border border-border p-3 text-[10px] text-muted-foreground space-y-1">
              <p className="font-medium text-foreground text-xs">Como funciona</p>
              <p>Cada contato entra no início do funil e recebe a sequência com os delays dos nós. Contatos já enrollados são ignorados.</p>
            </div>
            {!result ? (
              <Button className="w-full gap-1.5" onClick={enroll} disabled={enrolling || !contacts.length || !funnelId}>
                {enrolling ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitBranch className="h-4 w-4" />}
                Enrollar no Funil ({contacts.length})
              </Button>
            ) : (
              <Button className="w-full" variant="outline" onClick={() => { setResult(null); setContacts([]); setRawText(""); }}>
                Novo Disparo
              </Button>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col bg-muted/10 overflow-hidden">
        {!result ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <GitBranch className="h-14 w-14 opacity-10" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">Disparo via Funil</p>
              <p className="text-xs opacity-60 max-w-xs">Selecione um funil e uma lista — cada pessoa recebe a sequência completa do workflow</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full p-6 gap-4">
            <p className="text-sm font-semibold shrink-0">Resultado</p>
            <div className="grid grid-cols-3 gap-3 shrink-0">
              {[
                { label: "Total", value: result.total, color: "bg-muted text-foreground" },
                { label: "Enrollados", value: result.enrolled, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" },
                { label: "Erros", value: result.errors.length, color: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className={cn("rounded-lg p-3 text-center", color)}>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-[10px] font-medium opacity-70">{label}</p>
                </div>
              ))}
            </div>
            {result.errors.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-2">
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Todos enrollados!</p>
                  <p className="text-xs text-muted-foreground">Os contatos receberão as mensagens conforme os delays do funil</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <ScrollArea className="h-full border border-border rounded-md bg-background">
                  <div className="p-2 space-y-0.5">
                    {result.errors.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1 rounded text-xs bg-red-50 dark:bg-red-950/20 text-red-700">
                        <XCircle className="h-3 w-3 shrink-0" />
                        <span className="font-mono">{e.phone}</span>
                        <span className="ml-auto text-[10px] truncate max-w-[160px]">{e.error}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DisparoTab ───────────────────────────────────────────────────────────────
export function DisparoTab({ sessions }: { sessions: Session[] }) {
  const [mode, setMode] = useState<Mode>("direto");
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex gap-1 p-2 border-b border-border bg-background shrink-0">
        <button onClick={() => setMode("direto")} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors", mode === "direto" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
          <Zap className="h-3 w-3" /> Envio Direto
        </button>
        <button onClick={() => setMode("funil")} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors", mode === "funil" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
          <GitBranch className="h-3 w-3" /> Via Funil
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {mode === "direto" ? <ModoDirecto sessions={sessions} /> : <ModoFunil sessions={sessions} />}
      </div>
    </div>
  );
}
