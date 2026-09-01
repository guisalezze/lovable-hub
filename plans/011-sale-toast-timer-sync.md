# 011 — Sync sale-toast progress bar to Sonner's real timer, add celebratory entrance

- **Status**: TODO
- **Commit**: a790988
- **Severity**: MEDIUM-HIGH
- **Category**: Interruptibility (AUDIT.md §4) + Missed opportunities (AUDIT.md §8) — merged, same component
- **Estimated scope**: 1 file (`src/hooks/useSaleRealtime.tsx`), ~15 line delta

## Problem

`SaleToast` (the real-time "Venda aprovada!" toast fired from `useSaleRealtime`) has two
motion problems in the same component:

**1. The progress bar is not synced to Sonner's actual dismiss timer.**

```tsx
// src/hooks/useSaleRealtime.tsx:51-63 — current
      {/* Barra animada de progresso na base */}
      <style>{`
        @keyframes shrink-bar {
          from { width: 100%; }
          to   { width: 0%; }
        }
        .sale-progress-bar {
          animation: shrink-bar 6s linear forwards;
        }
      `}</style>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-b-xl overflow-hidden bg-emerald-900/30">
        <div className="sale-progress-bar h-full bg-emerald-500" />
      </div>
```

```tsx
// src/hooks/useSaleRealtime.tsx:139-153 — current
  toast.custom(
    (t) => (
      <div className="relative overflow-hidden rounded-xl">
        <SaleToast
          amount={amount}
          productName={productName}
          onDismiss={() => toast.dismiss(t)}
        />
      </div>
    ),
    {
      duration: 6000,
      position: "top-center",
    }
  );
```

The bar's `shrink-bar` keyframe runs on a fixed 6s wall-clock clock the instant it mounts,
completely independent of Sonner's own dismiss timer. Confirmed by reading Sonner's shipped
source (`node_modules/sonner/dist/index.js`, v1.7.4 per `package.json:68`): the `Toaster`'s
outer `<ol data-sonner-toaster>` element has `onMouseEnter={() => setExpanded(true)}` and
`onMouseLeave={() => !interacting && setExpanded(false)}`; each individual toast's dismiss
`setTimeout` is gated by `expanded || interacting` — while either is true, the toast's
remaining-time countdown is paused (`remaining = remaining - elapsed`) and no dismiss timer
is running. `toast.custom`'s `t.jsx` content (our `<div className="relative...">…</div>`) is
rendered as a direct child of that same `<li data-sonner-toast>`, which itself sits directly
inside `<ol data-sonner-toaster>`.

So: hovering the toast **does** pause Sonner's real auto-dismiss countdown, but the CSS
`@keyframes shrink-bar` animation has no way to know that — it keeps shrinking the bar to 0%
on hover, then sits at 0% width while the (paused) toast is still fully on-screen, or in the
inverse case the toast can be dismissed by Sonner before the bar visually reaches zero if the
user interacted elsewhere. The bar is lying about how much time is actually left.

**2. No delight budget spent on the app's single rare, celebratory, high-emotion moment.**

```tsx
// src/hooks/useSaleRealtime.tsx:37-49 — current
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white leading-tight">
          Venda aprovada! 🎉
        </p>
        <p className="text-[11px] text-emerald-400 font-medium mt-0.5">
          {fmtBRL(amount)}
        </p>
        {productName && (
          <p className="text-[10px] text-zinc-500 truncate mt-0.5">
            {productName}
          </p>
        )}
      </div>
```

Per AUDIT.md §8, rare/first-time/celebration moments are allowed a delight budget — but this
toast (a real-time sale notification, played with sound via `playSaleSound()`) has zero motion
of its own beyond whatever Sonner's default toast enter/exit gives every toast in the app,
identical to a mundane "Status atualizado" toast.

## Target

**Fix 1 — pause the bar exactly when Sonner pauses, using `animation-play-state` (not a
transition rewrite).** CSS keyframe animations natively support `animation-play-state: paused`,
which freezes progress at the exact current frame and resumes from there — this is the correct
tool here, not a `transition`-based rewrite (transitions have no native pause primitive). Sync
target is `[data-sonner-toaster]:hover`, the literal element whose hover state gates Sonner's
own pause logic (confirmed above), so both mechanisms pause/resume across the same real
mouse-enter/mouse-leave window:

```tsx
/* target — src/hooks/useSaleRealtime.tsx, replacing lines 51-63 */
      {/* Barra animada de progresso na base — sincronizada com o hover-pause do Sonner */}
      <style>{`
        @keyframes shrink-bar {
          from { width: 100%; }
          to   { width: 0%; }
        }
        .sale-progress-bar {
          animation: shrink-bar 6000ms linear forwards;
        }
        [data-sonner-toaster]:hover .sale-progress-bar {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .sale-progress-bar {
            animation: none;
            width: 100%;
          }
        }
      `}</style>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-b-xl overflow-hidden bg-emerald-900/30">
        <div className="sale-progress-bar h-full bg-emerald-500" />
      </div>
```

(`6s` → `6000ms` is a notation-only change, same value, made explicit to match the
`duration: 6000` in the `toast.custom` call it must stay in sync with — not a duration change,
per Boundaries.)

**Fix 2 — subtle scale-in on the amount only**, using the same `animate-in`/`zoom-in`
vocabulary already used unconditionally-on-mount elsewhere in this codebase (see Repo
conventions below). `zoom-in-95` (not `zoom-in-0`/`scale(0)`) matches AUDIT.md §3's
"never `scale(0)`, target `scale(0.9–0.97)`":

