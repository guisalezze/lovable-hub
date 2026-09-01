# 006 — Make hover-only action buttons reachable on touch and keyboard

- **Status**: TODO
- **Commit**: a790988
- **Severity**: HIGH
- **Category**: Accessibility (functional, not purely cosmetic)
- **Estimated scope**: 6 files, 7 locations, className-only edits

## Problem

Several non-decorative, functional controls are hidden by default via `opacity-0
group-hover:opacity-100 transition-opacity` (or the equivalent inline on the
element itself) with **no keyboard-focus fallback and no touch/coarse-pointer
fallback**. `:hover` never fires on a real touch tap (only a synthetic
hover-then-click on first tap on some browsers, which is unreliable and differs
by OS), so on phones/tablets these controls can be effectively invisible and
unreachable: users cannot see or activate them at all. Keyboard users tabbing
through the page also can't see the control light up until it already has
focus, because nothing reveals it before then in most of these spots either.

This is a functional accessibility bug, not a polish item — real product
functionality (changing a lead's status, calling/emailing a lead, deleting a
manual expense, editing a paid amount, removing a file, opening a copy
project's menu, removing a checklist item) is unreachable on touch devices.

One file already has a **partial** correct pattern worth imitating for the
focus half of the fix — `src/components/ui/toast.tsx:70` (its `ToastClose`
button):

```tsx
// src/components/ui/toast.tsx:69-71 — current, partial mitigation (focus only)
"absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity group-hover:opacity-100 group-[.destructive]:text-red-300 hover:text-foreground group-[.destructive]:hover:text-red-50 focus:opacity-100 focus:outline-none focus:ring-2 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600",
```

Note it has `focus:opacity-100` (good — keyboard users can reveal it) but still
has no touch/coarse-pointer fallback, so it is not a complete fix. It is
explicitly **out of scope** for this plan (see Boundaries) — the 7 locations
below are the current findings.

### The 7 locations (verified against the live files at commit a790988)

**1. `src/pages/Leads.tsx:263`** — WhatsApp/Call/Copy-email/Copy-phone/Billet
action row (wrapper `<div>` around several focusable buttons/links):

```tsx
// src/pages/Leads.tsx:263 — current
<div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
```

**2. `src/pages/Leads.tsx:288-294`** — per-card status-change buttons (opacity
classes live directly on each `<button>`, inside the `.map()`):

```tsx
// src/pages/Leads.tsx:287-295 — current
{columns.filter(c => c.status !== lead.status).map(c => (
  <button
    key={c.status}
    onClick={(e) => { e.stopPropagation(); handleStatusChange(lead.id, c.status); }}
    className={`text-[9px] px-1.5 py-0.5 rounded ${c.color} opacity-0 group-hover:opacity-100 transition-opacity`}
  >
    {c.label}
  </button>
))}
```

**3. `src/pages/Financeiro.tsx:479-496`** — delete-expense icon button:

```tsx
// src/pages/Financeiro.tsx:479-482 — current
<Button
  variant="ghost"
  size="icon"
  className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
  onClick={async () => { /* ... */ }}
>
```

**4. `src/pages/Implementacoes.tsx:132-139`** — edit-paid-amount pencil button
(inside `ImplementationCard`):

```tsx
// src/pages/Implementacoes.tsx:132-137 — current
<Button
  size="sm" variant="ghost"
  className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
  onClick={() => { setPaidInput(String(impl.paid_amount ?? 0)); setEditingPaid(true); }}
  title="Atualizar valor recebido"
>
```

**5. `src/pages/CopyProjectDetail.tsx:177-184`** — remove-reference-file
button (positioned `absolute` inside a `relative group` card):

```tsx
// src/pages/CopyProjectDetail.tsx:177-184 — current
<Button
  variant="ghost"
  size="icon"
  className="h-6 w-6 absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-destructive"
  onClick={() => removeFile.mutate({ id: f.id, fileUrl: f.file_url })}
>
  <Trash2 className="h-3 w-3" />
</Button>
```

**6. `src/pages/Copies.tsx:83-88`** — per-project item-options menu trigger
(`DropdownMenuTrigger asChild` wrapping a `Button`):

```tsx
// src/pages/Copies.tsx:84-87 — current
<DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
    <MoreVertical className="h-4 w-4" />
  </Button>
</DropdownMenuTrigger>
```

**7. `src/components/tasks/TaskModal.tsx:203-212`** — remove-checklist-item
button:

```tsx
// src/components/tasks/TaskModal.tsx:203-212 — current
{checklist.map((item, i) => (
  <div key={i} className="flex items-center gap-2 group">
    <button onClick={() => toggleCheckItem(i)} className="shrink-0">
      <CheckSquare className={`h-4 w-4 ${item.done ? "text-success" : "text-muted-foreground"}`} />
    </button>
    <span className={`text-sm flex-1 ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{item.text}</span>
    <button onClick={() => removeCheckItem(i)} className="opacity-0 group-hover:opacity-100">
      <Trash2 className="h-3 w-3 text-destructive" />
    </button>
  </div>
))}
```

## Target

Tailwind 3.4.17 is installed (`package.json` — `"tailwindcss": "^3.4.17"`),
which supports arbitrary-variant syntax with a raw `@media` query, e.g.
`[@media(hover:hover)_and_(pointer:fine)]:opacity-0` (underscores become
spaces; this compiles to `@media (hover: hover) and (pointer: fine) { .the-class { opacity: 0 } }`).
This lets every location be fixed with a className-only change — no
`tailwind.config.ts` edit required, and no shared component change.

The end-state pattern per element:

- **Default (no variant prefix)**: `opacity-100` — the control is simply
  always visible. This is the safe fallback for coarse-pointer/no-hover
  devices (touch phones/tablets), since there is no reliable "reveal on tap"
  affordance otherwise.
- **Under `(hover: hover) and (pointer: fine)`** (i.e. real mouse/trackpad):
  `opacity-0`, revealed via `group-hover:opacity-100` and `focus:opacity-100`
  (or `focus-within:opacity-100` on the wrapper, for location 1 where the
  hidden element is a wrapper around several independently-focusable
  children).

### 1. `src/pages/Leads.tsx:263` (wrapper — use `focus-within`)

```tsx
// target
<div className="flex items-center gap-1 mt-2 opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:transition-opacity [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:focus-within:opacity-100">
```

### 2. `src/pages/Leads.tsx:291` (status-change button — use `focus`)

```tsx
// target
className={`text-[9px] px-1.5 py-0.5 rounded ${c.color} opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:transition-opacity [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:focus:opacity-100`}
```

### 3. `src/pages/Financeiro.tsx:482`

```tsx
// target
className="h-7 w-7 opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:focus:opacity-100 text-destructive hover:text-destructive"
```

### 4. `src/pages/Implementacoes.tsx:134`

```tsx
// target
className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:transition-opacity [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:focus:opacity-100"
```

### 5. `src/pages/CopyProjectDetail.tsx:180`

```tsx
// target
className="h-6 w-6 absolute top-1 right-1 opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:focus:opacity-100 text-destructive"
```

### 6. `src/pages/Copies.tsx:85`

```tsx
// target
<Button variant="ghost" size="icon" className="h-7 w-7 opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:focus:opacity-100">
```

### 7. `src/components/tasks/TaskModal.tsx:209`

```tsx
// target
<button onClick={() => removeCheckItem(i)} className="opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:focus:opacity-100">
```

## Repo conventions to follow

- Tailwind arbitrary variants (`[...]:`) are already used elsewhere in this
  codebase for one-off CSS needs (e.g. `button.tsx`'s `ease-[cubic-bezier(...)]`,
  `[&_svg]:pointer-events-none`), so `[@media(...)]:` is consistent with
  existing patterns — no new tooling or config required.
- `src/components/ui/toast.tsx:70` is the closest existing exemplar for the
  focus half of this fix (`focus:opacity-100` alongside `group-hover:opacity-100`)
  — match that naming/ordering style (opacity-changing utilities grouped
  together) when placing the new classes.
- Every one of these 7 locations already sits inside an ancestor (or is
  itself) carrying the Tailwind `group` class — confirmed present at:
  `Leads.tsx:234` (`.glass-card ... group`), `Financeiro.tsx:460` (row `group`),
  `Implementacoes.tsx:72` (card `group`), `CopyProjectDetail.tsx:163`
  (`group relative`), `Copies.tsx:75` (`Card ... group`), `TaskModal.tsx:204`
  (`group`). No structural change is needed to add `group` anywhere.

## Steps

1. `src/pages/Leads.tsx:263` — replace the wrapper `<div>`'s className with
   the Target #1 string above.
2. `src/pages/Leads.tsx:291` — replace the status-button className template
   literal with the Target #2 string above.
3. `src/pages/Financeiro.tsx:482` — replace the delete-expense `Button`'s
   className with Target #3.
4. `src/pages/Implementacoes.tsx:134` — replace the edit-paid-amount
   `Button`'s className with Target #4.
5. `src/pages/CopyProjectDetail.tsx:180` — replace the remove-file `Button`'s
   className with Target #5.
6. `src/pages/Copies.tsx:85` — replace the dropdown-trigger `Button`'s
   className with Target #6.
7. `src/components/tasks/TaskModal.tsx:209` — replace the remove-checklist-item
   `<button>`'s className with Target #7.

## Boundaries

- Do NOT change any `onClick` handler, any button's children/icon, or any
  non-visibility className (e.g. leave `text-destructive`, `hover:text-foreground`,
  positioning classes like `absolute top-1 right-1` untouched — only add/replace
  the opacity-related classes).
- Do NOT touch `src/components/ui/toast.tsx` — it already has the `focus:opacity-100`
  partial mitigation; making its `ToastClose` fully touch-safe is future work,
  not this plan.
- Do NOT add a `tailwind.config.ts` custom variant (e.g. `addVariant`) — the
  arbitrary `[@media(...)]:` syntax is sufficient and keeps the change scoped
  to the 6 files above.
- Do NOT change markup/structure — className-only edits.
- If any location's current code doesn't match the "current" snippet quoted
  above (drift since commit a790988), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npx tsc --noEmit` (no type errors — these are className-only
  string edits, should be a no-op for the type checker), `npm run lint`
  (no new ESLint errors), `npm run build` (Vite build succeeds).
- **Feel check** (repeat for each of the 7 locations):
  - In Chrome DevTools, toggle device toolbar to a touch device (e.g. "iPhone
    14"). Confirm the control is visible immediately, with no hover needed.
  - Switch back to desktop/no-throttle mode with a real mouse. Confirm the
    control is invisible by default and fades in only on hover of its
    ancestor `group`, exactly as before this change.
  - Tab through the page with the keyboard only (no mouse). Confirm each
    control becomes visible the moment it (or, for location 1, any child
    inside the wrapper) receives focus — do not rely on a mouse hover to see
    it first.
  - For location 1 (Leads action row), confirm tabbing into the WhatsApp
    link, Call button, Copy buttons, or Billet link each independently
    reveals the whole row (via `focus-within`), not just the one focused
    child.
- **Done when**: all 7 locations render their control unconditionally
  visible under `(pointer: coarse)` or `(hover: none)`, and preserve the
  original hover-to-reveal + now-also-focus-to-reveal behavior under
  `(hover: hover) and (pointer: fine)`.
