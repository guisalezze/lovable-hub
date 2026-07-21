import { useState, useRef, useEffect } from "react";
import { apiPost, apiGet } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Upload, Send, Plus, Trash2, Users, CheckCircle2, XCircle, Loader2 } from "lucide-react";
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

interface MsgBlock {
  type: "text";
  content: string;
}

interface JobStatus {
  total: number;
  sent: number;
  errors: { phone: string; error: string }[];
  status: "running" | "done";
}

function cleanPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  return digits;
}

function parseText(text: string): Contact[] {
  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
      const raw = parts[0] || "";
      const phone = cleanPhone(raw) || "";
      const name = parts[1] || "";
      return { phone, name };
    })
    .filter((c) => c.phone.length >= 10);
}

export function DisparoTab({ sessions }: { sessions: Session[] }) {
  const [sessionId, setSessionId] = useState(sessions[0]?.session_id || "");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [rawText, setRawText] = useState("");
  const [messages, setMessages] = useState<MsgBlock[]>([{ type: "text", content: "" }]);
  const [intervalMs, setIntervalMs] = useState(3000);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [launching, setLaunching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (sessions.length && !sessionId) setSessionId(sessions[0].session_id);
  }, [sessions]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || "";
      setRawText(text);
      const parsed = parseText(text);
      setContacts(parsed);
      toast.success(`${parsed.length} contatos carregados`);
    };
    reader.readAsText(file);
  }

  function handleRawChange(text: string) {
    setRawText(text);
    setContacts(parseText(text));
  }

  function addMessage() {
    setMessages((m) => [...m, { type: "text", content: "" }]);
  }

  function removeMessage(i: number) {
    setMessages((m) => m.filter((_, idx) => idx !== i));
  }

  function updateMessage(i: number, content: string) {
    setMessages((m) => m.map((msg, idx) => (idx === i ? { ...msg, content } : msg)));
  }

  async function startBroadcast() {
    if (!sessionId) { toast.error("Selecione uma sessão"); return; }
    if (!contacts.length) { toast.error("Adicione contatos"); return; }
    const validMsgs = messages.filter((m) => m.content.trim());
    if (!validMsgs.length) { toast.error("Adicione pelo menos uma mensagem"); return; }

    setLaunching(true);
    try {
      const result = await apiPost<{ job_id: string; total: number }>("/baileys-broadcast", {
        session_id: sessionId,
        contacts,
        messages: validMsgs,
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
            toast.success(`Disparo concluído! ${status.sent}/${status.total} enviados`);
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
    setJobId(null);
    setJob(null);
    setContacts([]);
    setRawText("");
    setMessages([{ type: "text", content: "" }]);
  }

  const progress = job ? Math.round(((job.sent) / job.total) * 100) : 0;
  const isRunning = job?.status === "running";

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Config panel ── */}
      <div className="w-80 flex flex-col border-r border-border bg-background shrink-0">
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Sessão */}
            <div className="space-y-1.5">
              <Label className="text-xs">Sessão</Label>
              <Select value={sessionId} onValueChange={setSessionId} disabled={!!jobId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecionar sessão" />
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

            {/* Contatos */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Contatos</Label>
                {contacts.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{contacts.length} carregados</span>
                )}
              </div>
              <div
                className="border border-dashed border-border rounded-lg p-3 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => !jobId && fileRef.current?.click()}
              >
                <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-[10px] text-muted-foreground">Clique para importar CSV</p>
                <p className="text-[10px] text-muted-foreground/60">formato: telefone, nome (opcional)</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <Textarea
                value={rawText}
                onChange={(e) => handleRawChange(e.target.value)}
                placeholder={"Ou cole os números (um por linha):\n5511999999999\n5511988888888, João Silva"}
                className="text-xs font-mono h-28 resize-none"
                disabled={!!jobId}
              />
            </div>

            {/* Mensagens */}
            <div className="space-y-1.5">
              <Label className="text-xs">Mensagens</Label>
              <div className="space-y-2">
                {messages.map((msg, i) => (
                  <div key={i} className="border border-border rounded-md p-2 space-y-1.5 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium text-muted-foreground">Mensagem #{i + 1}</span>
                      {messages.length > 1 && (
                        <button
                          onClick={() => removeMessage(i)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          disabled={!!jobId}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <Textarea
                      value={msg.content}
                      onChange={(e) => updateMessage(i, e.target.value)}
                      placeholder={"Texto… use {{nome}} e {{telefone}}"}
                      className="text-xs h-20 resize-none"
                      disabled={!!jobId}
                    />
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-xs gap-1"
                  onClick={addMessage}
                  disabled={!!jobId}
                >
                  <Plus className="h-3 w-3" /> Adicionar mensagem
                </Button>
              </div>
            </div>

            {/* Intervalo */}
            <div className="space-y-1.5">
              <Label className="text-xs">Intervalo entre envios (ms)</Label>
              <Input
                type="number"
                value={intervalMs}
                onChange={(e) => setIntervalMs(Number(e.target.value))}
                className="h-8 text-xs"
                min={500}
                step={500}
                disabled={!!jobId}
              />
              <p className="text-[10px] text-muted-foreground">Recomendado: 3000–5000ms para evitar bloqueios</p>
            </div>

            {!jobId ? (
              <Button
                className="w-full gap-1.5"
                onClick={startBroadcast}
                disabled={launching || !contacts.length}
              >
                {launching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Iniciar Disparo ({contacts.length})
              </Button>
            ) : (
              <Button
                className="w-full"
                variant="outline"
                onClick={reset}
                disabled={isRunning}
              >
                {isRunning ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Disparando…</>
                ) : "Novo Disparo"}
              </Button>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── Status panel ── */}
      <div className="flex-1 flex flex-col bg-muted/10 overflow-hidden">
        {!job ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Users className="h-14 w-14 opacity-10" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">Disparo por Lista</p>
              <p className="text-xs opacity-60 max-w-xs">
                Importe um CSV ou cole números para enviar mensagens em massa via Baileys
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full p-4 gap-4">
            {/* Progress header */}
            <div className="space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {isRunning ? "Disparando…" : "Disparo concluído"}
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  {job.sent}/{job.total}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    job.status === "done" ? "bg-emerald-500" : "bg-primary"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  {job.sent - job.errors.length} enviados
                </span>
                <span className="flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-red-500" />
                  {job.errors.length} erros
                </span>
                <span className="ml-auto">{progress}%</span>
              </div>
            </div>

            {/* Contact list */}
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-medium mb-2 text-muted-foreground">
                Contatos ({contacts.length})
              </p>
              <ScrollArea className="h-full border border-border rounded-md bg-background">
                <div className="p-2 space-y-0.5">
                  {contacts.map((c, i) => {
                    const err = job.errors.find((e) => e.phone === c.phone);
                    const done = !err && i < job.sent;
                    const pending = !err && !done;
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1 rounded text-xs",
                          err && "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400",
                          done && "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400",
                          pending && "text-muted-foreground"
                        )}
                      >
                        {err ? (
                          <XCircle className="h-3 w-3 shrink-0" />
                        ) : done ? (
                          <CheckCircle2 className="h-3 w-3 shrink-0" />
                        ) : (
                          <div className="h-3 w-3 rounded-full border border-current shrink-0 opacity-40" />
                        )}
                        <span className="font-mono shrink-0">{c.phone}</span>
                        {c.name && (
                          <span className="text-[10px] opacity-70 truncate">{c.name}</span>
                        )}
                        {err && (
                          <span className="ml-auto text-[10px] truncate max-w-[140px]" title={err.error}>
                            {err.error}
                          </span>
                        )}
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
