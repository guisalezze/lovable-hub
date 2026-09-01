# Animation improvement plans

Produced by the `improve-animations` skill audit. Commit stamp for all plans: `a790988`.

## Plans

| # | Title | Severity | Status | File |
| --- | --- | --- | --- | --- |
| 001 | Investigate (and fix if confirmed) Radix overlay open/close keyframe restart | HIGH | DONE (no fix needed) | [001-radix-overlay-transitions.md](001-radix-overlay-transitions.md) |
| 002 | Expand prefers-reduced-motion coverage beyond 4 classes | HIGH | DONE | [002-reduced-motion-coverage.md](002-reduced-motion-coverage.md) |
| 003 | Gate hover-triggered transforms behind `(hover: hover) and (pointer: fine)` | HIGH | DONE | [003-hover-touch-gate.md](003-hover-touch-gate.md) |
| 004 | Move sidebar collapse off width/margin thrash onto `--ease-in-out-apple` | HIGH | DONE | [004-sidebar-collapse-transform.md](004-sidebar-collapse-transform.md) |
| 005 | Add press feedback to primary sidebar navigation controls | HIGH | DONE | [005-sidebar-press-feedback.md](005-sidebar-press-feedback.md) |
| 006 | Make hover-only action buttons reachable on touch and keyboard | HIGH | DONE | [006-touch-invisible-buttons.md](006-touch-invisible-buttons.md) |
| 007 | Asymmetric press/release timing + consolidate duplicated easing literal | MEDIUM | DONE | [007-button-asymmetric-timing.md](007-button-asymmetric-timing.md) |
| 008 | Progress bars: animate `transform` not `width` (mirror `ui/progress.tsx`) | MEDIUM | DONE | [008-progress-bars-transform.md](008-progress-bars-transform.md) |
| 009 | Sheet/drawer: dedicated `--ease-drawer` curve instead of bare `ease-in-out` | MEDIUM | TODO | [009-sheet-drawer-easing.md](009-sheet-drawer-easing.md) |
| 010 | Introduce a shared duration-token scale (scoped proof-of-concept only) | MEDIUM | TODO | [010-duration-tokens.md](010-duration-tokens.md) |
| 011 | Sync sale-toast progress bar to Sonner's real timer, add celebratory entrance | MEDIUM-HIGH | DONE | [011-sale-toast-timer-sync.md](011-sale-toast-timer-sync.md) |
| 012 | Give Kanban lead cards an entrance cue when their status changes | MEDIUM | TODO | [012-kanban-card-move-transition.md](012-kanban-card-move-transition.md) |
| 013 | Give task-completion checkbox and title a small motion budget | LOW-MEDIUM | DONE | [013-task-complete-animation.md](013-task-complete-animation.md) |
| 014 | Add entrance stagger to Relatórios KPI grid, matching Dashboard's pattern | LOW | TODO | [014-relatorios-kpi-stagger.md](014-relatorios-kpi-stagger.md) |

Explicitly excluded from this batch: the `.glass-card` → `.material-card` cohesion finding
(29 files still on the old system vs. 11 on the new one) — that's a full redesign rollout, not a
surgical animation fix, and needs its own scoping/brainstorming pass before any plan is written
for it.

## File overlap map

