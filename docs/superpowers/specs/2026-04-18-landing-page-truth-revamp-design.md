# Landing Page Truth Revamp & Positioning Reset

**Date:** 2026-04-18
**Status:** Design approved; pending spec review
**Scope:** `src/app/page.tsx` and children in `src/components/landing/`
**Out of scope:** Pricing model redesign (placeholder pass only), visual/layout changes, SEO technical implementation (Mode 1 pass runs after copy lands), Play Store deployment

## Background

The current landing page makes claims the app cannot substantiate: structural preservation guarantees, a free trial that doesn't exist, team/analytics/bulk-upload features that aren't built, a watermark that isn't applied, a "Virtually Staged" disclosure line that isn't added to any image. It also restricts the audience to Australian agents unnecessarily — nothing about the product requires that gate.

This revamp updates copy only. Design, layout, and components stay. Final output is honest, positioned on speed + quality + value, opened up to a global audience, and primed for SEO optimisation in a follow-up pass.

## Positioning

- **Value trio:** speed, quality, value — communicated together, never individually
- **Audience:** real estate agents globally (was: Australian only)
- **Provenance signal:** "Built in Australia" retained as subtle trust signal, not audience gate
- **Tone:** fluent, market-credible, not corny AI-speak
- **Scope disclaimer:** app currently handles empty rooms only — copy must set this expectation explicitly
- **Honesty baseline:** standard disclaimer "Images are AI generated and may vary" replaces prior structural preservation guarantee framing

## Final Copy by Section

### Nav (`src/components/landing/nav.tsx`)
No copy changes.

### Hero (`src/components/landing/hero.tsx`)
- **Badge:** "Built for Australian agents" → **"Built in Australia"**
- **H1:** **Empty rooms, list-ready in under a minute.**
- **Subhead:** *Photorealistic interiors, twelve curated styles, a fraction of studio pricing.*
- **Trust line:** *Free tier included — no credit card required* (keep)
- **Stat cards:** "30s" and "12" stay (30s verified accurate; 12 matches `STAGING_STYLES` array length)
- **Buttons:** copy unchanged

