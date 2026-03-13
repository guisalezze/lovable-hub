

# Plano: Multi-Projeto + Nutra + Rebranding Solaryz

## Escopo Total

Consolidação dos dois prompts num único plano de implementação, com rebranding de OpsCRM para **Solaryz** e garantia de que o disparo WhatsApp de tarefas funcione para ambos os projetos.

---

## 1. Banco de Dados (Migrações SQL)

**Migração única com:**

- Tabela `projects` (slug: educacional/nutra) + seed
- Tabela `user_project_access` com RLS
- Coluna `project_id` na tabela `tasks` + migração das tarefas existentes para "educacional"
- Função `get_my_projects()` (security definer)
- Admins recebem acesso a ambos os projetos automaticamente
- Tabelas Meta Ads: `meta_ad_accounts`, `meta_campaigns`, `meta_adsets`, `meta_ads`, `meta_rules`, `meta_custom_metrics`
- Tabela `nutra_sales` (Cartpanda + ClickBank)
- RLS em todas as novas tabelas

## 2. Contexto de Projeto

- Criar `src/contexts/ProjectContext.tsx` com `ProjectProvider` e hook `useProject()`
- Persiste projeto selecionado no localStorage
- Usa `supabase.rpc("get_my_projects")` para listar projetos acessíveis
- Envolver App.tsx com `ProjectProvider`

## 3. Sidebar + Rebranding

- Renomear "OpsCRM" → "Solaryz" no logo da sidebar e em qualquer referência no código
- Adicionar `ProjectSwitcher` (dropdown) no topo da sidebar
- Filtrar itens de menu por projeto (`projects: ["educacional"]`, `projects: ["nutra"]`, ou sem filtro = ambos)
- Menu Nutra inclui: "Meta Ads" (ícone BarChart3)

## 4. Tarefas — Filtro por Projeto + WhatsApp Nutra

- `useTasks`: adicionar filtro `.eq("project_id", currentProject?.id)` nas queries
- `useCreateTask`: incluir `project_id: currentProject?.id` ao criar tarefa
- **WhatsApp**: A lógica de disparo já existe em `useTasks.ts` e é agnóstica de projeto — funciona automaticamente para qualquer tarefa com prioridade alta/urgente e responsável com `phone_e164`. Nenhuma alteração necessária.

## 5. Edge Functions (5 novas)

| Função | Finalidade |
|---|---|
| `meta-oauth` | Troca code OAuth por token longo, salva contas |
| `meta-sync` | Sincroniza métricas de campanhas/adsets/ads da API Meta |
| `meta-action` | Pausa/retoma/altera orçamento de campanhas |
| `cartpanda-s2s` | Webhook S2S da Cartpanda → `nutra_sales` |
| `clickbank-webhook` | Webhook IPN do ClickBank → `nutra_sales` |

Config TOML: `verify_jwt = false` para webhooks públicos (cartpanda, clickbank).

## 6. Hooks e Páginas

- Criar `src/hooks/useMetaAds.ts` (contas, campanhas, sync, ações, vendas nutra)
- Criar `src/pages/nutra/MetaAds.tsx` (tabela de campanhas com KPIs, filtros, ações)
- Criar `src/pages/nutra/MetaCallback.tsx` (callback OAuth)
- Criar `src/components/nutra/MetaOAuthButton.tsx`
- Criar `src/components/nutra/MetaRulesDialog.tsx`
- Criar `src/components/settings/ProjectAccessManager.tsx`

## 7. Rotas

Novas rotas no App.tsx:
- `/nutra/meta-callback` (pública, fora do AuthGuard)
- `/nutra/meta-ads` (protegida)

## 8. Dashboard

- Exibir `{currentProject?.icon} Dashboard · {currentProject?.name}` no header
- Filtrar tasks do dashboard por `project_id`

## 9. Secrets Necessários

Serão solicitados antes da implementação:
- `META_APP_ID` / `META_APP_SECRET` (Meta for Developers)
- `CLICKBANK_SECRET_KEY` (ClickBank vendor settings)
- `VITE_META_APP_ID` (variável pública no .env)

## 10. Ordem de Execução

1. Migração SQL (tudo numa única migração)
2. Solicitar secrets (META_APP_ID, META_APP_SECRET, CLICKBANK_SECRET_KEY)
3. Criar ProjectContext + Provider
4. Atualizar App.tsx (provider + rotas)
5. Atualizar Sidebar (rebranding + switcher + menu filtrado)
6. Atualizar useTasks + Tarefas.tsx (filtro project_id)
7. Criar edge functions (meta-oauth, meta-sync, meta-action, cartpanda-s2s, clickbank-webhook)
8. Criar hooks, páginas e componentes Nutra
9. Atualizar Dashboard
10. Adicionar ProjectAccessManager em Configurações

---

**Arquivos criados:** ~12 novos  
**Arquivos modificados:** ~6 existentes  
**Migrações:** 1 grande  
**Edge functions:** 5 novas

