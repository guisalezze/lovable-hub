import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ReactFlowProvider } from "@xyflow/react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import FlowEditor from "@/components/instagram/flow/FlowEditor";
import type { IgRule } from "@/lib/instagramFlow";

export default function InstagramFluxoEditor() {
  const { id } = useParams<{ id: string }>();
  const { data: rule, isLoading, error } = useQuery({
    queryKey: ["ig_automation", id],
    enabled: !!id,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("ig_automations").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      return (data as unknown as IgRule | null) ?? null;
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !rule) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-20 text-center">
        <h1 className="text-lg font-semibold">Fluxo não encontrado</h1>
        <p className="text-sm text-muted-foreground">
          {error ? (error as Error).message : "Ele pode ter sido excluído."}
        </p>
        <Button asChild variant="outline">
          <Link to="/instagram-automacoes">← Instagram</Link>
        </Button>
      </div>
    );
  }
  return (
    <ReactFlowProvider>
      <FlowEditor key={rule.id} rule={rule} />
    </ReactFlowProvider>
  );
}
