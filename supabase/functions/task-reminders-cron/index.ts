import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Current time in Brasília (UTC-3)
    const now = new Date();
    const brasiliaOffset = -3 * 60;
    const brasiliaTime = new Date(now.getTime() + (brasiliaOffset + now.getTimezoneOffset()) * 60000);
    const currentHour = brasiliaTime.getHours();

    // Only send at 08:00 Brasília (allow window 07:30-08:30 for cron flexibility)
    // Also allow bypass with force=true for manual testing
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "true";
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }
    const forceBody = (body as Record<string, unknown>).force === true;

    if (!force && !forceBody && (currentHour < 7 || currentHour > 8)) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "outside_send_window" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Today in Brasília (YYYY-MM-DD)
    const todayStr = brasiliaTime.toISOString().split("T")[0];

    // Fetch all non-completed tasks with assigned_to and due_date
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("id, title, status, due_date, assigned_to")
      .neq("status", "concluido")
      .not("assigned_to", "is", null)
      .not("due_date", "is", null);

    if (tasksError) throw tasksError;
    console.log(`[task-reminders] Found ${tasks?.length || 0} tasks`);
    if (!tasks || tasks.length === 0) {
      return new Response(JSON.stringify({ ok: true, reminders_sent: 0, reason: "no_tasks" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch profiles for all assigned users
    const userIds = [...new Set(tasks.map(t => t.assigned_to!))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, phone_e164")
      .in("id", userIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    // Check which tasks already got a reminder today
    const taskIds = tasks.map(t => t.id);
    const { data: sentToday } = await supabase
      .from("task_whatsapp_notifications")
      .select("task_id")
      .in("task_id", taskIds)
      .eq("message_type", "daily_reminder")
      .eq("status", "sent")
      .gte("created_at", `${todayStr}T00:00:00-03:00`);

    const alreadySentSet = new Set(sentToday?.map(s => s.task_id) || []);

    let sentCount = 0;
    const errors: string[] = [];

    for (const task of tasks) {
      // Skip if already reminded today
      if (alreadySentSet.has(task.id)) continue;

      const profile = profileMap.get(task.assigned_to!);
      if (!profile?.phone_e164) continue;

      // Sanitize phone
      const phone = profile.phone_e164.replace(/[^0-9+]/g, "");
      if (!phone || phone.length < 10) continue;

      const dueDate = new Date(task.due_date! + "T00:00:00-03:00");
      const todayDate = new Date(todayStr + "T00:00:00-03:00");
      const diffMs = dueDate.getTime() - todayDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      // Format due_date as DD/MM/YYYY
      const dueDateFormatted = `${String(dueDate.getDate()).padStart(2, "0")}/${String(dueDate.getMonth() + 1).padStart(2, "0")}/${dueDate.getFullYear()}`;

      let mensagem: string;

      if (diffDays >= 0) {
        // Within deadline
        mensagem = `🔔 Lembrete de Tarefa\n\nOlá, ${profile.full_name || "responsável"}!\n\nVocê tem uma tarefa pendente:\n\n📋 Tarefa: ${task.title}\n📅 Prazo limite: ${dueDateFormatted}\n⏳ Dias restantes: ${diffDays} dia(s)\n\nPor favor, finalize antes do prazo!`;
      } else {
        // Overdue
        const diasVencidos = Math.abs(diffDays);
        mensagem = `🚨 Tarefa com Prazo Vencido!\n\nOlá, ${profile.full_name || "responsável"}!\n\nA seguinte tarefa está com o prazo vencido:\n\n📋 Tarefa: ${task.title}\n📅 Prazo limite era: ${dueDateFormatted}\n❌ Vencida há: ${diasVencidos} dia(s)\n\nRegularize o quanto antes!`;
      }

      // Send via send-whatsapp (n8n/neowchat webhook)
      try {
        const waRes = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            nomeCliente: profile.full_name || "Responsável",
            telefoneCliente: phone,
            mensagem,
          }),
        });

        const waData = await waRes.json().catch(() => ({}));
        const success = waRes.ok && waData.success;

        // Log notification
        await supabase.from("task_whatsapp_notifications").insert({
          task_id: task.id,
          recipient_user_id: task.assigned_to,
          recipient_phone: phone,
          message_type: "daily_reminder",
          status: success ? "sent" : "failed",
          error_message: success ? null : JSON.stringify(waData),
          sent_at: success ? now.toISOString() : null,
        });

        // Also create in-app notification
        await supabase.from("notifications").insert({
          user_id: task.assigned_to,
          type: diffDays < 0 ? "TASK_OVERDUE" : "TASK_DUE_SOON",
          task_id: task.id,
          message: diffDays < 0
            ? `🚨 Tarefa atrasada: ${task.title} (vencida há ${Math.abs(diffDays)} dia(s))`
            : `🔔 Lembrete: ${task.title} (${diffDays} dia(s) restantes)`,
        });

        if (success) sentCount++;
        else errors.push(`Task ${task.id}: ${JSON.stringify(waData)}`);
      } catch (sendErr) {
        errors.push(`Task ${task.id}: ${String(sendErr)}`);
        await supabase.from("task_whatsapp_notifications").insert({
          task_id: task.id,
          recipient_user_id: task.assigned_to,
          recipient_phone: phone,
          message_type: "daily_reminder",
          status: "failed",
          error_message: String(sendErr),
        });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      reminders_sent: sentCount,
      errors_count: errors.length,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
