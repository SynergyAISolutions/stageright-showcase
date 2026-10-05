# StageRight — AI Virtual Staging for Australian Real Estate

## Project Overview
StageRight is an AI-powered virtual staging app for Australian real estate agents. Agents upload a photo of an empty (or furnished) room, choose a decor style, and receive a photorealistic staged version — with the guarantee that room structure (walls, floors, windows, doors, ceilings) is NEVER altered.

## Core Value (NOT a "structural preservation guarantee")
The customer value is concrete and provable, not a guarantee about model behaviour:
1. **A staged room** the agent can list with — photorealistic, full-resolution, in twelve curated styles.
2. **Hours saved** vs organising a physical stage (briefing stylists, scheduling movers, photographing after setup).
3. **Hundreds to thousands of dollars saved** per listing vs paying a physical stager ($2,300–$3,200) or a human-edit virtual stager ($20–$30 per image, 24–48hr turnaround).

**Do NOT pitch "we never touch the walls / floors / windows" as a marketing claim.** That is a PROMPT-LEVEL directive to the model — and the model still drifts on it sometimes. Selling it as a guarantee is misleading and creates broken expectations. See `feedback_no_structural_guarantee_in_copy.md` and `feedback_structural_integrity.md` in memory.

## Existing Infrastructure & Skills
- **I have an existing project with AWS (Cognito, S3, DynamoDB) and Google Gemini API already configured.** When setting up StageRight, reference that project's patterns for SDK setup, auth flows, error handling, and env var conventions. Ask me for the path if needed.
- **I have custom frontend design skills installed.** Use them for ALL UI work. The app must look premium and distinctive — designed for real estate professionals, not generic AI-app aesthetic. No default Tailwind templates.
- **AWS account is already set up** with billing, IAM roles, and ap-southeast-2 (Sydney) region configured.
- **Google AI Studio API key is already provisioned** from my other project.

## Tech Stack
- **Frontend:** Next.js 14+ (App Router), TypeScript, Tailwind CSS
- **Backend:** AWS Lambda + API Gateway (serverless)
- **Auth:** AWS Cognito (free up to 50k MAU)
- **Database:** DynamoDB (on-demand/pay-per-request)
- **Image Storage:** AWS S3 (lifecycle to Glacier after 90 days)
- **CDN:** AWS CloudFront
- **Payments:** Stripe (AUD)
- **Primary Image Generation:** Google Gemini API — Nano Banana models (see details below)
- **Fallback Image Generation:** Replicate API — FLUX Fill or SDXL Inpainting
- **Structural Validation:** Meta SAM 2 via Replicate (validates structure preserved)

---

## Image Generation: Nano Banana (CRITICAL SECTION)

### Shipped config (Three Takes default — locked 2026-04-28, PR #8)

- **Default per-style staging is Three Takes** — 3 variants from 3 engines, 2 credits per style:
  - slot 1 → NB Pro (`gemini-3-pro-image-preview`)
  - slot 2 → GPT Image 2 Full Medium (`analysisMode: 'full'`)
  - slot 3 → GPT Image 2 Full High (`analysisMode: 'full'`)
