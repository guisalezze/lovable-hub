# 009 — Sheet/drawer should use a dedicated drawer curve, not bare `ease-in-out`

- **Status**: TODO
- **Commit**: a790988
- **Severity**: MEDIUM
- **Category**: Easing & duration (§2)
- **Estimated scope**: 2 files, 1 token addition + 1 className edit

## Problem

`src/components/ui/sheet.tsx` (used as the mobile sidebar overlay and every
side-panel/drawer in the app — e.g. `ImplementationDetailSheet`,
`CopyVersionsDrawer`) animates in/out using Tailwind's bare `ease-in-out`,
which maps to the weak built-in CSS easing (`cubic-bezier(0.4, 0, 0.6, 1)`),
not a deliberately-tuned curve:

```tsx
// src/components/ui/sheet.tsx:38-55 — current
const sheetVariants = cva(
  "fixed z-[95] gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);
```

AUDIT.md §2 explicitly recommends a dedicated drawer curve as one of the
strong custom curves that should exist alongside the general-purpose ease-out
and ease-in-out tokens:

```css
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);     /* iOS-like drawer curve */
```

The current durations (`data-[state=closed]:duration-300` = close,
`data-[state=open]:duration-500` = open) are already within AUDIT.md's
200–500ms budget for modals/drawers — this is purely an easing-quality
finding, not a duration finding. Confirmed the token does not already exist
anywhere in the codebase (`src/index.css` currently only defines
`--ease-out-apple` and `--ease-in-out-apple`, at lines 79-80).

## Target

Add the drawer curve token to `src/index.css`'s `:root` block, in the same
section and using the same naming convention as the two existing motion-curve
tokens:

```css
/* src/index.css:78-81 — target (one line added) */
    /* Apple-style motion curves (apple-design skill) */
    --ease-out-apple: cubic-bezier(0.23, 1, 0.32, 1);
    --ease-in-out-apple: cubic-bezier(0.77, 0, 0.175, 1);
    --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1); /* iOS-like drawer curve (AUDIT.md §2) */
```

Replace the bare `ease-in-out` Tailwind class in `sheet.tsx` with the
arbitrary-value form referencing the new token (same `ease-[var(--x)]`
mechanism already used elsewhere in this codebase, e.g. `button.tsx`'s
`ease-[cubic-bezier(...)]`):

```tsx
// src/components/ui/sheet.tsx:39 — target
  "fixed z-[95] gap-4 bg-background p-6 shadow-lg transition ease-[var(--ease-drawer)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
```

No other line in `sheetVariants` changes.

## Repo conventions to follow

- `src/index.css:78-80` is the exemplar for where and how motion-curve tokens
  are declared (`:root`, grouped together, one-line comment above the group)
  — add `--ease-drawer` as the third line in that same group, don't create a
  new section.
- `ease-[var(--x)]` (Tailwind arbitrary value referencing a CSS custom
  property) is already the established pattern for consuming these tokens
  from a `cva()` base string in this codebase (see `button.tsx:8`'s
  `ease-[cubic-bezier(0.23,1,0.32,1)]`, which Plan 007 also converts to
  `ease-[var(--ease-out-apple)]` — same mechanism, different token).

## Steps

1. `src/index.css` — insert `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
   /* iOS-like drawer curve (AUDIT.md §2) */` as a new line directly after
   `--ease-in-out-apple` (line 80), inside the existing `:root` block.
2. `src/components/ui/sheet.tsx:39` — replace `ease-in-out` with
   `ease-[var(--ease-drawer)]` in the `sheetVariants` base class string.
   Leave every other class in that string (`duration-300`, `duration-500`,
   `animate-in`, `animate-out`, etc.) unchanged.

## Boundaries

- Do NOT change `data-[state=closed]:duration-300` or
  `data-[state=open]:duration-500` — durations are already within budget,
  only the easing curve changes.
- Do NOT touch `src/components/ui/dialog.tsx` (centered modal) — modals are
  exempt from drawer-specific easing concerns per AUDIT.md §3 ("Modals are
  exempt... `transform-origin: center` is correct there"); this plan is
  scoped to the slide-in/slide-out Sheet component only.
- Do NOT change the `slide-in-from-*`/`slide-out-to-*` Tailwind
  `animate-in`/`animate-out` utilities, the `side` variants, or any consumer
  of `Sheet`/`SheetContent` (`AppSidebar.tsx`, `ImplementationDetailSheet.tsx`,
  `CopyVersionsDrawer.tsx`, etc.) — the token swap in `sheet.tsx` propagates
  automatically to all of them; no per-consumer edits are needed or wanted.
- If `sheet.tsx`'s current code doesn't match the snippet quoted above (drift
  since commit a790988), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm run lint`, `npm run build` — all
  should succeed.
- **Feel check**:
  - Open the mobile sidebar (resize viewport below 768px, tap the hamburger
    menu) and confirm it slides in/out with a slightly different rhythm than
    before — the iOS-style curve (`cubic-bezier(0.32, 0.72, 0, 1)`) decelerates
    faster near the end than the generic `ease-in-out` did (compare by
    temporarily reverting the change if unsure).
  - Open any other Sheet-based panel (e.g. `ImplementationDetailSheet` from
    the Mentorias list, or `CopyVersionsDrawer` from a Copy item) and confirm
    the same curve is applied — the token change is global to all `Sheet`
    consumers via the shared `sheetVariants`.
  - In DevTools, set Animations panel playback to 10%, trigger a Sheet
    open/close, and confirm the motion still completes within the same
    300ms(close)/500ms(open) window as before — only the curve shape changed,
    not the duration.
  - Toggle `prefers-reduced-motion` (Rendering panel) and confirm the Sheet's
    existing `data-[state=open]:animate-in`/`animate-out` reduced-motion
    behavior (governed by `tailwindcss-animate`, unrelated to this change) is
    unaffected.
- **Done when**: `ease-in-out` no longer appears in `sheet.tsx`,
  `--ease-drawer` exists in `src/index.css`'s `:root` block next to the other
  two motion tokens, and every Sheet-based panel in the app visibly uses the
  new curve.
