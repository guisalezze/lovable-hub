import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, ChevronLeft, Users, MessageSquare, Calendar, Play } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Session {
  session_id: string;
  display_name: string | null;
  status: string;
}

interface Campaign {
  id: string;
  session_id: string;
  name: string;
  scheduled_at: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
  whatsapp_group_targets: [{ count: number }];
}

interface GroupMessage {
  id: string;
  type: string;
  content: string | null;
  media_url: string | null;
  caption: string | null;
  order_index: number;
  delay_ms: number;
}

interface Group {
  jid: string;
  name: string;
  participants: number;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: "Agendada", className: "bg-yellow-500/20 text-yellow-600" },
  sending: { label: "Enviando", className: "bg-blue-500/20 text-blue-600" },
  sent: { label: "Enviada", className: "bg-emerald-500/20 text-emerald-600" },
  failed: { label: "Falhou", className: "bg-destructive/20 text-destructive" },
  cancelled: { label: "Cancelada", className: "bg-muted text-muted-foreground" },
};

function CampaignDetail({ campaign, onBack }: { campaign: Campaign; onBack: () => void }) {
  const qc = useQueryClient();
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [msgType, setMsgType] = useState("text");
  const [msgContent, setMsgContent] = useState("");
  const [msgMediaUrl, setMsgMediaUrl] = useState("");
  const [msgCaption, setMsgCaption] = useState("");

  const { data: messages = [] } = useQuery<GroupMessage[]>({
    queryKey: ["group-messages", campaign.id],
    queryFn: () => apiGet(`/group-campaigns/${campaign.id}/messages`),
  });

  const { data: targets = [] } = useQuery<{ id: string; group_jid: string; group_name: string; sent: boolean }[]>({
    queryKey: ["group-targets", campaign.id],
    queryFn: () => apiGet(`/group-campaigns/${campaign.id}/groups`),
  });

  const addMsg = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { type: msgType, order_index: messages.length, delay_ms: 1000 };
      if (msgType === "text") payload.content = msgContent;
      else { payload.media_url = msgMediaUrl; payload.caption = msgCaption; }
      return apiPost(`/group-campaigns/${campaign.id}/messages`, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group-messages", campaign.id] });
      toast.success("Mensagem adicionada");
      setMsgContent(""); setMsgMediaUrl(""); setMsgCaption("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMsg = useMutation({
    mutationFn: (id: string) => apiDelete(`/group-messages/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group-messages", campaign.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const data = await apiGet<Group[]>(`/sessions/${campaign.session_id}/groups`);
      setGroups(data);
      setShowAddGroup(true);
    } catch (e: any) { toast.error(e.message); }
    setLoadingGroups(false);
  };

  const addGroup = useMutation({
    mutationFn: (group: Group) => apiPost(`/group-campaigns/${campaign.id}/messages`, {
      // Adicionar target (grupo) à campanha
      group_jid: group.jid, group_name: group.name
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group-targets", campaign.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={onBack} className="gap-1"><ChevronLeft className="h-4 w-4" /> Voltar</Button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-foreground">{campaign.name}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[campaign.status]?.className}`}>
              {STATUS_BADGE[campaign.status]?.label}
            </span>
            {campaign.scheduled_at && (
              <span className="text-xs text-muted-foreground">
                {format(new Date(campaign.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Mensagens */}
      <div className="glass-card p-4 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Mensagens</h3>
        {messages.map((m, i) => (
          <div key={m.id} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
            <span className="text-xs font-mono text-muted-foreground w-4 shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <Badge variant="outline" className="text-xs mb-1">{m.type}</Badge>
              {m.content && <p className="text-sm text-foreground whitespace-pre-wrap">{m.content}</p>}
              {m.media_url && <p className="text-xs text-muted-foreground font-mono truncate">{m.media_url}</p>}
              {m.caption && <p className="text-xs text-muted-foreground">{m.caption}</p>}
            </div>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive shrink-0" onClick={() => delMsg.mutate(m.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}

        {campaign.status === "pending" && (
          <div className="border border-border rounded-lg p-3 space-y-3">
            <Select value={msgType} onValueChange={setMsgType}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Texto</SelectItem>
                <SelectItem value="image">Imagem (URL)</SelectItem>
                <SelectItem value="video">Vídeo (URL)</SelectItem>
                <SelectItem value="audio">Áudio (URL)</SelectItem>
              </SelectContent>
            </Select>
            {msgType === "text" ? (
              <Textarea value={msgContent} onChange={e => setMsgContent(e.target.value)} placeholder="Digite a mensagem..." rows={3} />
            ) : (
              <div className="space-y-2">
                <Input value={msgMediaUrl} onChange={e => setMsgMediaUrl(e.target.value)} placeholder="URL da mídia" />
                <Input value={msgCaption} onChange={e => setMsgCaption(e.target.value)} placeholder="Legenda (opcional)" />
              </div>
            )}
            <Button size="sm" onClick={() => addMsg.mutate()} disabled={addMsg.isPending} className="w-full">
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar mensagem
            </Button>
          </div>
        )}
      </div>

      {/* Grupos */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground flex items-center gap-2"><Users className="h-4 w-4" /> Grupos destino</h3>
          {campaign.status === "pending" && (
            <Button size="sm" variant="outline" onClick={loadGroups} disabled={loadingGroups}>
              {loadingGroups ? "Carregando..." : "Adicionar grupos"}
            </Button>
          )}
        </div>
        {targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum grupo adicionado</p>
        ) : (
          <div className="space-y-2">
            {targets.map(t => (
              <div key={t.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                <div className={`h-2 w-2 rounded-full ${t.sent ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                <span className="text-sm text-foreground flex-1">{t.group_name || t.group_jid}</span>
                {t.sent && <Badge variant="outline" className="text-xs text-emerald-600">Enviado</Badge>}
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddGroup && (
        <Dialog open onOpenChange={() => setShowAddGroup(false)}>
          <DialogContent className="max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Selecionar grupos</DialogTitle></DialogHeader>
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nenhum grupo encontrado na sessão</p>
            ) : (
              <div className="space-y-2">
                {groups.map(g => (
                  <button
                    key={g.jid}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 text-left transition-colors"
                    onClick={() => { addGroup.mutate(g); }}
                  >
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{g.name}</p>
                      <p className="text-xs text-muted-foreground">{g.participants} participantes</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default function GruposWAPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [name, setName] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["group-campaigns"],
    queryFn: () => apiGet("/group-campaigns"),
    refetchInterval: 15000,
  });

  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["sessions"],
    queryFn: () => apiGet("/sessions"),
  });

  const create = useMutation({
    mutationFn: () => {
      if (!name || !sessionId) throw new Error("Nome e sessão obrigatórios");
      return apiPost("/group-campaigns", { name, session_id: sessionId, scheduled_at: scheduledAt || null });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["group-campaigns"] }); toast.success("Campanha criada"); setShowCreate(false); setName(""); setSessionId(""); setScheduledAt(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/group-campaigns/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["group-campaigns"] }); toast.success("Campanha removida"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (selected) return <CampaignDetail campaign={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Campanhas de Grupo</h1>
          <p className="text-sm text-muted-foreground mt-1">Disparos agendados em grupos de WhatsApp</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2"><Plus className="h-4 w-4" /> Nova Campanha</Button>
      </div>

      {isLoading ? (
        <div className="glass-card p-12 text-center text-sm text-muted-foreground">Carregando...</div>
      ) : campaigns.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhuma campanha criada ainda</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {campaigns.map(c => {
            const cfg = STATUS_BADGE[c.status] || STATUS_BADGE.pending;
            const count = c.whatsapp_group_targets?.[0]?.count ?? 0;
            return (
              <div key={c.id} className="glass-card p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setSelected(c)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{c.name}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>{cfg.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Sessão: {c.session_id}</p>
                  {c.scheduled_at && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Calendar className="h-3 w-3" /> {format(new Date(c.scheduled_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  )}
                </div>
                <Badge variant="secondary" className="shrink-0">{count} grupo{count !== 1 ? "s" : ""}</Badge>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0"
                  onClick={e => { e.stopPropagation(); if (confirm("Remover campanha?")) del.mutate(c.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova campanha de grupo</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Lançamento Turma 5" className="mt-1" /></div>
            <div>
              <Label>Sessão WhatsApp</Label>
              <Select value={sessionId} onValueChange={setSessionId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar sessão..." /></SelectTrigger>
                <SelectContent>
                  {sessions.map(s => (
                    <SelectItem key={s.session_id} value={s.session_id}>{s.display_name || s.session_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Agendar para (opcional)</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Deixe em branco para enviar manualmente depois</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Criando..." : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