- **Single Take is the 1-credit opt-out.** Wizard's Take Count step (between Rooms and Style) lets the user pick.
- **Caps:** 3 styles/batch in triple mode (rate-limit driven), 10 styles/batch in single mode.
- **Shared analysis (post 2026-05-07 cold-start fix):** `/api/stage/batch` does NOT run analysis anymore — it returns `202 { batchId }` in <1s. In triple mode the API only invokes the slot-1 Lambda per style with `isLeader: true`. That **leader Lambda** runs Opus 4.7 once, persists to `BATCH_JOB.roomAnalysisByStyle[style]` + `conciergeNotesByStyle[style]`, async-invokes its slot-2/slot-3 sibling Lambdas with the analysis baked into their payload, then runs its own staging variant. Single mode unchanged — Lambda runs its own analysis. Spec/plan: `docs/superpowers/specs/2026-05-06-stage-batch-cold-start-design.md`.
- **Lambda (`lambda/staging-worker/index.mjs`):** variant-aware writeback against `subJobs[i].variants[j]`; silent retry-once around `stageRoom` on first failure; parent style status derived as a rollup of variant statuses. Leader path (`runAsLeader` + `fanOutSiblings`) runs analysis + fan-out before its own variant. Stale-batch watchdog at `/api/jobs/batch` errors pending variants after 7min (must exceed the Lambda's 300s timeout + fan-out lead) so partial-refund logic can fire. Bonus accounting REMOVED from Lambda (kept as dead code with banner comment) — moved to API `deductCredits` per-credit-spent.
- **Partial refund:** at terminal state, `applyPartialRefundsForBatch` walks the batch and refunds 1 credit per style where 1 or 2 of 3 variants succeeded. Idempotent on `${batchId}:${style}` via a `refundedKeys` String List on the User record.
- **Per-credit cost ≈ $0.33 AUD in both modes** — use this number for all margin / tier / capacity math:
  - Single (1 take, 1 credit): NB Pro $0.20 + Opus $0.12 + infra $0.005
  - Triple (3 takes, 2 credits ≈ $0.65 per style): NB Pro $0.20 + GPT Med ~$0.06 + GPT High ~$0.26 + Opus $0.12 + infra $0.005
- **Spec & plan:** `docs/superpowers/specs/2026-04-27-three-takes-bundle-design.md`, `docs/superpowers/plans/2026-04-27-three-takes-bundle.md`.

### What is Nano Banana?
Nano Banana is Google Gemini's native image generation capability. It is NOT a separate product — it runs through the standard Gemini API. The key advantage for our use case: it uses visual reasoning to understand 3D spatial relationships, lighting direction, and perspective — meaning it inherently understands "don't change the walls" better than traditional inpainting models.

### Models Available (as of April 2026)
| Model | Model ID | Cost/Image (1K) | Best For |
|-------|----------|-----------------|----------|
| Nano Banana 2 | `gemini-3.1-flash-image-preview` | ~$0.045 | Default — fast, good quality, high volume |
| Nano Banana Pro | `gemini-3-pro-image-preview` | ~$0.134 | Premium — best quality, complex scenes |
| Nano Banana (legacy) | `gemini-2.5-flash-image` | ~$0.039 | Cheapest — scheduled for deprecation Oct 2026 |

### Our Engine Strategy (post Three Takes)
- **Triple mode:** NB Pro (slot 1) + GPT Image 2 Full Medium (slot 2) + GPT Image 2 Full High (slot 3) — all three run per style with one shared Opus 4.7 brief. Default for all users.
- **Single mode:** NB Pro only (1 credit). Opt-out at the Take Count wizard step.
- **No fallback chain configured.** Variant failures are silent-retried once in the Lambda (B.3 logic). Persistent failure → that variant is omitted from the carousel and the user is refunded 1 credit if 1 or 2 of 3 succeeded.
- **Standard / HD legacy table** (NB 2, FLUX Fill, etc.) remains in this file below as historical reference but is NOT the live config.

### SDK & Integration
**Package:** `@google/genai` (npm)
**API Key:** From Google AI Studio (https://aistudio.google.com/apikey)
**Env var:** `GOOGLE_API_KEY` or `GEMINI_API_KEY`

### How Image Editing Works (Mask-Free Inpainting)
Unlike traditional inpainting (SDXL/FLUX) where you must create a binary mask, Nano Banana supports **mask-free editing** via natural language. You send the room photo + a text prompt describing what to add, and the model identifies where to place furniture while preserving the room structure.

This is a HUGE simplification of our pipeline. Instead of:
`Upload → SAM Segment → Create Mask → Inpainting Model → Validate`

We can do:
`Upload → Nano Banana (with structured prompt) → Validate`

### Code Pattern: Image Editing (Node.js / TypeScript)

```typescript
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function stageRoom(
  imagePath: string,
  style: string,
  model: string = "gemini-3.1-flash-image-preview" // or gemini-3-pro-image-preview
) {
  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString("base64");
  const mimeType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";

  const prompt = [
    {
      text: `You are a professional interior designer and virtual stager for real estate.

Add stylish ${style} furniture and decor to this empty room photo.

CRITICAL RULES:
- Do NOT change any walls, floors, ceilings, windows, doors, or built-in features
- Do NOT change wall colors, floor materials, or window positions
- Do NOT add or remove any architectural elements
- Furniture must respect the room's perspective, scale, and lighting direction
- Place furniture in realistic positions (not blocking doorways or windows)
- The result must look like a professional real estate listing photo
- Output a photorealistic image, NOT a rendering or illustration`
    },
    {
      inlineData: {
        mimeType,
        data: base64Image,
      },
    },
  ];

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      const buffer = Buffer.from(part.inlineData.data, "base64");
      return buffer; // Return the staged image buffer
    }
  }
  throw new Error("No image returned from model");
}
```

### Multi-Turn Editing (Regeneration)
Nano Banana supports chat-based multi-turn editing. This means regeneration can be conversational — "try a different sofa layout" or "make it more minimalist" — rather than starting from scratch each time.

```typescript
const chat = await ai.chats.create({
  model: "gemini-3.1-flash-image-preview",
  config: {
    responseModalities: ["TEXT", "IMAGE"],
  },
});

// First staging attempt
const response1 = await chat.sendMessage([
  { text: "Add modern furniture to this empty living room..." },
  { inlineData: { mimeType: "image/jpeg", data: base64Image } },
]);

// Regeneration with refinement (keeps context)
const response2 = await chat.sendMessage([
  { text: "Try a different layout. Move the sofa to face the window and use warmer tones." },
]);
```

### Important Notes
- Generated images include a SynthID watermark (invisible, for provenance tracking — does NOT affect listing quality)
- Google AI Studio free tier: ~500 requests/day for testing. Production requires billing enabled.
- Nano Banana 2 generates at 1K-4K resolution. 4K costs more ($0.151/image)
- Rate limits apply — check https://ai.google.dev/gemini-api/docs/rate-limits
- `gemini-2.5-flash-image` is being deprecated Oct 2026 — do NOT build on it

---

## Structural Validation Pipeline
Even though Nano Banana understands "don't change the walls," we still validate:

1. **Before staging:** Run SAM 2 (via Replicate) on the original photo to create a structural mask
2. **After staging:** Compare the masked region pixels between original and staged image
3. **Threshold:** If >2% pixel deviation in structural areas, flag for review or auto-regenerate
4. **This is our quality guarantee** — no competitor does this validation step

---

## Regeneration Strategy
- Users get up to 3 attempts per room (1 initial + 2 regenerations)
- Use multi-turn chat for regenerations (model remembers context)
- At 80% base accuracy: 3 attempts = 99.2% satisfaction
- Average API calls per room: 1.24 (not 3.0) — most users happy on first try
- Present regeneration as a FEATURE ("Try another look") not a failure

## Staging Styles
Modern, Scandinavian, Coastal, Hamptons, Luxury, Farmhouse, Mid-Century Modern, Industrial, Minimalist, Contemporary Australian

## Australian Market Considerations
- All pricing in AUD
- MLS compliance: auto-add "Virtually Staged" watermark label
- Australian architectural styles (weatherboard, Queenslander, Federation)
- Target realestate.com.au and Domain for future integration
- AWS region: ap-southeast-2 (Sydney)

## Pricing Model — Credit-Based

### Cost basis
1 credit = 1 image. Cost ≈ **$0.33 AUD all-in** (NB Pro $0.20 + Opus 4.7 analysis $0.12 + infra $0.005 @ 1.52 AUD/USD). Regeneration bank adds ~10% effective cost, priced in.

### Credit Packs (one-time, no expiry while account active)
Charm-pricing convention dropped 2026-05-03 in the v2 landing redesign — now using clean integer prices (the .99 read as visual noise on the cards).
| Pack | Credits | Price AUD | $/credit | Play margin |
|------|---------|-----------|----------|-------------|
| Starter | 20 | $24 | $1.20 | ~2.81× |
| Plus | 50 | $49 | $0.98 | ~2.30× |
| Pro | 125 | $99 | $0.792 | ~1.85× |
| Bulk | 300 | $219 | $0.73 | ~1.71× |

### Subscriptions (auto-refill monthly, cancel anytime)
| Sub | Credits/mo | Price AUD | $/credit | Play margin |
|-----|-----------|-----------|----------|-------------|
| Monthly 25 | 25 | $24 | $0.96 | ~2.25× |
| Monthly 75 | 75 | $69 | $0.92 | ~2.16× |

### Free trial
**30 credits**, once per account, new signups only (raised from 14 on 2026-10-04; 14 had replaced 15 with the Three Takes shipment 2026-04-28). At default Three Takes (2 credits/style) that's about 15 styled rooms (30 at Single Take); the per-credit-spent bonus rule earns ~4 additional credits along the way. Source constant: `PLANS.free.credits` in `src/types/index.ts`, read by `createUser` in `src/lib/db/users.ts`.

### Free-credit bonus (primary quality mechanic)
- **Earn a free credit for every 7 you spend.** Credit goes straight to the user's wallet — same currency as any other credit.
- Counted server-side at credit-deduction time in `deductCredits` (`src/lib/db/users.ts`), not at stage-completion time. Triple-bundle spend of 2 credits/style increments the counter by 2; single-bundle spend by 1. Refunded credits do NOT count toward bonus.
- No separate token system. No separate spend flow. Users redeem by staging again.
- Exactly-once guarantee server-side: `User.lastBonusStageCount` + `ConditionExpression: lastBonusStageCount < :target`. (DDB attribute name kept for migration-free deploy; the field counts credits-spent, not stages.)
- Dormant in repo: `FlagReviewDialog`, `FlaggedPill`, `/admin/reviews` — not imported in live flow.

### Rules
- Credit policy: **do not expire while account is active**. If service is sunset, unused credits refunded at purchase price. No forfeiture clauses (AU ACL safe).
- GST-inclusive pricing (10% remitted to ATO). Not surfaced as a line on the landing — it's not how landing pricing is typically advertised; lives in checkout / terms instead.
- Play Billing (15%) and Stripe (1.75% + $0.30) both factored; margins above are worst-case Play net with retry bank cost baked in.
- Volume >300 credits: "Contact us" CTA. No anchor or decoy tier (Power scrapped — failed per-credit differentiation vs Bulk once retry tax was applied).
- Admin plan: unlimited (taraferguson.business@gmail.com, tara@aiwave.com.au)
- All tiers include the on-image "Virtually Staged · AI" watermark — burned in by Lambda, can't be removed by user. Admin (and `/admin/compare`) accounts skip it via `applyWatermark: false` so landing-thumbnail generation stays clean.

### Margin floors (non-negotiable)
- Small packs / entry subs: 2.5× target (Starter ~2.81× ✓; Plus/Monthly 25 ~2.25–2.30× on the sliding scale).
- Bulk: 1.5× floor (Bulk ~1.71× post-clean-integers, comfortable headroom).
- Cost floor is fixed by "never less capable models" rule — pricing is the only lever if upstream API prices rise.

### Payment rails (revised 2026-05-07)

**Earlier "free-tier only at launch" decision was reversed in conversation 2026-05-07.** Tara is bootstrapping and cannot give credits away — the paywall must be built BEFORE the public launch (it's part of the pre-launch checklist below, not a post-launch follow-up).

- **Pre-paywall state (superseded 2026-05-09 when Stripe billing shipped; kept for history):** free-tier only — every user got the free-trial credits on signup (see Free trial above for the current size), admin unlimited, no top-up path. The wizard's `/stage` notes step shows a brand-teal "Out of credits" card with "Paid plans launching soon" copy when `user.creditsRemaining < styles.length`; the server enforces 402 on `/api/stage/batch` as defence-in-depth.
- **Web at launch:** Stripe checkout for credit packs + the two subscriptions (per the locked pricing in the previous section). 1.75% + $0.30 fees baked into margin math.
- **Play Store strategy:** the TWA wrapper still ships as a FREE app — no IAP, no Play Billing surface — to stay outside Google's billing requirements for the initial Android launch. Stripe is web-only at first.
- **Future dual-rail (deferred until first Android revenue justifies the work):** Play Store app gets Google Play Billing (15%) for in-app credit purchases. Apple App Store deferred further. **CRITICAL:** when Stripe is wired for web, that same checkout flow must NOT be reachable from inside the Play Store wrapper app, or Google will reject the app for bypassing Play Billing. The wrapper needs a host-aware gate that hides web payment surfaces.

## Information Architecture (post 2026-04-28 simplification)

The logged-in app is organised around **listings**. Every staging is attached to a real listing — there's no global "stage anything" path that lands in a junk drawer.

- **Header (logged-in):** logo + credit balance + user menu only. NO tabbed nav. The logo IS the "home" link → `/dashboard`. Shared `<AppHeader />` at `src/components/layout/app-header.tsx`. Used on `/dashboard`, `/listings/[id]`, and `/stage/batch/[batchId]` result state.
- **Dashboard (`/dashboard`)** = grid of listings.
- **Listing detail (`/listings/[id]`)** = the staged photos for that listing. Stage another image from inside.
- **Stage wizard (`/stage`)** = creating a new staging. If hit without `?listingId=`, the submit step opens `PickListingDialog` (existing listings + Create new inline) — no "Save without a listing" escape.
- **Reveal (`/stage/batch/[batchId]`)** = polls + carousel.
- **Onboarding (`/onboarding`)** = cached demo flow (see below). Zero credits used.
- **Unsorted** = virtual filter at `/listings/unsorted` for legacy data only. New stagings can't land there. Tracked in code as the literal id `'unsorted'`.

### Onboarding (cached, post 2026-04-28)
- The user's first staging during onboarding is **fully cached** — no Lambda call, no credit deduction.
- Demo assets at `public/style-thumbnails/bedroom/` (admin-generated, per the admin-only-public-images memory). `_original.jpg` is the empty bedroom; per-style staged versions are `{slug}.jpg`.
- Flow: welcome → role → listing-type → volume / commercial → bombshell → bridge → how-it-works → **demo-room** (shows the empty bedroom + framing copy) → **style** → 20s simulated wait (`StagingWaitConcierge`) → reveal of cached image → disclosure / fact screens → exit.
- The user's first REAL stage happens after onboarding via the wizard, on their actual property photo.

## Current Staging Pipeline (Three Takes — 2026-04-28)
```
1. Upload hero photo → compress client-side → S3
2. Optional: add 1-3 reference angles → S3
3. Select room type(s): Living Room + Dining, Bedroom, etc.
4. NEW: Take Count — Three Takes (default, 2 credits/style, 3 versions kept) or Single Take (opt-out, 1 credit/style)
5. Pick styles: Modern, Coastal, Scandinavian, etc. Cap is dynamic (10 single / 3 triple).
6. Optional: free-form notes
7. Submit → POST /api/stage/batch with `bundle: 'single' | 'triple'` (`maxDuration = 60` for triple-mode shared analysis)
   → Auth check + credit deduction (`creditsPerStyle(bundle) * styles.length`)
   → S3 ownership check on hero + reference keys
   → For triple: run Opus 4.7 analysis once per style at API layer, share `roomAnalysis` + `concierge_notes` across the 3 variants
   → Create BatchJob with subJobs[].variants[] populated
   → Fan out: invoke 1 Lambda per variant (3 per style for triple, 1 for single)
   → Each Lambda generates → uploads to S3 → writes back to subJobs[i].variants[j]
   → Lambda silent-retry-once on first generation failure
   → Apply watermark via Sharp + Pango (skipped for admin)
8. Page polls /api/jobs/batch (variant-nested response with `bundle`, `listingId`, per-variant `imageUrl`, `coverSlot` per style)
9. Reveal page: per-style cards, each with persistent-slider VariantCarousel (chips animate in as variants land; slider drag persists across chip swaps; star-icon to swap cover slot via PATCH /api/jobs/batch/cover)
10. Terminal state: API issues partial refund (1 credit per style where 1 or 2 of 3 succeeded). 0/3 → existing batch error path full refunds.
11. The result screen is the carousel + share-export. There is no design-review or multi-turn-edit feature in the live flow. The pre-2026-04-18 dormant code (POST /api/stage/review, POST /api/stage/edit, DesignReview, RegenerateControls) was removed on 2026-05-09.
```

### Deferred follow-ups
- **Gallery viewer set-grouping (D.3):** triple-bundle stagings each create their own `Staging` record (Lambda's existing gallery write), so they appear as 9 individual tiles per batch in `/dashboard`. To group as one tile per set, the Lambda needs to persist `setId = ${batchId}:${style}` and `variantSlot` on each Staging record, and `gallery-viewer.tsx` needs to read by setId. Reveal UX is unaffected; this is dashboard polish.
- **Listing strip "3 takes" pill + cover-aware listing thumbnail (D.4):** same root cause as D.3 — needs Staging-level setId.
- **`ThreeTakesSection` landing component:** lives at `src/components/landing/three-takes-section.tsx`. Import is **commented out** in `src/app/page.tsx` until admin-generated triple-bundle demo images exist (per `feedback_admin_only_images.md`). Re-enable: drop assets into `public/landing/three-takes/`, uncomment the import + render.

### Admin-only model evaluation tool — `/admin/compare`
- Dedicated route at `/admin/compare` (gated by `src/app/admin/layout.tsx`). Not linked from anywhere in the customer flow. Admin nav strip + dashboard user menu link there for admins only.
- Admin uploads a hero photo (+ optional reference angles), picks 1+ room types, picks 1–12 styles, and gets a grid: each row is a style, each column is a model variant. Every cell is a live before/after slider (original vs that variant's output). A separate Compare carousel view shows one big slider with arrow navigation; the slider drag position persists when you swap models.
- **Six variants per style:** Gemini Nano Banana Pro, GPT Image 2 Full Low, GPT Image 2 Full Medium, GPT Image 2 Full High, GPT Image 2 Lean Medium, GPT Image 2 Lean High. So 1 style = 6 images. When references are uploaded, the two Lean columns relabel as Lean Ref Medium/High but remain the same six comparison slots.
- **Two analysis modes per variant:** `analysisMode: 'full'` and `analysisMode: 'lean-direct'`.
  - **Full mode** (Gemini + 3× GPT-Full tiers): `/api/admin/compare` runs Opus 4.7 analysis ONCE per style and passes the same `roomAnalysis` text to every Full variant. Same brief, different generators / quality tiers. If analysis fails for a style, Full variants run without analysis (surfaced in `analysisFailures`).
  - **Lean-direct mode** (GPT Lean Medium + GPT Lean High): NO separate analysis call. Hero-only runs use `buildOpenAILeanDirectPrompt`. Reference-aware runs (`promptMode: 'spatial-ref'`) use `buildOpenAILeanSpatialReferencePrompt`, which tells GPT Image 2 that Image 1 is the only image to edit and Images 2+ are spatial references only. The image model does its own internal reasoning (medium / high quality tier) instead of consuming an Opus brief.
- Each job's `analysisMode` and `promptMode` are persisted on the JOB record, so saved runs render the right Full, Lean, or Lean Ref labels in the grid + carousel + dot-strip.
- No credit deduction. No gallery write (the Lambda skips gallery + bonus-credit accounting when `params.comparisonId` is set).
- Lambda: `lambda/staging-worker/index.mjs` `stageRoomWithOpenAI` accepts `quality: 'low'|'medium'|'high'|'auto'`, `analysisMode: 'full'|'lean-direct'`, and `promptMode: 'hero-only'|'spatial-ref'` and forwards them appropriately. `OPENAI_API_KEY` must be set on the Lambda environment, and **the Lambda must be manually redeployed after any worker changes** (Amplify only ships the Next.js app — the lambda is separate).
- Regular users, onboarding, and the multi-style batch flow remain Gemini Nano Banana Pro + Full Opus analysis only — no OpenAI surface and no lean mode in the customer flow.

## Deployment
- **Hosting:** AWS Amplify (SSR, ap-southeast-2)
- **Repo:** github.com/SynergyAISolutions/stageright (private)
- **Live URL:** https://stageright.aiwave.com.au (canonical since 2026-10-05: SITE_URL, sitemap, robots, NEXT_PUBLIC_APP_URL). The default https://master.d88xgpqlfkk1w.amplifyapp.com still serves the same app.
- **`NEXT_PUBLIC_APP_URL` is inlined at BUILD time** (it drives Stripe Checkout success/cancel and Customer Portal return URLs). Changing it in the Amplify console does nothing until the next build.
- **Auto-deploy:** Push to master → Amplify builds + deploys (~3 min)
- **Env vars:** Set in Amplify console (App settings → Environment variables)
  - Must use `APP_AWS_` prefix (not `AWS_`) — Amplify reserves `AWS_` prefix
  - Env vars passed to runtime via `next.config.mjs` env block

### Deploying the staging-worker Lambda
**Amplify deploys the Next.js app only. `lambda/staging-worker/` is NOT auto-deployed** — any change to `lambda/staging-worker/**` stays dormant until you manually push it via AWS CLI.

⚠ **CRITICAL — install deps for Linux x64 BEFORE zipping.** The Lambda runs on Linux x64; `sharp` ships native binaries per platform. If you zip a node_modules that was installed on Windows, or that's missing `sharp` entirely (it's not always committed cleanly to git), the Lambda will boot-fail at INIT with `Cannot find package 'sharp' imported from /var/task/lib/apply-watermark.mjs` and every staging request will 500 instantly. Always run a fresh linux-flavoured install before zipping:
```bash
cd lambda/staging-worker && rm -rf node_modules package-lock.json && \
  npm install --omit=dev --include=optional --os=linux --cpu=x64 --libc=glibc
# Verify @img/sharp-linux-x64 and node_modules/sharp/ both exist before continuing.
```
Skipping this step is the #1 way to break production. Do not assume the committed node_modules is sufficient — historically `node_modules/sharp/` has been committed inconsistently.

Commands (from project root, bash on Windows — no native `zip`):
```bash
# 1. Zip the lambda directory.
#    Use .NET ZipFile with a `\\?\` long-path prefix — the standard
#    `Compress-Archive` cmdlet fails with DirectoryNotFoundException deep
#    inside node_modules (Windows MAX_PATH limit hit on @aws-sdk transitive deps).
#    `tar.exe -a -c -f` produces a zip Lambda rejects with "Could not unzip".
powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; \$src = '\\?\C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images\lambda\staging-worker'; \$dst = '\\?\C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images\lambda\staging-worker.zip'; if (Test-Path \$dst) { Remove-Item \$dst -Force }; [System.IO.Compression.ZipFile]::CreateFromDirectory(\$src, \$dst, [System.IO.Compression.CompressionLevel]::Optimal, \$false)"

# 2. Upload to Lambda
cd lambda && aws lambda update-function-code \
  --function-name stageright-staging-worker \
  --zip-file fileb://staging-worker.zip \
  --region ap-southeast-2

# 3. Wait for rollover (usually <30s)
aws lambda get-function-configuration \
  --function-name stageright-staging-worker \
  --region ap-southeast-2 \
  --query "{LastUpdateStatus:LastUpdateStatus,State:State}"
# Wait for: LastUpdateStatus=Successful, State=Active
```

Zip is ~14MB (well under Lambda's 50MB direct-upload limit). If the zip ever exceeds 50MB, stage to S3 first (`aws s3 cp ... s3://stageright-images/lambda-deploys/...`) then `aws lambda update-function-code --s3-bucket ... --s3-key ...`. Never forget this step when touching Lambda code — the silent-ignore failure mode is dangerous: new params get sent but the old code discards them.

## Project Structure
```
stageright/
├── CLAUDE.md
├── package.json
├── next.config.mjs              # Env var passthrough for Amplify
├── tailwind.config.ts
├── tsconfig.json
├── amplify.yml                  # Amplify build config
├── .env.local                   # Local API keys (never commit)
├── .env.example
├── src/
│   ├── app/
│   │   ├── page.tsx             # Landing page (credit-based pricing, lifetime deals)
│   │   ├── layout.tsx           # Root layout (DM Serif Display + Outfit fonts)
│   │   ├── stage/page.tsx       # Staging workflow (hero + references + review)
│   │   ├── dashboard/page.tsx   # User dashboard (credits, plan, account)
│   │   ├── (auth)/login/        # Login page
│   │   ├── (auth)/signup/       # Signup + email confirmation
│   │   └── api/
│   │       ├── stage/route.ts   # Staging (auth + credits + Nano Banana + S3)
│   │       ├── upload/route.ts  # Pre-upload images to S3
│   │       ├── analyse/route.ts # Room analysis (camera-aware, text-only)
│   │       ├── auth/login/      # Cognito sign in + set cookies
│   │       ├── auth/signup/     # Cognito sign up
│   │       ├── auth/confirm/    # Email confirmation
│   │       ├── auth/me/         # Current user (from cookies + DynamoDB)
│   │       └── auth/logout/     # Clear cookies
│   ├── components/
│   │   ├── ui/motion.tsx        # Animation primitives (spring, stagger)
│   │   ├── landing/             # Nav, Hero, HowItWorks, StyleShowcase, Guarantee, Pricing, Cta, Footer
│   │   ├── upload/              # MultiImageUpload (hero + reference angles)
│   │   ├── staging/             # StyleRow (shared with landing), RoomTypeSelector, StagingLoader, CreditBalance, FlagReviewDialog, FlaggedPill
│   │   └── comparison/          # BeforeAfterSlider (clip-path based)
│   ├── hooks/
│   │   └── use-auth.ts          # Client-side auth state
│   ├── lib/
│   │   ├── auth/session.ts      # Server-side session from cookies
│   │   ├── aws/
│   │   │   ├── dynamodb.ts      # DocumentClient (matches content-producer)
│   │   │   ├── s3.ts            # upload/download/signed URLs
│   │   │   └── cognito.ts       # Cognito auth helpers
│   │   ├── ai/
│   │   │   ├── nano-banana.ts   # Gemini staging (structure-first prompt)
│   │   │   ├── prompts.ts       # 10 staging styles + descriptions
│   │   │   └── validate.ts      # SAM 2 structural validation (built, not wired)
│   │   ├── db/
│   │   │   ├── users.ts         # User CRUD + credit deduction
│   │   │   ├── staging-jobs.ts  # Staging job tracking
│   │   │   ├── staging-sessions.ts # Conversation history for edits
│   │   │   └── usage.ts         # Cost/credit tracking
│   │   └── utils/
│   │       ├── cn.ts            # Tailwind class merge
│   │       └── compress-image.ts # Client-side image compression
│   ├── env.ts                   # Centralised env var access
│   └── types/index.ts           # Types, plans, credit costs, admin emails
├── .claude/
│   ├── commands/                # /stage-test, /cost-report, /deploy
│   └── skills/                  # 8 design skills + design-direction
└── test-images/
```

## Code Conventions
- TypeScript strict mode, no `any` types
- React Server Components by default, `'use client'` only when needed
- All API calls through server actions or API routes (never expose keys client-side)
- Use Zod for input validation
- Error boundaries around all async operations
- Mobile-first responsive design
- WCAG 2.1 AA accessible

## Build & Run
```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run test         # Run tests
npm run lint         # Lint
npm run type-check   # TypeScript check
```

## Environment Variables
```
# Google Gemini API (Nano Banana)
GEMINI_API_KEY=your_google_ai_studio_key

# Replicate (fallback + SAM validation)
REPLICATE_API_TOKEN=r8_your_token

# AWS (Sydney region)
AWS_REGION=ap-southeast-2
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=stageright-images
DYNAMODB_TABLE_NAME=stageright
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=

# Stripe (AUD)
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Prompt Engineering Notes
- Use "UNCHANGED" not "preserve" — forceful, unambiguous language
- Analysis prompt must describe ONLY what's visible in the hero shot
- Reference images inform spatial understanding but don't add furniture for unseen areas
- Include obstruction awareness — furniture placement must consider what parts of furniture or room features may block the view from the camera angle
- List every specific feature type (kitchen cabinets, countertops, splashbacks, blinds, outlets, air con) — don't rely on generic "built-in features"
- **User directives beat defaults.** Free-form user input (notes, refinement instructions) must travel as its own Lambda param AND inject as a top-of-prompt block above both structural rules and the per-room functional checklist. Filtering it only through analysis text causes dilution — analysis is truncated and the Lambda's own FUNCTIONAL FURNITURE REQUIREMENTS compete with and often beat the user's wording. On conflict, explicitly state "user directive wins."

## Edit Flow (SDK Multi-Turn Chat)
Edits use @google/genai SDK with `ai.chats.create()` for thought signatures:
- Turn 1 (replayed): hero image + original staging prompt → model builds composition memory
- Turn 2: edit instruction → model makes targeted change with full context
- One edit per turn for reliability
- Raw REST fetch() MUST NOT be used for edits — no thought signatures = full re-generation
- Known issue: need to verify edits are hitting Lambda, not old Amplify path

## Phase Plan
- **Phase 1 (DONE):** Landing page, staging, auth, dashboard, credits, room analysis, Lambda worker, Claude Opus review, SDK multi-turn edits (edits no longer wired — see below)
- **Phase 1b — landing truth revamp (DONE 2026-04-18):** Copy overhaul removing false guarantees and unshipped-feature claims, speed/quality/value positioning, audience opened beyond AU, Style Showcase uses the shared `StyleRow` picker with a room pill switcher, How It Works replaced placeholder boxes with real wizard-UX illustrations, Footer disclosure line replaced with honest AI-vary copy, Free tier bumped to 10 credits. Spec: `docs/superpowers/specs/2026-04-18-landing-page-truth-revamp-design.md`. Plan: `docs/superpowers/plans/2026-04-18-landing-page-truth-revamp.md`.

  **Live room list = SOURCE OF TRUTH IS THE CODE, NOT THIS FILE.** Check `AVAILABLE_ROOMS` in `src/components/landing/style-showcase.tsx` for which rooms are currently surfaced on the landing pill switcher; check `ROOM_SLUGS` in `src/components/staging/style-row.tsx` for the full set of defined room slugs. Do not hardcode counts in copy or memory — the list grows as admin-generated thumbnails are imported.
- **Phase 1c — cold-start fix (DONE 2026-05-07):** `/api/stage/batch` triple-mode submits used to time out on Amplify cold start because Opus 4.7 ran synchronously per style at the API layer. Fix moved analysis into the Lambda via leader-variant pattern (slot-1 runs analysis, fans out to slots 2+3). Plus stale-batch watchdog, leader buffer reuse, variant-aware `mutateSubJob`. Spec: `docs/superpowers/specs/2026-05-06-stage-batch-cold-start-design.md`. Plan: `docs/superpowers/plans/2026-05-06-stage-batch-cold-start.md`.
- **Pre-launch checklist (TODO before public ship):** these are the four things blocking launch, per conversation 2026-05-07:
  1. **Paywall.** Stripe checkout for credit packs + the two subs, webhook → `creditsRemaining` accounting, host-aware gate so Play Store wrapper can't see web checkout. **This is the revenue blocker — biggest lift, highest priority.**
  2. **Signup move.** Currently signup is at the front of the funnel; move it to AFTER the onboarding screens, just before the user lands on the gallery/dashboard. Friction reduction — users see the demo bedroom reveal before being asked for an email.
  3. **Layout + copy punch-list.** Tara has a heap of small UX/copy fixes — surface as a single batch when ready.
  4. **Thumbnail coverage continues** — 9 rooms × 12 styles via admin-generated images. Live room list source of truth: `AVAILABLE_ROOMS` in `src/components/landing/style-showcase.tsx`.
  Plus carryover from earlier Phase 1c: SEO pass (`seo-strategy` Mode 1 on finalised copy, Mode 2 audit on live). Password reset DONE (shipped 2026-10-05, PR #36).
- **Phase 2:** Google Play Store deployment (TWA or Capacitor; Google Play Billing 15% on Android digital goods affects margin); Furnished room handling; Bulk upload; Team accounts.
- **Phase 3:** Agent branding, analytics dashboard, custom domains
- **Phase 4:** Photo enhancement suite, API integrations, shoppable furniture, AR

## Shared picker & thumbnails convention
- `StyleRow` at `src/components/staging/style-row.tsx` is the ONE source of truth for the style-picker row UI. Both the wizard (`src/app/stage/page.tsx`) and the landing page (`src/components/landing/style-showcase.tsx`) import it. When you touch the picker, you touch this file — do not create a second copy.
- `STYLE_PALETTES` and `styleToFilename` live in `src/lib/ai/prompts.ts` alongside `STAGING_STYLES`, `STYLE_TAGLINES`, and `STYLE_DETAILS`. `ROOM_SLUGS` / `ThumbnailRoom` live in `style-row.tsx`.
- Landing thumbnails: `public/style-thumbnails/{room-slug}/{style-slug}.jpg`. Room slugs enumerated in `ROOM_SLUGS`. A room only appears in the landing picker once all 12 style jpgs are present and the room is added to `AVAILABLE_ROOMS` in `style-showcase.tsx` (partial rooms stay hidden).
- Thumbnails must be produced under an admin account via the real staging pipeline (admin-only-public-images rule — no user-gen content on public surfaces).
- **Importing a room**: `node scripts/import-room.mjs "Kitchen"` (label must match the DDB `roomTypes` value). The script resolves the admin user id via the users GSI, pulls the latest staging per style from DDB + S3, compresses via sharp (~85% smaller, target width 1200px, quality 78), and writes to `public/style-thumbnails/{slug}/`. Default admin email is `tara@aiwave.com.au`; override with `--admin <email>`. Missing styles are reported, not silently skipped. You still add the `AVAILABLE_ROOMS` line and commit+push yourself.

## Local dev gotchas
- **Windows: running `next build` while `next dev` is active** causes `EINVAL readlink` errors on files like `.next/server/font-manifest.json` and `.next/app-path-routes-manifest.json`. Always stop the dev server (via TaskStop on the background task) before running a clean production build, then `rm -rf .next` and restart. If a previous `npm run dev` died mid-shutdown, ports 3000 / 3001 may stay held by a zombie process — the new `next dev` just port-hops to 3002+; tell the user the actual port rather than troubleshooting the zombie.
- **Apostrophe escaping in JSX text** is still the #1 cause of broken Amplify builds (`react/no-unescaped-entities`). Use `&apos;` in JSX children; plain `'` inside TypeScript string literals is fine. Always run `npm run build` (not just `type-check`) before pushing page-component changes.

## AWS Resources
- **Amplify app:** d88xgpqlfkk1w (ap-southeast-2)
- **S3 bucket:** stageright-images
- **DynamoDB table:** stageright (pk/sk + GSI1)
- **Lambda:** stageright-staging-worker (300s timeout, 1024MB, deployed manually via CLI — see "Deploying the staging-worker Lambda" above)
- **Cognito User Pool:** ap-southeast-2_6yJPStqat
- **Cognito Client:** 2ua03cbg2m27sqidnr318pme0l
- **IAM user:** content-producer-vercel (shared with content-producer project)
  - Has inline policies: stageright-dynamodb, S3 bucket policy on stageright-images
