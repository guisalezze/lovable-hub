# 005 — Add press feedback to primary sidebar navigation controls

- **Status**: TODO
- **Commit**: a790988
- **Severity**: HIGH
- **Category**: Physicality & origin (AUDIT.md §3 — "pressable elements with no press feedback")
- **Estimated scope**: 1 file (`src/components/layout/AppSidebar.tsx`), 5 distinct button/NavLink patterns

## Problem

Confirmed via `grep -n "active:" src/components/layout/AppSidebar.tsx` at commit a790988: no
matches. Every clickable control in the sidebar has only `hover:bg-sidebar-accent/50
transition-colors` (or equivalent) — no `:active` press feedback of any kind. This file is
clicked constantly by daily CRM users (project switching, navigation, logout). Per AUDIT.md §3:
"Press feedback: `transform: scale(0.97)` on `:active` with `transition: transform 160ms
ease-out`... Hunt for: ... pressable elements with no press feedback."

Verbatim current code for the 5 patterns in scope (all confirmed live against the repo):

```tsx
// src/components/layout/AppSidebar.tsx:97-107 — ProjectGroup toggle button
<button
  onClick={onToggle}
  className={cn(
    "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold w-full transition-colors",
    "hover:bg-sidebar-accent/50 text-sidebar-foreground"
  )}
>
```

```tsx
// src/components/layout/AppSidebar.tsx:117-135 — ProjectGroup's item-level NavLink (inside items.map())
// This is the "already have their own styling" exclusion mentioned in scope notes — checked here
// and confirmed it ALSO has no :active feedback (transition-colors only), so it IS in scope.
<NavLink
  key={`${project.slug}-${item.to}`}
  to={item.to}
  end={item.to === "/"}
  onClick={() => onSelectProject(project)}
  className={() =>
    cn(
      "flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
      isItemActive(item.to)
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
    )
  }
>
```

```tsx
// src/components/layout/AppSidebar.tsx:227-244 — Connect section NavLink (inside connectItems.map())
<NavLink
  key={item.to}
  to={item.to}
  end={false}
  className={({ isActive }) =>
    cn(
      "flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
      isActive
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
    )
  }
>
```

```tsx
// src/components/layout/AppSidebar.tsx:252-269 — sharedItems NavLink (inside sharedItems.map())
<NavLink
  key={item.to}
  to={item.to}
  end={item.to === "/"}
  className={({ isActive }) =>
    cn(
      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
      isActive
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
    )
  }
>
```

```tsx
// src/components/layout/AppSidebar.tsx:287-293 — logout button
<button
  onClick={handleLogout}
  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium w-full transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
>
```

Note: the admin-only "Novo projeto" button (`AppSidebar.tsx:211-217`) has the identical issue
(`hover:bg-sidebar-accent/50 ... transition-colors`, no `:active`) but is not one of the named
patterns in this plan's scope and is intentionally left untouched — flag for a follow-up plan if
desired.

## Target

Per AUDIT.md §3 and the repo's own existing `.press-scale` utility
(`src/index.css:251-257`, verbatim: `.press-scale { transition: transform 160ms
var(--ease-out-apple); } .press-scale:active { transform: scale(0.97); }`), add the `press-scale`
class to each of the 5 patterns above. `press-scale` is additive — it only adds a `transform`
transition and an `:active` rule, so it composes cleanly alongside each element's existing
`transition-colors` (both transitions run independently; Tailwind's `transition-colors` utility
sets `transition-property: color, background-color, border-color, ...` which does not include
`transform`, so there's no property collision).

```tsx
/* target — src/components/layout/AppSidebar.tsx:97-107 */
<button
  onClick={onToggle}
  className={cn(
    "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold w-full transition-colors press-scale",
    "hover:bg-sidebar-accent/50 text-sidebar-foreground"
  )}
>
```

```tsx
/* target — src/components/layout/AppSidebar.tsx:117-135, className function body */
className={() =>
  cn(
    "flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors press-scale whitespace-nowrap",
    isItemActive(item.to)
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
  )
}
```

```tsx
/* target — src/components/layout/AppSidebar.tsx:227-244, className function body */
className={({ isActive }) =>
  cn(
    "flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors press-scale whitespace-nowrap",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
  )
}
```

```tsx
/* target — src/components/layout/AppSidebar.tsx:252-269, className function body */
className={({ isActive }) =>
  cn(
    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors press-scale whitespace-nowrap",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
  )
}
```

```tsx
/* target — src/components/layout/AppSidebar.tsx:287-293 */
<button
  onClick={handleLogout}
  className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium w-full transition-colors press-scale text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
