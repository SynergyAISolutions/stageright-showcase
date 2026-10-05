# Landing Page Truth Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite landing page copy across seven components to remove false claims, pivot positioning to speed/quality/value, open audience beyond AU, and strip unimplemented features from the pricing section.

**Architecture:** Copy-only changes across presentational components. No new files, no layout changes, no new unit tests (no landing-page tests exist in the codebase and copy is spec-verified, not logic-verified). Each task edits one component in page-render order (hero → footer), runs `npm run build` (not just type-check — apostrophe violations only surface in full build per `feedback_apostrophes` memory), and commits.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion (already wired; no new dependencies).

**Spec:** `docs/superpowers/specs/2026-04-18-landing-page-truth-revamp-design.md`

---

## Task 0: Pre-flight

**Files:** None (verification only)

- [ ] **Step 0.1: Verify working tree**

Run:
```bash
git status
```
Expected: `On branch master`. Working tree may show pre-existing untracked/modified files (`lambda/staging-worker.zip`, `.claude/settings.local.json`) — those are unrelated and can be ignored. If there are any uncommitted landing-page changes, stash or commit them before continuing.

- [ ] **Step 0.2: Baseline build**

Run:
```bash
npm run build
```
Expected: build completes successfully. If the baseline build fails before any edits, stop and investigate.

---

## Task 1: Hero — badge, H1, subhead

**Files:**
- Modify: `src/components/landing/hero.tsx`

- [ ] **Step 1.1: Swap badge text**

In `src/components/landing/hero.tsx`, replace:
```tsx
              Built for Australian agents
```
with:
```tsx
              Built in Australia
```

- [ ] **Step 1.2: Replace H1**

Replace:
```tsx
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl tracking-tight text-brand-navy leading-[1.08]">
              We add the furniture.
              <br />
              <span className="text-brand-teal">Not the walls.</span>
            </h1>
```
with:
```tsx
            <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl tracking-tight text-brand-navy leading-[1.08]">
              Empty rooms,
              <br />
              <span className="text-brand-teal">list-ready in under a minute.</span>
            </h1>
```

- [ ] **Step 1.3: Replace subhead**

Replace:
```tsx
            <p className="mt-6 text-lg sm:text-xl text-ink-secondary leading-relaxed max-w-[50ch]">
              Upload an empty room, pick a style, get a photorealistic staged
              photo in under 30 seconds. Prompts tuned to furnish — not
              redecorate.
            </p>
```
with:
```tsx
            <p className="mt-6 text-lg sm:text-xl text-ink-secondary leading-relaxed max-w-[50ch]">
              Photorealistic interiors, twelve curated styles, a fraction of
              studio pricing.
            </p>
```

- [ ] **Step 1.4: Build**

Run:
```bash
npm run build
```
Expected: successful build.

- [ ] **Step 1.5: Commit**

```bash
git add src/components/landing/hero.tsx
git commit -m "fix(landing): hero — speed/quality/value positioning, drop AU gate and preservation slogan"
```

---

## Task 2: How It Works — title and 3 step descriptions

**Files:**
- Modify: `src/components/landing/how-it-works.tsx`

- [ ] **Step 2.1: Replace Step 01 description**

In the `steps` array, replace:
```tsx
    description:
      'Snap a photo of the empty room at the property. JPG or PNG, up to 10MB. Works from any phone or camera.',
```
with:
```tsx
    description:
      'Snap a photo of the empty room on your phone or camera. JPG or PNG, up to 10 MB.',
```

- [ ] **Step 2.2: Replace Step 02 description**

Replace:
```tsx
    description:
      'Pick from 12 curated styles — Modern, Hamptons, Coastal, Scandinavian, Japandi, and more. Select Standard or HD quality.',
```
with:
```tsx
    description:
      'Pick from twelve curated styles — Modern, Coastal, Scandinavian, Hamptons, Japandi, and more.',
```

- [ ] **Step 2.3: Replace Step 03 description**

Replace:
```tsx
    description:
      'AI places realistic furniture with prompts tuned to leave walls, floors, and windows alone. Compare, download, list.',
```
with:
```tsx
    description:
      'A photorealistic result in about thirty seconds. Compare against the original, download, list.',
```

- [ ] **Step 2.4: Replace section title**

