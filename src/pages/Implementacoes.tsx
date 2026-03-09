import { useState, useMemo } from "react";
import {
  Plus, Search, Clock, CheckCircle2, AlertTriangle,
  User, DollarSign, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useImplementations } from "@/hooks/useImplementations";
import { ImplementationModal } from "@/components/implementations/ImplementationModal";
import { ImplementationDetailSheet } from "@/components/implementations/ImplementationDetailSheet";
import type { Implementation } from "@/hooks/useImplementations";
import { differenceInDays, parseISO, startOfDay, format } from "date-fns";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function getDaysRemaining(contractEnd: string): number {
  return differenceInDays(startOfDay(parseISO(contractEnd)), startOfDay(new Date()));
}

function getProgress(steps: Implementation["implementation_steps"]): number {
  if (!steps || steps.length === 0) return 0;
  return Math.round((steps.filter(s => s.status === "done").length / steps.length) * 100);
}

function getImplHealth(impl: Implementation): "ok" | "warning" | "danger" | "completed" {
  if (impl.status === "completed") return "completed";
  if (impl.status === "paused" || impl.status === "cancelled") return "warning";
  const daysLeft = getDaysRemaining(impl.contract_end);
  const progress = getProgress(impl.implementation_steps);
  if (daysLeft < 0) return "danger";
  if (daysLeft <= 14 && progress < 70) return "danger";
  if (daysLeft <= 30 && progress < 40) return "warning";
  return "ok";
}

function ImplementationCard({ impl, onClick }: { impl: Implementation; onClick: () => void }) {
  const daysLeft = getDaysRemaining(impl.contract_end);
  const progress = getProgress(impl.implementation_steps);
  const health = getImplHealth(impl);
  const doneSteps = impl.implementation_steps.filter(s => s.status === "done").length;
  const totalSteps = impl.implementation_steps.length;

  const borderColor = {
    ok: "border-border",
    warning: "border-yellow-500/40",
    danger: "border-destructive/40",
    completed: "border-emerald-500/30",
  }[health];

  const healthBadge = {
    ok: null,
    warning: <Badge variant="outline" className="text-yellow-600 border-yellow-500/50 text-[10px]">Atenção</Badge>,
    danger: <Badge variant="destructive" className="text-[10px]">Em risco</Badge>,
    completed: <Badge variant="outline" className="text-emerald-600 border-emerald-500/50 text-[10px]">Concluída</Badge>,
  }[health];

  return (
    <div
      onClick={onClick}
      className={`glass-card p-5 cursor-pointer hover:shadow-md transition-all group border ${borderColor}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-foreground truncate">{impl.client_name}</h3>
            {healthBadge}
          </div>
          {impl.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">{impl.description}</p>
          )}
          {impl.profiles && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              {impl.profiles.full_name || impl.profiles.email}
            </div>
          )}
        </div>
        <div className="text-right shrink-0 ml-3">
          <p className="text-sm font-bold text-foreground">{fmt(impl.total_value)}</p>
          <p className="text-[10px] text-muted-foreground">total</p>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
          <span>{doneSteps} de {totalSteps} etapas</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              progress >= 100 ? "bg-emerald-500" : progress >= 60 ? "bg-primary" : "bg-yellow-500"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-secondary/50 rounded-md p-2">
          <p className="text-[10px] text-muted-foreground">Início</p>
          <p className="text-xs font-medium text-foreground">{format(parseISO(impl.contract_start), "dd/MM/yy")}</p>
        </div>
        <div className="bg-secondary/50 rounded-md p-2">
          <p className="text-[10px] text-muted-foreground">Fim</p>
          <p className="text-xs font-medium text-foreground">{format(parseISO(impl.contract_end), "dd/MM/yy")}</p>
        </div>
        <div className="bg-secondary/50 rounded-md p-2">
          <p className="text-[10px] text-muted-foreground">Dias restantes</p>
          <p className={`text-xs font-medium ${daysLeft < 0 ? "text-destructive" : daysLeft <= 14 ? "text-yellow-600" : "text-foreground"}`}>
            {daysLeft < 0 ? `${Math.abs(daysLeft)}d atraso` : `${daysLeft}d`}
          </p>
        </div>
      </div>

      {totalSteps > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {impl.implementation_steps
            .sort((a, b) => a.order_index - b.order_index)
            .map(step => (
              <span key={step.id} className={`text-[10px] px-1.5 py-0.5 rounded-full ${step.status === "done" ? "bg-emerald-500/10 text-emerald-700 line-through" : step.status === "in_progress" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                {step.title}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

export default function ImplementacoesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedImpl, setSelectedImpl] = useState<Implementation | null>(null);

  const { data: impls = [], isLoading } = useImplementations();

  const activeCount = impls.filter(i => i.status === "active").length;
  const atRiskCount = impls.filter(i => ["warning", "danger"].includes(getImplHealth(i))).length;
  const completedCount = impls.filter(i => i.status === "completed").length;
  const totalRevenue = impls.filter(i => i.status !== "cancelled").reduce((acc, i) => acc + i.total_value, 0);

  const filtered = useMemo(() => {
    let result = impls;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i => i.client_name.toLowerCase().includes(q) || (i.description || "").toLowerCase().includes(q));
    }
    if (statusFilter === "active") result = result.filter(i => i.status === "active");
    else if (statusFilter === "at_risk") result = result.filter(i => ["warning", "danger"].includes(getImplHealth(i)));
    else if (statusFilter === "completed") result = result.filter(i => i.status === "completed");
    else if (statusFilter === "paused") result = result.filter(i => i.status === "paused");
    return result;
  }, [impls, search, statusFilter]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Implementações</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {activeCount} ativas · {fmt(totalRevenue)} em contratos
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nova Implementação
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Ativas</p>
          <p className="text-2xl font-bold text-foreground mt-1">{activeCount}</p>
        </div>
        <div className={`glass-card p-4 ${atRiskCount > 0 ? "border-destructive/30" : ""}`}>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Em risco</p>
          <p className={`text-2xl font-bold mt-1 ${atRiskCount > 0 ? "text-destructive" : "text-foreground"}`}>{atRiskCount}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Concluídas</p>
          <p className="text-2xl font-bold text-foreground mt-1">{completedCount}</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Volume total</p>
          <p className="text-2xl font-bold text-foreground mt-1">{fmt(totalRevenue)}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card border-border h-8 text-sm w-[200px]"
          />
        </div>
        <div className="flex gap-1">
          {[
            { value: "all", label: "Todas" },
            { value: "active", label: "Ativas" },
            { value: "at_risk", label: "Em risco" },
            { value: "completed", label: "Concluídas" },
            { value: "paused", label: "Pausadas" },
          ].map(f => (
            <Button
              key={f.value}
              variant={statusFilter === f.value ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Clock className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Nenhuma implementação encontrada</p>
          <Button variant="outline" onClick={() => setModalOpen(true)}>Criar primeira</Button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(impl => (
            <ImplementationCard key={impl.id} impl={impl} onClick={() => setSelectedImpl(impl)} />
          ))}
        </div>
      )}

      <ImplementationModal open={modalOpen} onClose={() => setModalOpen(false)} />

      {selectedImpl && (
        <ImplementationDetailSheet
          implId={selectedImpl.id}
          open={!!selectedImpl}
          onClose={() => setSelectedImpl(null)}
        />
      )}
    </div>
  );
}