>
```

## Repo conventions to follow

- `.press-scale` is the existing in-repo utility for exactly this (`src/index.css:251-257`) — do
  not invent a new class or inline `active:scale-*` Tailwind utilities; use `press-scale` for
  consistency with its other consumer, e.g.
  `src/components/dashboard/OperationCards.tsx:90`:
  `className="material-card press-scale p-3 cursor-pointer"`.
- Keep `press-scale` alongside existing classes in the same string (space-separated), matching how
  `OperationCards.tsx:90` combines it with other utility classes in one string rather than a
  separate `cn()` argument.

## Steps

1. In `src/components/layout/AppSidebar.tsx`, edit the `ProjectGroup` toggle `<button>`'s
   `cn()` call (currently lines 99-102): in the first string argument, append `press-scale` after
   `transition-colors`, changing `"flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold w-full transition-colors"`
   to `"flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold w-full transition-colors press-scale"`.
2. In the same file, edit the `ProjectGroup` component's item-level `NavLink`'s `className`
   function body (currently lines 123-130, inside the `items.map()` at line 110): in the `cn()`
   call's first string argument, append `press-scale` after `transition-colors`, changing
   `"flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap"`
   to `"flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors press-scale whitespace-nowrap"`.
3. In the Connect section's `NavLink` template (currently lines 232-239, inside
   `connectItems.map()` at line 227), apply the same edit: change
   `"flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap"`
   to `"flex items-center gap-3 px-3 py-1.5 rounded-md text-sm font-medium transition-colors press-scale whitespace-nowrap"`.
4. In the `sharedItems` `NavLink` template (currently lines 257-264, inside
   `sharedItems.map()` at line 252), apply the same edit: change
   `"flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap"`
   to `"flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors press-scale whitespace-nowrap"`.
5. On the logout `<button>` (currently lines 288-290), edit its plain `className` string: change
   `"flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium w-full transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"`
   to
   `"flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium w-full transition-colors press-scale text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"`.

## Boundaries

- Do not change any hover styling (`hover:bg-sidebar-accent/50`, `hover:text-*`) — only add
  `press-scale` for the `:active` press feedback.
- Do not touch the admin-only "Novo projeto" button (`AppSidebar.tsx:211-217`) — flagged in
  Problem as a known additional instance but explicitly out of scope for this plan.
- Do not touch any other file — this is `AppSidebar.tsx` only.
- Do not modify `.press-scale`'s definition in `src/index.css` — consume it as-is.
- If the code found in the file doesn't match the verbatim excerpts in Problem (drift since
  commit a790988), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npm run build` completes with no TypeScript/build errors.
  `grep -c "press-scale" src/components/layout/AppSidebar.tsx` returns `5` (one per edited
  pattern; the item-level NavLink and Connect/sharedItems NavLinks are each one class-string
  occurrence per `.map()` template, not per rendered instance).
- **Feel check**:
  - Click (and mouse-down-hold) each of the 5 control types — project group toggle, an item-level
    NavLink inside an expanded project group, a Connect section NavLink, a shared item NavLink
    (Equipe/Configurações), and the logout button — and confirm each visibly shrinks slightly
    (`scale(0.97)`) while held down, and springs back on release.
  - In DevTools, set playback to 10% (Animations panel), press and hold one of the NavLinks, and
    confirm the scale-down transition takes ~160ms and uses a fast-starting ease-out curve
    (`cubic-bezier(0.23, 1, 0.32, 1)`, i.e. `--ease-out-apple`) rather than a linear or
    default-eased snap.
  - Confirm hover feedback (background tint) is unchanged from before this change — only press
    feedback was added.
  - Toggle `prefers-reduced-motion` (Rendering panel) and confirm `.press-scale`'s transition is
    disabled per the existing rule at `src/index.css:294-297` (`.material-card, .press-scale {
    transition: none !important; }`) — the element should no longer visibly scale on press, but
    should remain otherwise clickable.
- **Done when**: all 5 sidebar control patterns scale down on `:active` and back up on release,
  hover styling is unchanged, the build is clean, and reduced-motion still suppresses the scale
  transition per the pre-existing `.press-scale` reduced-motion rule.
