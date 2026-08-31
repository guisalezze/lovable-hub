# Multi-Project Data Isolation + "New Project" Flow — Design

Date: 2026-08-31

## Context

Vault CRM (formerly Solaryz) is nominally multi-project (`projects` table, `user_project_access`,
`ProjectContext`), but in practice only one project ("Educacional") is fully wired up:

- `AppSidebar.tsx` hardcodes a single project group for `slug === "educacional"`. A second
  seeded project ("Nutra") has no sidebar presence at all today — it's only reachable via the
  standalone `/meta-ads` route.
- Core business tables (`leads`, `sales`, `charges`, `lead_products`, `calls`, `copy_projects`,
  `onboarding_responses`) have **no `project_id` column**. Only `tasks`, `investments`,
  `meta_ad_accounts` (and `nutra_sales`) are project-scoped today.
- The `perfectpay-webhook` (and `clickbank-webhook`, `cartpanda-s2s`) edge functions write into
  those unscoped core tables with no project awareness.

The user wants an easy way to spin up a new project from the CRM UI that behaves like a real
sibling of Educacional (same pages: Leads, Financeiro, Clientes, Tarefas, Copies, Produtos,
Agenda, Relatórios, Integrações) minus Mentorias and Onboarding, with genuinely separate data —
not a shared pool with Educacional — and with its own Perfect Pay sales webhook.

**Explicitly out of scope for this phase:** the WhatsApp/Baileys automation backend
(`server/src/index.js`, ~2550 lines, zero `project_id` references today) is not made
multi-tenant here. It's a separate, larger effort (session/QR isolation per project) that needs
its own design pass. The "Connect" sidebar section (WA Oficial, WA Canais, Inbox, Grupos WA,
Email Marketing, Captação de Leads, Encurtador, Webhooks, Instagram) stays visible and shared
across all projects in this phase.

## Goals

1. New projects are created from a button in the CRM (admin-only), not manual SQL.
2. A new project gets the same sidebar surface as Educacional, minus Mentorias/Onboarding.
3. A new project's Leads/Financeiro/Clientes/Cobranças/Produtos/Agenda/Copies/Relatórios/
   Dashboard data is genuinely separate from Educacional's — not filtered client-side over a
   shared pool.
4. The next real project will sell through Perfect Pay, using **its own dedicated webhook URL**
   (confirmed by user — not the same URL/account as Educacional's product-based routing).
   The webhook must route sales to the correct project.
5. Existing Educacional data and the already-configured Perfect Pay webhook URL keep working
   with zero manual migration steps for the user.

## Non-goals

- Hardening RLS to strictly enforce per-user project access at the database level. Today
  `tasks`/`investments` (the only tables with `project_id` so far) use blanket
  "any authenticated user" RLS policies — `project_id` is a client-side filtering/organization
  concern, not a hard security boundary, anywhere in this codebase yet. This design follows the
  same existing precedent for consistency. Tightening this is a separate future initiative.
- Multi-tenancy for the WhatsApp/Baileys backend (Phase 4, separate design).
- Expanding the Integrações UI to surface ClickBank/CartPanda (only Perfect Pay has a UI section
  today); the edge functions still get the routing capability for consistency, but no new UI for
  them unless asked.

## Design

### 1. Schema changes (new migration)

Add `project_id uuid REFERENCES public.projects(id)` to:

- `leads`
- `sales`
- `charges`
- `lead_products`
- `calls`
- `copy_projects`
- `onboarding_responses`

Backfill: `UPDATE <table> SET project_id = (SELECT id FROM projects WHERE slug = 'educacional')`
for every existing row, mirroring how `tasks.project_id` was backfilled in the original
multi-project migration. RLS policies on these tables are left as-is (permissive), matching the
existing `tasks`/`investments` precedent — see Non-goals.

New table `project_products` — an admin-managed mapping from a payment-gateway product code to a
project, used as a **fallback** routing mechanism when a webhook URL isn't (or can't be)
dedicated per project:

```sql
CREATE TABLE public.project_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'perfectpay', -- 'perfectpay' | 'clickbank' | 'cartpanda'
  product_code text NOT NULL,
  product_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source, product_code)
);
-- RLS: same admin-manage / authenticated-read pattern as `projects`.
```

### 2. Webhook routing (perfectpay-webhook, clickbank-webhook, cartpanda-s2s)

Each function resolves a `project_id` for the incoming sale with this precedence:

1. `?project_id=<uuid>` query param on the webhook URL, if present and valid.
2. Else, look up `project_products` by `(source, product.code)` from the payload.
3. Else, default to Educacional's id (today's implicit behavior — zero breakage for the
   already-configured Perfect Pay URL).

