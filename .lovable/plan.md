

## Plan: OpsCRM Strategic Improvements

### 1. Database Migration

Add to `leads` table:
- `source text` (nullable)
- `follow_up_at timestamptz` (nullable)
- `follow_up_note text` (nullable)
- `assigned_to uuid` referencing profiles

Create `lead_notes` table with `id`, `lead_id` (FK to leads), `content`, `created_by` (FK to profiles), `created_at`. RLS: select/insert open to authenticated, delete for admin or creator.

Indexes on `leads.source`, `leads.follow_up_at`, `leads.assigned_to`, `lead_notes.lead_id`.

### 2. Lead Detail Modal — Tabs + Source + Notes + Follow-up

Rewrite `src/components/leads/LeadDetailModal.tsx` with:
- **Tabs**: Detalhes | Notas | Timeline (using shadcn Tabs)
- **Detalhes tab**: Current content + source selector (inline Select) + follow-up section (schedule/view/clear)
- **Notas tab**: List of notes from `lead_notes` with add form. Hook `useLeadNotes(leadId)` queries with profile join. Add mutation with invalidation.
- **Timeline tab**: Unified timeline from `sales` (via `lead_email`) + `lead_notes`. Sales use `sale_amount`/`sale_status_enum`/`product_name`. Sorted by date desc.

Update Lead interface to include `source`, `follow_up_at`, `follow_up_note`.

### 3. Leads Page — Source Filter + Follow-up Filter

In `src/pages/Leads.tsx`:
- Add `sourceFilter` state + Select in filter bar
- Add source badge on kanban cards
- Add follow-up indicator on kanban cards
- Apply source filter in useMemo
- Note: follow-up "quick filter" as a simple additional filter option

### 4. Revenue Goal — Hook + Dashboard Bar

Create `src/hooks/useRevenueGoal.ts` with `useRevenueGoal()` and `useSetRevenueGoal()` using `app_settings` table (key: `revenue_goal`, value is jsonb so store as number).

In `src/pages/Index.tsx`:
- Add revenue goal progress bar between HeroMetrics and OperationalCards
- Editable inline with input + save/cancel
- Color-coded progress: green >= 100%, primary >= 70%, yellow >= 40%, red < 40%

### 5. Charges Health Card on Dashboard

Create `src/components/dashboard/ChargesHealthCard.tsx`:
- Query pending `charge_installments` with charge details
- Show overdue count/amount, due today count, next 30 days count/amount
- List next 4 upcoming installments
- Link to /cobrancas
- Replace "Calls de Hoje" placeholder in Index.tsx

### Files

- **Migration**: 1 SQL (alter leads + create lead_notes + indexes + RLS)
- **Create**: `src/hooks/useRevenueGoal.ts`, `src/components/dashboard/ChargesHealthCard.tsx`
- **Edit**: `src/components/leads/LeadDetailModal.tsx` (full rewrite with tabs), `src/pages/Leads.tsx` (add source/follow-up filter + card badges), `src/pages/Index.tsx` (add revenue goal bar + ChargesHealthCard)

