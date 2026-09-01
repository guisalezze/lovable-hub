# 013 — Give task-completion checkbox and title a small motion budget

- **Status**: TODO
- **Commit**: a790988
- **Severity**: LOW-MEDIUM
- **Category**: Missed opportunities (AUDIT.md §8)
- **Estimated scope**: 2 files (`src/components/ui/checkbox.tsx`, `src/components/tasks/TaskListView.tsx`), 3 line changes

## Problem

Marking a task complete is a small, frequent "success" moment in this CRM, and it currently
spends zero motion budget anywhere along its path.

**1. `Checkbox` has no transition on its own state change or its checkmark icon:**

```tsx
// src/components/ui/checkbox.tsx:7-24 — current
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}>
      <Check className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
```

`data-[state=checked]:bg-primary` and `data-[state=checked]:text-primary-foreground` snap
instantly (no `transition` class on `Root`), and Radix's `Indicator` unmounts/mounts the `Check`
icon with no `animate-in`/`animate-out` at all — it just pops into existence.

**2. `TaskListView`'s title text swap is also untransitioned:**

```tsx
// src/components/tasks/TaskListView.tsx:73-76 — current
            <div className="min-w-0">
              <p className={`text-sm font-medium truncate ${task.status === "concluido" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                {task.title}
              </p>
```

The conditional `line-through text-muted-foreground` vs `text-foreground` className swap has no
`transition-colors`, so the text color (and the line-through, which can't itself be animated but
whose *color* can) changes instantly.

## Target

**1. `checkbox.tsx`** — add a background/border transition to `Root`, and gate a brief scale-in
on the `Indicator`'s checked state so the checkmark pops in with a bit of spring-like emphasis
rather than appearing instantly:

```tsx
/* target — src/components/ui/checkbox.tsx:7-24 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background transition-colors duration-150 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current data-[state=checked]:animate-in data-[state=checked]:zoom-in-50 duration-150")}>
      <Check className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
```

`zoom-in-50` (start at 50% scale, not `scale(0)`) is deliberately more pronounced than the
`zoom-in-95` used for larger surfaces like popovers (AUDIT.md §3's `0.9–0.97` guidance targets
panel-sized entrances) — at a 16px (`h-4 w-4`) icon size, a 95%-start scale-in is visually
indistinguishable from no animation at all; `zoom-in-50` is the smallest starting scale that
actually reads as motion at this size, and 150ms keeps it snappy rather than showy.

**2. `TaskListView.tsx`** — add `transition-colors duration-200` to the title `<p>`:

```tsx
/* target — src/components/tasks/TaskListView.tsx:73-76 */
            <div className="min-w-0">
              <p className={`text-sm font-medium truncate transition-colors duration-200 ${task.status === "concluido" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                {task.title}
              </p>
```

Per AUDIT.md's easing decision order, this is a hover/color-change-class state change, so plain
`ease` (Tailwind's `transition-colors` default timing function) is correct — no custom
`ease-out`/`ease-in-out` curve is introduced.

## Repo conventions to follow

- Gating an `animate-in` utility behind a Radix `data-[state=...]` value is already the
  established pattern for `*Content` primitives, e.g. `src/components/ui/dialog.tsx:39`:
  `"...data-[state=open]:animate-in data-[state=open]:zoom-in-95..."`. `CheckboxPrimitive`'s
  `Indicator` also receives a mirrored `data-state` attribute from `Root` (`checked` /
  `unchecked` / `indeterminate`), so `data-[state=checked]:animate-in
  data-[state=checked]:zoom-in-50` follows the exact same convention, just keyed to `checked`
  instead of `open`.
- Bare `transition-colors` (no explicit easing override) for hover/state color changes is
  already the convention elsewhere in this codebase — e.g. `src/pages/Leads.tsx:234`
  (`hover:border-primary/30 transition-colors`) and this same file's own row wrapper at
  `src/components/tasks/TaskListView.tsx:68` (`hover:border-primary/30 transition-colors`) — the
  title text transition added here matches that existing local convention rather than
  introducing a new easing token.
- Duration `150ms` for the checkbox (a tiny, extremely frequent control) and `200ms` for the
  title text both sit inside AUDIT.md's sub-300ms UI budget, biased toward the shorter end
  because task-completion happens "tens of times/day" per user in an active CRM session — per
  AUDIT.md §1, that frequency calls for removing/reducing motion, not adding a flourish; keep
  this brief and functional, not celebratory (celebratory motion is reserved for the genuinely
  rare sale-toast event in Plan 011).

## Steps

1. In `src/components/ui/checkbox.tsx`, add `transition-colors duration-150` to
   `CheckboxPrimitive.Root`'s className string (line 14), placed after
   `"...ring-offset-background"` and before `"data-[state=checked]:bg-primary"`, so the token
   order reads: `"peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background
   transition-colors duration-150 data-[state=checked]:bg-primary
   data-[state=checked]:text-primary-foreground focus-visible:outline-none
   focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
   disabled:cursor-not-allowed disabled:opacity-50"`.
2. In the same file, add `data-[state=checked]:animate-in data-[state=checked]:zoom-in-50
   duration-150` to `CheckboxPrimitive.Indicator`'s className (line 19), so it reads:
   `cn("flex items-center justify-center text-current data-[state=checked]:animate-in
   data-[state=checked]:zoom-in-50 duration-150")`.
3. In `src/components/tasks/TaskListView.tsx`, add `transition-colors duration-200` to the title
   `<p>`'s template-literal className (line 74), so the static prefix reads
   `` `text-sm font-medium truncate transition-colors duration-200 ${...}` `` (the conditional
   `line-through text-muted-foreground` / `text-foreground` portion is unchanged).

## Boundaries

- Do NOT touch `toggleComplete` or `useUpdateTask`'s mutation logic in
  `src/components/tasks/TaskListView.tsx` — className/animation only.
- Do NOT change `Checkbox`'s props/API surface (no new props added) — only its internal
  className strings.
- Do NOT add motion to the status `Badge`, priority text, or due-date column in
  `TaskListView.tsx` — scope is the checkbox and the title text only, per this finding.
- Do NOT introduce a celebratory/bouncy animation (no confetti, no large scale, no multi-step
  keyframe) — per AUDIT.md §1's frequency guidance, this is a "tens of times/day" interaction
  and must stay subtle.
- If the code found in either file doesn't match the verbatim excerpts above (drift since commit
  a790988), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npm run build` completes with no new TypeScript/build errors. `npm run lint`
  reports no new violations.
- **Feel check**:
  - Open a task list (e.g. `/tarefas` or wherever `TaskListView` is mounted), click a task's
    checkbox — confirm the checkbox background fades to `primary` color over ~150ms rather than
    snapping, and the checkmark icon pops in with a brief, subtle scale rather than appearing
    instantly.
  - Confirm the title text's color/line-through transitions smoothly over ~200ms rather than
    snapping.
  - Uncheck the same task — confirm the reverse (background fade back to unchecked, checkmark
    disappearing, title color reverting) doesn't look broken or jarring; Radix unmounts the
    `Indicator` on uncheck so there is no equivalent zoom-*out* — verify this reads as acceptable
    (an instant checkmark disappearance paired with an animated background fade is a reasonable,
    common asymmetry and not a regression).
  - Click several checkboxes in quick succession (as a user checking off a list would) — confirm
    the motion feels quick and unobtrusive, not like it's slowing down bulk completion.
  - In DevTools, set playback to 10% (Animations panel) and confirm the checkmark's scale-in
    starts from a visibly-smaller-but-not-zero size.
  - Toggle `prefers-reduced-motion` (Rendering panel): the checkbox's `zoom-in-50` entrance
    should be suppressed if the browser respects `prefers-reduced-motion` for `animate-in`'s
    underlying keyframe (there is no explicit reduced-motion override added by this plan for
    this specific class, matching the codebase's existing lack of one for other bare
    `animate-in` usages — note as a shared pre-existing gap if the icon still animates under
    reduced motion, same caveat as Plan 012).
- **Done when**: checking/unchecking a task visibly transitions the checkbox's color and
  checkmark, and the title text's completed-state styling fades rather than snaps, all within
  150-200ms.
