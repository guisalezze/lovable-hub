import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, Circle, Clock, Plus, ExternalLink,
  FileText, Link2, Video, Table2, File, Loader2,
  Pencil, Trash2, Save, X, CreditCard, AlertTriangle, Check, Upload, Image, XCircle,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useImplementationDetail, useUpdateStepStatus,
  useAddDocument, useAddNote, useUpdateImplementation, useDeleteImplementation, useAddStep,
  useMarkInstallmentPaid, useUpdateInstallmentAmount, useUpdateInstallmentReceipt, useUnmarkInstallmentPaid,
  useUpdateEntryReceipt,
} from "@/hooks/useImplementations";
import type { ImplementationStep, ChargeInstallmentForImpl } from "@/hooks/useImplementations";
import { format, parseISO, differenceInDays, isBefore, startOfDay, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { LtvBadge } from "@/components/shared/LtvBadge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const DOC_TYPE_ICONS: Record<string, any> = {
  link: Link2, doc: FileText, video: Video, sheet: Table2, other: File,
};

const STEP_STATUS_CONFIG = {
  pending: { label: "Pendente", icon: Circle, color: "text-muted-foreground" },
  in_progress: { label: "Em andamento", icon: Clock, color: "text-primary" },
  done: { label: "Concluído", icon: CheckCircle2, color: "text-emerald-500" },
};

function fmtCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function installmentStatusInfo(inst: ChargeInstallmentForImpl) {
  const today = startOfDay(new Date());
  const due = startOfDay(parseISO(inst.due_date));
  if (inst.status === "paid") return { label: "Pago", color: "text-emerald-500", bg: "bg-emerald-500/10" };
  if (isBefore(due, today)) return { label: "Atrasado", color: "text-destructive", bg: "bg-destructive/10" };
  if (isSameDay(due, today)) return { label: "Vence hoje", color: "text-yellow-500", bg: "bg-yellow-500/10" };
  return { label: "Pendente", color: "text-muted-foreground", bg: "bg-secondary" };
}

