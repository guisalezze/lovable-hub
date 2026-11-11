import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface RuleMeta {
  name: string;
  active: boolean;
  trigger: string;
  keywords: string[];
  match_type: string;
  post_id: string | null;
  media_label: string | null;
  public_replies: string[];
  pending_next_reel: boolean;
  next_reel_since: string | null;
}

interface IgPost {
  id: string;
  caption?: string;
  media_type?: string;
  thumbnail_url?: string;
  media_url?: string;
}

const TRIGGER_OPTIONS: [string, string][] = [
  ["comment", "Comentar num post"],
  ["dm", "Mandar uma direct"],
  ["story", "Responder um story"],
  ["mention", "Mencionar no story"],
];

function PostPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (p: IgPost) => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["ig_posts"],
    enabled: open,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("instagram-admin", { body: { action: "posts" } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.posts ?? []) as IgPost[];
    },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Escolher um post</DialogTitle>
        </DialogHeader>
        {isLoading && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
        {data && data.length === 0 && <p className="text-sm text-muted-foreground">Nenhum post encontrado.</p>}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto">
          {(data ?? []).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p)}
              className="relative aspect-square overflow-hidden rounded-lg border bg-muted hover:ring-2 hover:ring-primary text-left"
              title={p.caption}
            >
              {(p.thumbnail_url || p.media_url) && (
                <img src={p.thumbnail_url || p.media_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              )}
              <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-[10px] text-white truncate">
                {p.caption || p.media_type || p.id}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StartFields({ meta, onMeta }: { meta: RuleMeta; onMeta: (patch: Partial<RuleMeta>) => void }) {
  const [kw, setKw] = useState(meta.keywords.join(", "));
  const [reps, setReps] = useState(meta.public_replies.join("\n"));
  const [pick, setPick] = useState(false);
  const isComment = meta.trigger === "comment";

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Quando alguém</Label>
        <Select value={meta.trigger} onValueChange={(v) => onMeta({ trigger: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRIGGER_OPTIONS.map(([k, l]) => (
              <SelectItem key={k} value={k}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {meta.trigger !== "mention" && (
        <>
          <div className="space-y-1.5">
            <Label>Palavras-chave</Label>
            <Input
              value={kw}
              placeholder="quero, link, eu quero"
              onChange={(e) => {
                setKw(e.target.value);
                onMeta({ keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) });
              }}
            />
            <p className="text-[11px] text-muted-foreground">Separe por vírgula. Vazio = qualquer mensagem.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Combinar</Label>
            <Select value={meta.match_type === "exact" ? "exact" : "contains"} onValueChange={(v) => onMeta({ match_type: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contains">Contém a palavra</SelectItem>
                <SelectItem value="exact">Texto exato</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {isComment && (
        <>
          <div className="space-y-1.5">
            <Label>Post</Label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Switch
                checked={meta.pending_next_reel}
                onCheckedChange={(v) =>
                  onMeta(
                    v
                      ? { pending_next_reel: true, next_reel_since: new Date().toISOString(), post_id: null, media_label: null }
                      : { pending_next_reel: false, next_reel_since: null },
                  )
                }
              />
              No próximo reel que eu publicar
            </label>
            {meta.pending_next_reel ? (
              <p className="rounded-lg border border-pink-200 bg-pink-50 p-2.5 text-xs text-pink-900">
                Aguardando o próximo reel. Quando você publicar, o fluxo passa a valer para ele. Até lá não responde a nada.
              </p>
            ) : (
              <div className="flex gap-2">
                <Select
                  value={meta.post_id ?? "any"}
                  onValueChange={(v) => v === "any" && onMeta({ post_id: null, media_label: null })}
                >
                  <SelectTrigger className="min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Qualquer post</SelectItem>
                    {meta.post_id && <SelectItem value={meta.post_id}>{meta.media_label || meta.post_id}</SelectItem>}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" className="shrink-0" onClick={() => setPick(true)}>
                  Escolher um post
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Resposta pública no comentário</Label>
            <Textarea
              rows={4}
              value={reps}
              placeholder={"Te mandei no direct! 💌\nOlha o direct 😉"}
              onChange={(e) => {
                setReps(e.target.value);
                onMeta({ public_replies: e.target.value.split("\n") });
              }}
            />
            <p className="text-[11px] text-muted-foreground">
              Uma por linha; uma é sorteada a cada comentário. Vazio = não responde no comentário.
            </p>
          </div>
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[11px] text-amber-900">
            A Meta só permite 1 mensagem privada por comentário até a pessoa responder. Por isso a 1ª mensagem do fluxo
            não pode ter imagem e não pode vir depois de uma espera.
          </p>
          <PostPicker
            open={pick}
            onClose={() => setPick(false)}
            onPick={(p) => {
              onMeta({ post_id: p.id, media_label: (p.caption || p.media_type || p.id).slice(0, 60) });
              setPick(false);
            }}
          />
        </>
      )}
    </div>
  );
}