Replace:
```tsx
            <h2 className="font-heading text-3xl sm:text-4xl tracking-tight text-brand-navy max-w-lg">
              Three steps from empty to extraordinary
            </h2>
```
with:
```tsx
            <h2 className="font-heading text-3xl sm:text-4xl tracking-tight text-brand-navy max-w-lg">
              Three steps to a photo that&apos;s ready to list.
            </h2>
```

Note: `&apos;` is required — JSX text cannot contain raw apostrophes (`react/no-unescaped-entities` lint rule will block build).

- [ ] **Step 2.5: Build**

Run:
```bash
npm run build
```
Expected: successful build.

- [ ] **Step 2.6: Commit**

```bash
git add src/components/landing/how-it-works.tsx
git commit -m "fix(landing): how-it-works — trim copy, drop HD tier mention, new title"
```

---

## Task 3: Style Showcase — eyebrow, title, remove Best-for card + helper

**Files:**
- Modify: `src/components/landing/style-showcase.tsx`

- [ ] **Step 3.1: Update eyebrow**

Replace:
```tsx
            <p className="text-sm font-medium text-brand-teal uppercase tracking-wider mb-3">
              12 curated styles
            </p>
```
with:
```tsx
            <p className="text-sm font-medium text-brand-teal uppercase tracking-wider mb-3">
              Twelve curated styles
            </p>
```

- [ ] **Step 3.2: Update title**

Replace:
```tsx
            <h2 className="font-heading text-3xl sm:text-4xl tracking-tight text-brand-navy max-w-lg">
              Every room deserves the right look
            </h2>
```
with:
```tsx
            <h2 className="font-heading text-3xl sm:text-4xl tracking-tight text-brand-navy max-w-lg">
              A style for every property.
            </h2>
```

- [ ] **Step 3.3: Remove the "Best for" card and simplify wrapper**

Replace:
```tsx
                  <div className="md:col-span-5 flex flex-col gap-4">
                    <div className="bg-white rounded-2xl border border-surface-border p-6">
                      <h3 className="font-heading text-xl text-brand-navy tracking-tight">
                        {active}
                      </h3>
                      <p className="mt-3 text-base text-ink-secondary leading-relaxed">
                        {STYLE_DETAILS[active]}
                      </p>
                    </div>
                    <div className="bg-white rounded-2xl border border-surface-border p-6">
                      <p className="text-xs font-medium text-ink-muted uppercase tracking-wider mb-2">
                        Best for
                      </p>
                      <p className="text-sm text-ink-secondary leading-relaxed">
                        {getBestFor(active)}
                      </p>
                    </div>
                  </div>
```
with:
```tsx
                  <div className="md:col-span-5">
                    <div className="bg-white rounded-2xl border border-surface-border p-6">
                      <h3 className="font-heading text-xl text-brand-navy tracking-tight">
                        {active}
                      </h3>
                      <p className="mt-3 text-base text-ink-secondary leading-relaxed">
                        {STYLE_DETAILS[active]}
                      </p>
                    </div>
                  </div>
```

- [ ] **Step 3.4: Delete unused `getBestFor` function**

Remove the entire function block at the bottom of the file:
```tsx
function getBestFor(style: StagingStyle): string {
  const map: Record<StagingStyle, string> = {
    Modern: 'Inner-city apartments, new builds, renovated townhouses',
    Scandinavian: 'Compact apartments, first-home-buyer properties, light-filled spaces',
    Coastal: 'Beachside homes, Northern Beaches, Gold Coast, coastal towns',
    Hamptons: 'Prestige homes, family estates, waterfront properties',
    Luxury: 'Penthouse apartments, designer homes, high-end listings over $2M',
    Farmhouse: 'Rural properties, heritage homes, country estates',
    'Mid-Century Modern': 'Retro-era homes, character properties, architectural homes',
    Industrial: 'Warehouse conversions, lofts, inner-city studios',
    Minimalist: 'Small spaces, modern apartments, investment properties',
    'Contemporary Australian': 'New Australian homes, indoor-outdoor living, suburban family homes',
    Japandi: 'Premium inner-city apartments, considered renovations, architect-designed homes',
    Boho: 'Rental flips, young-family homes, eclectic inner-suburb terraces',
  };
  return map[style];
}
```

The `styleToFilename` helper above it stays — it's still used.

- [ ] **Step 3.5: Build**

Run:
```bash
npm run build
```
Expected: successful build. TypeScript should not complain about the deletion since nothing else references `getBestFor`.

- [ ] **Step 3.6: Commit**

```bash
git add src/components/landing/style-showcase.tsx
git commit -m "fix(landing): style-showcase — drop 'Best for' prescriptive card, tighten eyebrow and title"
```

