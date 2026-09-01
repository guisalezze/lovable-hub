# 001 — Investigate (and fix if confirmed) Radix overlay open/close keyframe restart

- **Status**: INVESTIGATED — no fix needed
- **Commit**: a790988
- **Severity**: HIGH
- **Category**: Interruptibility (AUDIT.md §4)
- **Estimated scope**: 7 files investigated; 0–7 files edited depending on Step 1's finding (Select, Popover, DropdownMenu, ContextMenu, Menubar Content/SubContent only — NOT Sheet or NavigationMenu, see Boundaries)

## Problem

All Radix `*Content` primitives in this codebase open/close via `tailwindcss-animate`'s
`data-[state=open]:animate-in data-[state=closed]:animate-out` utilities. These compile to
`@keyframes`-based CSS animations (`enter`/`exit` keyframes with `--tw-enter-*`/`--tw-exit-*`
custom properties), not `transition`s. Per AUDIT.md §4 (Interruptibility):

> CSS transitions retarget from the current state mid-animation; keyframes restart from zero.
> Anything triggered rapidly or reversible mid-motion... must use transitions or springs.

Radix's own state machine (`data-state=open|closed`) unmounts/remounts correctly, so the
components don't leak — the concern is purely visual: if a user closes and reopens a Select or
Popover fast enough that the exit keyframe is still running, the entrance keyframe restarts from
its `0%` frame (`opacity: 0, scale: 0.95, translate offset`) instead of continuing smoothly from
wherever the exit had gotten to, producing a visible pop/jump.

Verbatim current code (all confirmed live against the repo, commit a790988):

```tsx
// src/components/ui/select.tsx:66-73 — SelectContent
className={cn(
  "relative z-[110] max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
  position === "popper" &&
    "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
  className,
)}
```

```tsx
// src/components/ui/popover.tsx:19-22 — PopoverContent
className={cn(
  "z-[110] w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
  className,
)}
```

```tsx
// src/components/ui/dropdown-menu.tsx:63-66 — DropdownMenuContent (SubContent at line 47 is identical minus shadow-lg vs shadow-md)
className={cn(
  "z-[110] min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
  className,
)}
```

```tsx
// src/components/ui/context-menu.tsx:62-65 — ContextMenuContent (note the stray extra "animate-in fade-in-80" before the data-[state] classes; SubContent at line 47 lacks that extra pair)
className={cn(
  "z-[110] min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
  className,
)}
```

```tsx
// src/components/ui/menubar.tsx:90-93 — MenubarContent (SubContent at line 72 includes data-[state=open]:animate-in AND data-[state=closed]:animate-out; MenubarContent itself is MISSING data-[state=closed]:animate-out — only entrance is keyframed, exit has no animate-out class at all)
className={cn(
  "z-50 min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
  className,
)}
```

`sheet.tsx` (SheetOverlay:22, sheetVariants:39) and `navigation-menu.tsx` (Content:66,
Viewport:83, Indicator:100) use the same `animate-in`/`animate-out` pattern but are **out of
scope** for this plan — see Boundaries.

Select and Popover alone are imported in 32 files across the app and are opened/closed by users
many times per session, so this is exactly the "triggered rapidly" case AUDIT.md flags. But
Radix's own dismiss-on-outside-click / dismiss-on-select behavior means most real usage is
open → (user reads/picks) → close, not rapid re-triggering — so whether the keyframe-restart is
actually *visible* in practice needs to be checked before doing a risky rewrite of 5 shared base
components used almost everywhere in the app.

## Target

**Step 1 is investigation, not a code change.** Its outcome decides whether Steps 2+ (the actual
fix) happen at all.

