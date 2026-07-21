import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { API_URL } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Send, MessageSquare, Loader2, Wifi, WifiOff, Plus, X, Zap, GitBranch, Tag } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { AutomacoesTab } from "@/components/whatsapp/AutomacoesTab";
import { FunilTab } from "@/components/whatsapp/FunilTab";

interface Session {
  id: string;
  session_id: string;
  display_name: string | null;
  phone_number: string | null;
  status: string;
  live_status: string;
}

interface Conversation {
  id: string;
  session_id: string;
  jid: string;
  display_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  is_group: boolean;
  tags: string[];
}

interface Message {
  id: string;
  direction: "in" | "out";
  from_name: string | null;
  type: string;
  content: string | null;
  timestamp: string;
}

function jidToDisplay(jid: string): string {
  if (jid.endsWith("@g.us")) return jid.split("@")[0];
  return "+" + jid.replace("@s.whatsapp.net", "");
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return isToday
      ? format(d, "HH:mm")
      : format(d, "dd/MM", { locale: ptBR });
  } catch {
    return "";
  }
}

const TAG_COLORS = [
  "bg-blue-100 text-blue-700", "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700", "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700", "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700", "bg-pink-100 text-pink-700",
];
function tagColor(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) % TAG_COLORS.length;
  return TAG_COLORS[h];
}

function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full", tagColor(tag))}>
      {tag}
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="hover:opacity-70 ml-0.5">
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

function ConvItem({
  conv, selected, onClick,
}: {
  conv: Conversation; selected: boolean; onClick: () => void;
}) {
  const name = conv.display_name || jidToDisplay(conv.jid);
  const initial = name[0]?.toUpperCase() || "?";
  const tags = conv.tags || [];

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left border-b border-border/40",
        selected && "bg-muted"
      )}
    >
      <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0 text-primary font-semibold text-sm">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="font-medium text-sm text-foreground truncate">{name}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {formatTime(conv.last_message_at)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.last_message || ""}</p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {tags.slice(0, 3).map((t) => <TagChip key={t} tag={t} />)}
            {tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{tags.length - 3}</span>}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Tag editor (inline no header do chat) ────────────────────────────────────
