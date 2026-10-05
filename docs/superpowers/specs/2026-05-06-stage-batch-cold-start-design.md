# /api/stage/batch cold-start fix — leader-variant pattern

**Date:** 2026-05-06
**Status:** Spec — pending implementation plan
**Severity:** Play Store ship blocker
**Owner:** Tara

---

## Problem

Wizard submit fails with browser-level "Failed to fetch" — the connection is killed before any HTTP response. Reproduces on triple-bundle staging with multiple styles after the API has been cold for a while; succeeds on retry while warm.

Root cause confirmed via prod probes (`/api/auth/me` takes 8.7 s on cold start): `/api/stage/batch` runs Opus 4.7 analysis synchronously **before** invoking any staging Lambdas, then invokes them. Cold start + multi-style analysis exceeds Amplify SSR's ~30 s hard timeout (Amplify ignores the `maxDuration = 60` set in the route). Amplify kills the connection → browser sees "Failed to fetch." Confirmed by zero errors in `stageright-staging-worker` logs over the failure window — the request never reaches the worker.

The Lambda invocation itself is already async (`InvocationType: 'Event'` in `src/lib/aws/lambda.ts`), so the bottleneck is purely the in-API `runAnalysis` calls in `src/app/api/stage/batch/route.ts:155-198`.

## Goal

API returns `202 { batchId }` in **well under one second**. Analysis runs after the response is sent, in a way that survives Amplify's SSR timeout. The shared-analysis cost optimization that keeps triple-mode at the locked $0.33 AUD/credit cost basis must be preserved.

## Non-goals

- Re-pricing Triple Take. The fix preserves current cost.
- Touching single-mode behaviour. Single-mode is already fast and stays unchanged.
- Refactoring the polling endpoint, the reveal-page UX, or the partial-refund flow.
- Reworking `/admin/compare` — different code path, unaffected.
- Touching credit-deduction, S3-ownership, or auth gates — these stay before the API returns 200.

## Hard constraints

- Auth + credit deduction + S3 ownership check still happen synchronously before the API returns 200. No abuse window.
- The reveal page polling at `/api/jobs/batch?id=...` must still see correct progressive state (`pending → running → done`) so the wait/reveal ceremony works.
- Partial-refund logic (1 credit refunded per style where 1–2 of 3 succeeded) must still fire at terminal state — no change to the existing terminal-state path.
- Lambda redeploy is manual (per CLAUDE.md "Deploying the staging-worker Lambda"). Linux-x64 sharp install, PowerShell ZipFile, `aws lambda update-function-code`. Forgetting this is the #1 silent-failure mode.
- Locked cost basis: $0.33 AUD/credit. Preserving shared-analysis is non-negotiable for triple mode.

---

## Architecture — Leader-variant pattern

The API stops running analysis. The first staging-worker Lambda for each style becomes the "leader": it runs analysis, persists it, fans out to its sibling variants with the analysis baked into their invocation payload, then runs its own staging variant.

### API route (`src/app/api/stage/batch/route.ts`)

- **Delete** the `runAnalysis` block at lines 155-198 (the `Promise.allSettled` call and surrounding bookkeeping).
- **Stop** passing `roomAnalysisByStyle` / `conciergeNotesByStyle` to `createBatchJob` — leaders write those into DDB themselves later.
- **Triple mode:** filter the fan-out at line 214-262 to invoke **only** variants where `slot === 1` (one leader Lambda per style). Add `isLeader: true` to those invocations' params.
- **Single mode:** unchanged — invokes 1 Lambda per style with no `isLeader` flag, Lambda runs its own analysis exactly like today.
- **Delete** the `export const maxDuration = 60` line entirely — no longer relevant; the route should be sub-second now, and leaving the line in implies a long-running expectation that no longer holds.
- Return `202 { batchId, subJobs }` exactly as today (the polling endpoint contract is unchanged).

### Lambda (`lambda/staging-worker/index.mjs`)

- New optional param: `isLeader: boolean`. Default false.
- When `params.isLeader === true`:
  1. Run Opus 4.7 analysis via the existing `runAnalysisInLambda` path (already wired).
  2. Persist analysis text + concierge_notes to `BATCH_JOB.roomAnalysisByStyle[style]` and a parallel `conciergeNotesByStyle[style]` map via a new helper (see below).
  3. Async-invoke the slot-2 and slot-3 Lambdas for this style (using `@aws-sdk/client-lambda` already bundled), passing the analysis result + concierge notes in their payload so they skip in-Lambda analysis.
  4. Run the leader's own staging variant as normal.
- When `params.isLeader !== true`: no behavioural change. Sibling Lambdas (fanned out by leaders) and single-mode Lambdas (invoked directly by API) both arrive with `roomAnalysis` populated and skip analysis exactly as today.
- Existing fallback: if `roomAnalysis` is empty, the Lambda runs its own analysis. This stays in place as a safety net for the leader-fails-before-fan-out case.

### Shared-state helper (`src/lib/db/batch-jobs.ts`)

