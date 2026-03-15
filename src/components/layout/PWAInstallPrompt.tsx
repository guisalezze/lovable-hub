import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isSafari, setIsSafari] = useState(false);

  useEffect(() => {
    // Detectar iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(iOS);

    // Detectar Safari (no iOS, Chrome não suporta PWA)
    const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    setIsSafari(safari || iOS);

    // Verificar se já está instalado
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Verificar se está em modo standalone (PWA instalado - iOS)
    if ((window.navigator as any).standalone === true) {
      setIsInstalled(true);
      return;
    }

    // Verificar se está em mobile
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) {
      return; // Não mostrar em desktop
    }

    // No iOS, só mostrar se for Safari
    if (iOS && !safari) {
      // Mostrar mensagem especial para iOS Chrome
      setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
      return;
    }

    // Escutar evento beforeinstallprompt (Chrome/Edge Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Mostrar prompt após 3 segundos
      setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Mostrar prompt manual mesmo sem beforeinstallprompt (para iOS Safari, etc)
    setTimeout(() => {
      if (!deferredPrompt && !isInstalled) {
        setShowPrompt(true);
      }
    }, 5000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, [deferredPrompt, isInstalled]);

  const handleInstallClick = async () => {
    // iOS Chrome - mostrar instrução especial
    if (isIOS && !isSafari) {
      toast.info(
        "⚠️ Para instalar no iOS, você precisa usar o Safari. Abra este site no Safari e toque em Compartilhar (□↑) > 'Adicionar à Tela de Início'.",
        { duration: 10000 }
      );
      setShowPrompt(false);
      return;
    }

    // iOS Safari - instruções
    if (isIOS && isSafari) {
      toast.info(
        "📱 Para instalar: Toque no botão Compartilhar (□↑) na parte inferior > 'Adicionar à Tela de Início'.",
        { duration: 8000 }
      );
      setShowPrompt(false);
      return;
    }

    // Android Chrome - usar prompt nativo
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === "accepted") {
          toast.success("App instalado com sucesso!");
          setIsInstalled(true);
        }
        
        setDeferredPrompt(null);
        setShowPrompt(false);
      } catch (error) {
        console.error("Erro ao instalar:", error);
        toast.error("Erro ao instalar o app");
      }
      return;
    }

    // Fallback: instruções para instalação manual
    toast.info(
      "Para instalar: No Chrome Android, toque no menu (⋮) > 'Adicionar à tela inicial'. No Safari iOS, toque em Compartilhar > 'Adicionar à Tela de Início'.",
      { duration: 8000 }
    );
    setShowPrompt(false);
  };

  if (isInstalled || !showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-0 right-0 z-[90] px-4 md:hidden safe-area-inset-bottom">
      <div className="bg-card border border-border rounded-lg shadow-lg p-4 flex items-center justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Instalar Solaryz</p>
          {isIOS && !isSafari ? (
            <p className="text-xs text-muted-foreground">⚠️ Use o Safari para instalar no iOS</p>
          ) : isIOS && isSafari ? (
            <p className="text-xs text-muted-foreground">Toque em Compartilhar (□↑) > Adicionar à Tela de Início</p>
          ) : (
            <p className="text-xs text-muted-foreground">Adicione à tela inicial para acesso rápido</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleInstallClick}
            className="h-8 text-xs"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Instalar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowPrompt(false)}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
