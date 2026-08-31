# Multi-Project Data Isolation + New-Project Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every CRM project (not just "Educacional") real, isolated data — leads, sales,
charges, calls, products — plus a project-aware Perfect Pay webhook and an admin "+ novo
projeto" button, so spinning up a new project no longer means sharing Educacional's data pool.

**Architecture:** Add `project_id` to the core tables that don't have it yet (`leads`, `sales`,
`charges`, `lead_products`, `calls`, `onboarding_responses`), backfilled to Educacional so
nothing existing changes. Every page/hook that queries those tables gets a
`.eq("project_id", currentProject.id)` filter. `perfectpay-webhook` resolves which project a
sale belongs to (URL query param, then a small fallback mapping table, then Educacional) and
stamps it everywhere it writes. The sidebar stops hardcoding "Educacional" as the only real
project and loops over all of them; a new "+" button (admin-only) inserts a project row through
existing RLS — no new backend function needed for that part.

**Tech Stack:** React + TypeScript + Vite, TanStack Query, Supabase (Postgres + RLS + Edge
Functions/Deno), Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-08-31-multi-project-isolation-design.md`

## Global Constraints

- RLS on the newly-scoped tables stays exactly as permissive as it is today (matches the
  existing `tasks`/`investments` precedent) — do not add per-user project enforcement in this
  plan; it's explicitly out of scope (see spec's Non-goals).
- `clickbank-webhook` and `cartpanda-s2s` are **not touched** — they write to `nutra_sales` and
  are hardcoded to the "nutra" project by design; that's a separate, already-working pipeline
  unrelated to what this plan changes. Only `perfectpay-webhook` (which writes to the core
  `leads`/`sales`/`charges` tables) needs project routing.
- `copy_projects` already has `project_id` (created with it from day one) and `Copies.tsx` /
  `useCopyProjects.ts` already filter by it — no changes needed there. Don't re-touch those files.
- Every new/changed Supabase query must follow the existing code style in the file being edited
  (destructure `{ data, error }`, throw on `error` inside `queryFn`, etc.) — don't introduce a
  new data-fetching pattern.
- Existing Educacional data and the already-configured Perfect Pay webhook URL (no `project_id`
  param) must keep working with zero manual steps after this ships.

---

### Task 1: Migration — project_id on core tables + `project_products` + `client_ltv` view

**Files:**
- Create: `supabase/migrations/20260831120000_project_scope_core_tables.sql`

**Interfaces:**
- Produces: `public.leads.project_id`, `public.sales.project_id`, `public.charges.project_id`,
  `public.lead_products.project_id`, `public.calls.project_id`,
  `public.onboarding_responses.project_id` — all `uuid REFERENCES public.projects(id)`,
  backfilled to the `educacional` project's id.
- Produces: `public.project_products(id, project_id, source, product_code, product_name,
  created_at)` — `UNIQUE(source, product_code)`.
- Produces: `public.client_ltv` view gains a trailing `project_id` column (existing columns
  unchanged in name/type/position — required for `CREATE OR REPLACE VIEW` to succeed).
- Produces: `public.search_clients(search_term text, p_project_id uuid DEFAULT NULL)` replaces
  the old `search_clients(search_term text)` signature.

- [ ] **Step 1: Write the migration file**

```sql
-- 1. project_id on core CRM tables, backfilled to Educacional
ALTER TABLE public.leads ADD COLUMN project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.sales ADD COLUMN project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.charges ADD COLUMN project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.lead_products ADD COLUMN project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.calls ADD COLUMN project_id uuid REFERENCES public.projects(id);
ALTER TABLE public.onboarding_responses ADD COLUMN project_id uuid REFERENCES public.projects(id);

UPDATE public.leads SET project_id = (SELECT id FROM public.projects WHERE slug = 'educacional') WHERE project_id IS NULL;
UPDATE public.sales SET project_id = (SELECT id FROM public.projects WHERE slug = 'educacional') WHERE project_id IS NULL;
UPDATE public.charges SET project_id = (SELECT id FROM public.projects WHERE slug = 'educacional') WHERE project_id IS NULL;
UPDATE public.lead_products SET project_id = (SELECT id FROM public.projects WHERE slug = 'educacional') WHERE project_id IS NULL;
UPDATE public.calls SET project_id = (SELECT id FROM public.projects WHERE slug = 'educacional') WHERE project_id IS NULL;
UPDATE public.onboarding_responses SET project_id = (SELECT id FROM public.projects WHERE slug = 'educacional') WHERE project_id IS NULL;