- New helper: `setRoomAnalysisForStyle(batchId, style, analysisText, conciergeNotes)`.
- Uses a DDB `UpdateExpression` with path-targeted `SET roomAnalysisByStyle.#style = :a, conciergeNotesByStyle.#style = :n` so concurrent leaders for *different* styles don't clobber each other's writes.
- **Always** initialise the map containers (`roomAnalysisByStyle`, `conciergeNotesByStyle`) at `createBatchJob` time as empty `{}` maps. Today they're conditionally added only when API-layer analysis ran; under this design the API never runs analysis, so they must always start as empty maps so the leader's later path-update doesn't fail on a missing parent attribute.
- Currently the BatchJob type already has `roomAnalysisByStyle?: Record<string, string>`. We add `conciergeNotesByStyle?: Record<string, string[]>` alongside it.

### Lambda IAM

- Verify the existing `stageright-staging-worker` execution role has `lambda:InvokeFunction` on itself. If not, this is a one-time inline-policy edit (no new role).

### Type and payload changes

- `params.isLeader?: boolean` added to `invokeStagingWorker` payload params type at `src/lib/aws/lambda.ts` (params is currently `Record<string, unknown>`, so type-side this is a no-op; the change is a documentation comment).

---

## Data flow (triple mode, 3 styles, happy path)

```
Browser → POST /api/stage/batch
  ↓
API: getSession + auth check
API: ADMIN_EMAILS check
API: parse body, validate styles/bundle/listingId
API: assertKeysAccessible (S3 ownership)
API: deductCredits  ← still synchronous, abuse defence
API: createBatchJob (9 variants, all status='pending';
                     roomAnalysisByStyle: {}, conciergeNotesByStyle: {})
API: invoke 3 leader Lambdas in parallel (slot 1 of each style; isLeader=true)
API: → 202 { batchId, subJobs }   [SUB-SECOND]
  ↓
Browser starts polling /api/jobs/batch?id=...
  ↓
Each leader Lambda (parallel, one per style):
  1. Download images from S3
  2. Run Opus 4.7 analysis (style-calibrated)
  3. Write roomAnalysisByStyle[style] + conciergeNotesByStyle[style] to DDB
  4. Async-invoke slot 2 + slot 3 Lambdas with roomAnalysis + conciergeNotes in payload
  5. Run leader's own staging variant → writeback to variants[0]
  ↓
Sibling Lambdas (slots 2 + 3, started by their leader):
  - Receive roomAnalysis already populated → skip in-Lambda analysis
  - Stage → writeback to variant slot
  ↓
Polling sees variants flip pending → running → done; reveal carousel populates
  ↓
Terminal state: API computes partial refunds (unchanged)
```

**Visible UX delta:** today, all 9 variants flip from `pending` to `running` near-instantly because the API invokes them all up front. Under this design, slots 2 and 3 stay `pending` for ~10–15 s longer (until their leader completes analysis and fans out). The reveal page shows a unified wait/concierge state rather than per-variant progress, so this is invisible to users in the live ceremony.

---

## Error handling

| Failure | Behaviour |
|---|---|
| Leader's analysis call fails (Opus error, S3 download fail) | Leader writes empty string to DDB, fans out siblings with empty `roomAnalysis`. Siblings fall back to their own per-Lambda analysis (existing behaviour). Cost: +$0.24 for that one style — acceptable on rare failures. Logged loudly. |
| Leader Lambda dies entirely (cold-start INIT, OOM, code crash before fan-out) | AWS async invokes get 2 automatic retries before DLQ — transient failures self-heal. If all retries fail, that style's 3 variants stay `pending`. Mitigated by watchdog (below). |
| Leader fans out, but sibling invoke call fails (IAM, throttle) | Try-catch around fan-out, log, mark affected variant `error` via existing variant-writeback path. Partial-refund logic at terminal state catches it. |
| Sibling Lambda fails (slot 2 or 3) | No change — existing silent-retry-once + partial-refund logic handles it. |
| DDB write of analysis fails | Leader logs and continues. Fan-out still happens with `roomAnalysis` carried in the invoke payload, not via DDB. The DDB write is for observability/recovery, not the critical path. |
| Concurrent leaders writing different styles' entries | Path-targeted `SET roomAnalysisByStyle.#style = :a` — no read-modify-write race. DDB serializes the updates. Safe by construction. |

### Stale-batch watchdog — DEFERRED

Originally planned as a polling-endpoint check that marks pending variants as errored after 3 minutes, so the existing partial-refund logic can fire on the rare leader-failure case.

