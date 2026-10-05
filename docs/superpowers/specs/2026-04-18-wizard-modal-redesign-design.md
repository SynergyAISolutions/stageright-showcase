# Wizard modal redesign + flag-for-review — design spec

**Date:** 2026-04-18
**Author:** Tara + Claude (brainstorm)
**Status:** Approved for planning
**Target file:** `src/app/stage/page.tsx` (+ new components, endpoints, admin page)

---

## Overview

Rework the staging wizard so every step lives in a **single, consistent card** with the same dimensions, pinned question-header and Back/Continue footer, and internal scroll for long content. Reference-image upload becomes its own step (currently buried inside the upload step). The Review step is eliminated — its job is absorbed by a clickable progress bar and a tight summary on the Notes step. The Result screen is pulled into the same card shape instead of the current page-sprawl, and gains a quiet **"Flag for review"** link that lets users submit a staging they feel broke the structural guarantee. Submissions go to a new **admin review page** at `/admin/reviews` where Tara can accept (auto-refund credit) or decline.

## Goals

1. **Consistency** — every step feels like part of the same object. No step is "huge" and another "small".
2. **Centred, neat, professional** — content vertically centred inside a fixed frame; minimal scroll chrome.
3. **Mobile-perfect** — every screen translates to a full-bleed phone card with pinned header/footer, safe-area awareness, and 44px touch targets.
4. **Trust-building flag feature** — give users a way to call out structural failures and get credits back. Differentiator. Abuse-resistant by design.
5. **Reliable, simple build** — reuses the current wizard state machine. No introducing true dialogs for the main flow; only the flag-confirm dialog uses that pattern.

## Non-goals (out of scope this round)

- Auto-triage of flagged stagings via the existing design-review Gemini pass (future phase 3).
- Bulk-upload or team accounts.
- Stripe payment integration for credit top-ups.
- Email template design beyond basic transactional content.
- Rewriting `MultiImageUpload`'s internal file-handling logic — we reuse it; only its placement/containment changes.

## User flow summary

### Before
```
upload (hero + refs in one card) → rooms → style → notes → review → generating → result (sprawled)
```

### After
```
upload → reference (new, optional) → rooms → style → notes → generating → result (in card, w/ flag link)
```

Progress bar has **5 segments** (upload · reference · rooms · style · notes). Each segment is **clickable** to jump back and edit — this replaces the standalone Review step. The Notes step shows a small summary chip-row of choices and a "Stage this room · 1 credit" final Continue button.

---

## Design language

### Card shell

| Property | Desktop | Mobile |
|---|---|---|
| **Width** | 640px fixed | `100vw` (full-bleed, 6px gutter) |
| **Height** | 720px fixed | `100dvh` minus status bar / home bar |
| **Radius** | 16px | 22px top corners only (sheet feel); footer hugs bottom edge |
| **Shell** | `bg-white` + `border` + `shadow-medium` | `bg-white` on `bg-cream` page |
| **Header** | Pinned top — tag (e.g. "Step 2 · Optional") + question + one-line subtitle, border-bottom | Same, sticky via `position: sticky` |
| **Body** | Flex: center vertically, overflow hidden → internal scroll when content exceeds | Same; scroll-on-y with fades |
| **Footer** | Pinned bottom — Back (left) + Continue (right), `border-top` | Pinned via fixed positioning within card; `padding-bottom: env(safe-area-inset-bottom)` |

The card height is **fixed** on every step. When content is small (room chips, notes textarea) it sits centered with generous breathing room. When content is tall (style tile grid) it scrolls **inside** the card, with soft fades at top/bottom to hint more below.

### Typography & colour

- **Headings:** `DM Serif Display`, existing `text-brand-navy`
- **Body:** `Outfit`, existing `text-ink` / `text-ink-muted`
- **Primary actions:** `bg-brand-navy` solid with white text
- **Secondary actions:** white with `border-surface-border` and muted text
- **Ghost/skip actions:** transparent with underline
- **Accent:** `text-brand-teal` for positive/selected states
- **Card surfaces:** `bg-white` on `bg-surface-secondary` page

### Progress bar

Existing segmented bar, but each segment becomes a `<button>`:
- Clicking a completed/current segment jumps to that step (lossless — state preserved)
- Future segments are disabled until they've been reached
- Segment has `title="Edit Upload"` etc. for tooltip
- Keyboard-navigable with arrow keys

This pattern replaces the Review step while keeping edit-in-place intuitive.

