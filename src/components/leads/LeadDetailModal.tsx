import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

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

interface LeadDetailModalProps {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
}

const statusOptions: { value: LeadStatus; label: string; dot: string }[] = [
  { value: "novo", label: "Novo", dot: "bg-primary" },
  { value: "quase_comprou", label: "Quase Comprou", dot: "bg-yellow-500" },
  { value: "comprou", label: "Comprou", dot: "bg-emerald-500" },
  { value: "perdido", label: "Perdido", dot: "bg-destructive" },
];

const saleStatusLabel: Record<string, { label: string; color: string }> = {
  approved: { label: "Aprovado", color: "bg-success/20 text-success" },
  pending: { label: "Pendente", color: "bg-warning/20 text-warning" },
  refunded: { label: "Reembolso", color: "bg-muted-foreground/20 text-muted-foreground" },
  chargeback: { label: "Chargeback", color: "bg-destructive/20 text-destructive" },
  canceled: { label: "Cancelado", color: "bg-destructive/20 text-destructive" },
  complete: { label: "Completo", color: "bg-success/20 text-success" },
};

const copy = (text: string, label: string) => {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copiado!`);
};

export function LeadDetailModal({ lead, open, onClose, onStatusChange }: LeadDetailModalProps) {
  if (!lead) return null;

  const initials = (lead.full_name || lead.email)
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  const saleInfo = lead.last_sale_status_enum ? saleStatusLabel[lead.last_sale_status_enum] : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold truncate">{lead.full_name || "Sem nome"}</p>
              <p className="text-xs text-muted-foreground font-normal">{lead.email}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Status */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
            <Select
              value={lead.status}
              onValueChange={(v) => onStatusChange(lead.id, v as LeadStatus)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                      {s.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Contact */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Contato</label>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between glass-card px-3 py-2">
                <span className="text-sm truncate">{lead.email}</span>
                <button onClick={() => copy(lead.email, "Email")} className="text-muted-foreground hover:text-foreground">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              {lead.phone_formatted && (
                <div className="flex items-center justify-between glass-card px-3 py-2">
                  <span className="text-sm">{lead.phone_formatted}</span>
                  <div className="flex gap-1">
                    <button onClick={() => copy(lead.phone_formatted!, "Telefone")} className="text-muted-foreground hover:text-foreground">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    {lead.phone_e164 && (
                      <a href={`https://wa.me/${lead.phone_e164.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-success">
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Last Sale */}
          {lead.last_product && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Última Venda</label>
              <div className="glass-card px-3 py-2 space-y-1">
                <p className="text-sm font-medium">{lead.last_product}</p>
                <div className="flex items-center gap-2">
                  {lead.last_sale_amount != null && (
                    <span className="text-sm font-semibold text-foreground">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(lead.last_sale_amount))}
                    </span>
                  )}
                  {saleInfo && (
                    <Badge variant="secondary" className={`text-[10px] ${saleInfo.color}`}>{saleInfo.label}</Badge>
                  )}
                </div>
                {lead.last_billet_url && (
                  <a href={lead.last_billet_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                    <ExternalLink className="h-3 w-3" /> Boleto/PIX
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Date */}
          <p className="text-xs text-muted-foreground">
            Cadastrado em {format(parseISO(lead.created_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>

          {/* Actions */}
          <div className="flex gap-2">
            {lead.phone_e164 && (
              <Button size="sm" variant="outline" className="gap-1.5 flex-1" asChild>
                <a href={`https://wa.me/${lead.phone_e164.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                  <Phone className="h-3.5 w-3.5" /> WhatsApp
                </a>
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5 flex-1" onClick={() => copy(lead.email, "Email")}>
              <Mail className="h-3.5 w-3.5" /> Copiar email
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
