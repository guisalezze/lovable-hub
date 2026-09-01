# 014 — Add entrance stagger to Relatórios KPI grid, matching Dashboard's pattern

- **Status**: TODO
- **Commit**: a790988
- **Severity**: LOW
- **Category**: Cohesion & tokens (AUDIT.md §7) / Missed opportunities (AUDIT.md §8)
- **Estimated scope**: 2 files (`src/pages/Relatorios.tsx`, `src/index.css`), 1 className addition + 2 new CSS rules

## Problem

`src/pages/Relatorios.tsx` renders a KPI tile grid that is structurally identical to the
Dashboard's hero-metrics grid (a `grid` of tiles built from a `.map()`), but the two have
diverged in polish. The Dashboard version already has a staggered entrance:

```tsx
// src/components/dashboard/HeroMetrics.tsx:91-93 — current
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 stagger-in">
      {cards.map((card) => (
```

The Relatórios version has no `stagger-in` and everything appears at once:

```tsx
// src/pages/Relatorios.tsx:424-433 — current (kpis data)
  const kpis = [
    { label: "Receita", value: fmt(data?.revenue || 0), icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Investimento", value: fmt(data?.investment || 0), icon: BarChart2, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Lucro", value: fmt(data?.profit || 0), icon: (data?.profit ?? 0) >= 0 ? TrendingUp : TrendingDown, color: (data?.profit ?? 0) >= 0 ? "text-emerald-500" : "text-destructive", bg: (data?.profit ?? 0) >= 0 ? "bg-emerald-500/10" : "bg-destructive/10" },
    { label: "ROAS", value: (data?.roas ?? 0) > 0 ? `${data!.roas.toFixed(2)}x` : "–", icon: Target, color: "text-primary", bg: "bg-primary/10" },
    { label: "Vendas aprovadas", value: String(data?.approvedCount || 0), icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Novos leads", value: String(data?.leadsTotal || 0), icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Conversão", value: `${(data?.conversionRate || 0).toFixed(1)}%`, icon: Target, color: "text-primary", bg: "bg-primary/10" },
    { label: "Reembolsos", value: String(data?.refundCount || 0), icon: TrendingDown, color: "text-destructive", bg: "bg-destructive/10" },
  ];
```

```tsx
// src/pages/Relatorios.tsx:468-481 — current (KPI grid render)
        {/* KPI grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map(k => (
            <div key={k.label} className="glass-card p-4 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">{k.label}</span>
                <div className={`h-7 w-7 rounded-md ${k.bg} flex items-center justify-center`}>
                  <k.icon className={`h-3.5 w-3.5 ${k.color}`} />
                </div>
              </div>
              <p className="text-lg font-bold text-foreground">{k.value}</p>
            </div>
          ))}
        </div>
```

`kpis` has **8 tiles**, not the 6-or-fewer that `.stagger-in` currently supports. The existing
rule in `src/index.css`:

```css
/* src/index.css:260-268 — current */
  .stagger-in > * {
    animation: material-in 420ms var(--ease-out-apple) backwards;
  }
  .stagger-in > *:nth-child(1) { animation-delay: 0ms; }
  .stagger-in > *:nth-child(2) { animation-delay: 60ms; }
  .stagger-in > *:nth-child(3) { animation-delay: 120ms; }
  .stagger-in > *:nth-child(4) { animation-delay: 180ms; }
  .stagger-in > *:nth-child(5) { animation-delay: 240ms; }
  .stagger-in > *:nth-child(6) { animation-delay: 300ms; }
```

only defines `:nth-child(1)` through `:nth-child(6)` — confirmed by reading the live file (exactly
6 rules, 60ms apart). Children 7 and 8 would inherit the base `.stagger-in > *` rule with no
matching `:nth-child` override, meaning `animation-delay` falls back to its initial value `0s` —
tiles 7 and 8 would animate in at the same moment as tile 1, which is a smaller version of the
exact "everything at once" problem this class exists to fix. Since the Relatórios grid genuinely
has more than 6 tiles, this plan extends `.stagger-in` rather than leaving 2 of 8 tiles unstaggered.

## Target

**1. `Relatorios.tsx`** — add `stagger-in` to the KPI grid container, matching
`HeroMetrics.tsx`'s exact usage:

```tsx
/* target — src/pages/Relatorios.tsx:469 */
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-in">
```

**2. `index.css`** — extend `.stagger-in` with two more `:nth-child` rules, continuing the
existing 60ms-per-child cadence:

```css
/* target — src/index.css:260-270 */
  .stagger-in > * {
    animation: material-in 420ms var(--ease-out-apple) backwards;
  }
  .stagger-in > *:nth-child(1) { animation-delay: 0ms; }
  .stagger-in > *:nth-child(2) { animation-delay: 60ms; }
  .stagger-in > *:nth-child(3) { animation-delay: 120ms; }
  .stagger-in > *:nth-child(4) { animation-delay: 180ms; }
  .stagger-in > *:nth-child(5) { animation-delay: 240ms; }
  .stagger-in > *:nth-child(6) { animation-delay: 300ms; }
  .stagger-in > *:nth-child(7) { animation-delay: 360ms; }
  .stagger-in > *:nth-child(8) { animation-delay: 420ms; }
```

