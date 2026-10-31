import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Tag, Search } from "lucide-react";

const ALL = "__all__";

export const fmtDateTime = (iso?: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "—";

export function Avatar({ src, name }: { src?: string | null; name?: string | null }) {
  return src ? (
    <img src={src} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
  ) : (
    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground shrink-0">
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );
}

const parseTags = (s: string) =>
  Array.from(new Set(s.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)));

interface ContactRow {
  id: string;
  instagram_user_id: string;
  username: string | null;
  name: string | null;
  tags: string[];
  profile_pic: string | null;
  last_in_at: string | null;
}

export default function ContactsSection() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [tag, setTag] = useState(ALL);
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [tagsInput, setTagsInput] = useState("");

  const { data: tagCounts = {} } = useQuery({
    queryKey: ["ig_contact_tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ig_contacts").select("tags").limit(5000);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of data ?? []) for (const t of r.tags ?? []) counts[t] = (counts[t] ?? 0) + 1;
      return counts;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["ig_contacts", q, tag],
    queryFn: async () => {
      let query = supabase
        .from("ig_contacts")
        .select("id,instagram_user_id,username,name,tags,profile_pic,last_in_at", { count: "exact" })
        .order("last_in_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(100);
      const term = q.trim().replace(/^@/, "").replace(/[%,()]/g, "");
      if (term) query = query.ilike("username", `%${term}%`);
      if (tag !== ALL) query = query.contains("tags", [tag]);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as ContactRow[], total: count ?? 0 };
    },
  });

  const saveTags = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase
        .from("ig_contacts")
        .update({ tags: parseTags(tagsInput), updated_at: new Date().toISOString() })
        .eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ig_contacts"] });
      qc.invalidateQueries({ queryKey: ["ig_contact_tags"] });
      toast.success("Tags atualizadas");
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];
  const tagList = Object.entries(tagCounts).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
        Contatos ({data?.total ?? 0})
      </h2>
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por @" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={tag} onValueChange={setTag}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Todas as tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as tags</SelectItem>
            {tagList.map(([t, n]) => (
              <SelectItem key={t} value={t}>
                {t} ({n})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contato</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Última mensagem</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                  Nenhum contato
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar src={c.profile_pic} name={c.username || c.name} />
                      <div className="min-w-0">
                        {c.username ? (
                          <a
                            href={`https://instagram.com/${c.username}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium hover:underline"
                          >
                            @{c.username}
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">{c.instagram_user_id}</span>
                        )}
                        {c.name && <p className="text-xs text-muted-foreground truncate">{c.name}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(c.tags ?? []).map((t) => (
                        <Badge key={t} variant="secondary" className="text-xs">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDateTime(c.last_in_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(c);
                        setTagsInput((c.tags ?? []).join(", "));
                      }}
                    >
                      <Tag className="h-3.5 w-3.5 mr-1" /> Tags
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tags de @{editing?.username ?? editing?.instagram_user_id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Tags (separadas por vírgula)</Label>
            <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="ex: quer-triade, lead" />
            <p className="text-xs text-muted-foreground">Ficam em minúsculas e sem espaços nas pontas.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={() => saveTags.mutate()} disabled={saveTags.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
