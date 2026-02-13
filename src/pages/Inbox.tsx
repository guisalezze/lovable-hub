import { useNotifications, useMarkAsRead, useMarkAllAsRead } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { Bell, Check, CheckCheck, Inbox as InboxIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const typeIcon: Record<string, string> = {
  TASK_ASSIGNED: "📋",
  TASK_DUE_SOON: "⏰",
  TASK_OVERDUE: "🔴",
  TASK_MENTION: "💬",
};

export default function InboxPage() {
  const { data: notifications, isLoading } = useNotifications();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  const unread = notifications?.filter((n) => !n.read_at) || [];
  const read = notifications?.filter((n) => n.read_at) || [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inbox</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{unread.length} não lida{unread.length !== 1 ? "s" : ""}</p>
        </div>
        {unread.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => markAllAsRead.mutate()} className="gap-1.5 text-xs">
            <CheckCheck className="h-4 w-4" />Marcar todas como lidas
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : notifications?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <InboxIcon className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm font-medium">Nenhuma notificação</p>
          <p className="text-xs mt-1">Quando tarefas forem atribuídas ou vencerem, elas aparecerão aqui.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {unread.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Não lidas</h3>
              {unread.map((n) => (
                <div key={n.id} className="glass-card p-3 flex items-start gap-3 border-l-2 border-l-primary">
                  <span className="text-lg shrink-0 mt-0.5">{typeIcon[n.type] || "📌"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="shrink-0 h-7 w-7 p-0" onClick={() => markAsRead.mutate(n.id)}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </>
          )}
          {read.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mt-4 mb-2">Lidas</h3>
              {read.map((n) => (
                <div key={n.id} className="glass-card p-3 flex items-start gap-3 opacity-60">
                  <span className="text-lg shrink-0 mt-0.5">{typeIcon[n.type] || "📌"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{n.message}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
