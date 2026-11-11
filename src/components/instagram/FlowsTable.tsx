import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Pencil, Pause, Play, Share2, Trash2, Zap } from "lucide-react";
import { TRIGGER_LABEL, countBlocks, newFlow, validateRule, type Flow, type IgRule } from "@/lib/instagramFlow";
import type { Json } from "@/integrations/supabase/types";

export function useIgRules() {
  return useQuery({
    queryKey: ["ig_automations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ig_automations")
        .select("*")
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as IgRule[];
    },
  });
}

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Slug aleatório base62 (sem viés: descarta bytes >= 248). */
function randomSlug(len = 10) {
  let out = "";
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len * 2))) {
      if (b < 248 && out.length < len) out += B62[b % 62];
    }
  }
  return out;
}

function when(r: IgRule) {
  const t = TRIGGER_LABEL[r.trigger] ?? r.trigger;
  if (r.trigger !== "comment") return t;
  if (r.pending_next_reel) return `${t} · próximo reel (aguardando)`;
  return r.post_id ? `${t} · só no post: ${r.media_label || r.post_id}` : `${t} · em qualquer post`;
}

export default function FlowsTable() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: rules = [], isLoading } = useIgRules();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["ig_automations"] });

  const create = useMutation({
    mutationFn: async () => {
      const position = rules.reduce((m, r) => Math.max(m, r.position ?? 0), 0) + 1;
      const { data, error } = await supabase
        .from("ig_automations")
        .insert({
          name: "Novo fluxo",
          trigger: "comment",
          flow: newFlow() as unknown as Json,
          active: false,
          position,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      refresh();
      navigate(`/instagram-automacoes/${id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      if (active) {
        const r = rules.find((x) => x.id === id);
        if (r) {
          const { errors } = validateRule({
            name: r.name,
            trigger: r.trigger,
            keywords: r.keywords,
            match_type: r.match_type,
            post_id: r.post_id,
            media_label: r.media_label,
            public_replies: r.public_replies,
            flow: r.flow,
          });
          if (errors.length) throw new Error(`Não dá para ativar: ${errors.join(" ")}`);
        }
      }
      const { error } = await supabase
        .from("ig_automations")
        .update({ active, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  // cliques por regra (soma dos botões rastreados)
  const { data: clicksByRule = {} } = useQuery({
    queryKey: ["ig_link_click_totals_by_rule"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ig_link_click_totals").select("rule_id,clicks");
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const r of data ?? []) m[r.rule_id] = (m[r.rule_id] ?? 0) + (r.clicks ?? 0);
      return m;
    },
  });

  const share = useMutation({
    mutationFn: async (r: IgRule) => {
      let slug = r.share_slug ?? null;
      for (let i = 0; !slug && i < 3; i++) {
        const candidate = randomSlug(10);
        const { error } = await supabase
          .from("ig_automations")
          .update({ share_slug: candidate })
          .eq("id", r.id);
        if (!error) slug = candidate;
        else if (error.code !== "23505") throw error; // 23505 = slug repetido: tenta outro
      }
      if (!slug) throw new Error("Não foi possível gerar o link. Tente de novo.");
      const url = `${window.location.origin}/r/instagram/${slug}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link do relatório copiado", { description: url });
      } catch {
        toast.success("Link do relatório criado", { description: url });
      }
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const unshare = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ig_automations").update({ share_slug: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success("Relatório não é mais público");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ig_automations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setConfirmId(null);
      refresh();
      toast.success("Fluxo excluído");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onDelete = (id: string) => {
    if (confirmId === id) remove.mutate(id);
    else {
      setConfirmId(id);
      setTimeout(() => setConfirmId((c) => (c === id ? null : c)), 4000);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
          Automações (fluxos) ({rules.length})
        </h2>
        <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="h-4 w-4 mr-1" /> Novo fluxo
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Cada fluxo tem um gatilho (comentário, direct, resposta a story ou menção) e blocos ligados por setas. A
        primeira regra ativa que combinar responde, só ela. A mesma pessoa não dispara a mesma regra de novo em 1 hora
        (comentário) ou 12 horas (direct, story e menção).
      </p>

      {isLoading ? (
        <div className="h-20 rounded-xl border border-border bg-muted/30 animate-pulse" />
      ) : rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Zap className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">Nenhum fluxo ainda</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fluxo</TableHead>
                <TableHead>Quando</TableHead>
                <TableHead>Palavras-chave</TableHead>
                <TableHead>Blocos</TableHead>
                <TableHead>Cliques</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => {
                const n = countBlocks(r.flow as Flow | null);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <span className="mr-2">{r.name}</span>
                      {!r.active && <Badge variant="secondary">pausado</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">{when(r)}</TableCell>
                    <TableCell>
                      {r.trigger === "mention" ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : r.keywords?.length ? (
                        <div className="flex flex-wrap gap-1 items-center">
                          {r.keywords.map((k) => (
                            <Badge key={k} variant="outline" className="text-xs">
                              {k}
                            </Badge>
                          ))}
                          {r.match_type === "exact" && (
                            <span className="text-xs text-muted-foreground">texto exato</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">qualquer texto</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {n} bloco{n === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell className="text-sm">{clicksByRule[r.id] ?? 0}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => navigate(`/instagram-automacoes/${r.id}`)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar fluxo
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggle.mutate({ id: r.id, active: !r.active })}
                        >
                          {r.active ? (
                            <>
                              <Pause className="h-3.5 w-3.5 mr-1" /> Pausar
                            </>
                          ) : (
                            <>
                              <Play className="h-3.5 w-3.5 mr-1" /> Ativar
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={share.isPending}
                          onClick={() => share.mutate(r)}
                        >
                          <Share2 className="h-3.5 w-3.5 mr-1" /> Compartilhar relatório
                        </Button>
                        {r.share_slug && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={unshare.isPending}
                            onClick={() => unshare.mutate(r.id)}
                          >
                            Parar de compartilhar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={confirmId === r.id ? "destructive" : "ghost"}
                          onClick={() => onDelete(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          {confirmId === r.id ? "Confirmar exclusão" : "Excluir"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
