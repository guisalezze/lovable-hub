import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, fmtDateTime } from "./ContactsSection";
import { useIgRules } from "./FlowsTable";

const KIND_LABEL: Record<string, string> = {
  comment: "comentário",
  dm: "direct",
  story: "story",
  mention: "menção",
  postback: "clique em botão",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "sent")
    return (
      <Badge variant="outline" className="text-emerald-600 border-emerald-500/40 bg-emerald-500/10">
        Respondido
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge variant="outline" className="text-destructive border-destructive/40 bg-destructive/10">
        Falhou
      </Badge>
    );
  if (status === "skipped") return <Badge variant="secondary">Ignorado</Badge>;
  return (
    <Badge variant="outline" className="text-blue-600 border-blue-500/40 bg-blue-500/10">
      Enviando
    </Badge>
  );
}

export default function RepliesSection() {
  const { data: rules = [] } = useIgRules();

  const { data: replies = [], isLoading } = useQuery({
    queryKey: ["ig_replies"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("ig_replies")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const ids = Array.from(new Set((rows ?? []).map((r) => r.ig_user_id).filter(Boolean) as string[]));
      const byId: Record<string, { username: string | null; name: string | null; profile_pic: string | null }> = {};
      if (ids.length) {
        const { data: contacts } = await supabase
          .from("ig_contacts")
          .select("instagram_user_id,username,name,profile_pic")
          .in("instagram_user_id", ids);
        for (const c of contacts ?? []) byId[c.instagram_user_id] = c;
      }
      return (rows ?? []).map((r) => ({ ...r, contact: r.ig_user_id ? byId[r.ig_user_id] : undefined }));
    },
  });

  const ruleName = (id: string | null) => rules.find((r) => r.id === id)?.name ?? "—";

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Últimas respostas</h2>
      <div className="rounded-xl border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Pessoa</TableHead>
              <TableHead>Escreveu</TableHead>
              <TableHead>Fluxo</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : replies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  Nenhuma resposta ainda
                </TableCell>
              </TableRow>
            ) : (
              replies.map((r) => {
                const uname = r.contact?.username || r.username;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {fmtDateTime(r.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar src={r.contact?.profile_pic} name={uname} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{uname ? `@${uname}` : r.ig_user_id ?? "—"}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {r.contact?.name ? `${r.contact.name} · ` : ""}
                            {KIND_LABEL[r.kind] ?? r.kind}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm max-w-[240px] truncate" title={r.text_in ?? ""}>
                      {r.text_in || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{ruleName(r.rule_id)}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                      {r.error && <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">{r.error}</p>}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
