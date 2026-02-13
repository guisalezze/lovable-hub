import { useState, useMemo } from "react";
import { Plus, LayoutList, Kanban, CalendarDays, User, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTasks, useTeamMembers, type Task, type TaskStatus, type TaskPriority } from "@/hooks/useTasks";
import { TaskModal } from "@/components/tasks/TaskModal";
import { TaskKanban } from "@/components/tasks/TaskKanban";
import { TaskListView } from "@/components/tasks/TaskListView";
import { TaskCalendarView } from "@/components/tasks/TaskCalendarView";
import { Skeleton } from "@/components/ui/skeleton";

type ViewMode = "list" | "kanban" | "calendar" | "my";

const savedFilters = [
  { label: "Todas", filter: {} },
  { label: "Minhas Tarefas", filter: { assignedToMe: true } },
  { label: "Atrasadas", filter: { overdue: true } },
];

export default function TarefasPage() {
  const [view, setView] = useState<ViewMode>("kanban");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [savedFilter, setSavedFilter] = useState(0);

  const queryFilter = savedFilters[savedFilter]?.filter || {};
  const { data: tasks = [], isLoading } = useTasks(queryFilter as any);
  const { data: members } = useTeamMembers();

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (statusFilter !== "all") result = result.filter((t) => t.status === statusFilter);
    if (priorityFilter !== "all") result = result.filter((t) => t.priority === priorityFilter);
    return result;
  }, [tasks, statusFilter, priorityFilter]);

  const handleTaskClick = (task: Task) => {
    setEditTask(task);
    setModalOpen(true);
  };

  const handleNew = () => {
    setEditTask(null);
    setModalOpen(true);
  };

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tarefas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{filteredTasks.length} tarefas</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="list" className="text-xs px-2"><LayoutList className="h-3.5 w-3.5 mr-1" />Lista</TabsTrigger>
              <TabsTrigger value="kanban" className="text-xs px-2"><Kanban className="h-3.5 w-3.5 mr-1" />Kanban</TabsTrigger>
              <TabsTrigger value="calendar" className="text-xs px-2"><CalendarDays className="h-3.5 w-3.5 mr-1" />Calendário</TabsTrigger>
              <TabsTrigger value="my" className="text-xs px-2"><User className="h-3.5 w-3.5 mr-1" />Minhas</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" onClick={handleNew} className="gap-1.5">
            <Plus className="h-4 w-4" />Nova
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {savedFilters.map((f, i) => (
            <Button
              key={f.label}
              size="sm"
              variant={savedFilter === i ? "default" : "ghost"}
              className="text-xs h-7"
              onClick={() => setSavedFilter(i)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-7 text-xs w-[120px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="backlog">Backlog</SelectItem>
              <SelectItem value="em_andamento">Em Andamento</SelectItem>
              <SelectItem value="bloqueado">Bloqueado</SelectItem>
              <SelectItem value="concluido">Concluído</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="h-7 text-xs w-[120px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <>
          {(view === "list" || view === "my") && (
            <TaskListView tasks={filteredTasks} onTaskClick={handleTaskClick} members={members} />
          )}
          {view === "kanban" && (
            <TaskKanban tasks={filteredTasks} onTaskClick={handleTaskClick} members={members} />
          )}
          {view === "calendar" && (
            <TaskCalendarView tasks={filteredTasks} onTaskClick={handleTaskClick} />
          )}
        </>
      )}

      <TaskModal
        open={modalOpen}
        onOpenChange={(v) => { setModalOpen(v); if (!v) setEditTask(null); }}
        task={editTask}
      />
    </div>
  );
}
