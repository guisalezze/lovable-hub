import { useState, useMemo, useEffect } from "react";
import { Plus, LayoutList, Kanban, CalendarDays, Filter, Search, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTasks, useTeamMembers, type Task, type TaskStatus, type TaskPriority } from "@/hooks/useTasks";
import { TaskModal } from "@/components/tasks/TaskModal";
import { TaskKanban } from "@/components/tasks/TaskKanban";
import { TaskListView } from "@/components/tasks/TaskListView";
import { TaskCalendarView } from "@/components/tasks/TaskCalendarView";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";
import { isAfter, startOfDay, parseISO } from "date-fns";

type ViewMode = "list" | "kanban" | "calendar";
type QuickFilter = "all" | "mine" | "overdue";

export function isTaskOverdue(task: Task): boolean {
  if (!task.due_date || task.status === "concluido") return false;
  return isAfter(startOfDay(new Date()), startOfDay(parseISO(task.due_date)));
}

export default function TarefasPage() {
  const { currentProject } = useProject();
  const [view, setView] = useState<ViewMode>("kanban");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [search, setSearch] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const { data: tasks = [], isLoading } = useTasks({ projectId: currentProject?.id });
  const { data: members } = useTeamMembers();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (quickFilter === "mine") result = result.filter(t => t.assigned_to === currentUserId);
    if (quickFilter === "overdue") result = result.filter(isTaskOverdue);
    if (statusFilter !== "all") result = result.filter(t => t.status === statusFilter);
    if (priorityFilter !== "all") result = result.filter(t => t.priority === priorityFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [tasks, quickFilter, statusFilter, priorityFilter, search, currentUserId]);

  const mineCount = useMemo(() => tasks.filter(t => t.assigned_to === currentUserId).length, [tasks, currentUserId]);
  const overdueCount = useMemo(() => tasks.filter(isTaskOverdue).length, [tasks]);

  const handleTaskClick = (task: Task) => {
    setEditTask(task);
    setModalOpen(true);
  };

  const handleNew = () => {
    setEditTask(null);
    setModalOpen(true);
  };

  return (
    <div className="space-y-4 w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            {currentProject?.icon} Tarefas · {currentProject?.name}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{filteredTasks.length} tarefas</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
            <TabsList className="h-9 sm:h-8">
              <TabsTrigger value="list" className="text-xs px-2"><LayoutList className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Lista</span></TabsTrigger>
              <TabsTrigger value="kanban" className="text-xs px-2"><Kanban className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Kanban</span></TabsTrigger>
              <TabsTrigger value="calendar" className="text-xs px-2"><CalendarDays className="h-3.5 w-3.5 mr-1" /><span className="hidden sm:inline">Calendário</span></TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" onClick={handleNew} className="gap-1.5">
            <Plus className="h-4 w-4" /><span className="hidden sm:inline">Nova</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        {/* Quick Filters */}
        <div className="flex gap-1 sm:flex-row flex-wrap">
          <Button size="sm" variant={quickFilter === "all" ? "default" : "ghost"} className="text-xs h-11 sm:h-10 flex-1 sm:flex-initial" onClick={() => setQuickFilter("all")}>
            Todas <Badge variant="secondary" className="ml-1 text-[10px] px-1">{tasks.length}</Badge>
          </Button>
          <Button size="sm" variant={quickFilter === "mine" ? "default" : "ghost"} className="text-xs h-11 sm:h-10 flex-1 sm:flex-initial" onClick={() => setQuickFilter("mine")}>
            Minhas <Badge variant="secondary" className="ml-1 text-[10px] px-1">{mineCount}</Badge>
          </Button>
          <Button size="sm" variant={quickFilter === "overdue" ? "default" : "ghost"} className="text-xs h-11 sm:h-10 flex-1 sm:flex-initial" onClick={() => setQuickFilter("overdue")}>
            Atrasadas <Badge variant="destructive" className="ml-1 text-[10px] px-1">{overdueCount}</Badge>
          </Button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar tarefa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs"
          />
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

      {/* Overdue Alert Banner */}
      {quickFilter === "overdue" && overdueCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive font-medium">{overdueCount} tarefa(s) com prazo vencido.</p>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : (
        <>
          {view === "list" && (
            <TaskListView tasks={filteredTasks} onTaskClick={handleTaskClick} members={members} isOverdue={isTaskOverdue} />
          )}
          {view === "kanban" && (
            <TaskKanban tasks={filteredTasks} onTaskClick={handleTaskClick} members={members} isOverdue={isTaskOverdue} />
          )}
          {view === "calendar" && (
            <TaskCalendarView tasks={filteredTasks} onTaskClick={handleTaskClick} isOverdue={isTaskOverdue} />
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
