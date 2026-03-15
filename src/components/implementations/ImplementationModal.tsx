import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, CreditCard, ChevronDown, ChevronUp, Upload, X, Image } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateImplementation, useImplementationTemplates } from "@/hooks/useImplementations";
import { useClientSearch } from "@/hooks/useClientSearch";
import { toast } from "sonner";
import { format, addMonths } from "date-fns";

const schema = z.object({
  client_name: z.string().min(1, "Obrigatório"),
  client_email: z.string().email("Email inválido").optional().or(z.literal("")),
  client_phone: z.string().optional(),
  description: z.string().optional(),
  contract_start: z.string().min(1, "Obrigatório"),
  contract_end: z.string().min(1, "Obrigatório"),
  total_value: z.coerce.number().positive("Obrigatório"),
  assigned_to: z.string().min(1, "Obrigatório"),
  steps: z.array(z.object({ title: z.string().min(1), description: z.string().optional() })),
  // Pagamento
  entry_amount: z.coerce.number().min(0).default(0),
  entry_method: z.enum(["pix", "perfectpay", "none"]).default("none"),
  installments_count: z.coerce.number().int().min(0).max(60).default(0),
  installment_method: z.enum(["pix", "perfectpay", "none"]).default("none"),
  first_due_date: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function ImplementationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: templates = [] } = useImplementationTemplates();
  const [showPayment, setShowPayment] = useState(true);
  const [entryReceiptFile, setEntryReceiptFile] = useState<File | null>(null);
  const [entryReceiptPreview, setEntryReceiptPreview] = useState<string | null>(null);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [selectedClient, setSelectedClient] = useState<{ email: string; full_name: string; phone: string | null } | null>(null);
  
  const { data: clientSuggestions = [] } = useClientSearch(
    clientSearchQuery,
    showClientSuggestions && clientSearchQuery.length >= 2
  );
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data || [];
    },
    staleTime: Infinity,
  });

  const create = useCreateImplementation();
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      client_name: "", client_email: "", client_phone: "", description: "",
      contract_start: format(new Date(), "yyyy-MM-dd"),
      contract_end: format(addMonths(new Date(), 3), "yyyy-MM-dd"),
      total_value: 0, assigned_to: "", steps: [],
      entry_amount: 0, entry_method: "none",
      installments_count: 0, installment_method: "none",
      first_due_date: format(addMonths(new Date(), 1), "yyyy-MM-dd"),
    },
  });

  const { fields, replace, append, remove } = useFieldArray({ control: form.control, name: "steps" });

  // Reset states when modal opens/closes
  useEffect(() => {
    if (open) {
      setClientSearchQuery("");
      setShowClientSuggestions(false);
      setSelectedClient(null);
    } else {
      setClientSearchQuery("");
      setShowClientSuggestions(false);
      setSelectedClient(null);
      setEntryReceiptFile(null);
      setEntryReceiptPreview(null);
    }
  }, [open]);

  const totalValue = form.watch("total_value") || 0;
  const entryAmount = form.watch("entry_amount") || 0;
  const installmentsCount = form.watch("installments_count") || 0;
  const entryMethod = form.watch("entry_method");
  const installmentMethod = form.watch("installment_method");
  const remaining = Math.max(0, totalValue - entryAmount);
  const installmentValue = installmentsCount > 0 ? remaining / installmentsCount : 0;

  function loadTemplate(templateId: string) {
    const tmpl = templates.find((t: any) => t.id === templateId);
    if (tmpl) {
      replace(
        ((tmpl as any).implementation_template_steps || [])
          .sort((a: any, b: any) => a.order_index - b.order_index)
          .map((s: any) => ({ title: s.title, description: s.description || "" }))
      );
    }
  }

  async function onSubmit(data: FormData) {
    const hasPayment = data.entry_amount > 0 || data.installments_count > 0;
    
    // Upload do comprovante da entrada (se for PIX e tiver arquivo)
    let entryReceiptUrl: string | null = null;
    if (entryReceiptFile && data.entry_method === "pix") {
      try {
        const fileExt = entryReceiptFile.name.split(".").pop();
        const fileName = `entry-receipt-${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("receipts")
          .upload(fileName, entryReceiptFile, { upsert: false });
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from("receipts")
          .getPublicUrl(uploadData.path);
        entryReceiptUrl = publicUrl;
      } catch (err: any) {
        toast.error("Erro ao fazer upload do comprovante: " + err.message);
        return;
      }
    }

    create.mutate({
      impl: {
        client_name: data.client_name,
        client_email: data.client_email || null,
        client_phone: data.client_phone || null,
        description: data.description || null,
        contract_start: data.contract_start,
        contract_end: data.contract_end,
        total_value: data.total_value,
        assigned_to: data.assigned_to,
        charge_id: null,
        lead_id: null,
        status: "active",
      },
      steps: data.steps.map((s, i) => ({ title: s.title, description: s.description, order_index: i })),
      charge: hasPayment ? {
        entry_amount: data.entry_amount,
        entry_method: data.entry_method,
        installments_count: data.installments_count,
        installment_method: data.installment_method,
        first_due_date: data.first_due_date || format(addMonths(new Date(), 1), "yyyy-MM-dd"),
        entry_receipt_url: entryReceiptUrl,
      } : null,
    }, {
      onSuccess: () => {
        toast.success("Mentoria criada!" + (hasPayment ? " Cobrança gerada automaticamente." : ""));
        form.reset();
        setEntryReceiptFile(null);
        setEntryReceiptPreview(null);
        setSelectedClient(null);
        setClientSearchQuery("");
        setShowClientSuggestions(false);
        onClose();
      },
      onError: (err: any) => toast.error(err.message || "Erro ao criar"),
    });
  }

  function handleEntryReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Apenas imagens são permitidas");
      return;
    }
    setEntryReceiptFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setEntryReceiptPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Mentoria</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          {/* Dados do cliente */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 relative">
              <label className="text-xs font-medium text-muted-foreground">Nome do cliente *</label>
              <div className="relative">
                <Input
                  {...form.register("client_name")}
                  value={selectedClient?.full_name || form.watch("client_name") || ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    form.setValue("client_name", value);
                    setClientSearchQuery(value);
                    setShowClientSuggestions(true);
                    if (selectedClient && value !== selectedClient.full_name) {
                      setSelectedClient(null);
                      form.setValue("client_email", "");
                      form.setValue("client_phone", "");
                    }
                  }}
                  onFocus={() => {
                    if (clientSearchQuery.length >= 2) setShowClientSuggestions(true);
                  }}
                  onBlur={() => {
                    // Delay para permitir clique na sugestão
                    setTimeout(() => setShowClientSuggestions(false), 200);
                  }}
                  placeholder="Digite o nome do cliente..."
                />
                {showClientSuggestions && clientSuggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {clientSuggestions.map((client) => (
                      <button
                        key={client.email}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-accent transition-colors text-sm"
                        onClick={() => {
                          setSelectedClient({
                            email: client.email,
                            full_name: client.full_name || "",
                            phone: client.phone_formatted || client.phone_e164 || null,
                          });
                          form.setValue("client_name", client.full_name || "");
                          form.setValue("client_email", client.email);
                          form.setValue("client_phone", client.phone_formatted || client.phone_e164 || "");
                          setClientSearchQuery("");
                          setShowClientSuggestions(false);
                        }}
                      >
                        <p className="font-medium">{client.full_name}</p>
                        <p className="text-xs text-muted-foreground">{client.email}</p>
                        {client.phone_formatted && (
                          <p className="text-xs text-muted-foreground">{client.phone_formatted}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {form.formState.errors.client_name && <p className="text-xs text-destructive">{form.formState.errors.client_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Responsável *</label>
              <Controller name="assigned_to" control={form.control} render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              )} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input {...form.register("client_email")} placeholder="cliente@email.com" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">WhatsApp</label>
              <Input {...form.register("client_phone")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Descrição / escopo resumido</label>
            <Input {...form.register("description")} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Início do contrato *</label>
              <Input type="date" {...form.register("contract_start")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Fim do contrato *</label>
              <Input type="date" {...form.register("contract_end")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Valor total (R$) *</label>
              <Input type="number" step="0.01" {...form.register("total_value", { valueAsNumber: true })} />
            </div>
          </div>

          {/* Etapas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Etapas / marcos</label>
              <div className="flex gap-2">
                {templates.length > 0 && (
                  <Select onValueChange={loadTemplate}>
                    <SelectTrigger className="h-7 text-xs w-auto"><SelectValue placeholder="Template" /></SelectTrigger>
                    <SelectContent>
                      {templates.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => append({ title: "", description: "" })}>
                  <Plus className="h-3 w-3 mr-1" /> Etapa
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {fields.map((field, i) => (
                <div key={field.id} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 text-center">{i + 1}</span>
                  <Input {...form.register(`steps.${i}.title`)} placeholder="Título da etapa" className="h-8 text-sm" />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => remove(i)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {fields.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">
                  Nenhuma etapa adicionada. Use um template ou adicione manualmente.
                </p>
              )}
            </div>
          </div>

          {/* Seção de Cobrança */}
          <div className="border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowPayment(!showPayment)}
              className="w-full flex items-center justify-between px-4 py-3 bg-secondary/40 hover:bg-secondary/60 transition-colors"
            >
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Configuração de Pagamento</span>
                {(entryAmount > 0 || installmentsCount > 0) && (
                  <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                    {entryAmount > 0 && installmentsCount > 0
                      ? `Entrada + ${installmentsCount}x`
                      : entryAmount > 0
                      ? "Entrada configurada"
                      : `${installmentsCount} parcela${installmentsCount > 1 ? "s" : ""}`}
                  </span>
                )}
              </div>
              {showPayment ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>

            {showPayment && (
              <div className="p-4 space-y-4">
                {/* Entrada */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Entrada</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Valor da entrada (R$)</label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        {...form.register("entry_amount", { valueAsNumber: true })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Forma de pagamento</label>
                      <Controller name="entry_method" control={form.control} render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Não aplicável</SelectItem>
                            <SelectItem value="pix">💸 Pix</SelectItem>
                            <SelectItem value="perfectpay">💳 PerfectPay</SelectItem>
                          </SelectContent>
                        </Select>
                      )} />
                    </div>
                  </div>
                  
                  {/* Upload comprovante entrada PIX */}
                  {entryMethod === "pix" && entryAmount > 0 && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Comprovante PIX (opcional)</label>
                      {entryReceiptPreview ? (
                        <div className="relative border rounded-md p-2">
                          <img src={entryReceiptPreview} alt="Comprovante" className="w-full h-32 object-contain rounded" />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute top-1 right-1 h-6 w-6"
                            onClick={() => {
                              setEntryReceiptFile(null);
                              setEntryReceiptPreview(null);
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-md p-3 cursor-pointer hover:bg-secondary/50 transition-colors">
                          <Upload className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Clique para fazer upload</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleEntryReceiptChange}
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>

                {/* Parcelamento */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Parcelamento do restante</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Nº de parcelas</label>
                      <Input
                        type="number"
                        min={0}
                        max={60}
                        placeholder="0"
                        {...form.register("installments_count", { valueAsNumber: true })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Forma das parcelas</label>
                      <Controller name="installment_method" control={form.control} render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Não aplicável</SelectItem>
                            <SelectItem value="pix">💸 Pix</SelectItem>
                            <SelectItem value="perfectpay">💳 PerfectPay</SelectItem>
                          </SelectContent>
                        </Select>
                      )} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Venc. 1ª parcela</label>
                      <Input type="date" {...form.register("first_due_date")} />
                    </div>
                  </div>
                </div>

                {/* Preview do pagamento */}
                {totalValue > 0 && (entryAmount > 0 || installmentsCount > 0) && (
                  <div className="bg-secondary/50 rounded-md p-3 space-y-1 text-xs">
                    <p className="font-semibold text-foreground">Resumo do pagamento:</p>
                    <p className="text-muted-foreground">Valor total do contrato: <span className="font-medium text-foreground">{fmt(totalValue)}</span></p>
                    {entryAmount > 0 && (
                      <p className="text-emerald-600">
                        ✅ Entrada: {fmt(entryAmount)} via {entryMethod === "pix" ? "Pix" : "PerfectPay"} <span className="text-muted-foreground">(já conta no faturamento)</span>
                      </p>
                    )}
                    {installmentsCount > 0 && (
                      <p className="text-primary">
                        📅 {installmentsCount}x de {fmt(installmentValue)} via {installmentMethod === "pix" ? "Pix" : "PerfectPay"} = {fmt(remaining)}
                      </p>
                    )}
                    {entryAmount > 0 && installmentsCount === 0 && remaining > 0 && (
                      <p className="text-muted-foreground">⚠️ Restante {fmt(remaining)} sem parcelamento configurado</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Criando..." : "Criar Mentoria"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