```tsx
/* target — src/hooks/useSaleRealtime.tsx, replacing lines 41-43 */
        <p className="text-[11px] text-emerald-400 font-medium mt-0.5 animate-in fade-in-0 zoom-in-95 duration-300">
          {fmtBRL(amount)}
        </p>
```

No change to the `🎉` title line or the product-name line — keep the delight contained to the
one line that matters (the sale amount), per the plan's own boundary to stay tasteful for a
business CRM.

## Repo conventions to follow

- `tailwindcss-animate`'s `animate-in`/`fade-in-*`/`zoom-in-*` utilities are already used
  **unconditionally on mount** (not gated behind a Radix `data-state`) in
  `src/components/ui/tooltip.tsx:20`: `"...shadow-md animate-in fade-in-0 zoom-in-95
  data-[state=closed]:animate-out..."` — entrance plays every mount, exit is the only thing
  gated by `data-state`. `SaleToast`'s content mounts fresh each time `showSaleToast` fires
  (Sonner creates a new toast/DOM node per call), so the same unconditional-on-mount pattern
  applies directly — no `data-mounted` plumbing needed.
- Do not introduce a new CSS token for the pause rule — `animation-play-state` is a plain CSS
  property, no token exists or is needed for it elsewhere in `src/index.css`.
- The existing `@media (prefers-reduced-motion: reduce)` block in `src/index.css:287-298`
  establishes the pattern of neutralizing animation/transition under reduced motion while
  keeping the element visible — the added reduced-motion rule for `.sale-progress-bar` follows
  that same shape (drop the animation, keep a static, fully-visible bar) inline in this
  component's own `<style>` tag rather than moving it to the global stylesheet, since
  `shrink-bar`/`sale-progress-bar` are themselves scoped inline in this component already.

## Steps

1. In `src/hooks/useSaleRealtime.tsx`, replace the `<style>` block and progress-bar `<div>`
   currently at lines 51-63 with the Target block above (adds the `[data-sonner-toaster]:hover`
   pause rule and the reduced-motion rule; changes `6s` to `6000ms` notation only).
2. In the same file, replace the amount `<p>` currently at lines 41-43 with the Target version
   above (adds `animate-in fade-in-0 zoom-in-95 duration-300`).
3. Leave `toast.custom(...)`'s `duration: 6000` (lines 139-153), `playSaleSound()`, the realtime
   subscription (`useSaleRealtime`, lines 160-206), and `sendPushNotification` untouched.

## Boundaries

- Do NOT change the sound-playing logic (`playSaleSound()`) or the Supabase realtime
  subscription logic in `useSaleRealtime()` — CSS/animation only.
- Do NOT change the 6-second toast duration (`duration: 6000` in the `toast.custom` options
  object) — only how the bar's own shrink is synced to it.
- Do NOT add a JS-driven timer (`setInterval`/`requestAnimationFrame`) — the CSS
  `animation-play-state` approach is sufficient and avoids the perf cost of a rAF loop for
  something CSS already handles natively (AUDIT.md §5: "CSS ... beat rAF-based JS under load —
  use CSS for predetermined motion").
- Do NOT add a glow-pulse keyframe or reach for `.glow-primary` — no pulsing-glow keyframe
  exists anywhere in `src/index.css` today, and `.glow-primary` is a static `box-shadow` utility,
  not an animation; introducing a brand-new animated glow keyframe for one component is
  disproportionate to this finding. The `zoom-in-95` scale-in on the amount is the intended,
  scoped delight addition.
- Do NOT touch the "🎉" title `<p>` or the product-name `<p>` — only the amount line gets the
  entrance.
- If the code found in `useSaleRealtime.tsx` doesn't match the verbatim excerpts above (drift
  since commit a790988), STOP and report instead of improvising.

## Verification

- **Mechanical**: `npm run build` completes with no new TypeScript/build errors. `npm run lint`
  reports no new violations.
- **Feel check**:
  - Trigger a sale toast (or call `showSaleToast(...)` directly from a scratch component/dev
    console) and watch the amount line pop in with a subtle scale — it should read as a small,
    tasteful flourish, not a bounce or game-like celebration.
  - With the toast visible, hover over it before the 6s elapses and hold for ~2s: the progress
    bar must visibly stop shrinking while hovered (not keep counting down), and the toast itself
    must not auto-dismiss while hovered.
  - Move the mouse away: the bar must resume shrinking from wherever it stopped (not restart
    from 100%), and the toast must dismiss when the bar reaches 0% — the two should still line
    up after a hover-pause-resume cycle.
  - In DevTools, set playback to 10% (Animations panel) and confirm the bar's shrink is smooth
    and pauses/resumes exactly on hover enter/leave with no visible jump.
  - Toggle `prefers-reduced-motion` (Rendering panel): the bar should render as a full static
    line (no shrink animation) and the amount should appear without the scale/fade-in, while the
    toast itself still functions (dismiss timer unaffected — reduced motion is visual only).
- **Done when**: the progress bar's visible state always matches whether the toast is actually
  about to auto-dismiss (paused-while-hovered, resumes-on-leave, reaches 0% at the same moment
  Sonner dismisses it), and the sale amount has its own brief entrance distinct from the rest of
  the toast.