### Responsive breakpoint

- **`≥ 768px`** → centered 640×720 card on `bg-cream` page
- **`< 768px`** → full-bleed card filling viewport

### Bottom-sheet pattern (mobile modals)

Only used for:
- Flag-for-review confirmation dialog

Standard iOS/Android sheet:
- Dim backdrop (`rgba(12, 39, 72, 0.5)`)
- Content slide-up from bottom, rounded top corners
- Drag-handle bar at top (3×34px, `bg-surface-border`, rounded)
- Tap backdrop OR swipe down to dismiss
- `padding-bottom: env(safe-area-inset-bottom)`

Desktop equivalent is a centered true modal (`max-w-md`) with the same content.

---

## Per-step specifications

### Step 1 · Upload

| | |
|---|---|
| **Question** | "Upload your room photo" |
| **Subtitle** | "JPG or PNG, up to 20MB." |
| **Content** | Reuses `MultiImageUpload`'s hero section only (reference section extracted — see Step 2). Drop-zone fills the body area at `aspect-[4/3]`. Drag+drop works on desktop. |
| **Footer** | No Back button on step 1. Continue is disabled until a hero is chosen and S3 upload completes (spinner inline). |
| **Transitions** | Upload success auto-enables Continue (no auto-advance — user explicitly taps Continue). |

### Step 2 · Reference images (NEW, optional)

