# OpenReply x Zernio: technical brief

Sources: github.com/diwenne/openreply (main) + zernio.com/llms.txt + zernio.com/openapi.yaml.
No Zernio endpoint was called. Everything below is read from source/spec. Items I could not
confirm are marked **UNCONFIRMED**. OpenReply is Next.js + Prisma/Postgres + Redis/BullMQ, with
Meta Graph direct and Zernio as two interchangeable "providers".

Legend: `OR` = what OpenReply actually does (code). `SPEC` = what the Zernio OpenAPI says.

---------------------------------------------------------------------------------------------

## A. Zernio provider as used by OpenReply

### A1. Auth, base URL, errors, retries, delivery uncertainty

- Base URL (hardcoded): `https://zernio.com/api/v1` (OpenAPI paths are written `/v1/...`; OR prefixes `/api/v1`).
- Auth: `Authorization: Bearer <apiKey>` + `Content-Type: application/json`.
- Optional header `Idempotency-Key: <sha256 hex>` (OR sends it only on DM-to-conversation sends, NOT on private-reply, NOT on public comment reply).
- Timeout: `AbortSignal.timeout(30_000)`, `cache: "no-store"`. Network failure -> `ZernioApiError(502)`.
- API key must be an **unrestricted read/write key with Inbox access** (profile-scoped / restricted keys 403 on `/webhooks/settings`).
- Rate limits (SPEC): 60 req/min free, 600/min paid, 1200/min enterprise. Extra cap: **1,800 req/hour per team** on inbox comment reads (`GET /v1/inbox/comments`, `GET /v1/inbox/comments/{postId}`). 429 carries `details.scope`.

Core client (lib/zernio/client.ts), trimmed:

