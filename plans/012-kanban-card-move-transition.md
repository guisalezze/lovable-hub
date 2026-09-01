# 012 — Give Kanban lead cards an entrance cue when their status changes

- **Status**: TODO
- **Commit**: a790988
- **Severity**: MEDIUM
- **Category**: Missed opportunities (AUDIT.md §8)
- **Estimated scope**: 1 file (`src/pages/Leads.tsx`), 2 line changes

## Problem

`LeadsPage` renders a 4-column Kanban board (`novo` / `quase_comprou` / `comprou` / `perdido`).
Clicking one of the per-card status buttons calls `handleStatusChange`, which calls
`updateStatus.mutate`:

```tsx
// src/pages/Leads.tsx:143-146 — current
  const handleStatusChange = (id: string, status: LeadStatus) => {
    updateStatus.mutate({ id, status });
    if (selectedLead?.id === id) setSelectedLead(prev => prev ? { ...prev, status } : null);
  };
```

`updateStatus` (`useUpdateLeadStatus`, lines 67-83) does an optimistic `setQueryData` update,
so on the very next render `getLeadsByStatus(status)` (line 136) simply reclassifies which
column's `.map()` includes the lead — the card disappears from its old column's list and
reappears in the new column's list with no transition explaining the move. This is a real
pipeline-progression event in a sales CRM (a lead moving toward "Comprou" or "Perdido"), and it
currently renders with zero motion.

The card's own className only transitions border color, nothing that would ease a reflow or
signal "this card just arrived here":

```tsx
// src/pages/Leads.tsx:228-235 — current
                  {colLeads.map((lead) => {
                    const sourceInfo = SOURCE_OPTIONS.find(s => s.value === lead.source);
                    return (
                      <div
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className="glass-card p-4 hover:border-primary/30 transition-colors cursor-pointer group"
                      >
```

## Target

True FLIP/shared-element animation across the two columns (the card visually sliding from the
old column's position to the new column's position) is out of scope for this plan — it would
require either a library (this codebase has none: no `framer-motion`, no
`react-flip-toolkit` in `package.json`) or nontrivial custom `getBoundingClientRect()` diffing
across a `.map()`-generated list, both too large for this finding.

The achievable, high-value slice: change the card's `key` so it includes `lead.status`. Today
`key={lead.id}` (line 232) means React treats the lead's `<div>` as the *same* DOM node across a
status change (Leads.tsx has no `columns.map()`-driven layout position for the id itself — the
element merely moves from one column's `colLeads.map()` output to another's; React's
reconciliation sees a brand-new list in the new column with no matching existing key there, and
an old list with the leftover key removed — so the node does technically unmount/remount across
columns already, but with no entrance class riding along, "mount" is invisible/instant). Adding
`fade-in-0 slide-in-from-top-1 duration-200` to that already-happening (re)mount gives it a
visible "arriving here" cue for free. Making the key `${lead.id}-${lead.status}` (rather than
leaving it as bare `lead.id`) additionally guarantees a fresh mount even in the (currently
already-true) cross-column case, and is a low-risk, explicit way to make React's remount
intentional rather than incidental:

```tsx
/* target — src/pages/Leads.tsx:228-235 */
                  {colLeads.map((lead) => {
                    const sourceInfo = SOURCE_OPTIONS.find(s => s.value === lead.source);
                    return (
                      <div
                        key={`${lead.id}-${lead.status}`}
                        onClick={() => setSelectedLead(lead)}
                        className="glass-card p-4 hover:border-primary/30 transition-colors cursor-pointer group animate-in fade-in-0 slide-in-from-top-1 duration-200"
                      >
```

`slide-in-from-top-1` is a small rem-based offset (Tailwind spacing scale `1` = `0.25rem`),
consistent with AUDIT.md §8's guidance to use `translate` utilities rather than hardcoded pixel
offsets, and deliberately subtler than the `slide-in-from-top-2` (`0.5rem`) used for
larger popover/dropdown entrances elsewhere in this codebase (see Repo conventions) — a Kanban
card is smaller and far more frequent than a dropdown open, so it gets a smaller nudge.

## Repo conventions to follow

