import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://crm.guisalezze.com",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_ROLES: string[] = ["admin", "team"];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: roleData } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Apenas admins podem gerenciar a equipe" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { email, password, full_name, role, phone_e164, project_ids } = body;

      if (!email || !password || !full_name) {
        return new Response(JSON.stringify({ error: "Campos obrigatórios: email, password, full_name" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (Array.isArray(project_ids) && project_ids.some((pid: unknown) => typeof pid !== "string" || !isValidUUID(pid))) {
        return new Response(JSON.stringify({ error: "project_ids inválidos" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: newUser, error: createError } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) {
        console.error("Create user error:", createError);
        const msg = createError.message?.includes("already")
          ? "Email já cadastrado."
          : "Não foi possível criar o usuário.";
        return new Response(JSON.stringify({ error: msg }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = newUser.user.id;

      // Upsert profile with phone
      await serviceClient.from("profiles").upsert({
        id: userId,
        email,
        full_name,
        phone_e164: phone_e164 || null,
      });

      // Insert role
      const assignedRole = role && VALID_ROLES.includes(role) ? role : "team";
      await serviceClient.from("user_roles").insert({
        user_id: userId,
        role: assignedRole,
      });

      // Insert project access
      if (Array.isArray(project_ids) && project_ids.length > 0) {
        await serviceClient.from("user_project_access").insert(
          project_ids.map((pid: string) => ({ user_id: userId, project_id: pid }))
        );
      }

      return new Response(
        JSON.stringify({ success: true, user_id: userId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "update") {
      const { user_id, full_name, phone_e164, role, project_ids } = body;

      if (!user_id || !isValidUUID(user_id)) {
        return new Response(JSON.stringify({ error: "user_id inválido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (Array.isArray(project_ids) && project_ids.some((pid: unknown) => typeof pid !== "string" || !isValidUUID(pid))) {
        return new Response(JSON.stringify({ error: "project_ids inválidos" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update profile
      const profileUpdate: Record<string, any> = {};
      if (full_name !== undefined) profileUpdate.full_name = full_name;
      if (phone_e164 !== undefined) profileUpdate.phone_e164 = phone_e164 || null;

      if (Object.keys(profileUpdate).length > 0) {
        await serviceClient.from("profiles").update(profileUpdate).eq("id", user_id);
      }

      // Update role if provided
      if (role && VALID_ROLES.includes(role)) {
        await serviceClient.from("user_roles").update({ role }).eq("user_id", user_id);
      }

      // Update project access if provided
      if (Array.isArray(project_ids)) {
        // Remove all existing access
        await serviceClient.from("user_project_access").delete().eq("user_id", user_id);
        // Insert new access
        if (project_ids.length > 0) {
          await serviceClient.from("user_project_access").insert(
            project_ids.map((pid: string) => ({ user_id: user_id, project_id: pid }))
          );
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "remove") {
      const { user_id } = body;

      if (!user_id || !isValidUUID(user_id)) {
        return new Response(JSON.stringify({ error: "user_id inválido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (user_id === user.id) {
        return new Response(JSON.stringify({ error: "Você não pode remover a si mesmo" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await serviceClient.from("user_project_access").delete().eq("user_id", user_id);
      await serviceClient.from("user_roles").delete().eq("user_id", user_id);
      await serviceClient.from("profiles").delete().eq("id", user_id);

      const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user_id);
      if (deleteError) {
        console.error("Delete user error:", deleteError);
        return new Response(JSON.stringify({ error: "Não foi possível remover o usuário." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("manage-team error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
