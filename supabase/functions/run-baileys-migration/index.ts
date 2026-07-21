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
    // ── baileys_conversations ─────────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS baileys_conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id text NOT NULL,
        jid text NOT NULL,
        display_name text,
        last_message text,
        last_message_at timestamptz,
        is_group boolean DEFAULT false,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        UNIQUE(session_id, jid)
      )
    `;
    results.push("✅ baileys_conversations criada (ou já existia)");

    // ── baileys_messages ──────────────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS baileys_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id text NOT NULL,
        conversation_id uuid REFERENCES baileys_conversations(id) ON DELETE CASCADE,
        message_id text NOT NULL,
        direction text NOT NULL CHECK (direction IN ('in', 'out')),
        from_jid text,
        from_name text,
        type text DEFAULT 'text',
        content text,
        timestamp timestamptz NOT NULL,
        created_at timestamptz DEFAULT now(),
        UNIQUE(session_id, message_id)
      )
    `;
    results.push("✅ baileys_messages criada (ou já existia)");

    // ── Indexes ───────────────────────────────────────────────────────────────
    await sql`
      CREATE INDEX IF NOT EXISTS idx_baileys_conv_session_time
        ON baileys_conversations(session_id, last_message_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_baileys_msg_conv_time
        ON baileys_messages(conversation_id, timestamp ASC)
    `;
    results.push("✅ Indexes criados");

    // ── RLS ───────────────────────────────────────────────────────────────────
    await sql`ALTER TABLE baileys_conversations ENABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE baileys_messages ENABLE ROW LEVEL SECURITY`;

    await sql`DROP POLICY IF EXISTS auth_baileys_conversations ON baileys_conversations`;
    await sql`
      CREATE POLICY auth_baileys_conversations
        ON baileys_conversations FOR ALL TO authenticated
        USING (true) WITH CHECK (true)
    `;

    await sql`DROP POLICY IF EXISTS auth_baileys_messages ON baileys_messages`;
    await sql`
      CREATE POLICY auth_baileys_messages
        ON baileys_messages FOR ALL TO authenticated
        USING (true) WITH CHECK (true)
    `;
    results.push("✅ RLS e policies criadas");

    // ── Realtime ──────────────────────────────────────────────────────────────
    try {
      await sql`ALTER PUBLICATION supabase_realtime ADD TABLE baileys_conversations`;
      results.push("✅ baileys_conversations adicionada ao Realtime");
    } catch (e: any) {
      results.push(`ℹ️  baileys_conversations realtime: ${e.message}`);
    }

    try {
      await sql`ALTER PUBLICATION supabase_realtime ADD TABLE baileys_messages`;
      results.push("✅ baileys_messages adicionada ao Realtime");
    } catch (e: any) {
      results.push(`ℹ️  baileys_messages realtime: ${e.message}`);
    }

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
