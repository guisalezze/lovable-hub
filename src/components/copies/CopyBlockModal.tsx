import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BlockMode = "criativo" | "ml-lead";

interface CopyBlockModalProps {
  open: boolean;
  mode: BlockMode;
  onOpenChange: (open: boolean) => void;
  onCreate: (type: string, title: string) => void;
  isLoading?: boolean;
}

const modeConfig = {
  criativo: {
    title: "Novo Criativo",
    description: "Crie um novo bloco de criativo com Hooks, Body e CTA.",
    typeLabel: null as string | null,
    types: [{ value: "criativo", label: "Criativo" }],
    buttonLabel: "Criar Criativo",
  },
  "ml-lead": {
    title: "Nova MicroLead / Lead",
    description: "Crie um novo bloco de copy para MicroLead ou Lead.",
    typeLabel: "Tipo",
    types: [
      { value: "microlead", label: "MicroLead (ML)" },
      { value: "lead", label: "Lead (L)" },
    ],
    buttonLabel: "Criar",
  },
};

export function CopyBlockModal({
  open,
  mode,
  onOpenChange,
  onCreate,
  isLoading,
}: CopyBlockModalProps) {
  const cfg = modeConfig[mode];
  const [title, setTitle] = useState("");
  const [type, setType] = useState(cfg.types[0].value);

  // Reset on open
  useEffect(() => {
    if (open) {
      setTitle("");
      setType(modeConfig[mode].types[0].value);
    }
  }, [open, mode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate(type, title.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{cfg.title}</DialogTitle>
          <DialogDescription>{cfg.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Type selector — only for ml-lead */}
          {cfg.typeLabel && (
            <div className="space-y-1.5">
              <Label className="text-xs">{cfg.typeLabel}</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cfg.types.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs">Título</Label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                mode === "criativo" ? "Ex: Criativo Black Friday..." : "Ex: ML Principal, Lead Direto..."
              }
              className="text-sm"
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!title.trim() || isLoading}
            >
              {cfg.buttonLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
