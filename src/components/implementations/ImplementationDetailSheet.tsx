import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Circle, Clock, Plus, ExternalLink,
  FileText, Link2, Video, Table2, File, Loader2,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useImplementationDetail, useUpdateStepStatus,
  useAddDocument, useAddNote,
} from "@/hooks/useImplementations";
import type { ImplementationStep } from "@/hooks/useImplementations";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { LtvBadge } from "@/components/shared/LtvBadge";

const DOC_TYPE_ICONS: Record<string, any> = {
  link: Link2, doc: FileText, video: Video, sheet: Table2, other: File,
};

const STEP_STATUS_CONFIG = {
  pending: { label: "Pendente", icon: Circle, color: "text-muted-foreground" },
  in_progress: { label: "Em andamento", icon: Clock, color: "text-primary" },
  done: { label: "Concluído", icon: CheckCircle2, color: "text-emerald-500" },
};

export function ImplementationDetailSheet({
  implId, open, onClose,
}: { implId: string; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useImplementationDetail(implId);
  const updateStep = useUpdateStepStatus();
  const addDoc = useAddDocument();
  const addNote = useAddNote();

  const [noteText, setNoteText] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [docType, setDocType] = useState("link");
  const [addingDoc, setAddingDoc] = useState(false);

  if (!data && !isLoading) return null;

  const impl = data?.implementation;
  const documents = data?.documents || [];
  const notes = data?.notes || [];

  const fmtCurrency = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const daysLeft = impl ? differenceInDays(parseISO(impl.contract_end), new Date()) : 0;
  const steps = (impl?.implementation_steps || []).sort((a, b) => a.order_index - b.order_index);
  const progress = steps.length > 0 ? Math.round(steps.filter(s => s.status === "done").length / steps.length * 100) : 0;

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

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : impl ? (
          <>
            <SheetHeader>
              <div className="flex items-start justify-between">
                <div>
                  <SheetTitle>{impl.client_name}</SheetTitle>
                  {impl.client_email && <LtvBadge email={impl.client_email} size="md" />}
                  {impl.description && <p className="text-sm text-muted-foreground mt-1">{impl.description}</p>}
                </div>
                <p className="text-lg font-bold text-foreground shrink-0">{fmtCurrency(impl.total_value)}</p>
              </div>

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
            </SheetHeader>

            <Tabs defaultValue="steps" className="mt-6">
              <TabsList className="w-full">
                <TabsTrigger value="steps" className="flex-1">Etapas</TabsTrigger>
                <TabsTrigger value="notes" className="flex-1">Notas</TabsTrigger>
                <TabsTrigger value="docs" className="flex-1">Documentos</TabsTrigger>
              </TabsList>

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
                <p className="text-[11px] text-muted-foreground text-center pt-2">Clique em uma etapa para avançar o status</p>
              </TabsContent>

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
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
