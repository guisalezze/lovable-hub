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
    // ── funnels: rename steps → graph ─────────────────────────────────────────
    // Keep steps column for backwards compat, add graph column for node-based flows
    await sql`
      ALTER TABLE funnels
        ADD COLUMN IF NOT EXISTS graph jsonb DEFAULT '{"nodes":[],"edges":[]}'
    `;
    results.push("✅ Coluna graph adicionada à funnels");

    // ── funnel_enrollments: add current_node_id ───────────────────────────────
    await sql`
      ALTER TABLE funnel_enrollments
        ADD COLUMN IF NOT EXISTS current_node_id text
    `;
    results.push("✅ Coluna current_node_id adicionada à funnel_enrollments");

    // ── contact_purchases ─────────────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS contact_purchases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        phone text NOT NULL,
        product_name text NOT NULL,
        event_type text NOT NULL DEFAULT 'purchase_approved',
        payload jsonb DEFAULT '{}',
        created_at timestamptz DEFAULT now()
      )
    `;
    results.push("✅ contact_purchases criada (ou já existia)");

    await sql`
      CREATE INDEX IF NOT EXISTS idx_contact_purchases_phone_product
        ON contact_purchases(phone, product_name)
    `;
    results.push("✅ Index contact_purchases criado");

    await sql`ALTER TABLE contact_purchases ENABLE ROW LEVEL SECURITY`;
    await sql`DROP POLICY IF EXISTS auth_contact_purchases ON contact_purchases`;
    await sql`
      CREATE POLICY auth_contact_purchases ON contact_purchases FOR ALL TO authenticated
        USING (true) WITH CHECK (true)
    `;
    results.push("✅ RLS contact_purchases criada");

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
