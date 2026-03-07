import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const priorityLabels: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta ⚠️",
  urgente: "URGENTE 🚨",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { task_id, assigned_to } = await req.json();
    if (!task_id || !assigned_to) {
      return new Response(JSON.stringify({ error: "task_id and assigned_to required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch task
    const { data: task, error: taskErr } = await supabase
      .from("tasks")
      .select("id, title, due_date, priority, status, created_by")
      .eq("id", task_id)
      .single();

    if (taskErr || !task) {
      return new Response(JSON.stringify({ error: "Task not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip if self-assigned
    if (task.created_by === assigned_to) {
      return new Response(JSON.stringify({ skipped: true, reason: "self_assignment" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch assignee profile
    const { data: assignee } = await supabase
      .from("profiles")
      .select("id, full_name, phone_e164, whatsapp_notifications_enabled")
      .eq("id", assigned_to)
      .single();

    // Fetch creator profile
    const { data: creator } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", task.created_by)
      .single();

    const creatorName = creator?.full_name || "Alguém";

    // Always create in-app notification
    await supabase.from("notifications").insert({
      user_id: assigned_to,
      type: "TASK_ASSIGNED",
      task_id: task.id,
      message: `${creatorName} atribuiu a tarefa: ${task.title}`,
    });

    // Check if assignee has phone
    if (!assignee?.phone_e164) {
      await supabase.from("task_whatsapp_notifications").insert({
        task_id: task.id,
        recipient_user_id: assigned_to,
        recipient_phone: "",
        message_type: "assignment",
        status: "failed",
        error_message: "Telefone não cadastrado",
      });
      return new Response(JSON.stringify({ sent: false, reason: "no_phone" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if WhatsApp notifications are enabled for this user
    if (assignee.whatsapp_notifications_enabled === false) {
      return new Response(JSON.stringify({ sent: false, reason: "notifications_disabled" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Format due date
    let dataFormatada = "Sem prazo";
    let horaFormatada = "";
    if (task.due_date) {
      const d = new Date(task.due_date);
      dataFormatada = d.toLocaleDateString("pt-BR");
      horaFormatada = "23:59";
    }

    // Call whatsapp-send-message
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const waRes = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send-message`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: assignee.phone_e164,
        template_name: "task_assignment",
        template_language: "pt_BR",
        template_params: [
          creatorName,
          task.title,
          dataFormatada,
          horaFormatada,
          priorityLabels[task.priority] || task.priority,
        ],
      }),
    });

    const waData = await waRes.json();

    // Record in task_whatsapp_notifications
    await supabase.from("task_whatsapp_notifications").insert({
      task_id: task.id,
      recipient_user_id: assigned_to,
      recipient_phone: assignee.phone_e164,
      message_type: "assignment",
      whatsapp_message_id: waData.whatsapp_message_id || null,
      status: waRes.ok ? "sent" : "failed",
      error_message: waRes.ok ? null : JSON.stringify(waData),
      sent_at: waRes.ok ? new Date().toISOString() : null,
    });

    return new Response(JSON.stringify({ sent: waRes.ok, data: waData }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
