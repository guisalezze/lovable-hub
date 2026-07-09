import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete, API_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, ChevronLeft, Copy, Download, Trash2, Users, Webhook, Upload } from "lucide-react";

interface DynamicList {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  dynamic_list_contacts: [{ count: number }];
}

interface Contact {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  source: string | null;
  added_at: string;
}

function CreateListDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");

  const save = useMutation({
    mutationFn: () => {
      if (!name || !slug) throw new Error("Nome e slug obrigatórios");
      return apiPost("/dynamic-lists", { name, slug, description: description || undefined });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dynamic-lists"] }); toast.success("Lista criada"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoSlug = (v: string) => v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova lista dinâmica</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={e => { setName(e.target.value); if (!slug) setSlug(autoSlug(e.target.value)); }} placeholder="Ex: Leads do Webinário" className="mt-1" />
          </div>
          <div>
            <Label>Slug (URL)</Label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground whitespace-nowrap">/lists/</span>
              <Input value={slug} onChange={e => setSlug(autoSlug(e.target.value))} placeholder="leads-webinario" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">/contacts</span>
            </div>
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Para que serve?" className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Criando..." : "Criar lista"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddContactDialog({ open, onClose, listId }: { open: boolean; onClose: () => void; listId: string }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bulkText, setBulkText] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      if (mode === "single") {
        if (!email) throw new Error("Email obrigatório");
        return apiPost(`/dynamic-lists/${listId}/contacts`, { email, name: name || undefined, phone: phone || undefined });
      }
      // Bulk: email,nome,telefone (um por linha)
      const lines = bulkText.trim().split("\n").filter(Boolean);
      let added = 0;
      for (const line of lines) {
        const [e, n, p] = line.split(",").map(s => s.trim().replace(/^"|"$/g, ""));
        if (!e) continue;
        await apiPost(`/dynamic-lists/${listId}/contacts`, { email: e, name: n || undefined, phone: p || undefined }).catch(() => {});
        added++;
      }
      return { added };
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["list-contacts", listId] }); toast.success("Contatos adicionados"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Adicionar contatos</DialogTitle></DialogHeader>
        <div className="flex gap-2 mb-4">
          <Button size="sm" variant={mode === "single" ? "default" : "outline"} onClick={() => setMode("single")}>Individual</Button>
          <Button size="sm" variant={mode === "bulk" ? "default" : "outline"} onClick={() => setMode("bulk")}>Em massa (CSV)</Button>
        </div>
        {mode === "single" ? (
          <div className="space-y-3">
            <div><Label>Email *</Label><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="contato@email.com" className="mt-1" /></div>
            <div><Label>Nome</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="João Silva" className="mt-1" /></div>
            <div><Label>Telefone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="5511999999999" className="mt-1" /></div>
          </div>
        ) : (
          <div>
            <Label>Cole os contatos (email, nome, telefone — um por linha)</Label>
            <Textarea value={bulkText} onChange={e => setBulkText(e.target.value)} placeholder={"joao@email.com,João Silva,5511999999999\nmaria@email.com,Maria,5511888888888"} rows={8} className="mt-1 font-mono text-xs" />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Adicionando..." : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ListDetail({ list, onBack }: { list: DynamicList; onBack: () => void }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const webhookUrl = `${API_URL.replace(/\/$/, "")}/lists/${list.slug}/contacts`;

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["list-contacts", list.id],
    queryFn: () => apiGet(`/dynamic-lists/${list.id}/contacts?limit=500`),
  });

  const del = useMutation({
    mutationFn: (cid: string) => apiDelete(`/dynamic-lists/${list.id}/contacts/${cid}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["list-contacts", list.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadCSV = () => {
    window.open(`${API_URL}/dynamic-lists/${list.id}/export.csv`, "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={onBack} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-foreground">{list.name}</h2>
          {list.description && <p className="text-sm text-muted-foreground">{list.description}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={downloadCSV} className="gap-1"><Download className="h-3.5 w-3.5" /> Exportar CSV</Button>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1"><Plus className="h-3.5 w-3.5" /> Adicionar</Button>
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <Webhook className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">URL do Webhook (público)</span>
        </div>
        <p className="text-xs text-muted-foreground mb-2">Cole esta URL no n8n, Zapier, ou qualquer formulário. POST com <code className="bg-muted px-1 rounded">email</code> + campos extras.</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-muted px-3 py-2 rounded text-xs font-mono break-all">{webhookUrl}</code>
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("URL copiada"); }}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">{contacts.length} contato(s)</span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : contacts.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhum contato ainda</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Email</th>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Nome</th>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Telefone</th>
                <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Origem</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr key={c.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-foreground">{c.email}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.name || "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.phone || "—"}</td>
                  <td className="px-4 py-2.5"><Badge variant="outline" className="text-xs">{c.source || "—"}</Badge></td>
                  <td className="px-4 py-2.5 text-right">
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => del.mutate(c.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && <AddContactDialog open listId={list.id} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

export default function CaptacaoLeadsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<DynamicList | null>(null);

  const { data: lists = [], isLoading } = useQuery<DynamicList[]>({
    queryKey: ["dynamic-lists"],
    queryFn: () => apiGet("/dynamic-lists"),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/dynamic-lists/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dynamic-lists"] }); toast.success("Lista removida"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (selected) return <ListDetail list={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Captação de Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">Listas dinâmicas com webhook público</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2"><Plus className="h-4 w-4" /> Nova Lista</Button>
      </div>

      {isLoading ? (
        <div className="glass-card p-12 text-center text-muted-foreground text-sm">Carregando...</div>
      ) : lists.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhuma lista criada ainda</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {lists.map(l => {
            const count = l.dynamic_list_contacts?.[0]?.count ?? 0;
            return (
              <div
                key={l.id}
                className="glass-card p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setSelected(l)}
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">{l.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">/lists/{l.slug}/contacts</p>
                  {l.description && <p className="text-xs text-muted-foreground mt-0.5">{l.description}</p>}
                </div>
                <Badge variant="secondary" className="shrink-0">{count} contato{count !== 1 ? "s" : ""}</Badge>
                <Button
                  size="sm" variant="ghost"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0"
                  onClick={e => { e.stopPropagation(); if (confirm("Remover lista e todos os contatos?")) del.mutate(l.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <CreateListDialog open onClose={() => setShowCreate(false)} />}
    </div>
  );
}
