// Script único para remover a venda de teste do Icaro Gava
// Executar com: node delete-test-sale.mjs

import { readFileSync } from "fs";

const env = {};
try {
  readFileSync(".env", "utf8").split("\n").forEach((line) => {
    const [k, ...v] = line.split("=");
    if (k && v.length) env[k.trim()] = v.join("=").trim().replace(/^['"]|['"]$/g, "");
  });
} catch (e) {
  console.error("Arquivo .env não encontrado:", e.message);
  process.exit(1);
}

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("❌ VITE_SUPABASE_URL ou chave não encontradas no .env");
  process.exit(1);
}

const headers = {
  "apikey": key,
  "Authorization": `Bearer ${key}`,
  "Content-Type": "application/json",
};

async function run() {
  // Busca ampla: todas as vendas com valor ~1700
  console.log("🔍 Buscando vendas com valor entre R$1500 e R$1900...\n");
  const findUrl = `${url}/rest/v1/sales?sale_amount=gte.1500&sale_amount=lte.1900&select=id,lead_email,product_name,sale_amount,sale_status_enum,created_at&order=created_at.desc&limit=20`;
  const res = await fetch(findUrl, { headers });
  const data = await res.json();

  if (!res.ok) {
    console.error("❌ Erro:", data);
    // Se deu 401, provavelmente anon key sem permissão
    if (res.status === 401 || (data?.message && data.message.includes("JWT"))) {
      console.error("\n⚠️  A chave anônima não tem permissão para esta operação.");
      console.error("   Adicione VITE_SUPABASE_SERVICE_ROLE_KEY no .env com a service_role key do Supabase.");
      console.error("   Encontre em: Supabase Dashboard → Project Settings → API → service_role");
    }
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log("Nenhuma venda encontrada no valor especificado.");
    console.log("\n🔍 Buscando por produto 'Retatrutida' (qualquer valor)...\n");

    const r2 = await fetch(`${url}/rest/v1/sales?product_name=ilike.*Retatrutida*&select=id,lead_email,product_name,sale_amount,sale_status_enum,created_at&order=created_at.desc&limit=20`, { headers });
    const d2 = await r2.json();
    if (!d2 || d2.length === 0) {
      console.log("Nenhum resultado. A venda pode já ter sido removida ou o critério não bate.");
      return;
    }
    data.push(...d2);
  }

  console.log(`Encontradas ${data.length} venda(s):\n`);
  data.forEach((s) =>
    console.log(`  ID: ${s.id}\n  Email: ${s.lead_email}\n  Produto: ${s.product_name}\n  Valor: R$ ${s.sale_amount}\n  Status: ${s.sale_status_enum}\n  Data: ${s.created_at}\n`)
  );

  // Filtrar apenas a do Icaro (email contém icaro ou produto = Retatrutida com valor ~1700)
  const toDelete = data.filter(s =>
    s.lead_email?.toLowerCase().includes("icaro") ||
    (s.product_name?.toLowerCase().includes("retatrutida") && s.sale_amount >= 1600 && s.sale_amount <= 1800)
  );

  if (toDelete.length === 0) {
    console.log("⚠️  Nenhum registro identificado como teste do Icaro Gava nos resultados acima.");
    console.log("   Verifique manualmente no Supabase Dashboard qual é o ID da venda e delete:");
    console.log(`   URL: ${url.replace("https://", "https://supabase.com/dashboard/project/").split(".supabase")[0]}`);
    return;
  }

  console.log(`🗑️  Deletando ${toDelete.length} venda(s) identificada(s) como teste...\n`);
  const ids = toDelete.map((s) => s.id).join(",");
  const delRes = await fetch(`${url}/rest/v1/sales?id=in.(${ids})`, { method: "DELETE", headers: { ...headers, "Prefer": "return=minimal" } });

  if (!delRes.ok) {
    const err = await delRes.text();
    console.error("❌ Erro ao deletar:", err);
    process.exit(1);
  }

  console.log(`✅ Removida(s) com sucesso!`);
  toDelete.forEach(s => console.log(`  → ${s.id} | ${s.lead_email} | R$${s.sale_amount}`));
}

run().catch((e) => { console.error("Erro:", e); process.exit(1); });
