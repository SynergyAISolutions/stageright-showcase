# Bonus Credit Ceremony — Design Spec

**Date:** 2026-04-24
**Status:** Approved for implementation planning
**Predecessors:** PR #1 (single-style reveal), PR #3 (batch ceremony), PR #5 (onboarding ceremony)
**Follows on from:** the "Queued follow-ons" list in `project_batch_ceremony_shipped.md` — this is the last gift-framework application in the backlog.

## Context

Today, copy across the landing page and onboarding promises *"earn a free regeneration every 10 stages"*, backed by a decorative mockup on the How It Works section. **None of this is wired to code.** There is no `regenerationTokensEarned` field, no earn logic, no spend flow. The `CREDIT_COSTS.regenerate = 1` constant exists but is referenced only by the dormant regenerate/edit routes, which are not in the live wizard.

This spec ships the first real implementation — framed as **bonus credits**, not tokens. Tokens as a distinct currency are scrapped entirely. The bonus is simply a credit that lands in the user's wallet, same as any other. One currency, one counter, one mental model.

**Purpose of the feature:** account for AI randomness. When the model occasionally doesn't nail a room, the user has headroom to re-stage without feeling the pinch of paying again. The framing is generous and quiet: *"A free credit, on us."*

## Locked decisions

1. **One currency.** Bonuses add to `creditsRemaining` directly. No separate token balance, no separate wallet, no spend UI. The user can use the bonus credit however they want — another room, a different style, a re-stage of a past result (once the spend flow is eventually wired). The AI-randomness framing is carried entirely in copy.

2. **Every 7 successful stages → +1 credit.** Change from the memory's *"every 10"* placeholder. Counts every successful stage regardless of credit source (paid or bonus-funded) — simple mental model, negligible recovery-loop impact (≈14% geometric, converges fast).

3. **Vocabulary: "free credit"**, not "token" / "regeneration" / "quality credit" / "bonus credit". The cleanest, most honest framing — no invented vocabulary. Copy: *"Every 7 stages, you get a free credit on us. Consider it peace of mind for when AI gets weird."*

