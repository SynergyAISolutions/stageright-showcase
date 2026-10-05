# Watermark & Disclosure — design spec

**Date:** 2026-04-26
**Status:** Draft, pending Tara review
**Implementation order:** PR1 (watermark) → PR2 (hub) → PR3 (onboarding) → PR4 (ToS, lawyer-gated)

## Summary

Burn a small "Virtually Staged · AI" pill into every staged image at generation time. Surface a `/dashboard/listing-copy` hub with copy-paste listing wording and a plain-English explainer. Add an "One last perk — Disclosure, handled." onboarding screen positioning the watermark + hub as features (no checkboxes, no friction). Update the ToS with five clauses backing the legal posture, gated on Australian lawyer review.

The combined effect: every StageRight output is on-image disclosed, the agent has ready-to-paste listing wording, and the ToS makes responsibility for ultimate disclosure explicitly the agent's. We are the helpful tool — not the legal compliance officer.

## Goals

- **Compliance by default** — watermark on every image, can't be skipped or removed by the user
- **WYSIWYG** — the watermark visible in-app is exactly what gets published; no leak surfaces
- **Gentle UX** — onboarding is a feature reveal, not a legal-form acknowledgement
- **Liability properly placed** — agent is responsible for disclosure; StageRight provides tools
- **Cheap to ship** — minimal new infra, reuses existing onboarding primitives, no DB schema changes

## Non-goals (deferred)

- C2PA / provenance metadata preservation through the watermark step. Currently Google and OpenAI sign their outputs (verified in raw bytes); Sharp re-encoding will strip the JUMBF chunk. Re-add as a separate spec when we approach EU expansion or the EU AI Act 50(2) deadline (Aug 2026).
- Per-jurisdiction copy variants beyond standard / short / EU.
- Analytics on which copy variant is most-used.
- Multi-language ToS or hub content.
- DDB-recorded acknowledgement on the onboarding screen — onboarding-progress already records step traversal, and ToS handles the legal acknowledgement.

## 1. Architecture overview

Four pieces ship in this spec.

**A. Watermark burn-in — Lambda (`lambda/staging-worker/`)**
- New helper `applyWatermark(buffer, mimeType)` — Sharp composites an SVG-rendered pill
- Inserted between model output and S3 upload (one re-encode pass)
- Skipped when admin user OR `comparisonId` is set
- New dependency: `sharp` (~25MB native binaries; zip grows from 14MB → ~40MB, still under 50MB direct-upload limit)
- Manual Lambda redeploy required (per the existing dance documented in `CLAUDE.md`)

**B. API routes — set the watermark flag**
- `src/app/api/stage/route.ts` and `src/app/api/stage/batch/route.ts` compute `applyWatermark = !isAdmin(session.user)` and pass it through in the Lambda payload
- No new API routes

**C. In-app hub — new client page**
- `src/app/dashboard/listing-copy/page.tsx` — the hub UI
- `src/lib/disclosure/copy.ts` — single source of truth for the copy variants
- `src/lib/disclosure/why-it-matters.ts` — explainer content (platform notes, jurisdiction notes)
- Static — no DB, no API. Edit means redeploy.
- Dashboard nav: add a "Listing copy" entry to the existing dashboard menu

**D. Onboarding screen — new step in the existing flow**
- `src/components/onboarding/disclosure-perks-screen.tsx` (new)
- Wired into `src/app/onboarding/onboarding-flow.tsx` between `'result'` and `'fact-ai'`
- Reuses existing primitives: `OnboardingShell`, `Eyebrow`, `OnboardingCta`

**E. ToS clauses — legal page**
- New `src/app/legal/terms/page.tsx` (verified during spec drafting: no existing terms / legal / privacy page in the repo)
- Five clauses with lawyer-review gate before merge
- `tosAcceptedVersion` field on User record + in-app banner for existing users on next login

### What does NOT change

- Wizard / dashboard / gallery image display — they pull the watermarked S3 image automatically (WYSIWYG)
- `src/lib/utils/share-export.ts` — pulls the watermarked S3 image, watermark inherits into the 1080×1920 share canvas for free
- `/api/download` — streams the watermarked S3 image as-is, no compositing
- The admin compare flow — already skips watermark via `comparisonId`

## 2. Watermark visual spec

