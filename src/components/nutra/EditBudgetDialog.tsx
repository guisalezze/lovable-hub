import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { useUpdateBudget } from "@/hooks/useMetaAds";
import { useToast } from "@/hooks/use-toast";

interface EditBudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  level: "campaign" | "adset";
  id: string;
  name: string | null;
  currentDaily: number | null;
  currentLifetime: number | null;
}

export function EditBudgetDialog({ open, onOpenChange, level, id, name, currentDaily, currentLifetime }: EditBudgetDialogProps) {
  const [budgetType, setBudgetType] = useState<"daily" | "lifetime">("daily");
  const [value, setValue] = useState("");
  const { toast } = useToast();
  const mutation = useUpdateBudget();

  useEffect(() => {
    if (open) {
      const initial = budgetType === "daily" ? currentDaily : currentLifetime;
      setValue(initial != null ? String(initial) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, budgetType]);

  const handleSave = () => {
    const numValue = Number(value);
    if (!value || Number.isNaN(numValue) || numValue <= 0) {
      toast({ title: "Valor inválido", description: "Informe um valor de orçamento maior que zero.", variant: "destructive" });
      return;
    }
    mutation.mutate(
      { level, id, budget_type: budgetType, value: numValue },
      {
        onSuccess: () => {
          toast({ title: "Orçamento atualizado" });
          onOpenChange(false);
        },
        onError: (e) => toast({ title: "Erro ao atualizar orçamento", description: String(e), variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar orçamento{name ? ` — ${name}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup value={budgetType} onValueChange={(v) => setBudgetType(v as "daily" | "lifetime")} className="flex gap-4">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="daily" id="budget-daily" />
              <Label htmlFor="budget-daily">Diário</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="lifetime" id="budget-lifetime" />
              <Label htmlFor="budget-lifetime">Vitalício</Label>
            </div>
          </RadioGroup>
          <div className="space-y-1.5">
            <Label htmlFor="budget-value">Valor (R$)</Label>
            <Input
              id="budget-value"
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0,00"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