```ts
const response = await fetch(`https://zernio.com/api/v1${path}`, {
  method, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json",
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  signal: AbortSignal.timeout(30_000),
}).catch(() => { throw new ZernioApiError(502); });
if (!response.ok) {
  if (response.status === 429) throw new RateLimitError(...);
  if (response.status === 401) throw new TokenExpiredError(...);
  throw new ZernioApiError(response.status);   // body is deliberately never kept
}
if (response.status === 204) return undefined as T;
```

Error handling facts:
- Response bodies are never persisted/returned (may contain platform creds). Only HTTP status is kept.
- OR does NO HTTP-level retry in the client. Retries live in the BullMQ job layer (3 attempts, backoff 5/15/45 min) and only for confirmed rejections.
- Management routes map: 401 -> "key invalid/expired", 403 -> "need unrestricted read-write key with Inbox", 402 -> "plan needs Inbox access".

Delivery uncertainty ("unconfirmed"), the core safety idea:
- In `sendZernioMessage` / `sendCommentReply`: any `ZernioApiError` with `code >= 500`, OR a 2xx with no `messageId` (`result.messageId ?? result.data.messageId`), throws `ZernioDeliveryUnconfirmedError` (extends ZernioApiError(502)). Message: "Message delivery is unconfirmed. Inspect the Instagram inbox before retrying."
- `isConfirmedSendRejection(e)`: true for RateLimitError, TokenExpiredError (429/401), and ZernioApiError 400-499. Everything else (5xx, network, bad JSON, local DB failure) is treated as UNCONFIRMED -> `classifySendError` wraps in `DeliveryUnconfirmedError`.
- Worker throws `UnrecoverableError` for unconfirmed -> BullMQ does not retry.
- Persistence: `DmLog.dmDeliveryUnconfirmed` / `publicReplyDeliveryUnconfirmed` booleans double as **in-flight claims**. A leg is claimed atomically BEFORE the network call (`updateMany ... where status != SENT and dmDeliveryUnconfirmed=false and attempts < 3` -> sets flag true, attempts+1). Success clears the flag; only a confirmed rejection releases it. Crash between claim and call leaves the claim (favors "no duplicate" over "guaranteed delivery"). Max 3 DM send attempts per (automation, comment) across all job sources.
- SPEC corroborates: private-reply `502` carries `details.privateReplyOutcome:"unknown"`; `429` carries `"not_sent"`; `400 details.privateReplyConsumed:true` = the comment's single private reply is spent (never retry). Zernio does not retry sends internally.

### A2. Profiles, accounts, identity, connect flow

Endpoints OR calls:

| Purpose | Request | Response fields used |
|---|---|---|
| List profiles | `GET /profiles` | `{profiles:[{_id,name}]}` |
| List IG accounts | `GET /accounts?profileId=<id>&platform=instagram` | `{accounts:[{_id, platform, profileId (string or {_id}), platformUserId, username, displayName, isActive, profilePicture?, followersCount?}]}` |
| Connect new IG account | `GET /connect/instagram?profileId=<id>&redirect_url=<url>` | `{authUrl}` |
| List webhooks | `GET /webhooks/settings` | `{webhooks:[{_id,url}]}` |
| Create webhook | `POST /webhooks/settings` | `{webhook:{_id}}` |
| Update webhook | `PUT /webhooks/settings` (body includes `_id`) | |
| Delete webhook | `DELETE /webhooks/settings?id=<_id>` | |

Identity model (important):
- Two ids per account. **Zernio `accountId` = `accounts[]._id`** (opaque Mongo-style id, used in every Zernio path/body). **Instagram id = `platformUserId`** (this is the IG professional/app-scoped account id).
- OR stores both in `InstagramAccount`: `zernioAccountId = _id`, `instagramId = platformUserId` (unique), `provider = ZERNIO`, `accessToken = ''` (no Meta token held).
- Only accounts with `platform==='instagram' && isActive !== false && platformUserId` and belonging to the selected profile are importable.
- Webhook events carry `account.id` (= Zernio accountId, same value as `account.accountId`); OR matches it against `InstagramAccount.zernioAccountId`, then rewrites the event into a Meta-shaped payload using `instagramId` as `entry.id`.
- Commenter/sender ids (`comment.author.id`, `message.sender.id`) are IGSIDs and are what you pass as `userId` to follow-status and as DM recipient.
- Spec note: "Identify accounts by `accountId`, never by profile + platform"; a profile can hold several IG accounts.

Connection model in OR: one `ZernioConnection` per workspace {apiKey (encrypted), profileId, webhookId, webhookSecret (encrypted, random 32 bytes hex)}. Setup order (settings route):
1. `POST /api/zernio/settings {apiKey}` -> validates by calling `GET /profiles` and `GET /webhooks/settings`, stores key + generated `webhookSecret`.
2. `PUT /api/zernio/settings {profileId}` -> checks profile accessible; `ensureWebhook` (find existing by stored `_id` or same URL, else create); stores `profileId` + `webhookId`.
3. `POST /api/zernio/accounts {accountId}` -> re-lists IG accounts in profile, creates/updates `InstagramAccount` (refuses if igId already connected elsewhere/other provider).
4. New account: `POST /api/zernio/connect` -> `GET /connect/instagram?profileId&redirect_url=${BASE}/settings?zernio=connected` -> returns `authUrl`; OR validates `https` + host in {instagram.com, www.instagram.com, facebook.com, www.facebook.com, zernio.com} before handing it to the browser. User authorizes, lands back on `/settings`, then imports it via step 3.
- Spec: success redirect appends `connected=instagram&profileId=X&accountId=Y&username=Z`; failure appends `error`, `platform`, `error_message`. If `redirect_url` is on another site, Zernio first shows an exit notice page `zernio.com/connect/continue?to=...`. Optional params: `reconnectAccountId`, `expectedPlatformUserId`, `expectedUsername`, `forceReauth` (IG Login), `headless=true` (then use `POST /v1/connect/instagram/select-account`), `oauthAppId` (own OAuth app).
- DELETE settings is blocked while ZERNIO accounts exist in the workspace. Disconnecting in OR does not delete the account in Zernio.
- OR also requires `origin` header check for non-GET management calls and role OWNER/ADMIN. Per-workspace row lock (`SELECT ... FOR UPDATE` on Workspace) serializes key/profile/account changes.

### A3. Webhooks

Registration (lib/zernio/manage-remote.ts):

```ts
const EVENTS = ['comment.received', 'message.received', 'message.read'];
const body = { name: 'OpenReply', url, secret, events: EVENTS, isActive: true };
// url = `${NEXTAUTH_URL}/api/zernio/webhook/${workspaceId}`
POST /webhooks/settings  (create)      PUT /webhooks/settings  ({...body, _id})
```

- One URL per workspace; the HMAC secret is per workspace (generated by OR, stored encrypted).
- SPEC adds optional: `customHeaders`, `profileIds[]`, `accountIds[]` (scope the subscription), `disabledResourceGroups[]`. OR does NOT use them, so subscriptions are account-wide and OR filters afterwards. Max 50 webhooks/user.
- Event names used by OR: `comment.received`, `message.received`, `message.read`. Postback taps arrive as `message.received` (see below). NOT used: `message.sent`, `message.delivered`, `message.failed`, `message.edited/deleted`, `reaction.received`, `referral.received`, `conversation.started`.
- Story replies: **OR does not handle them.** SPEC: they arrive as `message.received` with `message.metadata.storyReply:{storyId, storyUrl}`; story mentions with `metadata.isStoryMention:true` and attachment `type:"share"`, `originalType:"story_mention"`. Zernio's own `/v1/comment-automations` supports `trigger: comment | live_comment | story_reply | story_mention`.

Delivery headers (SPEC): `X-Zernio-Event`, `X-Zernio-Event-Id` (UUID, stable across all retries/redeliveries = dedupe key), `X-Zernio-Signature`. Legacy duplicates `X-Late-*` still sent.

Signature verification (OR, lib/zernio/normalize-event.ts):

```ts
// header: x-zernio-signature = lowercase/uppercase hex, exactly 64 chars
if (!signature || !secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
const expected = createHmac('sha256', secret).update(rawBody).digest();   // raw request text
return timingSafeEqual(Buffer.from(signature, 'hex'), expected);
```
HMAC-SHA256 over the exact raw body, hex digest, no prefix (no `sha256=`), no timestamp. (Zernio spec says only "Optional HMAC-SHA256 signature in `X-Zernio-Signature`"; the hex/no-prefix format is inferred from OR's working implementation and its live verification doc. A replay-window/timestamp is **UNCONFIRMED / not present**.)

Webhook route behavior (`POST /api/zernio/webhook/[workspaceId]`):
1. Load `ZernioConnection` by workspaceId; no `webhookId` -> 404.
2. Read raw text, verify signature -> 401 on failure.
3. JSON parse -> 400; envelope must have `account.{id, platform:'instagram'}` else `200 {ignored:true}`.
4. Account lookup `provider=ZERNIO, zernioAccountId=account.id` in that workspace else `200 ignored` (drops other profiles before persisting anything).
5. `normalizeZernioEvent` -> Meta-shaped payload; `null` -> `200 ignored`.
6. `processInstagramWebhook` (persist `WebhookEvent`, enqueue). Failure -> **500** so Zernio retries. Retry ladder/timing: **UNCONFIRMED** (spec only says auto-disable after 3 days without success AND (20 consecutive terminal failures or 3 days failing); `POST /v1/webhooks/logs/redeliver` exists).

Payload shapes OR consumes (zod envelope):

```jsonc
// comment.received
{ "id":"<event uuid>", "event":"comment.received",
  "account": {"id":"<zernioAccountId>","platform":"instagram"},
  "comment": {"id":"<IG comment id>","platformPostId":"<IG media id>","text":"...",
              "author":{"id":"<IGSID>","username":"jane"}} }
// message.received (DM or postback tap)
{ "id":"...","event":"message.received","account":{...},
  "message": {"platformMessageId":"<mid>","direction":"incoming","text":"hi"|null,"sender":{"id":"<IGSID>"}},
  "metadata": {"postbackPayload":"reveal:<automationId>","postbackTitle":"Open"} }   // metadata only on button tap
// message.read
{ "id":"...","event":"message.read","account":{...},"conversation":{"participantId":"<IGSID>"},"statusAt":"<ISO>" }
```
Extra SPEC fields OR ignores: `comment.postId` (Zernio internal post id or null), `comment.isReply`, `comment.parentCommentId`, `comment.createdAt`, `comment.author.isOwnAccount`, `comment.author.instagramProfile.{isFollower,...}` (only present if the commenter has messaged before), `comment.ad.{id,title,originalMediaId}` (ad comments), `comment.isLive`; `message.conversationId`, `message.attachments[]`, `message.sender.{name,username,picture}`, `message.sentAt`; `metadata.quickReplyPayload`; top-level `profiles`, `test:true` (only on test fires).

Normalization (`normalizeZernioEvent`) maps to Meta webhook shape so the Meta path is reused:
- `comment.received` -> `entry.changes=[{field:'comments', value:{id, text, from:{id,username}, media:{id: platformPostId}}}]`
- `message.received` incoming + `metadata.postbackPayload` -> `entry.messaging=[{sender, postback:{mid,payload,title}}]`; else `{sender, message:{mid,text}}`. `direction:'outgoing'` echoes are dropped.
- `message.read` + `conversation.participantId` -> `messaging=[{sender:{id:participantId}, read:{watermark: Date.parse(statusAt)}}]`
- Anything else -> null (ignored).
- Caveat: ad `original_media_id` is NOT mapped for Zernio (OR reads only `platformPostId`), so ad-comment->original-post matching (`originalMediaId`) is a Meta-only path. SPEC exposes `comment.ad.originalMediaId` so a new build can add it.

Dedupe (OR does NOT use `X-Zernio-Event-Id`):
- Queue jobId: `comment_<igId>_<commentId>`; postback `postback_<igId>_<userId>_<mid-or-payload with ':'->'_'>`; message `message_<igId>_<base64url(mid)>`; read fallback `read_fallback_<igId>_<userId>_<automationId>`.
- DB: `DmLog @@unique([automationId, commentId])`, `PostbackDelivery.id` (sha256 of account/automation/user/mid) as a durable "this tap already delivered" claim.
- A new build should additionally dedupe on `X-Zernio-Event-Id` (UNIQUE column) at the webhook layer.

### A4. Sending (all via `sendZernioMessage` / `sendCommentReply`)

Private reply to a comment (one per comment, within 7 days, IG + FB only):
```
POST /inbox/comments/{postId ?? commentId}/{commentId}/private-reply
body: { accountId, message, buttons?: Button[] }     // no idempotency header in OR
-> { messageId } | { data:{ messageId } }
```
`postId` = IG media id (OR passes the comment's `mediaId`; falls back to commentId).

Public comment reply:
```
POST /inbox/comments/{postId ?? commentId}
body: { accountId, commentId, message }
-> { data: { commentId } }        // missing -> treated as delivery UNCONFIRMED
```
SPEC supports `Idempotency-Key` here (24 h retention); OR does not send it.

DM text / DM with buttons to a user (user already has an open thread, i.e. messaged us or tapped):
```
POST /inbox/conversations/{recipientIGSID}/messages          // OR puts the IGSID in the {conversationId} slot
headers: Idempotency-Key: sha256({operationId, path, body})  // operationId = `${jobId}:${automationId}`
body: { accountId, message, buttons? }
-> { messageId } | { data:{ messageId } }
```
**UNCONFIRMED:** SPEC says `{conversationId}` is "opaque ... accepted verbatim from the list endpoint or from the conversationId on inbox webhooks. Format not to be assumed". OR passes the IGSID there and its live verification doc says DMs to existing conversations worked (private-reply path was the one live-tested). A new build should use `message.conversationId` from the webhook, or `GET /inbox/conversations?accountId=` to resolve it, or confirm IGSID acceptance. SPEC also mentions `POST /v1/inbox/conversations` (open a new thread) - not read in detail.

Buttons shape (SPEC + OR), 1-3 per message, rendered as Meta button_template:
```jsonc
{ "type":"url",      "title":"Open link", "url":"https://yourapp/r/<slug>?r=<token>" }   // title <= 20 chars
{ "type":"postback", "title":"I'm following", "payload":"followcheck:<automationId>" }  // payload opaque string
```
- OR truncates button titles to 20 and, when buttons are present, the body text to **640 chars** (SPEC: >640 with buttons is a 400).
- `buttons` and `quickReplies` are mutually exclusive. Quick replies (`{title<=20, payload, imageUrl?}`, max 13) exist in SPEC but OR does **not** use them (they don't render in the Message Requests folder; buttons do).
- OR link buttons: up to 3 (`linkButtons()` slices 3). The campaign UI exposes at most 2.
- Non-follower caveat (SPEC): IG may refuse buttons/cards to commenters who don't follow (Meta code 2 subcode 1545133, non-retryable 400) and that failed call still consumes the comment's single private reply. Suggested mitigation in SPEC: send plain text, add buttons after they reply. OR's text-fallback (`isTemplateRejection`) only triggers for Meta code 100, which Zernio errors never produce (`ZernioApiError` -> false), so on Zernio there is no automatic text fallback.

Postback payload convention (OR-defined, opaque to Zernio):
- `reveal:<automationId>[:open]` and `followcheck:<automationId>[:open]`; `:open` marks a tap on the opening-DM button vs the follow-prompt button.

Follow-status check:
```
GET /accounts/{accountId}/follow-status/{IGSID}?refresh=true
-> { userId, accountId, isFollower: boolean|null, isFollowedByAccount, followerCount, isVerified, username, name,
     unavailableReason: "consent_required"|"dm_access_disabled"|"not_messageable"|"error"|null }
```
- `null` = unknown, never "no". Meta only resolves follow status for people who have messaged the account, so a pure commenter is typically `null` + `consent_required`. `refresh=true` bypasses the short cache (use right after asking them to follow).
- OR swallows errors -> returns `null`.
- OR policy at comment time on Zernio: prompt only if `=== false` (so `null` falls through and sends the link; for Meta it prompts unless `=== true`). On tap (`followcheck`): `false` -> delayed recheck/prompt; `true`/`null` -> deliver link (fail-open). On read-fallback: needs `=== true`.
- SPEC alternative: Zernio comment-automation `audience`/`followGate` does this server-side (sends a one-tap confirmation DM).

Limits:
- **750 private replies / hour / IG account** (Meta documented; enforced by OR's Redis limiter, not by Zernio). Over limit: requeue +30 min, up to 3 requeues, then `SKIPPED_RATE_LIMIT`.
- Private reply: once per comment, within 7 days. Plain DMs: Meta's 24 h messaging window after the user's last message (OR: closed-window errors are expected for the read-fallback).
- Button text body 640 chars; button title 20; max 3 buttons; quick replies max 13; Zernio `postbackData` max 2048 (spec for ads/other sections); inbox send rate: 429 `new_contact_limit` pacing (>=2 min apart per sender to contacts who haven't written in 24 h; WhatsApp-focused text, applicability to IG UNCONFIRMED).
- Zernio API throughput: 60/600/1200 req/min; 1,800/h for inbox comment-list reads.
- OR campaign caps: `dmMessage` <= 1000, public replies <= 10 variants x 1000, keywords <= 10 x 50 chars, link/follow-prompt button labels <= 20, opening-DM button label <= 64 (DB) though sent truncated to 20, `followUpDelayMinutes` 0-1440.

### A5. Reads

| Need | Call | Mapping |
|---|---|---|
| Posts (latest 25) | `GET /accounts/{accountId}/posts` -> `{posts:[{id,message,createdTime,picture,permalink,mediaType,likeCount,commentCount}], lastUpdated}` | `id` = IG media id (used as `postId`); reel detected by permalink regex `instagram.com/reel/`; `mediaType` video->VIDEO, carousel->CAROUSEL_ALBUM. SPEC: returns the 25 most recent, read live. No pagination, older posts unreachable via this call. |
| Comments on a post | `GET /inbox/comments/{mediaId}?accountId=&limit=100&cursor=` -> `{comments:[{id,message,createdTime,from:{id,username},replies:[{id,from}]}], pagination:{hasMore,cursor}}` | used by the reconciler (owner-reply check via `replies[].from.id === igId`) |
| Conversations | `GET /inbox/conversations?accountId=&limit=50` -> `{data:[{id,participantId,participantUsername,updatedTime,lastMessage}]}` | `lastMessage` has no direction so OR omits the preview |
| Conversation messages | `GET /inbox/conversations/{id}/messages?accountId=&limit=20&sortOrder=desc` -> `{messages:[{id,message,senderId,direction,createdAt}]}` | outgoing = our IG id |
| Send reply in inbox | same DM send as A4 (`POST /inbox/conversations/{id}/messages`). OR's inbox route file (`app/api/instagram/conversations/[id]/route.ts`) was not read, so the exact wiring is **UNCONFIRMED** (it uses `sendDirectMessage` from the provider layer by design). |
| Follower count (current) | `GET /accounts?platform=instagram` -> `accounts[]._id === accountId` -> `followersCount` (can be up to 24 h stale per OR doc) |
| Follower history | `GET /analytics/instagram/follower-history?accountId&metrics=follower_count&metricType=time_series&since=YYYY-MM-DD&until=YYYY-MM-DD` (90 days) -> `{accountId, metrics:{follower_count:{values:[{date,value}]}}}` |
| Post analytics | `GET /analytics?postId=<mediaId>&accountId&platform=instagram` -> `platformAnalytics[].analytics.{views,reach,likes,comments,saved,shares,lastUpdated}`; needs Zernio analytics add-on and synced data. |
| Recipient username | no Zernio lookup; OR returns null (falls back to cached DmLog name, else "there"). Zernio `follow-status` returns `username`, a possible source. |

---------------------------------------------------------------------------------------------

## B. OpenReply product model

### B1. `Automation` (campaign) fields (prisma)

| Field | Type / default | Notes |
|---|---|---|
| id, workspaceId, instagramAccountId | | `@@index` on each + `postId` |
| name (<=100), goal (<=120, optional) | | |
| postId, postUrl | String? | bound IG media id/permalink |
| matchAnyPost | Boolean false | "any post" |
| pendingNextReel | Boolean false | "next reel": campaign created before the reel exists; bound later |
| keywords | String[] (<=10, each <=50) | |
| matchAnyWord | Boolean false | fires on every comment/DM |
| wholeWordMatch | Boolean **true** | true = whole word; false = partial/substring |
| dmTriggerEnabled | Boolean false | also fire on inbound DM text matching keywords |
| dmMessage | String (<=1000) | final reveal message; supports `{username}` and `{link}` |
| openingDmEnabled / openingDmMessage / openingDmButtonLabel | Bool / String? / String? | 2-step flow: opening DM with postback button, tap reveals dmMessage |
| linkButtonLabel | String? (<=20) | label of first link button |
| requireFollow, followPromptMessage, followPromptButtonLabel (<=20, default "i'm following") | | follow gate |
| followUpEnabled, followUpMessage, followUpDelayMinutes (0-1440) | | "thank-you" DM after the link is delivered |
| publicReplyEnabled, publicReplyMessage (legacy), publicReplyMessages String[] (<=10) | | random variant per comment |
| isActive | Boolean true | |
| reportShareSlug (unique), reportShareEnabled | | public report page `/reports/[shareSlug]` |
| createdAt/updatedAt | | next-reel binding uses `createdAt` |

Relations: `trackedLinks[]`, `dmLogs[]`, `linkClicks[]`. API schema also takes `trackedDestinationUrl`, `secondaryDestinationUrl`, `secondaryButtonLabel` (<=20) -> synced into `TrackedLink` rows (`lib/campaigns/links.ts`), i.e. **up to 2 link buttons** in the UI (the sender supports up to 3). Validation refines: must have post OR matchAnyPost OR pendingNextReel; must have keyword OR matchAnyWord; opening DM needs message + label. Tokens: `{username}` (case-insensitive; fallback "there") and `{link}` (replaced by tracked URL, or stripped when links go as buttons).

Matching (`lib/utils/keyword-matcher.ts`): text and keyword normalized identically: Arabic-script folding, strip emoji/specials (keeps `\p{L}\p{N}\p{M}`), diacritic fold on Latin only, lowercase, numeric-like keywords fold `o`->`0`. Whole-word = regex `(?<![\p{L}\p{N}])kw(?![\p{L}\p{N}])` with `iu`; partial = `includes`. First matching keyword is stored as `DmLog.matchedKeyword`.

### B2. `DmLog` (one row per automation x trigger)

Fields: id, workspaceId, automationId, instagramAccountId, commenterId (IGSID), commenterName, commentText, **commentId** (also synthetic ids: `reveal:<userId>` for button-tap reveals with `commentText:"(button tap)"`, `dm:<messageId>` for DM-triggered), matchedKeyword, **status** (DmStatus), attempts (int), dmSentAt, errorMessage, dmDeliveryUnconfirmed, publicReplyDeliveryUnconfirmed, publicReplySentAt, publicReplyError, createdAt/updatedAt. `@@unique([automationId, commentId])`.

`DmStatus`: `PENDING, SENT, FAILED, SKIPPED_DEDUP, SKIPPED_RATE_LIMIT, SKIPPED_PLAN_LIMIT, SKIPPED_NO_MATCH` (NO_MATCH not set by the worker I read).

Reasons recorded in `errorMessage` (strings):
- `No Instagram access token available` / `Failed to decrypt Instagram access token` (FAILED)
- `Another campaign (<name>) already sent the one private reply Instagram allows for this comment` (SKIPPED_DEDUP)
- `Monthly DM limit reached (<limit>)` (SKIPPED_PLAN_LIMIT; the limit is effectively unlimited, 2,000,000,000, in the self-hosted build)
- `Hourly Instagram DM rate limit reached` (SKIPPED_RATE_LIMIT) / `Hourly rate limit hit; retry scheduled` (PENDING)
- `Message delivery is unconfirmed; automatic retries stopped. Inspect the Instagram inbox before retrying. ...` (FAILED + `dmDeliveryUnconfirmed=true`)
- provider error text `ZernioApiError ...`/`Zernio request failed (HTTP n)` (FAILED)
- Public reply leg is independent: `publicReplySentAt`, `publicReplyError`, `publicReplyDeliveryUnconfirmed`.
Other models: `WebhookEvent {payload Json, status PENDING|PROCESSED|FAILED, errorMessage, processedAt}`, `OperationalEvent {source WORKER|TOKEN_REFRESH|HEALTH|SYSTEM, level, message, payload, resolvedAt}` (worker failures, comment sweeps, "Follow gate rejected a button tap"), `PostbackDelivery {id, createdAt}`, legacy unused `ProcessedComment`.

### B3. Tracked links / clicks

- `TrackedLink {id, workspaceId, automationId, slug (unique, 7 random bytes base64url), label, destinationUrl, position Int (button order; always order by position, not createdAt)}`.
- Public redirect `GET /r/[slug]?r=<token>`: inserts `LinkClick {workspaceId, automationId, instagramAccountId, trackedLinkId, ipHash (sha256(NEXTAUTH_SECRET:ip)), recipientHash, userAgent, referrer, createdAt}` then 302 to `destinationUrl`. Not found -> 302 `/`.
- `?r=` = `hashRecipientId(igsid)` = first 22 chars of base64url HMAC-SHA256(`NEXTAUTH_SECRET`, `recipient:<igsid>`); validated by `/^[A-Za-z0-9_-]{22}$/`. Unique clicks are counted per recipientHash, falling back to ipHash.
- Message URL form: `${NEXTAUTH_URL}/r/<slug>?r=<token>`. First link button label = `linkButtonLabel`, others = link `label`, default "Open link".

### B4. Templates, follower history, reports

- Templates: static TS (`lib/templates/campaign-templates.ts`), slugs `dtc-product-link, real-estate-lead-form, fitness-plan, course-webinar, beauty-price-list, restaurant-menu, event-rsvp, creator-media-kit`, each with starter `keywords` (e.g. `["LINK","SHOP","BUY"]`), copy and tips; SEO pages at `/templates/[slug]`. Not stored in DB. Campaign import (CSV) at `/campaigns/import` + `lib/import-queue.ts`.
- `FollowerSnapshot {instagramAccountId, date @db.Date, followersCount, backfilled}` unique (account, date). Daily cron `snapshot-followers` (05:00 UTC in the self-hosted scheduler) records today's count; backfill reconstructs <=30 days from deltas on Meta; on Zernio the series comes from `follower-history` (90 days). Observed count overrides a backfilled one.
- Reports: owner dashboard + public `/reports/[shareSlug]` (per-campaign, last 7 days by day, status summary SENT/FAILED/skipped, link clicks, unique clicks, CTR = clicks/sent, top keywords). Slug generated per campaign (`generateReportShareSlug`).
- Other cron-ish jobs: `/api/cron/refresh-tokens` (Meta only; no-op for Zernio), `/api/cron/attach-next-reel`, `/api/cron/snapshot-followers`. Secret: `Authorization: Bearer CRON_SECRET (fallback NEXTAUTH_SECRET)`.

### B5. Worker send pipeline (lib/queue/dm-worker.ts, worker/dm-worker.ts)

Queue: BullMQ queue `dm-processing`, concurrency 5, `attempts: 3`, custom backoff [5 min, 15 min, 45 min], `removeOnComplete 1000`, `removeOnFail age 300s/count 2000`. Job names: `process-comment` (default), `process-postback`, `process-followup`, `process-message`.

**Comment path (`processComment`)**, per matching active automation (ordered by createdAt):
1. Select automations where `postId in (mediaId, originalMediaId)` or `matchAnyPost`, `isActive`, account = ig id. Keyword match (or `matchAnyWord`).
2. Load `DmLog`. Skip if SKIPPED_PLAN_LIMIT, or nothing left to do (DM sent/uncertain/>=3 attempts AND public reply done/uncertain/disabled).
3. Upsert `DmLog PENDING`.
4. **Public reply leg first** (independent of DM): if enabled and variants exist and not sent/uncertain, atomically claim (`publicReplyDeliveryUnconfirmed=true`), pick random variant, render `{username}`/links, `POST /inbox/comments/{mediaId}`; success sets `publicReplySentAt`; error stores `publicReplyError` and keeps the claim unless confirmed rejection.
5. DM leg: skip if SENT/uncertain/exhausted. **Private-reply dedupe**: if another campaign already has a SENT log for the same `commentId` -> `SKIPPED_DEDUP` (IG allows exactly one private reply per comment).
6. Workspace usage reservation (monthly counter; effectively unlimited).
7. **Rate limiter** `reserveDMSlot(igId, requeueAttempt)` (Redis Lua: INCR with 3600 s TTL, max 750). Blocked -> if `requeueAttempt >= 3` `SKIPPED_RATE_LIMIT`, else `PENDING` + re-enqueue delayed 30 min with jobId `comment_<ig>_<cid>_retry_<n+1>`.
8. Decide message variant:
   - opening DM enabled (+message+label) -> private reply with postback button, payload `(requireFollow ? 'followcheck' : 'reveal'):<id>:open`.
   - else if `requireFollow` and follow status says "not a follower" (Zernio: `=== false`; Meta: `!== true`) -> follow prompt with postback button `followcheck:<id>`.
   - else if tracked links -> private reply with URL button(s) (body without `{link}`); on Meta code-100 template rejection falls back to inline text links (not on Zernio).
   - else plain private reply with `{link}` replaced.
9. Atomic DM claim (`claimCommentDelivery('dm')`), send, then `SENT` + `dmSentAt`, `dmDeliveryUnconfirmed=false`. On failure: classify; confirmed rejection releases Redis slot + usage reservation; unconfirmed keeps them; log `FAILED`; rethrow (unconfirmed -> UnrecoverableError, others retry per backoff).

**Postback path (`processPostback`)** for `reveal:` / `followcheck:` payloads:
- Resolve automation (active, same IG id). `commenterName` via `resolveRecipientName` (cached DmLog name, else Meta lookup; null on Zernio).
- `operationId = sha256([accountId, automationId, userId, mid ?? jobId ?? payload])`.
- **Follow gate state machine** (only when `requireFollow` and payload is `followcheck:` or this is the read fallback):
  - `follows === true` -> reveal.
  - `follows === null` on a tap -> fail-open, reveal. On a read-fallback anything but `true` -> silently stop (gate cannot be bypassed by reading).
  - `follows === false`, tap on the **opening-DM button** (`:open`) -> immediately send follow prompt (DM with postback button `followcheck:<id>`, via `sendPostbackOnce`).
  - `follows === false`, tap on the **prompt's own button** -> delayed rechecks: re-enqueue same job with `followRecheckAttempt+1` after 20 s then 40 s (`FOLLOW_RECHECK_DELAYS_MS="20000,40000"`; jobId bucketed by window `postback_recheck_<auto>_<user>_<n>_<floor(now/delay)>`). Optional ack DM (`FOLLOW_RECHECK_ACK_MESSAGE`, Redis `SET NX PX` per user). After the last false: log `OperationalEvent "Follow gate rejected a button tap"` and re-send the prompt. Reason for rechecks: IG still showed `false` 17 s after a follow, `true` by ~68 s.
- Reveal: reserve usage, `sendPostbackOnce` (insert `PostbackDelivery(id=operationId)`; unique violation = already delivered -> skip; confirmed rejection deletes the claim so a retry can send), `sendRevealDirectMessage` (URL buttons w/ plain-text fallback on Meta, or plain DM), then upsert `DmLog(commentId='reveal:<userId>', commentText='(button tap)')` SENT; optional follow-up job.
- **Follow-up**: if `followUpEnabled`, enqueue `process-followup` with `delay = followUpDelayMinutes*60000`, jobId `followup_<auto>_<user>` (one per user); sends `followUpMessage` as plain DM, errors only logged.
- **Read fallback**: on `message.read` for a user with a SENT opening-DM log, enqueue `process-postback {payload:'reveal:<id>', fallback:true}` delayed **5 min**, jobId `read_fallback_...`; delivers only if no tap delivered it and (when `requireFollow`) follow `=== true`; closed-window rejection is swallowed (expected).

**Inbound DM path (`processMessage`)** for `dmTriggerEnabled` automations: keyword match on DM text; dedupe `commentId='dm:<mid>'`; follow gate (prompt if not confirmed follower; Zernio: prompt only if `=== false`); then reveal DM with the same buttons logic. Echoes (`is_echo`) dropped at parse time; OR's Zernio normalizer drops `direction:'outgoing'`.

**Reconciler (polling safety net, lib/polling/comment-reconciler.ts)**
- Runs inside the worker process: first run 10 s after boot, then every `COMMENT_POLL_INTERVAL_MS` = **5 min**. Each run first calls `attachPendingNextReels()`, then `reconcileComments()`.
- For every active automation: media = its `postId` (+ ad media ids recovered from `WebhookEvent` payloads in last 90 days; Meta only) or, for `matchAnyPost`, the **10 latest posts**.
- Fetch comments (Zernio: `GET /inbox/comments/{mediaId}`, 100/page, up to 800), keep `createdTime >= now - 72 h` (`COMMENT_POLL_LOOKBACK_HOURS`), drop own comments, keyword-match, drop comments the account owner already replied to, drop ones with a handled `DmLog` (DM SENT/plan-skipped/uncertain/attempts>=3 AND public-reply done/uncertain/disabled).
- Oldest first, cap **30 new per campaign per sweep** (`COMMENT_POLL_MAX_PER_SWEEP`). Enqueue `process-comment` with **no** jobId (so retained jobs can't suppress), `source:'POLLING'`. Writes an `OperationalEvent` when something was enqueued/errored.
- Why: webhooks miss comments; the comment-list API is rate limited; Zernio itself runs a 10-minute re-read for its native automations (SPEC).

**Next-reel binding (lib/automation/attach-next-reel.ts)**: for `pendingNextReel=true` campaigns, group by account, `getUserMedia(limit 25)`, keep reels (`media_product_type==='REELS'`, Zernio infers from permalink `/reel/`), sort ascending by timestamp, bind the **earliest reel with timestamp > automation.createdAt**: set `postId`, `postUrl`, `pendingNextReel=false`. Runs every poll (5 min) plus `/api/cron/attach-next-reel` every 5 min in self-hosted scheduler (vercel.json daily). Caveat: Zernio `posts` returns only 25 and `lastUpdated` may lag.

---------------------------------------------------------------------------------------------

## C. Redis / BullMQ dependencies and a Postgres-queue + pg_cron mapping

| Redis/BullMQ piece | What it does | Postgres replacement |
|---|---|---|
| `Queue dm-processing` + jobs | durable job store; 4 job types | table `dm_jobs(id, kind, payload jsonb, dedupe_key text UNIQUE, run_at timestamptz, attempts int, max_attempts int default 3, status queued/running/done/failed/dead, locked_at, last_error)` |
| `jobId` dedupe (`comment_<ig>_<cid>`, postback, message, followup, read_fallback) | idempotent enqueue | `INSERT ... ON CONFLICT (dedupe_key) DO NOTHING`. Note BullMQ silently drops adds whose id is still retained; reconciler intentionally used no jobId. Mirror that: reconciler inserts with null/unique key and relies on DmLog claims |
| `delay` (30 min requeue, 20/40 s rechecks, 5 min read fallback, followUp N min, retry backoff 5/15/45 min) | scheduling | `run_at = now() + interval`; worker claims `WHERE status='queued' AND run_at <= now()` |
| Worker concurrency 5 | parallel processing | `SELECT ... FOR UPDATE SKIP LOCKED LIMIT n` in a claim function; lease via `locked_at` with reaper (re-queue rows locked > N min) |
| attempts 3 / custom backoff / UnrecoverableError | retry policy | `attempts` + `run_at = now() + backoff[attempts]`; `unconfirmed` outcome -> `status='dead'` w/o retry |
| Redis rate limiter `rate:dm:<ig>` (Lua INCR, TTL 3600, max 750, DECR on release) | 750/h/account | table `ig_dm_rate(account_id, window_start, count)` with atomic `INSERT ... ON CONFLICT DO UPDATE SET count = count+1 WHERE count < 750 RETURNING`, window = `date_trunc('hour', now())`; or count `DmLog` rows with `dmSentAt > now()-interval '1 hour'` (fixed window in OR is rolling-from-first-hit; either is acceptable). Release on confirmed rejection = decrement |
| `follow_recheck_ack:<auto>:<user>` NX with TTL | one ack per recheck cycle | unique row / `dm_log` flag or `INSERT ... ON CONFLICT DO NOTHING` with `expires_at` |
| Worker heartbeat (`recordWorkerHeartbeat`, `/api/health`) | liveness | `lib/ops/worker-health.ts` NOT read: **UNCONFIRMED** whether it writes Redis or Postgres. Replace with `last_run_at` row updated by each cron tick |
| Reconciler `setInterval` 5 min (+10 s boot) | safety-net poll | pg_cron job every 5 min (or every minute with a per-account cursor) calling the sweep (edge function via `pg_net`, or a SQL function that only enqueues "sweep account X" jobs) |
| attach-next-reel (5 min) | bind reels | same cron, or fold into the sweep |
| daily cron: refresh-tokens (Meta only), snapshot-followers (05:00 UTC) | housekeeping | pg_cron daily; refresh-tokens unnecessary for Zernio |

Design notes for a "queue table + 1-minute pg_cron":
1. **Tick**: `* * * * *` -> `pg_net.http_post` to a worker Edge Function (or equivalent) with a service secret; function claims up to N due jobs with SKIP LOCKED and processes them within a ~50 s budget, looping until empty or time-out. Keep the webhook route itself fast: verify signature, insert `webhook_events` (UNIQUE on `X-Zernio-Event-Id`) and `dm_jobs`, return 200 (OR already persists then enqueues; 500 on failure so Zernio retries).
2. **1-minute granularity vs 20 s / 40 s follow rechecks**: either coarsen to 60 s and 120 s (measured: follow visible by ~68 s, so the first 60 s check may still miss; choose 45-75 s then 120 s), or let the claiming function sleep-loop within one invocation, or use pg_cron sub-minute `'N seconds'` schedules (supported only in newer pg_cron; **UNCONFIRMED** for the target Supabase version).
3. **Ordering/atomicity of the sends** is NOT in Redis: it is already Postgres (`DmLog` atomic claims with `updateMany`, `PostbackDelivery` unique id, `@@unique(automationId, commentId)`). Those port 1:1; they are what guarantees "never send twice".
4. **Concurrency**: BullMQ concurrency 5 with in-process per-DM sends. With a cron tick, cap per-tick throughput by per-account rate (750/h ~ 12.5/min) rather than by worker count. Zernio API itself: 600 req/min paid; each comment DM = 1-3 calls (public reply, private reply, follow-status).
5. **Redis not otherwise needed**: no pub/sub, no sessions in Redis (auth uses Prisma/NextAuth with DB). `REDIS_URL` is the only env dependency (`lib/env.ts` requires it).
6. **Zernio-native alternative worth weighing**: `POST /v1/comment-automations` (SPEC) already implements keyword matching (`matchMode: exact|contains|word`, `excludeKeywords`, `typoTolerance`), DM + buttons + templates, `commentReply` + variations, `dmDelaySeconds`, `followGate`/`audience`, `linkTracking`, `repeatPolicy`, `trigger: comment|live_comment|story_reply|story_mention`, per-post or account-wide, with a 10-minute poll fallback. OpenReply deliberately does NOT use it (its docs warn that a duplicate Zernio automation would double-send). Using it would remove the whole queue/reconciler, at the cost of Zernio-side control of logic and logs. Field-level details not read: **UNCONFIRMED**.

---------------------------------------------------------------------------------------------

## D. Quick reference: Zernio calls (all relative to `https://zernio.com/api/v1`)

```
GET    /profiles
GET    /accounts?profileId=&platform=instagram
GET    /accounts?platform=instagram                       (followersCount)
GET    /connect/instagram?profileId=&redirect_url=        -> {authUrl}
GET    /webhooks/settings            POST /webhooks/settings            PUT /webhooks/settings   DELETE /webhooks/settings?id=
GET    /accounts/{accountId}/posts                        (25 latest)
GET    /accounts/{accountId}/follow-status/{igsid}?refresh=true
GET    /inbox/comments/{mediaId}?accountId=&limit=100&cursor=
POST   /inbox/comments/{mediaId}                          {accountId, commentId, message}
POST   /inbox/comments/{mediaId}/{commentId}/private-reply {accountId, message, buttons?}
GET    /inbox/conversations?accountId=&limit=50
GET    /inbox/conversations/{id}/messages?accountId=&limit=20&sortOrder=desc
POST   /inbox/conversations/{id}/messages                 {accountId, message, buttons?}  + Idempotency-Key
GET    /analytics?postId=&accountId=&platform=instagram
GET    /analytics/instagram/follower-history?accountId=&metrics=follower_count&metricType=time_series&since=&until=
```
Webhook inbound: `POST <your url>` with `X-Zernio-Signature` (HMAC-SHA256 hex of raw body, secret = the one you registered), `X-Zernio-Event`, `X-Zernio-Event-Id`.

Other SPEC endpoints that may matter and were not used by OR: `GET /v1/accounts/follower-stats`, `GET /v1/accounts/{id}/health`, `POST /v1/webhooks/test`, `GET /v1/webhooks/logs`, `POST /v1/webhooks/logs/redeliver`, `GET/POST/PUT /v1/comment-automations`, `GET /v1/accounts/{id}/webhook-subscription`, `GET/POST /v1/accounts/{id}/instagram-ice-breakers`, `POST /v1/inbox/conversations/{id}/read`, `POST /v1/inbox/comments/{postId}/{commentId}/hide`.

---------------------------------------------------------------------------------------------

## E. Open questions / UNCONFIRMED summary

1. Whether `POST /inbox/conversations/{conversationId}/messages` accepts a raw IGSID in the path (OR does it; spec calls the id opaque).
2. Zernio webhook retry schedule and exact HTTP status semantics Zernio expects (OR returns 500 to request retry).
3. Signature has no timestamp/replay protection that I could see; `sha256=` prefix not used by OR.
4. `lib/ops/worker-health.ts` and the inbox conversation route handler were not read (Redis vs Postgres for heartbeat; exact inbox send wiring).
5. Whether the Zernio inbox send rate/pacing rules (`new_contact_limit`, 131056) apply to Instagram (text is WhatsApp/threads-oriented).
6. pg_cron sub-minute scheduling availability in the target Postgres host.
7. Native comment-automation field semantics (only partially read).

## F. Source files read

OpenReply (raw.githubusercontent.com/diwenne/openreply/main/...):
`docs/zernio.md`, `docs/zernio-verification.md`, `docs/delivery-retries.md`, `lib/zernio/client.ts`, `lib/zernio/manage-remote.ts`, `lib/zernio/normalize-event.ts`, `lib/zernio/route-handler.ts`, `lib/zernio/load-connection.ts`, `lib/zernio/lock-connection.ts`, `lib/zernio-links.ts`, `app/api/zernio/settings/route.ts`, `app/api/zernio/accounts/route.ts`, `app/api/zernio/connect/route.ts`, `app/api/zernio/webhook/[workspaceId]/route.ts`, `lib/instagram/provider.ts`, `context.ts`, `send-messages.ts`, `read-content.ts`, `read-inbox.ts`, `read-analytics.ts`, `recipient-name.ts`, `delivery-errors.ts`, `lib/queue/client.ts`, `comment-delivery.ts`, `process-webhook.ts`, `dm-worker.ts`, `worker/dm-worker.ts`, `lib/polling/comment-reconciler.ts`, `lib/automation/attach-next-reel.ts`, `lib/utils/rate-limiter.ts`, `lib/utils/keyword-matcher.ts`, `lib/tracking/message.ts`, `lib/tracking/server.ts`, `app/r/[slug]/route.ts`, `lib/templates/campaign-templates.ts`, `lib/reports/follower-history.ts`, `lib/reports/data.ts` (grep), `lib/billing/usage.ts`, `lib/env.ts` (grep), `lib/meta/webhook.ts` (grep), `app/api/automations/route.ts`, `components/campaign-builder.tsx` (grep), `prisma/schema.prisma`, `scripts/cron.sh`, `vercel.json`, git tree listing.
Zernio: `https://zernio.com/llms.txt`, `https://zernio.com/openapi.yaml` (sections: rate limits, webhook events/payload schemas WebhookPayloadComment / WebhookPayloadMessage / MessageDeliveryStatus, `/v1/webhooks/settings`, `/v1/connect/{platform}`, `/v1/accounts`, `/v1/accounts/{id}/posts`, `/v1/accounts/{id}/follow-status/{userId}`, `/v1/inbox/comments/*`, `/v1/inbox/conversations/*`, `/v1/comment-automations`).
