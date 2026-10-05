# Onboarding redesign — design spec

Date: 2026-04-25
Status: Drafted, awaiting review (tokens + primitives previewed live at `/design-preview`)

## 1. Why this exists

The onboarding has been iterated many times in this session, with each iteration drifting from the consistent vision. This spec is the locked source of truth: typography, spacing, colour, motion, components, and per-screen layouts. Once approved, every implementation question is answered by checking this document.

## 2. Goals

1. Premium editorial-luxury aesthetic for a real-estate-staging product. Not generic SaaS minimal.
2. Brand colour visible on every screen (not monochrome navy-on-cream).
3. Single, consistent design language across all 14 onboarding screens.
4. Mobile-first, no overflow, scroll only where the content genuinely requires it (Style + Rooms long lists).
5. Linear flow, no back navigation, auto-advance on choice screens.
6. The CTA — full-width rectangle pinned at the bottom of the viewport with thumb-zone padding — is the same shape and the same place on every screen.

## 3. Out of scope

- Changes to `/stage` (the post-onboarding wizard).
- Payments / Stripe wiring.
- The dashboard.

## 4. Design tokens (locked)

### 4.1 Typography (DM Serif Display + Outfit)

| Role | Mobile | sm | lg | Tailwind classes |
|------|--------|----|----|------------------|
| Eyebrow | 11px | 12px | 13px | `text-[11px] sm:text-[12px] lg:text-[13px] font-semibold uppercase tracking-[0.24em] text-brand-navy/60` |
| Hero headline | 44px | 76px | 128px | `font-heading text-[44px] sm:text-[76px] lg:text-[128px] leading-[0.96] tracking-[-0.025em]` |
| Section headline | 32px | 48px | 72px | `font-heading text-[32px] sm:text-[48px] lg:text-[72px] leading-[1.0] tracking-[-0.02em]` |
| Sub | 17px | 20px | 24px | `text-[17px] sm:text-[20px] lg:text-[24px] font-medium text-brand-navy/75 leading-snug` |
| Stat | 88px | 136px | 200px | `font-heading text-[88px] sm:text-[136px] lg:text-[200px] leading-[0.92] tracking-[-0.03em] tabular-nums` |
| Body | 17px | 18px | 18px | `text-[17px] sm:text-[18px] font-medium text-brand-navy` |
| Button label | 16px | 17px | 17px | `text-[16px] sm:text-[17px] font-semibold tracking-tight` |

**Rules:**
- Hero headlines (Welcome, Bridge, Bombshell aftermath, FactCredit) carry an italic `text-brand-teal` accent on the punchline word. At least one italic teal accent per hero.
- Section headlines (Role, Volume, Listing-type, FactAi, HowItWorks, Style, Result) may use the same italic teal accent but it's optional.
- Stat is reserved for the editorial peak: Bombshell number, FactCredit "FREE". One per screen, max.

### 4.2 Spacing rhythm

One rule: **same idea = close, different idea = breathing room.**

| Token | Use |
|-------|-----|
| `gap-1.5` (6px) | Within a single line: eyebrow dot ↔ label |
| `gap-3` (12px) | Within one visual unit: icon + label |
| `gap-6` (24px) | Same idea continued: headline → sub |
| `gap-10` (40px) | Different idea begins: one paragraph → next |
| `gap-16` (64px) | Major section break: content end → CTA |

### 4.3 Colour roles

