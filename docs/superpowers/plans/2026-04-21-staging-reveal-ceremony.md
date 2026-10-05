# Staging Reveal Ceremony Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the gift-framework reveal ceremony for the single-style staging flow — full-frame concierge wait screen, 2-second lid-lift reveal, editorial nameplate, persistent concierge-notes expander, first-stage welcome toast, and share-export button.

**Architecture:** New presentational components under `src/components/staging/` handle new UI surfaces. The existing `BeforeAfterSlider` is refactored to swap its backwards `autoPlay` for a forward-sequenced `autoReveal`. A new `STYLE_CONCIERGE_BASE` record in `src/lib/ai/prompts.ts` provides hand-authored style-derived loader narration that combines with analyser-derived room observations. First-stage detection lives in a new `src/lib/db/first-stage.ts` helper used by `/api/jobs`. Share export uses client-side canvas rendering (`src/lib/utils/share-export.ts`). No Lambda changes.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Tailwind, framer-motion 12, AWS DynamoDB (via `@aws-sdk/lib-dynamodb`), Anthropic SDKs (Bedrock + direct), Vitest for tests, browser Canvas 2D API for share export.

**Source spec:** `docs/superpowers/specs/2026-04-21-staging-reveal-ceremony-design.md`.

---

## File structure

**New files (PR 1):**
- `src/components/staging/staging-wait-concierge.tsx` — full-frame wait screen
- `src/components/staging/editorial-nameplate.tsx` — result-page nameplate
- `src/components/staging/concierge-notes-expander.tsx` — collapsed expander with staggered note entry
- `src/components/staging/first-stage-welcome-toast.tsx` — once-per-account toast
- `src/lib/ai/parse-concierge-notes.ts` — pure parser for the CONCIERGE NOTES section of the analyser output
- `src/lib/db/first-stage.ts` — atomic `firstStageAt` write helper
- `tests/lib/ai/build-concierge-notes.test.ts`
- `tests/lib/ai/parse-concierge-notes.test.ts`
- `tests/lib/db/first-stage.test.ts`

**New files (PR 2):**
- `src/components/staging/share-export-button.tsx`
- `src/lib/utils/share-export.ts` — canvas renderer
- `tests/lib/utils/share-export.test.ts`

**Modified files (PR 1):**
- `src/types/index.ts` — add `firstStageAt?: string | null` to `User`
- `src/lib/ai/prompts.ts` — add `STYLE_CONCIERGE_BASE` record, `buildConciergeNotes` helper
- `src/lib/ai/run-analysis.ts` — append CONCIERGE NOTES section to system prompt, bump `max_tokens` to 1400, use `parseConciergeNotes`, return `concierge_notes: string[]`
- `src/app/api/jobs/route.ts` — call `markFirstStage` on `done`, include `isFirstStage` in response
- `src/components/comparison/before-after-slider.tsx` — replace `autoPlay` with `autoReveal`, add `isHovered` state + hover scale, add handle glow at peak, add `onRevealPeak` callback
- `src/app/stage/page.tsx` — add state (`conciergeNotes`, `isFirstStage`), pre-fill base notes before analyse, replace `WizardCard`-generating with `StagingWaitConcierge`, replace result header with `EditorialNameplate`, add `autoReveal`/`onRevealPeak` + `lastStagedS3Key` key to slider, insert `ConciergeNotesExpander`, render `FirstStageWelcomeToast` conditionally
- `src/app/globals.css` — add `@keyframes stage-wait-ken-burns`

**Modified files (PR 2):**
- `src/app/stage/page.tsx` — wire `ShareExportButton` into the result sticky footer; widen footer grid to accommodate 4 buttons on mobile

**Files intentionally not touched:** `lambda/staging-worker/**` (the existing analysis format is backwards-compatible — the new CONCIERGE NOTES section sits harmlessly at the end of `roomAnalysis`); `src/components/staging/batch-result.tsx` and `src/app/stage/batch/[batchId]/page.tsx` (batch ceremony is a separate follow-on spec); landing, dashboard, onboarding.

---

# Phase 1 — PR 1: Ceremony core

## Task 1: STYLE_CONCIERGE_BASE + buildConciergeNotes + firstStageAt type

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/ai/prompts.ts`
- Test: `tests/lib/ai/build-concierge-notes.test.ts` (new)

Add the 36 hand-authored base notes (3 per style) to `prompts.ts`, the `buildConciergeNotes` helper that combines them with analyser observations, and `firstStageAt?` to the `User` type.

- [ ] **Step 1: Write failing tests** — create `tests/lib/ai/build-concierge-notes.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  STYLE_CONCIERGE_BASE,
  buildConciergeNotes,
  STAGING_STYLES,
} from '@/lib/ai/prompts';

