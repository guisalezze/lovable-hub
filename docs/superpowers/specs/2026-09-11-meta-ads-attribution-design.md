# Meta Ads Sale Attribution ("own utmify") — Design

Date: 2026-09-11

## Context

The CRM already has real Meta Marketing API integration: OAuth (`meta-oauth`), manual-trigger
campaign-level spend/impressions/clicks sync (`meta-sync`, `meta-campaigns`), and budget/pause
actions (`meta-action`). But **sale-to-exact-ad attribution does not exist today**:

- `meta_adsets` and `meta_ads` tables exist in the schema (ad-level granularity) but nothing ever
  writes to them — only `meta_campaigns` is populated.
- `meta_campaigns.revenue` exists as a column but is never set by any sync code; it's always 0,
  so the ROAS/CPA shown in `MetaAds.tsx` is decorative.
- `sales` (Educacional / PerfectPay funnel) has **no UTM columns at all**. `nutra_sales`
  (Nutra / CartPanda funnel) has `utm_source/medium/campaign` as raw text, no click IDs, no
  parsed campaign/adset/ad IDs.
- No landing-page tracking script, no click-ID capture (`fbclid`/`fbp`/`fbc`), no server-side
  Conversions API (CAPI).
- The only ROAS figure in the app today is a manual, whole-business calculation (`Relatorios.tsx`
  / `HeroMetrics.tsx`): `sum(approved sales) / sum(manually-entered "investments" rows)` —
  unrelated to real Meta spend data and not broken down per campaign/ad.

This was scoped after reviewing an external reference project
(`gabipogere-sys/tracking-template`, a small unlicensed 2-day-old Next.js+Turso template) for
ideas. Its architecture — a landing-page tracking script, a public visit-collection endpoint, a
`nome|id` convention embedded in Meta's UTM macros, visit-based recovery for sales that arrive
without full UTM data, and a server-side CAPI queue — is being adapted into this codebase's own
stack (Vite SPA + Supabase Postgres/Deno edge functions), not imported as a dependency: different
runtime (Turso/SQLite vs. Postgres), no webhook adapters for the gateways this CRM actually uses
(PerfectPay, CartPanda), and no license to redistribute its code.

Landing pages for both funnels are external to this repo (not CRM routes), so the tracking script
is a static asset served by this stack and pasted into each LP's `<head>`.

## Goals

1. Every Meta ad click that lands on a tracked LP is recorded, and its campaign/adset/ad identity
   survives all the way to the resulting sale — for both the Educacional (`sales`/PerfectPay) and
   Nutra (`nutra_sales`/CartPanda) funnels.
2. Attribution survives even when the gateway checkout doesn't forward every query param, via a
   visit-based recovery lookup (`rt_vid`).
3. `meta_ads`/`meta_adsets` get populated for real (ad-level spend/impressions/clicks), on an
   automatic schedule (cron), reusing the Meta account connection that already exists
   (`meta-oauth`) — no new OAuth flow.
4. A computed view joins per-ad spend against attributed sales to produce real CPA/ROAS/profit
   per ad — no denormalized `revenue` column to keep in sync.
5. Approved sales fire a server-side Conversions API (CAPI) Purchase event, deduplicated by
   order ID.
6. A new CRM page shows visits and which ad (if any) each sale is attributed to, filterable by
   funnel/project and date range.

## Non-goals

- Google Ads, TikTok Ads, Kwai — Meta only, this phase.
- A rules engine for auto-pausing underperforming ads (the reference template has an unused
  `rules` table for this; not being built here).
- A CAPI retry queue/dedupe-across-failures system — v1 fires once, fire-and-forget, logged on
  failure. Revisit if the failure rate in practice warrants it.
- ClickBank funnel attribution — only PerfectPay (Educacional) and CartPanda (Nutra) in this
  phase.
- Changing the existing whole-business "investments" ROAS calculation in `Relatorios.tsx` — it
  stays as-is; this is a new, separate, per-ad view.

## Design

### 1. Schema changes (new migration)

New table `ad_visits` — one row per landing-page visit that the tracking script observes:

```
id uuid primary key default gen_random_uuid()
rt_vid uuid not null                          -- cookie set on the LP by tracking.js
project text not null check (project in ('educacional', 'nutra'))
utm_source, utm_medium, utm_campaign, utm_content, utm_term text
fbclid, fbp, fbc text
campaign_id, adset_id, ad_id text              -- parsed from the "name|id" convention
campaign_name, adset_name, ad_name text
landing_url text
referrer text
ip text
user_agent text
created_at timestamptz not null default now()
```
Indexes: `rt_vid`, `created_at`. RLS: no public read/write policies — only the service-role
`ad-collect` function (insert) and authenticated users via the new UI (select) touch this table.
A daily cron (piggybacking the existing `task-reminders-cron` pattern, or a new lightweight cron)
deletes rows older than 90 days.

`sales` (currently zero UTM columns) gains:
```
utm_source, utm_medium, utm_campaign, utm_content text
fbclid, fbp, fbc text
campaign_id, adset_id, ad_id text
```

`nutra_sales` (already has `utm_source/medium/campaign` as text) gains:
```
fbclid, fbp, fbc text
campaign_id, adset_id, ad_id text
```

`meta_ads` / `meta_adsets` (exist, unused) — no schema change, just actually get written to.

View `ad_performance`: joins `meta_ads` (spend/impressions/clicks by ad by day) against
`sales` + `nutra_sales` (grouped by `ad_id` by day) to compute CPA, ROAS, profit, ticket médio per
ad, per day. Computed on read — no stored/denormalized revenue column.

