import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Phone, Mail, Copy, ExternalLink, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type LeadStatus = "novo" | "quase_comprou" | "comprou" | "perdido";

interface Lead {
  id: string;
  email: string;
  full_name: string | null;
  phone_formatted: string | null;
  phone_e164: string | null;
  status: LeadStatus;
  last_product: string | null;
  last_sale_amount: number | null;
  last_sale_status_enum: string | null;
  last_billet_url: string | null;
  created_at: string;
}

const columns: { status: LeadStatus; label: string; color: string }[] = [
  { status: "novo", label: "Novo", color: "bg-primary/20 text-primary" },
  { status: "quase_comprou", label: "Quase Comprou", color: "bg-warning/20 text-warning" },
  { status: "comprou", label: "Comprou", color: "bg-success/20 text-success" },
  { status: "perdido", label: "Perdido", color: "bg-destructive/20 text-destructive" },
];

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeads();
  }, []);

  async function fetchLeads() {
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar leads");
    } else {
      setLeads((data as Lead[]) || []);
    }
    setLoading(false);
  }

  const filtered = leads.filter(
    (l) =>
      (l.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
      l.email.toLowerCase().includes(search.toLowerCase())
  );

  const getLeadsByStatus = (status: LeadStatus) =>
    filtered.filter((l) => l.status === status);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  async function updateLeadStatus(leadId: string, newStatus: LeadStatus) {
    const { error } = await supabase
      .from("leads")
      .update({ status: newStatus })
      .eq("id", leadId);
    if (error) {
      toast.error("Erro ao atualizar status");
    } else {
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {leads.length} leads no total
          </p>
        </div>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Lead
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-card border-border"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Carregando...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 overflow-x-auto">
          {columns.map((col) => (
            <div key={col.status} className="min-w-[280px]">
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${col.color}`}>
                  {col.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {getLeadsByStatus(col.status).length}
                </span>
              </div>
              <div className="space-y-2">
                {getLeadsByStatus(col.status).map((lead) => (
                  <div
                    key={lead.id}
                    className="glass-card p-4 hover:border-primary/30 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {lead.full_name || "Sem nome"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{lead.email}</p>
                      </div>
                    </div>

                    {lead.last_product && (
                      <p className="text-xs text-muted-foreground mb-2">
                        {lead.last_product}{" "}
                        {lead.last_sale_amount && (
                          <span className="text-foreground font-medium">
                            R$ {Number(lead.last_sale_amount).toFixed(2)}
                          </span>
                        )}
                      </p>
                    )}

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {lead.phone_e164 && (
                        <a
                          href={`https://wa.me/${lead.phone_e164.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-success"
                          title="WhatsApp"
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => copyToClipboard(lead.email, "Email")}
                        className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                        title="Copiar email"
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </button>
                      {lead.phone_formatted && (
                        <button
                          onClick={() => copyToClipboard(lead.phone_formatted!, "Telefone")}
                          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                          title="Copiar telefone"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {lead.last_billet_url && (
                        <a
                          href={lead.last_billet_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                          title="Boleto/PIX"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>

                    {/* Status quick change */}
                    <div className="flex gap-1 mt-2 pt-2 border-t border-border/50">
                      {columns
                        .filter((c) => c.status !== lead.status)
                        .map((c) => (
                          <button
                            key={c.status}
                            onClick={() => updateLeadStatus(lead.id, c.status)}
                            className={`text-[9px] px-1.5 py-0.5 rounded ${c.color} opacity-0 group-hover:opacity-100 transition-opacity`}
                          >
                            {c.label}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
                {getLeadsByStatus(col.status).length === 0 && (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    Nenhum lead
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