describe('STYLE_CONCIERGE_BASE', () => {
  it('has exactly 3 notes for every staging style', () => {
    for (const style of STAGING_STYLES) {
      const notes = STYLE_CONCIERGE_BASE[style];
      expect(notes, `style ${style}`).toHaveLength(3);
      for (const note of notes) {
        expect(note.length).toBeGreaterThan(0);
        expect(note.length).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('buildConciergeNotes', () => {
  it('interpolates {roomLabel} with the lowercase first room type', () => {
    const result = buildConciergeNotes({
      style: 'Coastal',
      roomTypes: ['Living Room'],
      analyserNotes: [],
    });
    expect(result[0]).toBe('Pulling light blues and sandy beiges into your living room.');
    expect(result).toHaveLength(3);
  });

  it('falls back to "room" when roomTypes is empty', () => {
    const result = buildConciergeNotes({
      style: 'Modern',
      roomTypes: [],
      analyserNotes: [],
    });
    expect(result[0]).toBe('Layering clean lines and neutral tones through your room.');
  });

  it('appends analyser notes after the 3 base notes', () => {
    const result = buildConciergeNotes({
      style: 'Japandi',
      roomTypes: ['Bedroom'],
      analyserNotes: [
        'Noted the skylight — warm side for the bed.',
        'Keeping the wardrobe clear.',
      ],
    });
    expect(result).toHaveLength(5);
    expect(result[3]).toBe('Noted the skylight — warm side for the bed.');
    expect(result[4]).toBe('Keeping the wardrobe clear.');
  });

  it('uses the first room type when multiple are provided', () => {
    const result = buildConciergeNotes({
      style: 'Boho',
      roomTypes: ['Living Room', 'Dining Room'],
      analyserNotes: [],
    });
    expect(result[0]).toContain('living room');
    expect(result[0]).not.toContain('dining');
  });

  it('never mutates STYLE_CONCIERGE_BASE', () => {
    const before = STYLE_CONCIERGE_BASE.Coastal[0];
    buildConciergeNotes({ style: 'Coastal', roomTypes: ['Kitchen'], analyserNotes: [] });
    const after = STYLE_CONCIERGE_BASE.Coastal[0];
    expect(after).toBe(before);
    expect(after).toContain('{roomLabel}');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/lib/ai/build-concierge-notes.test.ts`
Expected: FAIL — `STYLE_CONCIERGE_BASE` and `buildConciergeNotes` do not exist yet.

- [ ] **Step 3: Add `STYLE_CONCIERGE_BASE` to `src/lib/ai/prompts.ts`**

Append after `STYLE_DETAILS`:

```ts
/**
 * Concierge-voiced base notes per style. Three per style, rendered to the
 * user during the wait screen alongside 0-3 room-specific observations from
 * the analyser. Interpolation: `{roomLabel}` is replaced at render time with
 * `roomTypes[0]?.toLowerCase() ?? 'room'`.
 *
 * Derived from STYLE_DETAILS — these are the actual design directions the
 * staging model is told to execute, voiced as concierge narration.
 */
export const STYLE_CONCIERGE_BASE: Record<StagingStyle, [string, string, string]> = {
  Modern: [
    'Layering clean lines and neutral tones through your {roomLabel}.',
    'Adding geometric shapes and polished surfaces.',
    'Finishing with one or two bold accent pieces.',
  ],
  Scandinavian: [
    'Warming your {roomLabel} with light wood and soft whites.',
    'Layering cozy textiles for hygge.',
    'Keeping shapes organic, mood calm.',
  ],
  Coastal: [
    'Pulling light blues and sandy beiges into your {roomLabel}.',
    'Weaving in rattan and linen textures.',
    'Aiming for that relaxed beach-house feel.',
  ],
  Hamptons: [
    'Layering classic white and navy across your {roomLabel}.',
    'Adding natural timber and elegant proportions.',
    'Finishing with relaxed-luxury details.',
  ],
  Luxury: [
    'Layering marble, velvet, and brass accents into your {roomLabel}.',
    'Placing statement lighting as the anchor.',
    'Finishing with high-end designer touches.',
  ],
  Farmhouse: [
    'Warming your {roomLabel} with rustic timber and natural fabrics.',
    'Adding warm whites and vintage-inspired pieces.',
    'Keeping it cozy and inviting.',
  ],
  'Mid-Century Modern': [
    'Choosing organic curves and tapered-leg pieces for your {roomLabel}.',
    'Layering warm woods with bold retro colours.',
    'Placing iconic 1950s–60s pieces as anchors.',
  ],
  Industrial: [
    'Balancing exposed metal and raw timber in your {roomLabel}.',
    'Adding leather and concrete tones.',
    'Aiming for that urban-warehouse feel.',
  ],
  Minimalist: [
    'Choosing very few carefully placed pieces for your {roomLabel}.',
    'Keeping the palette monochrome.',
    'Leaving clean negative space — less is more.',
  ],
  'Contemporary Australian': [
    'Layering native timber and natural stone through your {roomLabel}.',
    'Pulling in earthy tones and indoor-outdoor touches.',
    'Keeping the mood relaxed but refined.',
  ],
  Japandi: [
    'Choosing low-profile natural wood furniture for your {roomLabel}.',
    'Layering ceramic, linen, and a muted earthy palette.',
    'Leaving negative space — warm minimalism.',
  ],
  Boho: [
    'Layering rattan, textiles, and warm earth tones in your {roomLabel}.',
    'Adding terracotta and ochre accents.',
    'Finishing with plants and eclectic, free-spirited pieces.',
  ],
};
```

- [ ] **Step 4: Add `buildConciergeNotes` helper to `src/lib/ai/prompts.ts`**

Append after `STYLE_CONCIERGE_BASE`:

```ts
/**
 * Combine style-derived base notes with analyser-derived room observations.
 * Always returns a non-empty array (at minimum the 3 base notes). Pure.
 *
 * The wizard calls this BEFORE the analyse request completes (with
 * analyserNotes=[]) to pre-fill the wait screen instantly, then calls it
 * AGAIN with the analyser's notes once they arrive — the note rotator
 * picks up the longer array seamlessly.
 */
export function buildConciergeNotes(args: {
  style: StagingStyle;
  roomTypes: string[];
  analyserNotes: string[];
}): string[] {
  const roomLabel = args.roomTypes[0]?.toLowerCase() ?? 'room';
  const base = STYLE_CONCIERGE_BASE[args.style].map((n) =>
    n.replace('{roomLabel}', roomLabel),
  );
  return [...base, ...args.analyserNotes];
}
```

- [ ] **Step 5: Add `firstStageAt` to `User` interface in `src/types/index.ts`**

Extend the existing `User` interface (in the `// ---------- User ----------` section):

```ts
export interface User extends BaseEntity {
  id: string;
  email: string;
  name: string;
  plan: Plan;
  creditsRemaining: number;
  creditsUsedAllTime: number;
  creditResetDate?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  role?: Role | null;
  listingsPerMonth?: ListingsPerMonth | null;
  onboardingCompletedAt?: string | null;
  firstStageAt?: string | null;  // ISO timestamp; set atomically on first successful stage
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- tests/lib/ai/build-concierge-notes.test.ts`
Expected: PASS (all 5 tests green).

- [ ] **Step 7: Type-check**

Run: `npm run type-check`
Expected: PASS (no new errors).

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/lib/ai/prompts.ts tests/lib/ai/build-concierge-notes.test.ts
git commit -m "feat(staging): STYLE_CONCIERGE_BASE + buildConciergeNotes helper + User.firstStageAt"
```

---

## Task 2: Analyser CONCIERGE NOTES — parser + prompt + return shape

**Files:**
- Create: `src/lib/ai/parse-concierge-notes.ts`
- Modify: `src/lib/ai/run-analysis.ts`
- Test: `tests/lib/ai/parse-concierge-notes.test.ts` (new)

Adds a user-facing CONCIERGE NOTES section to the analyser's system prompt, parses those bullets out of the model's text response, and returns them on the `RunAnalysisResult` alongside the existing `analysis` string.

- [ ] **Step 1: Write failing parser tests** — create `tests/lib/ai/parse-concierge-notes.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  parseConciergeNotes,
  stripConciergeNotes,
} from '@/lib/ai/parse-concierge-notes';

describe('parseConciergeNotes', () => {
  it('extracts bulleted notes after the CONCIERGE NOTES: heading', () => {
    const input = `Some analysis text above.

5. Furniture WITHIN constraints: place the sofa...

CONCIERGE NOTES:
- Light's coming from the bay window on the left.
- Keeping the air-con sightline clear.
- You asked for cosy — leaning into warm timber tones.
`;
    expect(parseConciergeNotes(input)).toEqual([
      "Light's coming from the bay window on the left.",
      'Keeping the air-con sightline clear.',
      'You asked for cosy — leaning into warm timber tones.',
    ]);
  });

  it('returns [] when the heading is missing', () => {
    expect(parseConciergeNotes('no heading here')).toEqual([]);
  });

  it('clamps to at most 3 notes', () => {
    const input = `CONCIERGE NOTES:
- One.
- Two.
- Three.
- Four.
- Five.
`;
    expect(parseConciergeNotes(input)).toHaveLength(3);
  });

  it('ignores lines longer than 200 characters (runaway bullets)', () => {
    const long = 'x'.repeat(210);
    const input = `CONCIERGE NOTES:
- Short one.
- ${long}
- Another short one.
`;
    expect(parseConciergeNotes(input)).toEqual(['Short one.', 'Another short one.']);
  });

  it('is case-insensitive on the heading', () => {
    const input = `concierge notes:
- Lowercase heading.
`;
    expect(parseConciergeNotes(input)).toEqual(['Lowercase heading.']);
  });

  it('tolerates leading whitespace before bullets', () => {
    const input = `CONCIERGE NOTES:
  - Indented bullet.
- Not indented.
`;
    expect(parseConciergeNotes(input)).toEqual(['Indented bullet.', 'Not indented.']);
  });

  it('trims trailing whitespace on each note', () => {
    const input = `CONCIERGE NOTES:
- Ends with spaces.   
- Ends with tab.\t
`;
    expect(parseConciergeNotes(input)).toEqual(['Ends with spaces.', 'Ends with tab.']);
  });
});

describe('stripConciergeNotes', () => {
  it('removes the CONCIERGE NOTES section and its bullets', () => {
    const input = `Analysis body.

5. Furniture: sofa facing fireplace.

CONCIERGE NOTES:
- Light from bay window.
- Air-con on north wall.`;
    const result = stripConciergeNotes(input);
    expect(result).not.toContain('CONCIERGE NOTES:');
    expect(result).not.toContain('Light from bay window');
    expect(result).not.toContain('Air-con on north wall');
    expect(result).toContain('5. Furniture: sofa facing fireplace.');
  });

  it('is a no-op when no CONCIERGE NOTES section is present', () => {
    const input = 'Plain analysis, no notes.';
    expect(stripConciergeNotes(input)).toBe('Plain analysis, no notes.');
  });

  it('is case-insensitive on the heading', () => {
    const input = `Body.

concierge notes:
- one.`;
    expect(stripConciergeNotes(input)).toBe('Body.');
  });

  it('trims trailing whitespace after stripping', () => {
    const input = `Body content.


CONCIERGE NOTES:
- bullet.`;
    const result = stripConciergeNotes(input);
    expect(result).toBe('Body content.');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/lib/ai/parse-concierge-notes.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `src/lib/ai/parse-concierge-notes.ts`**

```ts
/**
 * Extract the CONCIERGE NOTES bulleted section from the analyser's text
 * response. Returns at most 3 notes, stripped of bullet prefixes and
 * trimmed. Empty array when the heading is absent or no valid bullets
 * follow it.
 *
 * Guardrails:
 *  - Notes longer than 200 characters are dropped (model drifted off-format).
 *  - Case-insensitive heading match.
 *  - Tolerant of leading whitespace on bullet lines.
 */
export function parseConciergeNotes(analysis: string): string[] {
  const match = analysis.match(/CONCIERGE NOTES:\s*\n((?:\s*-\s*.+\n?)+)/i);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*/, '').trim())
    .filter((line) => line.length > 0 && line.length <= 200)
    .slice(0, 3);
}

/**
 * Remove the CONCIERGE NOTES section (heading + bullets) from the analyser
 * text. Used by runAnalysis to keep user-facing narration out of the
 * `analysis` string that gets piped into the Lambda's Nano Banana prompt —
 * the image model only needs the structural/furniture reasoning (sections
 * 1-5), not the concierge copy written for the user.
 *
 * Matches either at start-of-string or after newline(s); tolerant of the
 * same edge cases as parseConciergeNotes.
 */
export function stripConciergeNotes(analysis: string): string {
  return analysis
    .replace(/(?:^|\n+)CONCIERGE NOTES:\s*\n(?:\s*-\s*.+\n?)+/i, '')
    .trim();
}
```

- [ ] **Step 4: Run parser tests to verify they pass**

Run: `npm run test -- tests/lib/ai/parse-concierge-notes.test.ts`
Expected: PASS (all 7 tests green).

- [ ] **Step 5: Update `ANALYSIS_SYSTEM_PROMPT` in `src/lib/ai/run-analysis.ts`**

Find the closing line `CRITICAL: constraints come FIRST. Function over aesthetics.` and REPLACE it with the expanded prompt (keeping the line, adding section 6 before the closing `;`):

Find this:
```ts
5. **Furniture WITHIN constraints**: Given no-go zones, suggest the BEST arrangement. For EACH piece:
   - WHICH WALL
   - ORIENTATION: state which direction it faces AND which focal point it's oriented toward (e.g. "sofa faces the fireplace", "dining table centered directly under the existing pendant")
   - POSITION: centered or offset and why
   - Fewer well-placed pieces beat cramming.

CRITICAL: constraints come FIRST. Function over aesthetics.`;
```

Replace with:
```ts
5. **Furniture WITHIN constraints**: Given no-go zones, suggest the BEST arrangement. For EACH piece:
   - WHICH WALL
   - ORIENTATION: state which direction it faces AND which focal point it's oriented toward (e.g. "sofa faces the fireplace", "dining table centered directly under the existing pendant")
   - POSITION: centered or offset and why
   - Fewer well-placed pieces beat cramming.

6. **CONCIERGE NOTES** — 2 to 3 short observations about this SPECIFIC ROOM, written for the USER to read during the 20–40 s wait for their staged image. These layer on top of 3 style-derived notes the app already has — your job here is ROOM-SPECIFIC observation, not STYLE-GENERAL description. Rules:
   - Each note ≤ 14 words. Present tense. Warm, observational, no jargon.
   - Reference something real and visible in the hero photo (a feature, a lighting direction, a proportion).
   - Observational, NOT promissory. Say "Noted the bay window — keeping that sightline clear" not "We'll fix the wall crack".
   - Never mention structural changes, colour changes, or anything we would not deliver.
   - If USER NOTES are present in the user message (above the style calibration block), include EXACTLY ONE note that echoes the user's wording back (e.g. user said "cosy" → "You asked for cosy — leaning into soft timber tones"). This is a single, concrete acknowledgement, not a paraphrase.
   - Do NOT include the style name or room type unless it adds real information beyond the user already knowing what they picked.

Format the section EXACTLY as below, with one bullet per note and no extra commentary:

CONCIERGE NOTES:
- [note 1]
- [note 2]
(optional 3rd note — the user echo, if USER NOTES were present)

CRITICAL: constraints come FIRST. Function over aesthetics.`;
```

- [ ] **Step 6: Update `RunAnalysisResult` interface and `runAnalysis` body in `src/lib/ai/run-analysis.ts`**

Change the interface:

```ts
export interface RunAnalysisResult {
  analysis: string;
  concierge_notes: string[];  // 0-3 strings parsed from the CONCIERGE NOTES section
}
```

Change `max_tokens` from `1200` to `1400` in the `client.messages.create` call to give headroom for the added section:

```ts
const response = await client.messages.create({
  model: modelId,
  max_tokens: 1400,  // was 1200 — extra room for CONCIERGE NOTES bullets
  thinking: { type: 'adaptive' },
  // …rest unchanged…
});
```

At the bottom of the function, replace the existing `return { analysis };` with:

```ts
// Add to imports at top of file:
import { parseConciergeNotes, stripConciergeNotes } from './parse-concierge-notes';

// At the end of runAnalysis, replacing `return { analysis };`:
const concierge_notes = parseConciergeNotes(analysis);
const analysisForLambda = stripConciergeNotes(analysis);
return { analysis: analysisForLambda, concierge_notes };
```

The `analysis` field returned (and stored in the wizard's `analysisCacheRef`) is now the stripped version — the Lambda receives only the structural/furniture reasoning, not the user-facing concierge notes. The notes are delivered separately via `concierge_notes`.

- [ ] **Step 7: Run full test suite to make sure nothing regressed**

Run: `npm run test`
Expected: PASS (existing passes + the 2 new test files).

- [ ] **Step 8: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS (note: `next build` is the hard truth — `react/no-unescaped-entities` can surface here and not in type-check, per project memory).

- [ ] **Step 9: Commit**

```bash
git add src/lib/ai/parse-concierge-notes.ts src/lib/ai/run-analysis.ts tests/lib/ai/parse-concierge-notes.test.ts
git commit -m "feat(analyse): CONCIERGE NOTES section in prompt + parser + return shape"
```

---

## Task 3: First-stage atomic detection — `markFirstStage` helper + `/api/jobs` wiring

**Files:**
- Create: `src/lib/db/first-stage.ts`
- Modify: `src/app/api/jobs/route.ts`
- Test: `tests/lib/db/first-stage.test.ts` (new)

Extracts the `ConditionalUpdate` to a testable helper, then calls it on the `done` branch of `/api/jobs` and includes the result (`isFirstStage: boolean`) in the response.

- [ ] **Step 1: Write failing tests** — create `tests/lib/db/first-stage.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Vitest hoists vi.mock above imports. The factory MUST NOT close over an
// external variable (hoisting would see it undefined). Use vi.fn() inline,
// then grab a typed reference via a normal import below.
vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: vi.fn() },
  TABLE_NAME: 'stageright',
}));

import { dynamodb } from '@/lib/aws/dynamodb';
import { markFirstStage } from '@/lib/db/first-stage';

const send = dynamodb.send as unknown as ReturnType<typeof vi.fn>;

describe('markFirstStage', () => {
  beforeEach(() => {
    send.mockReset();
  });

  it('returns true when the ConditionalUpdate succeeds', async () => {
    send.mockResolvedValueOnce({});
    const result = await markFirstStage('user-123');
    expect(result).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0][0];
    expect(cmd.input.Key).toEqual({ pk: 'USER#user-123', sk: 'PROFILE' });
    expect(cmd.input.ConditionExpression).toContain('attribute_not_exists(firstStageAt)');
    expect(cmd.input.UpdateExpression).toContain('firstStageAt');
  });

  it('returns false when ConditionalCheckFailed (firstStageAt already set)', async () => {
    const err = new Error('ConditionalCheckFailedException');
    err.name = 'ConditionalCheckFailedException';
    send.mockRejectedValueOnce(err);
    expect(await markFirstStage('user-123')).toBe(false);
  });

  it('returns false on any other error and does not throw', async () => {
    send.mockRejectedValueOnce(new Error('network boom'));
    expect(await markFirstStage('user-123')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/lib/db/first-stage.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `src/lib/db/first-stage.ts`**

```ts
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';

/**
 * Atomically marks a user's first successful stage. Returns true if this
 * call was the one that transitioned firstStageAt from unset → set; false
 * if the field was already set (another poll or tab won the race) or if
 * the write failed for any other reason.
 *
 * Idempotent by design — safe to call on every /api/jobs 'done' poll.
 * The ConditionExpression guarantees only one call per user ever wins.
 */
export async function markFirstStage(userId: string): Promise<boolean> {
  try {
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression: 'SET firstStageAt = :now, updatedAt = :now',
      ConditionExpression: 'attribute_not_exists(firstStageAt)',
      ExpressionAttributeValues: {
        ':now': new Date().toISOString(),
      },
    }));
    return true;
  } catch {
    // Either ConditionalCheckFailedException (field already set) or a
    // transient error. The welcome toast is a nice-to-have, not critical —
    // swallow both and return false. Real errors are surfaced elsewhere.
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/lib/db/first-stage.test.ts`
Expected: PASS (all 3 tests green).

- [ ] **Step 5: Wire `markFirstStage` into `/api/jobs` GET handler**

In `src/app/api/jobs/route.ts`, add the import at the top:

```ts
import { markFirstStage } from '@/lib/db/first-stage';
```

Then inside the existing `if (job.status === 'done' && job.result) {` branch, compute `isFirstStage` and include it in the response. Before:

```ts
if (job.status === 'done' && job.result) {
  const parsed = JSON.parse(job.result);
  return NextResponse.json({
    status: 'done',
    imageUrl: parsed.signedUrl,
    s3Key: parsed.s3Key,
    text: parsed.text,
    review: parsed.review,
    sessionId: parsed.sessionId,
  });
}
```

After:

```ts
if (job.status === 'done' && job.result) {
  const parsed = JSON.parse(job.result);
  const isFirstStage = await markFirstStage(session.user.id);
  return NextResponse.json({
    status: 'done',
    imageUrl: parsed.signedUrl,
    s3Key: parsed.s3Key,
    text: parsed.text,
    review: parsed.review,
    sessionId: parsed.sessionId,
    isFirstStage,
  });
}
```

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/first-stage.ts src/app/api/jobs/route.ts tests/lib/db/first-stage.test.ts
git commit -m "feat(jobs): atomic first-stage detection via markFirstStage helper"
```

---

## Task 4: BeforeAfterSlider — `autoReveal` + hover scale + handle glow

**Files:**
- Modify: `src/components/comparison/before-after-slider.tsx`

Replace the backwards `autoPlay` sequence (100→0→50) with a forward `autoReveal` sequence (0→100→50), add `onRevealPeak` callback at the 100 % beat, add `isHovered` state for desktop tactile response, and add a handle glow when `position ≥ 95`. Verified manually — component has no existing test coverage.

- [ ] **Step 1: Update the prop interface**

In `src/components/comparison/before-after-slider.tsx`, replace the current `BeforeAfterSliderProps` interface with:

```ts
interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
  /** When true, runs the 2s lid-lift reveal animation on mount.
   *  Replaces the legacy autoPlay prop. Any user pointer interaction
   *  cancels the animation and hands control over. */
  autoReveal?: boolean;
  fitParent?: boolean;
  /** Fires exactly once when the sweep hits 100% (t ≈ 1400ms).
   *  Used by the wizard to trigger the mobile haptic tap. */
  onRevealPeak?: () => void;
}
```

Delete the old `autoPlay?: boolean` prop and its JSDoc.

- [ ] **Step 2: Change the initial `position` state to honour `autoReveal`**

Replace the existing `useState` initialiser:

```ts
// BEFORE
const [position, setPosition] = useState(autoPlay ? 100 : 50);

// AFTER
const [position, setPosition] = useState(autoReveal ? 0 : 50);
```

- [ ] **Step 3: Add the `isHovered` state for desktop hover**

Just below the existing `isDragging` state:

```ts
const [isHovered, setIsHovered] = useState(false);
```

- [ ] **Step 4: Replace the `autoPlay` useEffect with the `autoReveal` sequence**

Find the existing `useEffect` that watches `autoPlay` (the one that sequences 100→0→50) and replace it wholesale:

```ts
useEffect(() => {
  if (!autoReveal) return;
  let rafId = 0;
  let startTime: number | null = null;
  let cancelled = false;
  let peakFired = false;

  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

  const tick = (now: number) => {
    if (cancelled || hasInteractedRef.current) return;
    if (startTime === null) startTime = now;
    const t = now - startTime;

    if (t < 200) {
      setPosition(0);
    } else if (t < 1400) {
      // 0 → 100 over 1200ms with ease-out
      const p = easeOut((t - 200) / 1200);
      setPosition(p * 100);
    } else if (t < 1700) {
      if (!peakFired) {
        peakFired = true;
        onRevealPeak?.();
      }
      setPosition(100);
    } else if (t < 2000) {
      const p = easeOut((t - 1700) / 300);
      setPosition(100 - p * 50);
    } else {
      setPosition(50);
      return;
    }
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(rafId);
  };
}, [autoReveal, onRevealPeak]);
```

- [ ] **Step 5: Update the handle element with hover handlers, glow, and scale**

Find the existing drag-handle `<div>` (the one with `className="absolute top-1/2 size-10 rounded-full bg-white shadow-elevated …"`) and replace it with:

```tsx
<div
  onPointerEnter={() => setIsHovered(true)}
  onPointerLeave={() => setIsHovered(false)}
  className="absolute top-1/2 size-10 rounded-full bg-white shadow-elevated flex items-center justify-center"
  style={{
    left: `${position}%`,
    transform: `translateX(-50%) translateY(-50%) scale(${
      isDragging ? 1.1 : isHovered ? 1.05 : 1
    })`,
    transition: 'transform 150ms ease-out',
    boxShadow: position >= 95
      ? '0 0 24px 6px rgba(255, 255, 255, 0.5), 0 8px 24px rgba(15, 29, 46, 0.25)'
      : '0 8px 24px rgba(15, 29, 46, 0.25)',
  }}
>
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M4 8h8M4 8l2-2M4 8l2 2M12 8l-2-2M12 8l-2 2"
      stroke="#0f1d2e"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
</div>
```

- [ ] **Step 6: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS. If a consumer of the deleted `autoPlay` prop errors (grep the repo for `autoPlay={` — at time of spec, there are none in live code), update it to `autoReveal`.

- [ ] **Step 7: Manual verification**

Load `/stage/batch/[batchId]` on localhost (which still uses the old slider without `autoReveal`). Verify the slider still mounts at 50/50 and drag behaves as before. This is the regression check — `autoReveal` is opt-in, so callers without it must be unaffected.

- [ ] **Step 8: Commit**

```bash
git add src/components/comparison/before-after-slider.tsx
git commit -m "feat(slider): autoReveal lid-lift + hover scale + peak glow; drop legacy autoPlay"
```

---

## Task 5: StagingWaitConcierge component + ken-burns keyframes

**Files:**
- Create: `src/components/staging/staging-wait-concierge.tsx`
- Modify: `src/app/globals.css`

Full-frame concierge wait screen. Ghost photo background, gradient overlay, ken-burns zoom, rotating concierge notes, orientation chip, progress line. Pure presentational — the wizard supplies combined notes.

- [ ] **Step 1: Add ken-burns keyframes to `src/app/globals.css`**

Append to the end of the file:

```css
@keyframes stage-wait-ken-burns {
  from { transform: scale(1.08); }
  to   { transform: scale(1.16); }
}
```

- [ ] **Step 2: Create `src/components/staging/staging-wait-concierge.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface StagingWaitConciergeProps {
  /** Signed or local blob URL for the hero photo. */
  heroImageUrl: string;
  /** Pre-combined concierge notes from the wizard (style base + analyser
   *  observations). Always non-empty in normal use. */
  conciergeNotes: string[];
}

export function StagingWaitConcierge({ heroImageUrl, conciergeNotes }: StagingWaitConciergeProps) {
  const [index, setIndex] = useState(0);
  const notes = conciergeNotes.length > 0 ? conciergeNotes : ['Staging in progress…'];

  useEffect(() => {
    if (notes.length <= 1) return;
    const msPerNote = Math.max(6000, Math.min(8000, 40000 / notes.length));
    const id = setInterval(() => {
      setIndex((i) => Math.min(i + 1, notes.length - 1));
    }, msPerNote);
    return () => clearInterval(id);
  }, [notes.length]);

  // Clamp index if notes array shrinks (shouldn't happen in normal flow, but defensive).
  const safeIndex = Math.min(index, notes.length - 1);

  return (
    <section className="relative w-full h-full overflow-hidden bg-brand-navy sm:rounded-2xl">
      {/* Ghost photo layer */}
      {heroImageUrl && (
        <img
          src={heroImageUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover"
          style={{
            filter: 'blur(24px) brightness(0.7) saturate(0.8)',
            transform: 'scale(1.08)',
            animation: 'stage-wait-ken-burns 40s linear forwards',
          }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      )}

      {/* Gradient overlay */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(15, 29, 46, 0.55) 0%, rgba(15, 29, 46, 0.78) 100%)',
        }}
      />

      {/* Orientation chip */}
      <div
        className="absolute top-0 right-0"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)',
          paddingRight: '1rem',
        }}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white/80 text-[11px] font-medium px-3 py-1.5 tracking-wide">
          <span className="size-1.5 rounded-full bg-brand-teal animate-pulse" />
          Staging · 20–40s
        </span>
      </div>

      {/* Note text */}
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <AnimatePresence mode="wait">
          <motion.p
            key={safeIndex}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="font-heading text-white text-[28px] sm:text-[32px] leading-snug text-center max-w-[52ch]"
          >
            {notes[safeIndex]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Progress line */}
      <div
        className="absolute left-0 right-0 h-[2px] bg-white/10"
        style={{ bottom: 'env(safe-area-inset-bottom)' }}
      >
        <motion.div
          className="h-full bg-brand-teal"
          initial={{ width: '0%' }}
          animate={{ width: '95%' }}
          transition={{ duration: 30, ease: 'linear' }}
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/components/staging/staging-wait-concierge.tsx
git commit -m "feat(staging): StagingWaitConcierge component + ken-burns keyframes"
```

---

## Task 6: EditorialNameplate component

**Files:**
- Create: `src/components/staging/editorial-nameplate.tsx`

Simple presentational component: eyebrow with room types, serif title with style name. Replaces the current chip-style header in the result step.

- [ ] **Step 1: Create `src/components/staging/editorial-nameplate.tsx`**

```tsx
import type { StagingStyle } from '@/lib/ai/prompts';

interface EditorialNameplateProps {
  style: StagingStyle;
  roomTypes: string[];
}

export function EditorialNameplate({ style, roomTypes }: EditorialNameplateProps) {
  return (
    <header className="flex-shrink-0 px-5 sm:px-8 py-4 sm:py-5 text-center border-b border-surface-border/60 bg-white">
      <p className="text-[10px] font-medium text-ink-muted uppercase tracking-[0.14em]">
        Staged · {roomTypes.join(' · ')}
      </p>
      <h2 className="mt-1 font-heading text-[26px] sm:text-[32px] text-brand-navy tracking-tight leading-tight">
        {style}
      </h2>
    </header>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/staging/editorial-nameplate.tsx
git commit -m "feat(staging): EditorialNameplate component for result header"
```

---

## Task 7: ConciergeNotesExpander component (with staggered reveal)

**Files:**
- Create: `src/components/staging/concierge-notes-expander.tsx`

Collapsed-by-default expander that shows the same concierge notes the user saw during the wait. Notes enter with staggered 80ms-per-note animation for a "unfurling" feel.

- [ ] **Step 1: Create `src/components/staging/concierge-notes-expander.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { STYLE_PALETTES, type StagingStyle } from '@/lib/ai/prompts';
import { cn } from '@/lib/utils/cn';

interface ConciergeNotesExpanderProps {
  notes: string[];
  style: StagingStyle;
}

export function ConciergeNotesExpander({ notes, style }: ConciergeNotesExpanderProps) {
  const [expanded, setExpanded] = useState(false);

  if (notes.length === 0) return null;

  const palette = STYLE_PALETTES[style];

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="inline-flex items-center gap-2 rounded-full border border-surface-border bg-white hover:bg-surface-secondary px-4 py-2 text-xs font-medium text-brand-navy transition-colors"
        aria-expanded={expanded}
      >
        <span className="size-1.5 rounded-full" style={{ backgroundColor: palette[0] }} />
        {notes.length} things we watched for in your room
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={cn('transition-transform', expanded && 'rotate-180')}
          aria-hidden
        >
          <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden mt-3 space-y-2 max-w-[640px] mx-auto w-full"
          >
            {notes.map((note, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut', delay: 0.1 + i * 0.08 }}
                className="flex items-start gap-3 text-sm text-ink-secondary"
              >
                <span
                  className="mt-1.5 size-1 rounded-full flex-shrink-0"
                  style={{ backgroundColor: palette[i % 3] }}
                />
                <span>{note}</span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/staging/concierge-notes-expander.tsx
git commit -m "feat(staging): ConciergeNotesExpander with staggered note entry"
```

---

## Task 8: FirstStageWelcomeToast component

**Files:**
- Create: `src/components/staging/first-stage-welcome-toast.tsx`

One-time soft toast shown after the reveal settles on the user's very first stage. Dismissible; auto-dismisses after 8 seconds.

- [ ] **Step 1: Create `src/components/staging/first-stage-welcome-toast.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';

interface FirstStageWelcomeToastProps {
  onDismiss: () => void;
}

export function FirstStageWelcomeToast({ onDismiss }: FirstStageWelcomeToastProps) {
  useEffect(() => {
    // Belt-and-braces local guard — server-side firstStageAt is the primary
    // source of truth, but this prevents a refresh during the 8-second
    // window from re-triggering the toast for the same account.
    try {
      localStorage.setItem('stageright:welcome-seen', '1');
    } catch {
      /* noop — storage may be unavailable */
    }
    const id = setTimeout(() => onDismiss(), 8000);
    return () => clearTimeout(id);
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay: 1.5 }}
      className="fixed left-1/2 -translate-x-1/2 z-50 bottom-4 sm:bottom-6 max-w-[420px] w-[calc(100vw-2rem)]"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 bg-brand-navy text-white rounded-2xl shadow-elevated px-4 py-3.5 pr-2">
        <span className="flex-shrink-0 size-8 rounded-full bg-brand-teal/20 text-brand-teal flex items-center justify-center mt-0.5">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M7 1v3M7 10v3M1 7h3M10 7h3M2.5 2.5l2 2M9.5 9.5l2 2M2.5 11.5l2-2M9.5 4.5l2-2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[14px] leading-snug">Your first staged room.</p>
          <p className="text-[12px] text-white/70 leading-snug mt-0.5">
            It lives in your gallery now.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 size-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          aria-label="Dismiss"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/staging/first-stage-welcome-toast.tsx
git commit -m "feat(staging): FirstStageWelcomeToast for first-stage induction moment"
```

---

## Task 9: Wire everything into the wizard (`src/app/stage/page.tsx`)

**Files:**
- Modify: `src/app/stage/page.tsx`

This is the integration step. The existing wizard gains new state (`conciergeNotes`, `isFirstStage`), pre-fills base notes before the analyse request, replaces the `WizardCard`-generating step with `StagingWaitConcierge`, rebuilds the `result` step around `EditorialNameplate` + `ConciergeNotesExpander` + keyed slider with `autoReveal` + conditional `FirstStageWelcomeToast`.

- [ ] **Step 1: Add the new imports at the top of `src/app/stage/page.tsx`**

Find the existing import block (lines ~1-22 currently). Add:

```ts
import { StagingWaitConcierge } from '@/components/staging/staging-wait-concierge';
import { EditorialNameplate } from '@/components/staging/editorial-nameplate';
import { ConciergeNotesExpander } from '@/components/staging/concierge-notes-expander';
import { FirstStageWelcomeToast } from '@/components/staging/first-stage-welcome-toast';
import { STYLE_CONCIERGE_BASE, buildConciergeNotes, type StagingStyle } from '@/lib/ai/prompts';
```

Keep the existing `StagingLoader` import in place — it's still used by `batch-result.tsx`, out of scope here.

Actually, remove the `StagingLoader` import from THIS file only (the wizard no longer uses it):

```ts
// REMOVE:
import { StagingLoader } from '@/components/staging/staging-loader';
```

- [ ] **Step 2: Add the new state hooks**

Inside `StagePageInner`, alongside the existing generation state:

```ts
const [conciergeNotes, setConciergeNotes] = useState<string[]>([]);
const [isFirstStage, setIsFirstStage] = useState(false);
```

- [ ] **Step 3: Pre-fill base notes inside `runSingleStaging`, BEFORE the analyse call**

Find the opening of `runSingleStaging` (after `setIsGenerating(true); setStep('generating');`). Add a pre-fill block that populates base notes immediately so the wait screen has content on mount:

```ts
const runSingleStaging = useCallback(async (chosenStyle: StagingStyle) => {
  setError(null);
  setIsGenerating(true);
  setStep('generating');

  // Pre-fill with style-derived base notes so the wait screen has real
  // content the instant it mounts — before analyse has returned.
  setConciergeNotes(buildConciergeNotes({
    style: chosenStyle,
    roomTypes,
    analyserNotes: [],
  }));

  try {
    // …existing body…
```

- [ ] **Step 4: Capture and combine analyser notes in the existing analyse block**

Find the existing `if (aRes.ok) { ... }` block and update it to combine the returned analyser notes with the base notes:

```ts
if (aRes.ok) {
  const aData = await aRes.json();
  if (aData.analysis) {
    analysis = aData.analysis as string;
    analysisCacheRef.current.set(cacheKey, analysis);
  }
  const analyserNotes = Array.isArray(aData.concierge_notes) ? aData.concierge_notes : [];
  setConciergeNotes(buildConciergeNotes({
    style: usedStyle,
    roomTypes,
    analyserNotes,
  }));
}
```

If analyse fails, the base-only pre-fill from Step 3 stays in state — no additional error handling needed.

- [ ] **Step 5: Capture `isFirstStage` from the pollJob response (two places)**

Both `runSingleStaging`'s success block and the resume-in-flight `useEffect` consume `pollJob(...)`. Update both. In the resume effect:

```ts
pollJob(pending.jobId)
  .then((data) => {
    setStagedImage(data.imageUrl as string);
    setLastStagedS3Key(data.s3Key as string);
    if (data.sessionId) setSessionId(data.sessionId as string);
    setIsFirstStage(Boolean(data.isFirstStage));  // NEW
    setStep('result');
    setNotes('');
    refreshAuth();
  })
```

In `runSingleStaging`:

```ts
const data = await pollJob(jobId);

setStagedImage(data.imageUrl as string);
setLastStagedS3Key(data.s3Key as string);
if (data.sessionId) setSessionId(data.sessionId as string);
setIsFirstStage(Boolean(data.isFirstStage));  // NEW
setStep('result');
refreshAuth();
```

- [ ] **Step 6: Clear the new state in `startOver`**

In the existing `startOver` callback, add:

```ts
const startOver = useCallback(() => {
  // …existing setters…
  setConciergeNotes([]);
  setIsFirstStage(false);
  // …rest unchanged…
}, [router]);
```

- [ ] **Step 7: Replace the `generating` step's WizardCard with `StagingWaitConcierge`**

Find the existing branch:

```tsx
{step === 'generating' && (
  <WizardCard
    key="generating"
    tag="Staging"
    tagTone="teal"
    question="Creating your staged room"
    subtitle="This takes 20–40 seconds. Keep this tab open."
  >
    <StagingLoader />
  </WizardCard>
)}
```

Replace with:

```tsx
{step === 'generating' && (
  <StagingWaitConcierge
    key="generating"
    heroImageUrl={heroSignedUrl ?? heroPhoto?.preview ?? ''}
    conciergeNotes={conciergeNotes}
  />
)}
```

- [ ] **Step 8: Replace the `result` step's `<header>` with `<EditorialNameplate>`**

Find the existing one-line header inside the `result` step (the `<header className="flex-shrink-0 px-5 sm:px-6 py-3 sm:py-4 text-center border-b …">` with the checkmark + style + credit). Delete the entire `<header>` element and replace with:

```tsx
<EditorialNameplate style={(styles[0] ?? 'Modern') as StagingStyle} roomTypes={roomTypes} />
```

- [ ] **Step 9: Add `autoReveal`, `onRevealPeak`, and `lastStagedS3Key` key to the slider**

Find the existing `<BeforeAfterSlider …>` inside the result step. Update it to:

```tsx
<BeforeAfterSlider
  key={lastStagedS3Key ?? 'no-key'}
  beforeSrc={heroSignedUrl || heroPhoto?.preview || ''}
  afterSrc={stagedImage}
  beforeLabel="Empty"
  afterLabel="Staged"
  className="rounded-xl"
  fitParent
  autoReveal
  onRevealPeak={() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(12);
    }
  }}
/>
```

The `key={lastStagedS3Key ?? 'no-key'}` forces a fresh mount on "Try another style" so `autoReveal` replays on the new image.

- [ ] **Step 10: Insert `<ConciergeNotesExpander>` beneath the slider**

Immediately below the slider's outer `<div className="flex-1 min-h-0 flex items-center justify-center p-4 sm:p-6">` and BEFORE the tertiary/flag-review block, insert a new row:

```tsx
<div className="flex-shrink-0 pt-3 pb-2 px-5 sm:px-6">
  <ConciergeNotesExpander
    notes={conciergeNotes}
    style={(styles[0] ?? 'Modern') as StagingStyle}
  />
</div>
```

Exact placement: between the flex-1 slider wrapper and the `<div className="flex-shrink-0 overflow-y-auto max-h-[30vh] …">` tertiary container.

- [ ] **Step 11: Render `<FirstStageWelcomeToast>` conditionally**

Near the existing `<FlagReviewDialog>` at the bottom of the JSX tree (outside `<main>`), add:

```tsx
{isFirstStage && step === 'result' && (
  <FirstStageWelcomeToast onDismiss={() => setIsFirstStage(false)} />
)}
```

- [ ] **Step 12: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS. If `next build` flags any `react/no-unescaped-entities` errors (contractions in JSX), fix by replacing `'` with `&apos;` in JSX text per `feedback_apostrophes.md`.

- [ ] **Step 13: Commit**

```bash
git add src/app/stage/page.tsx
git commit -m "feat(stage): wire ceremony — concierge wait, editorial nameplate, expander, welcome toast"
```

---

## Task 10: PR 1 manual acceptance + deploy

**Files:**
- None (verification + deploy)

Before opening PR 1, walk through the spec's §9 acceptance criteria manually on the running dev server.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: server starts on http://localhost:3000 (or next free port if held).

- [ ] **Step 2: Walk through the wait-screen checklist**

Sign in, upload a hero photo, pick any style + room, click Stage. Verify:

- [ ] Wait screen is full-frame inside the main work area — app header and progress bar remain visible above.
- [ ] Ghost photo visible with blur + darkening; white serif notes legible.
- [ ] Notes rotate every 6–8 s with a smooth cross-fade.
- [ ] After ~1–3 s the analyser's notes append — the visible pool grows from 3 to 5–6.
- [ ] Orientation chip renders top-right with a pulsing teal dot.
- [ ] Progress line animates 0 → 95 % over 30 s, then holds.

- [ ] **Step 3: Walk through the reveal checklist**

On the result step:

- [ ] Slider mounts at position = 0 (empty room only).
- [ ] Brief hold at 0, then sweeps 0 → 100 % over ~1.2 s with ease-out.
- [ ] Brief hold at 100 %, settles to 50 %.
- [ ] Touching the slider mid-animation instantly hands over control.
- [ ] Handle shows the white glow halo at position ≥ 95.
- [ ] On desktop with a mouse, hovering the handle scales it from 1.0 → 1.05; cursor-leave returns to 1.0.
- [ ] On a mobile device (or browser responsive mode with touch emulation), the handle does NOT show the hover scale.

- [ ] **Step 4: Walk through the afterglow checklist**

- [ ] `EditorialNameplate` replaces the old header — DM Serif style name, eyebrow with room types, no checkmark icon, no credit count on that surface.
- [ ] `ConciergeNotesExpander` sits below the slider, collapsed by default.
- [ ] Click the expander — notes slide in with the 80 ms-per-note stagger.
- [ ] Welcome toast appears 1.5 s after the reveal settles on the FIRST account stage.
- [ ] Welcome toast auto-dismisses after 8 s.
- [ ] Refreshing during the toast window does NOT re-show it.
- [ ] Completing a second stage on the same account does NOT re-show the toast.

- [ ] **Step 5: Regression check — batch path untouched**

Open `/stage`, pick 2+ styles, click Stage. Verify the batch page still loads and uses the old `StagingLoader` (no regressions).

- [ ] **Step 6: Final type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 7: Push and open PR 1**

```bash
git push origin HEAD
gh pr create --title "Staging reveal ceremony — core (wait / reveal / afterglow)" --body "$(cat <<'EOF'
## Summary
Ships the gift-framework reveal ceremony for the single-style flow:
- Full-frame concierge wait screen with style-derived + analyser-derived notes
- 2s lid-lift slider reveal (replaces 200ms fade), with desktop hover + mobile haptic
- Editorial nameplate, persistent concierge-notes expander, first-stage welcome toast
- Backend: analyser returns concierge_notes; /api/jobs writes firstStageAt atomically

Spec: docs/superpowers/specs/2026-04-21-staging-reveal-ceremony-design.md
Plan: docs/superpowers/plans/2026-04-21-staging-reveal-ceremony.md

## Test plan
- [x] Unit tests pass (buildConciergeNotes, parseConciergeNotes, markFirstStage)
- [x] Full type-check + build pass
- [ ] Manual: wait screen renders with real concierge notes; rotation smooth
- [ ] Manual: reveal sweeps 0→100→50; touch interrupts; handle glows at peak
- [ ] Manual: welcome toast fires on first-ever stage only
- [ ] Manual: batch page untouched — old loader still works
EOF
)"
```

---

# Phase 2 — PR 2: Share export

## Task 11: CORS pre-flight verification

**Files:**
- None (verification + optional AWS config change)

Canvas export with `img.crossOrigin = 'anonymous'` requires S3 signed URLs to return `Access-Control-Allow-Origin`. Verify before writing code.

- [ ] **Step 1: Check the CORS headers on a staged-image signed URL**

On the running dev server, open any completed stage and open DevTools → Network. Click the staged-image request. Look for these response headers:
- `access-control-allow-origin: *` (or matching origin)

If present: proceed to Task 12.
If absent: continue to Step 2.

- [ ] **Step 2: (If CORS missing) update the S3 bucket CORS policy**

Run from project root:

```bash
aws s3api get-bucket-cors --bucket stageright-images --region ap-southeast-2
```

If the response is an error or the CORS is restrictive, apply this policy:

```bash
cat > /tmp/cors.json <<'EOF'
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": []
    }
  ]
}
EOF
aws s3api put-bucket-cors --bucket stageright-images --region ap-southeast-2 --cors-configuration file:///tmp/cors.json
```

Verify by re-loading a stage result and checking headers again.

- [ ] **Step 3: Document finding in a short note**

Write a one-sentence note at the top of `src/lib/utils/share-export.ts` (which Task 12 will create) noting whether the CORS change was needed. This helps future maintainers understand why the file relies on crossOrigin.

---

## Task 12: renderShareExport canvas utility

**Files:**
- Create: `src/lib/utils/share-export.ts`
- Test: `tests/lib/utils/share-export.test.ts` (new)

Client-side canvas renderer that composites the before + after images with an editorial nameplate into a 1080×1920 vertical PNG.

- [ ] **Step 1: Write failing tests for the pure helpers** — create `tests/lib/utils/share-export.test.ts`

Canvas + image loading are browser-only; vitest runs in Node by default. Test only the pure math helper `computeCoverCrop`:

```ts
import { describe, it, expect } from 'vitest';
import { computeCoverCrop } from '@/lib/utils/share-export';

describe('computeCoverCrop', () => {
  it('crops sides when source is wider than destination ratio', () => {
    const crop = computeCoverCrop({ srcW: 2000, srcH: 1000, dstW: 600, dstH: 600 });
    // src ratio 2, dst ratio 1 → src wider → crop sides
    expect(crop.sy).toBe(0);
    expect(crop.sh).toBe(1000);
    expect(crop.sw).toBe(1000); // src height × dst ratio
    expect(crop.sx).toBe(500);  // centred horizontally
  });

  it('crops top/bottom when source is taller than destination ratio', () => {
    const crop = computeCoverCrop({ srcW: 1000, srcH: 2000, dstW: 600, dstH: 600 });
    expect(crop.sx).toBe(0);
    expect(crop.sw).toBe(1000);
    expect(crop.sh).toBe(1000);
    expect(crop.sy).toBe(500);
  });

  it('no crop when source and destination ratios match', () => {
    const crop = computeCoverCrop({ srcW: 1000, srcH: 1000, dstW: 500, dstH: 500 });
    expect(crop).toEqual({ sx: 0, sy: 0, sw: 1000, sh: 1000 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/lib/utils/share-export.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `src/lib/utils/share-export.ts`**

```ts
/**
 * Client-side share-export renderer. Composites the before + after images
 * with a style nameplate into a 1080×1920 vertical PNG for sharing to
 * Instagram, email, or client messages.
 *
 * Browser-only (uses Canvas 2D API). Requires S3 signed URLs to return
 * `Access-Control-Allow-Origin` — the crossOrigin='anonymous' attribute
 * forces CORS-clean loading so canvas.toBlob() doesn't taint.
 */

interface RenderShareExportInput {
  beforeImageUrl: string;
  afterImageUrl: string;
  style: string;
  roomTypes: string[];
}

interface CoverCrop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Pure helper — compute the source rect to sample from an image so it
 * covers the destination box (object-fit: cover behaviour). Exported
 * for unit testing; also used internally by drawCoveredImage.
 */
export function computeCoverCrop(args: {
  srcW: number;
  srcH: number;
  dstW: number;
  dstH: number;
}): CoverCrop {
  const srcRatio = args.srcW / args.srcH;
  const dstRatio = args.dstW / args.dstH;
  if (srcRatio > dstRatio) {
    const sw = args.srcH * dstRatio;
    return { sx: (args.srcW - sw) / 2, sy: 0, sw, sh: args.srcH };
  } else if (srcRatio < dstRatio) {
    const sh = args.srcW / dstRatio;
    return { sx: 0, sy: (args.srcH - sh) / 2, sw: args.srcW, sh };
  }
  return { sx: 0, sy: 0, sw: args.srcW, sh: args.srcH };
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function drawCoveredImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const crop = computeCoverCrop({ srcW: img.width, srcH: img.height, dstW: w, dstH: h });
  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, x, y, w, h);
}

export async function renderShareExport(input: RenderShareExportInput): Promise<Blob> {
  const WIDTH = 1080;
  const HEIGHT = 1920;

  // Ensure DM Serif Display + Outfit are loaded before we draw text.
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.load('600 96px "DM Serif Display"');
      await document.fonts.load('500 22px "Outfit"');
    } catch {
      // Non-fatal — fall back to system serif/sans if fonts can't load.
    }
  }

  const [beforeImg, afterImg] = await Promise.all([
    loadImage(input.beforeImageUrl),
    loadImage(input.afterImageUrl),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Background — soft warm off-white
  ctx.fillStyle = '#faf7f2';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Layout
  const PAD = 60;
  const TEXT_BAND_HEIGHT = 240;
  const IMG_HEIGHT = (HEIGHT - TEXT_BAND_HEIGHT - PAD * 2) / 2;
  const IMG_WIDTH = WIDTH - PAD * 2;

  // Before (top)
  drawCoveredImage(ctx, beforeImg, PAD, PAD, IMG_WIDTH, IMG_HEIGHT);
  // After (bottom)
  drawCoveredImage(ctx, afterImg, PAD, PAD + IMG_HEIGHT + TEXT_BAND_HEIGHT, IMG_WIDTH, IMG_HEIGHT);

  // Text band
  const bandTop = PAD + IMG_HEIGHT;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // Eyebrow
  ctx.font = '500 22px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#64748b';
  const eyebrow = input.roomTypes.join(' · ').toUpperCase();
  ctx.fillText(eyebrow, WIDTH / 2, bandTop + 70);

  // Style name
  ctx.font = '600 96px "DM Serif Display", Georgia, serif';
  ctx.fillStyle = '#0f1d2e';
  ctx.fillText(input.style, WIDTH / 2, bandTop + 150);

  // Footer
  ctx.font = '500 20px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('Staged with StageRight', WIDTH / 2, HEIGHT - 40);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      'image/png',
      0.95,
    );
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/lib/utils/share-export.test.ts`
Expected: PASS (3 tests green).

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/share-export.ts tests/lib/utils/share-export.test.ts
git commit -m "feat(share): renderShareExport canvas utility + computeCoverCrop helper"
```

---

## Task 13: ShareExportButton + wire into the result footer

**Files:**
- Create: `src/components/staging/share-export-button.tsx`
- Modify: `src/app/stage/page.tsx`

- [ ] **Step 1: Create `src/components/staging/share-export-button.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { renderShareExport } from '@/lib/utils/share-export';

interface ShareExportButtonProps {
  beforeImageUrl: string;
  afterImageUrl: string;
  style: string;
  roomTypes: string[];
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function ShareExportButton({
  beforeImageUrl,
  afterImageUrl,
  style,
  roomTypes,
}: ShareExportButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setError(null);
    setBusy(true);
    try {
      const blob = await renderShareExport({ beforeImageUrl, afterImageUrl, style, roomTypes });
      const url = URL.createObjectURL(blob);
      const roomSlug = roomTypes.map(slug).filter(Boolean).join('-') || 'room';
      const styleSlug = slug(style) || 'staged';
      const a = document.createElement('a');
      a.href = url;
      a.download = `stageright-${styleSlug}-${roomSlug}-share.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Share image failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="flex-1 h-11 sm:h-12 inline-flex items-center justify-center gap-2 bg-white border border-surface-border text-brand-navy font-medium text-sm rounded-xl hover:bg-surface-secondary transition-colors whitespace-nowrap disabled:opacity-60"
      >
        {busy ? (
          <span className="size-4 border-2 border-brand-navy border-t-transparent rounded-full animate-spin" aria-label="Building" />
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M7 1v8M7 1l-3 3M7 1l3 3M2 8v3a1 1 0 001 1h8a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sm:hidden">Share</span>
            <span className="hidden sm:inline">Share image</span>
          </>
        )}
      </button>
      {error && (
        <p className="text-xs text-red-600 mt-1" role="alert">
          Couldn&apos;t build the share image — please try again.
        </p>
      )}
    </>
  );
}
```

- [ ] **Step 2: Add the import in `src/app/stage/page.tsx`**

```ts
import { ShareExportButton } from '@/components/staging/share-export-button';
```

- [ ] **Step 3: Update the sticky footer to include ShareExport**

Find the existing sticky footer in the `result` step (the `<footer …>` with Download + Try another + Gallery). Replace its content with a 4-button responsive grid:

```tsx
<footer
  className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t border-surface-border/60 bg-white"
  style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
>
  <div className="mx-auto w-full max-w-[720px] grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
    {lastStagedS3Key && (
      <a
        href={`/api/download?key=${encodeURIComponent(lastStagedS3Key)}&style=${encodeURIComponent(styles[0] ?? '')}${roomTypes.length > 0 ? `&rooms=${encodeURIComponent(roomTypes.join(','))}` : ''}`}
        className="h-11 sm:h-12 inline-flex items-center justify-center gap-2 bg-brand-navy text-white font-medium text-sm rounded-xl hover:bg-brand-navy-light transition-colors whitespace-nowrap"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><path d="M7 2v7m0 0l-3-3m3 3l3-3M2 10v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Download
      </a>
    )}
    {stagedImage && (heroSignedUrl || heroPhoto?.preview) && (
      <ShareExportButton
        beforeImageUrl={heroSignedUrl || heroPhoto?.preview || ''}
        afterImageUrl={stagedImage}
        style={styles[0] ?? ''}
        roomTypes={roomTypes}
      />
    )}
    <button
      type="button"
      onClick={() => {
        setNotes('');
        setStep('style');
      }}
      className="h-11 sm:h-12 inline-flex items-center justify-center gap-2 bg-white border border-surface-border text-brand-navy font-medium text-sm rounded-xl hover:bg-surface-secondary transition-colors whitespace-nowrap"
    >
      <span className="sm:hidden">Try another</span>
      <span className="hidden sm:inline">Try another style</span>
    </button>
    <Link
      href="/dashboard"
      className="h-11 sm:h-12 inline-flex items-center justify-center gap-2 bg-white border border-surface-border text-brand-navy font-medium text-sm rounded-xl hover:bg-surface-secondary transition-colors whitespace-nowrap"
    >
      Gallery
    </Link>
  </div>
</footer>
```

Responsive layout: 2-column grid on mobile (Download + Share top row, Try another + Gallery bottom row), 4-column on sm:+.

- [ ] **Step 4: Type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS. Watch for `react/no-unescaped-entities` — the `Couldn&apos;t` in the error toast is the only contraction in the new code and is already escaped.

- [ ] **Step 5: Commit**

```bash
git add src/components/staging/share-export-button.tsx src/app/stage/page.tsx
git commit -m "feat(share): ShareExportButton in result footer; 4-button responsive grid"
```

---

## Task 14: PR 2 manual acceptance + deploy

**Files:**
- None (verification + deploy)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Generate a share export and verify the output**

On a completed stage, click "Share image". Verify:
- [ ] Spinner replaces the icon during render.
- [ ] PNG downloads with filename `stageright-<style>-<room>-share.png`.
- [ ] PNG is 1080×1920.
- [ ] Before photo on top (cover-fit), after photo on bottom, style nameplate centred in DM Serif.
- [ ] "Staged with StageRight" footer visible at the bottom.
- [ ] Text is rendered in the correct serif font (DM Serif Display), not falling back to Georgia or system serif.

- [ ] **Step 3: Error-path check**

Open a completed stage, then manually break CORS or disconnect network and click Share. Verify the inline error message appears and the button returns to idle state — no uncaught exceptions in the console.

- [ ] **Step 4: Responsive layout check**

- [ ] Mobile (360 px): 4 buttons in a 2×2 grid; each button readable.
- [ ] Desktop (≥ 640 px): 4 buttons in a single row; no wrapping.

- [ ] **Step 5: Final type-check + build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 6: Push and open PR 2**

```bash
git push origin HEAD
gh pr create --title "Staging reveal — share export button" --body "$(cat <<'EOF'
## Summary
Adds a Share button to the result footer that generates a 1080×1920 PNG
(before / style nameplate / after / mark) via browser canvas. No server
round-trip. Depends on PR 1 (editorial nameplate + 4-button footer grid).

Spec: docs/superpowers/specs/2026-04-21-staging-reveal-ceremony-design.md
Plan: docs/superpowers/plans/2026-04-21-staging-reveal-ceremony.md

## Test plan
- [x] Unit: computeCoverCrop cover-math correct for all three ratio cases
- [x] Type-check + build pass
- [ ] Manual: share PNG downloads at 1080×1920 with correct composition
- [ ] Manual: DM Serif Display renders in the nameplate (verify font not falling back)
- [ ] Manual: error path shows inline toast, no console exception
- [ ] Manual: 4-button footer wraps gracefully on 360px
EOF
)"
```

---

## Out of scope reminders

- **Batch page ceremony** — `src/app/stage/batch/[batchId]/page.tsx` and `src/components/staging/batch-result.tsx` still use the old `StagingLoader`. Separate follow-on spec will apply the same framework with a card-pack sequential reveal.
- **Audio design** — silent by design, per spec §2.
- **Onboarding ceremony** — queued as a separate initiative.
- **Regen-token celebration** — queued as a separate initiative.

---

*End of plan.*
