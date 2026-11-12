import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, ArrowLeft, MessageCircle, RefreshCw, Send } from "lucide-react";

interface IgUser {
  id?: string;
  username?: string;
}
interface IgMessage {
  id?: string;
  message?: string;
  created_time?: string;
  from?: IgUser;
}
interface IgConversation {
  id: string;
  updated_time?: string;
  participants?: { data?: IgUser[] };
  messages?: { data?: IgMessage[] };
}
interface Account {
  id: string;
  username: string | null;
}
interface ConversationsResp {
  account: Account;
  conversations: IgConversation[];
  details_unavailable: boolean;
}
interface MessagesResp {
  account: Account;
  id: string;
  participants: IgUser[];
  messages: IgMessage[];
}

const WINDOW_MS = 24 * 60 * 60 * 1000;
const OUTSIDE_WINDOW = "Fora da janela de 24 h: a pessoa precisa mandar mensagem primeiro";

// erros 4xx/5xx da função trazem a mensagem no corpo da resposta
async function invokeAdmin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("instagram-admin", { body });
  if (error) {
    let msg = error.message;
    try {
      const j = await (error as { context?: Response }).context?.json();
      if (j?.error) msg = j.error;
    } catch {
      /* mantém a mensagem padrão */
    }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

const isOwn = (u: IgUser | undefined, acc: Account | undefined) =>
  !!u && !!acc && ((!!acc.id && u.id === acc.id) || (!!acc.username && u.username === acc.username));

const otherOf = (parts: IgUser[] | undefined, acc: Account | undefined): IgUser | undefined =>
  (parts ?? []).find((p) => !isOwn(p, acc));

const relTime = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
};

const fullTime = (iso?: string) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "";

const userLabel = (u: IgUser | undefined) => (u?.username ? `@${u.username}` : u?.id ? `ID ${u.id}` : "Pessoa");

export default function InboxSection() {
  const [selected, setSelected] = useState<IgConversation | null>(null);

  const convQ = useQuery({
    queryKey: ["ig_conversations"],
    staleTime: 30_000,
    retry: false,
    queryFn: () => invokeAdmin<ConversationsResp>({ action: "conversations" }),
  });

  if (selected) {
    return (
      <Thread
        conversation={selected}
        account={convQ.data?.account}
        onBack={() => setSelected(null)}
      />
    );
  }

  const list = convQ.data?.conversations ?? [];
  const account = convQ.data?.account;

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

      {convQ.data?.details_unavailable && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Detalhes indisponíveis: o Instagram não devolveu participantes e última mensagem. Abra a conversa para ver as
            mensagens.
          </span>
        </div>
      )}

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
          list.map((c) => {
            const other = otherOf(c.participants?.data, account);
            const last = c.messages?.data?.[0];
            const lastOwn = isOwn(last?.from, account);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c)}
                className="w-full text-left p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors"
              >
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                  {(other?.username ?? "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {other ? userLabel(other) : convQ.data?.details_unavailable ? "Conversa" : "Pessoa"}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">
                      {relTime(last?.created_time ?? c.updated_time)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {last ? `${lastOwn ? "Você: " : ""}${last.message || "(mídia ou anexo)"}` : " "}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

function Thread({
  conversation,
  account: accountFromList,
  onBack,
}: {
  conversation: IgConversation;
  account: Account | undefined;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const msgQ = useQuery({
    queryKey: ["ig_messages", conversation.id],
    staleTime: 15_000,
    retry: false,
    queryFn: () => invokeAdmin<MessagesResp>({ action: "messages", conversation_id: conversation.id }),
  });

  const account = msgQ.data?.account ?? accountFromList;
  const other =
    otherOf(msgQ.data?.participants, account) ??
    otherOf(conversation.participants?.data, account) ??
    (msgQ.data?.messages ?? []).map((m) => m.from).find((u) => u && !isOwn(u, account));

  // Graph devolve mais nova primeiro; mostra da mais antiga para a mais nova
  const ordered = useMemo(
    () =>
      [...(msgQ.data?.messages ?? [])].sort(
        (a, b) => Date.parse(a.created_time ?? "") - Date.parse(b.created_time ?? ""),
      ),
    [msgQ.data],
  );

  const lastFromPerson = useMemo(() => {
    for (let i = ordered.length - 1; i >= 0; i--) if (!isOwn(ordered[i].from, account)) return ordered[i];
    return undefined;
  }, [ordered, account]);
  const lastAt = lastFromPerson?.created_time ? Date.parse(lastFromPerson.created_time) : NaN;
  const insideWindow = Number.isFinite(lastAt) && Date.now() - lastAt <= WINDOW_MS;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [ordered.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || !other?.id || !insideWindow) return;
    setSending(true);
    try {
      await invokeAdmin<{ ok: boolean }>({
        action: "reply",
        recipient_id: other.id,
        conversation_id: conversation.id,
        text: t,
      });
      setText("");
      toast.success("Mensagem enviada.");
      await msgQ.refetch();
      qc.invalidateQueries({ queryKey: ["ig_conversations"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Conversas
        </Button>
        <h2 className="font-semibold truncate">{userLabel(other)}</h2>
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
            ordered.map((m, i) => {
              const own = isOwn(m.from, account);
              return (
                <div key={m.id ?? i} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                      own ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"
                    }`}
                  >
                    {m.message || <span className="italic opacity-70">(mídia ou anexo)</span>}
                    <div className={`mt-1 text-[10px] ${own ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {fullTime(m.created_time)}
                    </div>
                  </div>
                </div>
              );
            })
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
              disabled={!insideWindow || sending || !other?.id}
              rows={2}
              className="resize-none"
            />
            <Button onClick={send} disabled={!insideWindow || sending || !text.trim() || !other?.id}>
              <Send className="h-4 w-4 mr-1" /> {sending ? "Enviando..." : "Enviar"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground text-right">{text.length}/1000</p>
        </div>
      </div>
    </section>
  );
}
