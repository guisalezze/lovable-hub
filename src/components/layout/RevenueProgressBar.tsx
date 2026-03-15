import { useState } from "react";
import { Trophy, Pencil, X, Check, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useProjectRevenueTotal,
  useProjectRevenueGoal,
  useSetProjectRevenueGoal,
} from "@/hooks/useProjectRevenue";
import { useProject, type Project } from "@/contexts/ProjectContext";

const fmtShort = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}K`;
  return `R$ ${v.toFixed(0)}`;
};

export function RevenueProgressBar() {
  const { currentProject } = useProject();
  const { data: revenue } = useProjectRevenueTotal();
  const { data: goal = 0 } = useProjectRevenueGoal();
  const setGoal = useSetProjectRevenueGoal();

  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");

  if (!currentProject) return null;

  const isNutra = currentProject?.slug === "nutra";
  const total = revenue?.total ?? 0;
  const salesTotal = revenue?.sales ?? 0;
  const mentoriasTotal = revenue?.mentorias ?? 0;
  const pct = goal > 0 ? Math.min(100, Math.round((total / goal) * 100)) : 0;

  const barColor =
    pct >= 100
      ? "bg-emerald-500"
      : pct >= 70
      ? "bg-primary"
      : pct >= 40
      ? "bg-yellow-500"
      : "bg-destructive/70";

  const handleSave = () => {
    const val = Number(input.replace(/\D/g, ""));
    if (val > 0) setGoal.mutate(val);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 flex-1 min-w-0 mx-3">
      {/* Ícone + label */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Trophy className="h-3.5 w-3.5 text-yellow-500" />
        <span className="text-xs font-semibold text-foreground hidden sm:block">Faturamento</span>

        {/* Tooltip de breakdown */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <Info className="h-3 w-3" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs space-y-1 p-2">
            <p>🛒 Vendas: {fmtShort(salesTotal)}</p>
            {!isNutra && <p>🎓 Mentorias: {fmtShort(mentoriasTotal)}</p>}
            <p className="font-semibold border-t pt-1">Total: {fmtShort(total)}</p>
            <p className="text-muted-foreground text-[10px]">Mês atual · {currentProject?.name} · tempo real</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Valores */}
      {editing ? (
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <Input
            type="number"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Meta (ex: 1000000)"
            className="h-6 text-xs bg-secondary w-28 px-2"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleSave}>
            <Check className="h-3 w-3 text-emerald-500" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditing(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-bold text-foreground shrink-0 tabular-nums">
            {fmtShort(total)}
            {goal > 0 && (
              <span className="text-muted-foreground font-normal"> / {fmtShort(goal)}</span>
            )}
          </span>

          {goal > 0 && (
            <>
              <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden min-w-[60px] max-w-[120px]">
                <div
                  className={`h-full ${barColor} rounded-full transition-all duration-700`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[10px] font-medium text-muted-foreground shrink-0 tabular-nums">
                {pct}%
              </span>
            </>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => {
              setInput(String(goal || ""));
              setEditing(true);
            }}
            title={goal > 0 ? "Editar meta" : "Definir meta de faturamento"}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
