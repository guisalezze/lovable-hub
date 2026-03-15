import { useRef, useState } from "react";
import { type Task, type TaskStatus, useUpdateTask } from "@/hooks/useTasks";
import { Badge } from "@/components/ui/badge";
import { Calendar, User, AlertCircle, CheckCircle2, PlayCircle } from "lucide-react";
import { toast } from "sonner";

const columns: { status: TaskStatus; label: string; color: string; dropBg: string }[] = [
  { status: "backlog", label: "Backlog", color: "bg-muted-foreground/20 text-muted-foreground", dropBg: "bg-muted/40" },
  { status: "em_andamento", label: "Em Andamento", color: "bg-primary/20 text-primary", dropBg: "bg-primary/5" },
  { status: "bloqueado", label: "Bloqueado", color: "bg-warning/20 text-warning", dropBg: "bg-warning/5" },
  { status: "concluido", label: "Concluído", color: "bg-success/20 text-success", dropBg: "bg-success/5" },
];

const priorityColor: Record<string, string> = {
  baixa: "border-l-muted-foreground",
  media: "border-l-foreground",
  alta: "border-l-warning",
  urgente: "border-l-destructive",
};

interface Props {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  members?: { id: string; full_name: string; email: string }[];
  isOverdue?: (task: Task) => boolean;
}

export function TaskKanban({ tasks, onTaskClick, members, isOverdue }: Props) {
  const updateTask = useUpdateTask();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);
  const dragTask = useRef<Task | null>(null);

  const moveTask = async (id: string, status: TaskStatus) => {
    try {
      await updateTask.mutateAsync({ id, status });
    } catch {
      toast.error("Erro ao mover tarefa");
    }
  };

  const getMemberName = (id: string | null) => {
    if (!id || !members) return null;
    const m = members.find((m) => m.id === id);
    return m?.full_name || m?.email || null;
  };

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    dragTask.current = task;
    setDraggingId(task.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverCol(null);
    dragTask.current = null;
  };

  const handleDragOver = (e: React.DragEvent, colStatus: TaskStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(colStatus);
  };

  const handleDragLeave = () => {
    setDragOverCol(null);
  };

  const handleDrop = async (e: React.DragEvent, colStatus: TaskStatus) => {
    e.preventDefault();
    setDragOverCol(null);
    if (dragTask.current && dragTask.current.status !== colStatus) {
      await moveTask(dragTask.current.id, colStatus);
    }
    setDraggingId(null);
    dragTask.current = null;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {columns.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.status);
        const isDropTarget = dragOverCol === col.status;
        return (
          <div
            key={col.status}
            className={`min-h-[200px] rounded-xl transition-colors duration-150 p-2 -m-2 ${isDropTarget ? col.dropBg + " ring-2 ring-primary/30" : ""}`}
            onDragOver={(e) => handleDragOver(e, col.status)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.status)}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${col.color}`}>{col.label}</span>
              <Badge variant="secondary" className="text-[10px] px-1.5">{colTasks.length}</Badge>
            </div>
            <div className="space-y-2">
              {colTasks.map((task) => {
                const overdue = isOverdue?.(task) ?? false;
                const isDragging = draggingId === task.id;
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onTaskClick(task)}
                    className={`glass-card p-3 cursor-grab active:cursor-grabbing border-l-2 ${priorityColor[task.priority]} hover:border-primary/30 transition-all ${overdue ? "border-destructive/50 bg-destructive/5" : ""} ${isDragging ? "opacity-40 scale-95" : ""}`}
                  >
                    <div className="flex items-start gap-1.5">
                      {overdue && <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
                      <p className="text-sm font-medium text-foreground flex-1">{task.title}</p>
                    </div>
                    {task.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {task.due_date && (
                        <span className={`text-[10px] flex items-center gap-0.5 ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                          <Calendar className="h-3 w-3" />
                          {task.due_date}
                        </span>
                      )}
                      {task.assigned_to && (
                        <span className="text-[10px] flex items-center gap-0.5 text-muted-foreground">
                          <User className="h-3 w-3" />
                          {getMemberName(task.assigned_to)?.split(" ")[0] || "..."}
                        </span>
                      )}
                      {task.tags?.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[9px] px-1 py-0">{tag}</Badge>
                      ))}
                    </div>

                    {/* Quick status buttons — always visible */}
                    <div className="flex gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                      {task.status !== "em_andamento" && (
                        <button
                          onClick={() => moveTask(task.id, "em_andamento")}
                          className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
                          title="Mover para Em Andamento"
                        >
                          <PlayCircle className="h-3 w-3" />
                          Andamento
                        </button>
                      )}
                      {task.status !== "concluido" && (
                        <button
                          onClick={() => moveTask(task.id, "concluido")}
                          className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-success/15 text-success hover:bg-success/25 transition-colors"
                          title="Marcar como Concluído"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Concluído
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {colTasks.length === 0 && (
                <div className={`text-center py-10 text-xs rounded-lg border-2 border-dashed transition-colors ${isDropTarget ? "border-primary/40 text-primary" : "border-border text-muted-foreground"}`}>
                  {isDropTarget ? "Solte aqui" : "Sem tarefas"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
