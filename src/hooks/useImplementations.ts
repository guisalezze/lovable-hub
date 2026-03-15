import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ImplementationStep {
  id: string;
  implementation_id: string;
  title: string;
  description: string | null;
  order_index: number;
  status: "pending" | "in_progress" | "done";
  completed_at: string | null;
}

export interface ImplementationDocument {
  id: string;
  implementation_id: string;
  title: string;
  url: string | null;
  type: "link" | "doc" | "video" | "sheet" | "other";
  created_at: string;
  profiles?: { full_name: string | null; email: string };
}

export interface ImplementationNote {
  id: string;
  content: string;
  created_at: string;
  profiles?: { full_name: string | null; email: string };
}

export interface Implementation {
  id: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  lead_id: string | null;
  description: string | null;
  contract_start: string;
  contract_end: string;
  total_value: number;
  paid_amount: number;
  charge_id: string | null;
  assigned_to: string | null;
  status: "active" | "completed" | "paused" | "cancelled";
  created_at: string;
  implementation_steps: ImplementationStep[];
  profiles?: { full_name: string | null; email: string };
  charges?: { id: string; installments_count: number; entry_paid: number } | null;
}

export function useImplementations() {
  return useQuery<Implementation[]>({
    queryKey: ["implementations"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("implementations")
        .select(`
          *,
          implementation_steps(*),
          profiles:assigned_to(full_name, email),
          charges:charge_id(id, installments_count, entry_paid)
        `)
        .order("contract_end", { ascending: true });
      if (error) throw error;
      return (data as Implementation[]) || [];
    },
    staleTime: 30_000,
  });
}

export function useImplementationDetail(id: string) {
  return useQuery({
    queryKey: ["implementation", id],
    queryFn: async () => {
      const [implRes, docsRes, notesRes] = await Promise.all([
        (supabase as any).from("implementations").select(`*, implementation_steps(*), profiles:assigned_to(full_name, email), charges:charge_id(*)`).eq("id", id).single(),
        (supabase as any).from("implementation_documents").select("*, profiles:created_by(full_name, email)").eq("implementation_id", id).order("created_at", { ascending: false }),
        (supabase as any).from("implementation_notes").select("*, profiles:created_by(full_name, email)").eq("implementation_id", id).order("created_at", { ascending: false }),
      ]);
      if (implRes.error) throw implRes.error;
      return {
        implementation: implRes.data as Implementation,
        documents: (docsRes.data || []) as ImplementationDocument[],
        notes: (notesRes.data || []) as ImplementationNote[],
      };
    },
    staleTime: 30_000,
    enabled: !!id,
  });
}

export function useImplementationTemplates() {
  return useQuery({
    queryKey: ["implementation-templates"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("implementation_templates")
        .select("*, implementation_template_steps(*)")
        .order("name");
      return data || [];
    },
    staleTime: Infinity,
  });
}

export function useCreateImplementation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      impl: {
        client_name: string;
        client_email: string | null;
        client_phone: string | null;
        description: string | null;
        contract_start: string;
        contract_end: string;
        total_value: number;
        assigned_to: string;
        charge_id: string | null;
        lead_id: string | null;
        status: string;
      };
      steps: { title: string; description?: string; order_index: number }[];
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: impl, error } = await (supabase as any)
        .from("implementations")
        .insert({ ...payload.impl, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      if (payload.steps.length > 0) {
        await (supabase as any).from("implementation_steps").insert(
          payload.steps.map(s => ({ ...s, implementation_id: impl.id, status: "pending" }))
        );
      }
      return impl;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["implementations"] }),
  });
}

export function useUpdateImplementationPaidAmount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, paid_amount }: { id: string; paid_amount: number }) => {
      const { error } = await (supabase as any)
        .from("implementations")
        .update({ paid_amount })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["implementations"] });
      qc.invalidateQueries({ queryKey: ["project-revenue-total"] });
    },
  });
}

export function useUpdateImplementation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<{
      client_name: string;
      client_email: string | null;
      client_phone: string | null;
      description: string | null;
      contract_start: string;
      contract_end: string;
      total_value: number;
      assigned_to: string | null;
      status: string;
    }>) => {
      const { error } = await (supabase as any).from("implementations").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["implementations"] });
    },
  });
}

export function useDeleteImplementation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Delete related data first
      await Promise.all([
        (supabase as any).from("implementation_steps").delete().eq("implementation_id", id),
        (supabase as any).from("implementation_documents").delete().eq("implementation_id", id),
        (supabase as any).from("implementation_notes").delete().eq("implementation_id", id),
      ]);
      const { error } = await (supabase as any).from("implementations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["implementations"] }),
  });
}

export function useUpdateStepStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ stepId, status, implId }: { stepId: string; status: ImplementationStep["status"]; implId: string }) => {
      const { error } = await (supabase as any).from("implementation_steps").update({
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
      }).eq("id", stepId);
      if (error) throw error;
      return implId;
    },
    onSuccess: (implId) => {
      qc.invalidateQueries({ queryKey: ["implementations"] });
      qc.invalidateQueries({ queryKey: ["implementation", implId] });
    },
  });
}

export function useAddDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: { implementation_id: string; title: string; url: string; type: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("implementation_documents").insert({ ...doc, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["implementation", vars.implementation_id] }),
  });
}

export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ implementation_id, content }: { implementation_id: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("implementation_notes").insert({ implementation_id, content, created_by: user?.id });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ["implementation", vars.implementation_id] }),
  });
}

export function useAddStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ implementation_id, title, order_index }: { implementation_id: string; title: string; order_index: number }) => {
      const { error } = await (supabase as any).from("implementation_steps").insert({
        implementation_id, title, order_index, status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["implementation", vars.implementation_id] });
      qc.invalidateQueries({ queryKey: ["implementations"] });
    },
  });
}

export function useUpdateImplementationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Implementation["status"] }) => {
      const { error } = await (supabase as any).from("implementations").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["implementations"] }),
  });
}
