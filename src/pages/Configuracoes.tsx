import { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TeamManagement } from "@/components/settings/TeamManagement";
import { WhatsAppConfig } from "@/components/settings/WhatsAppConfig";

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

      {loading ? (
        <div className="glass-card p-12 text-center">
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      ) : isAdmin ? (
        <div className="space-y-6">
          <TeamManagement />
          <WhatsAppConfig />
        </div>
      ) : (
        <div className="glass-card p-12 text-center">
          <Settings className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Sem permissões administrativas</p>
        </div>
      )}
    </div>
  );
}
