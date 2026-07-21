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
    // ── baileys_button_flows ───────────────────────────────────────────────────
    // Maps button IDs (from Baileys button messages) to follow-up message flows.
    // When a contact presses a button, the server looks up the matching flow
    // and sends the configured messages automatically.
    await sql`
      CREATE TABLE IF NOT EXISTS baileys_button_flows (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        webhook_id uuid REFERENCES webhooks(id) ON DELETE CASCADE,
        button_id text NOT NULL,
        messages jsonb DEFAULT '[]',
        created_at timestamptz DEFAULT now(),
        UNIQUE(webhook_id, button_id)
      )
    `;
    results.push("✅ baileys_button_flows criada (ou já existia)");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_baileys_button_flows_button_id
        ON baileys_button_flows(button_id)
    `;
    results.push("✅ Index criado");

    await sql`ALTER TABLE baileys_button_flows ENABLE ROW LEVEL SECURITY`;
    await sql`DROP POLICY IF EXISTS auth_baileys_button_flows ON baileys_button_flows`;
    await sql`
      CREATE POLICY auth_baileys_button_flows
        ON baileys_button_flows FOR ALL TO authenticated
        USING (true) WITH CHECK (true)
    `;
    results.push("✅ RLS e policy criados");

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
