import { useState } from "react";
import { Plus, Trash2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProductGoals, useProductsList, useUpsertProductGoal, useDeleteProductGoal } from "@/hooks/useProductGoals";
import { toast } from "sonner";

interface Props { since: string; until: string; }

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function ProductGoalsSection({ since, until }: Props) {
  const [open, setOpen] = useState(false);
  const [productName, setProductName] = useState("");
  const [productId, setProductId] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [useExisting, setUseExisting] = useState(false);

  const { data: goals = [] } = useProductGoals(since, until);
  const { data: products = [] } = useProductsList();
  const upsert = useUpsertProductGoal();
  const remove = useDeleteProductGoal();

  function handleAdd() {
    const name = useExisting ? products.find(p => p.id === productId)?.name || productName : productName;
    if (!name || !goalAmount) { toast.error("Preencha todos os campos"); return; }
    upsert.mutate({
      product_name: name,
      product_id: useExisting ? productId : undefined,
      goal_amount: parseFloat(goalAmount.replace(",", ".")),
      period_start: since,
      period_end: until,
    }, {
      onSuccess: () => { toast.success("Meta adicionada!"); setOpen(false); setProductName(""); setGoalAmount(""); setProductId(""); },
      onError: () => toast.error("Erro ao salvar meta"),
    });
  }

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Metas por Produto</h3>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nova meta
        </Button>
      </div>

      {goals.length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <Target className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Nenhuma meta cadastrada para este período</p>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Adicionar meta</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((g: any) => (
            <div key={g.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{g.product_name}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    g.pct >= 100 ? "bg-emerald-500/15 text-emerald-600"
                    : g.pct >= 60 ? "bg-primary/15 text-primary"
                    : "bg-destructive/15 text-destructive"
                  }`}>
                    {g.pct}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{fmt(g.current)} de {fmt(g.goal_amount)}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remove.mutate(g.id)}>
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    g.pct >= 100 ? "bg-emerald-500" : g.pct >= 60 ? "bg-primary" : "bg-destructive"
                  }`}
                  style={{ width: `${g.pct}%` }}
                />
              </div>
              {g.pct >= 100 && <p className="text-xs text-emerald-500 font-medium">🎯 Meta batida! +{fmt(g.current - g.goal_amount)}</p>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Meta por Produto</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex gap-2">
              <Button size="sm" variant={!useExisting ? "default" : "outline"} onClick={() => setUseExisting(false)}>Nome livre</Button>
              <Button size="sm" variant={useExisting ? "default" : "outline"} onClick={() => setUseExisting(true)}>Produto cadastrado</Button>
            </div>

            {useExisting ? (
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder="Selecionar produto" /></SelectTrigger>
                <SelectContent>
                  {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input placeholder="Nome do produto" value={productName} onChange={e => setProductName(e.target.value)} />
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Meta de receita (R$)</label>
              <Input placeholder="10000" type="number" value={goalAmount} onChange={e => setGoalAmount(e.target.value)} />
            </div>

            <p className="text-xs text-muted-foreground">Período: {since} → {until}</p>

            <Button className="w-full" onClick={handleAdd} disabled={upsert.isPending}>
              {upsert.isPending ? "Salvando..." : "Adicionar Meta"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
