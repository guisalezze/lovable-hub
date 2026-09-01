# 007 — Execution Report

**Status**: DONE
**Commit**: d1e1499

## What was done

1. `src/components/ui/button.tsx:8` — `buttonVariants` base class string updated:
   removed `duration-150`, added `btn-press`, swapped
   `ease-[cubic-bezier(0.23,1,0.32,1)]` for `ease-[var(--ease-out-apple)]`.
2. `src/components/dashboard/HeroMetrics.tsx:96` — swapped only the ease token
   (`ease-[cubic-bezier(0.23,1,0.32,1)]` → `ease-[var(--ease-out-apple)]`);
   nothing else on the line touched (confirmed `hero-metric-hover`,
   `duration-200`, and the property list are unchanged — the
   `hero-metric-hover` presence instead of the plan's cited
   `hover:-translate-y-0.5` is plan 003's already-landed change, not drift).
3. `src/index.css`:
   - `.press-scale` rewritten to asymmetric timing: base rule now
     `transition: transform 180ms var(--ease-out-apple)` (release/resting),
     `:active` overrides with `transition-duration: 120ms` (press).
   - New `.btn-press` utility added immediately after `.press-scale`, inside
     the same `@layer utilities` block: base rule
     `transition-duration: 150ms, 150ms, 150ms, 180ms` (positional against
     `color, background-color, border-color, transform`), `:active` override
     `150ms, 150ms, 150ms, 120ms`.
   - `.btn-press` added to the existing `@media (prefers-reduced-motion:
     reduce)` selector list alongside `.material-card` and `.press-scale`.

## Pre-edit verification against plan's "current" excerpts

All three touch points matched the plan's cited current code before editing,
with the one expected/noted exception: `HeroMetrics.tsx:96` had
`hero-metric-hover` where the plan's excerpt showed
`hover:-translate-y-0.5` — this is plan 003's already-landed change per the
task briefing, not drift, and did not block proceeding since only the ease
token on that line was in scope.

No other drift found. Proceeded per plan without improvising.

## Test summary

- `npx tsc --noEmit`: clean, no errors.
- `npm run lint`: 526 pre-existing problems (496 errors/30 warnings), all in
  files untouched by this change (chat components, MetaAds.tsx, sw.ts,
  various supabase/functions/*, tailwind.config.ts, a test file) — none in
  `button.tsx`, `HeroMetrics.tsx`, or `index.css`. No new lint errors
  introduced.
- `npm run build`: succeeded (`vite build` completed, dist assets emitted,
  service worker built). Build emitted two pre-existing Tailwind JIT
  warnings ("class `ease-[var(--ease-in-out-apple)]`/`ease-[var(--ease-out-apple)]`
  is ambiguous and matches multiple utilities") — confirmed **not** new:
  `ease-[var(--ease-in-out-apple)]` already exists in
  `src/components/layout/AppLayout.tsx:69` and
  `src/components/layout/AppSidebar.tsx:343` from prior plans, so this is an
  established, accepted pattern for `var()`-based arbitrary `ease-*` values
  in this codebase, not a regression from this change.
- `grep -n "ease-\[cubic-bezier(0.23,1,0.32,1)\]" src/components/ui/button.tsx src/components/dashboard/HeroMetrics.tsx`:
  **no matches** — confirmed both files now reference
  `var(--ease-out-apple)` instead.

## Concerns

- Working tree note: `git status` at commit time showed several unrelated
  modified files (`src/App.tsx`, `CampaignTable.tsx`, `ChargesHealthCard.tsx`,
  `InvestmentChart.tsx`, `KpiCard.tsx`, `OperationalCards.tsx`,
  `RevenueChart.tsx`, `SalesChart.tsx`, some `supabase/.temp/*`) that are not
  part of this plan's scope. These were left untouched and **not** staged or
  committed — only `src/components/ui/button.tsx`,
  `src/components/dashboard/HeroMetrics.tsx`, and `src/index.css` were staged
  for this commit. Worth flagging to whoever owns those other plans that
  their changes are still uncommitted on `main`.
- Manual "feel check" steps from the plan's Verification section are
  **unverified** — no browser/device available in this environment:
  - Press/release timing feel (~120ms snap in, ~180ms ease back) on a live
    `Button` and on a `.press-scale` element (e.g. the info button in
    `RevenueProgressBar.tsx:99`).
  - DevTools Animations panel at 10% playback confirming release visibly
    outlasts press.
  - Confirming `Button`'s hover color transition still runs at ~150ms
    (unchanged) while only `transform` timing changed.
  - `prefers-reduced-motion` toggle confirming `.btn-press` and
    `.press-scale` no longer animate transform at all.
  - Visual confirmation that the token swap produces the identical easing
    curve as before (expected, since it's the same
    `cubic-bezier(0.23, 1, 0.32, 1)` value, now referenced via `var()`
    instead of retyped).
  A human should spot-check these in a browser before considering the
  interaction feel fully verified.
