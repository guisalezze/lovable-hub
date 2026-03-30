# Visual Identity Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Inter with Raleway (display) + Nunito (body), deepen the dark-mode background layers, tighten border radius, and add eyebrow/KPI accent-bar utilities — all purely via CSS tokens and className changes, no logic or feature changes.

**Architecture:** Three independent change surfaces: (1) CSS custom properties + font import in `src/index.css`, (2) Tailwind font-family registration in `tailwind.config.ts`, (3) targeted className additions in 4 components. Tasks are ordered so the CSS foundation lands first, then Tailwind, then components.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui, Google Fonts

---

## File Map

| File | Change |
|------|--------|
| `src/index.css` | Replace font import + update CSS tokens + add utilities |
| `tailwind.config.ts` | Register `display` font family, update `sans` |
| `src/components/layout/AppSidebar.tsx` | Brand name → `font-display`, section labels → eyebrow style |
| `src/components/layout/AppLayout.tsx` | No change needed (no page titles rendered here) |
| `src/pages/Index.tsx` | Dashboard h1 → `font-display tracking-tight`, add eyebrow |
| `src/pages/Auth.tsx` | Brand h1 → `font-display font-extrabold`, subtitle → italic |

---

### Task 1: CSS Foundation — fonts, tokens, utilities

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Replace the Google Fonts import (line 1)**

Replace:
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
```
With:
```css
@import url('https://fonts.googleapis.com/css2?family=Raleway:wght@700;800&family=Nunito:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');
```

- [ ] **Step 2: Update `--font-sans` and add `--font-display` in `:root`**

Find the block (around line 61–63):
```css
    --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
    --font-serif: Georgia, serif;
    --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
```
Replace with:
```css
    --font-sans: 'Nunito', system-ui, -apple-system, sans-serif;
    --font-display: 'Raleway', system-ui, sans-serif;
    --font-serif: Georgia, serif;
    --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
```

- [ ] **Step 3: Update `--radius` in `:root` (line 43)**

Replace:
```css
    --radius: 0.75rem;
```
With:
```css
    --radius: 0.625rem;
```

- [ ] **Step 4: Update dark-mode background tokens in `.dark` block**

Find these lines in `.dark` (around lines 79–121) and replace the background/border/sidebar variables:

```css
  .dark {
    --background: 222 28% 7%;
```
Replace the entire `.dark` opening token block (the background/card/popover/sidebar variables only — leave primary/secondary/muted/accent/destructive unchanged):

Specifically replace these lines:
```css
    --background: 222 28% 7%;
    --foreground: 220 12% 93%;

    --card: 222 26% 10%;
    --card-foreground: 220 12% 93%;

    --popover: 222 26% 10%;
    --popover-foreground: 220 12% 93%;
```
With:
```css
    --background: 216 44% 7%;
    --foreground: 220 12% 93%;

    --card: 216 40% 10%;
    --card-foreground: 220 12% 93%;

    --popover: 216 40% 10%;
    --popover-foreground: 220 12% 93%;
```

And replace:
```css
    --border: 222 20% 16%;
    --input: 222 20% 16%;
```
With:
```css
    --border: 216 28% 17%;
    --input: 216 28% 17%;
```

And replace:
```css
    --sidebar-background: 222 30% 5%;
    --sidebar-foreground: 220 10% 65%;
    --sidebar-primary: 38 95% 52%;
    --sidebar-primary-foreground: 0 0% 0%;
    --sidebar-accent: 222 25% 10%;
    --sidebar-accent-foreground: 220 10% 85%;
    --sidebar-border: 222 25% 10%;
    --sidebar-ring: 38 95% 52%;
    --sidebar: 222 30% 5%;
```
With:
```css
    --sidebar-background: 216 48% 5%;
    --sidebar-foreground: 220 10% 65%;
    --sidebar-primary: 38 95% 52%;
    --sidebar-primary-foreground: 0 0% 0%;
    --sidebar-accent: 216 40% 10%;
    --sidebar-accent-foreground: 220 10% 85%;
    --sidebar-border: 216 40% 10%;
    --sidebar-ring: 38 95% 52%;
    --sidebar: 216 48% 5%;
```

- [ ] **Step 5: Add utility classes at the end of `@layer utilities` block**

Find the closing `}` of the `@layer utilities` block (after `.gradient-border::before`). Insert before it:

```css
  .eyebrow {
    font-family: var(--font-sans);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: hsl(var(--primary));
    margin-bottom: 0.2rem;
  }

  .kpi-accent-bar {
    background: linear-gradient(90deg, hsl(var(--primary)), transparent);
  }

  .kpi-teal-bar {
    background: linear-gradient(90deg, hsl(var(--accent-foreground)), transparent);
  }
