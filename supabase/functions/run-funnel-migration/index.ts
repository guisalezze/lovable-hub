// deno-lint-ignore-file
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: "SUPABASE_DB_URL not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sql = postgres(dbUrl, { max: 1, idle_timeout: 10 });
  const results: string[] = [];

  try {
    // ── funnels ───────────────────────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS funnels (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        session_id text NOT NULL,
        trigger_type text NOT NULL DEFAULT 'webhook_event',
        trigger_event_type text DEFAULT 'all',
        steps jsonb DEFAULT '[]',
        is_active boolean DEFAULT true,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `;
    results.push("✅ funnels criada (ou já existia)");

    // ── funnel_enrollments ────────────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS funnel_enrollments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        funnel_id uuid REFERENCES funnels(id) ON DELETE CASCADE,
        phone text NOT NULL,
        jid text NOT NULL,
        current_step int DEFAULT 0,
        next_send_at timestamptz,
        status text DEFAULT 'active' CHECK (status IN ('active','completed','canceled','error')),
        variables jsonb DEFAULT '{}',
        error_message text,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        UNIQUE(funnel_id, phone)
      )
    `;
    results.push("✅ funnel_enrollments criada (ou já existia)");

    // ── Indexes ───────────────────────────────────────────────────────────────
    await sql`
      CREATE INDEX IF NOT EXISTS idx_funnel_enrollments_due
        ON funnel_enrollments(status, next_send_at)
        WHERE status = 'active'
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_funnels_session_event
        ON funnels(session_id, trigger_event_type, is_active)
    `;
    results.push("✅ Indexes criados");

    // ── RLS ───────────────────────────────────────────────────────────────────
    await sql`ALTER TABLE funnels ENABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE funnel_enrollments ENABLE ROW LEVEL SECURITY`;
    await sql`DROP POLICY IF EXISTS auth_funnels ON funnels`;
    await sql`
      CREATE POLICY auth_funnels ON funnels FOR ALL TO authenticated
        USING (true) WITH CHECK (true)
    `;
    await sql`DROP POLICY IF EXISTS auth_funnel_enrollments ON funnel_enrollments`;
    await sql`
      CREATE POLICY auth_funnel_enrollments ON funnel_enrollments FOR ALL TO authenticated
        USING (true) WITH CHECK (true)
    `;
    results.push("✅ RLS e policies criadas");

  } catch (err: any) {
    results.push(`❌ Erro: ${err.message}`);
    await sql.end();
    return new Response(JSON.stringify({ done: false, results }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await sql.end();
  return new Response(JSON.stringify({ done: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
