# 003 — Gate hover-triggered transforms behind (hover: hover) and (pointer: fine)

- **Status**: TODO
- **Commit**: a790988
- **Severity**: HIGH
- **Category**: Accessibility (AUDIT.md §6)
- **Estimated scope**: 2 files (`src/index.css`, `src/components/dashboard/HeroMetrics.tsx`)

## Problem

Confirmed via `grep -rn "hover: hover\|pointer: fine" src` at commit a790988: zero matches
anywhere in `src/`. No hover-triggered motion in the app is gated to pointer-fine devices.

Two concrete offenders:

```css
/* src/index.css:246-249 — current, verbatim */
.material-card:hover {
  @apply shadow-md border-border/90;
  transform: translateY(-2px);
}
```

```tsx
/* src/components/dashboard/HeroMetrics.tsx:94-97 — current, verbatim */
<div
  key={card.label}
  className={`rounded-xl border border-border/60 border-l-4 ${card.border} bg-gradient-to-br ${card.bg} backdrop-blur-xl p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]`}
>
```

On a touch device, tapping either of these elements triggers `:hover` (mobile browsers commonly
apply `:hover` styles on tap and only clear them on a subsequent tap elsewhere), so the
`translateY` transform can visually "stick" on the tapped card until the user taps something else
— a false hover state with no pointer actually hovering. `.material-card` is used broadly
(confirmed via `grep -rl "material-card" src` — includes `src/components/dashboard/OperationCards.tsx`
and others), and `HeroMetrics` renders on the Dashboard, the app's most-visited page (it's the
default route `/`, see `educacionalItems` in `src/components/layout/AppSidebar.tsx:45`:
`{ label: "Dashboard", icon: LayoutDashboard, to: "/" }`). The app has confirmed mobile usage —
`src/components/layout/BottomNavBar.tsx` exists and is rendered conditionally for mobile in
`src/components/layout/AppLayout.tsx:110` (`{isMobile && <BottomNavBar ... />}`).

## Target

Per AUDIT.md §6:

```css
@media (hover: hover) and (pointer: fine) {
  .element:hover { transform: scale(1.05); } /* touch fires false hovers on tap */
}
```

Only the **transform-changing** part of each hover rule needs gating — shadow/border-color hover
feedback is harmless on touch (it doesn't visually "stick" in a way that looks broken; a color
snap left over from a tap is far less jarring than a floated/offset card) and can stay ungated.

For `.material-card:hover` in `src/index.css`, split the rule so the transform lives inside the
media query and the shadow/border stay outside:

```css
/* target — src/index.css, replacing lines 246-249 */
.material-card:hover {
  @apply shadow-md border-border/90;
}
@media (hover: hover) and (pointer: fine) {
  .material-card:hover {
    transform: translateY(-2px);
  }
}
```

For `HeroMetrics.tsx`, Tailwind's `hover:` variant compiles to a plain `:hover` selector with no
pointer-fine gating built in (Tailwind does not add `(hover: hover)` automatically to `hover:`
utilities) — the cleanest fix consistent with the `.material-card` precedent above is to move the
transform-only hover behavior into a new dedicated `index.css` utility class gated the same way,
and keep the shadow hover as a plain Tailwind utility on the element:

```css
/* target — new utility, add to src/index.css inside the existing @layer utilities block,
   near .material-card (after line 249) */
@media (hover: hover) and (pointer: fine) {
  .hero-metric-hover:hover {
    transform: translateY(-0.125rem); /* matches Tailwind's -translate-y-0.5 (0.125rem) */
  }
}
```

```tsx
/* target — src/components/dashboard/HeroMetrics.tsx:94-97 */
<div
  key={card.label}
  className={`rounded-xl border border-border/60 border-l-4 ${card.border} bg-gradient-to-br ${card.bg} backdrop-blur-xl p-6 shadow-sm hover:shadow-md hero-metric-hover transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]`}
>
```

This removes the ungated `hover:-translate-y-0.5` Tailwind utility and replaces it with the
`hero-metric-hover` class, which only applies its transform under `(hover: hover) and
(pointer: fine)`. `hover:shadow-md` stays as a plain Tailwind utility (shadow-only, no stick
risk). The `transition-[box-shadow,transform]` on the div is left as-is since it only defines
*how* properties animate, not *when* they change — with `hero-metric-hover`'s transform ungated
on touch, there is simply nothing to transition on tap for that property, which is correct.

