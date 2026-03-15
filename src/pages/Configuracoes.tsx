import { useState, useEffect } from "react";
import { Link2, Unlink, Trash2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TeamManagement } from "@/components/settings/TeamManagement";
import { ProjectAccessManager } from "@/components/settings/ProjectAccessManager";
import { WhatsAppConfig } from "@/components/settings/WhatsAppConfig";
import { PushNotificationsCard } from "@/components/settings/PushNotificationsCard";
import { useGoogleAuth } from "@/hooks/useGoogleAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

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

function AdminDangerZone() {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [found, setFound] = useState<any[] | null>(null);
  const [searched, setSearched] = useState(false);

  const searchSale = async () => {
    setSearched(true);
    // Busca ampla: produto Retatrutida ou email contendo "icaro"
    const { data, error } = await supabase
      .from("sales")
      .select("id, lead_email, product_name, sale_amount, sale_status_enum, created_at")
      .or("product_name.ilike.*Retatrutida*,lead_email.ilike.*icaro*")
      .order("created_at", { ascending: false });
    if (error) { toast.error("Erro ao buscar: " + error.message); return; }
    setFound(data || []);
  };

  const deleteSale = async (id: string, info: string) => {
    if (!confirm(`Confirmar exclusão da venda:\n${info}`)) return;
    setDeleting(true);
    const { error } = await supabase.from("sales").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao deletar: " + error.message);
    } else {
      toast.success("Venda removida com sucesso!");
      setFound((prev) => (prev || []).filter((s) => s.id !== id));
      qc.invalidateQueries();
    }
    setDeleting(false);
  };

  return (
    <div className="glass-card p-6 border border-destructive/30">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h2 className="text-lg font-semibold text-foreground">Zona de Risco — Admin</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Ações irreversíveis. Use com cuidado.</p>

      <div className="border border-border rounded-lg p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">Remover venda de teste (Icaro Gava)</p>
          <p className="text-xs text-muted-foreground">Busca vendas com produto "Retatrutida" ou email contendo "icaro" para remoção manual.</p>
        </div>

        {!searched && (
          <Button size="sm" variant="outline" onClick={searchSale}>
            Buscar venda de teste
          </Button>
        )}

        {searched && found !== null && found.length === 0 && (
          <p className="text-xs text-emerald-500 font-medium">✅ Nenhuma venda encontrada. Já foi removida.</p>
        )}

        {found && found.length > 0 && (
          <div className="space-y-2">
            {found.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-2 bg-destructive/5 border border-destructive/20 rounded-md gap-2">
                <div>
                  <p className="text-xs font-medium text-foreground">{s.product_name || "—"} · R$ {Number(s.sale_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                  <p className="text-[10px] text-muted-foreground">{s.lead_email} · {s.sale_status_enum} · {new Date(s.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  className="shrink-0 gap-1 text-xs h-7"
                  disabled={deleting}
                  onClick={() => deleteSale(s.id, `${s.product_name} — ${s.lead_email} — R$${s.sale_amount}`)}
                >
                  <Trash2 className="h-3 w-3" /> Deletar
                </Button>
              </div>
            ))}
          </div>
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
      <PushNotificationsCard />

      {loading ? (
        <div className="glass-card p-12 text-center">
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      ) : isAdmin ? (
        <div className="space-y-6">
          <TeamManagement />
          <WhatsAppConfig />
          <ProjectAccessManager />
          <AdminDangerZone />
        </div>
      ) : null}
    </div>
  );
}
