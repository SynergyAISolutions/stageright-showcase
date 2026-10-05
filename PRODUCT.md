# StageRight — Product Context

> Source-of-truth for design / brand / voice decisions. Synthesised from CLAUDE.md and conversation history. Update as the product evolves.

## Register

**brand** for landing / marketing / onboarding surfaces (`/`, `/onboarding`, signup ceremonies). Design IS the product — these surfaces sell trust and quality.

**product** for app surfaces (`/dashboard`, `/listings/[id]`, `/stage`, `/admin/*`). Design serves the product — these surfaces support the staging workflow.

## Product Purpose

AI-powered virtual staging app for **Australian real estate agents**. Agents upload a photo of an empty (or furnished) room, choose a decor style, and receive a photorealistic staged version. The staged image is the deliverable they list with.

Three concrete value propositions, ranked:

1. **A staged room** the agent can list with — photorealistic, full-resolution, twelve curated styles.
2. **Hours saved** versus organising a physical stage (briefing stylists, scheduling movers, photographing after setup).
3. **Hundreds to thousands of dollars saved** per listing versus paying a physical stager ($2,300–$3,200) or a human-edit virtual stager ($20–$30 per image, 24–48hr turnaround).

## Users

Primary: **Australian real estate agents.** Mid-market to high-end. Comfortable with phone photos and listing portals (realestate.com.au, Domain). Time-poor, deal-flow-driven, emotionally attuned (real estate is sold on emotion). Not designers; not developers.

Secondary: agency teams (multi-listing volume), independent stylists exploring AI tooling.

Geography centred on Australia (REIA disclosure rules, AUD pricing, Federation/Hamptons/Contemporary AU style preferences) but the product is open to US and Canadian markets.

## Tone & Voice

- **Editorial-warm-meets-architectural-precision.** The site reads like a high-end agency / architecture studio site: confident, restrained, with one warm italic moment per heading.
- **Honest first.** No survey claims (no "73% faster sale"). No overpromises (no "can't be cropped"). No defensive hedging either. State what's true, sized to what's verified.
- **Specific over promotional.** Concrete numbers ($2,300, ~60 seconds, 12 styles) over fluff ("blazingly fast", "industry-leading"). Real verbs, real nouns.
- **Australian register but not parochial.** Australian-tuned (AUD, REIA, Contemporary Australian style) but the language is internationally legible.
- **No em dashes in user-facing copy** (locked 2026-05-03). Use periods, commas, colons, semicolons, or parentheses. En dashes (`–`) are still fine for numeric ranges (`$2,300–$3,200`, `$20–$30`).

## Brand Identity

### Palette (locked v2 2026-05-03)

The landing's blueprint-architectural-warm aesthetic is the brand. Tokens live under `sr.*` in `tailwind.config.ts`.

- **`sr-cream` `#F2EDE0`** — base warm cream, never clinical white.
- **`sr-cream-soft` `#F7F3E9`** — alt section background.
- **`sr-surface` `#FBF8F0`** / **`sr-surface-2` `#FCFCFA`** — card surfaces (tinted, never `#fff`).
- **`sr-ink` `#1F3539`** — primary text + chrome (deep teal sourced from logo).
- **`sr-ink-2` / -soft / -mute** — secondary inks for hierarchy.
- **`sr-sage` `#7FA08A`** / **`sr-sage-deep` `#5A7E68`** — soft brand accent (the chair colour from logo).
- **`sr-timber` / -deep** — warm wood notes (used sparingly).
- **`sr-terra` `#C76F4E`** — saturated brand accent. The colour the eye locks onto: italic words in headlines, section numbers, featured-card top edges, hover states, watermark callouts. Roughly 10–15% surface coverage. **Committed colour strategy.**
- **Hairlines** `#D9D0BE` / `#C5BAA4` — quiet structural lines.

### Typography

- **Fraunces** (variable, opsz + SOFT axes) — display + the one italic accent moment per heading. Italic uses opsz 144 / SOFT 80 for hand-drawn warmth.
- **DM Sans** — body copy, capped 14.5–17px so headlines own airspace.
- **JetBrains Mono** — micro-labels, section numbers, spec lines, the page's "time signature."

### Layout signature

- **Architectural-blueprint background** — fixed-attachment 64px grid + 16px subgrid + crosshair markers at 256px nodes. Sub-grid opacity 0.022, major 0.065. Carries through every section as a continuous plane.
- **Fixed depth blobs** — sage + timber + terra radial gradients sit fixed under the grid for parallax warmth.
- **Architectural title block** bottom-right of every page — DWG / SCALE / DATE / DRAWN — the brand's drafting-paper signature.
- **Hairlines over shadows** — most surfaces use 1px borders rather than blur shadows; shadows are reserved for hero photo + featured cards.
- **Terra italic accents** — one word per heading, no more. The brand's "marked on the plan in red pencil" moment.

## Anti-References (what we are NOT)

- **Generic AI startup landing.** No purple gradients, no `Inter` body, no Space-Grotesk display, no glass cards over abstract gradient meshes, no "Powered by AI" badges.
- **Stock SaaS template.** No identical card grids of icon + heading + paragraph. No floating opaque pill stat callouts that crop the imagery they sit on.
- **Marketing-speak hyperbole.** Never use survey-percentage claims unverified ("73% faster sale"), absolute-promise claims that the product can't keep ("walls never change", "can't be cropped"), or vague intensifiers ("revolutionary", "AI-powered seamless workflow").
- **Real-estate-cliché chrome.** Compass-red, Sotheby's-navy + gold, Domain-red — the obvious category-reflex palettes are not us.
- **AI-generated illustrations / iconography on public surfaces.** Only admin-curated real StageRight outputs appear on landing.

## Strategic Principles

1. **Honest > clever.** When tempted to round up a stat or hedge an obligation, don't. The brand earns trust by being the most factually accurate option in a category full of overpromises.
2. **Photography does the talking.** Real staged rooms (admin-curated only) are the hero. Type and chrome stay restrained so the imagery wins.
3. **One italic moment per heading.** The Fraunces-italic-terra pause is the brand's signature. Used everywhere; never used twice in the same heading.
4. **Architectural rhythm beats decoration.** Mono spec lines, dimension ticks, drafting title blocks, hairline borders. The page should read like a technical drawing, not a brochure.
5. **Mobile-first responsiveness is non-negotiable.** Layouts stack predictably; no horizontal scroll; type breathes on phone widths via `clamp()`.
6. **Disclosure is a feature, not fine print.** Every output ships pre-labelled. Compliance under REIA / NAR / REBBA is handled by default — surfaced as a feature, never buried as a footnote.

## Locked Decisions

- **Clean integer pricing** (no `.99` charm prices) — locked 2026-05-03.
- **30 free credits** on signup, no credit card required (raised from 14 on 2026-10-04).
- **Three Takes default** = 2 credits per styled room, three versions kept.
- **Free credit every 7 you spend** — the loyalty mechanic. Credits never expire while account is active.
- **GST handling** — inclusion not surfaced on landing; lives in checkout / terms.
- **Twelve styles shipped**: Modern, Scandinavian, Coastal, Hamptons, Luxury, Farmhouse, Mid-Century Modern, Industrial, Minimalist, Contemporary Australian, Japandi, Boho.
- **Above 300 credits** → "Contact us" CTA (no anchor / decoy tier).

## Quality Bar

**Flagship.** Landing is the entry point of every paid conversion and every word-of-mouth share. It carries the brand. Polish accordingly: typography rhythm, micro-interaction restraint, motion craft, copy precision. Cuts on this surface compound across every downstream impression.