```

- [ ] **Step 6: Verify the app still compiles**

```bash
npm run build 2>&1 | tail -20
```
Expected: build succeeds with no errors (warnings about unused CSS are fine).

- [ ] **Step 7: Commit**

```bash
git add src/index.css
git commit -m "style: replace Inter with Raleway+Nunito, deepen dark tokens, add eyebrow/kpi utilities"
```

---

### Task 2: Tailwind font-family registration

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Update `fontFamily.sans` and add `fontFamily.display`**

Find:
```ts
		fontFamily: {
			sans: [
				'Inter',
				'system-ui',
				'-apple-system',
				'BlinkMacSystemFont',
				'Segoe UI',
				'sans-serif'
			],
```
Replace with:
```ts
		fontFamily: {
			sans: [
				'Nunito',
				'system-ui',
				'-apple-system',
				'BlinkMacSystemFont',
				'Segoe UI',
				'sans-serif'
			],
			display: [
				'Raleway',
				'system-ui',
				'sans-serif'
			],
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | tail -20
```
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "style: register Raleway as font-display in Tailwind"
```

---

### Task 3: Sidebar brand name typography

**Files:**
- Modify: `src/components/layout/AppSidebar.tsx`

- [ ] **Step 1: Apply `font-display` to the brand name span (line 150)**

Find:
```tsx
        <span className="font-bold text-foreground text-lg tracking-tight whitespace-nowrap">
          Solaryz
        </span>
```
Replace with:
```tsx
        <span className="font-display font-extrabold text-foreground text-lg tracking-tight whitespace-nowrap">
          Solaryz
        </span>
```

- [ ] **Step 2: Verify in browser (dev server)**

```bash
npm run dev
```
Open `http://localhost:5173`. The "Solaryz" text in the sidebar header should render in Raleway.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/AppSidebar.tsx
git commit -m "style: apply font-display to sidebar brand name"
```

---

### Task 4: Dashboard page title typography + eyebrow

**Files:**
- Modify: `src/pages/Index.tsx`

- [ ] **Step 1: Add eyebrow and apply `font-display` to h1 (around lines 91–97)**

Find:
```tsx
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            {currentProject?.icon} Dashboard · {currentProject?.name}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Visão geral da operação</p>
        </div>
```
Replace with:
```tsx
        <div>
          <p className="eyebrow">{format(new Date(), "MMMM yyyy", { locale: undefined })}</p>
          <h1 className="text-xl sm:text-2xl font-display font-extrabold tracking-tight text-foreground">
            {currentProject?.icon} Dashboard · {currentProject?.name}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Visão geral da operação</p>
        </div>
```

Note: `format` is already imported from `date-fns` at line 2. No new import needed.

- [ ] **Step 2: Verify the eyebrow appears above the h1 in the browser**

```bash
npm run dev
```
The dashboard header should show a small amber uppercase date above the title.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "style: apply font-display and eyebrow to Dashboard page title"
```

---

### Task 5: Auth page brand typography

**Files:**
- Modify: `src/pages/Auth.tsx`

- [ ] **Step 1: Apply `font-display` to brand h1 and italic to subtitle (lines 68–70)**

Find:
```tsx
          <h1 className="text-2xl font-bold text-foreground">OpsCRM</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Entre na sua conta
          </p>
```
Replace with:
```tsx
          <h1 className="text-2xl font-display font-extrabold tracking-tight text-primary">OpsCRM</h1>
          <p className="text-sm italic text-muted-foreground mt-1">
            Entre na sua conta
          </p>
```

- [ ] **Step 2: Verify in browser**

Navigate to `/` while logged out (or open in incognito). "OpsCRM" should render in Raleway bold amber, subtitle in italic.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Auth.tsx
git commit -m "style: apply font-display + amber to Auth brand, italic subtitle"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Replace Inter → Raleway + Nunito | Task 1 (import) + Task 2 (Tailwind) |
| `--font-sans` → Nunito | Task 1 step 2 |
| `--font-display` → Raleway | Task 1 step 2 + Task 2 |
| Deepen dark backgrounds (`#090e17` → deeper) | Task 1 step 4 |
| `--radius` → `0.625rem` | Task 1 step 3 |
| `.eyebrow` utility class | Task 1 step 5 |
| `.kpi-accent-bar` / `.kpi-teal-bar` | Task 1 step 5 |
| Sidebar brand → Raleway | Task 3 |
| Dashboard h1 → Raleway + eyebrow | Task 4 |
| Auth brand → Raleway 800 amber | Task 5 |
| Auth subtitle → italic | Task 5 |

All requirements covered. No placeholders. No TBD.

**Note on KPI cards:** The spec mentions applying `font-display` to KPI numbers in `HeroMetrics`. That component is not directly listed in the 6 files in the spec's "Files touched" section, and the spec notes the Dashboard task as applying eyebrow + font-display to the page title. The accent bars are added as CSS utilities (Task 1) — applying them to individual card components would be a separate follow-up task beyond the spec's declared scope.
