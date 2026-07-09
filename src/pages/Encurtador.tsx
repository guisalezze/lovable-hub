import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, apiDelete, API_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Copy, ExternalLink, Link2, RotateCcw } from "lucide-react";

interface Redirect {
  id: string;
  slug: string;
  destinations: string[];
  round_robin_index: number;
  hit_count: number;
  description: string | null;
  created_at: string;
}

function RedirectDialog({
  open,
  onClose,
  redirect,
}: {
  open: boolean;
  onClose: () => void;
  redirect?: Redirect;
}) {
  const qc = useQueryClient();
  const isEdit = !!redirect;

  const [slug, setSlug] = useState(redirect?.slug ?? "");
  const [destinations, setDestinations] = useState(redirect?.destinations?.join("\n") ?? "");
  const [description, setDescription] = useState(redirect?.description ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const dests = destinations.split("\n").map(d => d.trim()).filter(Boolean);
      if (!slug || !dests.length) throw new Error("Slug e pelo menos 1 destino são obrigatórios");
      const payload = { slug: slug.toLowerCase().replace(/\s+/g, "-"), destinations: dests, description: description || null };
      if (isEdit) return apiPut(`/redirects/${redirect!.id}`, payload);
      return apiPost("/redirects", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["redirects"] });
      toast.success(isEdit ? "Link atualizado" : "Link criado");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar link" : "Novo link curto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Slug</Label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground whitespace-nowrap">{API_URL}/r/</span>
              <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="meu-link" />
            </div>
          </div>
          <div>
            <Label>Destino(s)</Label>
            <p className="text-xs text-muted-foreground mb-1">1 URL = link único. Vários (um por linha) = rodízio round-robin.</p>
            <Textarea
              value={destinations}
              onChange={e => setDestinations(e.target.value)}
              placeholder={"https://exemplo.com/pagina-a\nhttps://exemplo.com/pagina-b"}
              rows={4}
            />
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Para que serve este link?" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EncurtadorPage() {
  const qc = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<Redirect | undefined>();

  const { data: redirects = [], isLoading } = useQuery<Redirect[]>({
    queryKey: ["redirects"],
    queryFn: () => apiGet("/redirects"),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/redirects/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["redirects"] }); toast.success("Link removido"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyUrl = (slug: string) => {
    const url = `${API_URL}/r/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("URL copiada");
  };

  const baseUrl = API_URL.replace(/\/api$/, "");

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Encurtador de Links</h1>
          <p className="text-sm text-muted-foreground mt-1">Links curtos com rodízio round-robin</p>
        </div>
        <Button onClick={() => { setEditing(undefined); setShowDialog(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Link
        </Button>
      </div>

      {isLoading ? (
        <div className="glass-card p-12 text-center text-muted-foreground text-sm">Carregando...</div>
      ) : redirects.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Link2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhum link criado ainda</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Slug</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Destinos</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Cliques</th>
                <th className="text-left px-4 py-3 text-muted-foreground font-medium">Modo</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {redirects.map(r => (
                <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-foreground">{r.slug}</span>
                      {r.description && <span className="text-xs text-muted-foreground truncate max-w-[120px]">{r.description}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{baseUrl}/r/{r.slug}</p>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    {r.destinations.slice(0, 2).map((d, i) => (
                      <p key={i} className="text-xs text-muted-foreground truncate">{d}</p>
                    ))}
                    {r.destinations.length > 2 && <p className="text-xs text-muted-foreground">+{r.destinations.length - 2} mais</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{r.hit_count || 0}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.destinations.length > 1 ? (
                      <Badge variant="outline" className="gap-1"><RotateCcw className="h-3 w-3" /> Round-robin</Badge>
                    ) : (
                      <Badge variant="secondary">Único</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copyUrl(r.slug)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                        <a href={`${baseUrl}/r/${r.slug}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditing(r); setShowDialog(true); }}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => {
                        if (confirm("Remover este link?")) del.mutate(r.id);
                      }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showDialog && (
        <RedirectDialog
          open={showDialog}
          onClose={() => setShowDialog(false)}
          redirect={editing}
        />
      )}
    </div>
  );
}
