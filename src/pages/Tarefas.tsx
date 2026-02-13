import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

type TaskStatus = "backlog" | "em_andamento" | "concluido";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_date: string | null;
  lead_email: string | null;
  created_at: string;
}

const taskColumns: { status: TaskStatus; label: string; color: string }[] = [
  { status: "backlog", label: "Backlog", color: "bg-muted-foreground/20 text-muted-foreground" },
  { status: "em_andamento", label: "Em Andamento", color: "bg-primary/20 text-primary" },
  { status: "concluido", label: "Concluído", color: "bg-success/20 text-success" },
];

export default function TarefasPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    fetchTasks();
  }, []);

  async function fetchTasks() {
    const { data } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    setTasks((data as Task[]) || []);
    setLoading(false);
  }

  async function createTask() {
    if (!title.trim()) return toast.error("Título obrigatório");
    const { error } = await supabase.from("tasks").insert({ title, description: desc || null });
    if (error) return toast.error("Erro ao criar tarefa");
    toast.success("Tarefa criada");
    setTitle("");
    setDesc("");
    setOpen(false);
    fetchTasks();
  }

  async function updateStatus(id: string, status: TaskStatus) {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
    if (error) return toast.error("Erro");
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tarefas</h1>
          <p className="text-sm text-muted-foreground mt-1">{tasks.length} tarefas</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Nova Tarefa</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Tarefa</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <Input placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Input placeholder="Descrição (opcional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
              <Button onClick={createTask} className="w-full">Criar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {taskColumns.map((col) => (
            <div key={col.status}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${col.color}`}>{col.label}</span>
                <span className="text-xs text-muted-foreground">
                  {tasks.filter((t) => t.status === col.status).length}
                </span>
              </div>
              <div className="space-y-2">
                {tasks
                  .filter((t) => t.status === col.status)
                  .map((task) => (
                    <div key={task.id} className="glass-card p-3 group hover:border-primary/30 transition-colors">
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground/30 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{task.title}</p>
                          {task.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>
                          )}
                          <div className="flex gap-1 mt-2">
                            {taskColumns
                              .filter((c) => c.status !== task.status)
                              .map((c) => (
                                <button
                                  key={c.status}
                                  onClick={() => updateStatus(task.id, c.status)}
                                  className={`text-[9px] px-1.5 py-0.5 rounded ${c.color} opacity-0 group-hover:opacity-100 transition-opacity`}
                                >
                                  {c.label}
                                </button>
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
