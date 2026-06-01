import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTasks, useCreateTask, type Task } from "@/hooks/useTasks";
import { useGoogleAuth } from "@/hooks/useGoogleAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Phone,
  CheckSquare,
  Video,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isSameDay,
  isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface Call {
  id: string;
  lead_email: string | null;
  start_at: string;
  end_at: string | null;
  status: string;
  meet_link: string | null;
  notes: string | null;
}

interface Lead {
  email: string;
  full_name: string | null;
}

function useCalls() {
  return useQuery({
    queryKey: ["calls"],
    queryFn: async () => {
      const { data } = await supabase
        .from("calls")
        .select("*")
        .order("start_at", { ascending: true });
      return (data as Call[]) || [];
    },
  });
}

function useLeads() {
  return useQuery({
    queryKey: ["leads-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("email, full_name")
        .order("full_name", { ascending: true });
      return (data as Lead[]) || [];
    },
  });
}

export default function AgendaPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showCallDialog, setShowCallDialog] = useState(false);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [showEditCallDialog, setShowEditCallDialog] = useState(false);
  const [editingCall, setEditingCall] = useState<Call | null>(null);

  const { data: calls = [], isLoading: loadingCalls } = useCalls();
  const { data: tasks = [], isLoading: loadingTasks } = useTasks();
  const { data: leads = [] } = useLeads();
  const googleAuth = useGoogleAuth();

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const startPadding = getDay(days[0]);
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const getCallsForDay = (day: Date) =>
    calls.filter((c) => isSameDay(new Date(c.start_at), day));

  const getTasksForDay = (day: Date) =>
    tasks.filter((t) => t.due_date && isSameDay(new Date(t.due_date), day));

  const priorityDot: Record<string, string> = {
    baixa: "bg-muted-foreground",
    media: "bg-foreground",
    alta: "bg-warning",
    urgente: "bg-destructive",
  };

  const handleDayClick = (day: Date) => {
    setSelectedDay(day);
  };

  const selectedDayCalls = selectedDay ? getCallsForDay(selectedDay) : [];
  const selectedDayTasks = selectedDay ? getTasksForDay(selectedDay) : [];

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agenda</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Calendário de calls e tarefas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedDay(new Date());
              setShowCallDialog(true);
            }}
          >
            <Phone className="h-4 w-4 mr-1" />
            Nova Call
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setSelectedDay(new Date());
              setShowTaskDialog(true);
            }}
          >
            <CheckSquare className="h-4 w-4 mr-1" />
            Nova Tarefa
          </Button>
        </div>
      </div>

      {/* Calendar */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-sm font-semibold text-foreground capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-px">
          {dayNames.map((d) => (
            <div
              key={d}
              className="text-center text-[11px] text-muted-foreground font-semibold py-2"
            >
              {d}
            </div>
          ))}
          {Array.from({ length: startPadding }).map((_, i) => (
            <div key={`pad-${i}`} className="min-h-[90px]" />
          ))}
          {days.map((day) => {
            const dayCalls = getCallsForDay(day);
            const dayTasks = getTasksForDay(day);
            const today = isToday(day);
            const isSelected = selectedDay && isSameDay(day, selectedDay);
            const totalItems = dayCalls.length + dayTasks.length;

            return (
              <div
                key={day.toISOString()}
                onClick={() => handleDayClick(day)}
                className={`min-h-[90px] p-1.5 border border-border/30 rounded-sm cursor-pointer transition-colors hover:bg-accent/30 ${
                  today ? "bg-primary/5 border-primary/30" : ""
                } ${isSelected ? "ring-1 ring-primary bg-primary/10" : ""}`}
              >
                <p
                  className={`text-[11px] font-medium mb-0.5 ${
                    today ? "text-primary font-bold" : "text-muted-foreground"
                  }`}
                >
                  {format(day, "d")}
                </p>
                <div className="space-y-0.5">
                  {dayCalls.slice(0, 2).map((call) => (
                    <div
                      key={call.id}
                      className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary truncate flex items-center gap-1"
                    >
                      <Phone className="h-2.5 w-2.5 shrink-0" />
                      {format(new Date(call.start_at), "HH:mm")}{" "}
                      {call.lead_email?.split("@")[0] || "Call"}
                    </div>
                  ))}
                  {dayTasks.slice(0, 2).map((t) => (
                    <div
                      key={t.id}
                      className="text-[9px] px-1 py-0.5 rounded bg-secondary/50 text-foreground truncate flex items-center gap-1"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot[t.priority]}`}
                      />
                      {t.title}
                    </div>
                  ))}
                  {totalItems > 4 && (
                    <p className="text-[9px] text-muted-foreground px-1">
                      +{totalItems - 4} mais
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">
              {format(selectedDay, "dd 'de' MMMM, EEEE", { locale: ptBR })}
            </h3>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCallDialog(true)}
              >
                <Phone className="h-3.5 w-3.5 mr-1" />
                Call
              </Button>
              <Button size="sm" onClick={() => setShowTaskDialog(true)}>
                <CheckSquare className="h-3.5 w-3.5 mr-1" />
                Tarefa
              </Button>
            </div>
          </div>

          {selectedDayCalls.length === 0 && selectedDayTasks.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">
              Nenhum evento neste dia
            </p>
          ) : (
            <div className="space-y-2">
              {selectedDayCalls.map((call) => (
                <div
                  key={call.id}
                  onClick={() => { setEditingCall(call); setShowEditCallDialog(true); }}
                  className="flex items-center gap-3 p-3 rounded-md bg-primary/5 border border-primary/10 cursor-pointer hover:bg-primary/10 transition-colors"
                >
                  <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Video className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {call.lead_email || "Call"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(call.start_at), "HH:mm", {
                        locale: ptBR,
                      })}
                      {call.end_at &&
                        ` - ${format(new Date(call.end_at), "HH:mm", { locale: ptBR })}`}
                    </p>
                  </div>
                  {call.meet_link && (
                    <a
                      href={call.meet_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-primary hover:underline shrink-0"
                      onClick={e => e.stopPropagation()}
                    >
                      Entrar
                    </a>
                  )}
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {call.status}
                  </Badge>
                </div>
              ))}
              {selectedDayTasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 p-3 rounded-md bg-secondary/30"
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${priorityDot[t.priority]}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {t.title}
                    </p>
                    {t.lead_email && (
                      <p className="text-xs text-muted-foreground truncate">
                        {t.lead_email}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {t.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Call Dialog */}
      <NewCallDialog
        open={showCallDialog}
        onOpenChange={setShowCallDialog}
        leads={leads}
        defaultDate={selectedDay || new Date()}
        googleAuth={googleAuth}
      />

      {/* New Task Dialog */}
      <NewTaskDialog
        open={showTaskDialog}
        onOpenChange={setShowTaskDialog}
        leads={leads}
        defaultDate={selectedDay || new Date()}
        googleAuth={googleAuth}
      />

      {/* Edit Call Dialog */}
      {editingCall && (
        <EditCallDialog
          open={showEditCallDialog}
          onOpenChange={(v) => { setShowEditCallDialog(v); if (!v) setEditingCall(null); }}
          call={editingCall}
          leads={leads}
        />
      )}
    </div>
  );
}

/* ---- New Call Dialog ---- */
function NewCallDialog({
  open,
  onOpenChange,
  leads,
  defaultDate,
  googleAuth,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leads: Lead[];
  defaultDate: Date;
  googleAuth: ReturnType<typeof useGoogleAuth>;
}) {
  const qc = useQueryClient();
  const [leadSearch, setLeadSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [meetLink, setMeetLink] = useState("");
  const [notes, setNotes] = useState("");

  const filteredLeads = leads.filter(
    (l) =>
      l.email.toLowerCase().includes(leadSearch.toLowerCase()) ||
      (l.full_name || "").toLowerCase().includes(leadSearch.toLowerCase())
  );

  useEffect(() => {
    if (open) setDate(format(defaultDate, "yyyy-MM-dd"));
  }, [open, defaultDate]);

  const createCall = useMutation({
    mutationFn: async () => {
      const startAt = new Date(`${date}T${time}:00`);
      const { data: { user } } = await supabase.auth.getUser();
      const { data: callData, error } = await supabase.from("calls").insert({
        lead_email: selectedLead || null,
        start_at: startAt.toISOString(),
        meet_link: meetLink || null,
        notes: notes || null,
        owner_user_id: user?.id || null,
      }).select().single();
      if (error) throw error;

      // Google Calendar integration
      if (googleAuth.isConnected && callData) {
        try {
          const leadName = selectedLead ? selectedLead.split("@")[0] : "Call";
          const result = await googleAuth.createCalendarEvent({
            title: `Call com ${leadName}`,
            start: startAt.toISOString(),
            type: "call",
          });
          if (result?.meetLink || result?.eventId) {
            await supabase.from("calls").update({
              meet_link: result.meetLink || callData.meet_link,
              google_event_id: result.eventId,
            }).eq("id", callData.id);
          }
        } catch (e) {
          console.error("Google Calendar sync failed:", e);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calls"] });
      toast.success("Call agendada!");
      onOpenChange(false);
      resetForm();
    },
    onError: () => toast.error("Erro ao criar call"),
  });

  const resetForm = () => {
    setLeadSearch("");
    setSelectedLead("");
    setDate("");
    setTime("10:00");
    setMeetLink("");
    setNotes("");
  };

  // Set default date when dialog opens
  const handleOpenChange = (v: boolean) => {
    if (v) setDate(format(defaultDate, "yyyy-MM-dd"));
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            Nova Call
          </DialogTitle>
          <DialogDescription>
            Agende uma nova chamada com um lead.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Lead
            </label>
            <Input
              placeholder="Buscar por nome ou email..."
              value={leadSearch}
              onChange={(e) => {
                setLeadSearch(e.target.value);
                setSelectedLead("");
              }}
            />
            {leadSearch && !selectedLead && (
              <div className="border border-border rounded-md mt-1 max-h-32 overflow-y-auto bg-popover">
                {filteredLeads.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">
                    Nenhum lead encontrado
                  </p>
                ) : (
                  filteredLeads.slice(0, 8).map((l) => (
                    <button
                      key={l.email}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                      onClick={() => {
                        setSelectedLead(l.email);
                        setLeadSearch(
                          l.full_name ? `${l.full_name} (${l.email})` : l.email
                        );
                      }}
                    >
                      <span className="font-medium">
                        {l.full_name || l.email}
                      </span>
                      {l.full_name && (
                        <span className="text-muted-foreground text-xs ml-2">
                          {l.email}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
            {selectedLead && (
              <p className="text-xs text-primary mt-1">✓ {selectedLead}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Data
              </label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Horário
              </label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Link do Meet (opcional)
            </label>
            <Input
              placeholder="https://meet.google.com/..."
              value={meetLink}
              onChange={(e) => setMeetLink(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Notas (opcional)
            </label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => createCall.mutate()}
            disabled={!date || createCall.isPending}
          >
            {createCall.isPending ? "Salvando..." : "Agendar Call"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---- New Task Dialog ---- */
function NewTaskDialog({
  open,
  onOpenChange,
  leads,
  defaultDate,
  googleAuth,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leads: Lead[];
  defaultDate: Date;
  googleAuth: ReturnType<typeof useGoogleAuth>;
}) {
  const createTask = useCreateTask();
  const [title, setTitle] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("media");

  const filteredLeads = leads.filter(
    (l) =>
      l.email.toLowerCase().includes(leadSearch.toLowerCase()) ||
      (l.full_name || "").toLowerCase().includes(leadSearch.toLowerCase())
  );

  useEffect(() => {
    if (open) setDueDate(format(defaultDate, "yyyy-MM-dd"));
  }, [open, defaultDate]);

  const handleOpenChange = (v: boolean) => {
    onOpenChange(v);
  };

  const handleSubmit = () => {
    createTask.mutate(
      {
        title,
        due_date: dueDate || null,
        lead_email: selectedLead || null,
        priority: priority as any,
      },
      {
        onSuccess: async () => {
          // Google Calendar integration for tasks with due date
          if (googleAuth.isConnected && dueDate) {
            try {
              await googleAuth.createCalendarEvent({
                title,
                start: `${dueDate}T00:00:00`,
                type: "task",
              });
            } catch (e) {
              console.error("Google Calendar sync failed:", e);
            }
          }
          toast.success("Tarefa criada!");
          onOpenChange(false);
          setTitle("");
          setLeadSearch("");
          setSelectedLead("");
          setDueDate("");
          setPriority("media");
        },
        onError: () => toast.error("Erro ao criar tarefa"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-primary" />
            Nova Tarefa
          </DialogTitle>
          <DialogDescription>
            Crie uma nova tarefa para acompanhar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Título
            </label>
            <Input
              placeholder="O que precisa ser feito?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Lead (opcional)
            </label>
            <Input
              placeholder="Buscar por nome ou email..."
              value={leadSearch}
              onChange={(e) => {
                setLeadSearch(e.target.value);
                setSelectedLead("");
              }}
            />
            {leadSearch && !selectedLead && (
              <div className="border border-border rounded-md mt-1 max-h-32 overflow-y-auto bg-popover">
                {filteredLeads.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-2">
                    Nenhum lead encontrado
                  </p>
                ) : (
                  filteredLeads.slice(0, 8).map((l) => (
                    <button
                      key={l.email}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                      onClick={() => {
                        setSelectedLead(l.email);
                        setLeadSearch(
                          l.full_name ? `${l.full_name} (${l.email})` : l.email
                        );
                      }}
                    >
                      <span className="font-medium">
                        {l.full_name || l.email}
                      </span>
                      {l.full_name && (
                        <span className="text-muted-foreground text-xs ml-2">
                          {l.email}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
            {selectedLead && (
              <p className="text-xs text-primary mt-1">✓ {selectedLead}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Data
              </label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Prioridade
              </label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={!title || createTask.isPending}
          >
            {createTask.isPending ? "Salvando..." : "Criar Tarefa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---- Edit Call Dialog ---- */
function EditCallDialog({
  open,
  onOpenChange,
  call,
  leads,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  call: Call;
  leads: Lead[];
}) {
  const qc = useQueryClient();
  const startDate = new Date(call.start_at);
  const [date, setDate] = useState(format(startDate, "yyyy-MM-dd"));
  const [time, setTime] = useState(format(startDate, "HH:mm"));
  const [meetLink, setMeetLink] = useState(call.meet_link || "");
  const [notes, setNotes] = useState(call.notes || "");
  const [status, setStatus] = useState(call.status);

  const updateCall = useMutation({
    mutationFn: async () => {
      const startAt = new Date(`${date}T${time}:00`);
      const { error } = await supabase.from("calls").update({
        start_at: startAt.toISOString(),
        meet_link: meetLink || null,
        notes: notes || null,
        status: status as any,
      }).eq("id", call.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calls"] });
      toast.success("Call atualizada!");
      onOpenChange(false);
    },
    onError: () => toast.error("Erro ao atualizar call"),
  });

  const deleteCall = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("calls").delete().eq("id", call.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calls"] });
      toast.success("Call excluída!");
      onOpenChange(false);
    },
    onError: () => toast.error("Erro ao excluir call"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-primary" />
                Editar Call
              </DialogTitle>
              <DialogDescription>
                Edite os detalhes da chamada agendada.
              </DialogDescription>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive gap-1 h-8"
              onClick={() => deleteCall.mutate()}
              disabled={deleteCall.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </Button>
          </div>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Lead</label>
            <p className="text-sm text-foreground">{call.lead_email || "Sem lead vinculado"}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Data</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Horário</label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Agendada</SelectItem>
                <SelectItem value="completed">Realizada</SelectItem>
                <SelectItem value="canceled">Cancelada</SelectItem>
                <SelectItem value="no_show">Não compareceu</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Link do Meet</label>
            <Input placeholder="https://meet.google.com/..." value={meetLink} onChange={(e) => setMeetLink(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Notas</label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => updateCall.mutate()} disabled={!date || updateCall.isPending}>
            {updateCall.isPending ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
