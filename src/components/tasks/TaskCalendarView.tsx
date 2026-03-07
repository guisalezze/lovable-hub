import { useMemo, useState } from "react";
import { type Task } from "@/hooks/useTasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  isOverdue?: (task: Task) => boolean;
}

export function TaskCalendarView({ tasks, onTaskClick, isOverdue }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const startPadding = getDay(days[0]);
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const getTasksForDay = (day: Date) =>
    tasks.filter((t) => t.due_date && isSameDay(new Date(t.due_date), day));

  const priorityDot: Record<string, string> = {
    baixa: "bg-muted-foreground",
    media: "bg-foreground",
    alta: "bg-warning",
    urgente: "bg-destructive",
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold text-foreground capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-px">
        {dayNames.map((d) => (
          <div key={d} className="text-center text-[10px] text-muted-foreground font-semibold py-2">{d}</div>
        ))}
        {Array.from({ length: startPadding }).map((_, i) => <div key={`pad-${i}`} />)}
        {days.map((day) => {
          const dayTasks = getTasksForDay(day);
          const isToday = isSameDay(day, new Date());
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[80px] p-1 border border-border/30 rounded-sm ${isToday ? "bg-primary/5 border-primary/30" : ""}`}
            >
              <p className={`text-[10px] font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                {format(day, "d")}
              </p>
              <div className="space-y-0.5 mt-0.5">
                {dayTasks.slice(0, 3).map((t) => {
                  const overdue = isOverdue?.(t) ?? false;
                  return (
                    <div
                      key={t.id}
                      onClick={() => onTaskClick(t)}
                      className={`text-[9px] px-1 py-0.5 rounded text-foreground truncate cursor-pointer hover:bg-secondary flex items-center gap-1 ${overdue ? "bg-destructive/15 border border-destructive/30" : "bg-secondary/50"}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot[t.priority]}`} />
                      {t.title}
                    </div>
                  );
                })}
                {dayTasks.length > 3 && (
                  <p className="text-[9px] text-muted-foreground px-1">+{dayTasks.length - 3} mais</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
