# 010 — Define a shared duration-token scale (no mass rewrite)

- **Status**: TODO
- **Commit**: a790988
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens (§7)
- **Estimated scope**: 1 file for the token definitions (`src/index.css`), up
  to 3 files touched for the proof-of-concept application — intentionally the
  smallest/least-invasive plan in this batch.

## Problem

Bare Tailwind `duration-*` utilities are hand-picked per component with no
shared scale or naming convention distinguishing "press" vs "popover" vs
"dropdown" vs "modal" tiers, unlike AUDIT.md's duration budget table (button
press 100–160ms, tooltips/popovers 125–200ms, dropdowns/selects 150–250ms,
modals/drawers 200–500ms). A repo-wide grep for `duration-\d+` confirms
scattered, inconsistent values with no tier grouping:

```
src/components/ui/button.tsx:8             duration-150   (press)
src/components/ui/dialog.tsx:39            duration-200   (modal)
src/components/ui/alert-dialog.tsx:37      duration-200   (modal)
src/components/ui/accordion.tsx:31         duration-200   (disclosure chevron)
src/components/ui/navigation-menu.tsx:52   duration-200   (chevron rotate)
src/components/ui/sidebar.tsx:185          duration-200   (sidebar width, ease-linear)
src/components/ui/sidebar.tsx:195          duration-200   (sidebar position, ease-linear)
src/components/ui/sidebar.tsx:364          duration-200   (menu item margin/opacity, ease-linear)
src/components/ui/sheet.tsx:39             duration-300 (close) / duration-500 (open)
src/components/ui/input-otp.tsx:44         duration-1000  (caret blink — decorative, not UI feedback)
src/components/layout/AppLayout.tsx:69     duration-300   (main content margin, on sidebar toggle)
src/components/layout/AppSidebar.tsx:343   duration-300   (desktop sidebar width, on toggle)
src/components/tasks/TaskKanban.tsx:89     duration-150   (kanban column drop-target highlight)
src/components/layout/RevenueProgressBar.tsx:60,122,166   duration-700 / duration-500 / duration-700 (progress fills — see Plan 008)
src/pages/Index.tsx:162                    duration-500   (progress fill — see Plan 008)
src/pages/DesignPreview.tsx:72             duration-500   (progress fill — see Plan 008)
src/components/whatsapp/DisparoTab.tsx:535 duration-500   (progress fill — see Plan 008)
src/components/dashboard/HeroMetrics.tsx:96 duration-200  (card hover shadow/lift — see Plan 007 for its easing token)
```

This plan is intentionally **not** a mass rewrite of every value above — that
is out of proportion to a §7 cohesion finding. It scopes down to: (1) define
the token scale, (2) apply it as a small proof-of-concept to the handful of
files this same audit batch already touches, so the new tokens have at least
one real consumer and don't ship unused.

**Sequencing note**: this plan was written in the same batch as Plan 007
(`button.tsx` asymmetric press timing) and references Plan 004
(`AppSidebar.tsx`/`AppLayout.tsx`, presumably the sidebar-toggle transition —
not written by this author). As of this writing, `plans/004-*.md` does **not
exist yet** in `plans/`, and none of Plans 004/007/009's changes have been
applied to the live source files (verified: `button.tsx` still has its
pre-Plan-007 code, `AppLayout.tsx`/`AppSidebar.tsx` still have plain
`duration-300`). See Steps 2–3 for how the executor should re-check this at
execution time, since plan-writing and plan-execution may happen at different
times.

## Target

