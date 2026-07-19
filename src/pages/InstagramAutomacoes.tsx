import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Instagram, Plus, Pencil, Trash2, Zap, MessageCircle, Clock, Link2, RefreshCw } from "lucide-react";

const SUPABASE_URL = "https://lqrlvefeznfaauwgvubl.supabase.co";
const OAUTH_URL = `${SUPABASE_URL}/functions/v1/instagram-oauth`;

interface IgConfig {
  id: string;
  instagram_user_id: string;
  username: string;
  name: string;
  profile_picture_url: string;
  token_expires_at: string;
}

interface Automation {
  id: string;
  name: string;
  active: boolean;
  triggers: string[];
  keywords: string[];
  match_type: string;
  post_id: string | null;
  public_replies: string[] | null;
  welcome_dm: string | null;
  quick_reply_label: string | null;
  link_text: string | null;
  link_button_label: string | null;
  link_url: string | null;
  reminder_text: string | null;
  reminder_delay_minutes: number;
  created_at: string;
}

const emptyForm = (): Partial<Automation> => ({
  name: "",
  active: true,
  triggers: ["comment"],
  keywords: [],
  match_type: "contains",
  post_id: "",
  public_replies: [],
  welcome_dm: "",
  quick_reply_label: "",
  link_text: "",
  link_button_label: "",
  link_url: "",
  reminder_text: "",
  reminder_delay_minutes: 60,
});

function triggerLabel(t: string) {
  const map: Record<string, string> = { comment: "Comentário", story_reply: "Story", dm: "DM" };
  return map[t] ?? t;
}

