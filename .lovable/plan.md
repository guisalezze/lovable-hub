

## Plano: Atualizar Design Theme + Inventario Completo do Projeto

### 1. Alteracao de Design

O tema fornecido usa sintaxe Tailwind v4 com valores `oklch()`. Como o projeto usa **Tailwind v3 com variáveis HSL**, preciso converter todos os valores oklch para HSL equivalentes.

**Mudanca principal de identidade visual:** De laranja/teal para **verde-limao (lime green)** como cor primária, com tons azul-escuro no foreground.

**Arquivos a editar:**

1. **`src/index.css`** -- Substituir todas as variáveis CSS (`:root` e `.dark`) com os valores convertidos. Atualizar fonts para Inter. Atualizar radius para `1rem`. Atualizar shadows com os novos valores. Atualizar scrollbar para combinar com o novo tema.

2. **`tailwind.config.ts`** -- Atualizar fontFamily para usar Inter como sans-serif principal.

3. **`src/components/layout/AppSidebar.tsx`** -- A sidebar agora usa fundo branco (light) / fundo escuro (dark) ao invés do dark fixo. Pode precisar de pequenos ajustes de classe.

Conversoes oklch -> HSL aproximadas (light mode):
- primary: `100 76% 49%` (verde-limao vibrante)
- background: `90 20% 97%`
- foreground: `245 35% 15%`
- card: `0 0% 100%`
- secondary: `240 18% 27%`
- muted: `230 12% 95%`
- muted-foreground: `240 14% 45%`
- accent: `155 30% 96%`
- accent-foreground: `151 45% 32%`
- destructive: `15 70% 50%`
- border/input: `240 15% 90%`
- sidebar: `0 0% 100%` (branco no light)

Dark mode:
- background: `250 45% 8%`
- foreground: `240 8% 97%`
- card: `245 35% 15%`
- primary: `105 80% 55%`
- secondary/muted: `248 22% 20%`
- accent: `152 38% 28%`
- sidebar: `250 45% 8%`

---

### 2. Inventario Completo do Projeto

#### Stack Tecnologica
- **Frontend:** React 18 + TypeScript + Vite
- **Estilizacao:** Tailwind CSS v3 + tailwindcss-animate
- **UI Components:** shadcn/ui (Radix primitives)
- **Roteamento:** React Router DOM v6
- **State/Data fetching:** TanStack React Query v5
- **Charts:** Recharts
- **Backend:** Supabase (hosted: lqrlvefeznfaauwgvubl.supabase.co)

#### Paginas (9 + Auth + 404)
| Rota | Arquivo | Descricao |
|------|---------|-----------|
| `/auth` | Auth.tsx | Login/cadastro |
| `/` | Index.tsx | Dashboard principal com KPIs, graficos, campanhas |
| `/equipe` | Equipe.tsx | Performance da equipe |
| `/leads` | Leads.tsx | Gestao de leads |
| `/produtos` | Produtos.tsx | Catalogo de produtos |
| `/financeiro` | Financeiro.tsx | Painel financeiro |
| `/agenda` | Agenda.tsx | Calendario/agenda |
| `/tarefas` | Tarefas.tsx | Kanban/lista/calendario de tarefas |
| `/integracoes` | Integracoes.tsx | Config Google Calendar + Meta Ads |
| `/configuracoes` | Configuracoes.tsx | Settings + gestao de equipe (admin) |
| `/inbox` | Inbox.tsx | Central de notificacoes |

