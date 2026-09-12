# Meta Ads Extended Metrics + Budget Editing — Design

Date: 2026-09-12

## Context

The CRM's `/meta-ads` page has two tabs today: "Campanhas" (campaign-level spend/clicks/conversions/CPA/ROAS, manual-trigger sync, pause/resume buttons) and "Atribuição" (per-ad CPA/ROAS/profit, built in the prior `2026-09-11-meta-ads-attribution` project). Two gaps:

1. **Budget editing has no UI.** The backend (`meta-action` edge function) already supports `action: "budget"` against the Meta Graph API — it's just never exposed as a button.
2. **Metrics are sparse.** `meta_campaigns`/`meta_adsets`/`meta_ads` already store `impressions` (never displayed) but nothing beyond spend/impressions/clicks/conversions — no CTR/CPM/CPC, no funnel metrics (Initiate Checkout), no video engagement metrics (Hook/Hold/Play Rate, retention), no follows.

The user provided three screenshots of UTMify's customizable-column picker as a reference for the target metric set. Not every UTMify metric has a clean equivalent here — several (ICR, CON) depend on a "PageView" pixel event this CRM doesn't track, and are explicitly out of scope (see Non-goals).

## Goals

1. A level selector (Campanha / Conjunto / Anúncio) in the "Campanhas" tab that switches which table (`meta_campaigns` / `meta_adsets` / `meta_ads`) is displayed, all three sharing the same metric set and column picker.
2. A UTMify-style customizable column picker (checkboxes, grouped, persisted to `localStorage`) so users choose which of the available metrics show, per level.
3. New metrics, computed from either already-stored fields or newly-synced Meta Insights fields: Impressões, CTR, CPM, CPC, Gasto, Cliques, Conversões, CPA, [IC] Finalização de compra iniciada, [CPI] Custo por IC, Faturamento/Lucro/ROAS (real, sourced from `ad_performance` at the ad level; campaign/adset level continues using the existing manual-investment-independent revenue path — see Design §3), Hook Rate, Hold Rate, Play Rate, Retenção do Body, Custo/Seguidor, Bid Cap.
4. A budget-editing modal (daily or lifetime) reachable from a new action button per row, at both campaign and adset level (ads don't have their own budget in Meta's model).
5. `meta-sync` extended to pull the new Graph API fields needed for the above, at all three levels it already loops over.

## Non-goals

- ICR ("Taxa de conexão ICs / Vis. de pág") and CON ("Vis. de pág / cliques") — both depend on a PageView pixel event this CRM's ads don't fire. Skipped.
- "Conversão do Body" (Compras / Vídeos assistidos 75%) at campaign/adset level — sales are only attributable at the ad level (via `ad_performance`, built in the prior attribution project) since that's the grain the sale-to-ad join happens at. This metric will only appear when the level selector is on "Anúncio".
- A DB-backed per-user column preference — `localStorage` only, per the user's explicit choice. Revisit if multi-device preference sync becomes a real ask.
- Editing anything beyond budget (name, targeting, creative) — out of scope, this is a budget-only action extension.
- Drill-down/hierarchical navigation between levels — a flat level-switcher, not click-to-expand.

## Design

### 1. Schema changes (new migration)

Add to `meta_campaigns`, `meta_adsets`, AND `meta_ads` (all three, same shape):
```
initiate_checkout bigint default 0
video_view bigint default 0        -- 3-second video views ("Hook" numerator)
video_plays bigint default 0       -- video started ("Play Rate" numerator)
video_p75_watched bigint default 0 -- 75%-watched video views ("Hold"/"Retenção" numerator)
follows bigint default 0           -- best-effort; not all ad types report this
```

Add to `meta_campaigns` and `meta_adsets` only (ads don't carry their own budget or bid in Meta's object model):
```
bid_amount numeric  -- "Bid Cap", cents-to-currency converted like daily_budget already is
```

Add to `meta_adsets` only (campaigns already have both `daily_budget` and `lifetime_budget`; adsets currently only have `daily_budget`):
```
lifetime_budget numeric
```

### 2. `meta-sync` extension