- `animate-in`/`fade-in-*`/`slide-in-from-*` from `tailwindcss-animate` (declared in
  `tailwind.config.ts:161`, `require("tailwindcss-animate")`) are already used unconditionally
  on mount (not gated behind a `data-state`) in `src/components/ui/tooltip.tsx:20`
  (`animate-in fade-in-0 zoom-in-95`) — same pattern applies here: the lead card's entrance
  should play on every mount, no conditional gating needed since the `key` change is what
  controls when a mount happens.
- No explicit `ease-*` override is added, matching how every other `animate-in` usage in this
  codebase (`tooltip.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, etc.) relies on
  `tailwindcss-animate`'s built-in entrance easing rather than hand-specifying a curve — stay
  consistent, don't introduce a new one-off convention for this component.
- Duration `200ms` matches AUDIT.md's duration budget table ("Dropdowns, selects: 150–250ms") —
  a Kanban card arriving in a new column is a comparable small-UI-element entrance, not a modal.

## Steps

1. In `src/pages/Leads.tsx`, inside the `columns.map()` → `colLeads.map((lead) => { ... })` block
   (starting at line 228), change the outer card `<div>`'s `key` prop from `key={lead.id}`
   (line 232) to `key={`${lead.id}-${lead.status}`}`.
2. In the same `<div>`, append `animate-in fade-in-0 slide-in-from-top-1 duration-200` to the end
   of the existing `className` string (line 234), so the full className reads:
   `"glass-card p-4 hover:border-primary/30 transition-colors cursor-pointer group animate-in fade-in-0 slide-in-from-top-1 duration-200"`.
3. Leave every other prop/handler on the card (`onClick`, the inner content, the per-card status
   buttons at lines 286-296) untouched.

## Boundaries

- Do NOT attempt true FLIP/shared-element transitions across columns (no
  `getBoundingClientRect()` diffing, no library) — explicitly out of scope for this plan.
- Do NOT add a new dependency (no `framer-motion`, no `react-flip-toolkit`, no `react-spring`).
- Do NOT change `getLeadsByStatus`, `useUpdateLeadStatus`'s optimistic-update logic, or
  `handleStatusChange` — this plan is a className/key change only.
- Do NOT apply the same `key`/className change to `LeadDetailModal`'s internal rendering or any
  other list in this file (e.g. don't touch the loading-skeleton grid at lines 206-209) — scope
  is the Kanban card `<div>` at line 231-235 only.
- If the code found in `Leads.tsx` doesn't match the verbatim excerpts above (drift since commit
  a790988), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npm run build` completes with no new TypeScript/build errors. `npm run lint`
  reports no new violations.
- **Feel check**:
  - Open `/leads`, click one of the small status-change buttons on a lead card (bottom of the
    card, e.g. "Comprou") — confirm the card now visibly fades/slides in slightly from above in
    its new column, rather than silently teleporting there.
  - Confirm the card in its *original* column disappears cleanly (no leftover flash/duplicate)
    since it's simply no longer in that column's `colLeads` array.
  - Click through several status changes in a row — confirm the entrance animation replays each
    time the card moves to a new column, and does not replay on unrelated re-renders (e.g.
    typing in the search box, which changes `filtered` but not `lead.status`, should not restart
    every visible card's entrance — if it does, the `filtered`/`search` memoization or the `key`
    change would need reinspection, but is not expected to happen since `key` only changes on an
    actual `status` change).
  - In DevTools, set playback to 10% (Animations panel) and confirm the fade+slide is smooth and
    subtle, not distracting for something a user may trigger many times per session.
  - Toggle `prefers-reduced-motion` (Rendering panel): `tailwindcss-animate`'s `animate-in`
    utilities respect `prefers-reduced-motion` via the browser's native handling of the
    underlying `@keyframes` only when an explicit media query disables them — since this
    codebase has no existing reduced-motion override for `animate-in`/`slide-in-from-*` classes
    globally, confirm whether the card still visibly slides under reduced motion; if it does,
    note this as a pre-existing gap shared by every other `animate-in` usage in the codebase
    (out of scope to fix broadly in this plan — only report it).
- **Done when**: changing a lead's status via the Kanban card buttons produces a brief, visible
  fade+slide-in for the card in its destination column, with no new dependency added and no
  changes to data-fetching/mutation logic.
