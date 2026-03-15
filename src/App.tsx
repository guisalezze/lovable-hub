import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { unlockAudio } from "@/lib/sounds";
import { registerPushHandlers } from "@/lib/registerPushHandlers";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { AppLayout } from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import Leads from "./pages/Leads";
import Produtos from "./pages/Produtos";
import Financeiro from "./pages/Financeiro";
import Agenda from "./pages/Agenda";
import Tarefas from "./pages/Tarefas";
import Equipe from "./pages/Equipe";
import Integracoes from "./pages/Integracoes";
import Configuracoes from "./pages/Configuracoes";
import Cobrancas from "./pages/Cobrancas";
import Auth from "./pages/Auth";
import Relatorios from "./pages/Relatorios";
import OnboardingAdmin from "./pages/OnboardingAdmin";
import Onboarding from "./pages/Onboarding";
import Implementacoes from "./pages/Implementacoes";
import Clientes from "./pages/Clientes";
import MetaAds from "./pages/nutra/MetaAds";
import MetaCallback from "./pages/nutra/MetaCallback";
import Copies from "./pages/Copies";
import CopyProjectDetail from "./pages/CopyProjectDetail";
import NotFound from "./pages/NotFound";
// Inbox and Calls removed: Inbox is now a popover in the header; Calls was merged into Agenda

const queryClient = new QueryClient();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // Verificar sessão imediatamente ao carregar
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Erro ao obter sessão:', error);
          if (mounted) {
            setError(error.message);
          }
        }

        if (mounted) {
          if (session) {
            // Sessão ativa encontrada
            setSession(session);
            setError(null);
          } else {
            // Sem sessão ativa — tentar refresh do token antes de redirecionar
            try {
              const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
              if (mounted) {
                if (!refreshError && refreshedSession) {
                  setSession(refreshedSession);
                  setError(null);
                } else {
                  setSession(null);
                  setError(null); // Não é erro, apenas sem sessão
                }
              }
            } catch (refreshErr) {
              if (mounted) {
                setSession(null);
                setError(null);
              }
            }
          }
        }
      } catch (error: any) {
        console.error('Erro ao verificar sessão:', error);
        if (mounted) {
          setSession(null);
          setError(error?.message || 'Erro desconhecido');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    checkSession();

    // Registrar handlers de push notifications (não bloqueia renderização)
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      registerPushHandlers().catch(err => {
        console.warn('Erro ao registrar push handlers:', err);
      });
    }

    // Escutar mudanças de autenticação (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setSession(session);
        setLoading(false);
        setError(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-md">
          <h1 className="text-xl font-bold text-destructive">Erro ao carregar</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Recarregar
          </button>
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const App = () => (
  // onClickCapture desbloqueia o AudioContext no iOS na primeira interação
  <div onClickCapture={unlockAudio} onTouchStartCapture={unlockAudio} style={{ display: "contents" }}>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-center" richColors closeButton />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/onboarding/:token" element={<Onboarding />} />
          <Route path="/nutra/meta-callback" element={<AuthGuard><MetaCallback /></AuthGuard>} />
          <Route
            element={
              <AuthGuard>
                <ProjectProvider>
                  <AppLayout />
                </ProjectProvider>
              </AuthGuard>
            }
          >
            <Route path="/" element={<Index />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/produtos" element={<Produtos />} />
            <Route path="/financeiro" element={<Financeiro />} />
            <Route path="/cobrancas" element={<Cobrancas />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/tarefas" element={<Tarefas />} />
            <Route path="/equipe" element={<Equipe />} />
            <Route path="/integracoes" element={<Integracoes />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/relatorios" element={<Relatorios />} />
            <Route path="/onboarding-admin" element={<OnboardingAdmin />} />
            <Route path="/mentorias" element={<Implementacoes />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/nutra/meta-ads" element={<MetaAds />} />
            <Route path="/meta-ads" element={<MetaAds />} />
            <Route path="/copies" element={<Copies />} />
            <Route path="/copies/:id" element={<CopyProjectDetail />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </div>
);

export default App;
