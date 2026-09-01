# 008 — Progress bars animate `width` instead of `transform`

- **Status**: TODO
- **Commit**: a790988
- **Severity**: MEDIUM
- **Category**: Performance (§5)
- **Estimated scope**: 8 files, 11 occurrences, style/className edits only

## Problem

11 progress-bar-fill occurrences across 8 files animate width via inline
`style={{ width: '...' }}` combined with `transition-all` (some pinned at
`duration-500`/`duration-700`, both over AUDIT.md's 300ms UI budget for
frequently-refreshed indicators; others rely on Tailwind's implicit 150ms
default). `width` is a layout-triggering property (AUDIT.md §5: *"Animate
`transform` and `opacity` only... `width`/`height`/.../trigger layout + paint
+ composite."*), and `transition-all` animates unintended properties off-GPU
(also always a finding per §5).

The correct pattern **already exists in this exact codebase** —
`src/components/ui/progress.tsx` — and is the exemplar this plan imitates:

```tsx
// src/components/ui/progress.tsx:6-21 — current, the exemplar (unchanged by this plan)
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-primary transition-all"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;
```

The fill element is always rendered at `w-full` (100% of the track) and
visually clipped to the correct percentage by translating it left with
`transform: translateX(-${100 - pct}%)` inside a track with `overflow-hidden`
— GPU-composited, no layout thrash.

**Note on scope**: the task brief for this plan listed 7 files
(`RevenueProgressBar.tsx` ×3, `Index.tsx`, `DesignPreview.tsx`,
`DisparoTab.tsx`, `Equipe.tsx` ×2, `ProductGoalsSection.tsx`,
`ImplementationDetailSheet.tsx` = 10 occurrences) but stated "11 occurrences
across 8 files." Grepping the live repo for the `style={{ width: ... }}` +
progress-bar pattern found an 8th file matching the same pattern that was
missing from that list: **`src/pages/Implementacoes.tsx:150-157`** (the
`ImplementationCard`'s own step-progress bar, separate from
`ImplementationDetailSheet.tsx`'s copy of the same bar). Including it brings
the total to 8 files / 11 occurrences, matching the stated count exactly. It
is included below as occurrence #11.

### The 11 occurrences (verified against the live files)

**1. `src/components/layout/RevenueProgressBar.tsx:54-67`** (`RevenueBarStrip`
— thin strip under the header):

```tsx
// current
    <div
      className="absolute bottom-0 left-0 right-0 h-[3px] bg-secondary/50 overflow-hidden"
      aria-hidden
    >
      <div
        className={`h-full ${barColor} transition-all duration-700 ease-out ${
          isLoading ? "animate-pulse opacity-60" : ""
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
```

**2. `src/components/layout/RevenueProgressBar.tsx:120-125`** (popover
breakdown bar):

```tsx
// current
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden mt-1.5">
                <div
                  className={`h-full ${barColor} rounded-full transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
```

**3. `src/components/layout/RevenueProgressBar.tsx:163-169`** (inline minibar,
`hidden md:block`):

```tsx
// current
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden min-w-[40px] max-w-[100px] hidden md:block">
          <div
            className={`h-full ${barColor} rounded-full transition-all duration-700`}
            style={{ width: `${pct}%` }}
          />
        </div>
```

**4. `src/pages/Index.tsx:160-165`** (period-goal bar; `goalPct`,
`goalBarColor`):

```tsx
// current
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
                <div className={`h-full ${goalBarColor} rounded-full transition-all duration-500`} style={{ width: `${goalPct}%` }} />
              </div>
              <span className="text-xs font-bold text-foreground">{goalPct}%</span>
            </div>
```

**5. `src/pages/DesignPreview.tsx:70-76`** (static mock "Meta do Período" bar,
hardcoded `75%` — no live variable):

```tsx
// current
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: "75%" }} />
            </div>
            <span className="text-xs font-bold text-foreground">75%</span>
          </div>
```

**6. `src/components/whatsapp/DisparoTab.tsx:534-536`** (broadcast-job
progress; `progress` variable):

```tsx
// current
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full transition-all duration-500", job.status === "done" ? "bg-emerald-500" : "bg-primary")} style={{ width: `${progress}%` }} />
              </div>
```

**7. `src/pages/Equipe.tsx:219-221`** (per-member "Tarefas" bar; `taskPct`,
`progressColor()` — no explicit `duration-*`, relies on Tailwind's implicit
150ms default for `transition-all`):

```tsx
// current
                          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${progressColor(taskPct)}`} style={{ width: `${taskPct}%` }} />
                          </div>
```

**8. `src/pages/Equipe.tsx:227-229`** (per-member "Calls" bar; `callPct`, same
pattern):

```tsx
// current
                          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${progressColor(callPct)}`} style={{ width: `${callPct}%` }} />
                          </div>
```

**9. `src/components/financeiro/ProductGoalsSection.tsx:81-88`** (per-product
goal bar; `g.pct`):

```tsx
// current
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    g.pct >= 100 ? "bg-emerald-500" : g.pct >= 60 ? "bg-primary" : "bg-destructive"
                  }`}
                  style={{ width: `${g.pct}%` }}
                />
              </div>
```

**10. `src/components/implementations/ImplementationDetailSheet.tsx:552-554`**
(mentoria detail-sheet step progress; `progress` variable):

```tsx
// current
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${progress >= 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${progress}%` }} />
                  </div>
```

**11. `src/pages/Implementacoes.tsx:150-157`** (`ImplementationCard`'s own
step progress bar, shown on the Mentorias list — see scope note above;
`progress` variable):

```tsx
// current
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              progress >= 100 ? "bg-emerald-500" : progress >= 60 ? "bg-primary" : "bg-yellow-500"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
```

## Target

For every occurrence: add `w-full` to the fill `<div>`'s className (it must
now always span the track), replace `transition-all` with
`transition-transform duration-300 ease-out` (a single strong, GPU-only
property; 300ms sits at the top of AUDIT.md's general "UI animations stay
under 300ms" ceiling, replacing both the over-budget 500/700ms cases and the
under-specified default-150ms cases with one consistent value), and replace
`style={{ width: ... }}` with `style={{ transform: 'translateX(-${100 - pct}%)' }}`
using each occurrence's own percentage variable. Every parent track element
already has `overflow-hidden` in all 11 cases (verified below per-occurrence)
— no parent needs a class added.

**1. `RevenueProgressBar.tsx:54-67`**

```tsx
// target
    <div
      className="absolute bottom-0 left-0 right-0 h-[3px] bg-secondary/50 overflow-hidden"
      aria-hidden
    >
      <div
        className={`h-full w-full ${barColor} transition-transform duration-300 ease-out ${
          isLoading ? "animate-pulse opacity-60" : ""
        }`}
        style={{ transform: `translateX(-${100 - pct}%)` }}
      />
    </div>
```

**2. `RevenueProgressBar.tsx:120-125`**

```tsx
// target
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden mt-1.5">
                <div
                  className={`h-full w-full ${barColor} rounded-full transition-transform duration-300 ease-out`}
                  style={{ transform: `translateX(-${100 - pct}%)` }}
                />
              </div>
```

**3. `RevenueProgressBar.tsx:163-169`**

```tsx
// target
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden min-w-[40px] max-w-[100px] hidden md:block">
          <div
            className={`h-full w-full ${barColor} rounded-full transition-transform duration-300 ease-out`}
            style={{ transform: `translateX(-${100 - pct}%)` }}
          />
        </div>
```

**4. `Index.tsx:160-165`**

```tsx
// target
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
                <div className={`h-full w-full ${goalBarColor} rounded-full transition-transform duration-300 ease-out`} style={{ transform: `translateX(-${100 - goalPct}%)` }} />
              </div>
              <span className="text-xs font-bold text-foreground">{goalPct}%</span>
            </div>
```

**5. `DesignPreview.tsx:70-76`** (static value — `100 - 75 = 25`, hardcoded
exactly like the original hardcoded `"75%"`):

```tsx
// target
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full w-full bg-primary rounded-full transition-transform duration-300 ease-out" style={{ transform: "translateX(-25%)" }} />
            </div>
            <span className="text-xs font-bold text-foreground">75%</span>
          </div>
```

**6. `DisparoTab.tsx:534-536`**

```tsx
// target
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className={cn("h-full w-full rounded-full transition-transform duration-300 ease-out", job.status === "done" ? "bg-emerald-500" : "bg-primary")} style={{ transform: `translateX(-${100 - progress}%)` }} />
              </div>
```

**7. `Equipe.tsx:219-221`**

```tsx
// target
                          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div className={`h-full w-full rounded-full transition-transform duration-300 ease-out ${progressColor(taskPct)}`} style={{ transform: `translateX(-${100 - taskPct}%)` }} />
                          </div>
```

**8. `Equipe.tsx:227-229`**

```tsx
// target
                          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div className={`h-full w-full rounded-full transition-transform duration-300 ease-out ${progressColor(callPct)}`} style={{ transform: `translateX(-${100 - callPct}%)` }} />
                          </div>
```

**9. `ProductGoalsSection.tsx:81-88`**

```tsx
// target
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full w-full rounded-full transition-transform duration-300 ease-out ${
                    g.pct >= 100 ? "bg-emerald-500" : g.pct >= 60 ? "bg-primary" : "bg-destructive"
                  }`}
                  style={{ transform: `translateX(-${100 - g.pct}%)` }}
                />
              </div>
```

**10. `ImplementationDetailSheet.tsx:552-554`**

```tsx
// target
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full w-full rounded-full transition-transform duration-300 ease-out ${progress >= 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ transform: `translateX(-${100 - progress}%)` }} />
                  </div>