function TagEditor({
  conv, sessionId, allTags, onUpdate,
}: {
  conv: Conversation; sessionId: string; allTags: string[]; onUpdate: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tags = conv.tags || [];

  async function saveTags(next: string[]) {
    try {
      await fetch(`${API_URL}/sessions/${sessionId}/conversations/${encodeURIComponent(conv.jid)}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: next }),
      });
      onUpdate(next);
    } catch (e: any) { toast.error(e.message); }
  }

  function addTag(tag: string) {
    const t = tag.trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    saveTags([...tags, t]);
    setInput("");
  }

  function removeTag(tag: string) { saveTags(tags.filter((t) => t !== tag)); }

  const suggestions = allTags.filter((t) => !tags.includes(t) && t.includes(input.toLowerCase()));

  return (
    <div className="relative">
      <div
        className="flex flex-wrap items-center gap-1 cursor-pointer"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
      >
        {tags.map((t) => <TagChip key={t} tag={t} onRemove={() => removeTag(t)} />)}
        <button className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1">
          <Tag className="h-2.5 w-2.5" />
          {tags.length === 0 ? "Adicionar tag" : ""}
        </button>
      </div>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 bg-background border border-border rounded-lg shadow-lg p-2 min-w-[200px]">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(input); }
              if (e.key === "Escape") setOpen(false);
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Nova tag… (Enter para adicionar)"
            className="w-full text-xs border border-border rounded px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-primary"
          />
          {suggestions.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {suggestions.slice(0, 6).map((t) => (
                <button
                  key={t}
                  onMouseDown={() => addTag(t)}
                  className="w-full text-left px-2 py-0.5 rounded hover:bg-muted text-xs flex items-center gap-1.5"
                >
                  <TagChip tag={t} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MsgBubble({ msg }: { msg: Message }) {
  const isOut = msg.direction === "out";
  const time = format(new Date(msg.timestamp), "HH:mm");

  const icon =
    msg.type === "image"
      ? "🖼 "
      : msg.type === "video"
      ? "🎥 "
      : msg.type === "audio"
      ? "🎵 "
      : msg.type === "document"
      ? "📄 "
      : msg.type === "sticker"
      ? "🎭 "
      : "";

  return (
    <div className={cn("flex mb-1.5", isOut ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[72%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          isOut
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-background text-foreground rounded-bl-sm border border-border/60"
        )}
      >
        {msg.from_name && !isOut && (
          <p className="text-[10px] font-semibold text-primary mb-0.5">
            {msg.from_name}
          </p>
        )}
        <p className="leading-relaxed whitespace-pre-wrap break-words">
          {icon}
          {msg.content}
        </p>
        <p
          className={cn(
            "text-[10px] mt-1 text-right",
            isOut ? "text-primary-foreground/60" : "text-muted-foreground"
          )}
        >
          {time}
        </p>
      </div>
    </div>
  );
}

export default function WhatsAppBaileysInboxPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"conversas" | "automacoes" | "funil">("conversas");
  const [selectedSession, setSelectedSession] = useState<string>("");
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [showNewConv, setShowNewConv] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["sessions"],
    queryFn: () => apiGet("/sessions"),
    refetchInterval: 15000,
  });

  // Auto-seleciona primeira sessão conectada
  useEffect(() => {
    if (!selectedSession && sessions.length > 0) {
      const connected =
        sessions.find((s) => s.live_status === "connected" || s.status === "connected") ||
        sessions[0];
      setSelectedSession(connected.session_id);
    }
  }, [sessions, selectedSession]);

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["baileys-conversations", selectedSession],
    queryFn: () => apiGet(`/sessions/${selectedSession}/conversations`),
    enabled: !!selectedSession,
    refetchInterval: 4000,
  });

  const { data: messages = [], isFetching: loadingMessages } = useQuery<Message[]>({
    queryKey: ["baileys-messages", selectedSession, selectedConv?.jid],
    queryFn: () =>
      apiGet(
        `/sessions/${selectedSession}/conversations/${encodeURIComponent(selectedConv!.jid)}/messages`
      ),
    enabled: !!selectedSession && !!selectedConv?.jid,
    refetchInterval: 2500,
  });

  // Realtime via Supabase
  useEffect(() => {
    const ch = supabase
      .channel("baileys-inbox-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "baileys_messages" },
        () => {
          qc.invalidateQueries({ queryKey: ["baileys-messages"] });
          qc.invalidateQueries({ queryKey: ["baileys-conversations"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "baileys_conversations" },
        () => {
          qc.invalidateQueries({ queryKey: ["baileys-conversations"] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Scroll para o final quando chegam novas mensagens
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focar no input ao abrir conversa
  useEffect(() => {
    if (selectedConv) setTimeout(() => inputRef.current?.focus(), 100);
  }, [selectedConv?.jid]);

  const handleSend = async () => {
    const text = message.trim();
    if (!text || !selectedConv || !selectedSession) return;
    setSending(true);
    try {
      await apiPost(`/sessions/${selectedSession}/send`, {
        jid: selectedConv.jid,
        type: "text",
        content: text,
      });
      setMessage("");
      qc.invalidateQueries({ queryKey: ["baileys-messages"] });
      qc.invalidateQueries({ queryKey: ["baileys-conversations"] });
    } catch (e: any) {
      toast.error("Erro ao enviar: " + e.message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleNewConv = () => {
    if (!newPhone.trim()) return;
    const digits = newPhone.replace(/\D/g, "");
    const phone = digits.length === 10 || digits.length === 11 ? "55" + digits : digits;
    const jid = phone + "@s.whatsapp.net";
    setSelectedConv({
      id: "",
      session_id: selectedSession,
      jid,
      display_name: newPhone,
      last_message: null,
      last_message_at: null,
      is_group: false,
    });
    setNewPhone("");
    setShowNewConv(false);
  };

  const allTags = Array.from(new Set(conversations.flatMap((c) => c.tags || []))).sort();

  const filteredConvs = conversations.filter((c) => {
    if (tagFilter && !(c.tags || []).includes(tagFilter)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (c.display_name || "").toLowerCase().includes(q) ||
      c.jid.includes(q) ||
      jidToDisplay(c.jid).includes(q)
    );
  });

  function updateConvTags(jid: string, tags: string[]) {
    qc.setQueryData<Conversation[]>(["baileys-conversations", selectedSession], (prev) =>
      (prev || []).map((c) => c.jid === jid ? { ...c, tags } : c)
    );
    if (selectedConv?.jid === jid) setSelectedConv((c) => c ? { ...c, tags } : c);
  }

  const activeSession = sessions.find((s) => s.session_id === selectedSession);
  const isConnected =
    activeSession?.live_status === "connected" || activeSession?.status === "connected";
  const selectedName =
    selectedConv?.display_name || (selectedConv ? jidToDisplay(selectedConv.jid) : "");

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[500px] -mx-3 sm:-mx-4 md:-mx-6 border border-border rounded-lg overflow-hidden">
      {/* ── Tab bar ── */}
      <div className="flex border-b border-border bg-background shrink-0">
        <button
          onClick={() => setActiveTab("conversas")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors",
            activeTab === "conversas"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Conversas
        </button>
        <button
          onClick={() => setActiveTab("automacoes")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors",
            activeTab === "automacoes"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Zap className="h-3.5 w-3.5" />
          Automações
        </button>
        <button
          onClick={() => setActiveTab("funil")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors",
            activeTab === "funil"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <GitBranch className="h-3.5 w-3.5" />
          Funil
        </button>
      </div>

      {/* ── Tab content ── */}
      {activeTab === "funil" ? (
        <div className="flex-1 overflow-hidden">
          <FunilTab sessions={sessions} />
        </div>
      ) : activeTab === "automacoes" ? (
        <div className="flex-1 overflow-hidden">
          <AutomacoesTab sessions={sessions} />
        </div>
      ) : (
      <div className="flex flex-1 overflow-hidden">
      {/* ── Painel esquerdo: sessão + conversas ── */}
      <div className="w-72 md:w-80 flex flex-col border-r border-border bg-background shrink-0">
        {/* Header */}
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Inbox WhatsApp</h2>
            {activeSession && (
              <div
                className={cn(
                  "flex items-center gap-1 text-[10px] font-medium",
                  isConnected ? "text-emerald-600" : "text-muted-foreground"
                )}
              >
                {isConnected ? (
                  <Wifi className="h-3 w-3" />
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
                {isConnected ? "Conectado" : "Desconectado"}
              </div>
            )}
          </div>

          {sessions.length > 1 && (
            <Select value={selectedSession} onValueChange={setSelectedSession}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecionar sessão" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((s) => (
                  <SelectItem key={s.session_id} value={s.session_id}>
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          s.live_status === "connected" || s.status === "connected"
                            ? "bg-emerald-500"
                            : "bg-muted-foreground"
                        )}
                      />
                      {s.display_name || s.session_id}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Nova conversa */}
          {!showNewConv ? (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs gap-1"
              onClick={() => setShowNewConv(true)}
            >
              <Plus className="h-3 w-3" /> Nova conversa
            </Button>
          ) : (
            <div className="flex gap-1">
              <Input
                className="h-7 text-xs flex-1"
                placeholder="Número (ex: 11999999999)"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNewConv();
                  if (e.key === "Escape") setShowNewConv(false);
                }}
                autoFocus
              />
              <Button size="sm" className="h-7 px-2 shrink-0" onClick={handleNewConv}>
                ✓
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => setShowNewConv(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {/* Busca */}
        <div className="px-3 pb-2 space-y-1.5">
          <Input
            placeholder="Buscar número ou nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
          />
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTagFilter(tagFilter === t ? null : t)}
                  className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded-full border transition-colors",
                    tagFilter === t
                      ? "border-primary bg-primary text-primary-foreground"
                      : cn("border-transparent", tagColor(t))
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lista de conversas */}
        <ScrollArea className="flex-1">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground space-y-2">
              <MessageSquare className="h-8 w-8 mx-auto opacity-30" />
              <p>Nenhuma conversa ainda.</p>
              <p className="text-[10px]">
                Mensagens recebidas ou enviadas pelo número conectado aparecerão aqui.
              </p>
            </div>
          ) : filteredConvs.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Nenhum resultado para &ldquo;{search}&rdquo;
            </div>
          ) : (
            filteredConvs.map((conv) => (
              <ConvItem
                key={conv.id || conv.jid}
                conv={conv}
                selected={selectedConv?.jid === conv.jid}
                onClick={() => setSelectedConv(conv)}
              />
            ))
          )}
        </ScrollArea>
      </div>

      {/* ── Painel direito: conversa ── */}
      <div className="flex-1 flex flex-col bg-muted/10 min-w-0">
        {selectedConv ? (
          <>
            {/* Header da conversa */}
            <div className="px-4 py-3 border-b border-border bg-background flex items-center gap-3 shrink-0">
              <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                {selectedName[0]?.toUpperCase() || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm text-foreground truncate">{selectedName}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {jidToDisplay(selectedConv.jid)}
                </p>
                <TagEditor
                  conv={selectedConv}
                  sessionId={selectedSession}
                  allTags={allTags}
                  onUpdate={(tags) => updateConvTags(selectedConv.jid, tags)}
                />
              </div>
            </div>

            {/* Mensagens */}
            <ScrollArea className="flex-1 px-4 py-3">
              {loadingMessages && messages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  Nenhuma mensagem ainda. Escreva algo abaixo.
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <MsgBubble key={msg.id} msg={msg} />
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </ScrollArea>

            {/* Input de envio */}
            <div className="p-3 border-t border-border bg-background shrink-0">
              {!isConnected ? (
                <div className="text-xs text-center text-yellow-600 dark:text-yellow-400 py-1">
                  ⚠️ Sessão desconectada — vá em{" "}
                  <a href="/whatsapp-canais" className="underline">
                    WA Canais
                  </a>{" "}
                  para reconectar.
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    ref={inputRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Digite uma mensagem... (Enter para enviar)"
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    disabled={sending}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!message.trim() || sending}
                    size="icon"
                    className="shrink-0"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <MessageSquare className="h-12 w-12 opacity-15" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">Selecione uma conversa</p>
              <p className="text-xs opacity-60">
                ou clique em "Nova conversa" para iniciar
              </p>
            </div>
          </div>
        )}
      </div>
      </div>
      )}
    </div>
  );
}
