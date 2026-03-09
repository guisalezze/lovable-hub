

## Analysis

After reviewing all files, the existing pages (Tarefas, Leads, Financeiro, Equipe) already implement the requested features from previous refactoring rounds — search, quick filters, React Query, DeltaBadge, ComposedChart, ranking tabs, etc. Those pages are already up to date.

The only new work is **Part 5: Cobrancas module** (installment billing). Here is the plan:

---

## Plan: Modulo de Cobrancas Parceladas

### 1. Database Migration

Create tables `charges` and `charge_installments` with:
- Indexes on assigned_to, status, charge_id, due_date
- Triggers using existing `update_updated_at_column()` function
- RLS: select/insert open to authenticated, update restricted to admin or assigned_to, delete admin-only

### 2. New Page `src/pages/Cobrancas.tsx`

Single file containing:
- **Types**: `Charge`, `ChargeInstallment` interfaces
- **Hooks**: `useCharges` (query with join on installments + profiles via assigned_to), `useProfiles`, `markPaid` mutation
- **Helpers**: `installmentStatusInfo` (paid/overdue/due_today/pending with colors/icons), `chargeOverallStatus`
- **ChargeModal**: react-hook-form + zod form with product/client/phone/assigned_to/ticket/entry/installments/due_date fields. Auto-calculates installment_value. "Generate installments" button creates N monthly entries via addMonths. On submit: inserts charge, installments, creates tasks (one per installment), calls charge-notify edge function (silenced errors)
- **ChargeCard**: glass-card with colored border by status, progress bar of paid installments, expandable installment list with mark-as-paid button
- **CobrancasPage**: Header with KPI cards (A Receber, Ativas, Atrasadas, Vencem Hoje), search + quick filters, grid of ChargeCards

### 3. Route and Sidebar

- `src/App.tsx`: Add import + `<Route path="/cobrancas">` after /financeiro
- `src/components/layout/AppSidebar.tsx`: Add `{ label: "Cobranças", icon: Receipt, to: "/cobrancas" }` after Financeiro

### 4. Edge Function

Create `supabase/functions/charge-notify/index.ts`: Receives charge payload, looks up assignee name from profiles, formats WhatsApp message, sends via configured API (graceful fallback if not configured). Add to `supabase/config.toml`.

### Files

- **Create**: `src/pages/Cobrancas.tsx`, `supabase/functions/charge-notify/index.ts`
- **Edit**: `src/App.tsx` (1 import + 1 route), `src/components/layout/AppSidebar.tsx` (1 import + 1 nav item), `supabase/config.toml` (1 entry)
- **Migration**: 1 SQL migration (tables + indexes + triggers + RLS)