export function ImplementationDetailSheet({
  implId, open, onClose,
}: { implId: string; open: boolean; onClose: () => void }) {
  const { data, isLoading, error } = useImplementationDetail(implId || "");
  const updateStep = useUpdateStepStatus();
  const addStepMut = useAddStep();
  const addDoc = useAddDocument();
  const addNote = useAddNote();
  const updateImpl = useUpdateImplementation();
  const deleteImpl = useDeleteImplementation();
  const markPaid = useMarkInstallmentPaid();
  const unmarkPaid = useUnmarkInstallmentPaid();
  const updateInstallmentAmount = useUpdateInstallmentAmount();
  const updateInstallmentReceipt = useUpdateInstallmentReceipt();
  const updateEntryReceipt = useUpdateEntryReceipt();

  const [noteText, setNoteText] = useState("");
  const [editingInstallmentId, setEditingInstallmentId] = useState<string | null>(null);
  const [editingInstallmentAmount, setEditingInstallmentAmount] = useState<string>("");
  const [docTitle, setDocTitle] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [docType, setDocType] = useState("link");
  const [addingDoc, setAddingDoc] = useState(false);
  const [newStepTitle, setNewStepTitle] = useState("");
  const [installmentReceiptFile, setInstallmentReceiptFile] = useState<{ [key: string]: File }>({});
  const [installmentReceiptPreview, setInstallmentReceiptPreview] = useState<{ [key: string]: string }>({});
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptModalInstallmentId, setReceiptModalInstallmentId] = useState<string | null>(null);
  const [receiptModalIsPaid, setReceiptModalIsPaid] = useState(false);
  const [receiptModalIsEntry, setReceiptModalIsEntry] = useState(false);
  const [entryReceiptFile, setEntryReceiptFile] = useState<File | null>(null);
  const [entryReceiptPreview, setEntryReceiptPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({
    client_name: "",
    client_email: "",
    client_phone: "",
    description: "",
    contract_start: "",
    contract_end: "",
    total_value: 0,
    status: "active",
  });

  const impl = data?.implementation;
  const documents = data?.documents || [];
  const notes = data?.notes || [];
  const charge = impl?.charges ?? null;
  const installments = charge
    ? [...charge.charge_installments].sort((a, b) => a.installment_number - b.installment_number)
    : [];

  const daysLeft = impl?.contract_end ? differenceInDays(parseISO(impl.contract_end), new Date()) : 0;
  const steps = (impl?.implementation_steps || []).sort((a, b) => a.order_index - b.order_index);
  const progress = steps.length > 0 ? Math.round(steps.filter(s => s.status === "done").length / steps.length * 100) : 0;

  // Pagamento summary
  const entryPaid = charge ? Number(charge.entry_paid) : 0;
  const paidInstallmentsSum = installments.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);
  const totalReceived = impl?.paid_amount ?? 0;
  const totalContract = impl?.total_value ?? 0;
  const paymentPct = totalContract > 0 ? Math.min(100, (totalReceived / totalContract) * 100) : 0;

  function startEditing() {
    if (!impl) return;
    setEditFields({
      client_name: impl.client_name,
      client_email: impl.client_email || "",
      client_phone: impl.client_phone || "",
      description: impl.description || "",
      contract_start: impl.contract_start,
      contract_end: impl.contract_end,
      total_value: impl.total_value,
      status: impl.status,
    });
    setEditing(true);
  }

  function handleSaveEdit() {
    updateImpl.mutate({
      id: implId,
      client_name: editFields.client_name,
      client_email: editFields.client_email || null,
      client_phone: editFields.client_phone || null,
      description: editFields.description || null,
      contract_start: editFields.contract_start,
      contract_end: editFields.contract_end,
      total_value: editFields.total_value,
      status: editFields.status,
    }, {
      onSuccess: () => { toast.success("Mentoria atualizada"); setEditing(false); },
      onError: () => toast.error("Erro ao atualizar"),
    });
  }

  function handleDelete() {
    deleteImpl.mutate(implId, {
      onSuccess: () => { toast.success("Mentoria excluída"); onClose(); },
      onError: () => toast.error("Erro ao excluir"),
    });
  }

  function handleStepClick(step: ImplementationStep) {
    const next: ImplementationStep["status"] =
      step.status === "pending" ? "in_progress"
      : step.status === "in_progress" ? "done"
      : "pending";
    updateStep.mutate({ stepId: step.id, status: next, implId }, {
      onSuccess: () => toast.success(`Etapa: ${STEP_STATUS_CONFIG[next].label}`),
    });
  }

  function handleAddNote() {
    if (!noteText.trim()) return;
    addNote.mutate({ implementation_id: implId, content: noteText }, {
      onSuccess: () => { toast.success("Nota adicionada!"); setNoteText(""); },
    });
  }

  function handleAddDoc() {
    if (!docTitle.trim() || !docUrl.trim()) { toast.error("Preencha título e URL"); return; }
    addDoc.mutate({ implementation_id: implId, title: docTitle, url: docUrl, type: docType }, {
      onSuccess: () => { toast.success("Documento adicionado!"); setDocTitle(""); setDocUrl(""); setDocType("link"); setAddingDoc(false); },
    });
  }

  function handleMarkInstallmentPaid(inst: ChargeInstallmentForImpl) {
    // Detecta método de pagamento pelas notes da charge (Pix ou PerfectPay)
    const paymentMethod = charge?.notes?.toLowerCase().includes("pix") ? "pix" : "perfectpay";
    const receiptFile = installmentReceiptFile[inst.id] || null;
    
    markPaid.mutate(
      { 
        installmentId: inst.id, 
        amount: Number(inst.amount), 
        implementationId: implId,
        paymentMethod,
        receiptFile,
      },
      { 
        onSuccess: () => {
          const msg = paymentMethod === "pix" 
            ? "Parcela marcada como paga via Pix! Desconto de 10% aplicado (Marília)."
            : "Parcela marcada como paga! Faturamento atualizado.";
          toast.success(msg);
          // Limpa o arquivo após sucesso
          setInstallmentReceiptFile(prev => {
            const next = { ...prev };
            delete next[inst.id];
            return next;
          });
          setInstallmentReceiptPreview(prev => {
            const next = { ...prev };
            delete next[inst.id];
            return next;
          });
          setReceiptModalOpen(false);
        }
      }
    );
  }

  function handleReceiptUpload(inst?: ChargeInstallmentForImpl) {
    if (receiptModalIsEntry && charge && entryReceiptFile) {
      // Upload comprovante de entrada
      updateEntryReceipt.mutate(
        {
          chargeId: charge.id,
          receiptFile: entryReceiptFile,
          implementationId: implId,
        },
        {
          onSuccess: () => {
            toast.success("Comprovante de entrada atualizado!");
            setEntryReceiptFile(null);
            setEntryReceiptPreview(null);
            setReceiptModalOpen(false);
          },
          onError: (err: any) => toast.error(err.message || "Erro ao atualizar comprovante"),
        }
      );
    } else if (inst && receiptModalIsPaid && installmentReceiptFile[inst.id]) {
      // Atualizar comprovante de parcela já paga
      updateInstallmentReceipt.mutate(
        {
          installmentId: inst.id,
          receiptFile: installmentReceiptFile[inst.id],
          implementationId: implId,
        },
        {
          onSuccess: () => {
            toast.success("Comprovante atualizado!");
            setInstallmentReceiptFile(prev => {
              const next = { ...prev };
              delete next[inst.id];
              return next;
            });
            setInstallmentReceiptPreview(prev => {
              const next = { ...prev };
              delete next[inst.id];
              return next;
            });
            setReceiptModalOpen(false);
          },
          onError: (err: any) => toast.error(err.message || "Erro ao atualizar comprovante"),
        }
      );
    } else if (inst) {
      // Marcar parcela como paga com comprovante
      handleMarkInstallmentPaid(inst);
    }
  }

  function handleInstallmentReceiptChange(instId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) {
      toast.error("Apenas imagens e PDF são permitidos");
      return;
    }
    setInstallmentReceiptFile(prev => ({ ...prev, [instId]: file }));
    if (isImage) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setInstallmentReceiptPreview(prev => ({ ...prev, [instId]: e.target?.result as string }));
      };
      reader.readAsDataURL(file);
    } else {
      // Para PDF, apenas mostrar o nome do arquivo
      setInstallmentReceiptPreview(prev => ({ ...prev, [instId]: file.name }));
    }
  }

  function handleEntryReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) {
      toast.error("Apenas imagens e PDF são permitidos");
      return;
    }
    setEntryReceiptFile(file);
    if (isImage) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setEntryReceiptPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setEntryReceiptPreview(file.name);
    }
  }

  function openReceiptModal(inst: ChargeInstallmentForImpl, isPaid: boolean) {
    setReceiptModalIsEntry(false);
    setReceiptModalInstallmentId(inst.id);
    setReceiptModalIsPaid(isPaid);
    setEntryReceiptFile(null);
    setEntryReceiptPreview(null);
    // Limpar previews anteriores se houver
    if (!isPaid) {
      setInstallmentReceiptFile(prev => {
        const next = { ...prev };
        delete next[inst.id];
        return next;
      });
      setInstallmentReceiptPreview(prev => {
        const next = { ...prev };
        delete next[inst.id];
        return next;
      });
    }
    setReceiptModalOpen(true);
  }

  if (!open) return null;

  return (
    <>
    <Sheet open={open} onOpenChange={(v) => {
      if (!v) {
        onClose();
      }
    }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-40 space-y-2">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <p className="text-sm text-destructive">Erro ao carregar mentoria</p>
            <p className="text-xs text-muted-foreground">{(error as any)?.message || "Erro desconhecido"}</p>
          </div>
        ) : !impl ? (
          <div className="flex flex-col items-center justify-center h-40 space-y-2">
            <AlertTriangle className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Mentoria não encontrada</p>
          </div>
        ) : (
          <>
            <SheetHeader>
              {editing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Nome do cliente</label>
                      <Input value={editFields.client_name} onChange={e => setEditFields(p => ({ ...p, client_name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Email</label>
                      <Input value={editFields.client_email} onChange={e => setEditFields(p => ({ ...p, client_email: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">WhatsApp</label>
                    <Input value={editFields.client_phone} onChange={e => setEditFields(p => ({ ...p, client_phone: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Descrição</label>
                    <Textarea value={editFields.description} onChange={e => setEditFields(p => ({ ...p, description: e.target.value }))} rows={2} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Início</label>
                      <Input type="date" value={editFields.contract_start} onChange={e => setEditFields(p => ({ ...p, contract_start: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Fim</label>
                      <Input type="date" value={editFields.contract_end} onChange={e => setEditFields(p => ({ ...p, contract_end: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Valor total</label>
                      <Input type="number" value={editFields.total_value} onChange={e => setEditFields(p => ({ ...p, total_value: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Status</label>
                      <Select value={editFields.status} onValueChange={v => setEditFields(p => ({ ...p, status: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Ativa</SelectItem>
                          <SelectItem value="completed">Concluída</SelectItem>
                          <SelectItem value="paused">Pausada</SelectItem>
                          <SelectItem value="cancelled">Cancelada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveEdit} disabled={updateImpl.isPending} className="gap-1">
                      <Save className="h-3.5 w-3.5" /> Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="gap-1">
                      <X className="h-3.5 w-3.5" /> Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <SheetTitle>{impl.client_name}</SheetTitle>
                      {impl.client_email && <LtvBadge email={impl.client_email} size="md" />}
                      {impl.description && <p className="text-sm text-muted-foreground mt-1">{impl.description}</p>}
                      {impl.client_phone && (
                        <p className="text-xs text-muted-foreground mt-0.5">📱 {impl.client_phone}</p>
                      )}
                    </div>
                    <p className="text-lg font-bold text-foreground shrink-0">{fmtCurrency(impl.total_value)}</p>
                  </div>

                  <div className="flex gap-1 mt-3">
                    <Button size="sm" variant="outline" onClick={startEditing} className="gap-1 text-xs">
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1 text-xs text-destructive hover:text-destructive">
                          <Trash2 className="h-3 w-3" /> Excluir
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir mentoria?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Isso excluirá permanentemente a mentoria de "{impl.client_name}" e todas as etapas, documentos e notas associadas.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </>
              )}

              {!editing && (
                <div className="space-y-2 mt-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{steps.filter(s => s.status === "done").length} de {steps.length} etapas concluídas</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${progress >= 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{format(parseISO(impl.contract_start), "d MMM yyyy", { locale: ptBR })} → {format(parseISO(impl.contract_end), "d MMM yyyy", { locale: ptBR })}</span>
                    <span className={daysLeft < 0 ? "text-destructive" : ""}>
                      {daysLeft < 0 ? `${Math.abs(daysLeft)} dias em atraso` : `${daysLeft} dias restantes`}
                    </span>
                  </div>
                </div>
              )}
            </SheetHeader>

            <Tabs defaultValue="steps" className="mt-6">
              <TabsList className="w-full">
                <TabsTrigger value="steps" className="flex-1">Etapas</TabsTrigger>
                <TabsTrigger value="pagamentos" className="flex-1 relative">
                  Pagamentos
                  {charge && installments.some(i => i.status !== "paid") && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-yellow-500" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="notes" className="flex-1">Notas</TabsTrigger>
                <TabsTrigger value="docs" className="flex-1">Docs</TabsTrigger>
              </TabsList>

              {/* ── Etapas ── */}
              <TabsContent value="steps" className="space-y-2 mt-4">
                {steps.map(step => {
                  const config = STEP_STATUS_CONFIG[step.status];
                  const Icon = config.icon;
                  return (
                    <div
                      key={step.id}
                      onClick={() => handleStepClick(step)}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors border border-transparent hover:border-border/50"
                    >
                      <Icon className={`h-5 w-5 shrink-0 ${config.color}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${step.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {step.title}
                        </p>
                        {step.completed_at && (
                          <p className="text-[11px] text-muted-foreground">
                            Concluído em {format(parseISO(step.completed_at), "d 'de' MMM", { locale: ptBR })}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{config.label}</Badge>
                    </div>
                  );
                })}
                <div className="flex gap-2 pt-2">
                  <Input
                    placeholder="Nova etapa..."
                    value={newStepTitle}
                    onChange={e => setNewStepTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && newStepTitle.trim()) {
                        addStepMut.mutate({ implementation_id: implId, title: newStepTitle, order_index: steps.length }, {
                          onSuccess: () => { toast.success("Etapa adicionada!"); setNewStepTitle(""); },
                        });
                      }
                    }}
                    className="bg-secondary text-sm flex-1"
                  />
                  <Button size="sm" disabled={!newStepTitle.trim() || addStepMut.isPending} onClick={() => {
                    addStepMut.mutate({ implementation_id: implId, title: newStepTitle, order_index: steps.length }, {
                      onSuccess: () => { toast.success("Etapa adicionada!"); setNewStepTitle(""); },
                    });
                  }}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground text-center pt-1">Clique em uma etapa para avançar o status</p>
              </TabsContent>

              {/* ── Pagamentos ── */}
              <TabsContent value="pagamentos" className="mt-4 space-y-4">
                {/* Resumo recebido */}
                <div className="bg-secondary/40 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Recebido</span>
                    <span className="font-bold text-foreground">{fmtCurrency(totalReceived)} / {fmtCurrency(totalContract)}</span>
                  </div>
                  <Progress
                    value={paymentPct}
                    className={`h-2 ${paymentPct >= 100 ? "[&>div]:bg-emerald-500" : "[&>div]:bg-primary"}`}
                  />
                  <p className="text-[10px] text-muted-foreground text-right">{Math.round(paymentPct)}% do contrato recebido</p>
                </div>

                {charge ? (
                  <div className="space-y-3">
                    {/* Entrada */}
                    {entryPaid > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            <div>
                              <p className="text-xs font-semibold text-foreground">Entrada</p>
                              {charge.notes && <p className="text-[10px] text-muted-foreground">{charge.notes.split("·")[0]?.trim()}</p>}
                            </div>
                          </div>
                          <span className="text-sm font-bold text-emerald-600">{fmtCurrency(entryPaid)}</span>
                        </div>
                        {/* Comprovante da entrada */}
                        <div className="border rounded-md p-2 bg-secondary/30">
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                              {(charge as any).entry_receipt_url ? (
                                <>
                                  {(charge as any).entry_receipt_url.toLowerCase().endsWith('.pdf') ? (
                                    <FileText className="h-3 w-3" />
                                  ) : (
                                    <Image className="h-3 w-3" />
                                  )}
                                  Comprovante PIX da entrada
                                </>
                              ) : (
                                <>
                                  <Upload className="h-3 w-3" />
                                  Adicionar comprovante da entrada
                                </>
                              )}
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => {
                                setReceiptModalIsEntry(true);
                                setReceiptModalInstallmentId(null);
                                setReceiptModalIsPaid(!!(charge as any).entry_receipt_url);
                                setEntryReceiptFile(null);
                                setEntryReceiptPreview(null);
                                setReceiptModalOpen(true);
                              }}
                            >
                              {(charge as any).entry_receipt_url ? (
                                <>
                                  <Pencil className="h-3 w-3 mr-1" />
                                  Editar
                                </>
                              ) : (
                                <>
                                  <Upload className="h-3 w-3 mr-1" />
                                  Adicionar
                                </>
                              )}
                            </Button>
                          </div>
                          {(charge as any).entry_receipt_url && (
                            <a href={(charge as any).entry_receipt_url} target="_blank" rel="noopener noreferrer" className="block">
                              {(charge as any).entry_receipt_url.toLowerCase().endsWith('.pdf') ? (
                                <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded">
                                  <FileText className="h-8 w-8 text-muted-foreground" />
                                  <div>
                                    <p className="text-xs font-medium text-foreground">Visualizar PDF</p>
                                    <p className="text-[10px] text-muted-foreground">Clique para abrir</p>
                                  </div>
                                </div>
                              ) : (
                                <img src={(charge as any).entry_receipt_url} alt="Comprovante entrada" className="w-full h-32 object-contain rounded cursor-pointer hover:opacity-80 transition-opacity" />
                              )}
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Parcelas */}
                    {installments.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Parcelas ({installments.filter(i => i.status === "paid").length}/{installments.length} pagas)
                        </p>
                        {installments.map(inst => {
                          const info = installmentStatusInfo(inst);
                          const isPix = charge?.notes?.toLowerCase().includes("pix");
                          const receiptPreview = installmentReceiptPreview[inst.id];
                          const receiptUrl = (inst as any).receipt_url;
                          const showReceiptUpload = inst.status !== "paid" && isPix;
                          
                          return (
                            <div key={inst.id} className={`space-y-2 p-2.5 rounded-lg border ${inst.status === "paid" ? "bg-emerald-500/5 border-emerald-500/20" : "bg-card border-border"}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="text-xs text-muted-foreground w-6 shrink-0 text-right font-mono">{inst.installment_number}.</span>
                                  <div className="min-w-0 flex-1">
                                    {editingInstallmentId === inst.id ? (
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={editingInstallmentAmount}
                                          onChange={(e) => setEditingInstallmentAmount(e.target.value)}
                                          className="h-7 text-xs w-24"
                                          autoFocus
                                        />
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-7 w-7"
                                          onClick={() => {
                                            const newAmount = parseFloat(editingInstallmentAmount);
                                            if (!isNaN(newAmount) && newAmount > 0) {
                                              updateInstallmentAmount.mutate(
                                                { installmentId: inst.id, amount: newAmount },
                                                {
                                                  onSuccess: () => {
                                                    setEditingInstallmentId(null);
                                                    setEditingInstallmentAmount("");
                                                    toast.success("Valor da parcela atualizado");
                                                  },
                                                  onError: (err: any) => toast.error(err.message || "Erro ao atualizar"),
                                                }
                                              );
                                            } else {
                                              toast.error("Valor inválido");
                                            }
                                          }}
                                          disabled={updateInstallmentAmount.isPending}
                                        >
                                          <Save className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-7 w-7"
                                          onClick={() => {
                                            setEditingInstallmentId(null);
                                            setEditingInstallmentAmount("");
                                          }}
                                        >
                                          <X className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <>
                                        <p className="text-xs font-semibold text-foreground">{fmtCurrency(Number(inst.amount))}</p>
                                        {inst.status !== "paid" && (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-5 w-5 ml-1"
                                            onClick={() => {
                                              setEditingInstallmentId(inst.id);
                                              setEditingInstallmentAmount(String(inst.amount));
                                            }}
                                            title="Editar valor"
                                          >
                                            <Pencil className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </>
                                    )}
                                    <p className="text-[10px] text-muted-foreground">
                                      Venc. {format(parseISO(inst.due_date), "dd/MM/yyyy")}
                                      {inst.paid_at && ` · Pago em ${format(parseISO(inst.paid_at), "dd/MM/yy")}`}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Badge className={`${info.bg} ${info.color} text-[9px] border-0`}>
                                    {info.label}
                                  </Badge>
                                  {inst.status !== "paid" ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-emerald-500 hover:bg-emerald-500/10"
                                      onClick={() => handleMarkInstallmentPaid(inst)}
                                      disabled={markPaid.isPending}
                                      title="Marcar como paga"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 text-destructive hover:bg-destructive/10"
                                      onClick={() => {
                                        if (confirm("Tem certeza que deseja desmarcar esta parcela como paga? O valor será subtraído do faturamento.")) {
                                          const paymentMethod = charge?.notes?.toLowerCase().includes("pix") ? "pix" : "perfectpay";
                                          unmarkPaid.mutate(
                                            {
                                              installmentId: inst.id,
                                              amount: Number(inst.amount),
                                              implementationId: implId,
                                              paymentMethod,
                                            },
                                            {
                                              onSuccess: () => {
                                                toast.success("Parcela desmarcada como paga. Faturamento atualizado.");
                                              },
                                              onError: (err: any) => toast.error(err.message || "Erro ao desmarcar parcela"),
                                            }
                                          );
                                        }
                                      }}
                                      disabled={unmarkPaid.isPending}
                                      title="Desmarcar como paga"
                                    >
                                      <XCircle className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                              
                              {/* Botão para abrir modal de comprovante (se PIX e não paga) */}
                              {showReceiptUpload && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full text-[10px] h-8"
                                  onClick={() => openReceiptModal(inst, false)}
                                >
                                  <Upload className="h-3 w-3 mr-1" />
                                  Adicionar comprovante
                                </Button>
                              )}
                              
                              {/* Exibir comprovante salvo (se paga) */}
                              {inst.status === "paid" && (
                                <div className="space-y-1.5">
                                  {receiptUrl ? (
                                    <div className="border rounded-md p-2 bg-secondary/30">
                                      <div className="flex items-center justify-between mb-1.5">
                                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                          {receiptUrl.toLowerCase().endsWith('.pdf') ? (
                                            <FileText className="h-3 w-3" />
                                          ) : (
                                            <Image className="h-3 w-3" />
                                          )}
                                          Comprovante PIX
                                        </p>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-5 w-5"
                                          onClick={() => openReceiptModal(inst, true)}
                                          title="Editar comprovante"
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                      </div>
                                      <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="block">
                                        {receiptUrl.toLowerCase().endsWith('.pdf') ? (
                                          <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded">
                                            <FileText className="h-8 w-8 text-muted-foreground" />
                                            <div>
                                              <p className="text-xs font-medium text-foreground">Visualizar PDF</p>
                                              <p className="text-[10px] text-muted-foreground">Clique para abrir</p>
                                            </div>
                                          </div>
                                        ) : (
                                          <img src={receiptUrl} alt="Comprovante" className="w-full h-32 object-contain rounded cursor-pointer hover:opacity-80 transition-opacity" />
                                        )}
                                      </a>
                                    </div>
                                  ) : (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="w-full text-[10px] h-8"
                                      onClick={() => openReceiptModal(inst, true)}
                                    >
                                      <Upload className="h-3 w-3 mr-1" />
                                      Adicionar comprovante
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {charge.notes && (
                      <p className="text-[10px] text-muted-foreground bg-secondary/40 rounded px-2 py-1">
                        <CreditCard className="h-3 w-3 inline mr-1" />
                        {charge.notes}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground space-y-2">
                    <CreditCard className="h-8 w-8 opacity-30" />
                    <p className="text-sm">Nenhuma cobrança vinculada</p>
                    <p className="text-xs text-center max-w-[200px]">
                      Ao criar a mentoria, configure a entrada e o parcelamento para gerar a cobrança automaticamente.
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* ── Notas ── */}
              <TabsContent value="notes" className="space-y-4 mt-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Adicionar uma nota..."
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && noteText.trim()) handleAddNote(); }}
                    className="bg-secondary text-sm flex-1"
                  />
                  <Button size="sm" onClick={handleAddNote} disabled={addNote.isPending}>
                    Adicionar
                  </Button>
                </div>
                <div className="space-y-3">
                  {notes.map((note: any) => (
                    <div key={note.id} className="flex gap-3">
                      <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-primary">
                          {(note.profiles?.full_name || "?")[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm text-foreground">{note.content}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {note.profiles?.full_name} · {format(parseISO(note.created_at), "d MMM, HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {notes.length === 0 && <p className="text-sm text-muted-foreground text-center">Nenhuma anotação ainda</p>}
                </div>
              </TabsContent>

              {/* ── Documentos ── */}
              <TabsContent value="docs" className="space-y-4 mt-4">
                {!addingDoc ? (
                  <Button variant="outline" size="sm" onClick={() => setAddingDoc(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar documento / link
                  </Button>
                ) : (
                  <div className="space-y-2 p-3 rounded-lg border border-border bg-secondary/30">
                    <Input placeholder="Título" value={docTitle} onChange={e => setDocTitle(e.target.value)} className="bg-card h-8 text-xs" />
                    <Input placeholder="URL" value={docUrl} onChange={e => setDocUrl(e.target.value)} className="bg-card h-8 text-xs" />
                    <div className="flex gap-2 items-center">
                      <Select value={docType} onValueChange={setDocType}>
                        <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="link">🔗 Link</SelectItem>
                          <SelectItem value="doc">📄 Documento</SelectItem>
                          <SelectItem value="video">🎥 Vídeo</SelectItem>
                          <SelectItem value="sheet">📊 Planilha</SelectItem>
                          <SelectItem value="other">📎 Outro</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" className="h-8 text-xs" onClick={handleAddDoc} disabled={addDoc.isPending}>Salvar</Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setAddingDoc(false)}>Cancelar</Button>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {documents.map((doc: any) => {
                    const Icon = DOC_TYPE_ICONS[doc.type] || File;
                    return (
                      <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-secondary/20">
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                            <p className="text-[11px] text-muted-foreground">{doc.profiles?.full_name} · {format(parseISO(doc.created_at), "d MMM", { locale: ptBR })}</p>
                          </div>
                        </div>
                        {doc.url && (
                          <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                  {documents.length === 0 && <p className="text-sm text-muted-foreground text-center">Nenhum documento adicionado</p>}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>

      {/* Modal de upload de comprovante */}
      <Dialog open={receiptModalOpen} onOpenChange={setReceiptModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {receiptModalIsEntry 
                ? (receiptModalIsPaid ? "Editar comprovante de entrada" : "Adicionar comprovante de entrada")
                : (receiptModalIsPaid ? "Editar comprovante" : "Adicionar comprovante")}
            </DialogTitle>
            <DialogDescription>
              {receiptModalIsEntry
                ? (receiptModalIsPaid 
                  ? "Faça upload de uma nova imagem ou PDF para substituir o comprovante de entrada atual."
                  : "Faça upload do comprovante de pagamento de entrada (imagem ou PDF).")
                : (receiptModalIsPaid 
                  ? "Faça upload de uma nova imagem ou PDF para substituir o comprovante atual."
                  : "Faça upload do comprovante de pagamento (imagem ou PDF).")}
            </DialogDescription>
          </DialogHeader>
          
          {receiptModalIsEntry ? (
            <div className="space-y-4 py-4">
              {entryReceiptPreview ? (
                <div className="relative border rounded-md p-3 bg-secondary/30">
                  {entryReceiptFile?.type === "application/pdf" ? (
                    <div className="flex items-center gap-3 p-3">
                      <FileText className="h-10 w-10 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{entryReceiptPreview}</p>
                        <p className="text-xs text-muted-foreground">PDF selecionado</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <img src={entryReceiptPreview} alt="Preview" className="w-full max-h-48 object-contain rounded" />
                      <p className="text-xs text-muted-foreground text-center">Preview do comprovante</p>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6"
                    onClick={() => {
                      setEntryReceiptFile(null);
                      setEntryReceiptPreview(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg p-6 cursor-pointer hover:bg-secondary/50 transition-colors">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Clique para selecionar arquivo</p>
                    <p className="text-xs text-muted-foreground mt-1">Imagem ou PDF (máx. 10MB)</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handleEntryReceiptChange}
                  />
                </label>
              )}
            </div>
          ) : receiptModalInstallmentId && (() => {
            const inst = installments.find(i => i.id === receiptModalInstallmentId);
            if (!inst) return null;
            const receiptPreview = installmentReceiptPreview[inst.id];
            const receiptFile = installmentReceiptFile[inst.id];
            
            return (
              <div className="space-y-4 py-4">
                {receiptPreview ? (
                  <div className="relative border rounded-md p-3 bg-secondary/30">
                    {receiptFile?.type === "application/pdf" ? (
                      <div className="flex items-center gap-3 p-3">
                        <FileText className="h-10 w-10 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{receiptPreview}</p>
                          <p className="text-xs text-muted-foreground">PDF selecionado</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <img src={receiptPreview} alt="Preview" className="w-full max-h-48 object-contain rounded" />
                        <p className="text-xs text-muted-foreground text-center">Preview do comprovante</p>
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6"
                      onClick={() => {
                        setInstallmentReceiptFile(prev => {
                          const next = { ...prev };
                          delete next[inst.id];
                          return next;
                        });
                        setInstallmentReceiptPreview(prev => {
                          const next = { ...prev };
                          delete next[inst.id];
                          return next;
                        });
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-lg p-6 cursor-pointer hover:bg-secondary/50 transition-colors">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">Clique para selecionar arquivo</p>
                      <p className="text-xs text-muted-foreground mt-1">Imagem ou PDF (máx. 10MB)</p>
                    </div>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => handleInstallmentReceiptChange(inst.id, e)}
                    />
                  </label>
                )}
              </div>
            );
          })()}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setReceiptModalOpen(false);
              setReceiptModalIsEntry(false);
              setEntryReceiptFile(null);
              setEntryReceiptPreview(null);
            }}>
              Cancelar
            </Button>
            {receiptModalIsEntry ? (
              <Button
                onClick={() => handleReceiptUpload()}
                disabled={!entryReceiptFile || updateEntryReceipt.isPending}
              >
                {updateEntryReceipt.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {receiptModalIsPaid ? "Atualizando..." : "Enviando..."}
                  </>
                ) : (
                  receiptModalIsPaid ? "Atualizar comprovante" : "Adicionar comprovante"
                )}
              </Button>
            ) : receiptModalInstallmentId && (() => {
              const inst = installments.find(i => i.id === receiptModalInstallmentId);
              if (!inst) return null;
              return (
                <Button
                  onClick={() => handleReceiptUpload(inst)}
                  disabled={!installmentReceiptFile[inst.id] || (receiptModalIsPaid ? updateInstallmentReceipt.isPending : markPaid.isPending)}
                >
                  {receiptModalIsPaid ? updateInstallmentReceipt.isPending : markPaid.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {receiptModalIsPaid ? "Atualizando..." : "Processando..."}
                    </>
                  ) : (
                    receiptModalIsPaid ? "Atualizar comprovante" : "Marcar como paga"
                  )}
                </Button>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
