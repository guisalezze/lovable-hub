# 007 — Asymmetric press/release timing + consolidate duplicated easing literal

- **Status**: TODO
- **Commit**: a790988
- **Severity**: MEDIUM
- **Category**: Interruptibility (§4) / Cohesion & tokens (§7)
- **Estimated scope**: 3 files, small CSS + className edits

## Problem

Two related findings in the same small set of files.

### 1. Symmetric press/release timing (AUDIT.md §4)

`src/components/ui/button.tsx:8` presses via `active:scale-[0.98]` and
releases back using the **same** single `transition-*` declaration — one
duration for both directions:

```tsx
// src/components/ui/button.tsx:8 — current
"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[color,background-color,border-color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 touch-manipulation active:scale-[0.98]",
```

`src/index.css:251-257`'s `.press-scale` (used on non-`Button` pressable
elements) has the identical issue — one `transition: transform 160ms ...`
covers both the press-in and release-out:

```css
/* src/index.css:251-257 — current */
  /* Instant-feedback press scale for non-Button pressable elements */
  .press-scale {
    transition: transform 160ms var(--ease-out-apple);
  }
  .press-scale:active {
    transform: scale(0.97);
  }
```

AUDIT.md §4 states: *"Asymmetric timing: deliberate phases (press, hold,
destructive confirm) animate slower; the system's response snaps. Symmetric
timing on press-and-release is a finding."* The press (system registering the
tap, i.e. entering `:active`) should feel instantaneous; the release (letting
go) can ease back marginally slower without hurting responsiveness.

### 2. Duplicated easing literal (AUDIT.md §7)

`button.tsx:8` and `src/components/dashboard/HeroMetrics.tsx:96` both hand-type
the literal `ease-[cubic-bezier(0.23,1,0.32,1)]` instead of referencing the
token already defined once in `src/index.css:79`:

```css
/* src/index.css:78-80 — current, the canonical token */
    /* Apple-style motion curves (apple-design skill) */
    --ease-out-apple: cubic-bezier(0.23, 1, 0.32, 1);
    --ease-in-out-apple: cubic-bezier(0.77, 0, 0.175, 1);
```

```tsx
// src/components/dashboard/HeroMetrics.tsx:94-97 — current
        <div
          key={card.label}
          className={`rounded-xl border border-border/60 border-l-4 ${card.border} bg-gradient-to-br ${card.bg} backdrop-blur-xl p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]`}
        >
```

Two hardcoded copies of the exact same curve is a token-drift risk: if
`--ease-out-apple` is ever retuned, these two spots silently go stale.

## Target

### Token consolidation

Tailwind's arbitrary `ease-[...]` utility accepts a raw CSS value, including a
`var()` reference — `ease-[var(--ease-out-apple)]` compiles to
`transition-timing-function: var(--ease-out-apple)`. This is valid Tailwind
3.4.17 JIT syntax (same mechanism already used for `ease-[cubic-bezier(...)]`
in both files today — only the value inside the brackets changes).

- `button.tsx`: replace `ease-[cubic-bezier(0.23,1,0.32,1)]` with
  `ease-[var(--ease-out-apple)]`.
- `HeroMetrics.tsx:96`: replace `ease-[cubic-bezier(0.23,1,0.32,1)]` with
  `ease-[var(--ease-out-apple)]`.

### Asymmetric press/release timing

CSS transitions use the duration declared on the **destination** state's
rule — the state being transitioned *to*. For `.press-scale` (single-property,
just `transform`), this makes the fix trivial: put the longer (release)
duration on the base/resting rule, and override with a shorter (press)
duration on `:active`.

```css
/* src/index.css:251-257 — target */
  /* Instant-feedback press scale for non-Button pressable elements.
     Press snaps in fast; release eases back out slightly slower
     (AUDIT.md §4 — asymmetric timing, symmetric press/release is a finding). */
  .press-scale {
    transition: transform 180ms var(--ease-out-apple); /* release / resting-state duration */
  }
  .press-scale:active {
    transition-duration: 120ms; /* press duration — snappier than release */
    transform: scale(0.97);
  }
```

For `button.tsx`, the base class string animates **four** properties in one
`transition-[...]` declaration (`color, background-color, border-color,
transform`), all sharing Tailwind's single `duration-150` utility. Tailwind
utility classes cannot express two different durations for the same property
across two different pseudo-states, so introduce one small explicit CSS class,
`.btn-press`, in `src/index.css`. `transition-duration` accepts a
comma-separated list that maps **positionally** to the properties listed in
`transition-property` — since `button.tsx` already declares its property list
as `color, background-color, border-color, transform` (in that order), a
4-value duration list lets `transform` get its own asymmetric timing while
`color`/`background-color`/`border-color` keep their existing 150ms:

```css
/* src/index.css — target, new block, place near .press-scale */
  /* Asymmetric press/release timing for Button. transition-duration values
     are positional against Button's transition-property list:
     color, background-color, border-color, transform
     (AUDIT.md §4 — asymmetric timing, symmetric press/release is a finding). */
  .btn-press {
    transition-duration: 150ms, 150ms, 150ms, 180ms; /* transform release/resting duration = 180ms */
  }
  .btn-press:active {
    transition-duration: 150ms, 150ms, 150ms, 120ms; /* transform press duration = 120ms, snappier */
  }
```

```tsx
// src/components/ui/button.tsx:8 — target
"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background btn-press transition-[color,background-color,border-color,transform] ease-[var(--ease-out-apple)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 touch-manipulation active:scale-[0.98]",
```

