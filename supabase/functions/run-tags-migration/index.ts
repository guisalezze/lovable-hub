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
  if (!dbUrl) return new Response(JSON.stringify({ error: "SUPABASE_DB_URL not set" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const sql = postgres(dbUrl, { max: 1, idle_timeout: 10 });
  const results: string[] = [];
  try {
    await sql`ALTER TABLE baileys_conversations ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[]`;
    results.push("✅ Coluna tags adicionada à baileys_conversations");
    await sql`CREATE INDEX IF NOT EXISTS idx_baileys_conv_tags ON baileys_conversations USING gin(tags)`;
    results.push("✅ Index GIN criado para tags");
  } catch (err: any) {
    results.push(`❌ ${err.message}`);
    await sql.end();
    return new Response(JSON.stringify({ done: false, results }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  await sql.end();
  return new Response(JSON.stringify({ done: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
