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

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayStr = today.toISOString().split("T")[0];
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // 1. TASK_DUE_SOON: tasks due within 24h, not completed, not already notified
    const { data: dueSoonTasks } = await supabase
      .from("tasks")
      .select("id, title, priority, status, due_date, assigned_to")
      .gte("due_date", todayStr)
      .lte("due_date", tomorrowStr)
      .neq("status", "concluido")
      .not("assigned_to", "is", null);

    let dueSoonCount = 0;
    for (const task of dueSoonTasks || []) {
      // Check if already notified in last 24h
      const { count } = await supabase
        .from("pending_webhooks")
        .select("*", { count: "exact", head: true })
        .eq("task_id", task.id)
        .eq("event_type", "TASK_DUE_SOON")
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if ((count || 0) === 0) {
        await supabase.from("notifications").insert({
          user_id: task.assigned_to,
          type: "TASK_DUE_SOON",
          task_id: task.id,
          message: `Tarefa vence em breve: ${task.title}`,
        });
        await supabase.from("pending_webhooks").insert({
          user_id: task.assigned_to,
          task_id: task.id,
          event_type: "TASK_DUE_SOON",
          payload: { event: "TASK_DUE_SOON", task: { id: task.id, title: task.title, priority: task.priority, status: task.status, due_date: task.due_date } },
        });
        dueSoonCount++;
      }
    }

    // 2. TASK_OVERDUE: tasks past due, not completed, max 1 notification per 12h
    const { data: overdueTasks } = await supabase
      .from("tasks")
      .select("id, title, priority, status, due_date, assigned_to")
      .lt("due_date", todayStr)
      .neq("status", "concluido")
      .not("assigned_to", "is", null);

    let overdueCount = 0;
    for (const task of overdueTasks || []) {
      const { count } = await supabase
        .from("pending_webhooks")
        .select("*", { count: "exact", head: true })
        .eq("task_id", task.id)
        .eq("event_type", "TASK_OVERDUE")
        .gte("created_at", new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString());

      if ((count || 0) === 0) {
        await supabase.from("notifications").insert({
          user_id: task.assigned_to,
          type: "TASK_OVERDUE",
          task_id: task.id,
          message: `Tarefa atrasada: ${task.title} (prazo: ${task.due_date})`,
        });
        await supabase.from("pending_webhooks").insert({
          user_id: task.assigned_to,
          task_id: task.id,
          event_type: "TASK_OVERDUE",
          payload: { event: "TASK_OVERDUE", task: { id: task.id, title: task.title, priority: task.priority, status: task.status, due_date: task.due_date } },
        });
        overdueCount++;
      }
    }

    // 3. Try to send pending webhooks if webhook URL is configured
    const { data: settings } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "whatsapp_webhook_url")
      .single();

    let sentCount = 0;
    if (settings?.value?.url) {
      const webhookUrl = settings.value.url as string;
      const webhookToken = settings.value.token as string | undefined;

      const { data: pending } = await supabase
        .from("pending_webhooks")
        .select("*")
        .eq("status", "pending")
        .order("created_at")
        .limit(50);

      for (const webhook of pending || []) {
        // Get user info for payload
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, phone_e164")
          .eq("id", webhook.user_id)
          .single();

        const payload = {
          ...webhook.payload,
          user: {
            id: webhook.user_id,
            name: profile?.full_name || "",
            phone_e164: profile?.phone_e164 || "",
          },
        };

        try {
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (webhookToken) headers["Authorization"] = `Bearer ${webhookToken}`;

          const res = await fetch(webhookUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          });

          await supabase.from("pending_webhooks").update({
            status: res.ok ? "sent" : "failed",
            sent_at: new Date().toISOString(),
            response_json: { status: res.status, statusText: res.statusText },
          }).eq("id", webhook.id);

          if (res.ok) sentCount++;
        } catch (err) {
          await supabase.from("pending_webhooks").update({
            status: "failed",
            response_json: { error: String(err) },
          }).eq("id", webhook.id);
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      due_soon_notifications: dueSoonCount,
      overdue_notifications: overdueCount,
      webhooks_sent: sentCount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
