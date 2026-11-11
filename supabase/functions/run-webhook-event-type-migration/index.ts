// DESATIVADA: esta função era uma migração de uso único e ficava pública
// (sem login), com acesso direto ao banco. Não é chamada em nenhum lugar do app.
// O código original está no histórico do Git (antes do commit que a desativou).
// Para rodar de novo uma migração, use o SQL Editor do Supabase ou `supabase db push`.

Deno.serve(() =>
  new Response(JSON.stringify({ error: "Função desativada" }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
