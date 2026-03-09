import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShoppingCart, Receipt, Briefcase } from "lucide-react";
import { useClientLtvByEmail, useClientHistory } from "@/hooks/useClientLtv";
import { LtvBadge } from "@/components/shared/LtvBadge";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const STATUS_LABELS: Record<string, string> = {
  approved: "Aprovado",
  pending: "Pendente",
  refunded: "Reembolsado",
  chargeback: "Chargeback",
  active: "Ativa",
  completed: "Concluída",
  paused: "Pausada",
  cancelled: "Cancelada",
};

export function ClientDetailSheet({
  email, open, onClose,
}: { email: string; open: boolean; onClose: () => void }) {
  const { data: client, isLoading: clientLoading } = useClientLtvByEmail(email);
  const { data: history, isLoading: historyLoading } = useClientHistory(email);

  const isLoading = clientLoading || historyLoading;

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : client ? (
          <>
            <SheetHeader>
              <div className="flex items-start justify-between">
                <div>
                  <SheetTitle>{client.name || client.email}</SheetTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">{client.email}</p>
                  {client.phone && <p className="text-xs text-muted-foreground">{client.phone}</p>}
                </div>
                <LtvBadge segment={client.segment} ltv={client.ltv} size="md" />
              </div>

              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="bg-secondary/50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Vendas</p>
                  <p className="text-sm font-bold text-foreground">{fmtBRL(client.sales_revenue)}</p>
                  <p className="text-[10px] text-muted-foreground">{client.total_purchases} compras</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Cobranças</p>
                  <p className="text-sm font-bold text-foreground">{fmtBRL(client.charges_revenue)}</p>
                  <p className="text-[10px] text-muted-foreground">{client.total_charges} cobranças</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Implementações</p>
                  <p className="text-sm font-bold text-foreground">{fmtBRL(client.impl_revenue)}</p>
                  <p className="text-[10px] text-muted-foreground">{client.total_implementations} impl.</p>
                </div>
              </div>
            </SheetHeader>

            <Tabs defaultValue="sales" className="mt-6">
              <TabsList className="w-full">
                <TabsTrigger value="sales" className="flex-1">Vendas</TabsTrigger>
                <TabsTrigger value="charges" className="flex-1">Cobranças</TabsTrigger>
                <TabsTrigger value="implementations" className="flex-1">Impl.</TabsTrigger>
              </TabsList>

              <TabsContent value="sales" className="space-y-2 mt-4">
                {(history?.sales || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Sem vendas registradas</p>
                ) : (
                  history!.sales.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-secondary/20">
                      <div className="flex items-center gap-3 min-w-0">
                        <ShoppingCart className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{s.product_name || s.code}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {s.date_created ? format(parseISO(s.date_created), "d MMM yyyy", { locale: ptBR }) : "—"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-sm font-bold text-foreground">{fmtBRL(s.sale_amount || 0)}</p>
                        <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[s.sale_status_enum] || s.sale_status_enum}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="charges" className="space-y-2 mt-4">
                {(history?.charges || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Sem cobranças registradas</p>
                ) : (
                  history!.charges.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-secondary/20">
                      <div className="flex items-center gap-3 min-w-0">
                        <Receipt className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{c.product_name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {format(parseISO(c.created_at), "d MMM yyyy", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-sm font-bold text-foreground">{fmtBRL(c.total_ticket)}</p>
                        <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[c.status] || c.status}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="implementations" className="space-y-2 mt-4">
                {(history?.implementations || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Sem implementações</p>
                ) : (
                  history!.implementations.map((impl: any) => (
                    <div key={impl.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-secondary/20">
                      <div className="flex items-center gap-3 min-w-0">
                        <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{impl.description || impl.client_name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {format(parseISO(impl.contract_start), "d MMM", { locale: ptBR })} → {format(parseISO(impl.contract_end), "d MMM yyyy", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-sm font-bold text-foreground">{fmtBRL(impl.total_value)}</p>
                        <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[impl.status] || impl.status}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-10">Cliente não encontrado</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
