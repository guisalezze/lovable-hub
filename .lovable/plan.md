

## Plano: Melhorias em 4 Paginas (Tarefas, Leads, Financeiro, Equipe)

### 1. Tarefas (`src/pages/Tarefas.tsx`)
- Remove "Minhas" tab and `savedFilters` array
- Add search input with `Search` icon before filter selects
- Add quick filter buttons (Todas/Minhas/Atrasadas) with badge counters, using `QuickFilter` type
- Add `isTaskOverdue` helper using `date-fns` (isAfter, startOfDay, parseISO)
- Add overdue alert banner (AlertTriangle + destructive styling) when quickFilter=overdue
- Get `currentUserId` via `supabase.auth.getUser()` in a `useEffect` or inline
- Update `filteredTasks` useMemo to apply quickFilter, search text, status, priority
- Pass `isOverdue` prop to TaskKanban, TaskListView, TaskCalendarView

### 2. Task Sub-components
- **TaskKanban.tsx**: Add `isOverdue` prop, apply `border-destructive/50` + AlertCircle icon on overdue cards
- **TaskListView.tsx**: Add `isOverdue` prop, use it instead of inline check
- **TaskCalendarView.tsx**: Add `isOverdue` prop for visual highlight on overdue tasks

### 3. Leads (`src/pages/Leads.tsx`)
- Replace useState/useEffect with React Query hooks (`useLeads`, `useUpdateLeadStatus` with optimistic updates)
- Add column dot colors and total value per column in headers
- Add product filter (dynamic from data) and value range filter (sem_venda/ate500/500a2000/acima2000)
- Update filtered useMemo with all filters
- Create `src/components/leads/LeadDetailModal.tsx` — Dialog with avatar, status select, contact section, last sale info, formatted date, action buttons
- Add `selectedLead` state and open modal on card click

### 4. Financeiro (`src/pages/Financeiro.tsx`)
- Replace useState/useEffect with React Query hooks for sales and investments
- Add PeriodSelector (reuse existing component) with since/until state
- Add `useDailySales` and `usePreviousPeriodKpis` hooks for period-filtered data
- Add `DeltaBadge` component showing % change vs previous period
- Add ComposedChart (Bar for revenue + investment, Line for profit) using Recharts
- Add investment history list (last 50, ordered by date desc)
- Add CSV export button in header
- Keep existing add-investment dialog

### 5. Equipe (`src/pages/Equipe.tsx`)
- Add PeriodSelector in header
- Create `useTeamStats(since, until)` hook querying profiles + tasks + sales for period
- Restructure tabs: "Minha Performance" (all users) + "Ranking" + "Comparativo" (admin only)
- **Ranking tab**: Cards sorted by salesAmount desc, position icons (Crown/Medal/Award), progress bars for tasks/calls/sales goals, color-coded by % achievement
- **Comparativo tab**: BarChart with per-member activity breakdown
- **Minha Performance tab**: 2x2 KPI grid with progress bars
- Note: `calls` table has `owner_user_id` not `assigned_to`, and `sales` uses `sale_amount`/`sale_status_enum` not `amount`/`status` — will adapt queries accordingly

### Files to Create
- `src/components/leads/LeadDetailModal.tsx`

### Files to Edit
- `src/pages/Tarefas.tsx`
- `src/pages/Leads.tsx`
- `src/pages/Financeiro.tsx`
- `src/pages/Equipe.tsx`
- `src/components/tasks/TaskKanban.tsx`
- `src/components/tasks/TaskListView.tsx`
- `src/components/tasks/TaskCalendarView.tsx`

### No Changes To
- UI components, App.tsx, hooks/useTasks.ts, layout files, existing routes

