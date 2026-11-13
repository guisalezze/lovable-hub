import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_STATUS_LABEL, SOURCE_LABEL, STATUS_CLASS, STATUS_LABEL } from "@/lib/instagramCampaign";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ALL = "__all__";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export default function LogsSection() {
  const [campaign, setCampaign] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const campaignsQ = useQuery({
    queryKey: ["ig_campaigns_names"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("ig_campaigns").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const logsQ = useQuery({
    queryKey: ["ig_dm_logs", campaign, status],
    staleTime: 15_000,
    queryFn: async () => {
      let q = supabase
        .from("ig_dm_logs")
        .select("*, ig_campaigns(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (campaign !== ALL) q = q.eq("campaign_id", campaign);
      if (status !== ALL) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const logs = logsQ.data ?? [];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <ListChecks className="h-5 w-5 text-muted-foreground" />
        <h2 className="font-semibold">Registros</h2>
        <span className="text-xs text-muted-foreground">últimos 200</span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => logsQ.refetch()}
          disabled={logsQ.isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${logsQ.isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={campaign} onValueChange={setCampaign}>
          <SelectTrigger>
            <SelectValue placeholder="Campanha" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as campanhas</SelectItem>
            {(campaignsQ.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border overflow-x-auto">
        {logsQ.isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : logsQ.error ? (
          <p className="p-4 text-sm text-destructive">Erro ao carregar registros: {(logsQ.error as Error).message}</p>
        ) : logs.length === 0 ? (
          <p className="p-6 text-sm text-center text-muted-foreground">Nenhum registro encontrado.</p>
        ) : (
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Campanha</TableHead>
                <TableHead>Pessoa</TableHead>
                <TableHead>Gatilho</TableHead>
                <TableHead>Palavra</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Resposta pública</TableHead>
                <TableHead>Erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-xs">{fmt(l.created_at)}</TableCell>
                  <TableCell className="max-w-[140px] truncate text-sm">{l.ig_campaigns?.name ?? "–"}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {l.username ? `@${l.username}` : l.ig_user_id ? `ID ${l.ig_user_id}` : "–"}
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <p className="text-xs text-muted-foreground">{l.source ? SOURCE_LABEL[l.source] ?? l.source : "–"}</p>
                    {l.trigger_text && (
                      <p className="text-sm truncate" title={l.trigger_text}>
                        {l.trigger_text}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{l.matched_keyword ?? "–"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`whitespace-nowrap ${STATUS_CLASS[l.status] ?? ""}`}>
                      {STATUS_LABEL[l.status] ?? l.status}
                    </Badge>
                    {l.attempts > 1 && <p className="text-[10px] text-muted-foreground mt-0.5">{l.attempts} tentativas</p>}
                  </TableCell>
                  <TableCell>
                    {l.public_status ? (
                      <Badge
                        variant="outline"
                        className={`whitespace-nowrap ${STATUS_CLASS[l.public_status] ?? ""}`}
                        title={l.public_error ?? undefined}
                      >
                        {PUBLIC_STATUS_LABEL[l.public_status] ?? l.public_status}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">–</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[220px] text-xs text-destructive">
                    <span className="line-clamp-2" title={l.error ?? l.public_error ?? undefined}>
                      {l.error ?? l.public_error ?? ""}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}
