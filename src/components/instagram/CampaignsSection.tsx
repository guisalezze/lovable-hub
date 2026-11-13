import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, MoreHorizontal, Pencil, Plus, Share2, Trash2, Megaphone, Link2Off } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  POST_MODE_LABEL,
  TEMPLATES,
  randomSlug,
  syncTrackedLinks,
  type CampaignRow,
  type PostMode,
} from "@/lib/instagramCampaign";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

interface Stats {
  sent: number;
  failed: number;
  clicks: number;
}

async function countOf(q: PromiseLike<{ count: number | null; error: unknown }>) {
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

// Só gatilhos originais: revelações e follow-ups não contam como envio novo.
const triggerLogs = (campaignId: string) =>
  supabase
    .from("ig_dm_logs")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .not("trigger_ref", "like", "reveal:%")
    .not("trigger_ref", "like", "followup:%");

const reportUrl = (slug: string) => `${window.location.origin}/r/instagram/${slug}`;

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function CampaignsSection() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pickTemplate, setPickTemplate] = useState(false);
  const [toDelete, setToDelete] = useState<CampaignRow | null>(null);

  const campaignsQ = useQuery({
    queryKey: ["ig_campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ig_campaigns").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const campaigns = campaignsQ.data ?? [];
  const ids = campaigns.map((c) => c.id);

  const statsQ = useQuery({
    queryKey: ["ig_campaign_stats", ids],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const entries = await Promise.all(
        ids.map(async (id): Promise<[string, Stats]> => {
          const [sent, failed, clicks] = await Promise.all([
            countOf(
              triggerLogs(id).eq("status", "sent"),
            ),
            countOf(
              triggerLogs(id).eq("status", "failed"),
            ),
            countOf(supabase.from("ig_tracked_link_clicks").select("id", { count: "exact", head: true }).eq("campaign_id", id)),
          ]);
          return [id, { sent, failed, clicks }];
        }),
      );
      return Object.fromEntries(entries) as Record<string, Stats>;
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ig_campaigns"] });
  const onErr = (e: Error) => toast.error(e.message);

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("ig_campaigns").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: ["ig_campaigns"] });
      qc.setQueryData<CampaignRow[]>(["ig_campaigns"], (old) => old?.map((c) => (c.id === id ? { ...c, active } : c)));
    },
    onError: (e: Error) => {
      toast.error(e.message);
      invalidate();
    },
    onSettled: invalidate,
  });

  const duplicate = useMutation({
    mutationFn: async (c: CampaignRow) => {
      const { id: _id, created_at: _c, updated_at: _u, share_slug: _s, ...rest } = c;
      // Cópia de "próximo reel" volta a esperar o próximo reel a partir de agora.
      const reel =
        c.post_mode === "next_reel"
          ? { post_id: null, post_url: null, post_label: null, next_reel_since: new Date().toISOString() }
          : {};
      const { data, error } = await supabase
        .from("ig_campaigns")
        .insert({ ...rest, ...reel, name: [...`${c.name} (cópia)`].slice(0, 100).join(""), active: false })
        .select("id")
        .single();
      if (error) throw error;
      await syncTrackedLinks(data.id, c.link1_url, c.link2_url);
      return data.id;
    },
    onSuccess: () => {
      toast.success("Campanha duplicada (inativa).");
      invalidate();
    },
    onError: (e: Error) => {
      toast.error(`Não foi possível duplicar: ${e.message}`);
      invalidate();
    },
  });

  const share = useMutation({
    mutationFn: async (c: CampaignRow) => {
      if (c.share_slug) return c.share_slug;
      for (let i = 0; i < 3; i++) {
        const slug = randomSlug(10);
        const { error } = await supabase.from("ig_campaigns").update({ share_slug: slug }).eq("id", c.id);
        if (!error) return slug;
        if ((error as { code?: string }).code !== "23505") throw error;
      }
      throw new Error("Não foi possível gerar o link do relatório.");
    },
    onSuccess: async (slug) => {
      invalidate();
      const url = reportUrl(slug);
      if (await copyText(url)) toast.success("Link do relatório copiado.", { description: url });
      else toast.info("Link do relatório", { description: url, duration: 15_000 });
    },
    onError: onErr,
  });

  const unshare = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ig_campaigns").update({ share_slug: null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Compartilhamento desativado; o link antigo deixa de funcionar.");
      invalidate();
    },
    onError: onErr,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ig_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campanha excluída.");
      invalidate();
    },
    onError: onErr,
  });

  const postText = (c: CampaignRow) => {
    const mode = c.post_mode as PostMode;
    if (mode === "post") return c.post_label || "Post escolhido";
    if (mode === "next_reel") return c.post_id ? `Próximo reel: ${c.post_label || "publicado"}` : "Próximo reel (aguardando)";
    return POST_MODE_LABEL[mode] ?? c.post_mode;
  };
  const kwText = (c: CampaignRow) => (c.match_any ? "Qualquer comentário" : c.keywords.join(", "));
  const n = (v: number | undefined) => (v == null ? "–" : v.toLocaleString("pt-BR"));

  const menu = (c: CampaignRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Ações">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => navigate(`/instagram-automacoes/${c.id}`)}>
          <Pencil className="h-4 w-4 mr-2" /> Editar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => duplicate.mutate(c)} disabled={duplicate.isPending}>
          <Copy className="h-4 w-4 mr-2" /> Duplicar
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => share.mutate(c)} disabled={share.isPending}>
          <Share2 className="h-4 w-4 mr-2" /> Compartilhar relatório
        </DropdownMenuItem>
        {c.share_slug && (
          <DropdownMenuItem onClick={() => unshare.mutate(c.id)}>
            <Link2Off className="h-4 w-4 mr-2" /> Parar de compartilhar
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setToDelete(c)}>
          <Trash2 className="h-4 w-4 mr-2" /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-semibold">Campanhas</h2>
        <Button size="sm" className="ml-auto" onClick={() => setPickTemplate(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nova campanha
        </Button>
      </div>

      {campaignsQ.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : campaignsQ.error ? (
        <p className="text-sm text-destructive">Erro ao carregar campanhas: {(campaignsQ.error as Error).message}</p>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-2">
          <p className="text-sm text-muted-foreground">Nenhuma campanha ainda.</p>
          <Button size="sm" variant="outline" onClick={() => setPickTemplate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Criar a primeira
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden md:block rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Post</TableHead>
                  <TableHead>Palavras</TableHead>
                  <TableHead className="text-right">Enviadas</TableHead>
                  <TableHead className="text-right">Falhas</TableHead>
                  <TableHead className="text-right">Cliques</TableHead>
                  <TableHead>Ativa</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => {
                  const s = statsQ.data?.[c.id];
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/instagram-automacoes/${c.id}`)}>
                      <TableCell className="font-medium max-w-[180px] truncate">
                        {c.name}
                        {c.share_slug && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            relatório
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-muted-foreground">{postText(c)}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-muted-foreground">{kwText(c)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(s?.sent)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(s?.failed)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(s?.clicks)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={c.active}
                          onCheckedChange={(v) => toggleActive.mutate({ id: c.id, active: v })}
                          aria-label="Ativa"
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>{menu(c)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Celular */}
          <div className="md:hidden space-y-2">
            {campaigns.map((c) => {
              const s = statsQ.data?.[c.id];
              return (
                <div key={c.id} className="rounded-xl border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left font-medium truncate"
                      onClick={() => navigate(`/instagram-automacoes/${c.id}`)}
                    >
                      {c.name}
                    </button>
                    <Switch
                      checked={c.active}
                      onCheckedChange={(v) => toggleActive.mutate({ id: c.id, active: v })}
                      aria-label="Ativa"
                    />
                    {menu(c)}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {postText(c)} · {kwText(c)}
                  </p>
                  <div className="flex gap-4 text-xs">
                    <span>
                      <span className="font-semibold">{n(s?.sent)}</span> enviadas
                    </span>
                    <span>
                      <span className="font-semibold">{n(s?.failed)}</span> falhas
                    </span>
                    <span>
                      <span className="font-semibold">{n(s?.clicks)}</span> cliques
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={pickTemplate} onOpenChange={setPickTemplate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova campanha</DialogTitle>
            <DialogDescription>Escolha um modelo para começar. Tudo pode ser editado depois.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setPickTemplate(false);
                  navigate(`/instagram-automacoes/new${t.key === "blank" ? "" : `?modelo=${t.key}`}`);
                }}
                className="rounded-lg border border-border p-3 text-left hover:border-primary hover:bg-muted/50 transition-colors"
              >
                <p className="text-sm font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{toDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Os registros, links rastreados e cliques desta campanha também são apagados. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => toDelete && remove.mutate(toDelete.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
