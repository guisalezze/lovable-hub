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

    // Current time in UTC-3 (Brasilia)
    const now = new Date();
    const brasiliaOffset = -3 * 60;
    const brasiliaTime = new Date(now.getTime() + (brasiliaOffset + now.getTimezoneOffset()) * 60000);
    const currentHour = brasiliaTime.getHours();

    // Silent hours: 22:00 - 07:00
    if (currentHour >= 22 || currentHour < 7) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "silent_hours" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if WhatsApp is configured
    const { data: config } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "whatsapp_cloud_config")
      .single();

    if (!config?.value) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "whatsapp_not_configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all non-completed tasks with assigned_to and due_date
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, assigned_to")
      .neq("status", "concluido")
      .not("assigned_to", "is", null)
      .not("due_date", "is", null);

    if (!tasks || tasks.length === 0) {
      return new Response(JSON.stringify({ ok: true, reminders_sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch profiles for all assigned users
    const userIds = [...new Set(tasks.map(t => t.assigned_to!))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, phone_e164, whatsapp_notifications_enabled, quiet_hours_start, quiet_hours_end")
      .in("id", userIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const todayStart = new Date(brasiliaTime);
    todayStart.setHours(0, 0, 0, 0);
    const todayStartISO = todayStart.toISOString();

    let sentCount = 0;

    for (const task of tasks) {
      const profile = profileMap.get(task.assigned_to!);
      if (!profile?.phone_e164 || profile.whatsapp_notifications_enabled === false) continue;

      // Check user's quiet hours
      if (profile.quiet_hours_start && profile.quiet_hours_end) {
        const qStart = parseInt(profile.quiet_hours_start.split(":")[0]);
        const qEnd = parseInt(profile.quiet_hours_end.split(":")[0]);
        if (qStart > qEnd) {
          // e.g. 22:00 - 08:00
          if (currentHour >= qStart || currentHour < qEnd) continue;
        } else {
          if (currentHour >= qStart && currentHour < qEnd) continue;
        }
      }

      const dueDate = new Date(task.due_date!);
      const diffMs = dueDate.getTime() - brasiliaTime.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Determine max notifications per day based on proximity
      let maxPerDay: number;
      if (diffDays < 0) maxPerDay = 12;       // Overdue
      else if (diffDays === 0) maxPerDay = 10; // Today
      else if (diffDays === 1) maxPerDay = 8;  // Tomorrow
      else if (diffDays <= 3) maxPerDay = 6;   // 2-3 days
      else if (diffDays <= 7) maxPerDay = 4;   // 4-7 days
      else maxPerDay = 3;                       // > 7 days

      // Urgent tasks get +2
      if (task.priority === "urgente") maxPerDay += 2;

      // Count reminders sent today for this task
      const { count: sentToday } = await supabase
        .from("task_whatsapp_notifications")
        .select("id", { count: "exact", head: true })
        .eq("task_id", task.id)
        .eq("message_type", "reminder")
        .gte("created_at", todayStartISO);

      if ((sentToday || 0) >= maxPerDay) continue;

      // Calculate interval (15h window = 900 min)
      const intervalMinutes = Math.floor(900 / maxPerDay);

      // Check time since last notification
      const { data: lastNotif } = await supabase
        .from("task_whatsapp_notifications")
        .select("sent_at")
        .eq("task_id", task.id)
        .eq("message_type", "reminder")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastNotif?.sent_at) {
        const minutesSinceLast = (now.getTime() - new Date(lastNotif.sent_at).getTime()) / 60000;
        if (minutesSinceLast < intervalMinutes) continue;
      }

      // Build urgency prefix
      let urgencyPrefix: string;
      if (diffDays < 0) urgencyPrefix = `🚨 ATRASADA (${Math.abs(diffDays)} dia(s))`;
      else if (diffDays === 0) urgencyPrefix = "⚠️ VENCE HOJE";
      else if (diffDays === 1) urgencyPrefix = "⏰ Vence AMANHÃ";
      else urgencyPrefix = `📋 Vence em ${diffDays} dias`;

      const statusLabels: Record<string, string> = {
        backlog: "Backlog",
        em_andamento: "Em andamento",
        bloqueado: "Bloqueado",
      };

      // Send via whatsapp-send-message
      const waRes = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send-message`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: profile.phone_e164,
          template_name: "task_reminder",
          template_language: "pt_BR",
          template_params: [
            urgencyPrefix,
            task.title,
            dueDate.toLocaleDateString("pt-BR"),
            statusLabels[task.status] || task.status,
          ],
        }),
      });

      const waData = await waRes.json();

      // Record notification
      await supabase.from("task_whatsapp_notifications").insert({
        task_id: task.id,
        recipient_user_id: task.assigned_to,
        recipient_phone: profile.phone_e164,
        message_type: "reminder",
        whatsapp_message_id: waData.whatsapp_message_id || null,
        status: waRes.ok ? "sent" : "failed",
        error_message: waRes.ok ? null : JSON.stringify(waData),
        sent_at: waRes.ok ? now.toISOString() : null,
      });

      // In-app notification as fallback
      await supabase.from("notifications").insert({
        user_id: task.assigned_to,
        type: diffDays < 0 ? "TASK_OVERDUE" : "TASK_DUE_SOON",
        task_id: task.id,
        message: `${urgencyPrefix}: ${task.title}`,
      });

      if (waRes.ok) sentCount++;
    }

    return new Response(JSON.stringify({ ok: true, reminders_sent: sentCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
