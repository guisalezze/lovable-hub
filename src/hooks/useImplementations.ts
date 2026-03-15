import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, addMonths, parseISO } from "date-fns";

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

export interface ChargeInstallmentForImpl {
  id: string;
  charge_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  status: "pending" | "paid" | "overdue";
  paid_at: string | null;
}

export interface ChargeForImpl {
  id: string;
  installments_count: number;
  entry_paid: number;
  installment_value: number;
  total_ticket: number;
  notes: string | null;
  charge_installments: ChargeInstallmentForImpl[];
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
  charges?: ChargeForImpl | null;
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
          charges:charge_id(id, installments_count, entry_paid, installment_value, total_ticket, notes, charge_installments(*))
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
        (supabase as any)
          .from("implementations")
          .select(`*, implementation_steps(*), profiles:assigned_to(full_name, email), charges:charge_id(*, charge_installments(*))`)
          .eq("id", id)
          .single(),
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
      charge?: {
        entry_amount: number;
        entry_method: string;
        installments_count: number;
        installment_method: string;
        first_due_date: string;
      } | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Create implementation
      // paid_amount só é incluído se a coluna existir (migration aplicada)
      const initialPaid = payload.charge?.entry_amount ?? 0;
      const baseInsert: any = { ...payload.impl, created_by: user?.id };

      // Tenta primeiro com paid_amount; se falhar com PGRST204 (coluna não existe), tenta sem
      let impl: any;
      let firstErr: any;

      const tryWithPaid = await (supabase as any)
        .from("implementations")
        .insert({ ...baseInsert, paid_amount: initialPaid })
        .select()
        .single();

      if (tryWithPaid.error?.code === "PGRST204") {
        // Coluna não existe ainda — insere sem paid_amount
        const tryWithout = await (supabase as any)
          .from("implementations")
          .insert(baseInsert)
          .select()
          .single();
        if (tryWithout.error) throw tryWithout.error;
        impl = tryWithout.data;
      } else if (tryWithPaid.error) {
        throw tryWithPaid.error;
      } else {
        impl = tryWithPaid.data;
      }
      if (error) throw error;

      // 2. Create steps
      if (payload.steps.length > 0) {
        await (supabase as any).from("implementation_steps").insert(
          payload.steps.map(s => ({ ...s, implementation_id: impl.id, status: "pending" }))
        );
      }

      // 3. Create charge if payment data provided
      if (payload.charge) {
        const { entry_amount, entry_method, installments_count, installment_method, first_due_date } = payload.charge;
        const hasPayment = entry_amount > 0 || installments_count > 0;

        if (hasPayment) {
          const remaining = Math.max(0, payload.impl.total_value - entry_amount);
          const installmentValue = installments_count > 0 ? remaining / installments_count : 0;

          const chargeNotes = [
            entry_amount > 0 ? `Entrada via ${entry_method === "pix" ? "Pix" : "PerfectPay"}` : "",
            installments_count > 0 ? `${installments_count}x via ${installment_method === "pix" ? "Pix" : "PerfectPay"}` : "",
          ].filter(Boolean).join(" · ");

          const { data: charge, error: chargeErr } = await (supabase as any)
            .from("charges")
            .insert({
              product_name: payload.impl.description || "Mentoria",
              client_name: payload.impl.client_name,
              client_phone: payload.impl.client_phone || null,
              total_ticket: payload.impl.total_value,
              entry_paid: entry_amount,
              installments_count: installments_count,
              installment_value: installmentValue,
              assigned_to: payload.impl.assigned_to,
              created_by: user?.id,
              notes: chargeNotes || null,
              status: "active",
            })
            .select()
            .single();
          if (chargeErr) throw chargeErr;

          // Create installments
          if (installments_count > 0 && first_due_date) {
            const installments = Array.from({ length: installments_count }, (_, i) => ({
              charge_id: charge.id,
              installment_number: i + 1,
              due_date: format(addMonths(parseISO(first_due_date), i), "yyyy-MM-dd"),
              amount: Math.round(installmentValue * 100) / 100,
              status: "pending",
            }));
            await (supabase as any).from("charge_installments").insert(installments);
          }

          // Link charge to implementation
          await (supabase as any)
            .from("implementations")
            .update({ charge_id: charge.id })
            .eq("id", impl.id);
        }
      }

      return impl;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["implementations"] });
      qc.invalidateQueries({ queryKey: ["charges"] });
      qc.invalidateQueries({ queryKey: ["project-revenue-total"] });
    },
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

/** Marca uma parcela como paga e incrementa paid_amount na implementação */
export function useMarkInstallmentPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      installmentId,
      amount,
      implementationId,
    }: {
      installmentId: string;
      amount: number;
      implementationId: string;
    }) => {
      // 1. Mark installment as paid
      const { error: instErr } = await (supabase as any)
        .from("charge_installments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", installmentId);
      if (instErr) throw instErr;

      // 2. Get current paid_amount
      const { data: implData } = await (supabase as any)
        .from("implementations")
        .select("paid_amount")
        .eq("id", implementationId)
        .single();

      // 3. Update paid_amount += installment.amount
      const { error: implErr } = await (supabase as any)
        .from("implementations")
        .update({ paid_amount: (implData?.paid_amount || 0) + amount })
        .eq("id", implementationId);
      if (implErr) throw implErr;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["implementation", vars.implementationId] });
      qc.invalidateQueries({ queryKey: ["implementations"] });
      qc.invalidateQueries({ queryKey: ["charges"] });
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
