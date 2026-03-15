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

  useEffect(() => {
    // Verificar se já está instalado
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // Verificar se está em modo standalone (PWA instalado)
    if (window.navigator.standalone === true) {
      setIsInstalled(true);
      return;
    }

    // Escutar evento beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Mostrar prompt após 3 segundos
      setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // Fallback: instruções para instalação manual
      toast.info(
        "Para instalar: No Chrome, toque no menu (⋮) > 'Adicionar à tela inicial'. No Safari, toque em Compartilhar > 'Adicionar à Tela de Início'.",
        { duration: 8000 }
      );
      return;
    }

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
  };

  if (isInstalled || !showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-0 right-0 z-[90] px-4 md:hidden safe-area-inset-bottom">
      <div className="bg-card border border-border rounded-lg shadow-lg p-4 flex items-center justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Instalar Solaryz</p>
          <p className="text-xs text-muted-foreground">Adicione à tela inicial para acesso rápido</p>
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