**Deferred during implementation (2026-05-06).** The TS-side `markSubJobError` helper in `src/lib/db/batch-jobs.ts` uses legacy `subJobs[].jobId` lookup and is not variant-aware (the Lambda's own `propagateToBatch` is variant-aware, but it lives in `lambda/staging-worker/index.mjs`). Implementing the watchdog correctly therefore requires either (a) a new variant-aware `markVariantError` helper in TS, or (b) inline DDB variant writes in the polling endpoint. Both touch the same fragile legacy code that the working Lambda writeback path depends on.

The watchdog is defence-in-depth for a rare failure: leader Lambda dies entirely AND AWS's automatic 2-retry fails. AWS's built-in retry handles all realistic transient failures. The cost of skipping the watchdog is one stuck batch on the rare pathological failure (user sees a forever-pending reveal page) — bad, but not the ship blocker. The ship blocker is cold-start timeout, which Tasks 1, 2, and 4 fix fully.

Track the watchdog as a follow-up PR once `mutateSubJob` is rewritten to walk `subJobs[].variants[]`.

Confirm during implementation whether a similar reaper already exists; if so, extend that instead of duplicating.

---

## Files affected

| File | Change |
|---|---|
| `src/app/api/stage/batch/route.ts` | Delete `runAnalysis` block; only invoke slot-1 leaders in triple mode with `isLeader: true`; drop `maxDuration`. |
| `lambda/staging-worker/index.mjs` | Add `isLeader` branch: analysis → DDB persist → fan out siblings → run own variant. |
| `src/lib/db/batch-jobs.ts` | Add `setRoomAnalysisForStyle` helper. Initialise empty maps at `createBatchJob`. Add `conciergeNotesByStyle` field to `BatchJob`. |
| `src/lib/aws/lambda.ts` | (Doc comment only) `params.isLeader` documented. |
| `src/app/api/jobs/batch/route.ts` (polling) | Add stale-batch watchdog: if `createdAt` > 3min ago and `pending` variants exist, mark them `error`. |

No changes needed: `src/lib/aws/lambda.ts` runtime, reveal page, partial-refund accounting in `applyPartialRefundsForBatch`, types/Bundle, listings, credit deduction, `/admin/compare`.

## Files NOT changed (regression-check list)

These should pass through identically:
- `/api/stage/batch` single-mode path
- Onboarding flow (single + engineOverride)
- `/admin/compare` (separate code path)
- Reveal page polling contract
- `applyPartialRefundsForBatch`
- `deductCredits` and bonus-credit accounting

---

## Testing

### Unit tests
- `route.ts` — given a triple-mode submit, only invokes 3 Lambdas (not 9), each with `isLeader: true`. Mocks `invokeStagingWorker`.
- `route.ts` — given a single-mode submit, invokes 1 Lambda per style with no `isLeader` flag.
- `route.ts` — auth/credit/S3-ownership rejections still 401/402/403 before any Lambda invoke.
- `batch-jobs.ts` — `setRoomAnalysisForStyle` writes the correct map key and doesn't clobber other styles' entries; idempotent on retry.
- Lambda fan-out — factor the fan-out into a small testable function and mock `LambdaClient`.

### Integration test (real AWS, like the existing `stage-test` script)
- Trigger a triple-mode 3-style batch; assert `batchId` returns in <2 s.
- Poll `/api/jobs/batch` until terminal.
- Assert all 9 variants reach `done` (or partial — at least one per style).
- Assert `roomAnalysisByStyle` has 3 entries on the BatchJob record.

### Manual smoke test (must pass before declaring done)
1. **The actual repro:** wait for cold start, submit triple-mode 3-style, confirm browser receives `batchId` and reveal page polls correctly. This is the fix.
2. Single-mode test — confirm the unchanged path still works.
3. Onboarding — uses single-mode + engineOverride, confirm no regression.
4. `/admin/compare` — confirm nothing leaked.

### Pre-push verification
- `npm run type-check`
- `npm run build` (catches `react/no-unescaped-entities` per the apostrophes-break-Amplify memory).
- `npm run lint`
- `npm run test`

---

## Deploy sequence

**Order: Lambda first, then Amplify.** The new Lambda is backwards-compatible with the *old* API (no `isLeader` flag → behaves like today). The new API is **not** backwards-compatible with the *old* Lambda (it only invokes 3 leaders in triple mode, expecting them to fan out — an old Lambda would just stage its own variant and slots 2 & 3 would never run).

1. Re-zip and push the Lambda (manual, per CLAUDE.md). At this point: still works with current API exactly as before (every invocation lacks `isLeader`, so the leader path is dormant).
2. Verify Lambda deploy: `aws lambda get-function-configuration … --query "{LastUpdateStatus,State}"` returns `Successful` / `Active`.
3. Push the Next.js side (Amplify auto-deploys, ~3 min). New API now invokes 3 leaders per triple-mode batch and the new Lambda handles them.
4. Verify on prod with the actual cold-start repro before declaring done.

The Lambda redeploy ritual (from CLAUDE.md):
```bash
cd lambda/staging-worker && rm -rf node_modules package-lock.json && \
  npm install --omit=dev --include=optional --os=linux --cpu=x64 --libc=glibc
# verify @img/sharp-linux-x64 + node_modules/sharp/ exist
# zip via PowerShell ZipFile (NOT Compress-Archive — fails on long node_modules paths)
# aws lambda update-function-code → wait for LastUpdateStatus=Successful
```

## Open questions for implementation phase

- Does the staging-worker IAM role already permit `lambda:InvokeFunction` on itself? Check before implementing fan-out.
- Does a stale-batch reaper already exist somewhere? Extend it rather than duplicating.