4. **Celebration = "Bonus envelope" surface + counter tick.** Dedicated component that rises from the bottom of the result screen after the reveal peak settles, same motion family as `FirstStageWelcomeToast`. Gold accent (vs the welcome toast's teal). Simultaneously the header credit counter ticks N → N+1 with a soft gold glow. Two layers = "obvious" + "feels good" + "top-tier".

5. **Exactly-once guarantee per stage boundary.** Same shape as `markFirstStage` — atomic ConditionalUpdate guarded by `lastBonusStageCount` on the User record. Retries and replays cannot double-grant.

6. **Admin plan: skipped.** Admin has unlimited credits. Granting them a bonus is a no-op that still costs a DDB write. Skip entirely.

7. **Stage 1 ≠ bonus stage.** User's first stage is the welcome-toast moment (shipped). Bonuses fire at stages 7, 14, 21, etc. They never collide with the welcome toast because the welcome toast is stage 1 only.

## Data model

### New fields on `User` (DynamoDB `pk=USER#{id}, sk=PROFILE`)

```typescript
export interface User extends BaseEntity {
  // ... existing fields ...

  /** Monotonically increasing counter of successful staging jobs (batch sub-jobs count individually). Defaults to 0 on account creation. Never decremented. */
  stagesCompletedTotal?: number;

  /** The stage-count value at which the last bonus was granted. Used as an exactly-once idempotency guard. Undefined until the first bonus is granted. */
  lastBonusStageCount?: number;
}
```

Default to `0` / `undefined` for existing users — no backfill needed, no migration script.

### New fields on `BatchSubJob` and `StagingJob`

```typescript
export interface BatchSubJob {
  // ... existing fields ...

  /** Set to true when this sub-job has been counted toward stagesCompletedTotal. Prevents double-counting on Lambda retries. */
  stageCounted?: boolean;

  /** Set to true if this specific sub-job's completion pushed the user across a 7-stage boundary and a bonus credit was granted. Used by the client to decide whether to fire the bonus envelope on this variant. */
  bonusTriggered?: boolean;
}
```

`StagingJob` (single-stage path) gets the same two fields.

## Server flow

### New helper: `recordStageCompletion`

**File:** `src/lib/db/bonus-credit.ts` (new)

```typescript
/**
 * Records a successful staging job toward the user's bonus-credit counter.
 * Idempotent per stage job ID — retries do not double-count.
 *
 * Returns { bonusGranted: true, newStageCount, newCreditsRemaining } when
 * the completion crosses a 7-stage boundary, otherwise { bonusGranted: false }.
 */
export async function recordStageCompletion(params: {
  userId: string;
  stageJobId: string;            // BatchSubJob id or StagingJob id
  stageJobTableKey: { pk: string; sk: string };  // DDB key for the stage job
}): Promise<
  | { bonusGranted: false }
  | { bonusGranted: true; newStageCount: number; newCreditsRemaining: number }
>
```

**Algorithm:**

1. **Guard — claim the stage-job.** `UpdateItem` on the stage job:
   - `UpdateExpression: SET stageCounted = :true`
   - `ConditionExpression: attribute_not_exists(stageCounted)`
   - On `ConditionalCheckFailedException`: return `{ bonusGranted: false }` (another Lambda invocation already counted this job — not an error).

2. **Skip admin users.** `GetItem` on user. If `user.plan === 'admin'`, return `{ bonusGranted: false }`.

3. **Increment counter.** `UpdateItem` on User:
   - `UpdateExpression: ADD stagesCompletedTotal :one SET updatedAt = :now`
   - `ReturnValues: UPDATED_NEW` — read back the new count.

4. **Check boundary.** If `newStageCount % 7 !== 0`, return `{ bonusGranted: false }`.

5. **Grant the credit (atomic, exactly-once).** `UpdateItem` on User:
   - `UpdateExpression: ADD creditsRemaining :one SET lastBonusStageCount = :newCount, updatedAt = :now`
   - `ConditionExpression: attribute_not_exists(lastBonusStageCount) OR lastBonusStageCount <> :newCount`
   - `ReturnValues: UPDATED_NEW` — read back `creditsRemaining`.
   - On `ConditionalCheckFailedException`: return `{ bonusGranted: false }` (another invocation already granted this bonus).

6. **Mark the stage-job as the trigger.** `UpdateItem` on the stage job: `SET bonusTriggered = :true, bonusStageCount = :newCount`. Best-effort — if this write fails, the bonus is still granted server-side; the client just won't show the envelope for this variant (it'll show on the next stage count read via /auth/me or dashboard refresh).

7. Return `{ bonusGranted: true, newStageCount, newCreditsRemaining }`.

### Call sites (Lambda)

The helper is called from `lambda/staging-worker/index.mjs` after the worker has successfully persisted the staging result:

- **Batch path:** in `propagateToBatch`, after writing the BatchSubJob's completed state, call `recordStageCompletion({ userId, stageJobId: subJob.id, stageJobTableKey: { pk: ..., sk: ... } })`.
- **Single-stage path:** in the single-job completion write, call with the StagingJob's identifiers.

**Lambda redeploy required** for either call site — same zip-and-update flow as PR #3 (see `project_lambda_deploy.md`).

