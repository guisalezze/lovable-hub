import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Suspense, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { unlockAudio } from "@/lib/sounds";
import { registerPushHandlers } from "@/lib/registerPushHandlers";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { lazyPage } from "@/lib/lazyPage";

// Páginas carregadas sob demanda (ver src/lib/lazyPage.ts)
const Index = lazyPage(() => import("./pages/Index"));
const Leads = lazyPage(() => import("./pages/Leads"));
const Produtos = lazyPage(() => import("./pages/Produtos"));
const Financeiro = lazyPage(() => import("./pages/Financeiro"));
const Agenda = lazyPage(() => import("./pages/Agenda"));
const Tarefas = lazyPage(() => import("./pages/Tarefas"));
const Equipe = lazyPage(() => import("./pages/Equipe"));
const Integracoes = lazyPage(() => import("./pages/Integracoes"));
const Configuracoes = lazyPage(() => import("./pages/Configuracoes"));
const Cobrancas = lazyPage(() => import("./pages/Cobrancas"));
const Auth = lazyPage(() => import("./pages/Auth"));
const Relatorios = lazyPage(() => import("./pages/Relatorios"));
const OnboardingAdmin = lazyPage(() => import("./pages/OnboardingAdmin"));
const Onboarding = lazyPage(() => import("./pages/Onboarding"));
const Implementacoes = lazyPage(() => import("./pages/Implementacoes"));
const Clientes = lazyPage(() => import("./pages/Clientes"));
const MetaAds = lazyPage(() => import("./pages/nutra/MetaAds"));
const MetaCallback = lazyPage(() => import("./pages/nutra/MetaCallback"));
const Copies = lazyPage(() => import("./pages/Copies"));
const CopyProjectDetail = lazyPage(() => import("./pages/CopyProjectDetail"));
const NotFound = lazyPage(() => import("./pages/NotFound"));
const WhatsAppOficial = lazyPage(() => import("./pages/WhatsAppOficial"));
const WhatsAppCanais = lazyPage(() => import("./pages/WhatsAppCanais"));
const WhatsAppBaileysInbox = lazyPage(() => import("./pages/WhatsAppBaileysInbox"));
const GruposWA = lazyPage(() => import("./pages/GruposWA"));
const EmailMarketing = lazyPage(() => import("./pages/EmailMarketing"));
const CaptacaoLeads = lazyPage(() => import("./pages/CaptacaoLeads"));
const Encurtador = lazyPage(() => import("./pages/Encurtador"));
const WebhooksAutomacoes = lazyPage(() => import("./pages/WebhooksAutomacoes"));
const PerfectPay = lazyPage(() => import("./pages/PerfectPay"));
const InstagramAutomacoes = lazyPage(() => import("./pages/InstagramAutomacoes"));
const InstagramFluxoEditor = lazyPage(() => import("./pages/InstagramFluxoEditor"));
const Privacidade = lazyPage(() => import("./pages/Privacidade"));
const ExclusaoDados = lazyPage(() => import("./pages/ExclusaoDados"));
const DesignPreview = lazyPage(() => import("./pages/DesignPreview"));
const InstagramReportPublic = lazyPage(() => import("./pages/InstagramReportPublic"));

function PageSpinner() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
// Inbox and Calls removed: Inbox is now a popover in the header; Calls was merged into Agenda

// Navegação de app: ao voltar para uma página, os dados aparecem na hora (do cache)
// e são atualizados em segundo plano. Sem spinner a cada clique.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 min: dentro disso, trocar de página não refaz a busca
      gcTime: 30 * 60_000, // mantém o cache das páginas visitadas por 30 min
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Ao sair da conta (pelo botão ou sessão expirada), apaga os dados que ficaram
// no aparelho: o cache do React Query em memória e os caches do navegador.
supabase.auth.onAuthStateChange((event) => {
  if (event !== "SIGNED_OUT") return;
  queryClient.clear();
  if (typeof caches !== "undefined") {
    ["supabase-api-cache", "supabase-storage-cache"].forEach((name) => {
      caches.delete(name).catch(() => {});
    });
  }
});

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
        <div className="text-center space-y-4 max-w-md w-full">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-destructive">Erro ao carregar</h1>
          <p className="text-sm text-muted-foreground break-words">{error}</p>
          <div className="flex flex-col gap-2 mt-4">
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium"
            >
              Recarregar App
            </button>
            <button
              onClick={async () => {
                try {
                  if ("serviceWorker" in navigator && "caches" in window) {
                    const cacheNames = await caches.keys();
                    await Promise.all(cacheNames.map(name => caches.delete(name)));
                  }
                  localStorage.clear();
                  window.location.reload();
                } catch {
                  window.location.reload();
                }
              }}
              className="w-full px-4 py-3 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 font-medium text-sm"
            >
              Limpar Cache e Recarregar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const App = () => (
  <ErrorBoundary>
    {/* onClickCapture desbloqueia o AudioContext no iOS na primeira interação */}
    <div onClickCapture={unlockAudio} onTouchStartCapture={unlockAudio} style={{ display: "contents" }}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner position="top-center" richColors closeButton />
        <BrowserRouter future={{ v7_startTransition: true }}>
        <Suspense fallback={<PageSpinner />}>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/design-preview" element={<DesignPreview />} />
          <Route path="/privacidade" element={<Privacidade />} />
          <Route path="/exclusao-de-dados" element={<ExclusaoDados />} />
          <Route path="/r/instagram/:slug" element={<InstagramReportPublic />} />
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
            <Route path="/whatsapp-oficial" element={<WhatsAppOficial />} />
            <Route path="/whatsapp-canais" element={<WhatsAppCanais />} />
            <Route path="/whatsapp-inbox" element={<WhatsAppBaileysInbox />} />
            <Route path="/grupos-wa" element={<GruposWA />} />
            <Route path="/email-marketing" element={<EmailMarketing />} />
            <Route path="/captacao-leads" element={<CaptacaoLeads />} />
            <Route path="/encurtador" element={<Encurtador />} />
            <Route path="/webhooks-automacoes" element={<WebhooksAutomacoes />} />
            <Route path="/perfectpay" element={<PerfectPay />} />
            <Route path="/instagram-automacoes" element={<InstagramAutomacoes />} />
            <Route path="/instagram-automacoes/:id" element={<InstagramFluxoEditor />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
    </QueryClientProvider>
    </div>
  </ErrorBoundary>
);

export default App;
