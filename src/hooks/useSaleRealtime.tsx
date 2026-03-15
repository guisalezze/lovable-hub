import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { playSaleSound } from "@/lib/sounds";

/** Formata valor em BRL */
function fmtBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

/** Toast visual de venda aprovada */
function SaleToast({
  amount,
  productName,
  onDismiss,
}: {
  amount: number;
  productName: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 bg-[#18181b] border border-emerald-500/30 rounded-xl px-4 py-3 shadow-2xl shadow-emerald-500/10 cursor-pointer min-w-[280px] max-w-[340px]"
      onClick={onDismiss}
    >
      {/* Logo Solaryz */}
      <img
        src="/logo.png"
        alt="Solaryz"
        className="flex-shrink-0 w-9 h-9 rounded-lg object-cover"
      />

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white leading-tight">
          Venda aprovada! 🎉
        </p>
        <p className="text-[11px] text-emerald-400 font-medium mt-0.5">
          {fmtBRL(amount)}
        </p>
        {productName && (
          <p className="text-[10px] text-zinc-500 truncate mt-0.5">
            {productName}
          </p>
        )}
      </div>

      {/* Barra animada de progresso na base */}
      <style>{`
        @keyframes shrink-bar {
          from { width: 100%; }
          to   { width: 0%; }
        }
        .sale-progress-bar {
          animation: shrink-bar 6s linear forwards;
        }
      `}</style>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-b-xl overflow-hidden bg-emerald-900/30">
        <div className="sale-progress-bar h-full bg-emerald-500" />
      </div>
    </div>
  );
}

/** Envia notificação push nativa (se o usuário tiver ativado) */
async function sendPushNotification(amount: number, productName: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const formattedAmount = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
    }).format(amount);

    await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        userId: user.id,
        title: "Venda aprovada! 🎉",
        body: `Valor: ${formattedAmount}${productName ? ` - ${productName}` : ""}`,
        icon: "/logo.png",
        tag: `sale-${Date.now()}`,
        data: {
          url: "/financeiro",
          type: "sale",
        },
      }),
    });
  } catch (error) {
    // Silenciosamente falha se push não estiver disponível
    console.debug("Push notification não enviada:", error);
  }
}

/** Mostra o toast de venda aprovada */
async function showSaleToast(amount: number, productName: string) {
  if (amount <= 0) return;
  playSaleSound();

  // Enviar push notification (não bloqueia o toast)
  sendPushNotification(amount, productName).catch(() => {});

  toast.custom(
    (t) => (
      <div className="relative overflow-hidden rounded-xl">
        <SaleToast
          amount={amount}
          productName={productName}
          onDismiss={() => toast.dismiss(t)}
        />
      </div>
    ),
    {
      duration: 6000,
      position: "top-center",
    }
  );
}

/**
 * Hook que escuta Supabase Realtime e dispara toast
 * a cada nova venda aprovada (PerfectPay / Nutra).
 */
export function useSaleRealtime() {
  useEffect(() => {
    const channel = supabase
      .channel("sale-realtime-notifications")
      // Educacional — tabela sales
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "sales",
          filter: "sale_status_enum=eq.approved",
        },
        (payload: { new: { sale_amount?: number | null; product_name?: string | null } }) => {
          const sale = payload.new;
          showSaleToast(
            Number(sale.sale_amount || 0),
            sale.product_name || "Produto"
          );
        }
      )
      // Nutra — tabela nutra_sales
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "nutra_sales",
          filter: "status=eq.approved",
        },
        (payload: { new: { amount?: number | null; product_name?: string | null } }) => {
          const sale = payload.new;
          showSaleToast(
            Number(sale.amount || 0),
            sale.product_name || "Produto"
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