---

## Task 4: Guarantee → Inside every staging

**Files:**
- Modify: `src/components/landing/guarantee.tsx`

- [ ] **Step 4.1: Replace the `guarantees` array**

Replace:
```tsx
const guarantees = [
  {
    title: 'Structure-first prompting',
    description:
      'Every staging starts with explicit rules the model must not alter walls, floors, windows, doors, or built-in features.',
  },
  {
    title: 'Compare slider on every result',
    description:
      'Flip between the original photo and the staged version side-by-side before you use it on a listing.',
  },
  {
    title: 'One-click regenerate',
    description:
      'Not happy with an attempt? Try again without starting over — edits keep context from your last result.',
  },
  {
    title: 'Review before you list',
    description:
      'AI staging is not perfect. Compare every image carefully — we build the tools that make structural drift easy to catch.',
  },
];
```
with:
```tsx
const guarantees = [
  {
    title: 'The model — Google Gemini Nano Banana',
    description:
      'Chosen for visual reasoning and 3D spatial awareness that help it respect structural context.',
  },
  {
    title: 'Structure-first prompt',
    description:
      'Every generation starts with explicit rules to leave walls, floors, windows, doors, and built-ins alone.',
  },
  {
    title: 'Camera-aware pre-flight',
    description:
      'Before furnishing, the pipeline identifies visible and partially-visible features to preserve — specific to your photo, not generic.',
  },
  {
    title: 'Before/after compare',
    description:
      'Every result lands with a slider to review against the original.',
  },
];
```

- [ ] **Step 4.2: Replace left-column content (eyebrow + title + paragraph)**

Replace:
```tsx
              <div className="md:col-span-5">
                <p className="text-sm font-medium text-brand-teal-light uppercase tracking-wider mb-3">
                  How we protect structure
                </p>
                <h2 className="font-heading text-3xl sm:text-4xl tracking-tight leading-tight">
                  Built around
                  <br />
                  the structure.
                </h2>
                <p className="mt-6 text-base text-white/60 leading-relaxed max-w-[40ch]">
                  Altered walls are the #1 complaint with virtual staging tools.
                  Our prompts, review tools, and compare slider are designed to
                  keep the structure intact — and make any drift easy to spot.
                </p>
              </div>
```
with:
```tsx
              <div className="md:col-span-5">
                <p className="text-sm font-medium text-brand-teal-light uppercase tracking-wider mb-3">
                  How we work
                </p>
                <h2 className="font-heading text-3xl sm:text-4xl tracking-tight leading-tight">
                  Inside every
                  <br />
                  staging.
                </h2>
                <p className="mt-6 text-base text-white/60 leading-relaxed max-w-[40ch]">
                  Images are AI generated and may vary. Here&apos;s what runs
                  on every photo — from the model we chose to the review tools
                  you get on every result.
                </p>
              </div>
```

Note: `Here&apos;s` required — JSX text apostrophe escaping.

- [ ] **Step 4.3: Build**

Run:
```bash
npm run build
```
Expected: successful build.

- [ ] **Step 4.4: Commit**

```bash
git add src/components/landing/guarantee.tsx
git commit -m "fix(landing): guarantee section — rewrite as honest pipeline description, drop structural-preservation promise"
```

---

## Task 5: Pricing — free credit bump + false-feature strip

This is the largest task but all changes are inside two arrays (`monthlyPlans`, `lifetimeDeals`). Pricing model redesign is a separate sub-project; this pass only removes demonstrably false claims and updates the free credit count.

**Files:**
- Modify: `src/components/landing/pricing.tsx`

- [ ] **Step 5.1: Free tier — bump credits 5 → 10, remove watermark feature, update rooms caption**

Replace:
```tsx
  {
    name: 'Free',
    price: 0,
    period: '',
    credits: 5,
    creditsLabel: '5 credits',
    description: 'Try it out on a listing',
    features: [
      '5 credits (one-time)',
      'Standard quality',
      'StageRight watermark',
    ],
    rooms: '~2 rooms staged',
    cta: 'Get started',
    href: '/signup',
    featured: false,
  },
```
with:
```tsx
  {
    name: 'Free',
    price: 0,
    period: '',
    credits: 10,
    creditsLabel: '10 credits',
    description: 'Try it out on a listing',
    features: [
      '10 credits (one-time)',
      'Standard quality',
    ],
    rooms: '~4 rooms staged',
    cta: 'Get started',
    href: '/signup',
    featured: false,
  },
```

