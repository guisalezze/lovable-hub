

## Plan: Premium Theme Update

Single file change to `src/index.css`. Three edits:

### 1. Replace `:root` and `.dark` blocks (lines 8–136)
Replace all CSS variables with the new amber/teal premium palette. Key changes:
- Primary: lime green → amber gold `hsl(38 92% 48%)`
- Accent: green → teal
- Sidebar: always dark in light mode (premium contrast)
- Background: cool blue-white / deep blue-black
- Radius: 1rem → 0.75rem
- Tracking: -0.01em → -0.015em

### 2. Replace utilities block (lines 149–163)
- `glass-card`: solid bg-card with shadow-sm instead of backdrop-blur
- `glow-primary`: amber glow
- New `glow-accent`: teal glow
- `text-gradient`: amber → teal gradient
- `gradient-border`: pseudo-element mask technique instead of border-image

### 3. Replace scrollbar styles (lines 165–179)
- Thinner (5px), transparent track, rounded thumb
- Add `::selection` with amber highlight

No other files affected. Pure CSS variable swap — all components automatically inherit the new theme.