Note: `duration-150` is removed from the Tailwind class string (the new
`.btn-press` CSS class now fully owns `transition-duration` for this element,
so there is no ambiguity about which rule wins). `btn-press` must appear
*somewhere* in the class string — placement shown above (right after
`ring-offset-background`) keeps the string readable but exact position within
the string does not matter for CSS output.

`.btn-press` must be declared inside `src/index.css`'s existing `@layer
utilities { ... }` block (the same block that already contains
`.press-scale`, so it participates in the same cascade layer and the source
order that already lets custom utilities safely coexist with Tailwind's
generated ones in this file is preserved).

## Repo conventions to follow

- `src/index.css:78-80` already defines `--ease-out-apple` /
  `--ease-in-out-apple` as the canonical curve tokens — reference them, never
  retype the `cubic-bezier(...)` literal.
- `src/index.css:251-257` (`.press-scale`) is the existing exemplar for a
  small hand-written CSS utility living alongside Tailwind's generated
  utilities inside `@layer utilities { ... }` (see `src/index.css:184` for the
  opening of that block) — `.btn-press` should be added to that same block,
  right next to `.press-scale`, following the same comment style.
- `src/index.css:287-298` already has a `@media (prefers-reduced-motion:
  reduce)` block that force-disables `.material-card` and `.press-scale`
  transitions — add `.btn-press` to that same list (see Steps).

## Steps

1. `src/components/ui/button.tsx:8` — replace the `buttonVariants` base class
   string with the Target string above: remove `duration-150`, add
   `btn-press`, and swap `ease-[cubic-bezier(0.23,1,0.32,1)]` for
   `ease-[var(--ease-out-apple)]`.
2. `src/components/dashboard/HeroMetrics.tsx:96` — swap
   `ease-[cubic-bezier(0.23,1,0.32,1)]` for `ease-[var(--ease-out-apple)]` in
   the card's className template literal. Do not change anything else on that
   line (`duration-200`, the property list, `hover:-translate-y-0.5`, etc. stay
   as-is — this component's press timing is not part of this finding).
3. `src/index.css` — replace the `.press-scale` block (lines 251-257) with the
   asymmetric-timing target block shown above.
4. `src/index.css` — add the new `.btn-press` block (shown above) immediately
   after `.press-scale`, inside the same `@layer utilities { ... }`.
5. `src/index.css:294-297` — extend the existing
   `@media (prefers-reduced-motion: reduce)` selector list
   (`.material-card, .press-scale { transition: none !important; }`) to also
   include `.btn-press`, so reduced-motion users don't get any transform
   transition at all on press:
   ```css
   /* src/index.css — target, inside the existing @media (prefers-reduced-motion: reduce) block */
     .material-card,
     .press-scale,
     .btn-press {
       transition: none !important;
     }
   ```

## Boundaries

- Do NOT change the scale values (`active:scale-[0.98]` in `button.tsx`,
  `scale(0.97)` in `.press-scale`) — both are already within AUDIT.md's
  correct 0.95–0.98 press-feedback range. Timing and token-consolidation only.
- Do NOT change `color`/`background-color`/`border-color` durations in
  `button.tsx` — they stay at 150ms; only the `transform` sub-property gets
  asymmetric timing.
- Do NOT touch `.material-card`'s hover transition (`src/index.css:242-249`)
  — different interaction (hover, not press), out of scope.
- Do NOT touch any other `duration-*` or `ease-*` usage outside the three
  files/locations named above (broader token-scale work is Plan 010).
- If the current code you find doesn't match the "current" snippets quoted
  above (drift since commit a790988), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npx tsc --noEmit` (no type errors), `npm run lint` (no new
  ESLint errors), `npm run build` (Vite build succeeds — confirms the
  arbitrary Tailwind values compile).
- **Feel check**:
  - Open DevTools, set the Animations panel (or just eyeball at normal speed)
    on any `Button` (e.g. the "Novo Lead" button on the Leads page). Press and
    hold the mouse button down — the scale-down to 0.98 should feel snappy
    (~120ms). Release — the scale-back-to-1 should feel very slightly softer
    (~180ms), not identical to the press.
  - Repeat on an element using `.press-scale` (e.g. the info `<button>` in
    `RevenueProgressBar.tsx:99`).
  - In DevTools, set playback to 10% (Animations panel), trigger a button
    press/release, and confirm the release animation visibly runs longer than
    the press animation.
  - Confirm `Button`'s hover color transition (e.g. `hover:bg-primary/90`)
    still animates at the original ~150ms — only the transform timing changed.
  - Toggle `prefers-reduced-motion` (Rendering panel) and confirm `.btn-press`
    and `.press-scale` no longer animate the transform at all (instant scale
    change), matching the existing reduced-motion behavior for `.material-card`.
  - Confirm both `button.tsx` and `HeroMetrics.tsx` visually render the exact
    same easing curve as before (no perceptible change from the token swap —
    it's the same `cubic-bezier(0.23, 1, 0.32, 1)` values, now referenced not
    retyped).
- **Done when**: pressing any `Button` or `.press-scale` element visibly snaps
  in faster than it eases back out, `ease-[cubic-bezier(0.23,1,0.32,1)]` no
  longer appears anywhere in `button.tsx` or `HeroMetrics.tsx`, and both
  reference `var(--ease-out-apple)` instead.