### How It Works (`src/components/landing/how-it-works.tsx`)
- **Eyebrow:** *How it works*
- **Title:** **Three steps to a photo that's ready to list.**
- **Step 01 — Upload your room:** *Snap a photo of the empty room on your phone or camera. JPG or PNG, up to 10 MB.*
- **Step 02 — Choose your style:** *Pick from twelve curated styles — Modern, Coastal, Scandinavian, Hamptons, Japandi, and more.*
- **Step 03 — Get your staged photo:** *A photorealistic result in about thirty seconds. Compare against the original, download, list.*
- HD mentions removed (pricing placeholder; don't commit to HD tier here)

### Style Showcase (`src/components/landing/style-showcase.tsx`)
- **Eyebrow:** *Twelve curated styles*
- **Title:** **A style for every property.**
- **Description:** *From beachside Coastal to refined Luxury — choose the style that matches the property and the buyer.* (keep)
- **"Best for" secondary card removed** from the right column — each style shows only its aesthetic description from `STYLE_DETAILS`
- `getBestFor()` function and the card that renders it are **deleted**

### Guarantee → Review Section (`src/components/landing/guarantee.tsx`)
Full copy rewrite. Component file stays; section framing reorients from "we protect" to "here's what the pipeline actually does."

- **Eyebrow:** *How we work*
- **Title:** **Inside every staging.**
- **Left-column statement replaces prior "Altered walls are the #1 complaint" tagline:**
  *Images are AI generated and may vary. Here's what runs on every photo — from the model we chose to the review tools you get on every result.*
- **Four measures** (existing icon markup reused, copy replaced):
  1. **The model — Google Gemini Nano Banana.** Chosen for visual reasoning and 3D spatial awareness that help it respect structural context.
  2. **Structure-first prompt.** Every generation starts with explicit rules to leave walls, floors, windows, doors, and built-ins alone.
  3. **Camera-aware pre-flight.** Before furnishing, the pipeline analyses what's visible, what's partially in frame, and what to preserve — specific to your photo, not generic.
  4. **Before/after compare.** Every result lands with a slider to review against the original.

### Pricing (`src/components/landing/pricing.tsx`) — placeholder with false-claim strip
Pricing model redesign is a separate sub-project (margin math against Gemini + Stripe fees at 2.5× target). This pass only strips demonstrably false features and updates the free-credit count.

- **Free tier:** credits 5 → **10**; remove "StageRight watermark" feature line (no watermark is applied by the pipeline)
- **Starter ($29/mo):** CTA "Start free trial" → **"Get Starter"** (no trial exists)
- **Professional ($49/mo):** CTA "Start free trial" → **"Get Professional"**; remove "Priority generation" and "Conversational editing" feature lines (neither shipped in current wizard flow)
- **Agency ($99/mo):** remove "Team accounts (up to 5)", "Analytics dashboard", "Priority support", and "Bulk upload" feature lines (none shipped)
- **Lifetime Pro ($499):** remove "Conversational editing" and "Priority generation" feature lines
- **Credit explainer block:** unchanged (accurate)
- **Rooms-per-month captions:** unchanged (honest estimates)
- **Tab switcher, price points, credit amounts (except Free):** unchanged

### CTA (`src/components/landing/cta.tsx`)
- **Title:** **Your next listing deserves better than an empty room.** (keep)
- **Subhead:** *Stage your first room in under a minute. No credit card, no commitment. **Ten** free credits to see it for yourself.* (five → ten)
- **Button:** *Stage your first room free* (keep)

### Footer (`src/components/landing/footer.tsx`)
- **Brand blurb:** "AI virtual staging for Australian real estate. We add the furniture — we never touch the walls." → **"AI virtual staging for real estate. Photorealistic interiors in under a minute."**
- **Bottom-right line:** "All staged images include 'Virtually Staged' disclosure" → **"Images are AI generated and may vary"**
- **Copyright line** ("© [year] StageRight. Built in Australia.") unchanged
- **Nav link list** unchanged

## Claims Audit — Record of Decisions

### Removed (false or unimplemented)
- Structural preservation guarantee framing (hero slogan, section title, footer tagline)
- "Built for Australian agents" audience gate
- Free-trial CTAs on Starter and Professional
- Team accounts / analytics dashboard / bulk upload / priority generation / priority support features on Agency
- Conversational editing feature mention on Pro and Lifetime Pro (component exists but not imported into the live wizard flow)
- StageRight watermark on free tier (no watermark is applied)
- "All staged images include 'Virtually Staged' disclosure" (no disclosure is applied)
- "Best for" blurbs on Style Showcase (implied restriction that does not exist)

### Demoted
- Structure preservation moves from hero promise to one of four pipeline measures
- Preservation language hedges to *"chosen for…"* and *"explicit rules to leave… alone"* — approach descriptions, not outcome guarantees

### Retained (verified live)
- 30-second average staging time (user-confirmed)
- 12 curated styles (matches `STAGING_STYLES` array)
- Before/after compare slider on every result
- Camera-aware pre-flight analysis (runs invisibly inside every generation via `/api/analyse`)
- AUD pricing; cancel anytime; monthly credits don't roll over
- "Built in Australia" as provenance (already in footer; added back to hero badge)

## Implementation Sequence

1. Copy updates across six landing components (Nav unchanged; Hero, HowItWorks, StyleShowcase, Guarantee, Pricing, Cta, Footer)
2. Delete `getBestFor()` function and its card markup from `style-showcase.tsx`
3. Update Free tier credit count 5 → 10 in `pricing.tsx`
4. Run `next build` locally before push — apostrophe guard for Amplify (per `feedback_apostrophes.md` memory)
5. Commit and push to `master`; Amplify auto-deploys (~3 min)
6. Verify live on `master.d88xgpqlfkk1w.amplifyapp.com`

## Follow-up Work (explicitly not in this spec)

- **Pricing model redesign** — margin math against Gemini + Stripe fees at 2.5× target; re-issue plan copy and possibly restructure tiers
- **SEO optimisation pass** (`seo-strategy` Mode 1) on finalised copy — meta tags, heading hierarchy, schema markup, keyword placement
- **SEO site audit** (`seo-strategy` Mode 2) against the live deploy — technical SEO
- **Play Store deployment** — separate Phase 2 sub-project with its own billing-policy decision (Google Play Billing required for Android digital-goods sales; impacts margin math)
- **Memory hygiene** — update `project_edit_feature_status.md` to reflect that conversational edit is built but not currently wired to the live wizard flow
