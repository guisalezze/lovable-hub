import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Plus, Trash2, GitBranch, Save, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { FunilCanvas, type FunilGraph } from "./FunilCanvas";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Funnel {
  id: string;
  name: string;
  session_id: string;
  trigger_event_type: string;
  graph: FunilGraph;
  is_active: boolean;
  created_at: string;
}

interface Stats {
  active: number; completed: number; error: number; canceled: number; total: number;
}

interface Session {
  session_id: string; display_name: string | null; status: string;
}

const EVENTS = [
  { value: "all",                    label: "Todos os eventos" },
  { value: "purchase_approved",      label: "Compra Aprovada" },
  { value: "purchase_refused",       label: "Cartão Recusado" },
  { value: "purchase_generated",     label: "Pix / Boleto Gerado" },
  { value: "purchase_canceled",      label: "Compra Cancelada" },
  { value: "purchase_refunded",      label: "Reembolso" },
  { value: "purchase_chargeback",    label: "Chargeback" },
  { value: "abandoned_cart",         label: "Carrinho Abandonado" },
  { value: "subscription_activated", label: "Assinatura Ativada" },
  { value: "subscription_canceled",  label: "Assinatura Cancelada" },
];

const EMPTY_GRAPH: FunilGraph = { nodes: [], edges: [] };

// ─── FunilTab ─────────────────────────────────────────────────────────────────

export function FunilTab({ sessions }: { sessions: Session[] }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [graph, setGraph] = useState<FunilGraph>(EMPTY_GRAPH);

  const defaultForm = () => ({
    name: "",
    session_id: sessions[0]?.session_id || "",
    trigger_event_type: "purchase_approved",
    is_active: true,
  });
  const [form, setForm] = useState(defaultForm());

  const { data: funnels = [] } = useQuery<Funnel[]>({
    queryKey: ["funnels"],
    queryFn: () => apiGet("/funnels"),
    refetchInterval: 20_000,
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["funnel-stats", selectedId],
    queryFn: () => apiGet(`/funnels/${selectedId}/stats`),
    enabled: !!selectedId && !isNew,
    refetchInterval: 15_000,
  });

  function selectFunnel(f: Funnel) {
    setSelectedId(f.id);
    setIsNew(false);
    setForm({ name: f.name, session_id: f.session_id, trigger_event_type: f.trigger_event_type || "all", is_active: f.is_active });
    setGraph(f.graph && f.graph.nodes?.length ? f.graph : EMPTY_GRAPH);
  }

  function startNew() {
    setSelectedId(null);
    setIsNew(true);
    setForm(defaultForm());
    setGraph(EMPTY_GRAPH);
  }

  function back() {
    setSelectedId(null);
    setIsNew(false);
  }

  async function handleSave() {
    if (!form.name?.trim()) { toast.error("Nome obrigatório"); return; }
    if (!form.session_id) { toast.error("Selecione uma sessão"); return; }
    setSaving(true);
    try {
      const body = { ...form, graph, trigger_type: "webhook_event" };
      if (isNew) {
        const result = await apiPost<Funnel>("/funnels", body);
        setSelectedId(result.id);
        setIsNew(false);
      } else {
        await apiPut(`/funnels/${selectedId}`, body);
      }
      qc.invalidateQueries({ queryKey: ["funnels"] });
      toast.success("Funil salvo!");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!selectedId || !confirm("Excluir este funil?")) return;
    try {
      await apiDelete(`/funnels/${selectedId}`);
      back();
      qc.invalidateQueries({ queryKey: ["funnels"] });
      toast.success("Funil excluído.");
    } catch (e: any) { toast.error(e.message); }
  }

  const showCanvas = isNew || selectedId !== null;

  if (showCanvas) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background shrink-0">
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={back}>
            <ChevronLeft className="h-3 w-3" /> Voltar
          </Button>
          <div className="h-4 w-px bg-border" />
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nome do funil"
            className="h-7 text-xs w-48"
          />
          <Select value={form.session_id} onValueChange={(v) => setForm((f) => ({ ...f, session_id: v }))}>
            <SelectTrigger className="h-7 text-xs w-40"><SelectValue placeholder="Sessão" /></SelectTrigger>
            <SelectContent>
              {sessions.map((s) => (
                <SelectItem key={s.session_id} value={s.session_id}>{s.display_name || s.session_id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={form.trigger_event_type} onValueChange={(v) => setForm((f) => ({ ...f, trigger_event_type: v }))}>
            <SelectTrigger className="h-7 text-xs w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVENTS.map((ev) => <SelectItem key={ev.value} value={ev.value}>{ev.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {!isNew && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Ativo</span>
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
              </div>
            </>
          )}

          {/* Stats pills */}
          {stats && (
            <div className="flex gap-1.5 ml-2">
              {[
                { label: "Ativos", value: stats.active, color: "bg-blue-100 text-blue-700" },
                { label: "Concluídos", value: stats.completed, color: "bg-emerald-100 text-emerald-700" },
                { label: "Erros", value: stats.error, color: "bg-red-100 text-red-700" },
              ].map(({ label, value, color }) => (
                <span key={label} className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", color)}>
                  {value} {label}
                </span>
              ))}
            </div>
          )}

          <div className="ml-auto flex gap-1.5">
            {!isNew && (
              <Button size="sm" variant="destructive" className="h-7 px-2" onClick={handleDelete}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
            <Button size="sm" className="h-7 gap-1 text-xs" onClick={handleSave} disabled={saving}>
              <Save className="h-3 w-3" />
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-hidden">
          <FunilCanvas initialGraph={graph} onChange={setGraph} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* List */}
      <div className="w-full max-w-sm border-r border-border bg-background flex flex-col">
        <div className="p-3 border-b border-border">
          <Button size="sm" className="w-full h-8 text-xs gap-1" onClick={startNew}>
            <Plus className="h-3 w-3" /> Novo funil
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {funnels.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <GitBranch className="h-8 w-8 mx-auto opacity-20" />
              <p className="text-xs text-muted-foreground">Nenhum funil criado.</p>
              <p className="text-[10px] text-muted-foreground opacity-70">Crie um funil para montar seu workflow visual.</p>
            </div>
          ) : (
            funnels.map((f) => (
              <button
                key={f.id}
                onClick={() => selectFunnel(f)}
                className="w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-medium truncate flex-1">{f.name}</span>
                  <div className={cn("h-2 w-2 rounded-full shrink-0", f.is_active ? "bg-emerald-500" : "bg-muted-foreground")} />
                </div>
                <p className="text-[10px] text-muted-foreground pl-6 mt-0.5">
                  {sessions.find((s) => s.session_id === f.session_id)?.display_name || f.session_id}
                </p>
                <p className="text-[10px] text-primary/70 pl-6">
                  {EVENTS.find((e) => e.value === f.trigger_event_type)?.label || f.trigger_event_type}
                </p>
                <p className="text-[10px] text-muted-foreground pl-6">
                  {f.graph?.nodes?.length || 0} nós · {f.graph?.edges?.length || 0} conexões
                </p>
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Empty state */}
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center space-y-3">
          <GitBranch className="h-14 w-14 mx-auto opacity-10" />
          <p className="text-sm font-medium">Selecione ou crie um funil</p>
          <p className="text-xs opacity-50 max-w-xs">Monte workflows visuais com nós de mensagem, delay e verificação de compra</p>
        </div>
      </div>
    </div>
  );
}