- [ ] **Step 5.2: Starter — change CTA**

Replace:
```tsx
    cta: 'Start free trial',
    href: '/signup?plan=starter',
```
with:
```tsx
    cta: 'Get Starter',
    href: '/signup?plan=starter',
```

- [ ] **Step 5.3: Professional — change CTA, remove Priority generation and Conversational editing**

Replace:
```tsx
  {
    name: 'Professional',
    price: 49,
    period: '/mo',
    credits: 75,
    creditsLabel: '75 credits/mo',
    description: 'For busy agents who want the best',
    features: [
      '75 credits per month',
      'Standard + HD quality',
      'No watermark',
      'Priority generation',
      'Conversational editing',
      'Before/after export',
    ],
    rooms: '~25 rooms/month',
    cta: 'Start free trial',
    href: '/signup?plan=professional',
    featured: true,
  },
```
with:
```tsx
  {
    name: 'Professional',
    price: 49,
    period: '/mo',
    credits: 75,
    creditsLabel: '75 credits/mo',
    description: 'For busy agents who want the best',
    features: [
      '75 credits per month',
      'Standard + HD quality',
      'No watermark',
      'Before/after export',
    ],
    rooms: '~25 rooms/month',
    cta: 'Get Professional',
    href: '/signup?plan=professional',
    featured: true,
  },
```

- [ ] **Step 5.4: Agency — remove Team accounts, Analytics dashboard, Priority support, Bulk upload**

Replace:
```tsx
  {
    name: 'Agency',
    price: 99,
    period: '/mo',
    credits: 175,
    creditsLabel: '175 credits/mo',
    description: 'For teams managing multiple listings',
    features: [
      '175 credits per month',
      'Standard + HD quality',
      'Team accounts (up to 5)',
      'Analytics dashboard',
      'Priority support',
      'Bulk upload',
    ],
    rooms: '~58 rooms/month',
    cta: 'Contact us',
    href: '/signup?plan=agency',
    featured: false,
  },
```
with:
```tsx
  {
    name: 'Agency',
    price: 99,
    period: '/mo',
    credits: 175,
    creditsLabel: '175 credits/mo',
    description: 'For teams managing multiple listings',
    features: [
      '175 credits per month',
      'Standard + HD quality',
      'No watermark',
    ],
    rooms: '~58 rooms/month',
    cta: 'Contact us',
    href: '/signup?plan=agency',
    featured: false,
  },
```

Note: Agency ends up with only 3 features (was 6). This is deliberate — pricing redesign is a separate sub-project that will restructure tiers properly. Honest-but-thin beats false features for the placeholder window.

- [ ] **Step 5.5: Lifetime Pro — remove Priority generation and Conversational editing**

Replace:
```tsx
  {
    name: 'Lifetime Pro',
    price: 499,
    period: ' once',
    credits: 1200,
    creditsLabel: '1,200 credits',
    description: 'The ultimate deal for power users',
    features: [
      '1,200 credits — never expire',
      'Standard + HD quality',
      'No watermark',
      'Priority generation',
      'Conversational editing',
      'Buy top-ups anytime',
    ],
    rooms: '~400 rooms total',
    cta: 'Get lifetime access',
    href: '/signup?plan=lifetime_pro',
    featured: true,
  },
```
with:
```tsx
  {
    name: 'Lifetime Pro',
    price: 499,
    period: ' once',
    credits: 1200,
    creditsLabel: '1,200 credits',
    description: 'The ultimate deal for power users',
    features: [
      '1,200 credits — never expire',
      'Standard + HD quality',
      'No watermark',
      'Buy top-ups anytime',
    ],
    rooms: '~400 rooms total',
    cta: 'Get lifetime access',
    href: '/signup?plan=lifetime_pro',
    featured: true,
  },
```

- [ ] **Step 5.6: Build**

Run:
```bash
npm run build
```
Expected: successful build.

- [ ] **Step 5.7: Commit**

```bash
git add src/components/landing/pricing.tsx
git commit -m "fix(landing): pricing — 10 free credits, strip unshipped features (trial, team, analytics, bulk, priority, edit)"
```

---

## Task 6: CTA — subhead word swap

**Files:**
- Modify: `src/components/landing/cta.tsx`

- [ ] **Step 6.1: Update subhead**