-- 2. project_products: admin-managed product_code -> project mapping (fallback routing,
--    used when a project doesn't have its own dedicated webhook URL)
CREATE TABLE public.project_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'perfectpay',
  product_code text NOT NULL,
  product_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source, product_code)
);
ALTER TABLE public.project_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read project_products" ON public.project_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage project_products" ON public.project_products FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. client_ltv view: append project_id (derived from sales/charges, falling back to the
--    lead's project). Column order for pre-existing columns is UNCHANGED — CREATE OR REPLACE
--    VIEW only allows appending columns at the end.
CREATE OR REPLACE VIEW public.client_ltv AS
WITH sales_data AS (
  SELECT
    lead_email AS email,
    project_id,
    COUNT(*) AS total_purchases,
    COALESCE(SUM(sale_amount), 0) AS sales_revenue,
    MIN(date_created) AS first_purchase_at,
    MAX(date_created) AS last_purchase_at
  FROM public.sales
  WHERE sale_status_enum = 'approved'
  GROUP BY lead_email, project_id
),
charges_data AS (
  SELECT
    client_email AS email,
    project_id,
    COUNT(*) AS total_charges,
    COALESCE(SUM(total_ticket), 0) AS charges_revenue
  FROM public.charges
  WHERE client_email IS NOT NULL AND status != 'cancelled'
  GROUP BY client_email, project_id
),
impl_data AS (
  SELECT
    client_email AS email,
    COUNT(*) AS total_implementations,
    COALESCE(SUM(total_value), 0) AS impl_revenue
  FROM public.implementations
  WHERE client_email IS NOT NULL AND status != 'cancelled'
  GROUP BY client_email
),
all_emails AS (
  SELECT email, project_id FROM sales_data
  UNION
  SELECT email, project_id FROM charges_data WHERE email IS NOT NULL
)
SELECT
  ae.email,
  l.full_name AS name,
  l.phone_e164 AS phone,
  l.id AS lead_id,
  COALESCE(sd.total_purchases, 0) AS total_purchases,
  COALESCE(sd.sales_revenue, 0) AS sales_revenue,
  COALESCE(cd.total_charges, 0) AS total_charges,
  COALESCE(cd.charges_revenue, 0) AS charges_revenue,
  COALESCE(id.total_implementations, 0) AS total_implementations,
  COALESCE(id.impl_revenue, 0) AS impl_revenue,
  COALESCE(sd.sales_revenue, 0) + COALESCE(cd.charges_revenue, 0) + COALESCE(id.impl_revenue, 0) AS ltv,
  sd.first_purchase_at,
  sd.last_purchase_at,
  CASE
    WHEN COALESCE(sd.sales_revenue, 0) + COALESCE(cd.charges_revenue, 0) + COALESCE(id.impl_revenue, 0) >= 10000 THEN 'vip'
    WHEN COALESCE(sd.sales_revenue, 0) + COALESCE(cd.charges_revenue, 0) + COALESCE(id.impl_revenue, 0) >= 3000 THEN 'premium'
    WHEN COALESCE(sd.sales_revenue, 0) + COALESCE(cd.charges_revenue, 0) + COALESCE(id.impl_revenue, 0) >= 500 THEN 'regular'
    ELSE 'new'
  END AS segment,
  COALESCE(ae.project_id, l.project_id) AS project_id
FROM all_emails ae
LEFT JOIN public.leads l ON l.email = ae.email
LEFT JOIN sales_data sd ON sd.email = ae.email AND sd.project_id = ae.project_id
LEFT JOIN charges_data cd ON cd.email = ae.email AND cd.project_id = ae.project_id
LEFT JOIN impl_data id ON id.email = ae.email;

GRANT SELECT ON public.client_ltv TO authenticated;

-- 4. search_clients: add an optional project filter (old 1-arg signature is dropped so there's
--    no ambiguous overload)
DROP FUNCTION IF EXISTS public.search_clients(text);

CREATE OR REPLACE FUNCTION public.search_clients(search_term text, p_project_id uuid DEFAULT NULL)
RETURNS SETOF public.client_ltv
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.client_ltv
  WHERE
    (email ILIKE '%' || search_term || '%' OR name ILIKE '%' || search_term || '%')
    AND (p_project_id IS NULL OR project_id = p_project_id)
  ORDER BY ltv DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.search_clients(text, uuid) TO authenticated;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (from `lovable-hub-1/`)
Expected: migration applies with no errors; if `db push` prompts about drift, review and confirm
— this project has a mix of CLI-tracked migrations and dashboard-applied SQL, so drift warnings
about unrelated prior changes are expected and safe to accept.

- [ ] **Step 3: Verify the backfill**

Run this via `npx supabase db execute` or the Supabase SQL editor:
```sql
SELECT
  (SELECT COUNT(*) FROM public.leads WHERE project_id IS NULL) AS leads_null,
  (SELECT COUNT(*) FROM public.sales WHERE project_id IS NULL) AS sales_null,
  (SELECT COUNT(*) FROM public.charges WHERE project_id IS NULL) AS charges_null,
  (SELECT COUNT(*) FROM public.calls WHERE project_id IS NULL) AS calls_null;
```
Expected: every column is `0` — no row was left unassigned.

- [ ] **Step 4: Verify the view and function still work**

```sql
SELECT email, project_id, ltv FROM public.client_ltv LIMIT 3;
SELECT * FROM public.search_clients('a', NULL) LIMIT 3;
```
Expected: both return rows (assuming there's existing data) with a non-null `project_id`
matching Educacional's id, no SQL errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260831120000_project_scope_core_tables.sql
git commit -m "Add project_id to core CRM tables and project_products mapping"
```

---

### Task 2: `perfectpay-webhook` — resolve and stamp `project_id`

**Files:**
- Modify: `supabase/functions/perfectpay-webhook/index.ts`

**Interfaces:**
- Consumes: `public.project_products(project_id, source, product_code)` and
  `public.projects(id, slug)` from Task 1.
- Produces: every `leads`/`sales`/`lead_products`/`tasks`/`onboarding_responses`/`charges` write
  in this function now carries the resolved `project_id`.

- [ ] **Step 1: Add the resolver function**

Insert right after the `PAYMENT_METHOD_MAP` constant (before `Deno.serve`):

```ts
async function resolveProjectId(
  req: Request,
  productCode: string | undefined,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  const url = new URL(req.url);
  const queryProjectId = url.searchParams.get("project_id");
  if (queryProjectId) return queryProjectId;

  if (productCode) {
    const { data: mapping } = await supabase
      .from("project_products")
      .select("project_id")
      .eq("source", "perfectpay")
      .eq("product_code", productCode)
      .maybeSingle();
    if (mapping) return mapping.project_id as string;
  }

  const { data: eduProject } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", "educacional")
    .single();
  return eduProject!.id as string;
}
```

- [ ] **Step 2: Call the resolver and stamp `leadData`**

Right after `const product = payload.product || {};` (before `const plan = ...`), add:

```ts
    const projectId = await resolveProjectId(req, product.code as string | undefined, supabase);
```

In the `leadData` object literal, add `project_id: projectId,` as the first field (right after
`email,`).

- [ ] **Step 3: Scope the lead upsert lookup by project**

Replace:
```ts
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingLead) {
      await supabase.from("leads").update(leadData).eq("email", email);
    } else {
      await supabase.from("leads").insert(leadData);
    }
```
With:
```ts
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("email", email)
      .eq("project_id", projectId)
      .maybeSingle();

    if (existingLead) {
      await supabase.from("leads").update(leadData).eq("email", email).eq("project_id", projectId);
    } else {
      await supabase.from("leads").insert(leadData);
    }
```

- [ ] **Step 4: Stamp the sales upsert**

In the `sales` upsert object literal, add `project_id: projectId,` right after `code: saleCode,`.

- [ ] **Step 5: Scope `lead_products` reads/writes by project**

Replace the "Update lead_products if approved" block:
```ts
    if (saleStatus === "approved" && product.code) {
      const { data: existingProduct } = await supabase
        .from("lead_products")
        .select("*")
        .eq("lead_email", email)
        .eq("product_code", product.code)
        .maybeSingle();

      if (existingProduct) {
        await supabase
          .from("lead_products")
          .update({
            total_purchases_count: existingProduct.total_purchases_count + 1,
            total_paid_amount: Number(existingProduct.total_paid_amount) + saleAmount,
            last_purchase_at: new Date().toISOString(),
            last_status_enum: saleStatus,
            product_name: product.name || existingProduct.product_name,
            plan_code: plan.code || existingProduct.plan_code,
          })
          .eq("id", existingProduct.id);
      } else {
        await supabase.from("lead_products").insert({
          lead_email: email,
          product_code: product.code,
          product_name: product.name || null,
          plan_code: plan.code || null,
          total_purchases_count: 1,
          total_paid_amount: saleAmount,
          last_purchase_at: new Date().toISOString(),
          last_status_enum: saleStatus,
        });
      }
    }

    // If refund/chargeback, update lead_products status
    if ((saleStatus === "refunded" || saleStatus === "charged_back") && product.code) {
      await supabase
        .from("lead_products")
        .update({ last_status_enum: saleStatus })
        .eq("lead_email", email)
        .eq("product_code", product.code);
    }
```
With:
```ts
    if (saleStatus === "approved" && product.code) {
      const { data: existingProduct } = await supabase
        .from("lead_products")
        .select("*")
        .eq("lead_email", email)
        .eq("product_code", product.code)
        .eq("project_id", projectId)
        .maybeSingle();

      if (existingProduct) {
        await supabase
          .from("lead_products")
          .update({
            total_purchases_count: existingProduct.total_purchases_count + 1,
            total_paid_amount: Number(existingProduct.total_paid_amount) + saleAmount,
            last_purchase_at: new Date().toISOString(),
            last_status_enum: saleStatus,
            product_name: product.name || existingProduct.product_name,
            plan_code: plan.code || existingProduct.plan_code,
          })
          .eq("id", existingProduct.id);
      } else {
        await supabase.from("lead_products").insert({
          lead_email: email,
          product_code: product.code,
          product_name: product.name || null,
          plan_code: plan.code || null,
          total_purchases_count: 1,
          total_paid_amount: saleAmount,
          last_purchase_at: new Date().toISOString(),
          last_status_enum: saleStatus,
          project_id: projectId,
        });
      }
    }

    // If refund/chargeback, update lead_products status
    if ((saleStatus === "refunded" || saleStatus === "charged_back") && product.code) {
      await supabase
        .from("lead_products")
        .update({ last_status_enum: saleStatus })
        .eq("lead_email", email)
        .eq("product_code", product.code)
        .eq("project_id", projectId);
    }
```

- [ ] **Step 6: Scope the onboarding-task lead lookup, and stamp the task + onboarding_responses insert**

Replace:
```ts
    if (saleStatus === "approved" && email) {
      const { data: lead } = await supabase
        .from("leads")
        .select("id, assigned_to, full_name")
        .eq("email", email)
        .single();
```
With:
```ts
    if (saleStatus === "approved" && email) {
      const { data: lead } = await supabase
        .from("leads")
        .select("id, assigned_to, full_name")
        .eq("email", email)
        .eq("project_id", projectId)
        .single();
```

In the `tasks` insert a few lines below, add `project_id: projectId,` right after `title: ...,`.
In the `onboarding_responses` insert right after it, add `project_id: projectId,` right after
`lead_id: lead.id,`.

- [ ] **Step 7: Scope the installment-charges lead lookup, and stamp the charges insert**

Replace:
```ts
        const { data: lead } = await supabase
          .from("leads")
          .select("id, full_name, assigned_to")
          .eq("email", email)
          .single();
```
With:
```ts
        const { data: lead } = await supabase
          .from("leads")
          .select("id, full_name, assigned_to")
          .eq("email", email)
          .eq("project_id", projectId)
          .single();
```

In the `charges` insert a few lines below, add `project_id: projectId,` right after
`product_name: product.name || "Produto",`.

- [ ] **Step 8: Deploy and verify against the already-configured URL (no query param)**

Run: `npx supabase functions deploy perfectpay-webhook`

Then send a synthetic payload with no `project_id` param and confirm it still lands on
Educacional:
```bash
curl -s -X POST "https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/perfectpay-webhook" \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST-NO-PARAM-1","sale_amount":"10.00","sale_status_enum":2,"customer":{"email":"planotest-noparam@example.com","full_name":"Teste Sem Param"},"product":{"code":"TESTPROD","name":"Produto Teste"}}'
```
Expected: `{"success":true}`-shaped response (whatever the function currently returns on success);
then query `SELECT project_id FROM public.leads WHERE email = 'planotest-noparam@example.com';`
and confirm it equals Educacional's `projects.id`.

- [ ] **Step 9: Verify the `?project_id=` override path**

Get any other project's id (or Nutra's, for a quick test — `SELECT id FROM public.projects WHERE
slug = 'nutra';`), then:
```bash
curl -s -X POST "https://lqrlvefeznfaauwgvubl.supabase.co/functions/v1/perfectpay-webhook?project_id=<that-id>" \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST-WITH-PARAM-1","sale_amount":"10.00","sale_status_enum":2,"customer":{"email":"planotest-withparam@example.com","full_name":"Teste Com Param"},"product":{"code":"TESTPROD2","name":"Produto Teste 2"}}'
```
Expected: the resulting `leads`/`sales` rows for `planotest-withparam@example.com` have
`project_id = <that-id>`, not Educacional's.

- [ ] **Step 10: Clean up test rows**

```sql
DELETE FROM public.leads WHERE email IN ('planotest-noparam@example.com', 'planotest-withparam@example.com');
DELETE FROM public.sales WHERE code IN ('TEST-NO-PARAM-1', 'TEST-WITH-PARAM-1');
```

- [ ] **Step 11: Commit**

```bash
git add supabase/functions/perfectpay-webhook/index.ts
git commit -m "Route perfectpay-webhook sales to the correct project"
```

---

### Task 3: `Leads.tsx` — scope by current project

**Files:**
- Modify: `src/pages/Leads.tsx:1-63`

**Interfaces:**
- Consumes: `useProject()` from `@/contexts/ProjectContext` (already used elsewhere in the app).

- [ ] **Step 1: Import `useProject` and scope the query**

Add to the imports:
```ts
import { useProject } from "@/contexts/ProjectContext";
```

Replace:
```ts
function useLeads() {
  return useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as Lead[]) || [];
    },
    staleTime: 30_000,
  });
}
```
With:
```ts
function useLeads(projectId: string | undefined) {
  return useQuery({
    queryKey: ["leads", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads").select("*").eq("project_id", projectId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data as Lead[]) || [];
    },
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Pass the current project id in**

In `LeadsPage`, add:
```ts
  const { currentProject } = useProject();
```
Change `const { data: leads = [], isLoading } = useLeads();` to
`const { data: leads = [], isLoading } = useLeads(currentProject?.id);`.

- [ ] **Step 3: Build and manually verify**

Run: `npx vite build`
Expected: no TypeScript errors.

Then start the dev server (`npx vite --port 8080`) and, logged in, confirm the Leads board still
shows Educacional's existing leads (switching projects isn't wired into the UI yet — Task 13
does that — so this step just confirms nothing broke for the current single visible project).

- [ ] **Step 4: Commit**

```bash
git add src/pages/Leads.tsx
git commit -m "Scope Leads page to the current project"
```

---

### Task 4: `useClientLtv.ts` + `Clientes.tsx` — scope by current project

**Files:**
- Modify: `src/hooks/useClientLtv.ts`
- Modify: `src/pages/Clientes.tsx`

**Interfaces:**
- Consumes: `public.search_clients(search_term, p_project_id)` and `public.client_ltv.project_id`
  from Task 1.

- [ ] **Step 1: Thread `projectId` through `useClientLtvList`**

Replace:
```ts
export function useClientLtvList(search?: string) {
  return useQuery({
    queryKey: ["client-ltv", search],
    queryFn: async () => {
      if (search && search.trim().length >= 2) {
        const { data, error } = await supabase.rpc("search_clients", {
          search_term: search.trim(),
        });
        if (error) throw error;
        return (data || []) as ClientLtv[];
      }
      // Use raw SQL via the view
      const { data, error } = await supabase
        .from("client_ltv" as any)
        .select("*")
        .order("ltv", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as ClientLtv[];
    },
  });
}
```
With:
```ts
export function useClientLtvList(search: string | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: ["client-ltv", search, projectId],
    enabled: !!projectId,
    queryFn: async () => {
      if (search && search.trim().length >= 2) {
        const { data, error } = await supabase.rpc("search_clients", {
          search_term: search.trim(),
          p_project_id: projectId,
        });
        if (error) throw error;
        return (data || []) as ClientLtv[];
      }
      const { data, error } = await supabase
        .from("client_ltv" as any)
        .select("*")
        .eq("project_id", projectId!)
        .order("ltv", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as ClientLtv[];
    },
  });
}
```

- [ ] **Step 2: Scope `useClientLtvKpis`**

Replace:
```ts
export function useClientLtvKpis() {
  return useQuery({
    queryKey: ["client-ltv-kpis"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_ltv" as any)
        .select("*");
      if (error) throw error;
```
With:
```ts
export function useClientLtvKpis(projectId: string | undefined) {
  return useQuery({
    queryKey: ["client-ltv-kpis", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_ltv" as any)
        .select("*")
        .eq("project_id", projectId!);
      if (error) throw error;
```
(Leave the rest of the function body unchanged.)

- [ ] **Step 3: Scope `useClientHistory`'s sales/charges lookups**

In `useClientHistory`, add a second parameter and filter the `sales`/`charges` queries (leave
`implementations` untouched — it's Educacional-only and has no `project_id`):
```ts
export function useClientHistory(email: string | null | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: ["client-history", email, projectId],
    enabled: !!email && !!projectId,
    queryFn: async () => {
      const [salesRes, chargesRes, implRes] = await Promise.all([
        supabase
          .from("sales")
          .select("id, code, product_name, sale_amount, sale_status_enum, date_created")
          .eq("lead_email", email!)
          .eq("project_id", projectId!)
          .order("date_created", { ascending: false }),
        supabase
          .from("charges")
          .select("id, client_name, product_name, total_ticket, status, created_at")
          .eq("client_email", email!)
          .eq("project_id", projectId!)
          .order("created_at", { ascending: false }),
        supabase
          .from("implementations")
          .select("id, client_name, description, total_value, status, contract_start, contract_end")
          .eq("client_email", email!)
          .order("created_at", { ascending: false }),
      ]);
      return {
        sales: salesRes.data || [],
        charges: chargesRes.data || [],
        implementations: implRes.data || [],
      };
    },
  });
}
```

- [ ] **Step 4: Scope `useClientLtvByEmail`**

Replace:
```ts
export function useClientLtvByEmail(email: string | null | undefined) {
  return useQuery({
    queryKey: ["client-ltv", "email", email],
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_ltv" as any)
        .select("*")
        .eq("email", email!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ClientLtv | null;
    },
  });
}
```
With:
```ts
export function useClientLtvByEmail(email: string | null | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: ["client-ltv", "email", email, projectId],
    enabled: !!email && !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_ltv" as any)
        .select("*")
        .eq("email", email!)
        .eq("project_id", projectId!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ClientLtv | null;
    },
  });
}
```

- [ ] **Step 5: Wire `Clientes.tsx` up to pass `currentProject.id`**

Add `import { useProject } from "@/contexts/ProjectContext";` to the imports in
`src/pages/Clientes.tsx`.

In `ClientesPage`, add `const { currentProject } = useProject();` right after the existing
`useState` declarations (before `handleSendWhatsApp`).

Replace (`src/pages/Clientes.tsx:28-29`):
```ts
  const { data: clients = [], isLoading } = useClientLtvList(search.length >= 2 ? search : undefined);
  const { data: kpis } = useClientLtvKpis();
```
With:
```ts
  const { data: clients = [], isLoading } = useClientLtvList(search.length >= 2 ? search : undefined, currentProject?.id);
  const { data: kpis } = useClientLtvKpis(currentProject?.id);
```

- [ ] **Step 6: Wire `ClientDetailSheet.tsx` up to pass `currentProject.id`**

`ClientDetailSheet` is rendered as a sheet, not a page — it can call `useProject()` itself
directly since `ProjectContext` is a global React context, no prop drilling needed.

Add `import { useProject } from "@/contexts/ProjectContext";` to the imports in
`src/components/clients/ClientDetailSheet.tsx`.

Replace (`src/components/clients/ClientDetailSheet.tsx:24-28`):
```ts
export function ClientDetailSheet({
  email, open, onClose,
}: { email: string; open: boolean; onClose: () => void }) {
  const { data: client, isLoading: clientLoading } = useClientLtvByEmail(email);
  const { data: history, isLoading: historyLoading } = useClientHistory(email);
```
With:
```ts
export function ClientDetailSheet({
  email, open, onClose,
}: { email: string; open: boolean; onClose: () => void }) {
  const { currentProject } = useProject();
  const { data: client, isLoading: clientLoading } = useClientLtvByEmail(email, currentProject?.id);
  const { data: history, isLoading: historyLoading } = useClientHistory(email, currentProject?.id);
```

- [ ] **Step 7: Build and verify**

Run: `npx vite build`
Expected: no TypeScript errors. Manually open the Clientes page for Educacional, confirm the
client list and KPIs still populate as before, and click into a client to confirm the detail
sheet (purchases/charges history) still loads.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useClientLtv.ts src/pages/Clientes.tsx src/components/clients/ClientDetailSheet.tsx
git commit -m "Scope client LTV data to the current project"
```

---

### Task 5: `useDashboardData.ts` — generalize the Educacional-path hooks by project

**Files:**
- Modify: `src/hooks/useDashboardData.ts:36-239`

**Interfaces:**
- Produces: `DashboardFilters` gains `projectId: string | undefined` and
  `includeMentorias: boolean`; `useDashboardKpis`, `useDailyRevenue`, `useSalesByProduct`,
  `usePreviousPeriodKpis` all take the extended `DashboardFilters`.
- The Nutra-specific hooks (`useDashboardNutraKpis`, `useDailyNutraRevenue`,
  `useSalesByNutraProduct`, `usePreviousPeriodNutraKpis`, lines 245-347) are **not touched** —
  Nutra keeps using its own `nutra_sales`-backed path untouched.

- [ ] **Step 1: Add `projectId` to `fetchSalesTouchingBrazilPeriod`**

Replace:
```ts
async function fetchSalesTouchingBrazilPeriod(
  startIso: string,
  endIso: string,
  columns: string
): Promise<Record<string, unknown>[]> {
  const col = columns.includes("id") ? columns : `id, ${columns}`;
  const [byApprovedAt, byOrderDate, byRowCreated] = await Promise.all([
    supabase
      .from("sales")
      .select(col)
      .not("date_approved", "is", null)
      .gte("date_approved", startIso)
      .lte("date_approved", endIso),
    supabase
      .from("sales")
      .select(col)
      .not("date_created", "is", null)
      .gte("date_created", startIso)
      .lte("date_created", endIso),
    supabase
      .from("sales")
      .select(col)
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  ]);
```
With:
```ts
async function fetchSalesTouchingBrazilPeriod(
  startIso: string,
  endIso: string,
  columns: string,
  projectId: string | undefined
): Promise<Record<string, unknown>[]> {
  const col = columns.includes("id") ? columns : `id, ${columns}`;
  const base = () => {
    let q = supabase.from("sales").select(col);
    if (projectId) q = q.eq("project_id", projectId);
    return q;
  };
  const [byApprovedAt, byOrderDate, byRowCreated] = await Promise.all([
    base()
      .not("date_approved", "is", null)
      .gte("date_approved", startIso)
      .lte("date_approved", endIso),
    base()
      .not("date_created", "is", null)
      .gte("date_created", startIso)
      .lte("date_created", endIso),
    base()
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  ]);
```
(Leave the rest of the function unchanged.)

- [ ] **Step 2: Extend `DashboardFilters`**

Replace:
```ts
interface DashboardFilters {
  since: string;
  until: string;
}
```
With:
```ts
interface DashboardFilters {
  since: string;
  until: string;
  projectId: string | undefined;
  includeMentorias: boolean;
}
```

- [ ] **Step 3: Update `useDashboardKpis`**

Replace:
```ts
export function useDashboardKpis({ since, until }: DashboardFilters) {
  return useQuery({
    queryKey: ["dashboard-kpis", since, until],
    queryFn: async () => {
      const { startIso, endIso } = brazilCivilRangeUtcIso(since, until);
      const sales = await fetchSalesTouchingBrazilPeriod(
        startIso,
        endIso,
        "sale_amount, sale_status_enum, date_approved, date_created, created_at"
      );

      const approved = sales?.filter((s) => isApprovedSaleStatus(s.sale_status_enum as string)) || [];
      const pending = sales?.filter((s) => s.sale_status_enum === "pending" || s.sale_status_enum === "in_process" || s.sale_status_enum === "in_review") || [];
      const refunded = sales?.filter((s) => s.sale_status_enum === "refunded" || s.sale_status_enum === "pre_refunded") || [];
      const chargebacks = sales?.filter((s) => s.sale_status_enum === "charged_back" || s.sale_status_enum === "pre_chargeback") || [];

      const salesRevenue = approved.reduce((sum, s) => sum + Number(s.sale_amount || 0), 0);

      // Mentorias: paid_amount atribuído pela data de início do contrato (contract_start)
      let mentoriasRevenue = 0;
      try {
        const { data: impls } = await (supabase as any)
          .from("implementations")
          .select("paid_amount")
          .gte("contract_start", since)
          .lte("contract_start", until);
        mentoriasRevenue = (impls || []).reduce((sum: number, i: any) => sum + Number(i.paid_amount || 0), 0);
      } catch {
        mentoriasRevenue = 0;
      }

      return {
        revenue: salesRevenue + mentoriasRevenue,
        salesRevenue,
        mentoriasRevenue,
        approvedCount: approved.length,
        pendingCount: pending.length,
        refundCount: refunded.length,
        chargebackCount: chargebacks.length,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
```
With:
```ts
export function useDashboardKpis({ since, until, projectId, includeMentorias }: DashboardFilters) {
  return useQuery({
    queryKey: ["dashboard-kpis", since, until, projectId, includeMentorias],
    queryFn: async () => {
      const { startIso, endIso } = brazilCivilRangeUtcIso(since, until);
      const sales = await fetchSalesTouchingBrazilPeriod(
        startIso,
        endIso,
        "sale_amount, sale_status_enum, date_approved, date_created, created_at",
        projectId
      );

      const approved = sales?.filter((s) => isApprovedSaleStatus(s.sale_status_enum as string)) || [];
      const pending = sales?.filter((s) => s.sale_status_enum === "pending" || s.sale_status_enum === "in_process" || s.sale_status_enum === "in_review") || [];
      const refunded = sales?.filter((s) => s.sale_status_enum === "refunded" || s.sale_status_enum === "pre_refunded") || [];
      const chargebacks = sales?.filter((s) => s.sale_status_enum === "charged_back" || s.sale_status_enum === "pre_chargeback") || [];

      const salesRevenue = approved.reduce((sum, s) => sum + Number(s.sale_amount || 0), 0);

      // Mentorias: paid_amount atribuído pela data de início do contrato (contract_start) — Educacional only
      let mentoriasRevenue = 0;
      if (includeMentorias) {
        try {
          const { data: impls } = await (supabase as any)
            .from("implementations")
            .select("paid_amount")
            .gte("contract_start", since)
            .lte("contract_start", until);
          mentoriasRevenue = (impls || []).reduce((sum: number, i: any) => sum + Number(i.paid_amount || 0), 0);
        } catch {
          mentoriasRevenue = 0;
        }
      }

      return {
        revenue: salesRevenue + mentoriasRevenue,
        salesRevenue,
        mentoriasRevenue,
        approvedCount: approved.length,
        pendingCount: pending.length,
        refundCount: refunded.length,
        chargebackCount: chargebacks.length,
      };
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!projectId,
  });
}
```

- [ ] **Step 4: Update `useDailyRevenue`**

Apply the same shape of change: destructure `projectId, includeMentorias` from the filters
argument, add both to `queryKey`, pass `projectId` as the 4th argument to
`fetchSalesTouchingBrazilPeriod`, wrap the existing `implementations` fetch block in
`if (includeMentorias) { ... }`, and add `enabled: !!projectId` to the `useQuery` options.
Leave the day-bucketing logic itself untouched.

- [ ] **Step 5: Update `useSalesByProduct`**

Same shape of change: destructure `projectId` (this one doesn't touch mentorias, so no
`includeMentorias` needed here — it's plain sales-by-product), add it to `queryKey`, pass it as
the 4th argument to `fetchSalesTouchingBrazilPeriod`, add `enabled: !!projectId`.

- [ ] **Step 6: Update `usePreviousPeriodKpis`**

Same shape as Step 3: destructure `projectId, includeMentorias`, add both to `queryKey`, pass
`projectId` into `fetchSalesTouchingBrazilPeriod`, gate the `implementations` fetch behind
`if (includeMentorias)`, add `enabled: !!projectId`.

- [ ] **Step 7: Build**

Run: `npx vite build`
Expected: TypeScript errors at every call site in `Index.tsx` (missing `projectId`/
`includeMentorias`) — that's expected, Task 6 fixes those. Confirm the errors are only in
`Index.tsx` and not inside `useDashboardData.ts` itself.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useDashboardData.ts
git commit -m "Generalize dashboard KPI hooks to filter by project_id"
```

---

### Task 6: `Index.tsx` — wire the dashboard to the generalized hooks

**Files:**
- Modify: `src/pages/Index.tsx:46-57`

**Interfaces:**
- Consumes: the extended `DashboardFilters` from Task 5.

- [ ] **Step 1: Pass `projectId` and `includeMentorias` to the Educacional-path hooks**

Replace:
```ts
  // Educacional
  const { data: eduKpis, isLoading: eduKpisLoading } = useDashboardKpis({ since, until });
  const { data: eduDailyRevenue, isLoading: eduRevenueLoading } = useDailyRevenue({ since, until });
  const { data: eduSalesByProduct, isLoading: eduProductsLoading } = useSalesByProduct({ since, until });
  const { data: eduPrevKpis } = usePreviousPeriodKpis({ since, until });
```
With:
```ts
  // Educacional-style path (used by Educacional and any new non-Nutra project)
  const isEducacional = currentProject?.slug === "educacional";
  const eduProjectId = !isNutra ? currentProject?.id : undefined;
  const { data: eduKpis, isLoading: eduKpisLoading } = useDashboardKpis({ since, until, projectId: eduProjectId, includeMentorias: isEducacional });
  const { data: eduDailyRevenue, isLoading: eduRevenueLoading } = useDailyRevenue({ since, until, projectId: eduProjectId, includeMentorias: isEducacional });
  const { data: eduSalesByProduct, isLoading: eduProductsLoading } = useSalesByProduct({ since, until, projectId: eduProjectId, includeMentorias: isEducacional });
  const { data: eduPrevKpis } = usePreviousPeriodKpis({ since, until, projectId: eduProjectId, includeMentorias: isEducacional });
```

Leave the Nutra block (lines 52-57) and everything else in the file untouched — `isNutra` still
gates which set of results (`kpis`, `dailyRevenue`, etc.) gets used further down, unchanged.

- [ ] **Step 2: Build and manually verify**

Run: `npx vite build`
Expected: no TypeScript errors.

Start the dev server, open the Dashboard for Educacional, and confirm KPIs/charts/revenue goal
bar all render the same numbers as before this change (mentorias still folded into revenue for
Educacional specifically).

- [ ] **Step 3: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "Wire dashboard to project-scoped KPI hooks"
```

---

### Task 7: `Financeiro.tsx` — scope its own local sales/mentorias hooks by project

**Files:**
- Modify: `src/pages/Financeiro.tsx:21-42,44-69,169-222`

**Interfaces:**
- Note: `usePeriodSales` and `usePeriodMentorias` are defined **inside** `Financeiro.tsx` itself
  (not in `useDashboardData.ts`) — this task is independent of Task 5/6.

- [ ] **Step 1: Add `projectId` to `usePeriodSales`**

Replace:
```ts
function usePeriodSales(since: string, until: string) {
  return useQuery({
    queryKey: ["period-sales", since, until],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales").select("created_at, sale_amount, sale_status_enum")
        .eq("sale_status_enum", "approved")
        .gte("created_at", `${since}T00:00:00`)
        .lte("created_at", `${until}T23:59:59`);
      if (error) throw error;
```
With:
```ts
function usePeriodSales(since: string, until: string, projectId: string | undefined) {
  return useQuery({
    queryKey: ["period-sales", since, until, projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales").select("created_at, sale_amount, sale_status_enum")
        .eq("sale_status_enum", "approved")
        .eq("project_id", projectId!)
        .gte("created_at", `${since}T00:00:00`)
        .lte("created_at", `${until}T23:59:59`);
      if (error) throw error;
```
(Leave the rest of the function body unchanged.)

- [ ] **Step 2: Restrict `usePeriodMentorias` to Educacional explicitly**

The `enabled` flag is currently `enabled` (a raw boolean passed by the caller as `!isNutra`).
Leave the hook's signature and body as-is — the fix belongs at the call site (Step 4), which
will pass `isEducacional` instead of `!isNutra`.

- [ ] **Step 3: Update the two call sites for `usePeriodSales`**

Replace:
```ts
  const { data: salesData } = usePeriodSales(since, until);
  const { data: prevSalesData } = usePeriodSales(prevSince, prevUntil);
```
With:
```ts
  const { data: salesData } = usePeriodSales(since, until, currentProject?.id);
  const { data: prevSalesData } = usePeriodSales(prevSince, prevUntil, currentProject?.id);
```

- [ ] **Step 4: Fix the Mentorias `enabled` condition to check the project slug, not just "not Nutra"**

Replace:
```ts
  const { currentProject } = useProject();
  const isNutra = currentProject?.slug === "nutra";
```
With:
```ts
  const { currentProject } = useProject();
  const isNutra = currentProject?.slug === "nutra";
  const isEducacional = currentProject?.slug === "educacional";
```

Then replace:
```ts
  // Mentorias (só Educacional): filtradas por contract_start
  const { data: mentoriasData } = usePeriodMentorias(since, until, !isNutra);
  const { data: prevMentoriasData } = usePeriodMentorias(prevSince, prevUntil, !isNutra);
```
With:
```ts
  // Mentorias (só Educacional): filtradas por contract_start
  const { data: mentoriasData } = usePeriodMentorias(since, until, isEducacional);
  const { data: prevMentoriasData } = usePeriodMentorias(prevSince, prevUntil, isEducacional);
```

- [ ] **Step 5: Update the remaining `!isNutra` UI conditionals to `isEducacional`**

A brand-new project is neither Nutra nor Educacional, so every remaining place that treats
"not Nutra" as "show Educacional-only content" must check `isEducacional` specifically instead.
Five occurrences remain in `src/pages/Financeiro.tsx`:

Replace (`Financeiro.tsx:221`):
```ts
  const mentoriasRevenue = !isNutra ? (mentoriasData?.totalRevenue ?? 0) : 0;
```
With:
```ts
  const mentoriasRevenue = isEducacional ? (mentoriasData?.totalRevenue ?? 0) : 0;
```

Replace (`Financeiro.tsx:225`):
```ts
  const prevMentoriasRevenue = !isNutra ? (prevMentoriasData?.totalRevenue ?? 0) : 0;
```
With:
```ts
  const prevMentoriasRevenue = isEducacional ? (prevMentoriasData?.totalRevenue ?? 0) : 0;
```

Replace (`Financeiro.tsx:369`, inside the Receita KPI card):
```tsx
          {!isNutra && mentoriasRevenue > 0 && (
```
With:
```tsx
          {isEducacional && mentoriasRevenue > 0 && (
```

Replace (`Financeiro.tsx:439`, inside the `ComposedChart`):
```tsx
              {!isNutra && <Bar dataKey="mentorias" name="Mentorias" fill="#a855f7" radius={[4, 4, 0, 0]} />}
```
With:
```tsx
              {isEducacional && <Bar dataKey="mentorias" name="Mentorias" fill="#a855f7" radius={[4, 4, 0, 0]} />}
```

Replace (`Financeiro.tsx:449`):
```tsx
      {/* Product Goals - only for educacional */}
      {!isNutra && <ProductGoalsSection since={since} until={until} />}
```
With:
```tsx
      {/* Product Goals - only for educacional */}
      {isEducacional && <ProductGoalsSection since={since} until={until} />}
```

- [ ] **Step 6: Build and manually verify**

Run: `npx vite build`
Expected: no TypeScript errors.

Open Financeiro for Educacional and confirm revenue, mentorias breakdown, and the chart all
render exactly as before.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Financeiro.tsx
git commit -m "Scope Financeiro sales/mentorias queries to the current project"
```

---

### Task 8: `Cobrancas.tsx` — scope charges by current project

**Files:**
- Modify: `src/pages/Cobrancas.tsx:87-100,520-524`

- [ ] **Step 1: Add `useProject` and scope `useCharges`**

Add `import { useProject } from "@/contexts/ProjectContext";` to the imports.

Replace:
```ts
function useCharges() {
  return useQuery<Charge[]>({
    queryKey: ["charges"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charges")
        .select(`*, charge_installments(*), profiles:assigned_to(id, full_name, email)`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Charge[]) || [];
    },
    staleTime: 30_000,
  });
}
```
With:
```ts
function useCharges(projectId: string | undefined) {
  return useQuery<Charge[]>({
    queryKey: ["charges", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charges")
        .select(`*, charge_installments(*), profiles:assigned_to(id, full_name, email)`)
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Charge[]) || [];
    },
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Pass `currentProject.id` from `CobrancasPage`**

In `CobrancasPage`, add:
```ts
  const { currentProject } = useProject();
```
Change `const { data: charges = [], isLoading } = useCharges();` to
`const { data: charges = [], isLoading } = useCharges(currentProject?.id);`.

**`ChargeModal`'s insert into `charges` does not currently stamp `project_id`** — it needs
`useProject()` in scope there too, and it's rendered from `CobrancasPage` without any project
prop, so the simplest fix is to call the hook directly inside `ChargeModal` itself (it's a
top-level function component, same pattern as Step 2 above).

Replace (`Cobrancas.tsx:135-138`):
```ts
function ChargeModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data: profiles = [] } = useProfiles();
```
With:
```ts
function ChargeModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { currentProject } = useProject();
  const { data: profiles = [] } = useProfiles();
```

Replace (`Cobrancas.tsx:186-201`):
```ts
      const { data: charge, error: chargeErr } = await supabase
        .from("charges")
        .insert({
          product_name: data.product_name,
          client_name: data.client_name,
          client_phone: data.client_phone || null,
          total_ticket: data.total_ticket,
          entry_paid: data.entry_paid,
          installments_count: installments.length,
          installment_value: installmentValue,
          assigned_to: data.assigned_to,
          created_by: user?.id || null,
          notes: data.notes || null,
          status: "active",
        } as any)
        .select()
        .single();
```
With:
```ts
      const { data: charge, error: chargeErr } = await supabase
        .from("charges")
        .insert({
          product_name: data.product_name,
          client_name: data.client_name,
          client_phone: data.client_phone || null,
          total_ticket: data.total_ticket,
          entry_paid: data.entry_paid,
          installments_count: installments.length,
          installment_value: installmentValue,
          assigned_to: data.assigned_to,
          created_by: user?.id || null,
          notes: data.notes || null,
          status: "active",
          project_id: currentProject?.id ?? null,
        } as any)
        .select()
        .single();
```

- [ ] **Step 3: Build and manually verify**

Run: `npx vite build`
Expected: no TypeScript errors. Open Cobranças for Educacional, confirm existing charges still
show, and create a test charge to confirm it saves with the right `project_id` (check via SQL:
`SELECT project_id FROM public.charges ORDER BY created_at DESC LIMIT 1;`), then delete the test
row.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Cobrancas.tsx
git commit -m "Scope Cobrancas charges to the current project"
```

---

### Task 9: `Produtos.tsx` — scope by current project

**Files:**
- Modify: `src/pages/Produtos.tsx`

- [ ] **Step 1: Add `useProject` and filter the query**

Replace the full file's data-fetching effect:
```ts
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Package } from "lucide-react";
```
With:
```ts
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProject } from "@/contexts/ProjectContext";
import { Package } from "lucide-react";
```

Replace:
```ts
export default function ProdutosPage() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from("lead_products")
        .select("product_code, product_name, total_purchases_count, total_paid_amount");
```
With:
```ts
export default function ProdutosPage() {
  const { currentProject } = useProject();
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentProject?.id) return;
    async function fetch() {
      const { data } = await supabase
        .from("lead_products")
        .select("product_code, product_name, total_purchases_count, total_paid_amount")
        .eq("project_id", currentProject!.id);
```

Add `currentProject?.id` to the `useEffect` dependency array (currently `[]`):
```ts
  }, [currentProject?.id]);
```

- [ ] **Step 2: Build and manually verify**

Run: `npx vite build`
Expected: no TypeScript errors. Open Produtos for Educacional, confirm the existing product
summary rows still show.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Produtos.tsx
git commit -m "Scope Produtos page to the current project"
```

---

### Task 10: `Agenda.tsx` — scope calls and the lead picker by current project

**Files:**
- Modify: `src/pages/Agenda.tsx:1-104,433-439`

- [ ] **Step 1: Add `useProject` and scope `useCalls`/`useLeads`**

Add `import { useProject } from "@/contexts/ProjectContext";` to the imports.

Replace:
```ts
function useCalls() {
  return useQuery({
    queryKey: ["calls"],
    queryFn: async () => {
      const { data } = await supabase
        .from("calls")
        .select("*")
        .order("start_at", { ascending: true });
      return (data as Call[]) || [];
    },
  });
}
```
With:
```ts
function useCalls(projectId: string | undefined) {
  return useQuery({
    queryKey: ["calls", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("calls")
        .select("*")
        .eq("project_id", projectId!)
        .order("start_at", { ascending: true });
      return (data as Call[]) || [];
    },
  });
}
```

Replace the `useLeads` hook's `queryFn` body:
```ts
  return useQuery({
    queryKey: ["leads-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("email, full_name")
        .order("full_name", { ascending: true });
      return (data as Lead[]) || [];
    },
    staleTime: 0,
  });
```
With:
```ts
  return useQuery({
    queryKey: ["leads-list", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("email, full_name")
        .eq("project_id", projectId!)
        .order("full_name", { ascending: true });
      return (data as Lead[]) || [];
    },
    staleTime: 0,
  });
```
And change the `useLeads` function signature from `function useLeads() {` to
`function useLeads(projectId: string | undefined) {`.

- [ ] **Step 2: Pass `currentProject.id` from `AgendaPage`, and stamp new calls with it**

In `AgendaPage`, add:
```ts
  const { currentProject } = useProject();
```
Change:
```ts
  const { data: calls = [], isLoading: loadingCalls } = useCalls();
  const { data: tasks = [], isLoading: loadingTasks } = useTasks();
  const { data: leads = [] } = useLeads();
```
To:
```ts
  const { data: calls = [], isLoading: loadingCalls } = useCalls(currentProject?.id);
  const { data: tasks = [], isLoading: loadingTasks } = useTasks();
  const { data: leads = [] } = useLeads(currentProject?.id);
```
(`useTasks` is untouched — `tasks` already has `project_id` and that hook lives in
`src/hooks/useTasks.ts`, outside this plan's scope; leave it as-is unless it's already
project-scoped, which is not something this task needs to verify.)

Pass `currentProject` down to `NewCallDialog` so it can stamp new calls.

Replace (`Agenda.tsx:367-373`):
```tsx
      <NewCallDialog
        open={showCallDialog}
        onOpenChange={setShowCallDialog}
        leads={leads}
        defaultDate={selectedDay || new Date()}
        googleAuth={googleAuth}
      />
```
With:
```tsx
      <NewCallDialog
        open={showCallDialog}
        onOpenChange={setShowCallDialog}
        leads={leads}
        defaultDate={selectedDay || new Date()}
        googleAuth={googleAuth}
        currentProjectId={currentProject?.id}
      />
```

Replace (`Agenda.tsx:398-410`):
```tsx
function NewCallDialog({
  open,
  onOpenChange,
  leads,
  defaultDate,
  googleAuth,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leads: Lead[];
  defaultDate: Date;
  googleAuth: ReturnType<typeof useGoogleAuth>;
}) {
```
With:
```tsx
function NewCallDialog({
  open,
  onOpenChange,
  leads,
  defaultDate,
  googleAuth,
  currentProjectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leads: Lead[];
  defaultDate: Date;
  googleAuth: ReturnType<typeof useGoogleAuth>;
  currentProjectId: string | undefined;
}) {
```

Replace (`Agenda.tsx:433-439`):
```ts
      const { data: callData, error } = await supabase.from("calls").insert({
        lead_email: selectedLead || null,
        start_at: startAt.toISOString(),
        meet_link: meetLink || null,
        notes: notes || null,
        owner_user_id: user?.id || null,
      }).select().single();
```
With:
```ts
      const { data: callData, error } = await supabase.from("calls").insert({
        lead_email: selectedLead || null,
        start_at: startAt.toISOString(),
        meet_link: meetLink || null,
        notes: notes || null,
        owner_user_id: user?.id || null,
        project_id: currentProjectId ?? null,
      }).select().single();
```

- [ ] **Step 3: Build and manually verify**

Run: `npx vite build`
Expected: no TypeScript errors. Open Agenda for Educacional, confirm the calendar still shows
existing calls, and schedule a test call to confirm it saves with the right `project_id`, then
delete the test row.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Agenda.tsx
git commit -m "Scope Agenda calls and lead picker to the current project"
```

---

### Task 11: `Relatorios.tsx` — scope report data by current project

**Files:**
- Modify: `src/pages/Relatorios.tsx:19-45`

- [ ] **Step 1: Add `project_id` filters to `sales`, `leads`, `tasks`, `calls`**

Replace:
```ts
      const [salesRes, leadsRes, tasksRes, callsRes, invResFinal, teamRes, mentoriasRes] = await Promise.all([
        supabase.from("sales").select("sale_amount, sale_status_enum, created_at, product_name")
          .gte("created_at", `${since}T00:00:00`).lte("created_at", `${until}T23:59:59`),
        supabase.from("leads").select("id, status, source, created_at")
          .gte("created_at", `${since}T00:00:00`).lte("created_at", `${until}T23:59:59`),
        supabase.from("tasks").select("id, status, completed_at, assigned_to")
          .gte("created_at", `${since}T00:00:00`).lte("created_at", `${until}T23:59:59`),
        supabase.from("calls").select("id, status, start_at")
          .gte("start_at", `${since}T00:00:00`).lte("start_at", `${until}T23:59:59`),
        invQueryFinal,
        supabase.from("profiles").select("id, full_name, email"),
        // Mentorias: paid_amount filtrado por contract_start (só Educacional)
        projectId ? (supabase as any).from("implementations").select("paid_amount, contract_start")
          .gte("contract_start", since).lte("contract_start", until) : Promise.resolve({ data: [], error: null }),
      ]);
```
With:
```ts
      const salesQuery = supabase.from("sales").select("sale_amount, sale_status_enum, created_at, product_name")
        .gte("created_at", `${since}T00:00:00`).lte("created_at", `${until}T23:59:59`);
      const leadsQuery = supabase.from("leads").select("id, status, source, created_at")
        .gte("created_at", `${since}T00:00:00`).lte("created_at", `${until}T23:59:59`);
      const tasksQuery = supabase.from("tasks").select("id, status, completed_at, assigned_to")
        .gte("created_at", `${since}T00:00:00`).lte("created_at", `${until}T23:59:59`);
      const callsQuery = supabase.from("calls").select("id, status, start_at")
        .gte("start_at", `${since}T00:00:00`).lte("start_at", `${until}T23:59:59`);

      const [salesRes, leadsRes, tasksRes, callsRes, invResFinal, teamRes, mentoriasRes] = await Promise.all([
        projectId ? salesQuery.eq("project_id", projectId) : salesQuery,
        projectId ? leadsQuery.eq("project_id", projectId) : leadsQuery,
        projectId ? tasksQuery.eq("project_id", projectId) : tasksQuery,
        projectId ? callsQuery.eq("project_id", projectId) : callsQuery,
        invQueryFinal,
        supabase.from("profiles").select("id, full_name, email"),
        // Mentorias: paid_amount filtrado por contract_start (só Educacional)
        isEducacional ? (supabase as any).from("implementations").select("paid_amount, contract_start")
          .gte("contract_start", since).lte("contract_start", until) : Promise.resolve({ data: [], error: null }),
      ]);
```

- [ ] **Step 2: Add the `isEducacional` parameter**

`useReportData` currently takes `(since, until, projectId)`. Add a 4th parameter:
```ts
function useReportData(since: string, until: string, projectId: string | undefined, isEducacional: boolean) {
  return useQuery({
    queryKey: ["report", since, until, projectId, isEducacional],
    queryFn: async () => {
```
(the rest of the function body is the query built in Step 1).

- [ ] **Step 3: Update the call site**

Replace (`Relatorios.tsx:148`):
```ts
  const { data, isLoading } = useReportData(since, until, currentProject?.id);
```
With:
```ts
  const { data, isLoading } = useReportData(since, until, currentProject?.id, currentProject?.slug === "educacional");
```

- [ ] **Step 4: Build and manually verify**

Run: `npx vite build`
Expected: no TypeScript errors. Open Relatórios for Educacional, generate the report, and
confirm the numbers match what showed before this change (mentorias still folded in, since
Educacional is still `isEducacional === true`).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Relatorios.tsx
git commit -m "Scope Relatorios report data to the current project"
```

---

### Task 12: `Integrações` — per-project webhook URL + product mapping UI

**Files:**
- Modify: `src/pages/Integracoes.tsx:87,145-169`

**Interfaces:**
- Consumes: `public.project_products` from Task 1.

- [ ] **Step 1: Append `project_id` to the displayed webhook URL**

Replace:
```ts
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/perfectpay-webhook`;
```
With:
```ts
  const webhookUrl = currentProject?.id
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/perfectpay-webhook?project_id=${currentProject.id}`
    : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/perfectpay-webhook`;
```

- [ ] **Step 2: Add a `project_products` list + add-row form**

Add state and a query/mutation near the top of `IntegracoesPage` (after the existing `useState`
declarations):
```ts
  const [newProductCode, setNewProductCode] = useState("");
  const [newProductName, setNewProductName] = useState("");

  const { data: projectProducts = [], refetch: refetchProjectProducts } = useQuery({
    queryKey: ["project-products", currentProject?.id],
    enabled: !!currentProject?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_products")
        .select("id, product_code, product_name")
        .eq("project_id", currentProject!.id)
        .eq("source", "perfectpay")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addProjectProduct = async () => {
    if (!newProductCode.trim() || !currentProject?.id) return;
    const { error } = await supabase.from("project_products").insert({
      project_id: currentProject.id,
      source: "perfectpay",
      product_code: newProductCode.trim(),
      product_name: newProductName.trim() || null,
    });
    if (error) {
      toast.error("Erro ao vincular produto: " + error.message);
      return;
    }
    setNewProductCode("");
    setNewProductName("");
    toast.success("Produto vinculado a este projeto!");
    refetchProjectProducts();
  };

  const removeProjectProduct = async (id: string) => {
    const { error } = await supabase.from("project_products").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover vínculo");
      return;
    }
    toast.success("Vínculo removido");
    refetchProjectProducts();
  };
```

Add `useQuery` to the existing `import { useEffect, useState } from "react";` — change it to
`import { useEffect, useState } from "react";` plus a new line
`import { useQuery } from "@tanstack/react-query";`.

- [ ] **Step 3: Render the product-mapping section under the Perfect Pay card**

Right after the closing `</div>` of the "Perfect Pay" `glass-card` block (the one containing the
webhook URL, ending around the line with `Copy` button), add a new block:
```tsx
      {/* Produtos deste projeto (fallback de roteamento por produto) */}
      <div className="glass-card p-5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Produtos deste projeto</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Usado apenas se a mesma URL de webhook for compartilhada entre projetos — vendas com
            um destes códigos de produto caem aqui mesmo sem o parâmetro na URL.
          </p>
        </div>
        <div className="mt-4 flex gap-2">
          <Input
            placeholder="Código do produto"
            value={newProductCode}
            onChange={(e) => setNewProductCode(e.target.value)}
            className="text-sm"
          />
          <Input
            placeholder="Nome (opcional)"
            value={newProductName}
            onChange={(e) => setNewProductName(e.target.value)}
            className="text-sm"
          />
          <Button onClick={addProjectProduct} disabled={!newProductCode.trim()}>Adicionar</Button>
        </div>
        {projectProducts.length > 0 && (
          <div className="mt-4 space-y-2">
            {projectProducts.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-secondary/50 text-sm">
                <span>{p.product_code}{p.product_name ? ` — ${p.product_name}` : ""}</span>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeProjectProduct(p.id)}>
                  Remover
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
```

- [ ] **Step 4: Build and manually verify**

Run: `npx vite build`
Expected: no TypeScript errors.

Open Integrações for Educacional and confirm: the webhook URL now ends in
`?project_id=<educacional-id>`; adding a product code creates a row, removing it deletes the
row (verify both via the UI, no need to check SQL directly here since the UI round-trips it).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Integracoes.tsx
git commit -m "Show per-project webhook URL and product mapping in Integracoes"
```

---

### Task 13: `AppSidebar.tsx` — generalize project groups

**Files:**
- Modify: `src/components/layout/AppSidebar.tsx:42-56,140-185`

**Interfaces:**
- Produces: every project in `useProject().projects` renders its own `ProjectGroup`, not just
  Educacional.

- [ ] **Step 1: Add the reduced item list**

Right after the existing `educacionalItems` array (ends at line 56), add:
```ts
// Same as educacionalItems, minus Mentorias and Onboarding — used by every project that
// isn't Educacional.
const standardProjectItems: NavItem[] = educacionalItems.filter(
  (item) => item.label !== "Mentorias" && item.label !== "Onboarding"
);
```

- [ ] **Step 2: Loop over every project instead of hardcoding Educacional**

Replace:
```ts
function SidebarContent() {
  const { projects, currentProject, setCurrentProject } = useProject();
  const location = useLocation();
  const navigate = useNavigate();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ educacional: true });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const eduProject = projects.find((p) => p.slug === "educacional");

  const toggleGroup = (slug: string) => {
    setOpenGroups((prev) => ({ ...prev, [slug]: !prev[slug] }));
  };
```
With:
```ts
function SidebarContent() {
  const { projects, currentProject, setCurrentProject } = useProject();
  const location = useLocation();
  const navigate = useNavigate();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ educacional: true });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const toggleGroup = (slug: string) => {
    setOpenGroups((prev) => ({ ...prev, [slug]: !prev[slug] }));
  };
```

- [ ] **Step 3: Render one `ProjectGroup` per project**

Replace:
```tsx
      <nav className="flex-1 py-2 px-3 space-y-1 overflow-y-auto">
        {/* Educacional Group */}
        {eduProject && (
          <ProjectGroup
            project={eduProject}
            items={educacionalItems}
            isOpen={openGroups.educacional ?? true}
            onToggle={() => toggleGroup("educacional")}
            onSelectProject={setCurrentProject}
            isActiveProject={currentProject?.slug === "educacional"}
            currentPath={location.pathname}
          />
        )}

        {/* Divider */}
        <div className="h-px bg-sidebar-border/50 my-2" />
```
With:
```tsx
      <nav className="flex-1 py-2 px-3 space-y-1 overflow-y-auto">
        {/* Project groups — one per project, Educacional keeps its full item list */}
        {projects.map((project) => (
          <ProjectGroup
            key={project.id}
            project={project}
            items={project.slug === "educacional" ? educacionalItems : standardProjectItems}
            isOpen={openGroups[project.slug] ?? project.slug === "educacional"}
            onToggle={() => toggleGroup(project.slug)}
            onSelectProject={setCurrentProject}
            isActiveProject={currentProject?.slug === project.slug}
            currentPath={location.pathname}
          />
        ))}

        {/* Divider */}
        <div className="h-px bg-sidebar-border/50 my-2" />
```

- [ ] **Step 4: Build and manually verify**

Run: `npx vite build`
Expected: no TypeScript errors.

Log in and confirm: Educacional's group still shows all its items including Mentorias and
Onboarding; a second group now appears for Nutra with the reduced item list (no Mentorias/
Onboarding) — this is the expected side effect from the spec (Nutra had no sidebar presence
before).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/AppSidebar.tsx
git commit -m "Render a sidebar group for every project, not just Educacional"
```

---

### Task 14: "+ Novo Projeto" button and dialog

**Files:**
- Create: `src/components/layout/CreateProjectDialog.tsx`
- Modify: `src/components/layout/AppSidebar.tsx`

**Interfaces:**
- Produces: `CreateProjectDialog({ open, onOpenChange, onCreated }: { open: boolean;
  onOpenChange: (v: boolean) => void; onCreated: (project: Project) => void })` — a React
  component exported as default.
- Consumes: `Project` type from `@/contexts/ProjectContext`.

- [ ] **Step 1: Write the dialog component**

```tsx
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Project } from "@/contexts/ProjectContext";

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function uniqueSlug(base: string): Promise<string> {
  const { data: existing } = await supabase.from("projects").select("slug").like("slug", `${base}%`);
  const taken = new Set((existing || []).map((p) => p.slug));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (project: Project) => void;
}

export default function CreateProjectDialog({ open, onOpenChange, onCreated }: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📁");
  const [color, setColor] = useState("#D4AF37");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName("");
    setIcon("📁");
    setColor("#D4AF37");
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Dê um nome ao projeto");
      return;
    }
    setSubmitting(true);
    try {
      const slug = await uniqueSlug(slugify(name.trim()));

      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({ name: name.trim(), slug, icon: icon || "📁", color })
        .select()
        .single();
      if (projectError || !project) {
        toast.error("Erro ao criar projeto: " + (projectError?.message || "desconhecido"));
        return;
      }

      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (admins && admins.length > 0) {
        await supabase.from("user_project_access").insert(
          admins.map((a) => ({ user_id: a.user_id, project_id: project.id }))
        );
      }

      toast.success(`Projeto "${project.name}" criado!`);
      onCreated(project as Project);
      reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Novo Projeto</DialogTitle>
          <DialogDescription>Cria um projeto com as mesmas telas do Educacional, sem Mentorias e Onboarding.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Fitness" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Emoji</Label>
              <Input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cor</Label>
              <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 p-1" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={submitting || !name.trim()} className="w-full">
            {submitting ? "Criando..." : "Criar Projeto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add the admin-only "+" button and wire the dialog into `AppSidebar.tsx`**

Add imports at the top of `AppSidebar.tsx`:
```ts
import { Plus } from "lucide-react"; // add to the existing lucide-react import list
import CreateProjectDialog from "./CreateProjectDialog";
```

Inside `SidebarContent`, add state and the admin check (same query pattern as
`Configuracoes.tsx`):
```ts
  const [isAdmin, setIsAdmin] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    };
    checkAdmin();
  }, []);
```
(`useEffect` needs to be added to the existing `import { useState, useEffect, useRef } from
"react";` at the top of the file — it's already imported there, confirm and reuse it.)

Right after the `<nav>` element's opening project-groups loop (i.e. right after the closing
`))}` of the `projects.map(...)` from Task 13, still inside `<nav>`, before the divider), add:
```tsx
        {isAdmin && (
          <button
            onClick={() => setShowCreateProject(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium w-full text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo projeto
          </button>
        )}
```

At the end of `SidebarContent`'s returned JSX (right before its closing `</>`), add:
```tsx
      <CreateProjectDialog
        open={showCreateProject}
        onOpenChange={setShowCreateProject}
        onCreated={(project) => setCurrentProject(project)}
      />
```

- [ ] **Step 3: Build and manually verify**

Run: `npx vite build`
Expected: no TypeScript errors.

Log in as an admin, confirm the "+ Novo projeto" link appears below the project groups. Click
it, create a test project (e.g. name "Teste QA"), confirm: a toast success appears, the sidebar
immediately shows a new group for it with the reduced item set (no Mentorias/Onboarding), and
`currentProject` switches to it. Then clean up:
```sql
DELETE FROM public.user_project_access WHERE project_id = (SELECT id FROM public.projects WHERE slug = 'teste-qa');
DELETE FROM public.projects WHERE slug = 'teste-qa';
```

Log in as (or simulate) a non-admin team member and confirm the "+ Novo projeto" link does
**not** appear.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/CreateProjectDialog.tsx src/components/layout/AppSidebar.tsx
git commit -m "Add admin-only new-project button and dialog"
```
