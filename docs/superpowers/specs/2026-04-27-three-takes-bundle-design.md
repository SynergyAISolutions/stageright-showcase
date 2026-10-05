# Three Takes Bundle: Default Multi-Engine Staging

**Date:** 2026-04-27
**Status:** Approved (brainstorming → spec)
**Owner:** Tara

## Problem

Today, every user-facing staging produces **one image** via Nano Banana Pro + shared Opus 4.7 analysis at 1 credit per image. The single-image outcome is unreliable enough — sometimes structurally off, sometimes in a vibe the user doesn't love — that the very first impression of the app is a coin-flip on whether the result lands.

`/admin/compare` testing established that running NB Pro alongside GPT Image 2 (Full Medium) and GPT Image 2 (Full High) on the same shared Opus brief reliably produces **at least one variant the user feels good about per style**. AI is creative and inconsistent; three takes is how the system honours the "good feelings" promise the single path can't.

The change: make a **3-image bundle the default**, priced at 2 credits per style, and keep single-image as an explicit opt-out at 1 credit. This re-shapes the wizard, the reveal, the gallery, the listings layer, the credit mechanics, the pricing copy, and the landing page.

## Decisions Locked During Brainstorming

| Decision | Value |
|---|---|
| Default bundle | **Three Takes** (3 images, 2 credits per style) |
| Opt-out bundle | **Single Take** (1 image, 1 credit per style) |
| Free trial size | **14 credits** (≈7 default styles + ~2 bonus earned along the way) |
| Bundle choice location | Dedicated wizard step, **before** style selection |
| Style cap — single mode | 10 (today's cap, unchanged) |
| Style cap — triple mode | **3** (driven by OpenAI rate limits) |
| Reveal & viewer pattern | Single persistent slider + variant chips with persistent slider drag position |
| All variants kept | Yes — no pick-and-discard |
| Listings integration | Variants group as one multi-variant entry; auto-cover defaults to slot 3 (GPT High), star-icon swap |
| Failure policy | Up to one silent retry per failed variant; partial refund per outcome table below |
| Landing position | Hero unchanged; new dedicated section between Style Showcase and Pricing |
| Bonus credit counting | **Per credit spent**, not per take or per style |

## User-Facing Names & Terminology

- **"Three Takes"** — the 3-image, 2-credit-per-style default bundle.
- **"Single Take"** — the 1-image, 1-credit-per-style opt-out bundle.
- **"Take"** — one AI-generated version of a room in a chosen style. Replaces "image" / "staged photo" in user-facing copy where the unit matters.
- **Variant chips** in the reveal carousel: labelled **Take 1 · Take 2 · Take 3** in landing order (1 = first to arrive, 2 = second, 3 = third). Numbering is temporal, not quality-ranked. The user never sees which engine produced which take.
- **Internal slot mapping** (not user-visible): slot 1 → NB Pro · slot 2 → GPT Image 2 Full Medium · slot 3 → GPT Image 2 Full High. Fixed for cost / prompt-mode reasoning.

## Wizard Flow

`src/app/stage/page.tsx` gains one step. Indexing shifts.

| # | Step | Status |
|---|---|---|
| 1 | Hero upload + references | unchanged |
| 2 | Room types | unchanged |
| 3 | **Take Count** | **NEW** |
| 4 | Styles | live credit pill per card; cap depends on bundle |
| 5 | Notes | unchanged |
| 6 | Submit | CTA reflects bundle |

### Step 3 — Take Count (new)

Two choice cards. Default-highlighted card on top. Soft-teal selection (border-teal + bg-teal/[0.06] + navy text retained — per the choice-highlight memory).

Card 1 (default, recommended):

> ★ Recommended
> **Three Takes per style**
> 3 versions of every chosen style. Keep all of them.
>
> 2 credits per style · 3 for the price of 2

Card 2 (opt-out):

> **Single Take per style**
> One version per style.
>
> 1 credit per style

No timing copy in this step. No honesty/explainer copy beneath the cards (Tara: onboarding already covers context).

### Step 4 — Styles

`StyleRow` layout unchanged. Two additions:

1. **Per-card credit pill** — each style card shows "+1" or "+2" credit indicator depending on bundle.
2. **Live running total** at the bottom: *"5 of 10 selected · 10 credits"* (triple mode) or *"5 of 10 selected · 5 credits"* (single mode).

Cap is **10** in single mode, **3** in triple mode.

#### Bundle-switch reverse case

If a user picks 7 styles in single mode, then goes back to step 3 and selects Triple Takes, they exceed the new cap of 3. The picks are **not silently dropped**. Step 4 shows a warning bar:

> *"Triple Takes max 3 styles. Pick the 3 you want most before continuing."*

The "Continue" button is disabled until the user trims down. This matches the credit-UX-defence memory's principle of client-side gating before server enforcement.

### Step 6 — Submit

CTA copy:

- **Single bundle:** *"Stage 5 rooms · 5 credits"*
- **Triple bundle:** *"Stage 5 rooms · 10 credits · 15 versions"*

No time estimate on the button. Loader timing copy is bundle-aware (see Reveal section).

### No-credits gating

Existing client-side credit gate (per credit-UX-defence memory) updates: trigger condition is `creditsRemaining < (styles.length × bundleCost)` where `bundleCost ∈ {1, 2}`. The "Out of credits — Paid plans launching soon" banner copy is unchanged.

Server enforces 402 on `/api/stage/batch` as defence-in-depth.

## Reveal & Gallery Viewer

The reveal carousel is **one component** that powers three surfaces:

1. The reveal ceremony (immediately post-stage).
2. The gallery viewer (`gallery-viewer.tsx`).
3. The listing detail page (`/listings/[id]`) — same viewer used when a tile is opened.

### Loader copy during generation

- **Single bundle:** today's loader copy unchanged.
- **Triple bundle:** per-style loader text is *"Creating your three takes of [Style]…"* with sub-line *"30–60 seconds."* No mention of which AI; no concurrency detail.

### Reveal card — Single bundle

Today's behaviour, untouched. One slider, gift-unwrap rhythm, per-style card.

### Reveal card — Triple bundle (per style)

```
  ┌──────────────────────────────────────────────┐
  │                                              │
  │      [   Big Before/After Slider   ]         │
  │                                              │
  └──────────────────────────────────────────────┘

  Take 1 ✦   Take 2     Take 3
  [ thumb] [ thumb ] [ thumb ]
```

**Behaviour:**

- One persistent slider at the top of the card; below it, three chips.
- Chips arrive as their variant lands — **skeleton → thumbnail + number badge**, with a subtle bounce on the transition.
- Tapping a chip swaps that variant into the slider; **slider drag position persists** across variants (lifted from `/admin/compare`'s carousel — same pattern Tara already validated).
- The first variant to land is what the user sees in the slider initially; they can dive into compare while the other two are still cooking.
- A **star icon** on each chip marks the listing cover. **Default cover rule**: the slot-3 variant (internally GPT High) if it succeeded; otherwise slot 2 (GPT Medium); otherwise slot 1 (NB Pro). The cover is pinned to internal **slot**, not to chip label — chip labels reflect landing order, which is independent of slot. Tap any other chip's star → that take becomes the listing cover.

### Multi-style batch

Today's gift ceremony reveals one style card at a time. That stays. Each card uses the carousel pattern above. Cards reveal in the same gift rhythm.

### Failure modes

A single variant can fail (Lambda error, rate limit, content filter, malformed output, etc.). Policy:

- Lambda performs **up to one silent retry** per failed variant.
- If retry also fails, the variant terminates as failed — its chip simply does not appear in the carousel (no "unavailable" stub).
- The set transitions to a terminal state when all variants are terminal (success or failed-after-retry).

#### Refund table

| Successes / 3 | What user sees | Refund |
|---|---|---|
| 3 of 3 | 3 takes in carousel | 0 |
| 2 of 3 | 2 takes; missing chip absent | **+1 credit** |
| 1 of 3 | 1 take; carousel collapses to single-image presentation | **+1 credit** |
| 0 of 3 | Existing batch error handling | full refund (today's path) |

Refund is **silent and instant** — credits land back in the user's wallet during the reveal. A small line surfaces on the affected style's card: *"+1 credit refunded — Take N didn't come through this time."*

Single-mode failure (1 take, 1 credit) continues to use today's existing error/refund handling. No change.

### Gallery viewer

Today's `gallery-viewer.tsx` has two orthogonal pieces: **compare mode toggle** (off by default) and **tile-level navigation** (swipe between gallery items). The chip carousel slots in as a **third independent axis: which variant**.

User opens a triple set tile from gallery or listing:

1. **Default landing:** full-image mode, cover variant in view. Three chips visible.
2. **Tap a chip:** variant swaps into view. Compare mode untouched.
3. **Toggle "Compare with original":** flip into slider mode for the *currently selected variant*.
4. **In compare mode, tap another chip:** variant inside the slider's "after" image swaps. **Slider drag position persists.**
5. **Toggle compare off:** back to full-image, on the variant the user last selected.

Single-bundle sets show no chip strip — viewer is exactly today's behaviour. Same component, degenerate to one variant.

**Star-icon cover swap** works in both modes. Tap a chip's star → that take becomes the listing cover; listing thumbnail updates immediately.

**Outer tile-swap gesture** (left/right swipe between different gallery items) stays at the modal edge level. Chip taps move between variants within a set. The two interactions don't conflict because chips are explicit tap targets.

### Sharing & export

The existing share-export feature (per project_staging_reveal_shipped memory) currently exports one image. With Triple Takes, the export target is **whichever variant is currently in the slider**. Default is the cover variant (per the cover rule above); user can chip-swap before sharing to pick a different take. One image exported, watermarked per the existing pipeline. No "share all 3" or "share as grid" affordance in v1 — one decision at the moment of action.

## Listings Integration

### Set as a single logical entry

Per the listings-feature-shipped memory, today each staged image is one listing entry. With Triple Takes, the **set of three takes for one style is one entry**.

- **Single-bundle stagings** are equivalent to a one-variant set. Same data shape, simpler payload.
- **Triple-bundle stagings** carry three variants under one parent.

### Listing detail page

- Strip shows **one tile per set**.
- Triple sets show the cover variant + a small **"3 takes"** pill in the corner.
- Tapping a triple-set tile opens the gallery viewer with chip strip (same pattern as above).
- Listing **headline thumbnail** (dashboard listings grid + listing detail header) pulls from the cover variant of the most recently staged set; user-controlled via star-swap.

### Counts & copy

- Dashboard "X stagings" counts **sets**, not variants. A user with 3 triple sets and 2 single sets shows "5 stagings" — not "11 images." Honest about deliverables.
- Inside a set, copy can mention "3 takes" / "1 take" where useful (hover text, listing detail headers).

## Data Model & API

### DDB schema

The existing `STAGING_JOB` records stay. We add a parent **set** concept that groups variants.

Logical shape (final DDB key layout decided in implementation plan):

```
SetRecord {
  setId:               string (cuid)
  userId:              string
  listingId?:          string
  bundle:              'single' | 'triple'
  style:               string
  roomTypes:           string[]
  coverVariantSlot:    1 | 2 | 3   // default 3 for triple, always 1 for single
  variants: [
    {
      slot:            1 | 2 | 3
      jobId:           string
      status:          'pending' | 'succeeded' | 'failed'
      imageKey?:       string
      error?:          string
    }
  ]
  creditsCharged:      number
  creditsRefunded:     number
  createdAt:           string (iso)
}
```

Existing single-image stagings are equivalent to a `bundle: 'single'` set with `variants[]` of length 1. **No data migration needed.** Gallery / listing rendering unifies on the set abstraction — fewer code branches.

### Credit actions

| Action | Cost | When |
|---|---|---|
| `staging_standard` (existing) | 1 credit × N styles | Single bundle |
| `staging_triple` (new) | 2 credits × N styles | Triple bundle |
| `staging_partial_refund` (new) | +1 credit, idempotent on `setId` | 1 or 2 of 3 succeeded |

Refund is server-driven: when the Lambda reports the final state of all variants, the API layer counts successes and issues `staging_partial_refund` if 1 or 2 of 3 succeeded. Idempotent on `setId` so retries / replays don't double-refund.

### API — `POST /api/stage/batch`

Request gains a `bundle` field:

```ts
{
  styles: string[],            // 1–10 in single mode, 1–3 in triple
  bundle: 'single' | 'triple', // required, default 'triple' on client
  roomTypes: string[],
  heroKey: string,
  referenceKeys?: string[],
  listingId?: string,
  notes?: string
}
```

Server validation:
- `bundle === 'single'`: `1 ≤ styles.length ≤ 10`
- `bundle === 'triple'`: `1 ≤ styles.length ≤ 3`
- Credits required: `styles.length × (bundle === 'triple' ? 2 : 1)`
- 402 on insufficient credits (defence-in-depth — client gates first)

Response: `setIds[]` (one per style). Client polls aggregate status via the existing aggregate endpoint (per `aggregate-don't-fan-out-polls` memory).

### Lambda dispatch

Per style:

- **Single bundle:** today's flow unchanged. One Opus analysis + one NB Pro generation.
- **Triple bundle:** one Opus analysis (shared), then three parallel generations:
  - Slot 1: NB Pro (`gemini-3-pro-image-preview`)
  - Slot 2: GPT Image 2 Full Medium (`analysisMode: 'full'`, `quality: 'medium'`)
  - Slot 3: GPT Image 2 Full High (`analysisMode: 'full'`, `quality: 'high'`)

Each generation is its own Lambda invocation — same dispatch pattern `/admin/compare` already uses today, no new orchestration model needed.

### Failure & retry

- Each variant Lambda has up to **one silent retry** on failure (configurable max-retries=1).
- The set transitions to terminal state when all variants are terminal.
- API counts terminal successes, issues `staging_partial_refund` per the refund table.

### Bundle param

Bundle is set on the parent set record at creation and is **read-only** afterwards. It's a property of the set, not of any individual image. Bundle flows through to:

- The reveal renderer (single = today's UX; triple = carousel)
- The gallery viewer (single = today's behaviour; triple = chip strip)
- The listing detail page (set tile shows "3 takes" pill if triple)

## Bonus Credit Mechanic Update

Today: `User.lastBonusStageCount` tracks successful stages; +1 free credit every 7. Worked when 1 stage = 1 image = 1 credit.

In the new world, "stage" is ambiguous. The decision is to count **per credit spent**:

- Server-side: rename `User.lastBonusStageCount` → `User.lastBonusCreditCount`. Increment on credit *deduction*, not on job completion.
- Refunded credits do **not** count toward the threshold.
- Triple-bundle styles increment the counter by 2 per style; single-bundle styles increment by 1.

This makes the 14-credit free trial naturally yield ~2 bonus credits earned during initial use (14 / 7 = 2), regardless of bundle choice.

User-facing copy update everywhere the rule is mentioned:

- *"Earn a free credit every 7 stages"* → ***"Earn a free credit for every 7 you spend"***

Affected surfaces include: hero trust line (`hero.tsx` line 49 and line 73), pricing FAQ, footer, dashboard credit panel, onboarding copy.

## Landing Page Changes

Hero stays as-is (per Tara: "leave it for now") aside from the trial number. The new offer is told in a dedicated section, not the hero.

### Hero (`src/components/landing/hero.tsx`)

- *"Start free with 15 credits"* → *"Start free with 14 credits"*
- Stat card "~30s per staged photo" → unchanged for now.
- Trust line "Earn a free credit every 7 stages" → ***"Earn a free credit for every 7 you spend"***
- Body copy "A free credit every seven stages" (line 49) → ***"A free credit for every 7 you spend"***

### New section — "Three Takes"

Sits **between Style Showcase and Pricing**.

- Eyebrow: **"3 for the price of 2"**
- Headline: **"Three takes on every room."**
- Body:
  > AI is creative — and inconsistent. So most rooms come in three versions: three different takes on the same style of the same room. Compare them. Pick your favourite. Keep them all.
- Honesty footer:
  > *Prefer to move faster? Switch to single-take per style at checkout and pay 1 credit each.*

**Visual:** static rendition of the reveal carousel — one before/after slider above three chip thumbnails (Take 1 · 2 · 3), each chip showing a different take of the same room. Chips do not animate on landing — the visual is the truth of what happens in-app (per landing-mirrors-app-ux memory). Assets pulled from existing admin-account compare runs (per admin-only-public-images memory).

### Pricing section

Pack prices and credit counts unchanged (per pricing-locked memory). Add a single explainer panel **above** the pack grid:

> **How credits work**
> 1 credit = 1 single take. 2 credits = three takes of one room (recommended).
> So 50 credits = 25 versioned rooms or 50 single takes.

Pack cards stay numerically clean ("50 credits · $49.99"). Optional per-card sub-line ("≈ 25 versioned rooms") is polish, not required.

### FAQ additions

- *"What's a 'take'?"* — One AI-generated version of your room in a chosen style.
- *"Why three takes?"* — AI is creative and inconsistent. Three takes means you almost always have one you love.
- *"Can I just get one take?"* — Yes — pick "Single take per style" at checkout.
- *"Do I keep all three?"* — Yes. All three takes save to your gallery and listing.

## Out of Scope

- **Re-running a missing take.** If a variant fails after one silent retry, it's gone for that set; the user gets a refund per the table. No "regenerate this missing take" affordance in v1.
- **Choosing engines explicitly.** The user never sees or picks "Gemini vs OpenAI." Slot mapping is internal and fixed.
- **Mid-batch bundle mixing.** A single batch is all-single or all-triple. No per-style bundle mixing in v1.
- **Lean-mode for users.** `analysisMode: 'lean-direct'` stays an `/admin/compare` evaluation tool, not user-facing.
- **Edit feature.** The dormant edit flow (`/api/stage/edit`, `RegenerateControls`, etc.) stays dormant — no new edits / multi-turn for triple variants in v1.
- **Stripe / Play Billing.** Initial deploy stays free-tier only (per project_payment_rails memory). The triple bundle just costs 2 trial credits per style; paid plans rail in later.
- **Free 1-image fallback for triple users out of credits.** No automatic fallback to single-bundle on insufficient credits — the client gates and shows the existing "Out of credits" copy.

## Open Items for Implementation Plan

These are deferred to the implementation plan, not the spec:

1. **Exact DDB key shape** for the parent set record — `STAGING_SET#{setId}` vs extending `STAGING_JOB` with a parent flag. Both encode the same logical model; the cleaner-on-write choice gets picked in the plan.
2. **Aggregate polling endpoint** changes — needs to return per-variant status within each set, not just per-job.
3. **Lambda concurrency**. Need to verify our OpenAI tier's RPM ceiling before implementing — the cap of 3 styles in triple mode is conservative based on the current rate limits. Confirm during plan.
4. **Watermarking** for OpenAI variants. Existing Lambda watermarking pipeline (Sharp + Pango) must run on all three variants identically. Verify the existing `applyWatermark` flag works for OpenAI outputs the same way it does for NB Pro outputs.
5. **Listing-strip and dashboard count migrations** — existing dashboards show counts. Decide whether to count as sets immediately on deploy, or roll counts forward from a deploy date. Likely sets-immediately because legacy stagings are degenerate one-variant sets.
6. **Onboarding copy & onboarding ceremony** — onboarding gives a free first-staging walkthrough. Decide whether the trial run defaults to triple (consumes 2 of 14 credits in first attempt) or forces single for the very first run (less generous demo, conserves credits). Likely triple to honour the "good feelings" promise.
7. **Single-style routing.** Today the wizard branches single-style → `/api/stage` and multi-style → `/api/stage/batch` (`src/app/stage/page.tsx:478`). With the new set abstraction, a 1-style triple bundle is still a 3-variant set. The cleanest move is to route **all** stagings through `/api/stage/batch` (single-style becomes batch with `styles.length === 1`) and deprecate the bundle-unaware `/api/stage` path. Alternative: make `/api/stage` bundle-aware too. Decide in the plan.

## Appendix: Cost Math

Per-credit cost remains essentially unchanged.

| | Cost (AUD) |
|---|---|
| Single bundle (1 take, 1 credit) | NB Pro $0.20 + Opus $0.12 + infra $0.005 ≈ **$0.33** |
| Triple bundle (3 takes, 2 credits) | NB Pro $0.20 + GPT Med ~$0.06 + GPT High ~$0.26 + Opus $0.12 + infra $0.005 ≈ **$0.65** |
| Cost per credit — single | $0.33 |
| Cost per credit — triple | $0.32 |

Margin per credit barely moves.

**Per-batch credit ceilings:**
- Single mode: 10 styles × 1 credit = **10 credits per batch** (today's behaviour).
- Triple mode: 3 styles × 2 credits = **6 credits per batch** (rate-limit-driven cap of 3 styles).

Single mode has the higher per-batch credit ceiling. Triple mode trades batch size for variety per style.

GPT Image 2 medium/high pricing is current-market-estimate; verify against OpenAI's published rates during implementation. Cost order-of-magnitude is correct either way.
