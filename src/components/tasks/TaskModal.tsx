import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateTask, useUpdateTask, useTeamMembers, type Task, type TaskStatus, type TaskPriority } from "@/hooks/useTasks";
import { toast } from "sonner";
import { Plus, Trash2, CheckSquare } from "lucide-react";

const statusOptions: { value: TaskStatus; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "em_andamento", label: "Em Andamento" },
  { value: "bloqueado", label: "Bloqueado" },
  { value: "concluido", label: "Concluído" },
];

const priorityOptions: { value: TaskPriority; label: string; color: string }[] = [
  { value: "baixa", label: "Baixa", color: "text-muted-foreground" },
  { value: "media", label: "Média", color: "text-foreground" },
  { value: "alta", label: "Alta", color: "text-warning" },
  { value: "urgente", label: "Urgente", color: "text-destructive" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task?: Task | null;
}

export function TaskModal({ open, onOpenChange, task }: Props) {
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [status, setStatus] = useState<TaskStatus>(task?.status || "backlog");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || "media");
  const [dueDate, setDueDate] = useState(task?.due_date || "");
  const [assignedTo, setAssignedTo] = useState(task?.assigned_to || "");
  const [tags, setTags] = useState(task?.tags?.join(", ") || "");
  const [checklist, setChecklist] = useState<{ text: string; done: boolean }[]>(task?.checklist || []);
  const [newCheckItem, setNewCheckItem] = useState("");

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const { data: members } = useTeamMembers();

  const isEdit = !!task;

  const handleSubmit = async () => {
    if (!title.trim()) return toast.error("Título obrigatório");
    const payload = {
      title,
      description: description || null,
      status,
      priority,
      due_date: dueDate || null,
      assigned_to: assignedTo || null,
      tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      checklist,
    };

    try {
      if (isEdit) {
        await updateTask.mutateAsync({ id: task.id, ...payload });
        toast.success("Tarefa atualizada");
      } else {
        await createTask.mutateAsync(payload as any);
        toast.success("Tarefa criada");
      }
      onOpenChange(false);
    } catch {
      toast.error("Erro ao salvar tarefa");
    }
  };

  const addCheckItem = () => {
    if (!newCheckItem.trim()) return;
    setChecklist([...checklist, { text: newCheckItem, done: false }]);
    setNewCheckItem("");
  };

  const toggleCheckItem = (idx: number) => {
    setChecklist(checklist.map((c, i) => i === idx ? { ...c, done: !c.done } : c));
  };

  const removeCheckItem = (idx: number) => {
    setChecklist(checklist.filter((_, i) => i !== idx));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <Input placeholder="Título *" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="Descrição (markdown)" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Prioridade</label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {priorityOptions.map((p) => <SelectItem key={p.value} value={p.value}><span className={p.color}>{p.label}</span></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Prazo</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Responsável</label>
              <Select value={assignedTo || "none"} onValueChange={(v) => setAssignedTo(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Ninguém" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguém</SelectItem>
                  {members?.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Tags (separadas por vírgula)</label>
            <Input placeholder="follow-up, urgente" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>

          {/* Checklist */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Checklist</label>
            <div className="space-y-1">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2 group">
                  <button onClick={() => toggleCheckItem(i)} className="shrink-0">
                    <CheckSquare className={`h-4 w-4 ${item.done ? "text-success" : "text-muted-foreground"}`} />
                  </button>
                  <span className={`text-sm flex-1 ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{item.text}</span>
                  <button onClick={() => removeCheckItem(i)} className="opacity-0 group-hover:opacity-100">
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  placeholder="Novo item..."
                  value={newCheckItem}
                  onChange={(e) => setNewCheckItem(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCheckItem()}
                  className="h-8 text-sm"
                />
                <Button size="sm" variant="ghost" onClick={addCheckItem}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>

          <Button onClick={handleSubmit} className="w-full" disabled={createTask.isPending || updateTask.isPending}>
            {isEdit ? "Salvar" : "Criar Tarefa"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
