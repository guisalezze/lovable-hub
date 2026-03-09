import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClientLtv {
  email: string;
  name: string | null;
  phone: string | null;
  lead_id: string | null;
  total_purchases: number;
  sales_revenue: number;
  total_charges: number;
  charges_revenue: number;
  total_implementations: number;
  impl_revenue: number;
  ltv: number;
  first_purchase_at: string | null;
  last_purchase_at: string | null;
  segment: "vip" | "premium" | "regular" | "new";
}

export function useClientLtvList(search?: string) {
  return useQuery({
    queryKey: ["client-ltv", search],
    queryFn: async () => {
      if (search && search.trim().length >= 2) {
        const { data, error } = await supabase.rpc("search_clients", {
          search_term: search.trim(),
        });
        if (error) throw error;
        return (data || []) as ClientLtv[];
      }
      // Use raw SQL via the view
      const { data, error } = await supabase
        .from("client_ltv" as any)
        .select("*")
        .order("ltv", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as ClientLtv[];
    },
  });
}

export function useClientLtvByEmail(email: string | null | undefined) {
  return useQuery({
    queryKey: ["client-ltv", "email", email],
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_ltv" as any)
        .select("*")
        .eq("email", email!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ClientLtv | null;
    },
  });
}

export function useClientLtvKpis() {
  return useQuery({
    queryKey: ["client-ltv-kpis"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_ltv" as any)
        .select("*");
      if (error) throw error;
      const clients = (data || []) as unknown as ClientLtv[];
      const totalClients = clients.length;
      const totalLtv = clients.reduce((acc, c) => acc + c.ltv, 0);
      const avgLtv = totalClients > 0 ? totalLtv / totalClients : 0;
      const vipCount = clients.filter(c => c.segment === "vip").length;
      const premiumCount = clients.filter(c => c.segment === "premium").length;
      const topClients = clients.slice(0, 5);
      return { totalClients, totalLtv, avgLtv, vipCount, premiumCount, topClients };
    },
  });
}

export function useClientHistory(email: string | null | undefined) {
  return useQuery({
    queryKey: ["client-history", email],
    enabled: !!email,
    queryFn: async () => {
      const [salesRes, chargesRes, implRes] = await Promise.all([
        supabase
          .from("sales")
          .select("id, code, product_name, sale_amount, sale_status_enum, date_created")
          .eq("lead_email", email!)
          .order("date_created", { ascending: false }),
        supabase
          .from("charges")
          .select("id, client_name, product_name, total_ticket, status, created_at")
          .eq("client_email", email!)
          .order("created_at", { ascending: false }),
        supabase
          .from("implementations")
          .select("id, client_name, description, total_value, status, contract_start, contract_end")
          .eq("client_email", email!)
          .order("created_at", { ascending: false }),
      ]);
      return {
        sales: salesRes.data || [],
        charges: chargesRes.data || [],
        implementations: implRes.data || [],
      };
    },
  });
}