| Property | Value |
|---|---|
| Wording | `Virtually Staged · AI` (middot rendered at 50% opacity, visual divider) |
| Position | Bottom-right corner |
| Right margin | 4% of image width |
| Bottom margin | 4% of image width |
| Pill border-radius | 999px (always full pill, doesn't scale) |
| Pill vertical padding | 1% of image width |
| Pill horizontal padding | 2.2% of image width |
| Pill width | Sized naturally by text + padding (~14% of image width with chosen wording) |
| Font family | Outfit, weight 500 (matches `share-export.ts`) |
| Font size | 2.4% of image width |
| Letter spacing | 0.2px |
| Text colour | `#FFFFFF` |
| Pill fill | `rgba(15, 29, 46, 0.86)` (brand navy, 86% opacity) |
| Drop shadow | `0 2px 10px rgba(0, 0, 0, 0.25)` |

**Edge cases**
- Sized off image **width**, not height. Tall portrait images get a properly proportioned watermark.
- Very wide panoramas (aspect > 3:1) accept the 14% width as-is.
- Minimum image-width assumption: 800px (every model output is ≥1024px today).

**Reference values** for sanity-checking implementation:
- 1024×768 image → pill ~143px × ~38px, font 25px, sitting 41px from right and 41px from bottom
- 2048×1536 image → pill ~286px × ~76px, font 49px, sitting 82px from edges

## 3. Watermark technical implementation

### SVG template

`lambda/staging-worker/lib/watermark-svg.mjs` exports a pure function `buildWatermarkPill(imgWidth)` returning the computed dimensions and an SVG string for the pill only.

```js
export function buildWatermarkPill(imgWidth) {
  const fontSize = Math.round(imgWidth * 0.024);
  const padV     = Math.round(imgWidth * 0.010);
  const padH     = Math.round(imgWidth * 0.022);
  // Outfit Medium avg char advance ≈ 0.52 × fontSize. Text is 21 chars.
  const textW    = Math.round(fontSize * 0.52 * 21);
  const pillW    = textW + padH * 2;
  const pillH    = fontSize + padV * 2;

  const svg = `<svg width="${pillW}" height="${pillH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <style>
        @font-face {
          font-family: 'Outfit';
          src: url('file:///var/task/assets/fonts/Outfit-Medium.ttf') format('truetype');
          font-weight: 500;
        }
      </style>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="${fontSize * 0.16}"/>
        <feOffset dy="${fontSize * 0.08}"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.25"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect width="${pillW}" height="${pillH}" rx="${pillH/2}"
          fill="rgba(15,29,46,0.86)" filter="url(#shadow)"/>
    <text x="${pillW/2}" y="${pillH/2}" font-family="Outfit, sans-serif"
          font-weight="500" font-size="${fontSize}" fill="#fff"
          letter-spacing="0.2" text-anchor="middle" dominant-baseline="central">
      Virtually Staged<tspan opacity="0.5"> · </tspan>AI
    </text>
  </svg>`;

  return { svg, pillW, pillH };
}
```

### Sharp composite

`lambda/staging-worker/lib/apply-watermark.mjs`:

```js
import sharp from 'sharp';
import { buildWatermarkPill } from './watermark-svg.mjs';

export async function applyWatermark(imageBuffer, mimeType) {
  const meta = await sharp(imageBuffer).metadata();
  const { svg, pillW, pillH } = buildWatermarkPill(meta.width);
  const margin = Math.round(meta.width * 0.04);

  const pipeline = sharp(imageBuffer).composite([{
    input: Buffer.from(svg),
    top:  meta.height - pillH - margin,
    left: meta.width  - pillW - margin,
  }]);

  return mimeType === 'image/png'
    ? pipeline.png({ compressionLevel: 9 }).toBuffer()
    : pipeline.jpeg({ quality: 95 }).toBuffer();
}
```

### Font asset

- `lambda/staging-worker/assets/fonts/Outfit-Medium.ttf` (~50KB), sourced from Google Fonts under SIL Open Font License
- Lambda extracts to `/var/task/...` at runtime — that's the path used in the SVG `@font-face` rule

### Admin bypass — route side

```ts
import { ADMIN_EMAILS } from '@/types';
const isAdmin = ADMIN_EMAILS.includes(session.user.email);
// In Lambda invoke payload:
applyWatermark: !isAdmin
```

### Admin bypass — Lambda side

```js
const applyWatermark = params.applyWatermark !== false && !params.comparisonId;
// Defaults to TRUE if undefined — fail-safe for any legacy route.
```

### Lambda flow

1. Fetch original from S3
2. Run analysis (Opus)
3. Call image model (Gemini or OpenAI)
4. Receive image buffer
5. **NEW: if `applyWatermark`, run `applyWatermark(buffer, mimeType)`**
6. Upload to S3
7. Save staging record to DDB

### Error handling

Fail-loud, no silent fallback to a clean image. If `applyWatermark()` throws:
- Mark job as `error`
- Surface the error in DDB + logs
- Do NOT serve the un-watermarked image — the brand promise is "every image labelled"

This means we accept that a Sharp bug temporarily blocks staging until fixed. Acceptable trade-off for the compliance promise. Aggressive logging + alerting required; CloudWatch alarm on `apply-watermark` errors.

### Sharp install (Windows host → Linux Lambda)

```bash
cd lambda/staging-worker
npm install --cpu=x64 --os=linux --libc=glibc sharp
```

Standard Sharp install on Windows pulls Windows binaries; the `--cpu` / `--os` / `--libc` flags fetch the Linux glibc binaries needed by the Lambda Node runtime. Without `--libc=glibc` Sharp may pull musl binaries which fail on Lambda.

## 4. In-app hub at `/dashboard/listing-copy`

### Files

- `src/app/dashboard/listing-copy/page.tsx` — server component, no DB calls, renders static content
- `src/lib/disclosure/copy.ts` — exports the three listing-copy variants + `lastUpdated` constant
- `src/lib/disclosure/why-it-matters.ts` — explainer content (platform notes, jurisdiction notes)

### Page structure (top to bottom)

**1. Header**
- Eyebrow: *Listing copy*
- H1: `Copy & paste for any listing.` (italic teal on `any listing`)
- Sub: *"Drop one of these lines into your listing description. We've sized them so they read well next to your real-estate copy."*

**2. Copy variants** — three cards, each with one-tap copy button + "Copied" pill on success

| Variant | Text |
|---|---|
| Standard (recommended) | `Image virtually staged with AI. Furniture is illustrative; the property is sold unfurnished.` |
| Short (when space is tight) | `Image virtually staged with AI.` |
| EU-friendly (extra explicit per AI Act Art. 50) | `AI-generated image. Property sold unfurnished.` |

**3. Heads-up note** (soft, not legal-form)

> *StageRight handles the on-image label and provenance metadata. Including a one-line note like the above in your listing description is your call — most platforms (REA, Domain, Zillow, Rightmove) require it, and it builds buyer trust. We're not legal advice.*

**4. "Why this matters" — expandable accordion** (collapsed by default)
- **What's already on every image** — explains the watermark + (later) C2PA provenance, with a small visual showing the watermark
- **Why your listing description matters** — short paragraph: the watermark covers the image; your listing description covers the listing
- **Platform notes** — one line each for REA, Domain, Zillow, Rightmove, Zoopla (paraphrased, no claim of authority)
- **By region** — short paragraph each for AU, UK, US, EU, including AU per-state quick reference
- Footer link: *Read the full Terms of Service →* (to `/legal/terms`)

**5. Footer**
- Last-updated date from `copy.ts` constant

### Entry points (3, all going to the same page)

- New menu item in the dashboard user menu: *Listing copy*
- New "Listing copy" link/button on the wizard result screen, alongside Download and Share — most useful placement, right when they're about to publish
- The onboarding feature-reveal screen's CTA (locked in section 5)

### Visual style

- Match existing dashboard chrome (cream surface, brand atmosphere, DM Serif headline, Outfit body)
- Copy cards: white surface, soft border, copy button in brand teal, "Copied" pill on success
- Why-this-matters: warm grey background panel, expandable accordion, no chrome that screams "legal page"
- Mobile-first responsive — same layout, copy cards stack

### Out of scope here

- No editing of copy variants — static file change + redeploy
- No user-specific defaults — no DB write per agent
- No analytics on which copy is most-used — can add later
- No PDF / download — copy buttons only

## 5. Onboarding screen

### Files

- New: `src/components/onboarding/disclosure-perks-screen.tsx`
- Modified: `src/app/onboarding/onboarding-flow.tsx` — adds `'disclosure-perks'` step
- Modified: `src/components/onboarding/onboarding-progress-bar.tsx` — step count +1

### Placement in flow

```
... → result → DISCLOSURE-PERKS (new) → fact-ai → fact-credit → /dashboard
```

Lands while the staged image is still in the user's muscle memory. Comes before fact-ai (slider tutorial) and fact-credit (credit balance) — both ship as is.

### Locked copy (gentle, no defensive language)

| Element | Text |
|---|---|
| Eyebrow | *One last perk* |
| H1 | `Disclosure, handled.` (italic teal on `handled.`) |
| Sub | *Two small things we take care of for you, every time.* |
| Perk 1 title | *"Virtually Staged · AI" label* |
| Perk 1 sub | *A small mark in the corner of every image.* |
| Perk 2 title | *Ready-to-paste listing copy* |
| Perk 2 sub | *In the app whenever you need it.* |
| CTA | `Continue` |
| Footer note | *Find it any time under **Listing copy*** |

Defensive copy ("can't be cropped off", "compliant on every platform") lives in the in-app hub, not here.

### Layout — HARD requirement

- Body uses `display: flex; flex-direction: column; justify-content: space-between` so the three sections (intro / perks / CTA-block) distribute across the available viewport
- **No clumping at the top** — verify on small phone (375×667), tall phone (414×896), tablet (768×1024) before merging
- No fixed heights; content drives layout
- Type sizes step down on small phones (Tailwind responsive utilities matching `fact-ai-screen.tsx`)

### Animation — mirror `fact-ai-screen.tsx`

- Use the `EXPO` cubic-bezier already defined: `[0.16, 1, 0.3, 1]`
- Eyebrow first → headline blur-up at 0.2s → perks stagger-reveal at 0.4s/0.6s → CTA at 0.8s
- One-time entrance per mount (no re-trigger on back-navigation)

### Type union update

```ts
type OnboardingStep =
  | 'welcome' | 'role' | 'listing-type' | 'commercial' | 'volume'
  | 'bombshell' | 'bridge' | 'how-it-works' | 'upload' | 'rooms' | 'style'
  | 'generating' | 'result'
  | 'disclosure-perks'  // ← new
  | 'fact-ai' | 'fact-credit';
```

### Out of scope

- No checkboxes, no tick-to-acknowledge — gentle feature reveal only
- No DDB write to record acknowledgement — existing onboarding-progress mechanism already records step traversal
- No A/B variants of the copy — single locked version

## 6. ToS additions

> ⚠️ **Lawyer-review gate.** Every clause below is a draft. None go live without independent review by an Australian commercial lawyer (AU is the primary jurisdiction). PR4 sits open with a `[blocked-on-legal]` label until cleared.

### File

- New `src/app/legal/terms/page.tsx` — verified during spec drafting that no existing terms / legal / privacy page is in the repo
- Reference link from: signup screen, dashboard footer, dashboard hub heads-up note, onboarding screen footer

### Clauses to add

**1. User responsibility for disclosure**
> User acknowledges that disclosure of virtually-staged or AI-generated imagery to prospective purchasers, tenants, real-estate platforms, MLS, and regulators is the User's sole responsibility. StageRight provides watermarking, provenance metadata, and suggested disclosure wording as tools; the User is responsible for ensuring such disclosures comply with applicable laws and platform rules in every jurisdiction in which the User publishes the imagery.

**2. No removal of provenance markers**
> User must not remove, alter, crop, obscure, or otherwise compromise any watermark, content credentials, signed metadata, or provenance information applied by StageRight to generated images. Any image so altered is no longer authorised for use under these Terms.

**3. Indemnity**
> User indemnifies StageRight, its directors, employees and affiliates against all claims, losses, damages, fines, and costs (including reasonable legal fees) arising from: (a) User's failure to disclose the AI-generated nature of imagery; (b) User's removal or alteration of provenance markers contrary to clause 2; or (c) User's use of imagery in a manner that misrepresents the actual condition of a property.

**4. No legal advice**
> Any disclosure wording, jurisdiction guidance, or platform-rule summary provided by StageRight (including in-app, in onboarding, and at `/dashboard/listing-copy`) is provided for User convenience only and does not constitute legal advice. User should obtain independent legal advice for User's jurisdiction.

**5. EU-specific obligations**
> Where User publishes imagery to consumers in the European Union, User acknowledges separate disclosure obligations as a deployer of an AI system under Article 50 of Regulation (EU) 2024/1689 (EU AI Act), and is responsible for compliance with those obligations regardless of any features or wording provided by StageRight.

### Effective-date handling

- Bump the ToS `lastUpdated` constant to the merge date
- Existing users: in-app banner on next login linking to the updated terms with one-tap "Continue" acknowledgement
- New users: existing signup ToS-accept flow stays as-is, just shows the updated text
- Track acknowledgement via a `tosAcceptedVersion` field on the User record (DDB write)

### Risks for the lawyer to specifically address

- Whether the AU ACL "unfair contract terms" regime treats the indemnity as void (likely not, given non-consumer/B2B context — but check)
- Whether clause 2 needs an explicit authorisation-revocation mechanism (e.g., automated detection and account-flag) or if the contractual prohibition is sufficient
- Whether clause 5 should also reference the UK CPRs and US state-level rules, or stay narrow to EU as currently drafted
- Whether the ToS needs to be re-presented for acceptance to *every* existing user, or only those active after a cutoff date

## 7. Build sequence (4 PRs)

**PR 1 — Watermark burn-in (Lambda)**
1. Add `sharp` to Lambda `package.json`, install with `--cpu=x64 --os=linux --libc=glibc`
2. Add `lambda/staging-worker/assets/fonts/Outfit-Medium.ttf`
3. Add `lambda/staging-worker/lib/watermark-svg.mjs`
4. Add `lambda/staging-worker/lib/apply-watermark.mjs`
5. Wire into `index.mjs` between model output and S3 upload, gated on `applyWatermark` param
6. Routes (`api/stage/route.ts`, `api/stage/batch/route.ts`) compute `applyWatermark = !isAdmin` and pass through
7. Manual Lambda zip + redeploy
8. Smoke test: stage a non-admin image → see watermark on S3 + result screen + download + share-export

**PR 2 — In-app hub**
1. Add `src/lib/disclosure/copy.ts`
2. Add `src/lib/disclosure/why-it-matters.ts`
3. Add `src/app/dashboard/listing-copy/page.tsx`
4. Add menu item to dashboard user menu
5. Add "Listing copy" button to wizard result screen alongside Download + Share

**PR 3 — Onboarding screen**
1. Add `src/components/onboarding/disclosure-perks-screen.tsx`
2. Update `OnboardingStep` type, progress bar count
3. Wire into `onboarding-flow.tsx` between `'result'` and `'fact-ai'`
4. Verify layout on small phone / tall phone / tablet — no top-clumping
5. Animation pattern matches `fact-ai-screen.tsx`

**PR 4 — ToS clauses (HOLD until lawyer review)**
1. Create `src/app/legal/terms/page.tsx`
2. Add the five clauses verbatim
3. Bump `lastUpdated`
4. Add `tosAcceptedVersion` field to User record + acceptance banner on next login
5. Do not merge until AU lawyer signs off

PR 1 → 2 → 3 ship sequentially. PR 4 ships when the lawyer comes back.

## 8. Open questions

### Resolved during spec drafting

1. **Existing terms page** — verified absent. PR4 scaffolds from scratch.

### Remaining (resolve during writing-plans)

2. **Dashboard menu structure** — read the current dashboard navigation code to know exactly where the "Listing copy" entry goes.
3. **Result-screen "Listing copy" button placement** — replace one existing button, sit alongside, or use an overflow menu? Decide after reading `src/app/stage/page.tsx`'s result section.
4. **Onboarding step count for progress bar** — count steps and verify the progress bar update.
5. **Existing-user ToS acceptance banner UX** — small modal vs toast vs full-screen dialog. Quick mock during writing-plans.

## 9. What's deferred (NOT in this spec)

- C2PA preservation through the watermark step (target Q3 2026 or pre-EU expansion)
- Per-jurisdiction copy variants beyond standard / short / EU
- Analytics on which copy variant is most-used
- Multi-language ToS / hub content
- Stripe / Play Billing payment integration (separate stream entirely)

## 10. Decision log (locked during brainstorming)

| Decision | Choice | Reasoning |
|---|---|---|
| When watermark is applied | At generation, into single S3 file | WYSIWYG, zero leak risk, simplest, free per-download |
| Watermark wording | `Virtually Staged · AI` | Same length as "Staged with AI" but adds the industry-standard "Virtually" — covers ACL, CPRs, EU AI Act, NAR, every major platform |
| Watermark size | ~14% of image width (medium pill) | Readable on 240px mobile thumbnails (the actual thumbnail size on REA / Domain), still feels like a brand mark on the full image |
| Admin exemption | Auto-bypass for admin emails | Admin staging is for landing thumbnails; no real listings under admin |
| Onboarding posture | Feature reveal, not acknowledgement | Tara's call — gentle, no friction, ToS does the legal heavy-lifting separately |
| Onboarding perks count | Two real perks | Watermark + ready-to-paste copy. No padded third perk. |
| C2PA | Defer | Not legally required for us as deployer; build later when EU expansion or Aug 2026 nears |
| ToS clauses | Five drafts, lawyer-gated | Cover responsibility, no-removal, indemnity, no-legal-advice, EU-specific |
