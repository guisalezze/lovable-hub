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
    // Add event_type column to webhooks (idempotent)
    await sql`
      ALTER TABLE webhooks
        ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'all'
    `;
    results.push("✅ Coluna event_type adicionada à tabela webhooks (ou já existia)");

    // Backfill existing rows to 'all'
    await sql`
      UPDATE webhooks SET event_type = 'all' WHERE event_type IS NULL
    `;
    results.push("✅ Backfill concluído");

    // Add status 'skipped' to webhook_logs if not present
    await sql`
      ALTER TABLE webhook_logs
        DROP CONSTRAINT IF EXISTS webhook_logs_status_check
    `;
    await sql`
      ALTER TABLE webhook_logs
        ADD CONSTRAINT webhook_logs_status_check
          CHECK (status IN ('pending','sent','error','skipped'))
    `;
    results.push("✅ Constraint webhook_logs.status atualizada para incluir 'skipped'");

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
