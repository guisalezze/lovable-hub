import { ClipboardCopy, Download, FileImage, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ExportKind = "png" | "svg" | "copy";

interface Props {
  /** Há algo selecionado? (muda o texto: exporta a seleção ou o quadro todo) */
  hasSelection: boolean;
  onExport: (kind: ExportKind) => void;
}

export function ExportMenu({ hasSelection, onExport }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card/95 p-1 shadow-sm backdrop-blur">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5" aria-label="Exportar">
            <Download className="h-4 w-4" />
            Exportar
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {hasSelection ? "Só o que está selecionado" : "O quadro inteiro"}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onExport("png")}>
            <FileImage className="mr-2 h-4 w-4" />
            Baixar PNG
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onExport("svg")}>
            <FileCode className="mr-2 h-4 w-4" />
            Baixar SVG
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onExport("copy")}>
            <ClipboardCopy className="mr-2 h-4 w-4" />
            Copiar como PNG
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
