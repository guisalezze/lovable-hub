import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClientInfo {
  email: string;
  full_name: string | null;
  phone_e164: string | null;
  phone_formatted: string | null;
}

/**
 * Busca clientes na base de leads por nome (autocomplete)
 */
export function useClientSearch(query: string, enabled: boolean = true) {
  return useQuery<ClientInfo[]>({
    queryKey: ["client-search", query],
    enabled: enabled && query.length >= 2, // Só busca se tiver pelo menos 2 caracteres
    queryFn: async () => {
      if (!query || query.length < 2) return [];

      // Busca por nome ou email (case-insensitive, partial match)
      const { data, error } = await supabase
        .from("leads")
        .select("email, full_name, phone_e164, phone_formatted")
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return (data || []).filter((l) => l.full_name) as ClientInfo[];
    },
    staleTime: 30_000, // Cache por 30 segundos
  });
}