| File | Plans touching it |
| --- | --- |
| `src/index.css` | 002, 003, 004(token consumption only, no edit), 005, 007, 009, 010, 014 |
| `src/components/layout/AppSidebar.tsx` | 003, 004, 005, 010(proof-of-concept) |
| `src/components/layout/AppLayout.tsx` | 003, 004, 010(proof-of-concept) |
| `src/components/dashboard/HeroMetrics.tsx` | 003, 004, 007 |
| `src/components/dashboard/OperationCards.tsx` | 003, 005 |
| `src/components/layout/BottomNavBar.tsx` | 003 |
| `src/components/ui/button.tsx` | 007, 010(proof-of-concept) |
| `src/pages/Leads.tsx` | 006, 012 |
| `src/components/tasks/TaskModal.tsx` | 006 |
| `src/components/ui/toast.tsx` | 006 (read-only exemplar, not edited) |
| `src/pages/Copies.tsx`, `CopyProjectDetail.tsx`, `Financeiro.tsx`, `Implementacoes.tsx` | 006, 008(Implementacoes.tsx only) |
| `src/components/ui/select.tsx`, `popover.tsx`, `dropdown-menu.tsx`, `context-menu.tsx`, `menubar.tsx`, `sheet.tsx`, `navigation-menu.tsx` | 001 (sheet.tsx also touched by 009) |
| `src/components/layout/RevenueProgressBar.tsx`, `src/pages/Index.tsx`, `DesignPreview.tsx`, `src/components/whatsapp/DisparoTab.tsx`, `src/pages/Equipe.tsx`, `src/components/financeiro/ProductGoalsSection.tsx`, `src/components/implementations/ImplementationDetailSheet.tsx` | 008 |
| `src/components/ui/checkbox.tsx`, `src/components/tasks/TaskListView.tsx` | 013 |
| `src/hooks/useSaleRealtime.tsx` | 011 |
| `src/pages/Relatorios.tsx` | 014 |

## Suggested execution order

Plans sharing a file run **sequentially** (land one's commit before starting the next). Since
`src/index.css` alone is touched by 8 of the 14 plans, most of this batch ends up chained through
it — genuine full parallelism is limited to a handful of fully isolated plans.

**Main sequential chain (everything touching `index.css`, `AppSidebar.tsx`, `AppLayout.tsx`,
`HeroMetrics.tsx`, `OperationCards.tsx`, or `button.tsx`):**

`002 → 003 → 004 → 005 → 007 → 010 → 009 → 014`

- 002 first: broadens the reduced-motion block so every later plan's new animated rules land
  inside it rather than needing a second pass.
- 003 → 004 → 005: strictly sequential per the original batch's reasoning (pairwise overlaps on
  `HeroMetrics.tsx`, `AppLayout.tsx`, `OperationCards.tsx`, `AppSidebar.tsx` rule out any safe
  parallel pairing among these three).
- 007 after 005: introduces `.btn-press` and consolidates the `--ease-out-apple` literal in
  `button.tsx`/`HeroMetrics.tsx` — run after the sidebar work so there's one less thing touching
  `HeroMetrics.tsx` concurrently.
- 010 after 004 and 007 (explicit dependency — 010's tokens should align with what 004/007
  introduced, and 010's own plan text branches on their live-file state).
- 009 and 014 can technically run anywhere after 002 (both only need the broadened reduced-motion
  block to exist first) — placed last in the chain since they're the lowest-severity items and
  least urgent to sequence early.

**Sequential pair (shared `Leads.tsx`):** `006 → 012` (either order works; 006 changes button
reachability markup that 012 also touches via the entrance-class/key change, so land one before
starting the other).

**Fully parallel with the main chain, Group B, and each other:**
- `001` — isolated to 7 Radix-wrapper UI files, no overlap with anything else.
- `008` — isolated to `RevenueProgressBar.tsx` + 7 other files, none shared with any other plan
  except `Implementacoes.tsx` (also touched by 006, but 006 edits a different section of that
  file — the hover-hidden delete button vs. 008's own progress-bar fill — low collision risk, but
  still land one before the other if both are in flight).
- `011` — isolated to `useSaleRealtime.tsx`.
- `013` — isolated to `checkbox.tsx` + `TaskListView.tsx`.

## Notes

- Plan 001 has an investigation step gating whether any fix is applied at all — treat its
  "Status" as informational only until that step runs; it may resolve to "no fix needed."
- Plan 004 does not itself edit `src/index.css` — it only *references* the existing
  `--ease-in-out-apple` token via `var(...)` in `AppSidebar.tsx`/`AppLayout.tsx`, so it doesn't
  need to sequence strictly against 002/003's `index.css` edits, but keep it in the chain anyway
  since it precedes 005/007/010 which do share files with it directly.
