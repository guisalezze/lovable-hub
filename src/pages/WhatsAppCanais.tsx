import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete, API_URL } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, RefreshCw, Wifi, WifiOff, Loader2, QrCode, Smartphone } from "lucide-react";

interface Session {
  id: string;
  session_id: string;
  phone_number: string | null;
  display_name: string | null;
  status: string;
  live_status: string;
  connected_at: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  connected: { label: "Conectado", color: "text-emerald-600 bg-emerald-500/20", icon: <Wifi className="h-3 w-3" /> },
  connecting: { label: "Conectando", color: "text-yellow-600 bg-yellow-500/20", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  qr_pending: { label: "Aguardando QR", color: "text-blue-600 bg-blue-500/20", icon: <QrCode className="h-3 w-3" /> },
  disconnected: { label: "Desconectado", color: "text-muted-foreground bg-muted", icon: <WifiOff className="h-3 w-3" /> },
};

function QRModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState("connecting");
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      const url = `${API_URL}/connect/${sessionId}${token ? `?token=${token}` : ""}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onmessage = (e) => {
        const d = JSON.parse(e.data);
        setStatus(d.status);
        if (d.qr) setQr(d.qr);
        if (d.status === "connected") {
          toast.success("WhatsApp conectado com sucesso!");
          onClose();
        }
      };
      es.onerror = () => es.close();
    });

    return () => eventSourceRef.current?.close();
  }, [sessionId, onClose]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          {status === "qr_pending" && qr ? (
            <>
              <img src={qr} alt="QR Code" className="w-64 h-64 rounded-lg border border-border" />
              <p className="text-sm text-muted-foreground text-center">
                Abra o WhatsApp no celular → Dispositivos vinculados → Vincular dispositivo → Escanear QR
              </p>
            </>
          ) : status === "connected" ? (
            <div className="flex flex-col items-center gap-2">
              <div className="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Wifi className="h-8 w-8 text-emerald-600" />
              </div>
              <p className="text-emerald-600 font-medium">Conectado!</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Gerando QR code...</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function WhatsAppCanaisPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newId, setNewId] = useState("");
  const [showQR, setShowQR] = useState<string | null>(null);

  const { data: sessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ["sessions"],
    queryFn: () => apiGet("/sessions"),
    refetchInterval: 10000,
  });

  const create = useMutation({
    mutationFn: () => {
      if (!newId.trim()) throw new Error("ID obrigatório");
      return apiPost("/sessions", { session_id: newId.trim(), name: newId.trim() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Sessão criada");
      setShowQR(newId.trim());
      setNewId("");
      setShowCreate(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reconnect = useMutation({
    mutationFn: (id: string) => apiPost(`/sessions/${id}/reconnect`),
    onSuccess: (_, id) => { qc.invalidateQueries({ queryKey: ["sessions"] }); toast.success("Reconectando..."); setShowQR(id); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/sessions/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sessions"] }); toast.success("Sessão removida"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const getStatusConfig = (s: Session) => STATUS_CONFIG[s.live_status || s.status] || STATUS_CONFIG.disconnected;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Canais WhatsApp</h1>
          <p className="text-sm text-muted-foreground mt-1">Sessões não-oficiais via QR code (Baileys)</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Sessão
        </Button>
      </div>

      <div className="glass-card p-4 border border-yellow-500/30 bg-yellow-500/5">
        <p className="text-xs text-yellow-700 dark:text-yellow-400">
          ⚠️ <strong>Atenção:</strong> Sessões Baileys usam números pessoais de WhatsApp e são não-oficiais. Existe risco de banimento do número pelo WhatsApp. Use com responsabilidade e volumes controlados.
        </p>
      </div>

      {isLoading ? (
        <div className="glass-card p-12 text-center text-muted-foreground text-sm">Carregando...</div>
      ) : sessions.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Smartphone className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nenhuma sessão criada ainda</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {sessions.map(s => {
            const cfg = getStatusConfig(s);
            return (
              <div key={s.id} className="glass-card p-4 flex items-center gap-4">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${cfg.color}`}>
                  {cfg.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{s.display_name || s.session_id}</p>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>
                  {s.phone_number && <p className="text-xs text-muted-foreground font-mono mt-0.5">+{s.phone_number}</p>}
                  <p className="text-xs text-muted-foreground">ID: {s.session_id}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(s.live_status === "qr_pending" || s.live_status === "disconnected" || !s.live_status) && (
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => {
                      if (s.live_status === "connected") reconnect.mutate(s.session_id);
                      else setShowQR(s.session_id);
                    }}>
                      <QrCode className="h-3.5 w-3.5" /> QR Code
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => reconnect.mutate(s.session_id)} disabled={reconnect.isPending}>
                    <RefreshCw className="h-3.5 w-3.5" /> Reconectar
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => { if (confirm(`Remover sessão "${s.session_id}"? Isso desconectará o WhatsApp.`)) del.mutate(s.session_id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova sessão WhatsApp</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>ID da sessão</Label>
              <Input
                value={newId}
                onChange={e => setNewId(e.target.value)}
                placeholder="ex: numero-principal, vendas-1"
                className="mt-1"
                onKeyDown={e => e.key === "Enter" && create.mutate()}
              />
              <p className="text-xs text-muted-foreground mt-1">Use um nome descritivo (sem espaços)</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Criando..." : "Criar e conectar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {showQR && <QRModal sessionId={showQR} onClose={() => { setShowQR(null); qc.invalidateQueries({ queryKey: ["sessions"] }); }} />}
    </div>
  );
}
