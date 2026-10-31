import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Package, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export interface ProductCost {
  id: string;
  item_code: string;
  unit_cost: number;
  qty_per_sale: number;
}

export const fmtUSD = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

export const costPerSaleOf = (costs: ProductCost[]) =>
  costs.reduce((a, c) => a + Number(c.unit_cost) * Number(c.qty_per_sale), 0);

export function useProductCosts(projectId: string | undefined) {
  return useQuery({
    queryKey: ["product-costs", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      // product_costs isn't in the generated types yet
      const { data, error } = await (supabase as any)
        .from("product_costs").select("id, item_code, unit_cost, qty_per_sale")
        .eq("project_id", projectId!)
        .order("created_at");
      if (error) throw error;
      return (data || []).map((c: any) => ({ ...c, unit_cost: Number(c.unit_cost), qty_per_sale: Number(c.qty_per_sale) })) as ProductCost[];
    },
    staleTime: 60_000,
  });
}

export function ProductCostsSection({ projectId, costs }: { projectId: string; costs: ProductCost[] }) {
  const qc = useQueryClient();
  const [newCode, setNewCode] = useState("");
  const [newCost, setNewCost] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["product-costs", projectId] });

  async function updateField(c: ProductCost, field: "unit_cost" | "qty_per_sale", raw: string) {
    const value = parseFloat(raw.replace(",", "."));
    if (isNaN(value) || value < 0) return toast.error("Valor inválido");
    if (value === c[field]) return;
    const { error } = await (supabase as any).from("product_costs").update({ [field]: value }).eq("id", c.id);
    if (error) return toast.error("Erro ao salvar custo");
    toast.success("Custo atualizado");
    refresh();
  }

  async function addItem() {
    const value = parseFloat(newCost.replace(",", "."));
    if (!newCode.trim() || isNaN(value) || value < 0) return toast.error("Preencha item e custo");
    const { error } = await (supabase as any).from("product_costs")
      .insert({ project_id: projectId, item_code: newCode.trim(), unit_cost: value });
    if (error) return toast.error(error.code === "23505" ? "Item já cadastrado" : "Erro ao salvar");
    setNewCode("");
    setNewCost("");
    refresh();
  }

  async function removeItem(c: ProductCost) {
    if (!confirm(`Excluir o custo "${c.item_code}"?`)) return;
    const { error } = await (supabase as any).from("product_costs").delete().eq("id", c.id);
    if (error) return toast.error("Erro ao excluir");
    refresh();
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />Custos por Venda
        </h3>
        <span className="text-sm font-semibold text-foreground">{fmtUSD(costPerSaleOf(costs))} / venda</span>
      </div>
      <div className="grid grid-cols-[1fr_6rem_5rem_6rem_2rem] gap-2 text-[10px] text-muted-foreground pb-1 border-b border-border/30">
        <span>Item</span><span>Custo unit. (US$)</span><span>Qtd/venda</span><span className="text-right">Total</span><span />
      </div>
      {costs.map((c) => (
        <div key={c.id} className="grid grid-cols-[1fr_6rem_5rem_6rem_2rem] gap-2 items-center py-1.5 border-b border-border/30 last:border-0 group">
          <span className="text-sm text-foreground truncate">{c.item_code}</span>
          <Input
            key={`u-${c.unit_cost}`} defaultValue={c.unit_cost} type="number" step="0.01" min={0} className="h-8 text-sm"
            onBlur={(e) => updateField(c, "unit_cost", e.target.value)}
          />
          <Input
            key={`q-${c.qty_per_sale}`} defaultValue={c.qty_per_sale} type="number" step="1" min={0} className="h-8 text-sm"
            onBlur={(e) => updateField(c, "qty_per_sale", e.target.value)}
          />
          <span className="text-sm text-right text-foreground">{fmtUSD(c.unit_cost * c.qty_per_sale)}</span>
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => removeItem(c)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <div className="grid grid-cols-[1fr_6rem_auto] gap-2 items-center pt-3">
        <Input placeholder="Novo item (ex: Etiqueta)" value={newCode} onChange={(e) => setNewCode(e.target.value)} className="h-8 text-sm" />
        <Input placeholder="0.00" type="number" step="0.01" min={0} value={newCost} onChange={(e) => setNewCost(e.target.value)} className="h-8 text-sm" />
        <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={addItem}><Plus className="h-3.5 w-3.5" />Adicionar</Button>
      </div>
    </div>
  );
}
