import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { preloadPages } from "@/lib/lazyPage";
import { reloadIfUpdateReady } from "@/lib/appUpdate";

function PageSpinner() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { BottomNavBar } from "./BottomNavBar";
import { PWAInstallPrompt } from "./PWAInstallPrompt";
import { Menu } from "lucide-react";
import { NotificationPopover } from "./NotificationPopover";
import { DesignSwitcher } from "./DesignSwitcher";
import { RevenueProgressBar, RevenueBarStrip } from "./RevenueProgressBar";
import { useSaleRealtime } from "@/hooks/useSaleRealtime";
import { useTaskRealtime } from "@/hooks/useTaskRealtime";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export function AppLayout() {
  // Escuta Realtime e dispara toast + som a cada venda aprovada
  useSaleRealtime();
  // Escuta Realtime e dispara toast + som quando uma tarefa é atribuída ao usuário
  useTaskRealtime();

  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false); // Sempre fechado no mobile
  const navigate = useNavigate();
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Com o CRM aberto, baixa as outras páginas em segundo plano
  useEffect(() => {
    preloadPages();
  }, []);

  // Ao trocar de página, volta o conteúdo para o topo (como num app).
  // Se saiu versão nova do CRM, aproveita a troca de página para carregá-la.
  useEffect(() => {
    if (reloadIfUpdateReady()) return;
    scrollRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Ajustar estado da sidebar quando mudar de mobile para desktop
  useEffect(() => {
    if (!isMobile) {
      setSidebarOpen(true); // Abrir automaticamente no desktop
    } else {
      setSidebarOpen(false); // Garantir fechado no mobile
    }
  }, [isMobile]);

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
    <div className="app-shell flex min-h-screen w-full bg-background overflow-x-hidden">
      {/* Sidebar: no mobile é Sheet (overlay), no desktop é aside fixo */}
      <AppSidebar open={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      <main className={cn(
        "flex flex-col min-h-screen overflow-hidden transition-[margin-left] duration-modal ease-in-out-apple",
        isMobile ? "w-full" : "flex-1",
        !isMobile && sidebarOpen && "ml-60 app-main-with-sidebar" // Compensar espaço do sidebar fixo no desktop
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
            <DesignSwitcher />
            <NotificationPopover />
          </div>
        </header>
        <div ref={scrollRef} className={cn(
          "flex-1 overflow-auto p-3 sm:p-4 md:p-6",
          isMobile && "pb-20" // Espaço para o bottom nav
        )}>
          {/* Suspense fora do div com key: ao trocar de página, a anterior fica
              na tela até a nova estar pronta (sem piscar spinner). */}
          <Suspense fallback={<PageSpinner />}>
            {/* key = rota: cada página entra com um fade curto */}
            <div key={location.pathname} className="page-enter h-full">
              <Outlet />
            </div>
          </Suspense>
        </div>
      </main>
      
      {/* Bottom Navigation Bar - apenas no mobile */}
      {isMobile && <BottomNavBar onMenuClick={() => setSidebarOpen(true)} />}
      
      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
    </div>
  );
}