This is additive only — the existing `:nth-child(1)`–`:nth-child(6)` rules, `.stagger-in`'s base
rule, `.animate-material-in`, and the `prefers-reduced-motion` override at
`src/index.css:287-298` (which already targets `.stagger-in > *` generically and needs no
change) are untouched. Any other consumer of `.stagger-in` with 6 or fewer children (e.g.
`HeroMetrics.tsx`'s 3-card grid) is unaffected since it never reaches `:nth-child(7)`/`(8)`.

## Repo conventions to follow

- `src/components/dashboard/HeroMetrics.tsx:92` is the direct exemplar for how `stagger-in` is
  applied to a grid container — `className="grid grid-cols-1 lg:grid-cols-3 gap-4 stagger-in"` —
  appended as the last class in the string, same as the Target above appends it last on the
  Relatórios grid.
- `.stagger-in`'s per-child delay cadence is a fixed 60ms step (`0, 60, 120, 180, 240, 300`);
  the two new rules continue that same arithmetic progression (`360, 420`) rather than
  introducing a different step size.
- `.stagger-in` and `material-in` already live in the `@layer utilities` block of
  `src/index.css` (lines 184-274) — the new rules are inserted directly after the existing
  `:nth-child(6)` rule, inside that same block, not in a new file or a new `@layer`.

## Steps

1. In `src/pages/Relatorios.tsx`, find the KPI grid `<div>` (line 469,
   `className="grid grid-cols-2 lg:grid-cols-4 gap-3"`) and append ` stagger-in` to the end of
   the className string, producing `"grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-in"`.
2. In `src/index.css`, inside the `.stagger-in` rule block (lines 260-268), add two new lines
   immediately after the existing `.stagger-in > *:nth-child(6) { animation-delay: 300ms; }`
   line:
   ```css
   .stagger-in > *:nth-child(7) { animation-delay: 360ms; }
   .stagger-in > *:nth-child(8) { animation-delay: 420ms; }
   ```
3. Do not modify `kpis` (the data array, lines 424-433), the KPI tile's inner markup/classes
   (icon, label, value), or any other grid on the Relatórios page (the charts grid at line 484,
   the loading-skeleton grid on Leads.tsx — unrelated file, not touched by this plan).

## Boundaries

- Do NOT change the KPI grid's data/layout structure (column counts, `kpis` array contents,
  tile markup) — only add the `stagger-in` className and the two supporting CSS rules.
- Do NOT modify `HeroMetrics.tsx` or any other existing `.stagger-in` consumer — this plan only
  extends the shared rule (additively) and applies the class to one new consumer.
- Do NOT add a 9th+ `:nth-child` rule speculatively — `kpis` has exactly 8 entries today; if a
  future change adds a 9th KPI tile, that is a separate future finding, not something to
  pre-emptively cover here.
- Do NOT change `material-in`'s keyframe, duration (`420ms`), or easing (`var(--ease-out-apple)`)
  — only the per-child `animation-delay` schedule is extended.
- If the code found in either file doesn't match the verbatim excerpts above (drift since commit
  a790988, e.g. if `kpis` no longer has exactly 8 entries), STOP and report instead of
  improvising — in particular, re-count `kpis`' entries before adding the two new `:nth-child`
  rules; if the count is 6 or fewer, Step 2 is unnecessary and only Step 1 should be applied.

## Verification

- **Mechanical**: `npm run build` completes with no new TypeScript/build errors. `npm run lint`
  reports no new violations.
- **Feel check**:
  - Load `/relatorios` (or navigate to it fresh, e.g. via a hard refresh) and watch the KPI grid
    on initial render — confirm the 8 tiles fade/scale in with a visible left-to-right,
    top-to-bottom stagger (tile 1 first, tile 8 last, roughly 420ms apart start-to-start) rather
    than all appearing simultaneously.
  - Confirm the stagger is purely decorative — the tiles' data (revenue, investment, etc.) is
    already correct/interactive immediately, the animation does not delay or block reading the
    numbers once they've faded in.
  - Compare side-by-side (or from memory) against the Dashboard's `HeroMetrics` stagger — the two
    should now feel like the same design language (same duration, same easing curve, same
    per-tile delay step), not two different treatments.
  - Change the date range via `PeriodSelector` (which re-triggers `useReportData` and re-renders
    the grid with new values) — confirm the stagger does not replay in a distracting way on
    every data refetch; if it does replay on every keystroke/filter change, note this as a
    follow-up concern (React re-renders the same DOM nodes across a data-only update, so a CSS
    `animation` on mount should not normally re-trigger — only report if observed, do not fix
    beyond this plan's scope).
  - In DevTools, set playback to 10% (Animations panel) and confirm all 8 tiles use the same
    `material-in` keyframe and each fires at its expected staggered delay (0, 60, 120, 180, 240,
    300, 360, 420ms).
  - Toggle `prefers-reduced-motion` (Rendering panel) and confirm all 8 tiles appear instantly,
    fully opaque, with no stagger — covered by the existing `src/index.css:287-298` reduced-motion
    block, which already targets `.stagger-in > *` generically and requires no plan-specific change.
- **Done when**: the Relatórios KPI grid has the `stagger-in` class, `.stagger-in` in
  `src/index.css` has 8 `:nth-child` rules (or the original 6 if Step 2 was found unnecessary per
  the drift-check note above), and all 8 KPI tiles visibly stagger in on page load.
