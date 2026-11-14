import type { ReactNode } from "react";
import { Pipette, Plus } from "lucide-react";
import { normalizeHex } from "@/lib/whiteboard/colors";
import { cn } from "@/lib/utils";
import { COLOR_NAMES, FILL_COLORS, FONT_SIZES, STROKE_COLORS, STROKE_WIDTHS } from "@/lib/whiteboard/palette";
import { FONT_FAMILIES } from "@/lib/whiteboard/layout";
import type { FontFamily, StylePatch, TextAlign } from "@/lib/whiteboard/types";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";

const FAMILIES: { family: FontFamily; label: string }[] = [
  { family: "sans", label: "Sem serifa" },
  { family: "serif", label: "Com serifa" },
  { family: "mono", label: "Monoespaçada" },
  { family: "hand", label: "Manuscrita" },
];
const ALIGNS: { align: TextAlign; label: string; icon: typeof AlignLeft }[] = [
  { align: "left", label: "Alinhar à esquerda", icon: AlignLeft },
  { align: "center", label: "Centralizar", icon: AlignCenter },
  { align: "right", label: "Alinhar à direita", icon: AlignRight },
];

interface StylePanelProps {
  /** Valor atual de cada propriedade; undefined = a seleção tem valores diferentes. */
  style: StylePatch;
  onChange: (patch: StylePatch) => void;
  /** Só texto na seleção (ou ferramenta de texto): mostra só cor e tamanho da letra. */
  textOnly?: boolean;
  /** Há texto na seleção (ou ferramenta de texto): mostra o tamanho da letra. */
  showFontSize?: boolean;
  /** Cores favoritas (clique aplica; clique direito remove). */
  favorites?: string[];
  onAddFavorite?: (color: string) => void;
  onRemoveFavorite?: (color: string) => void;
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

interface ColorExtrasProps {
  kind: "traço" | "fundo";
  favorites: string[];
  onApply: (color: string) => void;
  onAdd?: (color: string) => void;
  onRemove?: (color: string) => void;
}

/** Favoritas, "+" para escolher qualquer cor e conta-gotas (só nos navegadores que têm). */
function ColorExtras({ kind, favorites, onApply, onAdd, onRemove }: ColorExtrasProps) {
  const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;
  const pick = (value: string) => {
    const hex = normalizeHex(value);
    if (!hex) return;
    onApply(hex);
    onAdd?.(hex);
  };
  const eyedrop = async () => {
    try {
      const EyeDropperCtor = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
      const result = await new EyeDropperCtor().open();
      pick(result.sRGBHex);
    } catch {
      /* Esc ou cancelado: nada a fazer */
    }
  };
  return (
    <>
      {favorites.map((c) => (
        <button
          key={c}
          type="button"
          title={`${c} (clique direito remove)`}
          aria-label={`Cor favorita ${c}`}
          onClick={() => onApply(c)}
          onContextMenu={(e) => {
            e.preventDefault();
            onRemove?.(c);
          }}
          style={{ background: c }}
          className="h-6 w-6 rounded-md border border-border transition-transform hover:scale-110"
        />
      ))}
      <label className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-accent" title="Outra cor">
        <Plus className="h-3.5 w-3.5" />
        <input type="color" aria-label={`Escolher outra cor do ${kind}`} className="absolute inset-0 cursor-pointer opacity-0" onChange={(e) => pick(e.target.value)} />
      </label>
      {hasEyeDropper ? (
        <button type="button" title="Conta-gotas: pegar uma cor da tela" aria-label={`Conta-gotas do ${kind}`} onClick={eyedrop} className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent">
          <Pipette className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </>
  );
}

export function StylePanel({ style, onChange, textOnly = false, showFontSize = false, favorites = [], onAddFavorite, onRemoveFavorite }: StylePanelProps) {
  return (
    <div className="w-44 space-y-3 rounded-lg border border-border bg-card/95 p-3 shadow-sm backdrop-blur" aria-label="Estilo">
      <Section title="Traço">
        {STROKE_COLORS.map((c) => (
          <Swatch key={c} color={c} selected={style.strokeColor === c} onPick={() => onChange({ strokeColor: c })} />
        ))}
        <ColorExtras kind="traço" favorites={favorites} onApply={(c) => onChange({ strokeColor: c })} onAdd={onAddFavorite} onRemove={onRemoveFavorite} />
      </Section>
      {showFontSize ? (
        <Section title="Tamanho da letra">
          {FONT_SIZES.map((size, i) => (
            <Choice key={size} label={`Letra ${["pequena", "média", "grande", "muito grande"][i]}`} selected={style.fontSize === size} onPick={() => onChange({ fontSize: size })}>
              <span className="font-semibold leading-none" style={{ fontSize: 9 + i * 3 }}>A</span>
            </Choice>
          ))}
        </Section>
      ) : null}
      {showFontSize ? (
        <>
          <Section title="Fonte">
            {FAMILIES.map((f) => (
              <Choice key={f.family} label={`Fonte ${f.label}`} selected={style.fontFamily === f.family} onPick={() => onChange({ fontFamily: f.family })}>
                <span className="text-sm leading-none" style={{ fontFamily: FONT_FAMILIES[f.family] }}>
                  Aa
                </span>
              </Choice>
            ))}
          </Section>
          <Section title="Alinhamento">
            {ALIGNS.map((a) => (
              <Choice key={a.align} label={a.label} selected={style.textAlign === a.align} onPick={() => onChange({ textAlign: a.align })}>
                <a.icon className="h-4 w-4" />
              </Choice>
            ))}
          </Section>
        </>
      ) : null}
      {textOnly ? null : (
      <>
      <Section title="Fundo">
        {FILL_COLORS.map((c) => (
          <Swatch key={c} color={c} selected={style.backgroundColor === c} onPick={() => onChange({ backgroundColor: c })} />
        ))}
        <ColorExtras kind="fundo" favorites={favorites} onApply={(c) => onChange({ backgroundColor: c })} onAdd={onAddFavorite} onRemove={onRemoveFavorite} />
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
      </>
      )}
    </div>
  );
}
