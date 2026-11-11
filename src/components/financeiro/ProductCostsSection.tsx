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
  per_order: boolean;
  product_match: string | null;
  min_units: number | null;
  max_units: number | null;
}

export const fmtUSD = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

const matchTerms = (m: string | null) =>
  (m || "").toLowerCase().split("|").map((w) => w.trim()).filter(Boolean);

// Does this cost row apply to a sale of `units` of `productName`?
export function costApplies(c: ProductCost, units: number, productName?: string | null): boolean {
  if (c.min_units != null && units < c.min_units) return false;
  if (c.max_units != null && units > c.max_units) return false;
  const terms = matchTerms(c.product_match);
  if (!terms.length) return true;
  const name = (productName || "").toLowerCase();
  return terms.some((w) => name.includes(w));
}

// Same formula cartpanda-s2s and perfectpay-webhook use to stamp product_cost on each sale
export const costForSale = (costs: ProductCost[], units: number, productName?: string | null) =>
  costs.filter((c) => costApplies(c, units, productName))
    .reduce((a, c) => a + Number(c.unit_cost) * Number(c.qty_per_sale) * (c.per_order ? 1 : units), 0);

// Products named in the cost rows (first word of each match), for the summary line
export const costProducts = (costs: ProductCost[]) =>
  [...new Set(costs.map((c) => matchTerms(c.product_match)[0]).filter(Boolean))] as string[];

const rangeLabel = (c: ProductCost) =>
  c.min_units == null && c.max_units == null ? "" :
  c.max_units == null ? `${c.min_units}+` :
  `${c.min_units ?? 1}–${c.max_units}`;

export function useProductCosts(projectId: string | undefined) {
  return useQuery({
    queryKey: ["product-costs", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      // product_costs isn't in the generated types yet
      const { data, error } = await (supabase as any)
        .from("product_costs").select("id, item_code, unit_cost, qty_per_sale, per_order, product_match, min_units, max_units")
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

  async function updateMatch(c: ProductCost, raw: string) {
    const value = raw.trim() || null;
    if (value === (c.product_match || null)) return;
    const { error } = await (supabase as any).from("product_costs").update({ product_match: value }).eq("id", c.id);
    if (error) return toast.error("Erro ao salvar custo");
    toast.success("Custo atualizado");
    refresh();
  }

  // "1-3", "4–6", "10+", "" (todas as quantidades)
  async function updateRange(c: ProductCost, raw: string) {
    const s = raw.trim();
    let min: number | null = null, max: number | null = null;
    if (s) {
      const plus = s.match(/^(\d+)\s*\+$/);
      const range = s.match(/^(\d+)\s*[-–a]\s*(\d+)$/);
      const one = s.match(/^(\d+)$/);
      if (plus) min = +plus[1];
      else if (range) { min = +range[1]; max = +range[2]; }
      else if (one) { min = +one[1]; max = +one[1]; }
      else return toast.error("Use 1-3, 10+ ou deixe vazio");
      if (min === 1 && max != null) min = null;
    }
    if (min === c.min_units && max === c.max_units) return;
    const { error } = await (supabase as any).from("product_costs").update({ min_units: min, max_units: max }).eq("id", c.id);
    if (error) return toast.error("Erro ao salvar custo");
    toast.success("Custo atualizado");
    refresh();
  }

  async function togglePerOrder(c: ProductCost) {
    const { error } = await (supabase as any).from("product_costs").update({ per_order: !c.per_order }).eq("id", c.id);
    if (error) return toast.error("Erro ao salvar custo");
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
        <span className="text-xs text-muted-foreground text-right">
          {(costProducts(costs).length ? costProducts(costs) : [""]).map((p, i) => (
            <span key={p || i} className="block">
              {p && <span className="capitalize">{p}: </span>}
              1 un. = <span className="font-semibold text-foreground">{fmtUSD(costForSale(costs, 1, p))}</span>
              {" · "}3 un. = <span className="font-semibold text-foreground">{fmtUSD(costForSale(costs, 3, p))}</span>
            </span>
          ))}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mb-2">
        Itens "× unidades" são multiplicados pelos potes do pedido; "por pedido" (ex: envio) entram uma vez só.
        "Produto" limita o item às vendas cujo nome contém a palavra (separe com | ; vazio = todos).
        "Potes" limita pela quantidade da venda (ex: 1-3, 10+; vazio = todas).
      </p>
      <div className="grid grid-cols-[1fr_7rem_4.5rem_5.5rem_4rem_5.5rem_2rem] gap-2 text-[10px] text-muted-foreground pb-1 border-b border-border/30">
        <span>Item</span><span>Produto</span><span>Potes</span><span>Custo (US$)</span><span>Qtd</span><span>Cobrança</span><span />
      </div>
      {costs.map((c) => (
        <div key={c.id} className="grid grid-cols-[1fr_7rem_4.5rem_5.5rem_4rem_5.5rem_2rem] gap-2 items-center py-1.5 border-b border-border/30 last:border-0 group">
          <span className="text-sm text-foreground truncate" title={c.item_code}>{c.item_code}</span>
          <Input
            key={`m-${c.product_match}`} defaultValue={c.product_match || ""} placeholder="todos" className="h-8 text-sm"
            onBlur={(e) => updateMatch(c, e.target.value)}
          />
          <Input
            key={`r-${c.min_units}-${c.max_units}`} defaultValue={rangeLabel(c)} placeholder="todas" className="h-8 text-sm"
            onBlur={(e) => updateRange(c, e.target.value)}
          />
          <Input
            key={`u-${c.unit_cost}`} defaultValue={c.unit_cost} type="number" step="0.01" min={0} className="h-8 text-sm"
            onBlur={(e) => updateField(c, "unit_cost", e.target.value)}
          />
          <Input
            key={`q-${c.qty_per_sale}`} defaultValue={c.qty_per_sale} type="number" step="1" min={0} className="h-8 text-sm"
            onBlur={(e) => updateField(c, "qty_per_sale", e.target.value)}
          />
          <Button
            variant={c.per_order ? "secondary" : "outline"} size="sm" className="h-8 text-xs px-2"
            onClick={() => togglePerOrder(c)}
          >
            {c.per_order ? "por pedido" : "× unidades"}
          </Button>
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
