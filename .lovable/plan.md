

## Plan: LTV por Cliente Module

Full client LTV tracking module with unified view across sales, charges, and implementations.

### Key Schema Adaptations

The prompt references `buyer_email` in `sales` and `client_email` in `charges`, but the actual schema has:
- `sales`: uses `lead_email` (not `buyer_email`)
- `sales`: uses `sale_amount` (not `amount`), `sale_status_enum` (not `status`)
- `charges`: has no `client_email` column

The SQL view will be adapted:
- `sales_data` CTE: use `lead_email` and `sale_amount`, filter by `sale_status_enum = 'approved'`
- `charges_data` CTE: join charges to leads via client_name match or skip email-based join; since charges lack email, we'll add `client_email` column to charges table via migration
- `ClientDetailSheet` timeline queries will use `lead_email` instead of `buyer_email`

### Step 1: Database Migration
- Add `client_email text` column to `charges` table
- Create `client_ltv` view with adapted CTEs
- Create `search_clients` function
- Grant permissions

### Step 2: Create Files
1. **`src/hooks/useClientLtv.ts`** — hooks for list, by-email, by-lead-id, KPIs
2. **`src/components/shared/LtvBadge.tsx`** — reusable segment+LTV badge
3. **`src/components/dashboard/LtvSummaryCard.tsx`** — dashboard card with top clients
4. **`src/pages/Clientes.tsx`** — full clients page with filters, sorting, list
5. **`src/components/clients/ClientDetailSheet.tsx`** — timeline sheet with sales/charges/implementations history

### Step 3: Edit Existing Files
- **`src/pages/Index.tsx`** — add `LtvSummaryCard` next to `ChargesHealthCard`
- **`src/pages/Implementacoes.tsx`** — add `LtvBadge` to `ImplementationCard`
- **`src/components/implementations/ImplementationDetailSheet.tsx`** — add `LtvBadge` in header
- **`src/App.tsx`** — add `/clientes` route
- **`src/components/layout/AppSidebar.tsx`** — add "Clientes" nav item with `UserCheck` icon

### Files Created (5)
- `src/hooks/useClientLtv.ts`
- `src/components/shared/LtvBadge.tsx`
- `src/components/dashboard/LtvSummaryCard.tsx`
- `src/pages/Clientes.tsx`
- `src/components/clients/ClientDetailSheet.tsx`

### Files Edited (5)
- `src/pages/Index.tsx`
- `src/pages/Implementacoes.tsx`
- `src/components/implementations/ImplementationDetailSheet.tsx`
- `src/App.tsx`
- `src/components/layout/AppSidebar.tsx`

