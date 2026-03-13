import { useState, useEffect } from "react";
import { Settings, Link2, Unlink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TeamManagement } from "@/components/settings/TeamManagement";
import { ProjectAccessManager } from "@/components/settings/ProjectAccessManager";
import { WhatsAppConfig } from "@/components/settings/WhatsAppConfig";
import { useGoogleAuth } from "@/hooks/useGoogleAuth";
import { Button } from "@/components/ui/button";

function GoogleConnectionCard() {
  const { isConnected, isLoading, connect, disconnect } = useGoogleAuth();

  return (
    <div className="glass-card p-6">
      <h2 className="text-lg font-semibold text-foreground mb-1">Minha Conta</h2>
      <p className="text-sm text-muted-foreground mb-4">Integrações pessoais</p>

      <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3">
          <div className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
          <div>
            <p className="text-sm font-medium text-foreground">Google Calendar</p>
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Verificando..." : isConnected ? "Conectado" : "Não conectado"}
            </p>
          </div>
        </div>
        {!isLoading && (
          isConnected ? (
            <Button size="sm" variant="outline" onClick={disconnect} className="gap-1.5">
              <Unlink className="h-3.5 w-3.5" />
              Desconectar
            </Button>
          ) : (
            <Button size="sm" onClick={connect} className="gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Conectar
            </Button>
          )
        )}
      </div>
    </div>
  );
}

export default function ConfiguracoesPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      setIsAdmin(!!data);
      setLoading(false);
    };
    checkAdmin();
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Configurações do sistema</p>
      </div>

      {/* Minha Conta - visible to all authenticated users */}
      <GoogleConnectionCard />

      {loading ? (
        <div className="glass-card p-12 text-center">
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      ) : isAdmin ? (
        <div className="space-y-6">
          <TeamManagement />
          <WhatsAppConfig />
          <ProjectAccessManager />
        </div>
      ) : null}
    </div>
  );
}
