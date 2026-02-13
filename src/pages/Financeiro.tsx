import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, TrendingUp, Target, Wallet, Plus } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export default function FinanceiroPage() {
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalInvestment, setTotalInvestment] = useState(0);
  const [investAmount, setInvestAmount] = useState("");
  const [investDesc, setInvestDesc] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data: sales } = await supabase
      .from("sales")
      .select("sale_amount, sale_status_enum");
    const approved = (sales || []).filter((s) => s.sale_status_enum === "approved");
    setTotalRevenue(approved.reduce((a, s) => a + Number(s.sale_amount || 0), 0));

    const { data: inv } = await supabase.from("investments").select("amount");
    setTotalInvestment((inv || []).reduce((a, i) => a + Number(i.amount), 0));
  }

  const profit = totalRevenue - totalInvestment;
  const roas = totalInvestment > 0 ? (totalRevenue / totalInvestment).toFixed(1) : "—";

  async function addInvestment() {
    const amount = parseFloat(investAmount);
    if (!amount || amount <= 0) return toast.error("Valor inválido");
    const { error } = await supabase.from("investments").insert({ amount, description: investDesc || null });
    if (error) return toast.error("Erro ao salvar");
    toast.success("Investimento registrado");
    setInvestAmount("");
    setInvestDesc("");
    setOpen(false);
    fetchData();
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-1">Receita, investimento e ROAS</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Registrar Investimento</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo Investimento</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <Input placeholder="Valor (R$)" type="number" value={investAmount} onChange={(e) => setInvestAmount(e.target.value)} />
              <Input placeholder="Descrição (opcional)" value={investDesc} onChange={(e) => setInvestDesc(e.target.value)} />
              <Button onClick={addInvestment} className="w-full">Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Receita Total" value={`R$ ${totalRevenue.toFixed(2)}`} icon={DollarSign} />
        <KpiCard label="Investimento" value={`R$ ${totalInvestment.toFixed(2)}`} icon={Wallet} />
        <KpiCard label="Lucro" value={`R$ ${profit.toFixed(2)}`} changeType={profit >= 0 ? "positive" : "negative"} icon={TrendingUp} />
        <KpiCard label="ROAS" value={`${roas}x`} icon={Target} />
      </div>
    </div>
  );
}
