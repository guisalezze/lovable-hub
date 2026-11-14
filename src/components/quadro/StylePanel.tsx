import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { COLOR_NAMES, FILL_COLORS, STROKE_COLORS, STROKE_WIDTHS } from "@/lib/whiteboard/palette";
import type { StylePatch } from "@/lib/whiteboard/types";

interface StylePanelProps {
  /** Valor atual de cada propriedade; undefined = a seleção tem valores diferentes. */
  style: StylePatch;
  onChange: (patch: StylePatch) => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function swatchStyle(color: string): React.CSSProperties {
  if (color === "auto") return { background: "hsl(var(--foreground))" };
  if (color === "transparent") return { background: "repeating-conic-gradient(hsl(var(--muted-foreground) / 0.5) 0 25%, transparent 0 50%) 0 0 / 8px 8px" };
  return { background: color };
}

function Swatch({ color, selected, onPick }: { color: string; selected: boolean; onPick: () => void }) {
  const name = COLOR_NAMES[color] ?? color;
  return (
    <button
      type="button"
      title={name}
      aria-label={name}
      aria-pressed={selected}
      onClick={onPick}
      style={swatchStyle(color)}
      className={cn("h-6 w-6 rounded-md border border-border transition-transform hover:scale-110", selected && "ring-2 ring-primary ring-offset-1 ring-offset-card")}
    />
  );
}

function Choice({ label, selected, onPick, children }: { label: string; selected: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={selected}
      onClick={onPick}
      className={cn("flex h-7 w-9 items-center justify-center rounded-md border border-border hover:bg-accent", selected && "border-primary bg-primary/15")}
    >
      {children}
    </button>
  );
}

export function StylePanel({ style, onChange }: StylePanelProps) {
  return (
    <div className="w-44 space-y-3 rounded-lg border border-border bg-card/95 p-3 shadow-sm backdrop-blur" aria-label="Estilo">
      <Section title="Traço">
        {STROKE_COLORS.map((c) => (
          <Swatch key={c} color={c} selected={style.strokeColor === c} onPick={() => onChange({ strokeColor: c })} />
        ))}
      </Section>
      <Section title="Fundo">
        {FILL_COLORS.map((c) => (
          <Swatch key={c} color={c} selected={style.backgroundColor === c} onPick={() => onChange({ backgroundColor: c })} />
        ))}
      </Section>
      <Section title="Espessura">
        {STROKE_WIDTHS.map((w) => (
          <Choice key={w} label={`Espessura ${w}`} selected={style.strokeWidth === w} onPick={() => onChange({ strokeWidth: w })}>
            <span className="w-5 rounded-full bg-foreground" style={{ height: w }} />
          </Choice>
        ))}
      </Section>
      <Section title="Cantos">
        <Choice label="Cantos retos" selected={style.roundness === "sharp"} onPick={() => onChange({ roundness: "sharp" })}>
          <span className="h-3.5 w-3.5 rounded-none border-2 border-foreground" />
        </Choice>
        <Choice label="Cantos arredondados" selected={style.roundness === "round"} onPick={() => onChange({ roundness: "round" })}>
          <span className="h-3.5 w-3.5 rounded-[5px] border-2 border-foreground" />
        </Choice>
      </Section>
    </div>
  );
}