Replace:
```tsx
            <p className="mt-6 text-lg text-ink-secondary max-w-[50ch] mx-auto">
              Stage your first room in under a minute. No credit card, no
              commitment. Five free credits to see it for yourself.
            </p>
```
with:
```tsx
            <p className="mt-6 text-lg text-ink-secondary max-w-[50ch] mx-auto">
              Stage your first room in under a minute. No credit card, no
              commitment. Ten free credits to see it for yourself.
            </p>
```

- [ ] **Step 6.2: Build**

Run:
```bash
npm run build
```
Expected: successful build.

- [ ] **Step 6.3: Commit**

```bash
git add src/components/landing/cta.tsx
git commit -m "fix(landing): cta — ten free credits (was five)"
```

---

## Task 7: Footer — brand blurb and disclosure line

**Files:**
- Modify: `src/components/landing/footer.tsx`

- [ ] **Step 7.1: Replace brand blurb**

Replace:
```tsx
            <p className="mt-4 text-sm text-ink-muted max-w-[30ch] leading-relaxed">
              AI virtual staging for Australian real estate. We add the
              furniture — we never touch the walls.
            </p>
```
with:
```tsx
            <p className="mt-4 text-sm text-ink-muted max-w-[30ch] leading-relaxed">
              AI virtual staging for real estate. Photorealistic interiors in
              under a minute.
            </p>
```

- [ ] **Step 7.2: Replace disclosure line**

Replace:
```tsx
          <p className="text-xs text-ink-muted">
            All staged images include &quot;Virtually Staged&quot; disclosure
          </p>
```
with:
```tsx
          <p className="text-xs text-ink-muted">
            Images are AI generated and may vary
          </p>
```

- [ ] **Step 7.3: Build**

Run:
```bash
npm run build
```
Expected: successful build.

- [ ] **Step 7.4: Commit**

```bash
git add src/components/landing/footer.tsx
git commit -m "fix(landing): footer — drop AU-limit and structural promise, replace false 'Virtually Staged disclosure' with honest AI-vary line"
```

---

## Task 8: Local visual verification

**Files:** None (runtime verification)

- [ ] **Step 8.1: Start dev server**

Run:
```bash
npm run dev
```
Leave it running. It serves on `http://localhost:3000`.

- [ ] **Step 8.2: Open `http://localhost:3000` in a browser. Walk through each section in order, confirming:**

- **Nav:** unchanged (no expected change).
- **Hero:**
  - Badge reads "Built in Australia" (not "Built for Australian agents").
  - H1 reads "Empty rooms, list-ready in under a minute." with "list-ready in under a minute." in teal.
  - Subhead reads "Photorealistic interiors, twelve curated styles, a fraction of studio pricing."
  - "30s" and "12" stat cards still float on the before/after visual.
- **How It Works:**
  - Section title reads "Three steps to a photo that's ready to list."
  - Step 01 description reads "Snap a photo of the empty room on your phone or camera. JPG or PNG, up to 10 MB."
  - Step 02 description has no "Standard or HD quality" line.
  - Step 03 description reads "A photorealistic result in about thirty seconds. Compare against the original, download, list."
- **Style Showcase:**
  - Eyebrow reads "Twelve curated styles".
  - Title reads "A style for every property."
  - Click through several styles — each shows ONE card in the right column (the description). No "Best for" card below it.
- **Inside Every Staging** (was "How we protect structure"):
  - Eyebrow reads "How we work".
  - Title reads "Inside every staging.".
  - Left paragraph reads "Images are AI generated and may vary. Here's what runs on every photo — from the model we chose to the review tools you get on every result."
  - Four measures list with the Google Gemini, Structure-first, Camera-aware, Before/after headings.
- **Pricing:**
  - Free tier shows "10 credits" badge, "~4 rooms staged" caption, two feature lines (no watermark line).
  - Starter CTA reads "Get Starter".
  - Professional CTA reads "Get Professional", four features (no Priority generation, no Conversational editing).
  - Agency has three features (credits, quality, no watermark).
  - Lifetime Pro has four features (no Priority generation, no Conversational editing).
- **CTA section:**
  - Subhead reads "…Ten free credits to see it for yourself."
- **Footer:**
  - Brand blurb reads "AI virtual staging for real estate. Photorealistic interiors in under a minute."
  - Bottom-right reads "Images are AI generated and may vary".
  - Copyright line still says "Built in Australia".

- [ ] **Step 8.3: Stop dev server**

Ctrl+C the terminal running `npm run dev`.

If any of the above checks fail, stop and investigate the corresponding earlier task. Do not push broken copy.