Add a duration-token block to `src/index.css`'s `:root`, immediately after
the existing motion-curve tokens (`--ease-out-apple`, `--ease-in-out-apple`,
and `--ease-drawer` if Plan 009 has already run — see Steps). Each token maps
to one AUDIT.md tier, and its value is picked to match this codebase's
already-most-common value in that tier (so defining the token changes
nothing visually anywhere it isn't yet wired up):

```css
/* src/index.css:78-81 — target, new block added after the existing motion curves */
    /* Apple-style motion curves (apple-design skill) */
    --ease-out-apple: cubic-bezier(0.23, 1, 0.32, 1);
    --ease-in-out-apple: cubic-bezier(0.77, 0, 0.175, 1);

    /* Shared duration scale — maps to AUDIT.md's duration budget tiers.
       Consume via Tailwind arbitrary value syntax, e.g. duration-[var(--duration-press)].
       Defining these does not itself change any component; see plans/010 for
       the proof-of-concept consumers and plans/007/008/009 for related work. */
    --duration-press: 150ms;    /* Button press feedback — AUDIT budget 100-160ms. Matches button.tsx's/​.press-scale's pre-Plan-007 150-160ms baseline; Plan 007 makes Button/.press-scale press/release asymmetric (120ms/180ms) and supersedes this token for those two spots specifically. */
    --duration-popover: 200ms;  /* Tooltips, small popovers — AUDIT budget 125-200ms */
    --duration-dropdown: 200ms; /* Dropdowns, selects — AUDIT budget 150-250ms. Matches dialog.tsx/alert-dialog.tsx/accordion.tsx/navigation-menu.tsx/sidebar.tsx's existing duration-200 */
    --duration-modal: 300ms;    /* Modals, drawers, and drawer-like panels (e.g. sidebar collapse) — AUDIT budget 200-500ms. Matches AppLayout.tsx/AppSidebar.tsx's existing duration-300 and Sheet's duration-300 close */
```

## Repo conventions to follow

- `src/index.css:78-80` is the exemplar for this token group's location and
  comment style (see Plan 009, which adds `--ease-drawer` to the same block
  — if Plan 009 has already run, the duration-token block goes after
  `--ease-drawer`, not after `--ease-in-out-apple`; check the live file).
- `ease-[var(--x)]` is the established pattern (per Plans 007/009) for
  consuming a token from a Tailwind arbitrary value inside a `cva()` or
  className string; the identical mechanism works for duration:
  `duration-[var(--duration-press)]`.

## Steps

1. `src/index.css` — add the duration-token block shown in Target,
   immediately after the last existing motion-curve token in `:root`. Check
   the live file first: if Plan 009 has already executed, `--ease-drawer`
   will already be present — insert the new block after it instead of after
   `--ease-in-out-apple`. Either placement is correct; just don't duplicate
   or reorder the existing tokens.

2. **Proof-of-concept, part A — `src/components/ui/button.tsx`**: check the
   live file's `buttonVariants` base string.
   - If it still contains the literal Tailwind class `duration-150` (i.e.
     Plan 007 has not yet executed), replace `duration-150` with
     `duration-[var(--duration-press)]`. This is a pure token-wiring change —
     both compile to `transition-duration: 150ms`, so it is a visual no-op by
     itself.
   - If Plan 007 has already executed, `button.tsx` will instead contain the
     `btn-press` class (from `src/index.css`) and no bare `duration-150` —
     in that case, skip editing `button.tsx` (there is nothing to wire; Plan
     007's asymmetric 120ms/180ms values intentionally supersede a single
     flat token for this element). Instead, add a one-line comment directly
     above the `.btn-press` rule in `src/index.css` noting it supersedes
     `--duration-press` for `Button` specifically, e.g.:
     ```css
     /* Supersedes --duration-press (150ms) for Button specifically — see plans/007. */
     .btn-press { ... }
     ```

3. **Proof-of-concept, part B — `src/components/layout/AppLayout.tsx:69` and
   `src/components/layout/AppSidebar.tsx:343`**: check whether
   `plans/004-*.md` now exists.
   - If it does **not** exist yet, or exists but has not been executed against
     these two files (i.e. they still contain the plain literal
     `transition-all duration-300`), replace `duration-300` with
     `duration-[var(--duration-modal)]` in both files (again a visual no-op —
     both compile to `transition-duration: 300ms`).
   - If Plan 004 has already executed and produced a different duration value
     for these files, STOP before editing them — align `--duration-modal`'s
     value in `src/index.css` (Step 1) to whatever Plan 004 landed on instead
     of 300ms, then wire `duration-[var(--duration-modal)]` in using that
     already-updated value. Do not silently overwrite Plan 004's work with a
     conflicting 300ms.

## Boundaries

- Do NOT rewrite every `duration-*` occurrence listed in the Problem section
  — only the ≤3 files named in Steps 2–3 get a functional edit. The rest are
  listed for context/future work only.
- Do NOT invent new tiers beyond the four listed (`--duration-press`,
  `--duration-popover`, `--duration-dropdown`, `--duration-modal`) — if a
  future consumer doesn't cleanly fit one of these four, that's a signal for
  a follow-up plan, not a reason to expand this one.
- Do NOT touch `RevenueProgressBar.tsx`, `Index.tsx`, `DesignPreview.tsx`,
  `DisparoTab.tsx`, `Equipe.tsx`, `ProductGoalsSection.tsx`,
  `ImplementationDetailSheet.tsx`, or `Implementacoes.tsx`'s progress-bar
  durations — those are Plan 008's `duration-300` transform-based rewrite,
  a different concern; don't pre-empt it here.
- Do NOT touch `input-otp.tsx`'s `duration-1000` caret blink — decorative,
  constant-motion, not a UI-feedback duration this scale is meant to cover.
- Do NOT touch `TaskKanban.tsx`'s `duration-150` drop-target highlight,
  `HeroMetrics.tsx`'s `duration-200` hover lift, or any `sidebar.tsx`/
  `accordion.tsx`/`navigation-menu.tsx`/`dialog.tsx`/`alert-dialog.tsx`/
  `sheet.tsx` duration — listed in Problem for context only, left as
  hardcoded values, explicitly deferred to future work.
- If Step 2 or Step 3's live-file check doesn't match either branch described
  (i.e. genuine drift beyond "Plan 007/004 ran or didn't"), STOP and report
  instead of improvising.

## Verification

- **Mechanical**: `npx tsc --noEmit`, `npm run lint`, `npm run build` — all
  should succeed.
- **Feel check**:
  - Confirm the token additions in `src/index.css` alone produce zero visual
    change anywhere (they're unused until wired up) — diff the rendered app
    before/after Step 1 with DevTools open, nothing should differ.
  - After Step 2 (whichever branch applied), confirm `Button`'s press
    feedback timing is unchanged from before this plan (150ms flat, or
    Plan 007's 120ms/180ms asymmetric — whichever was already live).
  - After Step 3, confirm the sidebar-collapse animation (`AppLayout.tsx` /
    `AppSidebar.tsx`, toggled via the hamburger/menu button) still takes
    exactly 300ms (or whatever Plan 004 set, if it ran first) — no visible
    change, only the source of the duration value changed from a literal to
    a token reference.
  - Inspect computed styles in DevTools on the sidebar toggle and on a
    `Button` press to confirm `transition-duration` resolves to the same
    numeric value as `var(--duration-press)` / `var(--duration-modal)`
    respectively (i.e. the CSS variable is actually being read, not just
    defined and ignored).
- **Done when**: `src/index.css` defines all four duration tokens with
  AUDIT.md-tier comments, and at least `button.tsx` (or `.btn-press`'s
  comment) and `AppLayout.tsx`/`AppSidebar.tsx` reference them per the
  branch logic in Steps 2–3, with zero visible behavior change anywhere.
