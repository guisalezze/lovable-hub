import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Instagram, MousePointerClick } from "lucide-react";
import { TRIGGER_LABEL } from "@/lib/instagramFlow";

// Relatório público de uma automação do Instagram (/r/instagram/:slug).
// Só agregados vindos da edge pública ig-report; nada de contatos.

interface ReportDay {
  day: string;
  sent: number;
  failed: number;
  skipped: number;
}
interface ReportClick {
  node_id: string;
  button_index: number;
  url_host: string;
  clicks: number;
}
interface Report {
  name: string;
  trigger: string;
  days: ReportDay[];
  totals: { sent: number; failed: number; skipped: number };
  clicks: ReportClick[];
}

class NotFoundError extends Error {}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const fmtDay = (day: string) => {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
};
const n = (v: number) => v.toLocaleString("pt-BR");

async function fetchReport(slug: string): Promise<Report> {
  if (!/^[0-9A-Za-z]{8,64}$/.test(slug)) throw new NotFoundError();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/ig-report?slug=${encodeURIComponent(slug)}`, {
    headers: SUPABASE_KEY ? { apikey: SUPABASE_KEY } : undefined,
  });
  if (r.status === 404) throw new NotFoundError();
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as Report;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">{children}</div>
    </div>
  );
}

export default function InstagramReportPublic() {
  const { slug = "" } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["ig_public_report", slug],
    retry: (count, e) => !(e instanceof NotFoundError) && count < 2,
    staleTime: 60_000,
    queryFn: () => fetchReport(slug),
  });

  if (isLoading) {
    return (
      <Shell>
        <div className="min-h-[50vh] flex items-center justify-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </Shell>
    );
  }

  if (error || !data) {
    const notFound = error instanceof NotFoundError;
    return (
      <Shell>
        <div className="min-h-[50vh] flex flex-col items-center justify-center text-center gap-3">
          <BarChart3 className="h-10 w-10 text-muted-foreground/40" />
          <h1 className="text-lg font-semibold">{notFound ? "Relatório não encontrado" : "Não foi possível carregar"}</h1>
          <p className="text-sm text-muted-foreground max-w-sm">
            {notFound
              ? "O link pode estar errado ou o compartilhamento deste relatório foi desativado."
              : "Tente novamente em alguns instantes."}
          </p>
        </div>
      </Shell>
    );
  }

  const days = data.days ?? [];
  const totals = data.totals ?? { sent: 0, failed: 0, skipped: 0 };
  const clicks = data.clicks ?? [];
  const totalClicks = clicks.reduce((s, c) => s + c.clicks, 0);

  const cards = [
    { label: "Enviadas", value: totals.sent, cls: "text-emerald-600" },
    { label: "Falhas", value: totals.failed, cls: "text-red-600" },
    { label: "Ignoradas", value: totals.skipped, cls: "text-muted-foreground" },
  ];

  return (
    <Shell>
      <header className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Instagram className="h-4 w-4 text-pink-500" /> Relatório de automação do Instagram
        </p>
        <h1 className="text-2xl font-bold break-words">{data.name}</h1>
        <p className="text-sm text-muted-foreground">
          Gatilho: {TRIGGER_LABEL[data.trigger] ?? data.trigger} · últimos 30 dias
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border p-3 sm:p-4">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-xl sm:text-2xl font-bold ${c.cls}`}>{n(c.value)}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border p-3 sm:p-4">
        <h2 className="text-sm font-semibold mb-3">Respostas por dia</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 10 }} minTickGap={16} stroke="hsl(var(--muted-foreground))" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                labelFormatter={(d) => fmtDay(String(d))}
                contentStyle={{ fontSize: 12, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="sent" name="Enviadas" stackId="a" fill="#10b981" />
              <Bar dataKey="failed" name="Falhas" stackId="a" fill="#ef4444" />
              <Bar dataKey="skipped" name="Ignoradas" stackId="a" fill="#94a3b8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-border p-3 sm:p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
          <MousePointerClick className="h-4 w-4" /> Cliques por botão
          <span className="ml-auto text-xs font-normal text-muted-foreground">{n(totalClicks)} no total</span>
        </h2>
        {clicks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum botão com link rastreado.</p>
        ) : (
          <ul className="divide-y divide-border">
            {clicks.map((c) => (
              <li key={`${c.node_id}|${c.button_index}|${c.url_host}`} className="py-2 flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  Botão {c.button_index + 1}
                  {c.url_host && <span className="text-muted-foreground"> · {c.url_host}</span>}
                </span>
                <span className="font-semibold tabular-nums">{n(c.clicks)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-xs text-muted-foreground">Dados agregados; nenhuma informação de contatos é exibida.</p>
    </Shell>
  );
}
