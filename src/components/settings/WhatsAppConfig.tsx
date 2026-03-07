import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Eye, EyeOff, Save, Send } from "lucide-react";
import { toast } from "sonner";

export function WhatsAppConfig() {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "whatsapp_cloud_config")
        .maybeSingle();

      if (data?.value) {
        const val = data.value as { phone_number_id?: string; access_token?: string };
        setPhoneNumberId(val.phone_number_id || "");
        setAccessToken(val.access_token || "");
        setIsConfigured(!!(val.phone_number_id && val.access_token));
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    if (!phoneNumberId || !accessToken) {
      toast.error("Preencha todos os campos");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("app_settings")
        .upsert({
          key: "whatsapp_cloud_config",
          value: { phone_number_id: phoneNumberId, access_token: accessToken } as any,
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });

      if (error) throw error;
      setIsConfigured(true);
      toast.success("Configuração do WhatsApp salva!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data: profile } = await supabase
        .from("profiles")
        .select("phone_e164")
        .eq("id", user.id)
        .single();

      if (!profile?.phone_e164) {
        toast.error("Cadastre seu telefone no perfil antes de testar");
        return;
      }

      const { data, error } = await supabase.functions.invoke("whatsapp-send-message", {
        body: {
          to: profile.phone_e164,
          template_name: "hello_world",
          template_language: "en_US",
          template_params: [],
        },
      });

      if (error) throw error;
      if (data?.success) {
        toast.success("Mensagem de teste enviada!");
      } else {
        toast.error("Falha no envio: " + (data?.error || "Erro desconhecido"));
      }
    } catch (err: any) {
      toast.error("Erro ao testar: " + err.message);
    } finally {
      setTesting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-green-500" />
          <h3 className="text-lg font-semibold text-foreground">WhatsApp Cloud API</h3>
        </div>
        <Badge variant={isConfigured ? "default" : "secondary"} className="text-xs">
          {isConfigured ? "Conectado" : "Não configurado"}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Configure o envio de notificações de tarefas via WhatsApp. Você precisa criar os templates
        <code className="mx-1 px-1 py-0.5 bg-muted rounded text-xs">task_assignment</code> e
        <code className="mx-1 px-1 py-0.5 bg-muted rounded text-xs">task_reminder</code> no Meta Business Suite.
      </p>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Phone Number ID</Label>
          <Input
            placeholder="Ex: 123456789012345"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Access Token</Label>
          <div className="relative">
            <Input
              type={showToken ? "text" : "password"}
              placeholder="EAAxxxxxxx..."
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Salvando..." : "Salvar"}
        </Button>
        {isConfigured && (
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            <Send className="h-4 w-4 mr-2" />
            {testing ? "Enviando..." : "Testar Conexão"}
          </Button>
        )}
      </div>

      <div className="text-xs text-muted-foreground border-t border-border pt-3 space-y-1">
        <p className="font-medium">Templates necessários no Meta Business Suite:</p>
        <p><strong>task_assignment</strong>: {`{{1}} atribuiu uma tarefa para você: "{{2}}". Prazo: {{3}} às {{4}}. Prioridade: {{5}}. Acesse o CRM para mais detalhes.`}</p>
        <p><strong>task_reminder</strong>: {`{{1}} — Tarefa: "{{2}}". Prazo: {{3}}. Status atual: {{4}}. Acesse o CRM e marque como concluída.`}</p>
      </div>
    </div>
  );
}
