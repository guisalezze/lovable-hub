import { Bell, Check, CheckCheck, Inbox as InboxIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotifications, useMarkAsRead, useMarkAllAsRead, useUnreadCount } from "@/hooks/useNotifications";

const typeIcon: Record<string, string> = {
  TASK_ASSIGNED: "📋",
  TASK_DUE_SOON: "⏰",
  TASK_OVERDUE: "🔴",
  TASK_MENTION: "💬",
  ONBOARDING_COMPLETED: "🎉",
  CHARGE_DUE: "💰",
};

export function NotificationPopover() {
  const { data: notifications, isLoading } = useNotifications();
  const { data: unreadCount } = useUnreadCount();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  const unread = notifications?.filter((n) => !n.read_at) || [];
  const read = notifications?.filter((n) => n.read_at) || [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative p-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          {(unreadCount || 0) > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center font-bold">
              {unreadCount! > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-foreground">Notificações</p>
            {unread.length > 0 && (
              <p className="text-[11px] text-muted-foreground">{unread.length} não lida{unread.length !== 1 ? "s" : ""}</p>
            )}
          </div>
          {unread.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] gap-1 text-muted-foreground"
              onClick={() => markAllAsRead.mutate()}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Marcar todas
            </Button>
          )}
        </div>

        {/* Body */}
        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-md" />
              ))}
            </div>
          ) : !notifications || notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <InboxIcon className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-xs font-medium">Nenhuma notificação</p>
              <p className="text-[11px] mt-0.5 text-center px-6">
                Tarefas atribuídas, onboardings e lembretes aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="py-1">
              {unread.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2">
                    Não lidas
                  </p>
                  {unread.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-start gap-3 px-4 py-2.5 hover:bg-secondary/50 transition-colors border-l-2 border-l-primary"
                    >
                      <span className="text-base shrink-0 mt-0.5">{typeIcon[n.type] || "📌"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground leading-snug">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => markAsRead.mutate(n.id)}
                        title="Marcar como lida"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </>
              )}

              {read.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2 mt-1">
                    Lidas
                  </p>
                  {read.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-start gap-3 px-4 py-2.5 opacity-50"
                    >
                      <span className="text-base shrink-0 mt-0.5">{typeIcon[n.type] || "📌"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground leading-snug">{n.message}</p>
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
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
