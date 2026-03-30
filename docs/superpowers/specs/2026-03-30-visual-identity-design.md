# Visual Identity Redesign — OpsCRM

**Date:** 2026-03-30
**Status:** Approved
**Scope:** Global design system only — no feature changes, no logic changes

---

## Decision Summary

| Dimension | Before | After |
|-----------|--------|-------|
| Display font | Inter 700 | **Syne 800** |
| Body font | Inter 400/500 | **DM Sans 400/500/600** |
| Background | `222 28% 7%` | `#090e17` (deeper) |
| Sidebar bg | `222 30% 5%` | `#060b13` (darker layer) |
| Card bg | `222 26% 10%` | `#0d1826` |
| Primary | `hsl(38 95% 52%)` ✓ | `#f5a623` (same, explicit) |
| Accent | `hsl(174 60% 45%)` ✓ | `#3ecfb2` (same, explicit) |
| Radius | `0.75rem` | `0.625rem` (tighter, sharper) |

---

## Typography System

### Fonts

```
Display/Headings: Syne, weight 800 (700 for subheadings)
Body/UI:          DM Sans, weight 400 / 500 / 600
Mono (code):      JetBrains Mono (unchanged)
```

Google Fonts import (replaces current Inter):
```
https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap
```

### Type Scale

| Role | Font | Weight | Size | Letter-spacing |
|------|------|--------|------|----------------|
| Page title | Syne | 800 | 1.5–2rem | −0.04em |
| Section heading | Syne | 700 | 1–1.2rem | −0.03em |
| KPI number | Syne | 800 | 1.4–2rem | −0.04em |
| Eyebrow label | DM Sans | 700 | 0.6rem | +0.12em uppercase |
| Body text | DM Sans | 400 | 0.875rem | −0.01em |
| UI label | DM Sans | 500–600 | 0.75–0.8rem | 0 |
| Caption | DM Sans | 500 | 0.65–0.7rem | 0 |

### Eyebrow Pattern

Every major section and card gets an **eyebrow**: small uppercase label in amber above the Syne heading. This is the defining editorial signature of the identity.

```html
<p class="eyebrow">Março 2026</p>
<h1 class="page-title">Visão Geral</h1>
```

```css
.eyebrow {
  font-family: 'DM Sans', sans-serif;
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: hsl(var(--primary));
  margin-bottom: 0.2rem;
}
```

---

## Color System

Colors are preserved from the existing system. Only the background layering is adjusted for more contrast between layers.

### Dark mode (default, `.dark` class)

```css
/* Backgrounds — 3-layer system */
--background:         #090e17;   /* page canvas */
--card:               #0d1826;   /* cards, panels */
--sidebar:            #060b13;   /* sidebar (deepest) */
--sidebar-accent:     #0d1826;   /* sidebar hover */

/* Surface borders */
--border:             #111c2e;
--sidebar-border:     #111c2e;

/* Primary (amber) — unchanged */
--primary:            hsl(38 95% 52%);    /* #f5a623 */
--primary-foreground: hsl(0 0% 0%);

/* Accent (teal) — unchanged */
--accent-foreground:  hsl(174 60% 55%);  /* #3ecfb2 */

/* Muted text */
--muted-foreground:   #4b5e73;

/* Radius — slightly tighter */
--radius: 0.625rem;
```

### Semantic additions

```css
/* KPI card top accent bars */
.kpi-accent-bar {
  /* 2px gradient line at top of card */
  background: linear-gradient(90deg, hsl(var(--primary)), transparent);
}
.kpi-teal-bar {
  background: linear-gradient(90deg, hsl(var(--accent-foreground)), transparent);
}
```

---

## Component Changes

### `src/index.css`

1. Replace Google Fonts import: Inter → Syne + DM Sans
2. Update `--font-sans` to `'DM Sans', system-ui, sans-serif`
3. Add `--font-display: 'Syne', sans-serif`
4. Update dark-mode background tokens (3-layer system above)
5. Update `--radius` to `0.625rem`
6. Add `.eyebrow` utility class
7. Add `.kpi-accent-bar` and `.kpi-teal-bar` utilities
8. Update `.text-gradient` — no change needed (still amber→teal)
9. Update `.glow-primary` — no change needed

### `tailwind.config.ts`

1. Update `fontFamily.sans` → `['DM Sans', 'system-ui', ...]`
2. Add `fontFamily.display` → `['Syne', 'system-ui', ...]`
3. No color changes (all via CSS variables)

### `src/components/layout/AppSidebar.tsx`

Visual changes only (no logic):
1. Brand name: add `font-display` class for Syne rendering
2. Section labels: add uppercase eyebrow styling
3. Active nav item: tighten padding, ensure amber/teal treatment matches spec

### `src/components/layout/AppLayout.tsx` / topbar

1. Page titles: wrap in `<span className="font-display font-extrabold tracking-tight">`
2. Add eyebrow element above page titles where context exists (e.g., current month)

### KPI / stat cards (Dashboard — `src/pages/Index.tsx`)

1. Add 2px accent bar at top of revenue/primary cards
2. Numbers: apply `font-display font-extrabold tracking-tight`
3. Labels: apply eyebrow pattern

### `src/pages/Auth.tsx`

1. Brand name "OpsCRM": Syne 800, amber
2. Subtitle: DM Sans italic, muted

---

## What Does NOT Change

- All Tailwind color tokens (they read CSS variables — variables change, tokens stay)
- All component logic, data fetching, routing
- All shadcn/ui component structure
- Light mode (the app is used in dark mode; light mode tokens stay as-is)
- Mobile layout / BottomNavBar structure
- Any Supabase integration

---

## Implementation Scope

This is purely a CSS/token change with targeted component edits. No new components. No new pages.

**Files touched:**
1. `src/index.css` — font import + tokens + utilities
2. `tailwind.config.ts` — font family
3. `src/components/layout/AppSidebar.tsx` — typography classes
4. `src/components/layout/AppLayout.tsx` — page title typography
5. `src/pages/Index.tsx` (Dashboard) — KPI cards + eyebrows
6. `src/pages/Auth.tsx` — brand name

**Estimated effort:** Small. All changes are className additions and CSS variable updates. No restructuring.