- `surface-secondary` (#f8f9fb) — every screen's home.
- `brand-navy` (#0f1d2e) — dominant ink: headlines, body, CTA background.
- `brand-teal` (#1a7a6d) — accent **on cream only**: italic emphasis word, eyebrow dot, hairline rule. Present on every screen.
- `brand-teal-light` (#23a594) — accent **on dark only**: Generating overlay, CTA inner-arrow tint.
- `brand-gold`, `brand-coral` — reserved, not used in onboarding.

### 4.4 Motion

Single easing curve: `cubic-bezier(0.16, 1, 0.3, 1)` (expo-out).

| Beat | Duration | Transform |
|------|----------|-----------|
| Reveal | 0.85s | `translate-y-18 blur-8 opacity-0 → 0/0/1` |
| Stat scale-in | 1.1s | adds `scale-0.78 → 1` |
| Suspense hold (eyebrow with "…", before content arrives) | 1.5s | eyebrow alone, then content reveal beat |
| Page transition | 0.7s | cross-fade between screens |
| Choice confirmation | 250ms | hold before auto-advance |

## 5. Component primitives

Locked at `/design-preview`. All onboarding screens compose from these.

### 5.1 `<PageShell>`
Provides: cream canvas, top-mounted progress bar (5–6px), bottom-pinned CTA slot with thumb-zone padding, scrollable content area between.

### 5.2 `<ProgressBar>`
- 5px tall on mobile, 6px on `sm+`.
- Track: `bg-brand-navy/[0.15]`.
- Fill: `bg-brand-teal-light` with `box-shadow: 0 0 14px rgba(35,165,148,0.7)`.
- Animates `width` with reveal easing on step change.

### 5.3 `<OnboardingCta>`
- **Full-width rectangle pinned at the bottom of the viewport** with thumb-zone padding (24px from horizontal edges, 24px above safe-area-inset-bottom).
- On `lg+` screens: `max-width: 480px`, centred, same bottom-pinning.
- Solid `bg-brand-navy`, white label, `text-brand-teal-light` arrow icon, `shadow-[0_10px_30px_-12px_rgba(15,29,46,0.5)]`.
- Hover: `bg-brand-navy-light`, arrow translates `+1` px.
- Active: `scale-[0.99]`.

### 5.4 `<Eyebrow>`
- Inline-flex with a 4px `bg-brand-teal` dot followed by uppercase tracked label.
- Lives directly above a headline, separated by `gap-3`.

### 5.5 `<ChoiceRow>`
- Default: white card, `border-[1.5px] border-brand-navy/[0.10]`, optional icon + label + optional sub + radio dot.
- Hover: `border-brand-navy/30`, subtle shadow, no scale.
- Selected: solid `bg-brand-navy`, white label, `text-brand-teal-light` icon, white radio fill, drop shadow.
- Used: Role, Volume, Listing-type.

### 5.6 `<ChoiceTile>`
- Square-ish tile (mobile `aspect-square`, sm `aspect-[5/4]`).
- Same selected-state rule as ChoiceRow.
- Used: Rooms.

### 5.7 `<StyleRow>` (existing, retained)
- Image thumbnail + name + description + colour palette dots + check on selected.
- Selected uses solid `bg-brand-navy` like the other choice components for consistency.

## 6. Per-screen layouts

For every screen the page shell is the same: progress bar at top, CTA pinned at bottom (where applicable), content centred between. Layouts here describe content composition only.

### 6.1 Welcome
- Eyebrow: "Welcome"
- Hero headline: "Let's stage your first listing, *Tara*."  *(italic teal accent on user's name)*
- Hairline teal rule (`h-[2px] w-14 bg-brand-teal/65`)
- Sub: "Ninety seconds from upload to staged."
- CTA: "Begin"
- Atmospheric backdrop: blurred staged-room **image** (not photo) at ~18% opacity behind a soft cream wash, plus teal/navy radial blooms.

### 6.2 Role (auto-advance)
- Eyebrow: "About you"
- Section headline: "What do you do?"
- 5 ChoiceRows: Solo agent / Agency or team / Property photographer / Property manager / Listing my own property.
- No CTA (auto-advances on tap after 250ms confirmation).

### 6.3 Listing-type (auto-advance)
- Eyebrow: "About your listings"
- Section headline: "What are you listing?"
- 3 ChoiceRows:
  - Homes to sell — house-with-pennant icon
  - Homes to rent out — house-with-key icon
  - Commercial property — building icon, sub: "Coming soon"
- No CTA.

### 6.4 Volume (auto-advance, residential paths only)
- Eyebrow: "About your volume"
- Section headline: "And how many listings a month?"  *(or "properties" if Listing my own property)*
- 4 ChoiceRows: A couple / A handful / Six to ten / Eleven or more.
- No CTA.

### 6.5 Bombshell (Role × Intent variant)
- Sequenced reveal on cream canvas (no card):
  - Beat 1 (lead): supporting text
  - Beat 2 (stat): the editorial peak
  - Beat 3 (after): supporting text
  - Hairline ornament
  - Beat 4 (pivot): supporting paragraph
  - Beat 5 (close): supporting paragraph
- CTA: "Show me how"
- Spacing rhythm: lead → stat = `mt-6 sm:mt-8`. Stat → after = `mt-6 sm:mt-8`. After → hairline = `mt-12 sm:mt-16`. Hairline → pivot = `mt-12 sm:mt-16`. Pivot → close = `mt-6 sm:mt-8`.

### 6.6 Bridge
- Eyebrow: "The shift"
- Hero headline: "Under a minute. *From $1.25 a photo.*"  *(italic teal on second line)*
- CTA: "Show me"

### 6.7 HowItWorks
- Section headline: "You do two things. *We do the other two.*"
- Numbered list (4 rows): "01 you · Upload" / "02 we · Read the room" / "03 we · Stage it" / "04 you · Try other styles"
  - Numbers in DM Serif teal
  - Doer label (you/we) uppercase tracked navy/55
  - Action in DM Serif navy
- CTA: "Let's stage"

### 6.8 Upload
- Section headline: "Upload your photo."
- Drop zone (existing HeroUpload component)
- Caption (intent-aware): "Any room — empty or furnished" / "For rentals — use an empty room photo" / "Heads up — the catalogue is residential"
- CTA: "Continue" (enabled once upload completes)

### 6.9 Rooms (auto-advance)
- Section headline: "What kind of room?"
- 3-col grid on mobile (4-col sm+) of ChoiceTiles. 11 rooms.
- Mobile: scroll allowed if needed, with mask-fade indicator at the bottom.
- No CTA.

### 6.10 Style (auto-advance, 1-click)
- Eyebrow: "Pick a style"
- Section headline: "Twelve to *choose from.*"
- Style grid (existing StyleRow, mask-fade scroll indicator at bottom).
- Tap a style → 250ms confirmation → auto-advance to Generating.
- No CTA.

### 6.11 Generating
- User's uploaded image fills the screen, blurred + light dim overlay (~25% navy at center, 45% at edges) — image must remain visible.
- Floating eyebrow + style label at top-right: "Staging · 20–40s" pill.
- Centred text (no panel, no card, no box):
  - Style eyebrow with brand-teal-light dot
  - Note text in DM Serif white
  - Drop shadow on the text for legibility against any image content beneath.
- Bottom: thin progress bar.

### 6.12 Result
- Eyebrow: "Staged · Living Room"
- Section headline: "*Modern.*"  *(italic teal style name)*
- BeforeAfterSlider, bounded `max-h-[55vh]`
- CTA: "Continue"
- No "Try another style", no "See my gallery" — those belong on the dashboard.

### 6.13 FactAi
- Eyebrow: "How to read your stage"
- Three editorial points, each with its own reveal beat:
  - Point 1 (hero scale): "Each image is *AI-generated.*"
  - Point 2 (sub scale): "Drag the slider *to compare it against the empty room.*"
  - Point 3 (sub scale): "That's your *dimension check.*"
- Spacing: `gap-10` between points.
- CTA: "Continue"

### 6.14 FactCredit
- Suspense beat: eyebrow "And one more thing…" appears alone, holds 1.5s.
- Then the body reveals as a mini-bombshell:
  - Lead: "Every 7 stages,"
  - Stat: "*FREE*"  *(italic teal stat — "FREE" is the punchline, not "1")*
  - After: "credit lands in your wallet."
  - Hairline ornament
  - Close: "If a stage ever misses, *your next is on us.*"
- CTA: "See my gallery"

## 7. Implementation order

1. **Primitives first** (real components matching the preview-page versions):
   - `OnboardingShell` (page shell with progress bar slot + bottom CTA slot)
   - `OnboardingCta` (full-width bottom-pinned)
   - `Eyebrow`
   - Updated `ChoiceRow` and `ChoiceTile` with the locked selected state
   - Updated `OnboardingProgressBar` (5–6px, teal-light, glow)
2. **Welcome → Bridge → Bombshell** (the highest-stakes hero screens) using primitives. Visual review.
3. **Role → Listing-type → Volume** (auto-advance choice screens).
4. **Upload → Rooms → Style** (action screens).
5. **Generating → Result** (ceremony screens).
6. **FactAi → FactCredit** (disclosure screens).
7. **Type-check + build + browser walk-through.**

## 8. Validation criteria

After implementation, every screen must satisfy:

- [ ] Brand-teal accent visible somewhere on the page (not monochrome).
- [ ] Page shell + progress bar present and visibly thick.
- [ ] CTA full-width, bottom-pinned with thumb-zone padding (or absent on auto-advance screens).
- [ ] Typography sizes match the spec table.
- [ ] Spacing between distinct ideas uses `gap-10` or larger; same-idea continuations use `gap-6`.
- [ ] Selected state on choice components is solid navy fill (never transparent tint).
- [ ] Generating screen: user's image is visible behind the overlay.
- [ ] Mobile fits without overflow (scroll only where mask-fade indicators are present).

## 9. Open questions

None. All token decisions, component definitions, and per-screen content are committed above.
