import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { igAdmin, type IgConversation } from "@/lib/instagramAdmin";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, ArrowLeft, MessageCircle, RefreshCw, Send } from "lucide-react";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const OUTSIDE_WINDOW = "Fora da janela de 24 h: a pessoa precisa mandar mensagem primeiro";

// A Meta manda "2024-05-01T12:34:56+0000" (sem ":" no fuso); o Safari não entende esse formato.
const parseIg = (iso?: string | null) => (iso ? Date.parse(iso.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")) : NaN);

const relTime = (iso?: string | null) => {
  const t = parseIg(iso);
  if (!Number.isFinite(t)) return "";
  return formatDistanceToNow(new Date(t), { addSuffix: true, locale: ptBR });
};

const fullTime = (iso?: string | null) => {
  const t = parseIg(iso);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(t));
};

const userLabel = (c: IgConversation) =>
  c.username ? `@${c.username}` : c.participant_id ? `ID ${c.participant_id}` : "Pessoa";

export default function InboxSection() {
  const [selected, setSelected] = useState<IgConversation | null>(null);

  const convQ = useQuery({
    queryKey: ["ig_conversations"],
    staleTime: 30_000,
    retry: false,
    queryFn: igAdmin.conversations,
  });

  if (selected) return <Thread conversation={selected} onBack={() => setSelected(null)} />;

  const list = convQ.data ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-semibold">Conversas</h2>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => convQ.refetch()}
          disabled={convQ.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${convQ.isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <div className="rounded-xl border border-border divide-y divide-border">
        {convQ.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-muted animate-pulse" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                <div className="h-3 w-48 bg-muted animate-pulse rounded" />
              </div>
            </div>
          ))
        ) : convQ.error ? (
          <p className="p-4 text-sm text-destructive">
            Não foi possível carregar as conversas: {(convQ.error as Error).message}
          </p>
        ) : list.length === 0 ? (
          <p className="p-6 text-sm text-center text-muted-foreground">Nenhuma conversa encontrada.</p>
        ) : (
          list.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c)}
              className="w-full text-left p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors"
            >
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                {(c.username ?? "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{userLabel(c)}</span>
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">{relTime(c.updated_at)}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{c.last_message || " "}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function Thread({ conversation, onBack }: { conversation: IgConversation; onBack: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  const msgQ = useQuery({
    queryKey: ["ig_messages", conversation.id],
    staleTime: 15_000,
    retry: false,
    queryFn: () => igAdmin.messages(conversation.id),
  });

  // A função já devolve antiga → nova; ordena de novo por segurança.
  const ordered = useMemo(
    () => [...(msgQ.data ?? [])].sort((a, b) => (parseIg(a.created_at) || 0) - (parseIg(b.created_at) || 0)),
    [msgQ.data],
  );

  // Janela de 24 h conta a partir da última mensagem da pessoa.
  const lastFromPerson = useMemo(() => {
    for (let i = ordered.length - 1; i >= 0; i--) if (!ordered[i].from_me) return ordered[i];
    return undefined;
  }, [ordered]);
  const lastAt = parseIg(lastFromPerson?.created_at);
  const insideWindow = Number.isFinite(lastAt) && Date.now() - lastAt <= WINDOW_MS;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [ordered.length]);

  const send = async () => {
    const t = text.trim();
    // Cada envio usa uma chave de idempotência nova: não pode haver dois ao mesmo tempo.
    if (!t || !insideWindow || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      await igAdmin.reply(conversation.id, t);
      setText("");
      toast.success("Mensagem enviada.");
      await msgQ.refetch();
      qc.invalidateQueries({ queryKey: ["ig_conversations"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Conversas
        </Button>
        <h2 className="font-semibold truncate">{userLabel(conversation)}</h2>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => msgQ.refetch()}
          disabled={msgQ.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${msgQ.isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <div className="rounded-xl border border-border">
        <div className="h-[420px] overflow-y-auto p-3 space-y-2">
          {msgQ.isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : msgQ.error ? (
            <p className="text-sm text-destructive">
              Não foi possível carregar as mensagens: {(msgQ.error as Error).message}
            </p>
          ) : ordered.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground pt-8">Nenhuma mensagem nesta conversa.</p>
          ) : (
            ordered.map((m, i) => (
              <div key={m.id ?? i} className={`flex ${m.from_me ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                    m.from_me ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"
                  }`}
                >
                  {m.text || <span className="italic opacity-70">(mídia ou anexo)</span>}
                  <div className={`mt-1 text-[10px] ${m.from_me ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {fullTime(m.created_at)}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-border p-3 space-y-2">
          {!msgQ.isLoading && !msgQ.error && !insideWindow && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{OUTSIDE_WINDOW}.</span>
            </div>
          )}
          <div className="flex items-end gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 1000))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={insideWindow ? "Escreva uma resposta..." : "Envio indisponível fora da janela de 24 h"}
              disabled={!insideWindow || sending}
              rows={2}
              className="resize-none"
            />
            <Button onClick={send} disabled={!insideWindow || sending || !text.trim()}>
              <Send className="h-4 w-4 mr-1" /> {sending ? "Enviando..." : "Enviar"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground text-right">{text.length}/1000</p>
        </div>
      </div>
    </section>
  );
}