```

**11. `Implementacoes.tsx:150-157`**

```tsx
// target
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full w-full rounded-full transition-transform duration-300 ease-out ${
              progress >= 100 ? "bg-emerald-500" : progress >= 60 ? "bg-primary" : "bg-yellow-500"
            }`}
            style={{ transform: `translateX(-${100 - progress}%)` }}
          />
        </div>
```

## Repo conventions to follow

- `src/components/ui/progress.tsx:15-18` is the exemplar (quoted verbatim in
  Problem above) — same `w-full` + `translateX(-${100 - pct}%)` pattern,
  applied identically at all 11 sites.
- Every track `<div>` in this codebase already uses `overflow-hidden` — that
  convention is preserved as-is; this plan only touches the fill `<div>`
  inside each track.

## Steps

1. `src/components/layout/RevenueProgressBar.tsx` — apply target #1 (lines
   54-67), #2 (lines 120-125), and #3 (lines 163-169).
2. `src/pages/Index.tsx` — apply target #4 (lines 160-165).
3. `src/pages/DesignPreview.tsx` — apply target #5 (lines 70-76).
4. `src/components/whatsapp/DisparoTab.tsx` — apply target #6 (lines 534-536).
5. `src/pages/Equipe.tsx` — apply target #7 (lines 219-221) and #8 (lines
   227-229).