#### Tabelas no Supabase (12)
1. **app_settings** -- Configuracoes globais (key/value JSON)
2. **calls** -- Chamadas/reunioes (status, Google Meet link, notas)
3. **google_tokens** -- Tokens OAuth do Google Calendar por usuario
4. **investments** -- Registros de investimentos/gastos
5. **lead_products** -- Produtos associados a cada lead
6. **leads** -- Base de leads (email, telefone, UTMs, status, localizacao)
7. **notifications** -- Notificacoes in-app (tipo, mensagem, read_at)
8. **pending_webhooks** -- Fila de webhooks pendentes (para WhatsApp futuro)
9. **profiles** -- Perfis de usuario (nome, email, telefone, config WhatsApp)
10. **sales** -- Vendas (valor, status, produto, metodo pagamento, boleto)
11. **task_comments** -- Comentarios em tarefas com mencoes
12. **tasks** -- Tarefas (titulo, status, prioridade, checklist, tags, due_date)
13. **user_roles** -- Papeis de usuario (admin/team)
14. **webhook_logs** -- Logs de webhooks recebidos

#### Enums do Banco
- **app_role:** admin, team
- **call_status:** scheduled, completed, canceled, no_show
- **lead_status:** novo, quase_comprou, comprou, perdido
- **sale_status:** approved, pending, refunded, chargeback, canceled, blocked, complete
- **task_priority:** baixa, media, alta, urgente
- **task_status:** backlog, em_andamento, bloqueado, concluido

#### Functions (RPC)
- **has_role(_user_id, _role)** -- Verifica role do usuario (SECURITY DEFINER)

#### Edge Functions (9)
1. **google-auth-start** -- Inicia fluxo OAuth do Google Calendar
2. **google-auth-callback** -- Callback OAuth Google, salva tokens
3. **google-calendar-event** -- Cria eventos no Google Calendar com Meet link
4. **manage-team** -- Criar/remover membros da equipe (admin only, usa Service Role)
5. **meta-ads-config** -- Salvar/carregar config do Meta Ads (account_id, token)
6. **meta-campaigns** -- Busca campanhas do Meta Ads com conversao USD->BRL
7. **meta-spend** -- Busca gasto total do Meta Ads por periodo
8. **perfectpay-webhook** -- Recebe webhooks da PerfectPay (vendas, leads, status)
9. **run-reminders** -- Processa lembretes de tarefas, cria notificacoes + enfileira webhooks WhatsApp

#### Integracoes Configuradas
1. **Google Calendar** -- OAuth completo (start -> callback -> create events)
2. **Meta Ads** -- Token + Account ID salvos em app_settings, busca campanhas e gastos
3. **PerfectPay** -- Webhook endpoint para receber vendas/transacoes automaticamente
4. **WhatsApp (parcial)** -- Arquitetura de fila (pending_webhooks) pronta, falta conectar API de envio

#### Hooks Customizados
- `useDashboardData` -- KPIs, receita diaria, vendas por produto
- `useGoogleAuth` -- Status/connect/disconnect Google
- `useMetaCampaigns` -- Lista campanhas Meta Ads
- `useMetaSpend` -- Gasto total Meta Ads por periodo
- `useNotifications` -- Notificacoes + contagem nao lidas
- `useTasks` -- CRUD de tarefas
- `useTeamPerformance` -- Metricas de performance da equipe

#### Componentes Principais
- **Layout:** AppLayout, AppSidebar, CommandPalette (Cmd+K)
- **Dashboard:** KpiCard, RevenueChart, SalesChart, InvestmentChart, CampaignTable, OperationCards, PeriodSelector, RecentLeads
- **Tarefas:** TaskKanban, TaskListView, TaskCalendarView, TaskModal
- **Equipe:** TeamMemberCard, PerformanceDashboard
- **Settings:** TeamManagement (admin)

#### Atalhos de Teclado
- `Cmd/Ctrl + K` -- Busca global (Command Palette)
- `N` -- Navega para Tarefas
- `L` -- Navega para Leads
- `C` -- Navega para Calls

#### Conexoes Externas (Workspace)
- Nenhuma conexao configurada no workspace Lovable atualmente.

#### Variaveis de Ambiente
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- (Edge Functions usam `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` automaticamente)
- (Meta Ads: `META_ACCESS_TOKEN` e `META_ACCOUNT_ID` salvos em app_settings no banco)
- (Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` como secrets das Edge Functions)