Because the helper is shared between the Next.js runtime and the Lambda, it is duplicated inline into the Lambda file (same pattern as `parseConciergeNotes` / `stripConciergeNotes` from PR #3). A `KEEP IN SYNC` comment is added on both sides. No shared module because the Lambda is bundled standalone.

### Response contract

**Batch poll** (`/api/jobs/batch/[batchId]` GET):

The existing response's per-sub-job shape gains two fields:

```typescript
type BatchSubJobResponse = {
  // ... existing fields ...
  bonusTriggered?: boolean;       // true if this sub-job earned the user a bonus
  bonusStageCount?: number;       // the stage-count value at grant time (e.g. 7, 14, 21)
}
```

The user's fresh `creditsRemaining` is already returned at the top level of the poll response (existing behaviour — no change needed). The client updates its auth state from that value.

**Single-stage** (`/api/stage` POST response):

```typescript
type StageResponse = {
  // ... existing fields ...
  bonusTriggered?: boolean;
  bonusStageCount?: number;
  creditsRemaining: number;       // already returned — no change
}
```

## Client components

### New: `BonusCreditEnvelope`

**File:** `src/components/staging/bonus-credit-envelope.tsx` (new)

A toast-like surface that rises from the bottom of the viewport. Inherits motion language from `FirstStageWelcomeToast`:

- **Trigger:** mounted with `visible={true}` prop by the parent after `onRevealPeak` fires on the variant carrying `bonusTriggered: true`.
- **Entry:** slide up from `translateY(20px), opacity: 0` to `translateY(0), opacity: 1` over 600ms, `ease-out`. 1500ms delay after `onRevealPeak` (same rhythm as the welcome toast).
- **Dwell:** 6000ms visible.
- **Exit:** fade + slide down 200ms, then call `onDismiss` ref (stabilized — same ref pattern as welcome toast to avoid re-run loops).
- **Placement:** bottom-center, 24px from bottom with `bottom: env(safe-area-inset-bottom)` for iOS. `position: fixed`, `z-index: 60`.
- **Layout:** rounded 16px card, dark navy background with subtle gold border (`border border-brand-gold/40`), shadow-xl.
- **Content:**
  - Top row: small gold dot icon (8px) + "+1 free credit" in DM Serif Display, 18px, white
  - Sub-row: "On us, because AI can be unpredictable." in Outfit, 13px, white/70
- **Accessibility:** `role="status"`, `aria-live="polite"`, text content read by screen readers on entry.
- **Reduced-motion:** honour `prefers-reduced-motion: reduce` — skip slide, just fade in/out at 200ms.

```typescript
export interface BonusCreditEnvelopeProps {
  visible: boolean;
  onDismiss: () => void;
}
```

Wrap in its own `<AnimatePresence>` at the call site (not shared with the step-switcher's — learned from PR #5 where welcome-toast exits no-oped when it inherited the switcher's AnimatePresence).

### Modified: `CreditBalance` — add `pulse` prop

**File:** `src/components/staging/credit-balance.tsx` (existing)

Add a `pulse?: boolean` prop. When set (or toggled true → false on a remount), the displayed number animates:

- **Number tick:** old value → new value over 400ms. Use `tabular-nums` so width stays stable. No rolling-digit affectation — just a soft cross-fade from old to new glyphs.
- **Glow ring:** `box-shadow` animates from `0 0 0 0 rgba(gold, 0.6)` to `0 0 0 10px rgba(gold, 0)` over 800ms, `ease-out`.
- **Scale:** `scale(1) → scale(1.08) → scale(1)` over 400ms, spring easing.
- **Synchronised** with the envelope appearance (both triggered simultaneously).
- **Reduced-motion:** skip scale, keep the number cross-fade and a brief color flash.

```typescript
export interface CreditBalanceProps {
  credits: number;
  pulse?: boolean;
}
```

Implementation: use `framer-motion` `animate` with a key tied to `credits` to trigger the tick on every value change. The `pulse` prop gates the glow/scale (so non-bonus changes like post-stage deduction don't over-animate).

### Modified: Result screens wire the envelope

**Batch result** (`src/components/staging/batch-result.tsx` — existing):

- Reads `bonusTriggered` from the currently active variant's sub-job data.
- Owns a `showBonusEnvelope` state, set to true via `onRevealPeak` when the active variant has `bonusTriggered === true`.
- Passes `pulse={showBonusEnvelope}` to whichever `CreditBalance` sits in the page chrome.
- Renders `<BonusCreditEnvelope>` with its own `<AnimatePresence>`.

**Single-stage result** (`src/app/stage/result.tsx` or equivalent — existing):

- Reads `bonusTriggered` from the stage response payload.
- Same `showBonusEnvelope` state + `onRevealPeak` wiring.
- Same `CreditBalance` pulse.

**Onboarding result step** (`src/app/onboarding/onboarding-flow.tsx`, `'result'` step — existing, shipped PR #5):

- N/A — onboarding is stage 1, never a bonus stage. No changes.

### Collision rules

- **Welcome toast + bonus envelope on the same stage:** impossible. Welcome is stage 1, bonus is stages 7, 14, …
- **Bonus on a batch sub-job that isn't the first-ready variant:** envelope rises when that specific variant's reveal completes. Other already-displayed variants don't retrigger.
- **Multiple bonuses in a single batch:** if a batch spans a boundary twice (e.g. user at count 6, batch of 10 → boundaries at 7 and 14), two distinct sub-jobs carry `bonusTriggered`. Each fires its own envelope in sequence as the user clicks through variants. Counter pulses twice.

## Copy sweep

Every surface that currently says *"regeneration"* / *"free regeneration"* / *"every 10 stages"*, updated to *"free credit"* / *"every 7 stages"*. Exact changes:

### `src/types/index.ts`
- **Line 56** (`PLANS.free.features`):
  - Before: `'Earn a free regeneration every 10 stages'`
  - After: `'Earn a free credit every 7 stages'`

### `src/app/layout.tsx`
- **Line 25** (metadata `description`):
  - Before: `…12 styles, a free regeneration every 10 stages. 15 free credits…`
  - After: `…12 styles, a free credit every 7 stages. 15 free credits…`
- **Line 155** (FAQ structured data):
  - Before: `"No. Credits and earned regenerations never expire while your account is active…"`
  - After: `"No. Credits never expire while your account is active…"` *(earned regenerations now == credits, language collapses)*
- **Line 163** (FAQ structured data):
  - Before: `"…You earn your first free regeneration after ten stages."`
  - After: `"…You earn your first free credit after seven stages."`

### `src/components/landing/hero.tsx`
- **Line 49:**
  - Before: `curated styles. A free regeneration every ten stages.`
  - After: `curated styles. A free credit every seven stages.`
- **Line 73:**
  - Before: `No credit card required. Earn a free regeneration every 10 stages.`
  - After: `No credit card required. Earn a free credit every 7 stages.`

### `src/components/landing/how-it-works.tsx`
- **Line 60** (step 04 description):
  - Before: `'Not quite right? Spend a regeneration token and re-stage any past room at any style — no forms, no waiting. Earn one every 10 stages. They stack. They don't expire.'`
  - After: `"Not quite right? Every 7 stages earns a free credit — consider it peace of mind for when AI gets weird. Credits stack and don't expire."`
  *(Drops the "spend a token / re-stage any past room at any style" promise, which is the dormant spend-flow copy. Honest per "copy only what is shipped".)*
- **Line 274-323** (the illustration mockup — `RegenerateIllustration` component):
  - Rename local component to `FreeCreditIllustration` or `BonusCreditIllustration`.
  - Eyebrow: `"Your regeneration meter"` → `"Your free-credit meter"`
  - Header number: `2` + `"regenerations available"` → `2` + `"bonus credits this month"` *(or similar; actual number is decorative, but label changes)*.
  - Progress label: `"Progress to your next free regeneration"` → `"Progress to your next free credit"`
  - Progress counter: `"7 / 10"` → `"5 / 7"`, width `70% → 71%` (5/7)
  - Footer: `"+1 regeneration every 10 stages. Stacks. Never expires."` → `"+1 free credit every 7 stages. Stack. Never expire."`
  - The two gold pip elements (lines 296-297) stay as-is — they visually represent bonus credits earned, which still makes sense.

### `src/components/landing/pricing.tsx`
- **Line 117:**
  - Before: `<span className="block">Every 10 stages earns a free regeneration.</span>`
  - After: `<span className="block">Every 7 stages earns a free credit.</span>`
- **Line 318:**
  - Before: `Earn 1 free regeneration every 10 stages. They stack.`
  - After: `Earn 1 free credit every 7 stages. They stack.`
- **Line 322:**
  - Before: `Credits and regenerations never expire while your account is active.`
  - After: `Credits never expire while your account is active.`

### `src/components/landing/comparison.tsx`
- **Line 35** (StageRight column feature list):
  - Before: `'Free regeneration every 10 stages'`
  - After: `'Free credit every 7 stages'`

### `src/components/landing/faq.tsx`
- **Line 29:**
  - Before: `"No. Credits and earned regenerations never expire while your account is active. If the service is ever sunset, unused credits are refunded at purchase price — no forfeiture clauses."`
  - After: `"No. Credits never expire while your account is active. If the service is ever sunset, unused credits are refunded at purchase price — no forfeiture clauses."`
- **Line 33:**
  - Before: `'Yes. 15 free credits on signup — about three real listings at five photos each. No credit card required. You earn your first free regeneration after ten stages.'`
  - After: `'Yes. 15 free credits on signup — about three real listings at five photos each. No credit card required. You earn your first free credit after seven stages.'`

### `src/components/landing/cta.tsx`
- **Line 18:**
  - Before: `No credit card, no lock-in. Earn your first free regeneration`
  - After: `No credit card, no lock-in. Earn your first free credit`
  - *(Check surrounding lines for a continuation — if "after 10 stages" appears, update to "after 7 stages".)*

### `src/components/onboarding/how-it-works-screen.tsx`
- **Line 7** (step 04 card):
  - Before: `{ num: '04', title: 'Regenerate (optional)', who: 'You', time: 'free', desc: 'Not quite right? Earn one every 10 stages.' }`
  - After: `{ num: '04', title: 'Free credit every 7 stages', who: 'You', time: 'free', desc: 'Re-stage or try a new style — on us. Peace of mind for when AI gets weird.' }`
  *(Drops the "optional" qualifier — the bonus credit isn't a feature to opt into, it just happens. Title and copy emphasise the what rather than the how.)*

### `src/components/onboarding/regeneration-primer.tsx` → rename to `bonus-credit-primer.tsx`

**Filename:** `src/components/onboarding/regeneration-primer.tsx` → `src/components/onboarding/bonus-credit-primer.tsx`
**Import in `onboarding-flow.tsx`:** rename import + component reference.
**Copy:**
- Before: `"You've earned 1 of your 10 stages toward your first free regeneration."`
- After: `"You've earned 1 of your 7 stages toward your first free credit."`
**Internal component name** also renames: `RegenerationPrimer` → `BonusCreditPrimer`.

### `CLAUDE.md`
- **Line 208** (Regeneration bank section):
  - Before: `- 1 regeneration earned per 10 eligible generations. +1 on signup.`
  - After: `- Every 7 successful stages earns +1 free credit. Credit goes to the user's wallet, same as any other credit. No separate token currency.`
- Rename the section heading `### Regeneration bank` → `### Free-credit bonus` for accuracy.
- Update the rest of the section to reflect one-currency reality (drop "self-serve re-stages any past hero at any style for free with a token" line — dormant code, not shipped).

## Edge cases

| Scenario | Behaviour |
|----------|-----------|
| Stage fails (error status) | No credit charged → `recordStageCompletion` never called → counter stays put. No bonus granted. |
| Lambda retries same sub-job twice | First call wins on `attribute_not_exists(stageCounted)` guard. Second call short-circuits. No double-count. |
| User stages to count = 7 twice in rapid succession (impossible but) | First grant wins on `lastBonusStageCount <> :newCount` guard. Second short-circuits. No double-grant. |
| Batch spans two boundaries (e.g. 6 → 14) | Two distinct sub-jobs carry `bonusTriggered`. Each fires its own envelope in sequence as the user cycles through variants. Counter pulses twice. |
| Admin user stages | `recordStageCompletion` returns `bonusGranted: false` early. Counter still increments (harmless). No credit granted, no envelope shown. |
| User has never stated, on first stage (welcome toast stage) | Count goes 0 → 1. Not a multiple of 7. No bonus. Welcome toast fires as usual. |
| User has already hit count = 7 before (pre-launch existing users) | First field read returns `undefined` → treated as 0. Counter starts fresh. Minor fairness issue — a user with 20 prior stages doesn't "catch up". Acceptable: the feature is forward-looking from launch. |
| Lambda succeeds but `bonusTriggered` marker write fails | Credit IS granted (atomic earlier). Client won't show the envelope on this variant — but the counter pulses on next `creditsRemaining` refresh (via `/api/auth/me` or dashboard view). User notices on the dashboard ("why do I have 1 more credit than expected?"). Acceptable — the bonus is received, the ceremony is the second concern. |
| Single-stage flow exists or is deprecated in favour of batch-1 | Spec covers both paths — single-stage response shape updated, Lambda single-stage path updated. If single-stage is removed by the time this ships, the single-stage wiring becomes dead code and can be dropped. |

## Testing plan

### Unit tests

1. **`recordStageCompletion` — first stage, no bonus.** Mock DDB returning `stagesCompletedTotal: 0`, assert counter increments to 1, no grant. Returns `{ bonusGranted: false }`.
2. **`recordStageCompletion` — crosses boundary at 7.** Mock DDB returning counter 6 → 7 post-increment. Assert grant fires, `lastBonusStageCount = 7`, `creditsRemaining += 1`. Returns `{ bonusGranted: true, newStageCount: 7, newCreditsRemaining: N+1 }`.
3. **`recordStageCompletion` — idempotent on stage-job replay.** Mock `ConditionalCheckFailedException` on step 1. Assert no further DDB calls. Returns `{ bonusGranted: false }`.
4. **`recordStageCompletion` — idempotent on double-grant attempt.** Mock counter 7, mock `ConditionalCheckFailedException` on step 5. Assert returns `{ bonusGranted: false }` — counter still incremented but credit not granted.
5. **`recordStageCompletion` — admin skip.** Mock `user.plan = 'admin'`. Assert early return with no further DDB calls.
6. **`recordStageCompletion` — crosses boundaries at 14, 21, 28.** Parametrised test for subsequent boundaries.

### Component tests

7. **`BonusCreditEnvelope` mount.** Renders correct copy, `role="status"`, visible state class applied.
8. **`BonusCreditEnvelope` auto-dismiss.** Uses `vi.useFakeTimers()`, advances 7600ms, asserts `onDismiss` called.
9. **`BonusCreditEnvelope` reduced-motion.** Mocks `prefers-reduced-motion: reduce`, asserts exit/entry durations are 200ms and no `translateY` transform.
10. **`CreditBalance` pulse.** With `pulse=true`, asserts the glow class is applied. Triggers credit change, asserts number transitions.

### Integration tests

11. **Batch poll returns `bonusTriggered` on the right sub-job.** Set up user at count 6, seed a batch of 2 sub-jobs both completed. Assert the poll response marks the first completed sub-job (the one that pushed to 7) with `bonusTriggered: true`, and the second (count 8) with `bonusTriggered: false`.
12. **Single-stage POST /api/stage returns `bonusTriggered`.** Set up user at count 6, POST a stage. Assert response includes `bonusTriggered: true, creditsRemaining: initialCredits`.

### Manual QA checklist (browser, live or staging)

13. Fresh user: `stagesCompletedTotal` starts `undefined`/0. Complete 7 stages (6 batch sub-jobs spread across batches). Verify:
    - On stage 7's reveal, envelope rises 1.5s after the lid-lift settles
    - Counter in header ticks with glow simultaneously
    - `/dashboard` shows correct new credit balance
    - 15 + bonus − 7 = 9 credits remaining
14. Admin user: complete 7 stages. Verify no envelope. `/dashboard` shows unchanged credit display (unlimited).
15. Reduced-motion: set OS accessibility preference, repeat test 13. Verify envelope fades without slide, counter changes without scale.
16. Mobile Safari: verify envelope positioned above the home-indicator (safe-area-inset-bottom respected).

## Out of scope for this PR

- **Spend flow.** Users already can "spend" a bonus credit by doing another stage. A dedicated "re-stage with a token" UI is not built — that's its own design. If user demand surfaces, revisit.
- **Backfill for existing users.** Pre-launch users' `stagesCompletedTotal` starts at 0 even if they have historical stages. Accept the fairness hit — the feature is forward-looking.
- **Dashboard "progress toward next bonus" widget.** Not built. Users don't see their exact count-toward-next-bonus on the dashboard. The landing illustration hints at this; the real meter is not exposed in-app yet. If demand surfaces, revisit.
- **Email notification.** No email fires when a bonus is earned. The in-app ceremony is the entire notification.
- **Rewiring dormant regenerate/edit endpoints.** Spec explicitly drops the "spend a token to re-stage any past hero" copy because that code is dormant. Re-wiring those routes is separate work.

## Accessibility notes

- `BonusCreditEnvelope` uses `role="status"` + `aria-live="polite"` — screen readers announce the bonus without interrupting.
- `CreditBalance` — count changes are read out. Add `aria-label={\`${credits} credits remaining\`}` if not already present.
- All motion honours `prefers-reduced-motion: reduce`.
- Focus is not trapped or moved — the envelope is informational, not interactive.
- Color isn't the only signal — the "+1 free credit" text is the primary signal; the gold accent is reinforcement.

## Files touched (summary)

**New:**
- `src/lib/db/bonus-credit.ts` — helper
- `src/components/staging/bonus-credit-envelope.tsx` — celebration surface
- `tests/lib/db/bonus-credit.test.ts` — unit tests
- `tests/components/bonus-credit-envelope.test.tsx` — component tests
- `src/components/onboarding/bonus-credit-primer.tsx` — renamed from `regeneration-primer.tsx`

**Modified:**
- `src/types/index.ts` — User fields + `PLANS.free.features` copy
- `src/lib/db/batch-jobs.ts` or equivalent — add `stageCounted`, `bonusTriggered` to type
- `src/lib/db/staging-jobs.ts` — same two fields on StagingJob
- `src/app/api/jobs/batch/[batchId]/route.ts` — pass through new sub-job fields
- `src/app/api/stage/route.ts` — call `recordStageCompletion` (if applicable to single-stage path)
- `src/app/api/stage/batch/route.ts` — no change, Lambda handles via `propagateToBatch`
- `lambda/staging-worker/index.mjs` — inline copy of `recordStageCompletion`, call sites in batch + single paths, KEEP IN SYNC comment
- `src/components/staging/credit-balance.tsx` — `pulse` prop
- `src/components/staging/batch-result.tsx` — wire envelope + counter pulse
- `src/app/stage/result.tsx` (or equivalent single-stage result surface) — wire envelope + counter pulse
- `src/app/onboarding/onboarding-flow.tsx` — rename import + component for primer
- `src/app/layout.tsx` — metadata + FAQ structured data copy
- `src/components/landing/hero.tsx` — 2 copy changes
- `src/components/landing/how-it-works.tsx` — 1 step copy + illustration refresh
- `src/components/landing/pricing.tsx` — 3 copy changes
- `src/components/landing/comparison.tsx` — 1 copy change
- `src/components/landing/faq.tsx` — 2 copy changes
- `src/components/landing/cta.tsx` — 1 copy change
- `src/components/onboarding/how-it-works-screen.tsx` — step 04 copy
- `CLAUDE.md` — policy section refresh

**Deleted:**
- `src/components/onboarding/regeneration-primer.tsx` — replaced by renamed version

---

**Spec is approved. Proceed to implementation plan.**
