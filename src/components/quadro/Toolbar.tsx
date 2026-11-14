import type { ReactNode } from "react";
import {
  Circle,
  Diamond,
  Eraser,
  Hand,
  Maximize,
  Minus,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Presentation,
  Redo2,
  Square,
  Type,
  Undo2,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Tool } from "@/lib/whiteboard/types";

const TOOLS: { tool: Tool; label: string; shortcut: string; icon: ReactNode }[] = [
  { tool: "select", label: "Seleção", shortcut: "V", icon: <MousePointer2 className="h-4 w-4" /> },
  { tool: "hand", label: "Mão", shortcut: "H", icon: <Hand className="h-4 w-4" /> },
  { tool: "rectangle", label: "Retângulo", shortcut: "R", icon: <Square className="h-4 w-4" /> },
  { tool: "diamond", label: "Losango", shortcut: "D", icon: <Diamond className="h-4 w-4" /> },
  { tool: "ellipse", label: "Elipse", shortcut: "O", icon: <Circle className="h-4 w-4" /> },
  { tool: "arrow", label: "Seta", shortcut: "A", icon: <MoveUpRight className="h-4 w-4" /> },
  { tool: "line", label: "Linha", shortcut: "L", icon: <Minus className="h-4 w-4" /> },
  { tool: "pencil", label: "Lápis", shortcut: "P", icon: <Pencil className="h-4 w-4" /> },
  { tool: "text", label: "Texto", shortcut: "T", icon: <Type className="h-4 w-4" /> },
  { tool: "eraser", label: "Borracha", shortcut: "E", icon: <Eraser className="h-4 w-4" /> },
  { tool: "laser", label: "Laser", shortcut: "K", icon: <Zap className="h-4 w-4" /> },
];

function Tip({ label, shortcut, children }: { label: string; shortcut?: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {shortcut ? <span className="ml-2 text-muted-foreground">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

const island = "rounded-lg border border-border bg-card/95 p-1 shadow-sm backdrop-blur";

export function ToolPalette({ tool, onTool }: { tool: Tool; onTool: (tool: Tool) => void }) {
  return (
    <div className={cn(island, "flex items-center gap-0.5")} role="toolbar" aria-label="Ferramentas do quadro">
      {TOOLS.map((t) => (
        <Tip key={t.tool} label={t.label} shortcut={t.shortcut}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t.label}
            aria-pressed={tool === t.tool}
            className={cn("h-8 w-8", tool === t.tool && "bg-primary/15 text-primary hover:bg-primary/20")}
            onClick={() => onTool(t.tool)}
          >
            {t.icon}
          </Button>
        </Tip>
      ))}
    </div>
  );
}

interface BottomBarProps {
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFit: () => void;
  onPresent: () => void;
}

export function BottomBar(p: BottomBarProps) {
  return (
    <div className={cn(island, "flex items-center gap-0.5")}>
      <Tip label="Desfazer" shortcut="Ctrl+Z">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Desfazer" disabled={!p.canUndo} onClick={p.onUndo}>
          <Undo2 className="h-4 w-4" />
        </Button>
      </Tip>
      <Tip label="Refazer" shortcut="Ctrl+Shift+Z">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Refazer" disabled={!p.canRedo} onClick={p.onRedo}>
          <Redo2 className="h-4 w-4" />
        </Button>
      </Tip>
      <div className="mx-1 h-5 w-px bg-border" />
      <Tip label="Diminuir zoom">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Diminuir zoom" onClick={p.onZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
      </Tip>
      <Tip label="Voltar para 100%">
        <Button type="button" variant="ghost" className="h-8 min-w-[3.25rem] px-2 text-xs tabular-nums" aria-label="Zoom atual, voltar para 100%" onClick={p.onResetZoom}>
          {Math.round(p.zoom * 100)}%
        </Button>
      </Tip>
      <Tip label="Aumentar zoom">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Aumentar zoom" onClick={p.onZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
      </Tip>
      <Tip label="Ajustar ao conteúdo">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Ajustar ao conteúdo" onClick={p.onFit}>
          <Maximize className="h-4 w-4" />
        </Button>
      </Tip>
      <div className="mx-1 h-5 w-px bg-border" />
      <Tip label="Modo apresentação (esconde as barras)" shortcut="F">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Modo apresentação" onClick={p.onPresent}>
          <Presentation className="h-4 w-4" />
        </Button>
      </Tip>
    </div>
  );
}