function AutomationDialog({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Automation;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<Automation>>(initial ?? emptyForm());
  const [keywordsInput, setKeywordsInput] = useState((initial?.keywords ?? []).join(", "));
  const [publicRepliesInput, setPublicRepliesInput] = useState(
    (initial?.public_replies ?? []).join("\n")
  );

  useEffect(() => {
    setForm(initial ?? emptyForm());
    setKeywordsInput((initial?.keywords ?? []).join(", "));
    setPublicRepliesInput((initial?.public_replies ?? []).join("\n"));
  }, [initial, open]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        keywords: keywordsInput
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        public_replies: publicRepliesInput
          .split("\n")
          .map((r) => r.trim())
          .filter(Boolean),
      };
      if (initial?.id) {
        const { error } = await supabase
          .from("ig_automations")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ig_automations").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ig_automations"] });
      toast.success(initial ? "Automação atualizada" : "Automação criada");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleTrigger = (t: string) => {
    const current = form.triggers ?? [];
    setForm((f) => ({
      ...f,
      triggers: current.includes(t) ? current.filter((x) => x !== t) : [...current, t],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar automação" : "Nova automação"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input
              value={form.name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Link na bio"
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={form.active ?? true}
              onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
            />
            <Label>Ativa</Label>
          </div>

          <div>
            <Label className="mb-1 block">Gatilhos</Label>
            <div className="flex gap-2 flex-wrap">
              {["comment", "story_reply", "dm"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTrigger(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    (form.triggers ?? []).includes(t)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary"
                  }`}
                >
                  {triggerLabel(t)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Palavras-chave (separadas por vírgula)</Label>
            <Input
              value={keywordsInput}
              onChange={(e) => setKeywordsInput(e.target.value)}
              placeholder="link, quero, info"
            />
          </div>

          <div>
            <Label>Tipo de correspondência</Label>
            <Select
              value={form.match_type ?? "contains"}
              onValueChange={(v) => setForm((f) => ({ ...f, match_type: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">Contém</SelectItem>
                <SelectItem value="exact">Exato</SelectItem>
                <SelectItem value="any">Qualquer comentário</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Post específico (ID opcional)</Label>
            <Input
              value={form.post_id ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, post_id: e.target.value }))}
              placeholder="Deixe em branco para todos os posts"
            />
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-semibold mb-2 flex items-center gap-1">
              <MessageCircle className="h-4 w-4" /> DM de boas-vindas
            </p>
            <Textarea
              value={form.welcome_dm ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, welcome_dm: e.target.value }))}
              placeholder="Oi! Aqui está o que você pediu 👇"
              rows={2}
            />
            <Label className="mt-2 block">Botão de resposta rápida (label)</Label>
            <Input
              value={form.quick_reply_label ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, quick_reply_label: e.target.value }))}
              placeholder="Quero o link!"
            />
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-semibold mb-2 flex items-center gap-1">
              <Link2 className="h-4 w-4" /> Link (enviado após o botão)
            </p>
            <Label>Texto da mensagem</Label>
            <Input
              value={form.link_text ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, link_text: e.target.value }))}
              placeholder="Aqui está o seu link exclusivo!"
            />
            <Label className="mt-2 block">Label do botão</Label>
            <Input
              value={form.link_button_label ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, link_button_label: e.target.value }))}
              placeholder="Acessar agora"
            />
            <Label className="mt-2 block">URL</Label>
            <Input
              value={form.link_url ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
              placeholder="https://..."
            />
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-semibold mb-2 flex items-center gap-1">
              <Clock className="h-4 w-4" /> Lembrete
            </p>
            <Textarea
              value={form.reminder_text ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, reminder_text: e.target.value }))}
              placeholder="Oi! Você viu o link que te mandei? 😊"
              rows={2}
            />
            <Label className="mt-2 block">Atraso (minutos)</Label>
            <Input
              type="number"
              value={form.reminder_delay_minutes ?? 60}
              onChange={(e) =>
                setForm((f) => ({ ...f, reminder_delay_minutes: Number(e.target.value) }))
              }
            />
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-semibold mb-2">Respostas públicas (variações, uma por linha)</p>
            <Textarea
              value={publicRepliesInput}
              onChange={(e) => setPublicRepliesInput(e.target.value)}
              placeholder={"Te mandei no direct! 📩\nVerifica sua DM 😉"}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !form.name}>
            {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InstagramAutomacoes() {
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | undefined>();

  useEffect(() => {
    if (searchParams.get("connected") === "1") {
      toast.success("Instagram conectado com sucesso!");
      qc.invalidateQueries({ queryKey: ["ig_config"] });
    }
    if (searchParams.get("error")) {
      toast.error(`Erro ao conectar: ${searchParams.get("error")}`);
    }
  }, [searchParams, qc]);

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["ig_config"],
    queryFn: async () => {
      const { data } = await supabase.from("ig_config").select("*").limit(1).maybeSingle();
      return data as IgConfig | null;
    },
  });

  const { data: automations = [], isLoading: autoLoading } = useQuery({
    queryKey: ["ig_automations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ig_automations")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []) as Automation[];
    },
  });

  const { data: queueStats } = useQuery({
    queryKey: ["ig_queue_stats"],
    queryFn: async () => {
      const { data } = await supabase.from("ig_queue").select("status");
      const counts: Record<string, number> = {};
      for (const row of data ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1;
      return counts;
    },
    refetchInterval: 10000,
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await supabase.from("ig_automations").update({ active, updated_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ig_automations"] }),
  });

  const deleteAuto = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("ig_automations").delete().eq("id", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ig_automations"] });
      toast.success("Automação removida");
    },
  });

  const expiresAt = config?.token_expires_at
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(config.token_expires_at))
    : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Instagram className="h-6 w-6 text-pink-500" />
          <h1 className="text-xl font-bold">Instagram Automações</h1>
        </div>
        {config && (
          <Button onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nova automação
          </Button>
        )}
      </div>

      {/* Conta conectada */}
      <div className="rounded-xl border border-border p-4">
        {configLoading ? (
          <div className="h-12 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
            <div className="space-y-1.5">
              <div className="h-3 w-32 bg-muted animate-pulse rounded" />
              <div className="h-3 w-24 bg-muted animate-pulse rounded" />
            </div>
          </div>
        ) : config ? (
          <div className="flex items-center gap-3">
            {config.profile_picture_url ? (
              <img
                src={config.profile_picture_url}
                alt={config.username}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                <Instagram className="h-5 w-5 text-white" />
              </div>
            )}
            <div>
              <p className="font-semibold text-sm">@{config.username}</p>
              <p className="text-xs text-muted-foreground">Token válido até {expiresAt}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge variant="outline" className="text-emerald-600 border-emerald-500/40 bg-emerald-500/10">
                Conectado
              </Badge>
              <Button size="sm" variant="ghost" asChild>
                <a href={OAUTH_URL} title="Reconectar">
                  <RefreshCw className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <Instagram className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-semibold">Nenhuma conta conectada</p>
              <p className="text-sm text-muted-foreground">
                Conecte seu Instagram profissional para começar a automatizar
              </p>
            </div>
            <Button asChild className="mt-1">
              <a href={OAUTH_URL}>
                <Instagram className="h-4 w-4 mr-2" /> Conectar Instagram
              </a>
            </Button>
          </div>
        )}
      </div>

      {/* Stats da fila */}
      {config && queueStats && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Pendentes", key: "pending", color: "text-yellow-600" },
            { label: "Enviados", key: "sent", color: "text-emerald-600" },
            { label: "Falhas", key: "failed", color: "text-destructive" },
            { label: "Enviando", key: "sending", color: "text-blue-600" },
          ].map(({ label, key, color }) => (
            <div key={key} className="rounded-lg border border-border p-3 text-center">
              <p className={`text-2xl font-bold ${color}`}>{queueStats[key] ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Lista de automações */}
      {config && (
        <div className="space-y-3">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
            Automações ({automations.length})
          </h2>
          {autoLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 rounded-xl border border-border bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : automations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Zap className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Nenhuma automação ainda</p>
              <Button
                size="sm"
                className="mt-3"
                onClick={() => { setEditing(undefined); setDialogOpen(true); }}
              >
                <Plus className="h-4 w-4 mr-1" /> Criar primeira automação
              </Button>
            </div>
          ) : (
            automations.map((auto) => (
              <div
                key={auto.id}
                className="rounded-xl border border-border p-4 flex items-start gap-3 hover:bg-muted/20 transition-colors"
              >
                <Switch
                  checked={auto.active}
                  onCheckedChange={(v) => toggleActive.mutate({ id: auto.id, active: v })}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{auto.name}</p>
                    {auto.triggers.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">
                        {triggerLabel(t)}
                      </Badge>
                    ))}
                    {!auto.active && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Pausada
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {auto.match_type === "any"
                      ? "Qualquer comentário"
                      : `Palavras: ${(auto.keywords ?? []).join(", ")}`}
                    {auto.link_url && (
                      <span className="ml-2 text-blue-500">{auto.link_url}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => { setEditing(auto); setDialogOpen(true); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Remover "${auto.name}"?`)) deleteAuto.mutate(auto.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <AutomationDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(undefined); }}
        initial={editing}
      />
    </div>
  );
}