6. `src/components/financeiro/ProductGoalsSection.tsx` — apply target #9
   (lines 81-88).
7. `src/components/implementations/ImplementationDetailSheet.tsx` — apply
   target #10 (lines 552-554).
8. `src/pages/Implementacoes.tsx` — apply target #11 (lines 150-157).

## Boundaries

- Do NOT change how any percentage (`pct`, `goalPct`, `progress`, `taskPct`,
  `callPct`, `g.pct`) is calculated — style/transform mechanics only.
- Do NOT touch `src/components/ui/progress.tsx` — it is already correct and
  is the exemplar, not a target.
- Do NOT change the color-selection logic (`barColor`, `progressColor()`,
  the ternary chains choosing `bg-emerald-500`/`bg-primary`/etc.) — only the
  transition/width/transform mechanics around them.
- Do NOT add `overflow-hidden` to any parent — all 11 already have it;
  if any live file is found NOT to have it on its track element, STOP and
  report rather than guessing whether to add it silently.
- If any occurrence's current code doesn't match what's quoted above (drift
  since commit a790988), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm run lint`, `npm run build` — all
  should succeed (template-literal edits only, no type surface changes).
- **Feel check**:
  - Open each page (Dashboard header strip, Financeiro → Product Goals,
    `/design-preview`, WhatsApp Disparo after starting a broadcast, Equipe,
    Implementações list + detail sheet) and force a percentage change (e.g.
    trigger a status change, or in DevTools React inspector bump the
    underlying state) — the fill should slide via a GPU transform, not
    visibly reflow the track.
  - In DevTools Performance panel, record a percentage change on one bar
    (e.g. the RevenueBarStrip while data reloads) and confirm the transform
    change does not trigger a "Layout" entry — only "Composite Layers".
  - In DevTools Animations panel, set playback to 10% on one bar transition
    and confirm the fill visibly translates in from the left edge rather than
    growing from 0 width.
  - Toggle `prefers-reduced-motion` (Rendering panel) — these are simple fill
    indicators (state feedback, not spatial movement), so per AUDIT.md's
    reduced-motion guidance the transform transition may remain (it aids
    comprehension of "how full is this"); confirm nothing crashes/looks
    broken either way (no explicit reduced-motion handling is required or
    added by this plan).
- **Done when**: none of the 11 occurrences have `style={{ width: ... }}` or
  a bare `transition-all` on the fill element anymore; all 11 use
  `transform: translateX(...)` + `transition-transform duration-300 ease-out`
  on a `w-full` fill inside an `overflow-hidden` track.
