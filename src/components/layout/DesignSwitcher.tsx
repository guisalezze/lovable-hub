import { Check, Palette } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useDesign } from "@/lib/designs";
import { cn } from "@/lib/utils";

export function DesignSwitcher() {
  const { design, setDesign, designs } = useDesign();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="p-2 h-9 w-9 touch-manipulation"
          aria-label="Trocar design"
        >
          <Palette className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <p className="px-2 pt-1 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Design
        </p>
        <div className="space-y-1">
          {designs.map((d) => {
            const active = d.id === design;
            return (
              <button
                key={d.id}
                onClick={() => setDesign(d.id)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-md p-2 text-left transition-colors press-scale",
                  active ? "bg-accent" : "hover:bg-accent/60"
                )}
              >
                {/* Mini prévia: fundo, card e cor de destaque */}
                <span
                  className="relative h-10 w-14 shrink-0 rounded-md border border-border overflow-hidden"
                  style={{ background: d.swatch[0] }}
                  aria-hidden
                >
                  <span
                    className="absolute left-1.5 top-1.5 right-1.5 bottom-1.5 rounded-[4px]"
                    style={{ background: d.swatch[1] }}
                  />
                  <span
                    className="absolute left-2.5 bottom-2.5 h-1.5 w-6 rounded-full"
                    style={{ background: d.swatch[2] }}
                  />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-foreground">{d.name}</span>
                  <span className="block text-xs text-muted-foreground truncate">{d.description}</span>
                </span>
                {active && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