## Repo conventions to follow

- New utility classes in this codebase live in `src/index.css`'s `@layer utilities { ... }` block
  (see `.material-card`, `.press-scale`, `.glow-primary` etc. all defined there,
  `src/index.css:184-274`) — add `.hero-metric-hover` there, following the same
  `@apply`-plus-plain-CSS mixing style already used by `.material-card`.
- `.material-card`'s existing transition timing (`220ms var(--ease-out-apple)`, see
  `src/index.css:243-245`) is the closest exemplar for hover-triggered transform timing in this
  repo; `HeroMetrics.tsx:96` already independently uses `duration-200
  ease-[cubic-bezier(0.23,1,0.32,1)]` (the same curve as `--ease-out-apple`,
  `cubic-bezier(0.23, 1, 0.32, 1)`, just not referencing the token) — leave that duration/easing
  untouched, this plan only changes *whether* the transform hover fires on touch, not its timing.

## Steps

1. In `src/index.css`, replace the `.material-card:hover` rule at lines 246-249 with the
   split version shown in Target: the `@apply shadow-md border-border/90;` stays in an ungated
   `.material-card:hover` rule; a new `@media (hover: hover) and (pointer: fine) { .material-card:hover { transform: translateY(-2px); } }`
   block is added immediately after it (still inside the surrounding `@layer utilities` block,
   before its closing `}` at line 274).
2. In the same `@layer utilities` block, add the new `.hero-metric-hover` rule (the
   `@media (hover: hover) and (pointer: fine) { .hero-metric-hover:hover { transform: translateY(-0.125rem); } }`
   block from Target) directly after the block added in Step 1.
3. In `src/components/dashboard/HeroMetrics.tsx`, edit the card `<div>`'s className template
   literal at line 96: remove `hover:-translate-y-0.5` and add `hero-metric-hover` in its place
   (position in the class string doesn't matter for Tailwind/CSS specificity here since it's a
   distinct selector, but keep it adjacent to `hover:shadow-md` for readability).

## Boundaries

- Only touch the transform/translate parts of `.material-card:hover` and `HeroMetrics.tsx`'s card
  hover — do not remove `hover:shadow-md` or `border-border/90` shadow/border hover feedback for
  mouse users.
- Do not touch other `.material-card` usages beyond the shared `.material-card:hover` rule in
  `index.css` (e.g. do not add per-usage overrides in `OperationCards.tsx` or elsewhere — the
  fix at the shared CSS rule covers all consumers).
- Do not touch `.press-scale:active` (`src/index.css:255-257`) — `:active` fires correctly on tap
  by design (that's the intended touch feedback) and needs no pointer gating; only `:hover` is in
  scope.
- Do not add the media query to shadow/border/background-color hover rules anywhere else in the
  codebase — this plan is scoped to the two transform offenders identified above only.
- If the code found in either file doesn't match the verbatim excerpts in Problem (drift since
  commit a790988), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npm run build` completes with no CSS/PostCSS or TypeScript errors.
- **Feel check**:
  - On a real touch device or Chrome DevTools device emulation (which sets `(hover: none) and
    (pointer: coarse)`), tap a `.material-card` element (e.g. an `OperationCards.tsx` card) and
    confirm it does NOT float/translate on tap, and does not remain visually "stuck" after the
    tap ends.
  - Tap a Dashboard hero metric card (`HeroMetrics.tsx`, visible at `/`) and confirm the same —
    no stuck translateY after tap.
  - With a real mouse (or DevTools set back to default, non-touch emulation), hover a
    `.material-card` and a hero metric card and confirm the transform-based lift (`translateY`)
    still happens smoothly on hover, exactly as before this change.
  - In DevTools, set playback to 10% (Animations panel) while hovering with a mouse to confirm
    the transform transition timing (`220ms` for `.material-card`, `200ms` for the hero metric
    card) is unchanged from before.
- **Done when**: touch/tap never triggers a transform on either element (verified via device
  emulation or a real touch device), and mouse hover still triggers the transform exactly as
  before on both.
