import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Film, ImageIcon, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { igAdmin, type IgPost } from "@/lib/instagramAdmin";
import {
  LIMITS,
  cut,
  formToRow,
  len,
  rowToForm,
  syncTrackedLinks,
  templateForm,
  validateForm,
  type CampaignForm,
  type FormErrors,
  type PostMode,
} from "@/lib/instagramCampaign";
import DmPreview from "@/components/instagram/DmPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ---------- pedaços do formulário ----------

function Section({ n, title, hint, right, children }: { n: number; title: string; hint?: ReactNode; right?: ReactNode; children?: ReactNode }) {
  return (
    <section className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold leading-6">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {right}
      </div>
      {children && <div className="space-y-3 sm:pl-9">{children}</div>}
    </section>
  );
}

const FieldError = ({ msg }: { msg?: string }) => (msg ? <p className="text-xs text-destructive">{msg}</p> : null);

const Counter = ({ value, max }: { value: string; max: number }) => {
  const l = len(value);
  return <span className={`text-[11px] tabular-nums ${l > max ? "text-destructive" : "text-muted-foreground"}`}>{l}/{max}</span>;
};

function KeywordInput({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    for (const p of parts) {
      if (next.length >= LIMITS.keywords) break;
      if (!next.some((k) => k.toLowerCase() === p.toLowerCase())) next.push(cut(p, LIMITS.keyword));
    }
    onChange(next);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((k) => (
            <Badge key={k} variant="secondary" className="gap-1 pr-1">
              {k}
              <button
                type="button"
                aria-label={`Remover ${k}`}
                className="rounded-full p-0.5 hover:bg-background/60"
                onClick={() => onChange(value.filter((x) => x !== k))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={draft}
          disabled={disabled || value.length >= LIMITS.keywords}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          placeholder={value.length >= LIMITS.keywords ? "Limite de 10 palavras" : "Digite e aperte Enter"}
        />
        <Button type="button" variant="outline" onClick={add} disabled={disabled || !draft.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">{value.length}/{LIMITS.keywords} palavras</p>
    </div>
  );
}

const postDate = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(new Date(iso))
    : "";

const postLabelOf = (p: IgPost) =>
  cut((p.caption ?? "").replace(/\s+/g, " ").trim() || `${p.is_reel ? "Reel" : "Post"} de ${postDate(p.created_at)}`, LIMITS.postLabel);

function PostPicker({ selectedId, selectedLabel, onPick }: { selectedId: string | null; selectedLabel: string | null; onPick: (p: IgPost) => void }) {
  const postsQ = useQuery({ queryKey: ["ig_admin_posts"], staleTime: 5 * 60_000, retry: false, queryFn: igAdmin.posts });
  const posts = postsQ.data ?? [];
  const inList = posts.some((p) => p.id === selectedId);

  return (
    <div className="space-y-2">
      {selectedId && !inList && !postsQ.isLoading && (
        <p className="text-xs text-muted-foreground">
          Post atual: <span className="font-medium text-foreground">{selectedLabel || selectedId}</span> (fora dos 25 mais recentes)
        </p>
      )}
      {postsQ.isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : postsQ.error ? (
        <div className="flex items-center gap-2 text-sm text-destructive">
          Não foi possível carregar os posts: {(postsQ.error as Error).message}
          <Button size="sm" variant="outline" onClick={() => postsQ.refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Tentar de novo
          </Button>
        </div>
      ) : posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum post encontrado na conta.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {posts.map((p) => {
            const sel = p.id === selectedId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p)}
                title={p.caption ?? undefined}
                className={`group relative aspect-square overflow-hidden rounded-lg border-2 bg-muted transition ${
                  sel ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-muted-foreground/40"
                }`}
              >
                {p.thumbnail ? (
                  <img src={p.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="m-auto h-6 w-6 text-muted-foreground" />
                )}
                {p.is_reel && <Film className="absolute right-1 top-1 h-4 w-4 text-white drop-shadow" />}
                <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-left text-[10px] text-white truncate">
                  {postDate(p.created_at)} {p.caption ?? ""}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- página ----------

export default function InstagramCampanhaEditor() {
  const { id = "new" } = useParams();
  const isNew = id === "new";
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [form, setForm] = useState<CampaignForm>(() => templateForm(isNew ? params.get("modelo") : null));
  const [initial, setInitial] = useState<string>(() => JSON.stringify(form));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Só limpa o post / grava next_reel_since quando o modo muda para "próximo reel" nesta edição.
  const [switchedToNextReel, setSwitchedToNextReel] = useState(false);
  const loadedId = useRef<string | null>(null);

  const rowQ = useQuery({
    queryKey: ["ig_campaign", id],
    enabled: !isNew,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("ig_campaigns").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!isNew && rowQ.data && loadedId.current !== rowQ.data.id) {
      loadedId.current = rowQ.data.id;
      const f = rowToForm(rowQ.data);
      setForm(f);
      setInitial(JSON.stringify(f));
      setSwitchedToNextReel(false);
      setErrors({});
    }
  }, [isNew, rowQ.data]);

  const dirty = useMemo(() => JSON.stringify(form) !== initial, [form, initial]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = <K extends keyof CampaignForm>(k: K, v: CampaignForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k as string]: undefined }));
  };

  const setMode = (mode: PostMode) => {
    if (mode === form.post_mode) return;
    if (mode === "next_reel") {
      setSwitchedToNextReel(true);
      setForm((f) => ({
        ...f,
        post_mode: mode,
        post_id: null,
        post_url: null,
        post_label: null,
        next_reel_since: null, // gravado na hora de salvar
      }));
    } else {
      setSwitchedToNextReel(false);
      setForm((f) => ({ ...f, post_mode: mode }));
    }
    setErrors((e) => ({ ...e, post_id: undefined }));
  };

  const goBack = () => navigate("/instagram-automacoes");
  const onBack = () => (dirty ? setConfirmLeave(true) : goBack());

  const save = async () => {
    const errs = validateForm(form);
    setErrors(errs);
    const msgs = Object.values(errs).filter(Boolean) as string[];
    if (msgs.length > 0) {
      toast.error(`Corrija ${msgs.length === 1 ? "1 campo" : `${msgs.length} campos`} antes de salvar.`, {
        description: msgs[0],
      });
      return;
    }
    setSaving(true);
    try {
      // Modo próximo reel já salvo: não sobrescreve o post que o worker pode ter preenchido.
      const includePost = !(form.post_mode === "next_reel" && !switchedToNextReel && !isNew);
      const row = formToRow(form, includePost);
      // O "próximo reel" conta a partir do momento em que a campanha é salva.
      if (form.post_mode === "next_reel" && (switchedToNextReel || isNew)) row.next_reel_since = new Date().toISOString();
      let campaignId = id;
      if (isNew) {
        const { data, error } = await supabase.from("ig_campaigns").insert(row).select("id").single();
        if (error) throw error;
        campaignId = data.id;
      } else {
        const { error } = await supabase.from("ig_campaigns").update(row).eq("id", id);
        if (error) throw error;
      }

      let linkErr: string | null = null;
      try {
        await syncTrackedLinks(campaignId, row.link1_url ?? null, row.link2_url ?? null);
      } catch (e) {
        linkErr = (e as Error).message;
      }

      setInitial(JSON.stringify(form));
      setSwitchedToNextReel(false);
      qc.invalidateQueries({ queryKey: ["ig_campaigns"] });
      qc.invalidateQueries({ queryKey: ["ig_campaign", campaignId] });
      if (linkErr) toast.error("Campanha salva, mas os links rastreados não foram gravados.", { description: linkErr });
      else toast.success("Campanha salva.");
      if (isNew) {
        loadedId.current = null;
        navigate(`/instagram-automacoes/${campaignId}`, { replace: true });
      }
    } catch (e) {
      toast.error("Não foi possível salvar.", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  if (!isNew && rowQ.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!isNew && (rowQ.error || !rowQ.data)) {
    return (
      <div className="max-w-xl mx-auto space-y-3 text-center py-12">
        <p className="font-semibold">Campanha não encontrada</p>
        {rowQ.error && <p className="text-sm text-muted-foreground">{(rowQ.error as Error).message}</p>}
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
      </div>
    );
  }

  const hasLinks = !!form.link1_url.trim() || !!form.link2_url.trim();
  const dmMax = hasLinks ? LIMITS.dmWithButtons : LIMITS.dm;

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <h1 className="text-lg font-bold truncate">{isNew ? "Nova campanha" : form.name || "Campanha"}</h1>
        {dirty && <span className="hidden sm:inline text-xs text-amber-600">Alterações não salvas</span>}
        <Button className="ml-auto" onClick={save} disabled={saving}>
          <Save className="h-4 w-4 mr-1" /> {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4 min-w-0">
          {/* 1 */}
          <Section n={1} title="Nome e status">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="c-name">Nome</Label>
                <Counter value={form.name} max={LIMITS.name} />
              </div>
              <Input id="c-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Link do ebook" />
              <FieldError msg={errors.name} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} /> Campanha ativa
            </label>
          </Section>

          {/* 2 */}
          <Section n={2} title="Post" hint="Em qual publicação os comentários disparam a campanha.">
            <RadioGroup value={form.post_mode} onValueChange={(v) => setMode(v as PostMode)} className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["post", "Um post específico"],
                  ["any", "Qualquer post"],
                  ["next_reel", "Próximo reel"],
                ] as const
              ).map(([v, l]) => (
                <label
                  key={v}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm ${
                    form.post_mode === v ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <RadioGroupItem value={v} /> {l}
                </label>
              ))}
            </RadioGroup>
            {form.post_mode === "post" && (
              <>
                <PostPicker
                  selectedId={form.post_id}
                  selectedLabel={form.post_label}
                  onPick={(p) => {
                    setForm((f) => ({ ...f, post_id: p.id, post_url: p.permalink, post_label: postLabelOf(p) }));
                    setErrors((e) => ({ ...e, post_id: undefined }));
                  }}
                />
                <FieldError msg={errors.post_id} />
              </>
            )}
            {form.post_mode === "any" && (
              <p className="text-xs text-muted-foreground">Responde comentários em qualquer publicação da conta.</p>
            )}
            {form.post_mode === "next_reel" && (
              <p className="text-xs text-muted-foreground">
                {form.post_id && !switchedToNextReel
                  ? `Reel escolhido: ${form.post_label || form.post_id}.`
                  : "A campanha passa a valer para o primeiro reel publicado depois de salvar. Até lá ela não responde."}
              </p>
            )}
          </Section>

          {/* 3 */}
          <Section n={3} title="Palavras-chave">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.match_any} onCheckedChange={(v) => set("match_any", v)} /> Qualquer comentário
            </label>
            {(!form.match_any || form.dm_trigger) && (
              <>
                <KeywordInput value={form.keywords} onChange={(v) => set("keywords", v)} />
                <RadioGroup
                  value={form.whole_word ? "whole" : "partial"}
                  onValueChange={(v) => set("whole_word", v === "whole")}
                  className="flex flex-wrap gap-4"
                >
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="whole" /> Palavra inteira
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <RadioGroupItem value="partial" /> Parcial (contém)
                  </label>
                </RadioGroup>
              </>
            )}
            <FieldError msg={errors.keywords} />
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.dm_trigger} onCheckedChange={(v) => set("dm_trigger", v)} /> Também responder DM e
              resposta de story
            </label>
            {form.dm_trigger &&
              (form.match_any && form.keywords.length === 0 ? (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                  Sem palavras-chave, DMs e respostas de story nunca disparam: “Qualquer comentário” vale só para
                  comentários. Adicione palavras-chave para usar este gatilho.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  DMs e respostas de story só disparam quando batem uma palavra-chave; “Qualquer comentário” vale só
                  para comentários.
                </p>
              ))}
          </Section>

          {/* 4 */}
          <Section
            n={4}
            title="Resposta pública"
            hint="Responde o comentário no post. Uma variação é sorteada a cada vez; aceita {username}."
            right={<Switch checked={form.public_reply_enabled} onCheckedChange={(v) => set("public_reply_enabled", v)} />}
          >
            {form.public_reply_enabled && (
              <>
                {form.public_replies.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="flex-1 space-y-1">
                      <Textarea
                        rows={2}
                        value={r}
                        onChange={(e) => set("public_replies", form.public_replies.map((x, j) => (j === i ? e.target.value : x)))}
                        placeholder="Te mandei no direct, {username}! 📩"
                      />
                      <div className="text-right">
                        <Counter value={r} max={LIMITS.publicReply} />
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="Remover variação"
                      onClick={() => set("public_replies", form.public_replies.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {form.public_replies.length < LIMITS.publicReplies && (
                  <Button type="button" size="sm" variant="outline" onClick={() => set("public_replies", [...form.public_replies, ""])}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar variação
                  </Button>
                )}
                <FieldError msg={errors.public_replies} />
              </>
            )}
          </Section>

          {/* 5 */}
          <Section
            n={5}
            title="DM de abertura"
            hint="Primeiro manda uma mensagem com botão; o conteúdo final só chega quando a pessoa toca."
            right={<Switch checked={form.opening_enabled} onCheckedChange={(v) => set("opening_enabled", v)} />}
          >
            {form.opening_enabled && (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <Label>Mensagem</Label>
                    <Counter value={form.opening_message} max={LIMITS.opening} />
                  </div>
                  <Textarea rows={3} value={form.opening_message} onChange={(e) => set("opening_message", e.target.value)} />
                  <FieldError msg={errors.opening_message} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <Label>Texto do botão</Label>
                    <Counter value={form.opening_button} max={LIMITS.button} />
                  </div>
                  <Input value={form.opening_button} onChange={(e) => set("opening_button", e.target.value)} placeholder="Quero o link" />
                  <FieldError msg={errors.opening_button} />
                </div>
              </>
            )}
          </Section>

          {/* 6 */}
          <Section
            n={6}
            title="Pedir para seguir"
            hint="A Meta só informa se a pessoa segue depois que ela toca no botão."
            right={<Switch checked={form.require_follow} onCheckedChange={(v) => set("require_follow", v)} />}
          >
            {form.require_follow && (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <Label>Mensagem</Label>
                    <Counter value={form.follow_message} max={LIMITS.follow} />
                  </div>
                  <Textarea
                    rows={3}
                    value={form.follow_message}
                    onChange={(e) => set("follow_message", e.target.value)}
                    placeholder="Siga o perfil e toque no botão abaixo para receber 👇"
                  />
                  <FieldError msg={errors.follow_message} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <Label>Texto do botão</Label>
                    <Counter value={form.follow_button} max={LIMITS.button} />
                  </div>
                  <Input value={form.follow_button} onChange={(e) => set("follow_button", e.target.value)} />
                  <FieldError msg={errors.follow_button} />
                </div>
              </>
            )}
          </Section>

          {/* 7 */}
          <Section n={7} title="Mensagem final" hint="Aceita {username} e {link}. Com links, os botões vão abaixo da mensagem (limite 640).">
            <div className="space-y-1">
              <div className="flex justify-between">
                <Label>Mensagem</Label>
                <Counter value={form.dm_message} max={dmMax} />
              </div>
              <Textarea
                rows={4}
                value={form.dm_message}
                onChange={(e) => set("dm_message", e.target.value)}
                placeholder="Oi {username}! Aqui está o que você pediu 👇"
              />
              <FieldError msg={errors.dm_message} />
            </div>
            {([1, 2] as const).map((i) => {
              const lk = `link${i}_label` as const;
              const uk = `link${i}_url` as const;
              return (
                <div key={i} className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <Label>Botão {i}</Label>
                      <Counter value={form[lk]} max={LIMITS.button} />
                    </div>
                    <Input value={form[lk]} onChange={(e) => set(lk, e.target.value)} placeholder="Abrir link" />
                    <FieldError msg={errors[lk]} />
                  </div>
                  <div className="space-y-1">
                    <Label>URL {i}</Label>
                    <Input
                      value={form[uk]}
                      onChange={(e) => set(uk, e.target.value)}
                      placeholder="https://..."
                      inputMode="url"
                    />
                    <FieldError msg={errors[uk]} />
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-muted-foreground">Os cliques são contados por um link curto rastreado.</p>
          </Section>

          {/* 8 */}
          <Section
            n={8}
            title="Follow-up"
            hint="Uma mensagem extra algum tempo depois da mensagem final."
            right={<Switch checked={form.followup_enabled} onCheckedChange={(v) => set("followup_enabled", v)} />}
          >
            {form.followup_enabled && (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <Label>Mensagem</Label>
                    <Counter value={form.followup_message} max={LIMITS.followup} />
                  </div>
                  <Textarea rows={3} value={form.followup_message} onChange={(e) => set("followup_message", e.target.value)} />
                  <FieldError msg={errors.followup_message} />
                </div>
                <div className="space-y-1 max-w-[220px]">
                  <Label>Atraso (minutos)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={LIMITS.delayMax}
                    step={1}
                    value={Number.isFinite(form.followup_delay_min) ? form.followup_delay_min : ""}
                    onChange={(e) => set("followup_delay_min", e.target.value === "" ? NaN : Number(e.target.value))}
                  />
                  <p className="text-[11px] text-muted-foreground">De 0 a 1440 (24 h). Fora da janela de 24 h o envio falha.</p>
                  <FieldError msg={errors.followup_delay_min} />
                </div>
              </>
            )}
          </Section>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start space-y-2">
          <p className="text-sm font-medium">Prévia</p>
          <DmPreview form={form} />
        </aside>
      </div>

      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
            <AlertDialogDescription>As alterações feitas nesta campanha serão perdidas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction onClick={goBack}>Sair sem salvar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
