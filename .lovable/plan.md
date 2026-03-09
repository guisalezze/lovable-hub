

## Plan: Relatórios, Onboarding, Metas por Produto e PerfectPay Expansion

This is a large feature set spanning 6 areas. I'll fix several issues from the user's prompt (wrong column names in queries, incomplete JSX, CHECK constraint) and adapt to the actual database schema.

### Key Schema Observations
- `sales` table uses `sale_amount` (not `amount`), `sale_status_enum` (not `status`), `product_name` exists
- `calls` table has `start_at` (not `scheduled_at`), no `assigned_to` column, uses `call_status` enum with values: `scheduled`, `completed`, `canceled`, `no_show`
- `charges` table requires `total_ticket` and `installment_value` as non-nullable
- `onboarding_responses` needs a validation trigger instead of CHECK constraint (per Supabase guidelines)

---

### Step 1: Database Migration

Create two tables: `product_goals` and `onboarding_responses`. Use a validation trigger instead of CHECK constraint for the `status` field.

**Tables:**
- `product_goals`: id, product_name, product_id (FK products), goal_amount, period_start, period_end, created_by (FK profiles), timestamps. RLS: authenticated select/insert, admin update/delete.
- `onboarding_responses`: id, token (unique UUID), lead_id, charge_id, assigned_to, form fields (full_name, phone, niche, current_revenue, main_goal, expectations, availability, how_found), status, completed_at, timestamps. RLS: authenticated select, anon+authenticated insert/update. Index on token.

### Step 2: Install Dependencies

Install `jspdf` and `html2canvas` for PDF export.

### Step 3: Create Relatórios Page (`src/pages/Relatorios.tsx`)

- `useReportData` hook querying sales, leads, tasks, calls, investments, profiles for the selected period
- Fix column references: `sale_amount` not `amount`, `sale_status_enum` not `status`, `start_at` not `scheduled_at`
- 8 KPI cards (Receita, Investimento, Lucro, ROAS, Vendas aprovadas, Novos leads, Conversão, Reembolsos)
- Daily revenue AreaChart, revenue by product BarChart, team performance BarChart
- PDF export via html2canvas + jsPDF
- PeriodSelector for date range

### Step 4: Product Goals (`src/hooks/useProductGoals.ts` + `src/components/financeiro/ProductGoalsSection.tsx`)

- Hook: `useProductGoals(since, until)` fetches goals overlapping the period and joins with actual sales revenue per product
- Hook: `useProductsList`, `useUpsertProductGoal`, `useDeleteProductGoal`
- Component: progress bars per product goal, dialog to add new goals, option to pick from existing products or type free-form name
- Integrate into `Financeiro.tsx` after the chart section

### Step 5: Onboarding Public Page (`src/pages/Onboarding.tsx`)

- Public page at `/onboarding/:token` — no auth required
- Loads record by token, shows form if pending, success screen if completed, error if not found
- Fields: full_name*, phone*, niche*, current_revenue, main_goal*, expectations, availability, how_found
- On submit: updates onboarding_responses, optionally updates linked lead

### Step 6: Onboarding Admin Page (`src/pages/OnboardingAdmin.tsx`)

- Authenticated page at `/onboarding-admin`
- Lists all onboarding responses with status badges
- Dialog to create new onboarding link (optionally linked to lead/assignee)
- Copy link button

### Step 7: Expand PerfectPay Webhook (`supabase/functions/perfectpay-webhook/index.ts`)

After existing approved sale processing, add:
1. Create onboarding task assigned to lead's `assigned_to`
2. Auto-create `onboarding_responses` record linked to the lead
3. If installment sale detected, auto-create `charges` + `charge_installments` records

Note: The webhook already handles lead status updates to "comprou" — avoid duplicate logic.

### Step 8: Routing & Navigation

- Add routes in `App.tsx`: `/relatorios` (authenticated), `/onboarding-admin` (authenticated), `/onboarding/:token` (public, outside AuthGuard)
- Add "Relatórios" and "Onboarding" nav items in `AppSidebar.tsx`

### Files to Create
- `src/pages/Relatorios.tsx`
- `src/hooks/useProductGoals.ts`
- `src/components/financeiro/ProductGoalsSection.tsx`
- `src/pages/Onboarding.tsx`
- `src/pages/OnboardingAdmin.tsx`

### Files to Edit
- `src/App.tsx` — add 3 routes
- `src/components/layout/AppSidebar.tsx` — add 2 nav items
- `src/pages/Financeiro.tsx` — import and render ProductGoalsSection
- `supabase/functions/perfectpay-webhook/index.ts` — add post-approval automation

### Dependencies to Install
- `jspdf`, `html2canvas`

