import { useState, useEffect, useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { BottomNavBar } from "./BottomNavBar";
import { Menu, Moon, Sun } from "lucide-react";
import { NotificationPopover } from "./NotificationPopover";
import { RevenueProgressBar, RevenueBarStrip } from "./RevenueProgressBar";
import { Button } from "@/components/ui/button";
import { useSaleRealtime } from "@/hooks/useSaleRealtime";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export function AppLayout() {
  // Escuta Realtime e dispara toast a cada venda aprovada
  useSaleRealtime();

  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile); // Fechado por padrão no mobile
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("theme");
      if (stored) return stored === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return false;
  });
  const navigate = useNavigate();

  // Ajustar estado da sidebar quando mudar de mobile para desktop
  useEffect(() => {
    if (!isMobile && !sidebarOpen) {
      setSidebarOpen(true);
    }
  }, [isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable) return;

    if (e.key === "n" && !e.metaKey && !e.ctrlKey) {
      navigate("/tarefas");
    } else if (e.key === "l" && !e.metaKey && !e.ctrlKey) {
      navigate("/leads");
    }
  }, [navigate]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex min-h-screen w-full bg-background overflow-x-hidden">
      {/* Sidebar: no mobile é Sheet (overlay), no desktop é aside fixo */}
      <AppSidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <main className={cn(
        "flex flex-col min-h-screen overflow-hidden",
        isMobile ? "w-full" : "flex-1"
      )}>
        <header className="h-12 md:h-14 flex items-center border-b border-border px-2 sm:px-4 shrink-0 gap-1 sm:gap-2 relative">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-md hover:bg-secondary active:bg-secondary text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Info de faturamento — centro do header */}
          <RevenueProgressBar />

          {/* Barra de progresso fina na borda inferior do header */}
          <RevenueBarStrip />

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="p-2 h-9 w-9 touch-manipulation"
              onClick={() => setDark((d) => !d)}
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="h-4 w-4 text-muted-foreground" /> : <Moon className="h-4 w-4 text-muted-foreground" />}
            </Button>
            <NotificationPopover />
          </div>
        </header>
        <div className={cn(
          "flex-1 overflow-auto p-3 sm:p-4 md:p-6",
          isMobile && "pb-20" // Espaço para o bottom nav
        )}>
          <Outlet />
        </div>
      </main>
      
      {/* Bottom Navigation Bar - apenas no mobile */}
      {isMobile && <BottomNavBar onMenuClick={() => setSidebarOpen(true)} />}
    </div>
  );
}
