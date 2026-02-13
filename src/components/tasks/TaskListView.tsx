import { type Task, type TaskStatus, useUpdateTask } from "@/hooks/useTasks";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, User, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const statusLabel: Record<TaskStatus, { label: string; color: string }> = {
  backlog: { label: "Backlog", color: "bg-muted-foreground/20 text-muted-foreground" },
  em_andamento: { label: "Em Andamento", color: "bg-primary/20 text-primary" },
  bloqueado: { label: "Bloqueado", color: "bg-warning/20 text-warning" },
  concluido: { label: "Concluído", color: "bg-success/20 text-success" },
};

const priorityLabel: Record<string, { label: string; color: string }> = {
  baixa: { label: "Baixa", color: "text-muted-foreground" },
  media: { label: "Média", color: "text-foreground" },
  alta: { label: "Alta", color: "text-warning" },
  urgente: { label: "Urgente", color: "text-destructive" },
};

interface Props {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  members?: { id: string; full_name: string; email: string }[];
  compact?: boolean;
}

export function TaskListView({ tasks, onTaskClick, members, compact }: Props) {
  const updateTask = useUpdateTask();

  const toggleComplete = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateTask.mutateAsync({
        id: task.id,
        status: task.status === "concluido" ? "backlog" : "concluido",
      });
    } catch {
      toast.error("Erro");
    }
  };

  const getMemberName = (id: string | null) => {
    if (!id || !members) return null;
    return members.find((m) => m.id === id)?.full_name?.split(" ")[0] || "...";
  };

  const isOverdue = (task: Task) => task.due_date && new Date(task.due_date) < new Date() && task.status !== "concluido";

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className={`grid ${compact ? "grid-cols-[32px_1fr_80px_80px_100px]" : "grid-cols-[32px_1fr_100px_80px_100px_80px]"} gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold`}>
        <div />
        <div>Título</div>
        <div>Status</div>
        <div>Prioridade</div>
        <div>Prazo</div>
        {!compact && <div>Responsável</div>}
      </div>
      {tasks.map((task) => (
        <div
          key={task.id}
          onClick={() => onTaskClick(task)}
          className={`grid ${compact ? "grid-cols-[32px_1fr_80px_80px_100px]" : "grid-cols-[32px_1fr_100px_80px_100px_80px]"} gap-2 px-3 ${compact ? "py-1.5" : "py-2.5"} glass-card cursor-pointer hover:border-primary/30 transition-colors items-center`}
        >
          <div onClick={(e) => toggleComplete(task, e)}>
            <Checkbox checked={task.status === "concluido"} />
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-medium truncate ${task.status === "concluido" ? "line-through text-muted-foreground" : "text-foreground"}`}>
              {task.title}
            </p>
            {!compact && task.tags?.length > 0 && (
              <div className="flex gap-1 mt-0.5">
                {task.tags.map((t) => <Badge key={t} variant="secondary" className="text-[9px] px-1 py-0">{t}</Badge>)}
              </div>
            )}
          </div>
          <Badge variant="secondary" className={`text-[10px] justify-center ${statusLabel[task.status]?.color}`}>
            {statusLabel[task.status]?.label}
          </Badge>
          <span className={`text-xs ${priorityLabel[task.priority]?.color}`}>
            {priorityLabel[task.priority]?.label}
          </span>
          <span className={`text-xs flex items-center gap-1 ${isOverdue(task) ? "text-destructive" : "text-muted-foreground"}`}>
            {isOverdue(task) && <AlertTriangle className="h-3 w-3" />}
            {task.due_date || "–"}
          </span>
          {!compact && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              {task.assigned_to && <><User className="h-3 w-3" />{getMemberName(task.assigned_to)}</>}
            </span>
          )}
        </div>
      ))}
      {tasks.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">Nenhuma tarefa encontrada</p>
          <p className="text-xs mt-1">Crie sua primeira tarefa para começar</p>
        </div>
      )}
    </div>
  );
}