The resolved `project_id` is stamped on every insert the function makes into `leads`, `sales`,
`charges`, `lead_products`, `tasks` (onboarding task creation), and `onboarding_responses`.

Since the user confirmed the next project gets **its own dedicated webhook URL**, path 1 (query
param) is the one actually exercised in practice; path 2 (`project_products`) is kept as a
fallback for cases where a dedicated URL per project isn't available (e.g. same gateway account,
can't create a second webhook), per explicit request to keep both mechanisms.

### 3. Integrações page

- The displayed Perfect Pay webhook URL becomes
  `${SUPABASE_URL}/functions/v1/perfectpay-webhook?project_id=${currentProject.id}` — switching
  projects shows a different, ready-to-paste URL.
- New small section "Produtos deste projeto": lists `project_products` rows for the current
  project, lets an admin add `(product_code, product_name)` pairs and remove them. This exists
  purely as the fallback path described above.

### 4. Client-side project scoping

These pages/hooks add a `.eq("project_id", currentProject.id)` (or equivalent) filter, using
`useProject()`'s `currentProject`:

`Leads.tsx`, `Clientes.tsx`, `Financeiro.tsx`, `Cobrancas.tsx`, `Produtos.tsx`, `Agenda.tsx`
(both `calls` and `leads` queries), `Copies.tsx` + `CopyProjectDetail.tsx`, `Relatorios.tsx`,
`Index.tsx` + `useDashboardData.ts`.

`Index.tsx` / `useDashboardData.ts` currently special-case Nutra via a hardcoded
`isNutra = currentProject?.slug === "nutra"` branch that only filters `meta_ad_accounts`/
`nutra_sales`. This is generalized: every project (Educacional included) filters dashboard
queries by `currentProject.id` uniformly, removing the Nutra-specific branch.

### 5. Sidebar generalization (`AppSidebar.tsx`)

- Replace the hardcoded `projects.find(p => p.slug === "educacional")` lookup with a loop over
  every project in `projects` (from `useProject()`), rendering one collapsible `ProjectGroup`
  each — same component already used today.
- `educacionalItems` (current full list, including Mentorias/Onboarding) is used only when
  `project.slug === "educacional"`.
- A new `standardProjectItems` (⁠= `educacionalItems` minus the Mentorias and Onboarding entries)
  is used for every other project — Nutra included, which currently has no sidebar group at all
  and will gain one as a side effect of this generalization.
- The "Connect" section and "shared items" (Equipe, Configurações) footer stay exactly as they
  render today — global, not per-project — per Non-goals.
- `ProjectSwitcher.tsx` stays unused (dead code today); not removed as part of this change,
  not in scope.

### 6. "New Project" button + dialog

- A small "+" affordance near the sidebar's project groups, visible only to admins (inline
  `user_roles` query for `role = 'admin'`, same pattern already used in `Configuracoes.tsx` —
  no new hook introduced).
- Dialog fields: **Nome** (required), **Emoji** (text input, default `📁`), **Cor** (color input,
  default the Vault gold `#D4AF37`).
- On submit:
  1. Slugify the name (lowercase, strip accents, spaces → hyphens); if the slug collides with an
     existing `projects.slug`, append `-2`, `-3`, etc. until unique.
  2. `INSERT` into `projects` (name, slug, icon, color) — allowed by the existing
     `"Admins can manage projects"` RLS policy.
  3. `INSERT` into `user_project_access` for every current admin (`user_roles` where
     `role = 'admin'`), not just the creator — mirrors the existing `handle_new_user()` trigger
     behavior ("admin gets access to all projects").
  4. Set the new project as `currentProject` and toast success.
- No new database function/RPC needed — both inserts are already permitted by existing RLS for
  an admin caller.

## Testing plan

- Apply the migration against the linked Supabase project; verify existing Educacional rows all
  get `project_id` backfilled correctly (spot-check counts before/after).
- `npx vite build` + targeted manual smoke test in the browser: create a test project via the
  new dialog, confirm the sidebar shows the reduced item set (no Mentorias/Onboarding) and that
  Leads/Financeiro/Clientes/Produtos/Agenda/Copies/Relatórios/Dashboard all show an empty state
  (no Educacional data bleeding through).
- Confirm Educacional's own data still renders unchanged after the migration.
- Confirm the Integrações page shows a `project_id`-suffixed URL that changes when switching
  projects.
- Send a synthetic Perfect Pay payload (via `curl`) to `perfectpay-webhook` once with
  `?project_id=<test-project-id>` and once without, confirming rows land with the right
  `project_id` in both the query-param and default-to-Educacional paths. `project_products`
  fallback path tested by adding a mapping row and posting a payload with no query param.
