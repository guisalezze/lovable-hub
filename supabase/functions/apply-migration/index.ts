// deno-lint-ignore-file
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

  const sql = postgres(dbUrl, { max: 1, idle_timeout: 5 });

  const results: string[] = [];

  try {
    // Adiciona paid_amount à tabela implementations
    await sql`
      ALTER TABLE public.implementations
      ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0 NOT NULL
    `;
    results.push("✅ paid_amount column added (or already exists)");

    // Garante que app_settings tem updated_at
    await sql`
      ALTER TABLE public.app_settings
      ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()
    `;
    results.push("✅ app_settings.updated_at column added (or already exists)");

  } catch (err: any) {
    results.push(`❌ Error: ${err.message}`);
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
