# Batch Staging (1–10 styles per upload) — Design

**Date:** 2026-04-19
**Status:** Design approved; pending spec review
**Scope:** New API surface (`/api/stage/batch`, `/api/jobs/batch`), new `BATCH_JOB` DynamoDB record, client wizard step converts to multi-select, result page converts to slider-led layout with variant list, per-image credit refund on silent backend failure.
**Out of scope:** Pricing tier redesign (credit values and bundle prices are a separate sub-project); re-wiring the dormant conversational-edit feature; Play Store deployment; Gemini Batch API (the async 24-hour endpoint — explicitly rejected because it doesn't match the live-loading UX).

---

## Background

Today every staging is single-style. An agent who wants to see the same empty room in four or five aesthetics has to re-enter the wizard four or five times, each run 30–60 s, each one re-uploading / re-selecting / re-running analysis. That's friction, and it's wasted Gemini spend on re-doing identical analysis calls.

This spec adds one change: **the wizard's style step becomes a multi-select of 1–10 styles, and everything downstream fans out to parallel Gemini calls**. The result page shows a before/after slider as its centrepiece; a readable variant list swaps the currently-active image in the slider. Same page serves the loading state — rows transition from "Generating…" to "Ready" as each sub-Lambda finishes.

---

## Positioning & Constraints (Locked)

- **Batch size cap: 10 styles.** Matches the Gemini Tier-1 rate limit (10 images per minute), so no per-Lambda 429 backoff logic is needed.
- **Backwards compatible at 1 style.** Selecting 1 style and hitting Continue routes through the existing `/api/stage` path exactly as today — no behaviour change for the single-style flow. Only 2+ selections route to `/api/stage/batch`.
- **Shared analysis.** Today's `/api/analyse` cache key is `(hero, style, notes, refs)`. Because every batch sub-job uses the same hero + notes + refs, we drop `style` from the cache key for the batch pass and run analysis once; the result is passed to every sub-Lambda via the existing `roomAnalysis` param.
- **Shared notes.** Per-style notes are explicitly rejected — one notes entry applies to all selected styles. This mirrors how agents actually brief a listing.
- **Shared references.** Already shared today; no change.
- **Admin-only-public-images rule unchanged.** The batch path produces user-scoped stagings, not public assets.

---

## Architecture

```
Wizard (style step, multi-select)
         │
  if N == 1:           if N > 1:
      │                    │
 /api/stage          /api/stage/batch
      │                    │
      │         ┌──────────┴──────────┐
      │         │  deduct N credits   │
      │         │  run analysis 1×    │
      │         │  create BATCH_JOB   │
      │         │  async invoke N×    │
      │         └──────────┬──────────┘
      │                    │
      │          N × (existing Lambda)
      │                    │
      │         each writes its own:
      │           - JOB#{subJobId}
      │           - STAGING#{ts}#{ulid}   (gallery record)
      │           - SESSION#{sessionId}   (for future edits)
      │           - replay/{ulid}.json    (S3, for future edits)
      │           - increments BATCH_JOB.completed (atomic)
      │                    │
      └───────── /api/jobs ◄───── client polls /api/jobs/batch?id={batchId}
                                  every 3s, receives per-sub-job status
                                  + whatever signed URLs have landed so far
```

The Lambda itself does **not change**. The fan-out lives entirely in `/api/stage/batch` and the new poll endpoint. Everything downstream reuses current patterns.

---

## Data Model

### New: `BATCH_JOB` record

```ts
interface BatchJob {
  pk: string;            // BATCH#{batchId}
  sk: string;            // META
  batchId: string;       // ulid
  userId: string;
  heroS3Key: string;
  referenceS3Keys: string[];
  roomTypes: string[];
  notes: string;
  roomAnalysis: string;  // shared, pre-computed
  subJobs: Array<{
    jobId: string;         // ulid matching a JOB#{jobId}/META record
    style: string;
    status: 'pending' | 'running' | 'done' | 'error';
    stagedS3Key?: string;  // set when done
    sessionId?: string;    // set when done
    error?: string;        // set when error
  }>;
  total: number;         // N
  completed: number;     // atomic counter, increments on sub-Lambda completion
  failed: number;        // atomic counter, increments on sub-Lambda failure
  refundedCredits: number;
  createdAt: string;
  expiresAt: number;     // 7-day TTL, aligned with STAGING records
}
```

`completed + failed === total` ⇒ batch is terminal. The client stops polling.

### Existing records — unchanged

`STAGING#{ts}#{ulid}` / `JOB#{jobId}/META` / `SESSION#{sessionId}/META` / `replay/{ulid}.json` all keep their current shapes. Each sub-Lambda writes the same records it does today, plus one extra atomic update to the parent `BATCH_JOB`.

### Client-side checkpoint

`localStorage['stageright:pending-batch']` holds `{ batchId, startedAt }`, same shape as the existing `pending-job` checkpoint. On page reload, if within a 20-minute window and the batch is still running, the wizard skips straight to the slider-led result page in polling mode — exactly the resume behaviour today's single stagings have, scaled up.

---

## API Surface

### `POST /api/stage/batch`

Request (JSON):
```ts
{
  heroS3Key: string;
  referenceS3Keys?: string[];
  roomTypes: string[];
  styles: string[];         // length 1–10, must be unique, must be valid STAGING_STYLES
  notes?: string;
  quality: 'standard';      // HD rejected for V1 — always standard. HD batch support deferred.
}
```

Behaviour:
1. Auth via `getSession()`. 401 if absent.
2. Validate `styles`: length, uniqueness, membership in `STAGING_STYLES`.
3. **Deduct `styles.length` credits atomically.** Admins bypass. On insufficient balance, return 402 with current balance.
4. Run `/api/analyse` logic inline (extracted to a reusable module) **once**, passing hero + refs + notes + roomTypes, ignoring style. Cache key loses the `style` component for this path.
5. Create the `BATCH_JOB` record with `sub-jobs` pre-populated (one per style, `status: 'pending'`).
6. Invoke the existing staging Lambda N times with `InvocationType: 'Event'` (async), each with its own style and the shared `roomAnalysis` text. Batch ID is added to the Lambda payload so the Lambda knows which parent to update.
7. Return `202` with `{ batchId, subJobs: [{ jobId, style }] }`. Client does not wait.

Expected wall-clock to Lambda invoke return: < 3 s for analysis + ~100 ms per async invoke.

### `GET /api/jobs/batch?id={batchId}`

Response:
```ts
{
  batchId: string;
  status: 'running' | 'done' | 'error';   // error means every sub-job failed
  total: number;
  completed: number;
  failed: number;
  refundedCredits: number;
  subJobs: Array<{
    jobId: string;
    style: string;
    status: 'pending' | 'running' | 'done' | 'error';
    imageUrl?: string;        // signed URL for the staged image (15-min expiry)
    s3Key?: string;
    sessionId?: string;
    error?: string;
  }>;
}
```

Signed URLs are generated on-read per poll to avoid persisting expiring URLs in the batch record.

### Lambda change: one atomic DDB update per completion

The staging Lambda today writes its gallery record and job record on success. The batch path passes an optional `batchId` in the Lambda payload. When `batchId` is present, the Lambda additionally issues an atomic `UpdateItem` on the parent `BATCH_JOB`:
- On success: increment `completed`, set `subJobs[i].status='done'` with the S3 key + session id.
- On failure: increment `failed`, set `subJobs[i].status='error'` with the error message, **increment `refundedCredits`**, and atomically refund 1 credit to the user's profile record.

Atomic conditional updates (`UpdateExpression: ADD completed :one`) keep the counter correct under race conditions between sibling Lambdas finishing simultaneously.

---

## Credit Flow

1. **Deduct `N` credits upfront** on the `/api/stage/batch` request.
2. **Refund 1 credit per silently-failed sub-job.** Failure = Lambda hit a Gemini error, S3 upload error, or crashed after the existing per-sub-job internal retry (none needed at 10 IPM; the hook exists for future safety).
3. **Refund path is built as a reusable helper** on the `users` DDB access layer (`refundCredits(userId, amount, reason)`) since it's new infra the codebase currently lacks. Refund amounts + reason are audited via a cheap `USAGE#{ts}` DDB record so spend history is traceable.
4. A user who starts a 10-style batch sees their credit balance drop by 10 immediately. As failures occur, refunds roll back in real time. The polled `refundedCredits` counter surfaces in the result page as a subtle note ("1 style failed to generate — credit returned").
5. Admin accounts remain unlimited.

---

## UI Surfaces

### Wizard step 4 (style picker) — multi-select

- Same `StyleRow` component (the shared one from `src/components/staging/style-row.tsx`). Selection state flips from "single active" to per-row toggle.
- A teal counter bar sits above the list: `N of 10 selected · N credits`. When `N === 10`, the bar turns amber and reads `10 of 10 selected · remove one to add another`; unselected rows render at 40% opacity and are un-tappable.
- Primary button reads `Continue · N styles` and is disabled at `N === 0`.
- Tapping a selected row always deselects (cap never blocks deselection).
- At 1 style, Continue routes through `/api/stage` as today; at 2+, routes through `/api/stage/batch`.

### Result page (same page serves loading + result)

Layout at a new `/stage/batch/[batchId]` route (separate from `/stage` so batches are deep-linkable and the wizard stays single-purpose) has two regions:

- **Main slider (desktop 65% / mobile full-width at top, sticky on mobile):** the shipped `BeforeAfterSlider` component, original on one side, currently-active variant on the other. Drag the divider to compare.
- **Variant list (desktop right 35% / mobile below):** readable rows, 56-64 px thumbnail + style name + state line ("Ready" or "Generating…"). Active variant has a teal border + light teal background. Loading rows have a skeleton shimmer thumbnail and a pulsing teal dot; they're un-clickable. Clicking a ready row crossfades that variant into the slider.
- **Action bar below the slider:** `Download this` + `Download all` buttons. No flag-for-review. No other actions in V1.
- **Header strip:** DM Serif "N styles, one [RoomType]", Outfit muted subtitle with live counter "M of N complete · K generating".

### Compare behaviour

The slider IS the compare. No separate modal. This is the biggest simplification from the earlier proposal and it removes the "tiny thumbnail strip" issue by turning the variant switcher into a readable list.

### Styling

DM Serif Display on headings, Outfit on body. Navy `#0f1d2e` for primary text, teal `#2ba6a4` for accent + active states, surface greys for cards/borders. No pill chips on labels. Matches the rest of the live app.

---

## Error Handling

### Per-sub-job failure
- Lambda catches; atomically updates `BATCH_JOB` with `failed + 1`, refunds 1 credit, sets `subJobs[i].status='error'` with the message.
- Client poll surfaces this in the variant list row: muted, with a small "Retry this style" affordance (V2 — see follow-ups).
- The slider stays on whichever variant is currently active.

### Whole-batch failure
- If `failed === total`, batch `status: 'error'`. Client shows a full-page error with "Try again" that re-routes to wizard with selections preserved.
- All 10 credits refunded.

### Timeout guards
- Client polling uses a 10-minute cap (generous; 10 styles should finish in 60–90 s). After timeout, poll reports terminal + lists which sub-jobs are still `running` — those are probably zombie Lambdas and the user can reach out.
- Individual Lambda still has its 300s ceiling. A sub-job that exceeds it records itself as `error` via the existing Lambda timeout-catch path.

### Concurrency guards
- Capped at 10 styles per batch — never exceeds Tier-1 10 IPM.
- `/api/stage/batch` checks for an existing running batch for the same user and rejects a second one with 409. One batch at a time per user (V1 constraint; lift later if demand).

---

## File Structure

```
Changes:
  src/app/stage/page.tsx
    - style step: multi-select behaviour, counter bar, cap UX
    - on Continue: branch to batch endpoint when styles.length > 1
    - result rendering: detect batch vs single, route to BatchResult component
  src/components/staging/style-row.tsx
    - already supports `selected` prop; caller uses it per row instead of a single active
  src/lib/db/batch-jobs.ts                                (NEW)
    - CRUD for BATCH_JOB records; atomic counter helpers
  src/lib/db/users.ts
    - refundCredits(userId, amount, reason) (NEW export)
  src/lib/ai/run-analysis.ts                             (NEW, extracted)
    - the analysis logic currently inline in /api/analyse, reusable server-side
  src/app/api/stage/batch/route.ts                       (NEW)
    - auth, validate, deduct, analyse, create batch, fan out, return 202
  src/app/api/jobs/batch/route.ts                        (NEW)
    - poll endpoint, signs URLs on read
  src/app/stage/batch/[batchId]/page.tsx                 (NEW)
    - slider-led result page with variant list (desktop + mobile)
    - polls /api/jobs/batch until terminal
  src/components/staging/batch-result.tsx                (NEW)
    - shared rendering for the slider + variant list (loading and done states)
  src/components/staging/batch-variant-row.tsx          (NEW)
    - the list row with thumb + name + state dot
  lambda/staging-worker/index.mjs
    - add optional batchId param; on completion, atomically update BATCH_JOB
    - on failure, increment failed + refund 1 credit via users table

Unchanged:
  /api/stage, /api/jobs, single-style result page — all still functional.
```

---

## Build Sequence (informs the plan)

1. **Data + refund infrastructure first.** `batch-jobs.ts`, `refundCredits`, usage tracking. No user-facing work yet.
2. **Analysis extraction.** Pull `/api/analyse`'s core into a reusable module so both the current route and the batch entry can call it.
3. **Batch entry API.** `POST /api/stage/batch` with test coverage for validate / deduct / analyse / fan-out.
4. **Lambda update.** Accept optional `batchId`, write atomic update + refund on failure.
5. **Poll API.** `GET /api/jobs/batch` with signed-URL generation.
6. **Result page route + components.** `src/app/stage/batch/[batchId]/page.tsx` + `batch-result.tsx` + `batch-variant-row.tsx`. Slider reuse, list + crossfade, mobile sticky.
7. **Wizard multi-select.** Style step state + counter bar + cap UX. Branch to batch endpoint on Continue.
8. **End-to-end test** with a real 3-style batch before shipping.

---

## Follow-up Work (Explicitly Out of Scope)

- **Retry failed styles button** in the variant list row (V2 — not critical to ship; today the user can restart the wizard).
- **Concurrent batches per user** (V1 serialises; likely fine for target personas).
- **HD quality in batch** (V1 is standard-only; HD is 3 credits/image, and a 10-style HD batch is 30 credits — needs pricing alignment).
- **Batch editing** (once the dormant edit feature is re-wired, individual variants are independently editable via their `SESSION` records; no batch-level edit UX planned).
- **Pricing alignment.** The 1-credit-per-style assumption sits on top of the current pricing page copy, which is a placeholder. Finalised pricing may change the per-style cost or introduce batch-level discounts. Not blocking this spec.
- **Gemini Batch API 50% discount endpoint** — async 24-hr turnaround, mutually exclusive with the live-loading UX. Revisit if we ever want an "overnight render queue" mode.

---

## Open Questions

None at time of writing. All decisions locked through the brainstorming session. Pricing-per-style is explicitly accepted as placeholder until the pricing redesign lands.
