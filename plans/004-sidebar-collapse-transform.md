# 004 — Move sidebar collapse off width/margin thrash and onto the unused --ease-in-out-apple token

- **Status**: TODO
- **Commit**: a790988
- **Severity**: HIGH
- **Category**: Performance (AUDIT.md §5) / Easing & duration (AUDIT.md §2)
- **Estimated scope**: 2 files (`src/components/layout/AppSidebar.tsx`, `src/components/layout/AppLayout.tsx`); no changes to `src/index.css` (the `--ease-in-out-apple` token at line 80 already exists, this plan only adds consumers)

## Problem

Desktop sidebar collapse toggles `width` on the `<aside>`, and the content pane compensates by
toggling `margin-left` — both are layout-triggering properties (AUDIT.md §5: "Animate `transform`
and `opacity` only. `width`/`height`/`margin`/`padding`/`top`/`left` trigger layout + paint +
composite.") animated via the also-flagged `transition-all` (AUDIT.md §5: "`transition: all`
animates unintended properties off-GPU — always a finding."). This is a control used constantly
(every desktop session toggles it at least once via the header Menu button).

```tsx
/* src/components/layout/AppSidebar.tsx:340-349 — current, verbatim, desktop (non-mobile) branch */
return (
  <aside
    className={cn(
      "shrink-0 border-r border-sidebar-border bg-sidebar transition-all duration-300 overflow-hidden flex flex-col h-screen fixed left-0 top-0 z-40",
      open ? "w-60" : "w-0"
    )}
  >
    <SidebarContent />
  </aside>
);
```

```tsx
/* src/components/layout/AppLayout.tsx:68-72 — current, verbatim */
<main className={cn(
  "flex flex-col min-h-screen overflow-hidden transition-all duration-300",
  isMobile ? "w-full" : "flex-1",
  !isMobile && sidebarOpen && "ml-60" // Compensar espaço do sidebar fixo no desktop
)}>
```

Every toggle of `w-60`/`w-0` on the `<aside>` forces the browser to recompute layout for the
entire sidebar subtree (nav items, text truncation via `whitespace-nowrap`, icons) on every
animation frame for 300ms, and separately `ml-60`/no-margin on `<main>` reflows the entire page
content.

Separately, `src/index.css:80` defines `--ease-in-out-apple: cubic-bezier(0.77, 0, 0.175, 1)` with
**zero consumers anywhere in the codebase** (confirmed via `grep -rn "ease-in-out-apple" src` —
only the definition itself matches). Per AUDIT.md §2's easing decision order, "Moving / morphing
on screen → `ease-in-out`" — a sidebar sliding open/closed is exactly that case, and is the
natural first real use for this token.

## Target

**Chosen approach and reasoning:** The `<aside>` is `position: fixed` (`fixed left-0 top-0`,
line 343), which means it is already removed from normal document flow — its width never actually
pushes `<main>` via flexbox or block flow. `<main>`'s offset is a *separate*, manually-toggled
`ml-60` class in `AppLayout.tsx` that exists purely to visually compensate for the fixed sidebar's
footprint. This means the `<aside>` itself does NOT need a width animation at all — it can render
at a constant `w-60` (240px) at all times and instead slide fully off-screen via
`transform: translateX(-100%)` when closed, which is compositor-only (no layout recalculation of
its nav content on every frame, fixing the worst part of this finding: the internal sidebar
subtree reflow).

`<main>`'s `margin-left` toggle, however, cannot be eliminated the same way without a larger
restructuring (e.g. switching the whole layout to CSS Grid with an animated track, which is still
a layout property under the hood, or having `<main>` itself use a matching transform — which would
make content slide *under* the sidebar rather than being pushed by it, a different, undesired
visual behavior for a persistent desktop sidebar). Eliminating `<main>`'s margin-left animation
entirely is out of scope for the "smallest structural change" bar this plan sets; instead, per the
plan brief's minimum bar, its `transition-all` is narrowed to the single property it actually
needs (`margin-left`) and pointed at the `--ease-in-out-apple` token. This is a real, if partial,
improvement: it stops animating unintended properties (the `transition: all` finding is fully
fixed on both elements) and the one remaining layout-triggering animation (`<main>`'s
`margin-left`) is isolated to a single top-level box rather than an entire nested subtree.

```tsx
/* target — src/components/layout/AppSidebar.tsx:340-349 */
return (
  <aside
    className={cn(
      "shrink-0 w-60 border-r border-sidebar-border bg-sidebar overflow-hidden flex flex-col h-screen fixed left-0 top-0 z-40 transition-transform duration-300 ease-[var(--ease-in-out-apple)]",
      open ? "translate-x-0" : "-translate-x-full"
    )}
    aria-hidden={!open}
  >
    <SidebarContent />
  </aside>
);
```

```tsx
/* target — src/components/layout/AppLayout.tsx:68-72 */
<main className={cn(
  "flex flex-col min-h-screen overflow-hidden transition-[margin-left] duration-300 ease-[var(--ease-in-out-apple)]",
  isMobile ? "w-full" : "flex-1",
  !isMobile && sidebarOpen && "ml-60" // Compensar espaço do sidebar fixo no desktop
)}>
```

`ease-[var(--ease-in-out-apple)]` is Tailwind arbitrary-value syntax that compiles to
`transition-timing-function: var(--ease-in-out-apple)` — this is the same bracket-arbitrary-value
technique already used elsewhere in the repo (see Repo conventions below), just referencing the
CSS custom property instead of inlining the cubic-bezier literal, so the token stays the single
source of truth.

`aria-hidden={!open}` is added because switching the `<aside>` from `w-0` (which visually and
functionally removes it — zero-width elements are not interactable) to a full-width element moved
off-screen via `transform` means its links remain in the layout box and could otherwise still be
reachable by keyboard Tab navigation while visually hidden. `aria-hidden` on the closed state
prevents that regression without touching the `open`/`onToggle` trigger contract.

## Repo conventions to follow

- Tailwind arbitrary-value easing already appears in this exact form (bracket-wrapped
  `cubic-bezier`) at `src/components/dashboard/HeroMetrics.tsx:96`:
  `transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]` — this plan
  follows the same `transition-[<props>] duration-<n> ease-[<value>]` shape, just with `<value>`
  as `var(--ease-in-out-apple)` instead of an inlined cubic-bezier.
  `.material-card` in `src/index.css:243-245` demonstrates the sibling convention of referencing
  the token directly (`var(--ease-out-apple)`) inside a `transition:` declaration rather than
  inlining the curve — this plan applies the equivalent pattern to Tailwind's arbitrary-value
  syntax instead of raw CSS.
- Both `--ease-out-apple` and `--ease-in-out-apple` are declared together in `src/index.css:78-80`
  under the comment `/* Apple-style motion curves (apple-design skill) */` — no new tokens need to
  be added, only consumed.

## Steps

1. In `src/components/layout/AppSidebar.tsx`, edit the desktop `<aside>` return block
   (currently lines 340-349): change the `className={cn(...)}` first string argument from
   `"shrink-0 border-r border-sidebar-border bg-sidebar transition-all duration-300 overflow-hidden flex flex-col h-screen fixed left-0 top-0 z-40"`
   to
   `"shrink-0 w-60 border-r border-sidebar-border bg-sidebar overflow-hidden flex flex-col h-screen fixed left-0 top-0 z-40 transition-transform duration-300 ease-[var(--ease-in-out-apple)]"`
   (adds `w-60` as a constant, removes `transition-all duration-300`, adds
   `transition-transform duration-300 ease-[var(--ease-in-out-apple)]`). Change the second `cn()`
   argument from `open ? "w-60" : "w-0"` to `open ? "translate-x-0" : "-translate-x-full"`.
2. On the same `<aside>` element, add the prop `aria-hidden={!open}` (place it after the
   `className` prop, before the closing `>`).
3. In `src/components/layout/AppLayout.tsx`, edit the `<main>` element's `cn()` call (currently
   lines 68-72): change the first string argument from
   `"flex flex-col min-h-screen overflow-hidden transition-all duration-300"` to
   `"flex flex-col min-h-screen overflow-hidden transition-[margin-left] duration-300 ease-[var(--ease-in-out-apple)]"`.
   Leave the `isMobile ? "w-full" : "flex-1"` and `!isMobile && sidebarOpen && "ml-60"` lines
   exactly as they are.

