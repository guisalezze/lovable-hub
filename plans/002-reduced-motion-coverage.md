# 002 — Expand prefers-reduced-motion coverage beyond 4 classes

- **Status**: TODO
- **Commit**: a790988
- **Severity**: HIGH
- **Category**: Accessibility (AUDIT.md §6)
- **Estimated scope**: 1 file (`src/index.css`), one media query block extended

## Problem

The only `@media (prefers-reduced-motion: reduce)` block in the app is in
`src/index.css:287-298` and covers exactly 4 selectors:

```css
/* src/index.css:287-298 — current, verbatim */
@media (prefers-reduced-motion: reduce) {
  .stagger-in > *,
  .animate-material-in {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
  .material-card,
  .press-scale {
    transition: none !important;
  }
}
```

This does not cover:

- **Tailwind-config keyframe animations** defined in `tailwind.config.ts:99-149` and exposed as
  utility classes: `animate-fade-in` (`fade-in 0.4s ease-out`, translates `translateY(8px)→0`),
  `animate-slide-in` (`slide-in 0.3s ease-out`, translates `translateX(-100%)→0`),
  `animate-pulse-glow` (`pulse-glow 3s ease-in-out infinite`, box-shadow only — no movement, can
  stay), `animate-accordion-down`/`animate-accordion-up` (height-based, from Radix Accordion).
- **Radix overlay entrance/exit classes** used via `tailwindcss-animate` in `select.tsx`,
  `popover.tsx`, `dropdown-menu.tsx`, `context-menu.tsx`, `menubar.tsx`, `sheet.tsx`,
  `navigation-menu.tsx` — all compiled from `data-[state=open]:animate-in
  data-[state=closed]:animate-out` plus `zoom-in-95`/`fade-in-0`/`slide-in-from-*` variants (see
  Plan 001 for the exact class lists per file). None of these are gated today.
- `Dialog`/`AlertDialog`/`Tooltip`/`HoverCard`/`Accordion` base components (not directly listed in
  the audit's file set but confirmed to use the same `animate-in`/`animate-out` convention —
  verify with `grep -rl "data-\[state=open\]:animate-in" src/components/ui` before editing).

`.glass-card` alone is used 102 times across 29 files (confirmed via
`grep -rc "glass-card" src` at commit a790988) but `.glass-card` itself
(`src/index.css:185-187`) has no transform/animation, so it needs no reduced-motion entry — this
is listed in the original finding as scale context, not something to gate directly.

`.material-card:hover`'s `transform: translateY(-2px)` (`src/index.css:246-249`) is already inside
the existing `.material-card` transition rule covered by the current block — Plan 003 handles
gating that hover behind `(hover: hover) and (pointer: fine)` separately; this plan only ensures
reduced-motion also disables its *movement*.

## Target

Per AUDIT.md §6: "Reduced motion means fewer and gentler animations, not zero — keep transitions
that aid comprehension, remove position changes." So the fix is NOT the blunt
`*, *::before, *::after { animation-duration: 0.01ms !important; ... }` global override — it's an
extension of the existing block's shape (target specific classes, neutralize `transform`, allow
`opacity` to remain) to also cover the classes identified above:

```css
/* target — src/index.css, replacing the block at lines 287-298 */
@media (prefers-reduced-motion: reduce) {
  .stagger-in > *,
  .animate-material-in {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
  .material-card,
  .press-scale {
    transition: none !important;
  }

  /* Tailwind-config keyframe utilities (tailwind.config.ts) */
  .animate-fade-in,
  .animate-slide-in,
  .animate-accordion-down,
  .animate-accordion-up {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }

  /* Radix overlay entrance/exit driven by tailwindcss-animate (Select, Popover, DropdownMenu,
     ContextMenu, Menubar, Sheet, NavigationMenu, Dialog, AlertDialog, Tooltip, HoverCard,
     Accordion — anything using data-[state]:animate-in/animate-out) */
  [data-state="open"].animate-in,
  [data-state="closed"].animate-out,
  [class*="animate-in"],
  [class*="animate-out"] {
    animation-duration: 0.01ms !important;
    animation-delay: 0ms !important;
  }
}
```