| | |
|---|---|
| **Tag** | "Step 2 · Optional" (teal pill) |
| **Question** | "Want to add more angles?" |
| **Subtitle** | "Optional — helpful in specific situations." |
| **Content** | A "When this helps" explainer block on top (teal-tinted box, bullet list of 4 situations), then a reference upload area below that accepts up to 3 more photos. |
| **Footer** | Back · Skip (ghost) · Continue (primary) |
| **Explainer copy** | See [Reference copy](#reference-copy-block) below |
| **Continue label** | "Continue →" (whether 0 or N references added) |

#### Reference copy block

```
When this helps

Extra photos of the same room from different angles help the AI understand
the layout before placing furniture. Worth adding when:

  • Your main photo cuts off a doorway or connecting room (open-plan)
  • A window, alcove, or fireplace isn't visible from the main angle
  • The room has unusual lighting or multiple light sources
  • It's a long or irregular-shaped room the main photo can't capture in one frame

The AI only furnishes your main photo — extra angles are just for context.
```

### Step 3 · Room type

| | |
|---|---|
| **Question** | "What type of room is this?" |
| **Subtitle** | "Tap one. Tap more if open-plan." |
| **Content** | Reuses existing `RoomTypeSelector` — chips wrap, justify-centre |
| **Footer** | Back · Continue (disabled until ≥1 selected) |

### Step 4 · Pick a style

| | |
|---|---|
| **Question** | "Pick a style" |
| **Subtitle** | "Scroll for more. Tap to select." |
| **Content** | `StyleTile` grid — 3 cols desktop, 2 cols mobile. All 12 styles visible via internal scroll. Top/bottom soft fades inside the card body hint at more content. A thin scrollbar appears on hover (desktop) or while scrolling (mobile). |
| **Footer** | Back · Continue (has a default `Modern` selection, so always enabled) |

### Step 5 · Notes (final input step)

| | |
|---|---|
| **Tag** | "Step 5 · Optional" (teal pill) |
| **Question** | "Anything else we should know?" |
| **Subtitle** | "Helps when the photo doesn't say everything." |
| **Content** | Two vertically-stacked blocks inside the card body: (1) the notes textarea (`rows=4`, `resize: none`, `bg-surface-secondary`), then (2) a small summary block titled "Your choices" with chip pills for each — `Bedroom · Scandinavian · 1 reference` — each chip is a button that jumps to that step (same behaviour as the progress bar segment). |
| **Footer** | Back · **"Stage this room · 1 credit"** (primary, navy) |
| **Keyboard behaviour** | On mobile when the textarea focuses, the footer stays visible above the keyboard (using `100dvh` + fixed positioning). The summary chip row scrolls internally if needed. |

### Generating

| | |
|---|---|
| **Content** | Existing `StagingLoader` — placed inside the card shell for visual consistency (same width, same background). |

### Result

| | |
|---|---|
| **Tag** | "✓ Staging complete" (teal solid pill on teal-tinted header) |
| **Question** | "Your staged room is ready" |
| **Subtitle** | "Scandinavian · Bedroom · 1 credit used" |
| **Content** | 1. Before/after slider (fills card body width at aspect 16:9, so ~640×360 on desktop). 2. Design score pill row showing the existing `DesignReview` component's structural verdict ("Structure preserved · 9.0/10 · Walls, floor, windows unchanged"). 3. Three primary actions in a row: **Download** (navy primary) · **Try another style** (white) · **Save to gallery** (white). 4. Secondary row at the bottom: "Walls or structure changed? Flag for review" (tertiary link, left-aligned, eligibility-gated) · "Start new upload" (ghost, right-aligned). |
| **Card dimensions** | Same 640×720 as every other step. The comparison slider at 640×360 is readable; users who want a closer look can click the image to open a full-viewport lightbox (future enhancement, optional in phase 1). |
| **Flag link visibility** | Client-side gated by the rules in [Eligibility rules](#eligibility-rules) below (most importantly: only shown when the staging used no reference images). Client calls `GET /api/reviews/eligibility` before rendering the link so backend is the source of truth. |
| **"Try another style"** | Expands inline inside the result card into a 3-col style picker (same tiles as step 4). Tapping a style immediately re-stages with the same hero (charges 1 credit, shows loader inside the card, swaps the before/after image when done). No navigation away. |

### Flag-for-review dialog

| | |
|---|---|
| **Desktop** | Centered `max-w-md` modal on dim backdrop. |
| **Mobile** | Bottom sheet with drag-handle, rounded top corners. |
| **Title** | "Flag this staging for review" |
| **Body** | "Our team will review the original and staged photos. If we agree the structure was changed, **your credit will be refunded** and we'll let you know by email within 24 hours." |
| **Input** | Optional textarea: "What changed? (optional)" — placeholder `"e.g. the window has moved / the kitchen splashback is different / a new doorway appeared"` |
| **Actions** | Cancel (secondary) · Submit for review (primary navy) |
| **Post-submit** | Dialog closes. Result card shows a replacement pill where the flag link was: "Under review · we'll email you within 24h" (teal-tinted, non-dismissible). |

---

## Flag-for-review feature

### Eligibility rules

A result shows the flag link **only if all of**:
1. The staging used no reference images (`referenceS3Keys.length === 0`).
2. No existing pending review for this user (`userPendingCount === 0`) — one at a time.
3. Staging completed within the last 30 days (no flagging of ancient results).
4. User hasn't already flagged this specific staging session.
5. A 60-second "cool-down" after the staging renders before the link becomes clickable (prevents reflex-clicks before the user has actually looked).

These are stacked guardrails against abuse without punishing legitimate users.

### DynamoDB entity

New entity in the existing single-table design:

```typescript
export interface FlagReview extends BaseEntity {
  id: string;                    // uuid
  userId: string;
  userEmail: string;             // denormalized for admin view
  sessionId: string;             // the staging session being flagged
  originalS3Key: string;         // hero image
  stagedS3Key: string;           // flagged generation
  style: string;
  roomTypes: string[];
  userNote?: string;             // optional explanation
  status: 'pending' | 'accepted' | 'declined';
  adminNote?: string;            // set when resolved
  resolvedBy?: string;           // admin email who resolved
  resolvedAt?: string;           // ISO
  creditRefunded: boolean;       // true iff status=accepted and refund fired
}
```

**Key patterns:**
```
pk=REVIEW#{id}                sk=META
gsi1pk=REVIEWS#{status}       gsi1sk={createdAt}
gsi1pk=USER#{userId}          gsi1sk=REVIEW#{createdAt}
```

The first GSI supports the admin page's "list all pending, newest first" query. The second ensures we can check a user's existing pending reviews in O(1).

### API endpoints

| Method | Route | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/reviews` | Submit a flag-for-review | User session |
| `GET` | `/api/reviews/eligibility?sessionId=X` | Check if a session is eligible (client-side gate before showing link) | User session |
| `GET` | `/api/admin/reviews?status=pending` | List reviews | Admin email only |
| `POST` | `/api/admin/reviews/{id}/accept` | Accept → refund credit → email user | Admin email only |
| `POST` | `/api/admin/reviews/{id}/decline` | Decline → email user (with optional reason) | Admin email only |

**`POST /api/reviews` handler flow:**
1. Validate session exists and belongs to the user.
2. Check all eligibility rules (references, pending count, age, duplicate).
3. Create `FlagReview` record with `status=pending`.
4. Send notification email to `taraferguson.business@gmail.com` with review URL.
5. Return `{ reviewId, status: 'pending' }`.

**`POST /api/admin/reviews/{id}/accept` handler flow:**
1. Verify admin.
2. Load review, confirm still `pending`.
3. Update status to `accepted`, resolvedBy, resolvedAt.
4. Call existing credit-add helper to refund 1 credit to the user.
5. Send email to user ("Your flag was approved — 1 credit has been added back to your account").
6. Return updated review.

**Decline is the same but status `declined`, no refund, different email body (with `adminNote` if set).**

### Email notifications

Simple transactional emails via AWS SES (already available in ap-southeast-2):

**To admin on new flag:**
```
Subject: New flagged staging — {userEmail}

A user has flagged a staging for review.
Room: {roomTypes} · Style: {style}
Note: {userNote || '(none)'}

Review it: https://master.d88xgpqlfkk1w.amplifyapp.com/admin/reviews
```

**To user on accept:**
```
Subject: We've added a credit back to your account

Thanks for flagging that staging. We've reviewed it and agreed — the structure
didn't look right. We've added 1 credit back to your account so you can try again.

— The StageRight team
```

**To user on decline:**
```
Subject: Update on your flagged staging

Thanks for flagging that staging. We've reviewed the original and the output and,
on balance, we don't think the structure changed significantly. {adminNote if set}

If you're still not happy, reach out and we'll talk it through.

— The StageRight team
```

---

## Admin reviews page

**Route:** `/admin/reviews`
**File:** `src/app/admin/reviews/page.tsx` (new)
**Gate:** Server-side check — `session.user.email` must be in `ADMIN_EMAILS` (already defined in `src/types/index.ts`). Non-admins get a 404.

### Desktop layout

- Page header: "Flagged stagings" (DM Serif) + one-line subtitle
- Stats bar (right-aligned): pending count · this-week count · accepted % · resolved count
- List of pending review rows (newest first), each showing:
  - **Thumbnails** side-by-side (original · staged, ~64×48px, with small `ORIG` / `STAGED` corner tags)
  - **Meta** column: "User name · Room · Style" heading; "time ago · email · quality" subtitle
  - **User note** in a bordered quote-block with teal left-border
  - **Actions** column: Accept (teal solid) · Decline (white with muted border)
- Clicking a thumbnail opens the full-size original and staged images in a side-by-side lightbox for detailed inspection
- Tabs / filter: "Pending (N) · Resolved (N)" at the top; resolved view shows accepted/declined with timestamps

### Mobile layout

Same page, but each row restacks vertically:
1. Meta heading + timestamp (top row, justify-between)
2. Thumb pair (full-width, each thumb 50%)
3. User note (full-width, bordered block)
4. Actions as full-width buttons (Accept on top, Decline below)

Stats bar scrolls horizontally with a soft right-edge fade.

### Empty state

When 0 pending:
> ✨ All caught up
> No pending reviews. Check back later.

---

## Accessibility checklist

- All buttons have `aria-label` when icon-only
- Progress bar segments are `<button>` elements with `aria-current="step"` on the active segment and `aria-label="Step N: Upload (completed)"` etc.
- Focus ring visible on all interactive elements (`focus-visible:ring-2 ring-brand-teal`)
- Keyboard navigation works end-to-end — Tab through buttons, Enter/Space to activate, arrow keys on the progress bar
- Flag dialog: `role="dialog"`, `aria-modal="true"`, focus traps inside, Escape closes, focus returns to flag link on close
- Bottom sheet mobile: swipe-down dismissal is an enhancement, tap-backdrop and Close button are primary dismissals
- Textarea has associated `<label>`
- Colour contrast ≥ WCAG AA across all text/background combos (navy/white passes; muted/white passes)

## Mobile hardening checklist

- `min-h-[100dvh]` on wizard page container (stays correct when browser UI hides/shows)
- `padding-bottom: env(safe-area-inset-bottom)` on fixed footer
- `padding-top: env(safe-area-inset-top)` on fixed header
- Touch targets ≥ 44×44px (buttons, chips, progress segments, tile corners)
- Textarea: `autocapitalize="off"` and use `visualViewport` API if available to shrink content above the keyboard
- No horizontal scroll — all content clamps to `100vw`, grids use `minmax(0, 1fr)` to prevent text-overflow blow-outs
- Tap feedback — `active:scale-[0.98]` on primary buttons (already exists)
- Image rendering: use `next/image` or native `<img>` with `loading="lazy"` for style tiles

---

## Files to modify / create

### Modify
| File | Change |
|---|---|
| `src/app/stage/page.tsx` | Rework the wizard: 5 steps + result, card shell wrapping each, clickable progress bar, "Reference" as new step 2, drop the standalone `review` step, result card with flag link, inline "try another style" |
| `src/components/upload/multi-image-upload.tsx` | Split into two focused components: `HeroUpload` (step 1 content) and `ReferenceUpload` (step 2 content). Keep the internal file-handling helpers. |
| `src/types/index.ts` | Add `FlagReview` interface and key-pattern comment; no change to existing types |
| `src/lib/db/index.ts` (or equivalent) | Add `flag-reviews.ts` CRUD helpers alongside existing `staging-jobs.ts`, `staging-sessions.ts` |

### Create
| File | Purpose |
|---|---|
| `src/components/wizard/wizard-card.tsx` | The reusable card shell (header slot, body slot, footer slot). Used by every step. |
| `src/components/wizard/wizard-progress.tsx` | Clickable segmented progress bar. |
| `src/components/wizard/hero-upload.tsx` | Step 1 content (extracted from `MultiImageUpload`) |
| `src/components/wizard/reference-upload.tsx` | Step 2 content with "When this helps" block |
| `src/components/wizard/notes-step.tsx` | Step 5 content with summary chips + keyboard-aware textarea |
| `src/components/staging/flag-review-dialog.tsx` | Modal on desktop / bottom-sheet on mobile, with optional note textarea |
| `src/components/staging/flagged-pill.tsx` | The "Under review — we'll email you" replacement pill shown after submit |
| `src/lib/db/flag-reviews.ts` | DynamoDB CRUD for `FlagReview` entity |
| `src/lib/email/flag-emails.ts` | Transactional email templates (admin-new, user-accepted, user-declined) |
| `src/lib/email/ses.ts` (if not existing) | Thin SES client wrapper |
| `src/app/api/reviews/route.ts` | `POST /api/reviews` + `GET /api/reviews/eligibility` |
| `src/app/api/admin/reviews/route.ts` | `GET /api/admin/reviews?status=pending` |
| `src/app/api/admin/reviews/[id]/accept/route.ts` | Accept endpoint |
| `src/app/api/admin/reviews/[id]/decline/route.ts` | Decline endpoint |
| `src/app/admin/layout.tsx` | Admin-only server guard (redirect non-admin emails to /dashboard) |
| `src/app/admin/reviews/page.tsx` | Admin reviews page (queue + resolved tab) |
| `src/components/admin/review-row.tsx` | Row component used on the admin page |
| `src/components/admin/review-lightbox.tsx` | Full-size before/staged side-by-side inspection overlay |

---

## Phasing

### Phase 1 (this spec) — MVP

Everything above, minus:
- **No** auto-triage based on design-review score (admin reviews all flags manually)
- **No** bulk-accept / bulk-decline in admin page
- **No** filters / search on admin page (newest-first pending is enough; ≤10 pending expected at launch volume)
- **No** in-app notifications to admin (email only)

### Phase 2 (later)

- Richer admin page: filters, search, CSV export
- Auto-triage: low structure-score flags are pre-marked in the queue
- Per-user flag analytics (abuse detection)
- In-app notifications when a flag is resolved

### Phase 3 (much later)

- User-facing reputation ("87% of your flags were accepted — you've helped us improve")
- Flag history in user's dashboard

---

## Decisions made during the brainstorm

For future-me context:
- **Modal shape:** "card on page" chosen over true-dialog and immersive-full-bleed. Simpler build, no close-target-destination question, feels premium without popup plumbing.
- **Review step removed:** clickable progress bar + summary chips on the Notes step replace it.
- **Reference as its own step:** makes the Upload step lighter and lets us explain *when* references help (users currently skip blindly).
- **Consistent card size:** all steps share a fixed-dimension frame. Short content sits calmly, long content scrolls internally.
- **Flag eligibility restricted to no-references path:** closes the "submit intentionally bad references → claim refund" abuse loophole. Also reinforces the value proposition of adding references.
- **Flag dialog = true modal / bottom sheet:** this IS the right place for a real dialog — it's a commitment action, not a journey step.
- **Admin reviews page over DynamoDB console:** Tara wants both an email trigger and a proper UI. Email notifies; the page is where work happens.
- **Notification to `taraferguson.business@gmail.com`:** one admin email, not both. Can add `tara@aiwave.com.au` later if the workflow splits.
