import { useState, useMemo } from "react";
import { Search, Crown, ArrowUpDown, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useClientLtvList, useClientLtvKpis, type ClientLtv } from "@/hooks/useClientLtv";
import { LtvBadge } from "@/components/shared/LtvBadge";
import { ClientDetailSheet } from "@/components/clients/ClientDetailSheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

type SortKey = "ltv" | "total_purchases" | "name";

export default function ClientesPage() {
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("ltv");
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [waClient, setWaClient] = useState<ClientLtv | null>(null);
  const [waMessage, setWaMessage] = useState("");
  const [waSending, setWaSending] = useState(false);

  const { data: clients = [], isLoading } = useClientLtvList(search.length >= 2 ? search : undefined);
  const { data: kpis } = useClientLtvKpis();

  const handleSendWhatsApp = async () => {
    if (!waClient?.phone || !waMessage.trim()) return;
    setWaSending(true);
    try {
      const cleanPhone = waClient.phone.replace(/[\s\-\+\(\)]/g, "");
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          nomeCliente: waClient.name || waClient.email,
          telefoneCliente: cleanPhone,
          mensagem: waMessage.trim(),
        },
      });
      if (error) throw error;
      toast({ title: "Mensagem enviada!", description: `WhatsApp enviado para ${waClient.name || waClient.email}` });
      setWaClient(null);
      setWaMessage("");
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err.message || "Tente novamente", variant: "destructive" });
    } finally {
      setWaSending(false);
    }
  };

  const filtered = useMemo(() => {
    let result = clients;
    if (segmentFilter !== "all") result = result.filter(c => c.segment === segmentFilter);
    if (search.length >= 2) return result; // already sorted by search relevance
    return [...result].sort((a, b) => {
      if (sortBy === "ltv") return b.ltv - a.ltv;
      if (sortBy === "total_purchases") return b.total_purchases - a.total_purchases;
      return (a.name || a.email).localeCompare(b.name || b.email);
    });
  }, [clients, segmentFilter, sortBy, search]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {kpis ? `${kpis.totalClients} clientes · LTV total ${fmtBRL(kpis.totalLtv)}` : "Carregando..."}
        </p>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total de Clientes</p>
            <p className="text-2xl font-bold text-foreground mt-1">{kpis.totalClients}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Ticket Médio (LTV)</p>
            <p className="text-2xl font-bold text-foreground mt-1">{fmtBRL(kpis.avgLtv)}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Clientes VIP</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">{kpis.vipCount}</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Clientes Premium</p>
            <p className="text-2xl font-bold text-primary mt-1">{kpis.premiumCount}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-card border-border h-8 text-sm w-[260px]"
          />
        </div>
        <div className="flex gap-1">
          {[
            { value: "all", label: "Todos" },
            { value: "vip", label: "VIP" },
            { value: "premium", label: "Premium" },
            { value: "regular", label: "Regular" },
            { value: "new", label: "Novos" },
          ].map(f => (
            <Button
              key={f.value}
              variant={segmentFilter === f.value ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSegmentFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          {(["ltv", "total_purchases", "name"] as SortKey[]).map(key => (
            <Button
              key={key}
              variant={sortBy === key ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSortBy(key)}
            >
              <ArrowUpDown className="h-3 w-3 mr-1" />
              {key === "ltv" ? "LTV" : key === "total_purchases" ? "Compras" : "Nome"}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Crown className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Nenhum cliente encontrado</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map(client => (
            <div
              key={client.email}
              onClick={() => setSelectedEmail(client.email)}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors border border-transparent hover:border-border/50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-primary">
                    {(client.name || client.email)[0].toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {client.name || client.email}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">{client.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0 ml-3">
                {client.phone && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setWaClient(client);
                      setWaMessage("");
                    }}
                    title="Enviar WhatsApp"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                )}
                <div className="text-right hidden md:block">
                  <p className="text-[11px] text-muted-foreground">{client.total_purchases} compras</p>
                </div>
                <LtvBadge segment={client.segment} ltv={client.ltv} size="sm" />
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedEmail && (
        <ClientDetailSheet
          email={selectedEmail}
          open={!!selectedEmail}
          onClose={() => setSelectedEmail(null)}
        />
      )}

      <Dialog open={!!waClient} onOpenChange={(open) => { if (!open) setWaClient(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">{waClient?.name || waClient?.email}</p>
              <p className="text-xs text-muted-foreground">{waClient?.phone}</p>
            </div>
            <Textarea
              placeholder="Digite a mensagem..."
              value={waMessage}
              onChange={(e) => setWaMessage(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaClient(null)}>Cancelar</Button>
            <Button
              onClick={handleSendWhatsApp}
              disabled={waSending || !waMessage.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Send className="h-4 w-4 mr-2" />
              {waSending ? "Enviando..." : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
