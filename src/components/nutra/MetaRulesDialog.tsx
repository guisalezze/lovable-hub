import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { useMetaRules } from "@/hooks/useMetaAds";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accountId: string;
}

export function MetaRulesDialog({ open, onOpenChange, accountId }: Props) {
  const { data: rules = [] } = useMetaRules(accountId);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [metric, setMetric] = useState("cpa");
  const [operator, setOperator] = useState(">");
  const [value, setValue] = useState("");
  const [action, setAction] = useState("pause");

  const handleCreate = async () => {
    if (!name || !value) return;
    const { error } = await supabase.from("meta_rules").insert({
      ad_account_id: accountId,
      name,
      condition_metric: metric,
      condition_operator: operator,
      condition_value: Number(value),
      action_type: action,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Regra criada" });
      qc.invalidateQueries({ queryKey: ["meta-rules"] });
      setName("");
      setValue("");
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("meta_rules").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["meta-rules"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Regras Automáticas</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing rules */}
          {rules.map((rule: any) => (
            <div key={rule.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
              <div>
                <p className="text-sm font-medium text-foreground">{rule.name}</p>
                <p className="text-xs text-muted-foreground">
                  Se {rule.condition_metric} {rule.condition_operator} {rule.condition_value} → {rule.action_type}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={rule.is_active ? "default" : "secondary"} className="text-[10px]">
                  {rule.is_active ? "Ativa" : "Inativa"}
                </Badge>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleDelete(rule.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}

          {/* New rule form */}
          <div className="border border-dashed border-border rounded-lg p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Nova Regra</p>
            <Input placeholder="Nome da regra" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-xs" />
            <div className="grid grid-cols-3 gap-2">
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpa">CPA</SelectItem>
                  <SelectItem value="roas">ROAS</SelectItem>
                  <SelectItem value="spend">Gasto</SelectItem>
                  <SelectItem value="ctr">CTR</SelectItem>
                </SelectContent>
              </Select>
              <Select value={operator} onValueChange={setOperator}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value=">">Maior que</SelectItem>
                  <SelectItem value="<">Menor que</SelectItem>
                  <SelectItem value=">=">≥</SelectItem>
                  <SelectItem value="<=">≤</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" placeholder="Valor" value={value} onChange={(e) => setValue(e.target.value)} className="h-8 text-xs" />
            </div>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pause">Pausar campanha</SelectItem>
                <SelectItem value="resume">Retomar campanha</SelectItem>
                <SelectItem value="notify">Apenas notificar</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleCreate} className="gap-1">
              <Plus className="h-3.5 w-3.5" />
              Criar Regra
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