The existing three-level loop (campaign → adset → ad, one Graph API insights call per level per day) gains:
- Insights `fields` parameter grows from `spend,impressions,clicks,actions` to also request `video_play_actions`, `video_p75_watched_actions`. `initiate_checkout` and `video_view` counts are extracted from the existing `actions` array (same pattern already used for `purchase`/`offsite_conversion.fb_pixel_purchase`), matching action_type `initiate_checkout` OR `omni_initiated_checkout` OR `offsite_conversion.fb_pixel_initiate_checkout` (Meta's naming varies by event source — check all three, sum matches). `follows` similarly extracted from `actions` matching `onsite_conversion.follow` where present; if absent, stays 0 — this is explicitly best-effort per Non-goals-adjacent reality (not every ad surfaces this action type).
- The object-level fetch (campaign `fields=name,status,objective,daily_budget,lifetime_budget`, adset `fields=name,status,daily_budget`) gains `bid_amount` for both, and `lifetime_budget` for the adset fetch.
- All new numeric fields upsert into the corresponding new columns, same per-level upsert calls already in place (no new upsert calls, just more fields in the existing ones).

### 3. Computed metrics (frontend, no new stored columns)

Given `spend, impressions, clicks, initiate_checkout, video_view, video_plays, video_p75_watched, follows` per row:
```
CTR  = clicks / impressions * 100
CPM  = spend / impressions * 1000
CPC  = spend / clicks
CPI  = spend / initiate_checkout
Hook Rate       = video_view / impressions * 100
Play Rate       = video_plays / impressions * 100
Hold Rate       = video_p75_watched / impressions * 100
Retenção do Body = video_p75_watched / video_plays * 100
Custo/Seguidor  = spend / follows
```
All divide-by-zero cases render `"–"`, matching the existing `Atribuição` tab's convention.

Faturamento/Lucro/ROAS/CPA at the **ad** level reuse the existing `ad_performance` view unchanged (already has real, sale-linked revenue). At **campaign/adset** level, there is no sale-linked revenue source (attribution only resolves to a specific ad, not upward to its parent campaign/adset without an extra rollup) — Faturamento/Lucro/ROAS at those levels are computed by summing `ad_performance.revenue` for every ad belonging to that campaign/adset (one extra grouped query per level, joining `meta_ads`→`meta_adsets`→`meta_campaigns` the same way the `ad_performance` view itself already does), not from the always-empty `meta_campaigns.revenue` column.

### 4. UI: level selector + column picker

`MetaAds.tsx`'s "Campanhas" `TabsContent` gains, above its table:
- A three-way toggle (`Campanha` / `Conjunto` / `Anúncio`, shadcn `Tabs` or `ToggleGroup` — reuse whichever this repo already has a component for) driving which of three new hooks (`useMetaCampaignsMetrics`, `useMetaAdsetsMetrics`, `useMetaAdsMetrics` — or one parameterized hook) is queried.
- A "Colunas" button opening a `Popover` with grouped checkboxes (Básico: Gasto/Cliques/Impressões/CTR/CPM/CPC; Funil: IC/CPI/Faturamento/Lucro/ROAS/CPA — CPA already existed; Vídeo: Hook/Play/Hold Rate/Retenção; Social: Custo por Seguidor; Config: Bid Cap). Selection persists to `localStorage` under one key shared across all three levels (video/social/config columns simply render `"–"` at levels/rows where the underlying count is 0 — no per-level filtering of which columns are *offered*, only which values are *populated*).

### 5. UI: budget editing modal

A new icon button per row (next to the existing Pause/Play, campaign and adset levels only — not shown for the Anúncio level) opens a `Dialog`: radio group Diário/Vitalício, a currency input pre-filled with the current value, Save button calling the extended `meta-action`.

### 6. `meta-action` extension

`action: "budget"` currently assumes a campaign ID and only sets `daily_budget`. Extend the request body to `{ action: "budget", level: "campaign" | "adset", id, budget_type: "daily" | "lifetime", value }`. The function looks up the access token from `meta_campaigns` or `meta_adsets` depending on `level` (both already join through to `meta_ad_accounts.access_token` the same way the current campaign-only lookup does), and POSTs `{ daily_budget: ... }` or `{ lifetime_budget: ... }` to the Graph API node — same object-id-agnostic pattern already in place, just parameterized instead of hardcoded to campaign+daily.

### 7. Error handling

- Meta Insights fields that don't exist for a given ad/account (e.g. video fields on a non-video ad) come back as `undefined`/missing from `actions` — already-established fallback (`Number(x || 0)`) handles this without special-casing.
- `follows` extraction is explicitly best-effort (see §2) — a row simply shows 0/`"–"` if the account doesn't report it, not an error.
- Budget modal: Graph API validation errors (e.g. below Meta's minimum budget) surface via the existing `meta-action` error-passthrough pattern already used for pause/resume, shown as a toast.

### 8. Testing

No automated test framework (established in the prior project). Verification: SQL queries confirming new columns/values after a real sync run (a real connected account is needed — the previous project's `meta-sync` verification found both available test accounts had 0 reachable campaigns; if that's still true, verification here is code-tracing plus confirming the Graph API `fields` parameter is syntactically valid, same accepted-gap pattern as before), a manual budget-edit curl against `meta-action` with each `budget_type`, and `npm run build`/`tsc --noEmit` for the UI changes.
