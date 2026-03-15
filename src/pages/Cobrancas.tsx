import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus, Search, CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronUp,
  DollarSign, Receipt, CalendarDays, TrendingUp, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { isBefore, isSameDay, startOfDay, parseISO, addMonths, format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Types ──

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
}

interface ChargeInstallment {
  id: string;
  charge_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  status: "pending" | "paid" | "overdue";
  paid_at: string | null;
}

interface Charge {
  id: string;
  product_name: string;
  client_name: string;
  client_phone: string | null;
  total_ticket: number;
  entry_paid: number;
  installments_count: number;
  installment_value: number;
  assigned_to: string | null;
  notes: string | null;
  status: "active" | "completed" | "cancelled";
  created_at: string;
  charge_installments: ChargeInstallment[];
  profiles?: Profile;
}

// ── Helpers ──

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function installmentStatusInfo(inst: ChargeInstallment) {
  const today = startOfDay(new Date());
  const due = startOfDay(parseISO(inst.due_date));
  if (inst.status === "paid") return { label: "Pago", color: "text-emerald-500", bg: "bg-emerald-500/10", icon: CheckCircle2 };
  if (isBefore(due, today)) return { label: "Atrasado", color: "text-destructive", bg: "bg-destructive/10", icon: AlertTriangle };
  if (isSameDay(due, today)) return { label: "Vence hoje", color: "text-yellow-500", bg: "bg-yellow-500/10", icon: Clock };
  return { label: "Pendente", color: "text-muted-foreground", bg: "bg-secondary", icon: Clock };
}

function chargeOverallStatus(charge: Charge): "ok" | "overdue" | "due_today" | "completed" {
  if (charge.status === "completed") return "completed";
  const pending = charge.charge_installments.filter(i => i.status !== "paid");
  if (pending.length === 0) return "completed";
  const today = startOfDay(new Date());
  if (pending.some(i => isSameDay(startOfDay(parseISO(i.due_date)), today))) return "due_today";
  if (pending.some(i => isBefore(startOfDay(parseISO(i.due_date)), today))) return "overdue";
  return "ok";
}

// ── Hooks ──

function useCharges() {
  return useQuery<Charge[]>({
    queryKey: ["charges"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charges")
        .select(`*, charge_installments(*), profiles:assigned_to(id, full_name, email)`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Charge[]) || [];
    },
    staleTime: 30_000,
  });
}

function useProfiles() {
  return useQuery<Profile[]>({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      return (data as Profile[]) || [];
    },
    staleTime: Infinity,
  });
}

// ── ChargeModal ──

const chargeSchema = z.object({
  product_name: z.string().min(1, "Obrigatório"),
  client_name: z.string().min(1, "Obrigatório"),
  client_phone: z.string().optional(),
  assigned_to: z.string().min(1, "Selecione um responsável"),
  total_ticket: z.coerce.number().positive("Deve ser maior que 0"),
  entry_paid: z.coerce.number().min(0).default(0),
  installments_count: z.coerce.number().int().min(1).max(60).default(1),
  first_due_date: z.string().min(1, "Obrigatório"),
  notes: z.string().optional(),
});

type ChargeFormData = z.infer<typeof chargeSchema>;

interface InstallmentRow {
  due_date: string;
  amount: number;
}

function ChargeModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data: profiles = [] } = useProfiles();
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const defaultDueDate = format(addMonths(new Date(), 1), "yyyy-MM-dd");

  const form = useForm<ChargeFormData>({
    resolver: zodResolver(chargeSchema),
    defaultValues: {
      product_name: "",
      client_name: "",
      client_phone: "",
      assigned_to: "",
      total_ticket: 0,
      entry_paid: 0,
      installments_count: 1,
      first_due_date: defaultDueDate,
      notes: "",
    },
  });

  const totalTicket = form.watch("total_ticket") || 0;
  const entryPaid = form.watch("entry_paid") || 0;
  const installmentsCount = form.watch("installments_count") || 1;
  const firstDueDate = form.watch("first_due_date");
  const remaining = Math.max(0, totalTicket - entryPaid);
  const installmentValue = installmentsCount > 0 ? remaining / installmentsCount : 0;

  const generateInstallments = () => {
    if (!firstDueDate || installmentsCount < 1) return;
    const rows: InstallmentRow[] = [];
    const base = parseISO(firstDueDate);
    for (let i = 0; i < installmentsCount; i++) {
      rows.push({
        due_date: format(addMonths(base, i), "yyyy-MM-dd"),
        amount: Math.round(installmentValue * 100) / 100,
      });
    }
    setInstallments(rows);
  };

  const onSubmit = async (data: ChargeFormData) => {
    if (installments.length === 0) {
      toast.error("Gere as parcelas antes de salvar.");
      return;
    }
    setSubmitting(true);
    try {
      const user = (await supabase.auth.getUser()).data.user;
      const { data: charge, error: chargeErr } = await supabase
        .from("charges")
        .insert({
          product_name: data.product_name,
          client_name: data.client_name,
          client_phone: data.client_phone || null,
          total_ticket: data.total_ticket,
          entry_paid: data.entry_paid,
          installments_count: installments.length,
          installment_value: installmentValue,
          assigned_to: data.assigned_to,
          created_by: user?.id || null,
          notes: data.notes || null,
          status: "active",
        } as any)
        .select()
        .single();
      if (chargeErr) throw chargeErr;

      const { error: instErr } = await supabase
        .from("charge_installments")
        .insert(
          installments.map((inst, i) => ({
            charge_id: (charge as any).id,
            installment_number: i + 1,
            due_date: inst.due_date,
            amount: inst.amount,
            status: "pending",
          } as any))
        );
      if (instErr) throw instErr;

      // Create tasks for each installment
      await supabase.from("tasks").insert(
        installments.map((inst, i) => ({
          title: `Cobrança: ${data.product_name} — Parcela ${i + 1}/${installments.length}`,
          description: `Cliente: ${data.client_name}\nValor: ${fmtCurrency(inst.amount)}`,
          due_date: inst.due_date,
          assigned_to: data.assigned_to,
          status: "backlog" as const,
          priority: "alta" as const,
          created_by: user?.id || null,
        }))
      );

      // Notify (silenced)
      try {
        await supabase.functions.invoke("charge-notify", {
          body: {
            charge_id: (charge as any).id,
            client_name: data.client_name,
            product_name: data.product_name,
            installments_count: installments.length,
            installment_value: installmentValue,
            first_due_date: data.first_due_date,
            assigned_to: data.assigned_to,
          },
        });
      } catch {}

      qc.invalidateQueries({ queryKey: ["charges"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Cobrança cadastrada!");
      form.reset();
      setInstallments([]);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao cadastrar cobrança");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Cobrança</DialogTitle>
          <DialogDescription>
            Crie uma nova cobrança para um cliente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Produto / Mentoria *</Label>
              <Input {...form.register("product_name")} placeholder="Nome do produto" />
              {form.formState.errors.product_name && <p className="text-xs text-destructive">{form.formState.errors.product_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Nome do Cliente *</Label>
              <Input {...form.register("client_name")} placeholder="Nome completo" />
              {form.formState.errors.client_name && <p className="text-xs text-destructive">{form.formState.errors.client_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp do Cliente</Label>
              <Input {...form.register("client_phone")} placeholder="5511999999999" />
            </div>
            <div className="space-y-1.5">
              <Label>Responsável *</Label>
              <Select value={form.watch("assigned_to")} onValueChange={v => form.setValue("assigned_to", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.assigned_to && <p className="text-xs text-destructive">{form.formState.errors.assigned_to.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Ticket Total *</Label>
              <Input type="number" step="0.01" {...form.register("total_ticket")} />
            </div>
            <div className="space-y-1.5">
              <Label>Entrada Paga</Label>
              <Input type="number" step="0.01" {...form.register("entry_paid")} />
            </div>
            <div className="space-y-1.5">
              <Label>Restante</Label>
              <Input value={fmtCurrency(remaining)} readOnly className="bg-muted" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Nº de Parcelas</Label>
              <Input type="number" min={1} max={60} {...form.register("installments_count")} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor da Parcela</Label>
              <Input value={fmtCurrency(installmentValue)} readOnly className="bg-muted" />
            </div>
            <div className="space-y-1.5">
              <Label>Vencimento 1ª parcela</Label>
              <Input type="date" {...form.register("first_due_date")} />
            </div>
          </div>

          <Button type="button" variant="outline" size="sm" onClick={generateInstallments}>
            Gerar parcelas automaticamente
          </Button>

          {installments.length > 0 && (
            <div className="border rounded-md p-3 space-y-2 max-h-60 overflow-y-auto">
              <p className="text-xs font-medium text-muted-foreground">Parcelas ({installments.length})</p>
              {installments.map((inst, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground w-8 text-right">{i + 1}.</span>
                  <Input
                    type="date"
                    value={inst.due_date}
                    onChange={e => {
                      const copy = [...installments];
                      copy[i] = { ...copy[i], due_date: e.target.value };
                      setInstallments(copy);
                    }}
                    className="h-8 w-40"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={inst.amount}
                    onChange={e => {
                      const copy = [...installments];
                      copy[i] = { ...copy[i], amount: Number(e.target.value) };
                      setInstallments(copy);
                    }}
                    className="h-8 w-32"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea {...form.register("notes")} placeholder="Notas opcionais" rows={2} />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Salvando…" : "Cadastrar Cobrança"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── ChargeCard ──

function ChargeCard({ charge }: { charge: Charge }) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();
  const overall = chargeOverallStatus(charge);

  const markPaid = useMutation({
    mutationFn: async (installmentId: string) => {
      const { error } = await supabase
        .from("charge_installments")
        .update({ status: "paid", paid_at: new Date().toISOString() } as any)
        .eq("id", installmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charges"] });
      toast.success("Parcela marcada como paga!");
    },
  });

  const sorted = [...charge.charge_installments].sort((a, b) => a.installment_number - b.installment_number);
  const paidCount = sorted.filter(i => i.status === "paid").length;
  const paidSum = sorted.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0) + Number(charge.entry_paid);
  const remainingSum = Number(charge.total_ticket) - paidSum;
  const progressPct = sorted.length > 0 ? (paidCount / sorted.length) * 100 : 0;
  const nextDue = sorted.find(i => i.status !== "paid");

  const borderClass =
    overall === "overdue" ? "border-destructive/40" :
    overall === "due_today" ? "border-yellow-500/40" :
    overall === "completed" ? "border-emerald-500/30" : "border-border";

  const overallBadge =
    overall === "overdue" ? <Badge variant="destructive" className="text-[10px]">Atrasado</Badge> :
    overall === "due_today" ? <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/20 text-[10px]">Vence hoje</Badge> :
    overall === "completed" ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/20 text-[10px]">Quitado</Badge> :
    <Badge variant="secondary" className="text-[10px]">Em dia</Badge>;

  return (
    <Card className={`${borderClass} border-2 transition-colors`}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm text-foreground">{charge.client_name}</p>
              {overallBadge}
            </div>
            <p className="text-xs text-muted-foreground">{charge.product_name}</p>
            {charge.profiles && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Resp: {charge.profiles.full_name || charge.profiles.email}
              </p>
            )}
          </div>
          <p className="text-sm font-bold text-foreground">{fmtCurrency(Number(charge.total_ticket))}</p>
        </div>

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{paidCount}/{sorted.length} parcelas pagas</span>
            <span>{Math.round(progressPct)}%</span>
          </div>
          <Progress
            value={progressPct}
            className={`h-2 ${overall === "completed" ? "[&>div]:bg-emerald-500" : overall === "overdue" ? "[&>div]:bg-destructive" : ""}`}
          />
        </div>

        {/* Grid */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground">Pago</p>
            <p className="text-xs font-semibold text-emerald-500">{fmtCurrency(paidSum)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Restante</p>
            <p className="text-xs font-semibold text-foreground">{fmtCurrency(Math.max(0, remainingSum))}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Próx. venc.</p>
            <p className="text-xs font-semibold text-foreground">
              {nextDue ? format(parseISO(nextDue.due_date), "dd/MM/yy") : "—"}
            </p>
          </div>
        </div>

        {/* Toggle */}
        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
          {expanded ? "Ocultar parcelas" : "Ver parcelas"}
        </Button>

        {/* Installments */}
        {expanded && (
          <div className="space-y-1.5 pt-1">
            {sorted.map(inst => {
              const info = installmentStatusInfo(inst);
              const Icon = info.icon;
              return (
                <div key={inst.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-md bg-muted/50">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-5 text-right">{inst.installment_number}.</span>
                    <span>{fmtCurrency(Number(inst.amount))}</span>
                    <span className="text-muted-foreground">{format(parseISO(inst.due_date), "dd/MM/yy")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${info.bg} ${info.color} text-[9px] border-0`}>
                      <Icon className="h-3 w-3 mr-0.5" />
                      {info.label}
                    </Badge>
                    {inst.status !== "paid" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-emerald-500 hover:bg-emerald-500/10"
                        onClick={() => markPaid.mutate(inst.id)}
                        disabled={markPaid.isPending}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ──

type QuickFilter = "all" | "overdue" | "today" | "ok" | "completed";

export default function CobrancasPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const { data: charges = [], isLoading } = useCharges();

  const kpis = useMemo(() => {
    const active = charges.filter(c => c.status === "active");
    const aReceber = active.reduce((sum, c) => {
      const pending = c.charge_installments.filter(i => i.status !== "paid");
      return sum + pending.reduce((s, i) => s + Number(i.amount), 0);
    }, 0);
    const overdue = active.filter(c => chargeOverallStatus(c) === "overdue").length;
    const dueToday = active.filter(c => chargeOverallStatus(c) === "due_today").length;
    return { aReceber, active: active.length, overdue, dueToday };
  }, [charges]);

  const filtered = useMemo(() => {
    let result = charges;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c => c.client_name.toLowerCase().includes(q) || c.product_name.toLowerCase().includes(q));
    }
    if (quickFilter === "overdue") result = result.filter(c => chargeOverallStatus(c) === "overdue");
    if (quickFilter === "today") result = result.filter(c => chargeOverallStatus(c) === "due_today");
    if (quickFilter === "ok") result = result.filter(c => chargeOverallStatus(c) === "ok");
    if (quickFilter === "completed") result = result.filter(c => chargeOverallStatus(c) === "completed");
    return result;
  }, [charges, search, quickFilter]);

  const kpiCards = [
    { label: "A Receber", value: fmtCurrency(kpis.aReceber), icon: DollarSign, accent: "" },
    { label: "Cobranças Ativas", value: String(kpis.active), icon: Receipt, accent: "" },
    { label: "Atrasadas", value: String(kpis.overdue), icon: AlertTriangle, accent: kpis.overdue > 0 ? "text-destructive" : "" },
    { label: "Vencem Hoje", value: String(kpis.dueToday), icon: CalendarDays, accent: kpis.dueToday > 0 ? "text-yellow-500" : "" },
  ];

  const filters: { val: QuickFilter; label: string }[] = [
    { val: "all", label: "Todas" },
    { val: "overdue", label: "Atrasadas" },
    { val: "today", label: "Hoje" },
    { val: "ok", label: "Em dia" },
    { val: "completed", label: "Quitadas" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cobranças</h1>
          <p className="text-sm text-muted-foreground">
            {charges.length} cobrança{charges.length !== 1 ? "s" : ""} · {fmtCurrency(kpis.aReceber)} a receber
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nova Cobrança
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <k.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">{k.label}</p>
                <p className={`text-lg font-bold ${k.accent || "text-foreground"}`}>{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou produto…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm w-[220px] bg-card border-border"
          />
        </div>
        <div className="flex gap-1">
          {filters.map(f => (
            <Button
              key={f.val}
              variant={quickFilter === f.val ? "default" : "outline"}
              size="sm"
              className="text-xs h-8"
              onClick={() => setQuickFilter(f.val)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Receipt className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground text-sm">Nenhuma cobrança encontrada</p>
          <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Cadastrar primeira cobrança
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(charge => (
            <ChargeCard key={charge.id} charge={charge} />
          ))}
        </div>
      )}

      <ChargeModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}