- **If Step 1 finds no visible problem**: no code changes. Update this plan's Status header to
  `INVESTIGATED — no fix needed` and add one sentence under Problem describing what was observed
  (e.g. "Rapid-toggled Select/Popover in DevTools at 10% playback speed: no visible jump —
  Radix's click-outside dismissal means real re-open never lands mid-exit-animation.").
- **If Step 1 finds a visible flicker/restart-from-zero**: apply the minimal fix below to
  `SelectContent`, `PopoverContent`, `DropdownMenuContent`, `DropdownMenuSubContent`,
  `ContextMenuContent`, `ContextMenuSubContent`, `MenubarContent`, `MenubarSubContent` only
  (Sheet and NavigationMenu stay out of scope). Convert **exit only** from `animate-out`
  keyframes to a `data-state`-driven CSS transition, keeping entrance (`animate-in`) as the
  existing keyframes:

```tsx
/* target — e.g. src/components/ui/popover.tsx PopoverContent */
className={cn(
  "z-[110] w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none " +
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 " +
  "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 " +
  "transition-[opacity,transform] duration-150 ease-in data-[state=closed]:opacity-0 data-[state=closed]:scale-95",
  className,
)}
```

The exit duration (150ms) and scale target (0.95) match the existing `zoom-out-95` keyframe's own
values (`tailwindcss-animate` scales to 95% by default) so the visual distance doesn't change —
only how it's driven (transition vs keyframe) changes. Content/Portal unmount timing is controlled
by Radix's own `data-state` + `forceMount`/presence machinery, which already waits for CSS
animations *or* transitions to finish (it listens for `animationend`/`transitionend`), so swapping
exit to a transition does not require touching the Portal/Presence wiring.

## Repo conventions to follow

- Tailwind arbitrary/data-variant classes are composed via `cn(...)` exactly as already done in
  every file listed above — keep using `cn()`, don't switch to inline styles or CSS modules.
- Duration/easing values in this codebase are otherwise expressed as Tailwind arbitrary values
  (e.g. `src/components/dashboard/HeroMetrics.tsx:96` uses
  `duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]`) — if Step 2+ fires, match that convention
  (`duration-150`, plain `ease-in` is acceptable here per AUDIT.md's exit guidance since exits use
  ease-out normally, but AUDIT.md's easing table says entering/exiting → `ease-out`; use
  `ease-out` not `ease-in` for the exit transition — see Steps for the corrected value).

## Steps

1. **Investigate first — no file edits yet.** Run the app locally (`npm run dev` or the project's
   existing dev script), open a page with a `Select` (e.g. any form using `src/components/ui/select.tsx`)
   and a page with a `Popover` (e.g. `NotificationPopover` in `src/components/layout/AppLayout.tsx:98`).
   For each:
   - Open DevTools → Rendering panel → Animations, set playback speed to 10%.
   - Rapidly click to open, then immediately click again to close, then immediately reopen,
     repeating within roughly 100ms of each toggle (fast repeated clicks / spacebar-Enter on the
     trigger).
   - Watch the Animations panel and the actual element: does the entrance visibly "pop" or jump
     back to its 0%-keyframe start (scale 0.95, opacity 0) mid-way through an in-progress exit,
     rather than smoothly continuing from wherever it was?
   - Repeat once more for a DropdownMenu (e.g. any `DropdownMenuContent` usage) since it has the
     same pattern and is also high-frequency.
   Record the observation plainly (yes/no + one sentence) before proceeding.
2. **If no visible problem was observed**, stop here. Edit this plan file's own `Status` header
   (top of this document) from `TODO` to `INVESTIGATED — no fix needed`, and append the one-line
   observation from Step 1 to the end of the Problem section. Do not touch any component file.
   Skip Steps 3–5.
3. **If a visible problem was observed**, edit `src/components/ui/select.tsx`'s `SelectContent`
   (around line 66-73): split the single `data-[state=open]:animate-in data-[state=closed]:animate-out
   data-[state=closed]:fade-out-0 ... data-[state=closed]:zoom-out-95 ...` string so that
   `data-[state=open]:*` entrance classes (`animate-in`, `fade-in-0`, `zoom-in-95`,
   `slide-in-from-*`) stay as-is, and the `data-[state=closed]:*` exit classes (`animate-out`,
   `fade-out-0`, `zoom-out-95`) are replaced with:
   `transition-[opacity,transform] duration-150 ease-out data-[state=closed]:opacity-0 data-[state=closed]:scale-95`.
   Keep the `data-[side=*]:slide-in-from-*` entrance-only classes untouched (they only apply on
   `data-[state=open]`, Radix doesn't add `data-side` on the closed frame in a way that conflicts).
4. Repeat the same transformation (entrance keyframes kept, exit classes swapped for the
   `transition-[opacity,transform] duration-150 ease-out data-[state=closed]:opacity-0 data-[state=closed]:scale-95`
   pattern) in: `src/components/ui/popover.tsx` (`PopoverContent`, line ~19-22),
   `src/components/ui/dropdown-menu.tsx` (`DropdownMenuContent` line ~63-66 and
   `DropdownMenuSubContent` line ~46-49), `src/components/ui/context-menu.tsx`
   (`ContextMenuContent` line ~62-65 — also drop the stray leading `animate-in fade-in-80` since it
   duplicates `data-[state=open]:animate-in data-[state=open]:fade-in-0` — and `ContextMenuSubContent`
   line ~46-49), `src/components/ui/menubar.tsx` (`MenubarContent` line ~90-93 and
   `MenubarSubContent` line ~71-74).
5. After edits, grep each edited file for `data-[state=closed]:animate-out` to confirm none remain
   or for typos (`git grep -n "animate-out" src/components/ui/select.tsx src/components/ui/popover.tsx src/components/ui/dropdown-menu.tsx src/components/ui/context-menu.tsx src/components/ui/menubar.tsx`).

## Boundaries

- Do NOT touch `src/components/ui/dialog.tsx` or `src/components/ui/alert-dialog.tsx` — not in
  this finding's scope.
- Do NOT touch `src/components/ui/sheet.tsx` or `src/components/ui/navigation-menu.tsx` — listed
  in the original finding but explicitly excluded here: Sheet's slide is directional and
  distance-based (`slide-in-from-left`/`slide-out-to-left` etc.) rather than a fixed-scale
  fade+zoom, so it needs its own investigation/plan if a problem is later confirmed there;
  NavigationMenu's `data-[motion^=from-]`/`data-[motion^=to-]` pattern is structurally different
  (direction-aware, not simple open/closed) and out of scope.
- Do NOT introduce a new animation library (no Framer Motion, no react-spring).
- Do NOT remove `tailwindcss-animate` from `tailwind.config.ts` — only change how individual
  `*Content` components' exit state uses it.
- Do NOT change entrance (`animate-in`) behavior in Steps 3-4 — only exit.
- If Step 1's observation is ambiguous, err toward NOT fixing (Step 2) and note the ambiguity —
  a risky rewrite across 5 shared components is not justified by an uncertain finding.
- If the code found in any file doesn't match the verbatim excerpts in Problem (drift since
  commit a790988), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npm run build` (or the repo's existing typecheck/build script) completes with
  no new TypeScript or build errors. `npm run lint` if present, expect no new violations.
- **Feel check** (only relevant if Steps 3-5 ran):
  - Open and rapidly re-toggle a Select, Popover, DropdownMenu, ContextMenu, and Menubar item —
    confirm entrance still animates in the same way as before (unaffected).
  - Confirm exit now fades/scales down smoothly and, when interrupted by a rapid reopen, the
    reopen continues visually from the interrupted state rather than snapping.
  - In DevTools, set playback to 10% (Animations panel) and confirm the closed→open transition on
    a rapid re-trigger does not visibly "reset to zero."
  - Toggle `prefers-reduced-motion` (Rendering panel) and confirm the exit transition still
    respects the existing reduced-motion rules (covered by Plan 002 — after that plan lands,
    re-check that `transition-[opacity,transform]` on these components is included in the
    expanded reduced-motion block).
- **Done when**: either (a) Status is updated to `INVESTIGATED — no fix needed` with the
  observation recorded and zero component files touched, or (b) all 5 files in Step 4 have exit
  classes converted to the transition pattern, the mechanical build passes, and the feel check
  confirms no restart-from-zero on rapid re-trigger.