`animate-pulse-glow` is intentionally NOT added — it only animates `box-shadow`, not
position/transform, so per AUDIT.md's own example
(`.element { animation: fade 0.2s ease; } /* keep opacity/color, drop movement */`) it is exactly
the kind of "gentler, comprehension-aiding" animation that should survive reduced-motion.

Using `animation-duration: 0.01ms !important` + `animation-iteration-count: 1 !important` (rather
than `animation: none !important`) for the Tailwind-keyframe and Radix classes preserves the
opacity/color end-state each keyframe already lands on (since the animation still runs, just
too fast to perceive movement, and finishes at its `to` frame) — this keeps comprehension-aiding
state changes (e.g., the popover still visibly appears) while eliminating the perceptible
translate/scale motion, matching the `.stagger-in`/`.animate-material-in` precedent already in
this file which explicitly sets `opacity: 1 !important` rather than hiding the element.

## Repo conventions to follow

- The existing reduced-motion block at `src/index.css:287-298` is the only precedent in the repo
  — match its `!important`-guarded, class-scoped style (not the global `*` selector approach)
  exactly, just extended with more class groups in the same block.
- Class-list selectors here follow the same `[class*="..."]` substring-match technique already
  implicit in how `tailwindcss-animate` classes compose (`animate-in`, `animate-out` are always
  present as standalone token classes, never only as part of a longer single class string) — this
  is safe because Tailwind emits `animate-in`/`animate-out` as literal space-separated class
  tokens in the compiled HTML `class` attribute, so `[class*="animate-in"]` reliably matches.

## Steps

1. Before editing, run `grep -rl "data-\[state=open\]:animate-in" src/components/ui` to confirm
   the full list of base components using this pattern (expected: at minimum select, popover,
   dropdown-menu, context-menu, menubar, sheet, navigation-menu, dialog, alert-dialog, tooltip,
   hover-card, accordion — if the list differs, note it but proceed; the `[class*="animate-in"]`
   selector in Step 2 is universal and doesn't require enumerating them individually).
2. In `src/index.css`, replace the existing block at lines 287-298 with the full target block
   shown above (existing 4-class coverage preserved verbatim, new rules appended inside the same
   `@media (prefers-reduced-motion: reduce) { ... }`).
3. Do not create a second `@media (prefers-reduced-motion: reduce)` block — there must remain
   exactly one in the file. Confirm with
   `grep -c "prefers-reduced-motion" src/index.css` — expect `1` (the block still opens with one
   `@media` declaration).

## Boundaries

- Do not remove or weaken any of the 4 existing covered selectors
  (`.stagger-in > *`, `.animate-material-in`, `.material-card`, `.press-scale`).
- Do not touch any component `.tsx` file — this is `src/index.css` only.
- Do not add the blunt global `*, *::before, *::after` override — AUDIT.md explicitly warns
  against nuking all feedback; scope to the identified classes only.
- Do not gate `.animate-pulse-glow` — it has no transform/position movement, only `box-shadow`.
- If `src/index.css` around line 287 doesn't match the verbatim block quoted in Problem (drift
  since commit a790988), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npm run build` completes with no CSS/PostCSS errors.
  `grep -c "prefers-reduced-motion" src/index.css` returns `1`.
- **Feel check**:
  - In Chrome DevTools, open Rendering panel, set "Emulate CSS media feature
    prefers-reduced-motion" to `reduce`.
  - Trigger a Select, Popover, DropdownMenu, and Sheet open/close — confirm they still visibly
    appear/disappear (opacity end-state reached) but without the scale/translate motion being
    perceptible.
  - Trigger a toast or any element using `animate-fade-in`/`animate-slide-in` (search
    `grep -rl "animate-fade-in\|animate-slide-in" src` for a live usage) — confirm same: appears,
    no slide/translate motion.
  - Confirm `.animate-pulse-glow` (if any live usage exists — check
    `grep -rl "pulse-glow" src`) is unaffected (still pulses) since it carries no position change.
  - Toggle `prefers-reduced-motion` back to `no-preference` and confirm all animations look
    exactly as they did before this change (regression check).
- **Done when**: reduced-motion is set, and no popover/select/dropdown/menu/sheet/dialog/toast
  shows a translate or scale motion, while all of them still successfully show/hide (opacity
  reaches its end state) — and with reduced-motion off, nothing changed from current behavior.
