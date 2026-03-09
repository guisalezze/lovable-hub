

## Plan: Módulo de Implementações

Implement the full Implementations module from the uploaded prompt file. 6 tables + RLS, 1 hook file, 3 component/page files, route + nav updates.

### Step 1: Database Migration

Create migration with all 6 tables (`implementation_templates`, `implementation_template_steps`, `implementations`, `implementation_steps`, `implementation_documents`, `implementation_notes`), indexes, RLS policies, trigger, and seed data — exactly as specified in the prompt.

### Step 2: Update Supabase Types

Add TypeScript types for all 6 new tables to `src/integrations/supabase/types.ts`.

### Step 3: Create Hook — `src/hooks/useImplementations.ts`

All hooks as specified: `useImplementations`, `useImplementationDetail`, `useImplementationTemplates`, `useCreateImplementation`, `useUpdateStepStatus`, `useAddDocument`, `useAddNote`, `useUpdateImplementationStatus`.

### Step 4: Create Page — `src/pages/Implementacoes.tsx`

Main page with KPI cards, search/filter, grid of `ImplementationCard` components, creation modal, and detail sheet.

### Step 5: Create Modal — `src/components/implementations/ImplementationModal.tsx`

Creation dialog with react-hook-form + zod, template loading, dynamic step fields.

### Step 6: Create Detail Sheet — `src/components/implementations/ImplementationDetailSheet.tsx`

Sheet with tabs (Etapas, Notas, Documentos), step status cycling, note/doc adding.

### Step 7: Route & Navigation

- `src/App.tsx`: Add import + route `/implementacoes`
- `src/components/layout/AppSidebar.tsx`: Add `Briefcase` icon nav item after Cobranças

### Files to Create
- `supabase/migrations/[timestamp]_implementations.sql`
- `src/hooks/useImplementations.ts`
- `src/pages/Implementacoes.tsx`
- `src/components/implementations/ImplementationModal.tsx`
- `src/components/implementations/ImplementationDetailSheet.tsx`

### Files to Edit
- `src/integrations/supabase/types.ts` — add 6 table types
- `src/App.tsx` — add route
- `src/components/layout/AppSidebar.tsx` — add nav item