---

## Task 9: Push and verify live

**Files:** None (deploy + verification)

- [ ] **Step 9.1: Push to master**

Run:
```bash
git push origin master
```
Expected: push succeeds. Amplify will auto-trigger a build (~3 min).

- [ ] **Step 9.2: Wait for Amplify deploy**

Either check the AWS Amplify console manually, or wait ~4 minutes. The live URL is `https://master.d88xgpqlfkk1w.amplifyapp.com`.

- [ ] **Step 9.3: Spot-check live site**

Open `https://master.d88xgpqlfkk1w.amplifyapp.com` and verify the same checklist from Step 8.2 renders on the deployed build. Pay particular attention to the apostrophes in "Three steps to a photo that's ready to list." and "Here's what runs on every photo" — if they render as literal `&apos;` or the build broke, the JSX escaping was wrong.

---

## Task 10: Update stale memory entry

One memory entry became stale during this work: `project_edit_feature_status.md` asserts the conversational edit is shipped, but we verified it's not wired to the live wizard flow.

**Files:**
- Modify: `C:\Users\taraf\.claude\projects\C--Users-taraf-OneDrive-Desktop-Cursor-Projects-real-estate-images\memory\project_edit_feature_status.md`
- Modify: `C:\Users\taraf\.claude\projects\C--Users-taraf-OneDrive-Desktop-Cursor-Projects-real-estate-images\memory\MEMORY.md` (update the one-line hook if needed)

- [ ] **Step 10.1: Read the current memory file to see what needs updating**

Run Read on: `C:\Users\taraf\.claude\projects\C--Users-taraf-OneDrive-Desktop-Cursor-Projects-real-estate-images\memory\project_edit_feature_status.md`

- [ ] **Step 10.2: Edit the content**

Update the body to reflect:
- The edit feature (DesignReview, RegenerateControls, multi-turn edit) exists in the codebase under `src/components/staging/design-review.tsx`, `src/components/staging/regenerate-controls.tsx`, and the `/api/stage/edit` + `/api/stage/review` routes.
- These components are NOT imported by `src/app/stage/page.tsx` in the current wizard flow (verified 2026-04-18). The wizard goes upload → reference → rooms → style → notes → generating → result; result page shows only the `BeforeAfterSlider` and `FlagReviewDialog`.
- Landing page no longer advertises edit-in-plain-English or design review as user-facing features (per the truth revamp).
- If the edit feature is to return, it will need to be re-wired into the wizard result step — not just uncommented imports.

Keep the frontmatter (name, description, type). Update the description if it implied the feature was live.

- [ ] **Step 10.3: Update `MEMORY.md` hook if the old one-liner was misleading**

The current line reads something like: *"Edit Feature Shipped (Narrow Scope) — Multi-turn with S3 signatures deployed…"*. Change to reflect *"built but currently dormant — not wired to wizard flow"*.

- [ ] **Step 10.4: No commit needed for memory files** — those live in `~/.claude/projects/...` and aren't tracked by this repo.

---

## Self-Review

**Spec coverage check** (each spec section → task):
- Hero badge/H1/subhead → Task 1 ✓
- How It Works title + 3 steps → Task 2 ✓
- Style Showcase eyebrow/title/drop Best-for → Task 3 ✓
- Guarantee → Inside every staging rewrite → Task 4 ✓
- Pricing placeholder strip (Free credits, CTAs, features) → Task 5 ✓
- CTA five→ten → Task 6 ✓
- Footer brand blurb + disclosure → Task 7 ✓
- Memory hygiene (edit feature) → Task 10 ✓
- Implementation sequence (build per task, dev-server verify, push) → Tasks 8–9 ✓

**Placeholder scan:** no TBDs, no "implement later", every step has concrete old-string/new-string pairs.

**Type consistency:** no types are introduced; only string content swaps and one function deletion. The `guarantees` array keeps the same shape (`{title, description}`), so the map render in JSX needs no changes. The `getBestFor` deletion is followed by a JSX removal that referenced it — no dangling reference.

**Apostrophe gotchas accounted for:** Steps 2.4 and 4.2 call out `&apos;` explicitly. All other copy was drafted without apostrophes to avoid surprise failures.

---

## Rollback

Each task commits independently. To roll back a single task:
```bash
git revert <commit-sha>
```
To roll back the whole revamp: `git revert <commit1>..<commit7>` (or `git reset --hard <pre-task1-sha>` if not yet pushed).