### 2. Tracking script (`tracking.js`)

Static asset (~2-3KB), pasted before `</head>` on each LP. Responsibilities:
- Read UTMs + `fbclid` from the current URL; read `_fbp`/`_fbc` cookies (already set by Meta's own
  client-side pixel, which the LPs are assumed to keep running — this script doesn't replace that
  pixel, it rides alongside it).
- Generate (or read, if already present) a `rt_vid` cookie on the LP's domain.
- POST a visit payload to `ad-collect` via `navigator.sendBeacon` (falls back to `fetch` with
  `keepalive: true`) — fire-and-forget, never blocks page render.
- Stamp every outbound link to the gateway checkout with the UTM/click-id params (including links
  inserted after page load, via `MutationObserver`, matching the reference template's approach —
  static checkout buttons need this as much as dynamically-rendered ones).

### 3. `ad-collect` (new public edge function)

`verify_jwt = false` (same pattern as `perfectpay-webhook`, `cartpanda-s2s` in `config.toml`).
CORS: reflects the request `Origin` back only when it matches `*.guisalezze.com` (Educacional) or
an allow-list read from a Supabase secret (Nutra domain — not decided yet, added later without a
code change). Validates payload shape, parses `campaign_id`/`adset_id`/`ad_id` out of the
`name|id` UTM fields (same `splitNameId`/`parseAdRef` logic as the reference template, ported to
Deno/TypeScript), inserts one `ad_visits` row. No business logic beyond that.

### 4. Webhook attribution (`perfectpay-webhook`, `cartpanda-s2s`)

On each incoming sale payload:
1. Extract UTMs + click IDs directly from the payload if present.
2. Parse `name|id` fields into `campaign_id`/`adset_id`/`ad_id`.
3. If attribution is incomplete (missing `ad_id`) and a `rt_vid` was forwarded (as a query param
   on the checkout link, or read from a cookie the gateway passes through — needs confirming per
   gateway during implementation), look up the most recent matching `ad_visits` row and fill in
   the gaps.
4. Write all of the above onto the `sales`/`nutra_sales` row alongside the existing insert/update.
5. After a successful approved-sale write, call `meta-capi` fire-and-forget (does not block the
   webhook's response to the gateway).

This is additive to the existing webhook logic — sales still save even if every attribution step
above fails or finds nothing (matches existing non-blocking patterns already in these functions).

### 5. `meta-sync` (existing function, extended)

Currently pulls campaign-level insights only, manual-trigger only. Gains:
- A call to the Meta Insights API at `adset` and `ad` level (same connected token via
  `meta-oauth`), upserting into `meta_adsets`/`meta_ads`.
- A cron schedule (15-30 min, matching the cadence already agreed for this project) via
  `supabase/functions/meta-sync` + a `pg_cron` job or the existing cron pattern used by
  `task-reminders-cron`.
- Per-account error isolation: one account's failure (expired token, rate limit) is logged and
  skipped, doesn't abort the sync for other accounts.

### 6. `meta-capi` (new edge function)

Receives `{ event_name: 'Purchase', order_id, value, currency, email, phone, fbp, fbc, ip,
user_agent }` from the webhooks. Hashes PII (email/phone, SHA-256, lowercase+trimmed — Meta's
requirement) client-side-of-the-function before sending. Sends to the Meta Conversions API using
the pixel ID + CAPI access token (stored as Supabase secrets, already generated by the user).
`event_id = order_id` for dedup against any client-side pixel event. Fire-and-forget from the
webhook's perspective; logs failures, no retry queue in v1 (non-goal — see above).

### 7. New CRM page — "Atribuição"

New tab inside the existing `/meta-ads` page (reuses the Educacional/Nutra project selector
already there via `ProjectContext`, rather than a brand-new route). Table of sales with: matched
campaign/adset/ad name, attribution source (direct UTM vs. recovered via `rt_vid` vs. none),
value, date. Filterable by date range and funnel.

### 8. Error handling

- `ad-collect`: never blocks the LP — client uses `sendBeacon`, no retry, no user-visible failure
  state.
- Webhook attribution parsing: best-effort, additive to the existing sale write — a parsing/match
  failure never prevents the sale itself from saving.
- `meta-capi`: single attempt, fire-and-forget, failures logged only (no retry queue — non-goal).
- `meta-sync`: per-account isolation, one broken connection doesn't stop the others' sync.

### 9. Testing

No automated test framework exists in this repo (no vitest/jest config found). Validation is a
manual checklist per component during implementation:
- `tracking.js` fires and a row lands in `ad_visits` with correctly parsed `campaign_id`/
  `adset_id`/`ad_id`.
- A sample PerfectPay/CartPanda webhook payload (with and without full UTM data) resolves to the
  right ad, including the `rt_vid` recovery path.
- `meta-sync` populates `meta_ads`/`meta_adsets` with real numbers matching the Meta Ads Manager
  UI for a known account/date range.
- A test purchase shows up in Meta's Events Manager Test Events tool via `meta-capi`.
- `ad_performance` view numbers for a known test sale match a manual calculation.

## Open questions (config, not architecture — do not block implementation)

- Nutra LP domain(s) not yet set up; `ad-collect` CORS allow-list for Nutra ships as an empty/
  placeholder Supabase secret, added later with zero code changes.
- Whether PerfectPay/CartPanda forward `fbclid` (not just UTM fields) through to the webhook
  payload, or only via the `rt_vid` recovery path — needs confirming empirically per gateway
  during implementation; both attribution paths are designed for either outcome.
