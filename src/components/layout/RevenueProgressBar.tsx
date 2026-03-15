import { Trophy, Info, ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useProjectRevenueTotal,
} from "@/hooks/useProjectRevenue";
import { useProject } from "@/contexts/ProjectContext";

// Marcos de faturamento: 1M, 2M, 3M ... 20M
const MILESTONES = Array.from({ length: 20 }, (_, i) => (i + 1) * 1_000_000);

const fmtShort = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}K`;
  return `R$ ${v.toFixed(0)}`;
};

function getLevel(total: number) {
  const idx = MILESTONES.findIndex((m) => total < m);
  if (idx === -1) {
    // passou todos os 20M
    return {
      level: 20,
      prev: MILESTONES[18],
      current: MILESTONES[19],
      pct: 100,
      completed: true,
    };
  }
  const prev = idx === 0 ? 0 : MILESTONES[idx - 1];
  const current = MILESTONES[idx];
  const pct = Math.min(100, ((total - prev) / (current - prev)) * 100);
  return { level: idx + 1, prev, current, pct, completed: false };
}

function getBarColor(pct: number, completed: boolean) {
  if (completed) return "bg-emerald-500";
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-primary";
  if (pct >= 25) return "bg-yellow-400";
  return "bg-destructive/80";
}

/** Barra fina absoluta na borda inferior do header */
export function RevenueBarStrip() {
  const { currentProject } = useProject();
  const { data: revenue, isLoading } = useProjectRevenueTotal();

  if (!currentProject) return null;

  const total = revenue?.total ?? 0;
  const { pct, completed } = getLevel(total);
  const barColor = getBarColor(pct, completed);

  return (
    <div
      className="absolute bottom-0 left-0 right-0 h-[3px] bg-secondary/50 overflow-hidden"
      aria-hidden
    >
      <div
        className={`h-full ${barColor} transition-all duration-700 ease-out ${
          isLoading ? "animate-pulse opacity-60" : ""
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Info inline no header: ícone + nível + valores */
export function RevenueProgressBar() {
  const { currentProject } = useProject();
  const { data: revenue } = useProjectRevenueTotal();

  if (!currentProject) return null;

  const isNutra = currentProject?.slug === "nutra";
  const total = revenue?.total ?? 0;
  const salesTotal = revenue?.sales ?? 0;
  const mentoriasTotal = revenue?.mentorias ?? 0;

  const { level, prev, current, pct, completed } = getLevel(total);
  const barColor = getBarColor(pct, completed);

  // Níveis já concluídos para o tooltip (até 5 anteriores)
  const completedLevels = MILESTONES.slice(0, level - 1);

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0 mx-3">
      {/* Ícone + nível */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Trophy className="h-3.5 w-3.5 text-yellow-500" />
        <span className="text-[10px] font-bold text-yellow-500 hidden sm:block">
          Nv.{level}
        </span>

        {/* Tooltip de breakdown */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <Info className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs space-y-1.5 p-3 max-w-[220px]">
            {/* Níveis concluídos */}
            {completedLevels.length > 0 && (
              <div className="space-y-0.5 mb-1">
                {completedLevels.slice(-3).map((m, i) => (
                  <p key={m} className="text-emerald-500 text-[11px] flex items-center gap-1">
                    ✅ Nível {completedLevels.length - (completedLevels.slice(-3).length - 1 - i)} — {fmtShort(m)} atingido
                  </p>
                ))}
              </div>
            )}

            {/* Nível atual */}
            <div className="border-t pt-1.5">
              <p className="font-semibold text-foreground flex items-center gap-1">
                🏆 Nível {level} — {fmtShort(prev || 0)} → {fmtShort(current)}
              </p>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden mt-1.5">
                <div
                  className={`h-full ${barColor} rounded-full transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-muted-foreground text-[10px] mt-1">
                {fmtShort(total)} · {pct.toFixed(1)}% do nível
              </p>
            </div>

            {/* Breakdown */}
            <div className="border-t pt-1.5 space-y-0.5">
              <p className="text-[11px]">🛒 Vendas: {fmtShort(salesTotal)}</p>
              {!isNutra && <p className="text-[11px]">🎓 Mentorias: {fmtShort(mentoriasTotal)}</p>}
            </div>

            {/* Próximo nível */}
            {!completed && (
              <div className="border-t pt-1 flex items-center gap-1 text-muted-foreground text-[10px]">
                <ChevronRight className="h-3 w-3" />
                Faltam {fmtShort(current - total)} para o Nível {level + 1}
              </div>
            )}

            <p className="text-muted-foreground text-[10px] border-t pt-1">
              {currentProject?.name} · mês atual · tempo real
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Valores inline */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-xs font-bold text-foreground shrink-0 tabular-nums">
          {fmtShort(total)}
          <span className="text-muted-foreground font-normal"> / {fmtShort(current)}</span>
        </span>

        <span className="text-[10px] font-medium text-muted-foreground shrink-0 tabular-nums">
          {pct.toFixed(0)}%
        </span>

        {/* Minibar inline (só quando há espaço) */}
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden min-w-[40px] max-w-[100px] hidden md:block">
          <div
            className={`h-full ${barColor} rounded-full transition-all duration-700`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
