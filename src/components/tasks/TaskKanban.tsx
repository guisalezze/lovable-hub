import { type Task, type TaskStatus, useUpdateTask } from "@/hooks/useTasks";
import { Badge } from "@/components/ui/badge";
import { Calendar, User } from "lucide-react";
import { toast } from "sonner";

const columns: { status: TaskStatus; label: string; color: string }[] = [
  { status: "backlog", label: "Backlog", color: "bg-muted-foreground/20 text-muted-foreground" },
  { status: "em_andamento", label: "Em Andamento", color: "bg-primary/20 text-primary" },
  { status: "bloqueado", label: "Bloqueado", color: "bg-warning/20 text-warning" },
  { status: "concluido", label: "Concluído", color: "bg-success/20 text-success" },
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
}

export function TaskKanban({ tasks, onTaskClick, members }: Props) {
  const updateTask = useUpdateTask();

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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {columns.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.status);
        return (
          <div key={col.status} className="min-h-[200px]">
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${col.color}`}>{col.label}</span>
              <span className="text-xs text-muted-foreground">{colTasks.length}</span>
            </div>
            <div className="space-y-2">
              {colTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onTaskClick(task)}
                  className={`glass-card p-3 cursor-pointer border-l-2 ${priorityColor[task.priority]} hover:border-primary/30 transition-colors group`}
                >
                  <p className="text-sm font-medium text-foreground">{task.title}</p>
                  {task.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {task.due_date && (
                      <span className={`text-[10px] flex items-center gap-0.5 ${new Date(task.due_date) < new Date() && task.status !== "concluido" ? "text-destructive" : "text-muted-foreground"}`}>
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
                  {/* Quick move buttons */}
                  <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {columns.filter((c) => c.status !== task.status).map((c) => (
                      <button
                        key={c.status}
                        onClick={(e) => { e.stopPropagation(); moveTask(task.id, c.status); }}
                        className={`text-[9px] px-1.5 py-0.5 rounded ${c.color}`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {colTasks.length === 0 && (
                <div className="text-center py-8 text-xs text-muted-foreground">Sem tarefas</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
