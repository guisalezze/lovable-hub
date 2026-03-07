import { useState, useEffect, useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { Menu, Search, Bell, Moon, Sun } from "lucide-react";
import { CommandPalette } from "@/components/CommandPalette";
import { useUnreadCount } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("theme");
      if (stored) return stored === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });
  const navigate = useNavigate();
  const { data: unreadCount } = useUnreadCount();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Cmd/Ctrl + K = global search
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setCmdOpen(true);
      return;
    }
    // Don't trigger shortcuts when typing in inputs
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable) return;
    
    if (e.key === "n" && !e.metaKey && !e.ctrlKey) {
      navigate("/tarefas");
    } else if (e.key === "l" && !e.metaKey && !e.ctrlKey) {
      navigate("/leads");
    } else if (e.key === "c" && !e.metaKey && !e.ctrlKey) {
      navigate("/calls");
    }
  }, [navigate]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <header className="h-14 flex items-center border-b border-border px-4 shrink-0 gap-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          
          <button
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary/50 hover:bg-secondary text-muted-foreground text-sm transition-colors ml-2"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Buscar...</span>
            <kbd className="hidden sm:inline text-[10px] bg-background/50 px-1.5 py-0.5 rounded">⌘K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="relative p-2"
              onClick={() => navigate("/inbox")}
            >
              <Bell className="h-4 w-4 text-muted-foreground" />
              {(unreadCount || 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center font-bold">
                  {unreadCount! > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
