import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
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

  useEffect(() => {
    // Verificar sessão imediatamente ao carregar
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Erro ao obter sessão:', error);
        }
        setSession(session);
        setLoading(false);
        
        // Se não houver sessão, tentar restaurar do localStorage
        if (!session && typeof window !== 'undefined') {
          try {
            // Tentar refresh do token se houver refresh_token salvo
            const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
            if (!refreshError && refreshedSession) {
              setSession(refreshedSession);
            }
          } catch (e) {
            console.error('Erro ao restaurar sessão:', e);
          }
        }
      } catch (error) {
        console.error('Erro ao verificar sessão:', error);
        setLoading(false);
      }
    };

    checkSession();

    // Escutar mudanças de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setLoading(false);
      
      // Salvar sessão explicitamente no localStorage para PWA
      if (session && typeof window !== 'undefined') {
        try {
          localStorage.setItem('sb-auth-token', JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
          }));
        } catch (e) {
          console.error('Erro ao salvar sessão:', e);
        }
      } else if (!session && typeof window !== 'undefined') {
        // Limpar sessão salva se não houver mais sessão
        localStorage.removeItem('sb-auth-token');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const App = () => (
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
);

export default App;