## Boundaries

- Do not change the `open`/`onToggle` prop contract on `AppSidebar`, or any state logic in
  `AppLayout.tsx` (`sidebarOpen`, `setSidebarOpen`, the `useEffect` that opens/closes on mobile
  transition) — only the CSS/className driving the visual transition, plus the one additive
  `aria-hidden` attribute needed to keep the transform-based technique from regressing keyboard
  accessibility.
- Do not touch the mobile `Sheet`-based rendering branch in `AppSidebar.tsx` (the `if (isMobile)`
  block, lines 325-338) — that is a different code path using Radix Sheet, covered by Plan 001 if
  anything, not this plan.
- Do not add or modify any tokens in `src/index.css` — `--ease-in-out-apple` already exists at
  line 80 and needs no changes, only new consumers in the two `.tsx` files.
- Do not change `SidebarContent`'s internal markup or styling.
- If the code found in either file doesn't match the verbatim excerpts in Problem (drift since
  commit a790988), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npm run build` completes with no TypeScript or build errors.
  `grep -n "ease-in-out-apple" src/components/layout/AppSidebar.tsx src/components/layout/AppLayout.tsx`
  returns one match in each file. `grep -n "transition-all" src/components/layout/AppSidebar.tsx src/components/layout/AppLayout.tsx`
  returns no matches (confirms `transition-all` was fully removed from both).
- **Feel check**:
  - On desktop viewport, click the header Menu button (`AppLayout.tsx:74-80`) repeatedly and
    confirm the sidebar still slides open/closed over the same ~300ms duration, and the main
    content still shifts to compensate — no visual regression vs. before.
  - In DevTools, open the Performance panel, record a trace while toggling the sidebar, and
    confirm the `<aside>`'s own layout/recalculate-style time drops (no longer a full-subtree
    layout thrash on every frame) — a rough qualitative check is sufficient, not a hard number.
  - In DevTools Animations panel, set playback to 10% and confirm the sidebar's slide-in/out curve
    visibly matches `cubic-bezier(0.77, 0, 0.175, 1)` (starts and ends slow, moves fastest through
    the middle — the hallmark of a strong ease-in-out) rather than the browser default `ease`.
  - With the sidebar closed on desktop, press Tab repeatedly from the header and confirm focus
    never lands on a sidebar nav link (verifies the `aria-hidden={!open}` addition is effective).
  - Toggle `prefers-reduced-motion` (Rendering panel) — this component isn't covered by Plan 002's
    class list, so confirm whether the 300ms slide is acceptable as "reduced" motion already
    (it's a single transform property, no bounce) or flag for a follow-up if not; this plan does
    not add reduced-motion handling itself.
- **Done when**: both files build cleanly, neither contains `transition-all`, the sidebar's
  visual open/close behavior and timing look unchanged to the eye, and the slide now runs on
  `transform`/`margin-left` with the `--ease-in-out-apple` curve instead of the unscoped default
  easing.
