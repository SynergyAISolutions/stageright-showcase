# Multi-Set Landing Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins curate multiple "sets" per room type on the landing showcase, with dot navigation in the preview area and sub-tab navigation in the admin picker.

**Architecture:** Sort key extends from `ROOM#{slug}` to `ROOM#{slug}#{setIndex}` with backward-compat read; legacy single-set records read as setIndex=0. Slot map becomes `Record<room, LandingSlot[]>` with one slot per fully-covered enabled set. Public client adds `activeSetByRoom` state + dots in the preview corner. Admin picker grows sub-tabs + Add new (local draft until first save) + per-set Delete with in-app confirm modal.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, DynamoDB single-table (`stageright`), AWS SDK v3, Vitest with `vi.mock` of `@/lib/aws/dynamodb`, Tailwind CSS, sonner toasts.

**File map:**

| File | Change |
|------|--------|
| `src/lib/db/landing-picks.ts` | Add `parseSk`, change `getLandingPicks` to return arrays per room, change `upsertLandingPick` signature to take `setIndex`, add `deleteLandingPick`, add `getNextSetIndex` |
| `src/lib/landing/slot-map.ts` | Add `mergeAllSlots(picks, resolved)` and `isRoomVisible(picks)` |
| `src/components/landing/style-showcase.tsx` | Build slotMap as arrays per room |
| `src/components/landing/style-showcase-client.tsx` | Add `activeSetByRoom`, render dots in preview corner, swipe-to-nav on touch |
| `src/app/api/admin/landing-picks/route.ts` | Accept `setIndex` in POST body; new DELETE handler |
| `src/app/admin/landing-images/landing-images-client.tsx` | Sub-tab row, +Add (local draft), ×Delete with in-app confirm |
| `tests/db/landing-picks.test.ts` | Update for array return + setIndex writes + delete |
| `tests/lib/landing/slot-map.test.ts` | Add tests for `mergeAllSlots`, `isRoomVisible` |
| `tests/api/admin-landing-picks.test.ts` | Update for setIndex param + DELETE |

---

## Phase 1 — Schema + read layer

### Task 1: `parseSk` + array-returning `getLandingPicks`

**Files:**
- Modify: `src/lib/db/landing-picks.ts`
- Modify: `tests/db/landing-picks.test.ts`

- [ ] **Step 1: Update existing tests + add new ones for array return**

Replace the `describe('getLandingPicks', ...)` block in `tests/db/landing-picks.test.ts` with:

```typescript
describe('getLandingPicks', () => {
  it('groups records by room slug, sorted by setIndex', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({
      Items: [
        { pk: 'LANDING_PICK', sk: 'ROOM#bedroom#1', enabled: true,
          picks: { Modern: 'b1.jpg' }, heroByStyle: { Modern: 'h1.jpg' },
          updatedAt: '2026-05-02T01:00:00Z' },
        { pk: 'LANDING_PICK', sk: 'ROOM#bedroom#0', enabled: true,
          picks: { Modern: 'b0.jpg' }, heroByStyle: { Modern: 'h0.jpg' },
          updatedAt: '2026-05-02T00:00:00Z' },
        { pk: 'LANDING_PICK', sk: 'ROOM#kitchen#0', enabled: false,
          picks: {}, heroByStyle: {}, updatedAt: '2026-05-02T00:00:00Z' },
      ],
    } as never);

    const result = await getLandingPicks();
    expect(result.bedroom).toHaveLength(2);
    expect(result.bedroom?.[0].picks.Modern).toBe('b0.jpg');
    expect(result.bedroom?.[1].picks.Modern).toBe('b1.jpg');
    expect(result.kitchen).toHaveLength(1);
    expect(result.kitchen?.[0].enabled).toBe(false);
  });

  it('treats legacy ROOM#{slug} sk as setIndex=0', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({
      Items: [
        { pk: 'LANDING_PICK', sk: 'ROOM#bedroom', enabled: true,
          picks: { Modern: 'old.jpg' }, updatedAt: '2026-04-29T00:00:00Z' },
      ],
    } as never);
    const result = await getLandingPicks();
    expect(result.bedroom).toHaveLength(1);
    expect(result.bedroom?.[0].picks.Modern).toBe('old.jpg');
  });

  it('returns empty object when no records', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({ Items: [] } as never);
    const result = await getLandingPicks();
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `npm run test -- tests/db/landing-picks.test.ts`
Expected: FAIL — assertion errors about `.toHaveLength`, return shape mismatched.

- [ ] **Step 3: Replace `getLandingPicks` and add `parseSk`**

In `src/lib/db/landing-picks.ts`, replace the existing `slugFromSk` and `getLandingPicks` with:

```typescript
const ROOM_SK_PREFIX = 'ROOM#';

/**
 * Parse a LandingPick sort key into room slug + setIndex.
 *   ROOM#bedroom#0 → { slug: 'bedroom', setIndex: 0 }
 *   ROOM#bedroom   → { slug: 'bedroom', setIndex: 0 }  (legacy)
 *   ROOM#living-room#2 → { slug: 'living-room', setIndex: 2 }
 *   anything else  → null
 */
export function parseSk(sk: string): { slug: ThumbnailRoom; setIndex: number } | null {
  if (!sk.startsWith(ROOM_SK_PREFIX)) return null;
  const tail = sk.slice(ROOM_SK_PREFIX.length);
  // Find the last '#' to split slug from setIndex (slug may contain '-').
  const hashIdx = tail.lastIndexOf('#');
  if (hashIdx === -1) {
    // Legacy: ROOM#bedroom → setIndex 0
    return { slug: tail as ThumbnailRoom, setIndex: 0 };
  }
  const slug = tail.slice(0, hashIdx) as ThumbnailRoom;
  const idx = Number(tail.slice(hashIdx + 1));
  if (!Number.isInteger(idx) || idx < 0) return null;
  return { slug, setIndex: idx };
}

export async function getLandingPicks(): Promise<Partial<Record<ThumbnailRoom, LandingPick[]>>> {
  const res = await dynamodb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': 'LANDING_PICK' },
  }));
  const items = (res.Items ?? []) as LandingPick[];
  const out: Partial<Record<ThumbnailRoom, LandingPick[]>> = {};
  for (const item of items) {
    const parsed = parseSk(item.sk);
    if (!parsed) continue;
    const list = out[parsed.slug] ?? [];
    list.push(item);
    out[parsed.slug] = list;
  }
  // Sort each room's sets by setIndex ascending.
  for (const slug of Object.keys(out) as ThumbnailRoom[]) {
    out[slug]!.sort((a, b) => {
      const ai = parseSk(a.sk)?.setIndex ?? 0;
      const bi = parseSk(b.sk)?.setIndex ?? 0;
      return ai - bi;
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `npm run test -- tests/db/landing-picks.test.ts`
Expected: 3 getLandingPicks tests pass. Other tests in file may still fail — that's the next task.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/landing-picks.ts tests/db/landing-picks.test.ts
git commit -m "feat(landing-picks): parseSk + array-returning getLandingPicks for multi-set"
```

---

### Task 2: `upsertLandingPick(roomSlug, setIndex, input)` + `getNextSetIndex`

**Files:**
- Modify: `src/lib/db/landing-picks.ts`
- Modify: `tests/db/landing-picks.test.ts`

- [ ] **Step 1: Replace the existing `upsertLandingPick` describe block with setIndex-aware tests**

```typescript
describe('upsertLandingPick', () => {
  it('writes to ROOM#{slug}#{setIndex} sk', async () => {
    vi.mocked(dynamodb.send)
      .mockResolvedValueOnce({ Item: undefined } as never)
      .mockResolvedValueOnce({} as never);

    await upsertLandingPick('bedroom', 0, {
      enabled: true,
      picks: { Modern: 'm.jpg' },
      heroByStyle: { Modern: 'h.jpg' },
    });

    const get = vi.mocked(dynamodb.send).mock.calls[0][0] as GetCommand;
    expect(get.input.Key).toEqual({ pk: 'LANDING_PICK', sk: 'ROOM#bedroom#0' });

    const upd = vi.mocked(dynamodb.send).mock.calls[1][0] as UpdateCommand;
    expect(upd.input.Key).toEqual({ pk: 'LANDING_PICK', sk: 'ROOM#bedroom#0' });
    expect(upd.input.ExpressionAttributeValues?.[':enabled']).toBe(true);
    expect(upd.input.ExpressionAttributeValues?.[':picks']).toEqual({ Modern: 'm.jpg' });
  });

  it('writes to setIndex=2 when specified', async () => {
    vi.mocked(dynamodb.send)
      .mockResolvedValueOnce({ Item: undefined } as never)
      .mockResolvedValueOnce({} as never);

    await upsertLandingPick('bedroom', 2, { enabled: true });

    const upd = vi.mocked(dynamodb.send).mock.calls[1][0] as UpdateCommand;
    expect(upd.input.Key).toEqual({ pk: 'LANDING_PICK', sk: 'ROOM#bedroom#2' });
  });

  it('keeps existing fields when caller sends only enabled toggle', async () => {
    vi.mocked(dynamodb.send)
      .mockResolvedValueOnce({
        Item: {
          pk: 'LANDING_PICK', sk: 'ROOM#bedroom#0',
          enabled: true, picks: { Modern: 'm.jpg' },
          heroByStyle: { Modern: 'h.jpg' }, updatedAt: '2026-05-01T00:00:00Z',
        },
      } as never)
      .mockResolvedValueOnce({} as never);

    await upsertLandingPick('bedroom', 0, { enabled: false });

    const upd = vi.mocked(dynamodb.send).mock.calls[1][0] as UpdateCommand;
    expect(upd.input.ExpressionAttributeValues?.[':enabled']).toBe(false);
    expect(upd.input.ExpressionAttributeValues?.[':picks']).toEqual({ Modern: 'm.jpg' });
    expect(upd.input.ExpressionAttributeValues?.[':heroes']).toEqual({ Modern: 'h.jpg' });
  });
});

describe('getNextSetIndex', () => {
  it('returns 0 when no records exist for a room', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({ Items: [] } as never);
    expect(await getNextSetIndex('bedroom')).toBe(0);
  });

  it('returns lowest available index when there are gaps', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({
      Items: [
        { sk: 'ROOM#bedroom#0' },
        { sk: 'ROOM#bedroom#2' },
      ],
    } as never);
    expect(await getNextSetIndex('bedroom')).toBe(1);
  });

  it('returns next consecutive index when no gaps', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({
      Items: [
        { sk: 'ROOM#bedroom#0' },
        { sk: 'ROOM#bedroom#1' },
      ],
    } as never);
    expect(await getNextSetIndex('bedroom')).toBe(2);
  });

  it('treats legacy unsuffixed sk as setIndex 0', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({
      Items: [{ sk: 'ROOM#bedroom' }],
    } as never);
    expect(await getNextSetIndex('bedroom')).toBe(1);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npm run test -- tests/db/landing-picks.test.ts`
Expected: FAIL — `upsertLandingPick` arity wrong, `getNextSetIndex` undefined.

- [ ] **Step 3: Update `upsertLandingPick` and add `getNextSetIndex`**

Replace the existing `upsertLandingPick` function in `src/lib/db/landing-picks.ts` with:

```typescript
export async function upsertLandingPick(
  roomSlug: ThumbnailRoom,
  setIndex: number,
  input: UpsertLandingPickInput,
): Promise<void> {
  const sk = `${ROOM_SK_PREFIX}${roomSlug}#${setIndex}`;

  const existing = await dynamodb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: 'LANDING_PICK', sk },
  }));
  const prev = (existing.Item ?? null) as LandingPick | null;

  const nextPicks = input.picks ?? prev?.picks ?? {};
  const nextHeroes = input.heroByStyle ?? prev?.heroByStyle ?? {};
  const nextEnabled = input.enabled ?? prev?.enabled ?? false;
  const updatedAt = new Date().toISOString();

  await dynamodb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk: 'LANDING_PICK', sk },
    UpdateExpression:
      'SET enabled = :enabled, picks = :picks, heroByStyle = :heroes, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':enabled': nextEnabled,
      ':picks': nextPicks,
      ':heroes': nextHeroes,
      ':updatedAt': updatedAt,
    },
  }));
}

/**
 * Returns the lowest unused setIndex in [0, 10) for the given room. Used by
 * the admin picker when the user clicks "+ Add new". Indices stay stable
 * when a set is deleted — the next add fills the lowest gap.
 */
export async function getNextSetIndex(roomSlug: ThumbnailRoom): Promise<number> {
  const res = await dynamodb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: {
      ':pk': 'LANDING_PICK',
      ':sk': `${ROOM_SK_PREFIX}${roomSlug}`,
    },
    ProjectionExpression: 'sk',
  }));
  const used = new Set<number>();
  for (const item of res.Items ?? []) {
    const parsed = parseSk(item.sk as string);
    if (parsed && parsed.slug === roomSlug) used.add(parsed.setIndex);
  }
  for (let i = 0; i < 10; i++) {
    if (!used.has(i)) return i;
  }
  throw new Error(`Cannot add another set for ${roomSlug}: 10 already exist`);
}
```

- [ ] **Step 4: Update existing call sites that use the old `upsertLandingPick(roomSlug, input)` signature**

Run: `grep -rn "upsertLandingPick" src/ --include="*.ts" --include="*.tsx"`
Find every call. For each, change to `upsertLandingPick(roomSlug, 0, input)` for now. Will be fixed properly in Phase 5.

- [ ] **Step 5: Run, verify PASS**

Run: `npm run test -- tests/db/landing-picks.test.ts`
Expected: All getLandingPicks + upsertLandingPick + getNextSetIndex tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/landing-picks.ts tests/db/landing-picks.test.ts src/app/api/admin/landing-picks/route.ts
git commit -m "feat(landing-picks): upsertLandingPick takes setIndex; add getNextSetIndex"
```

---

### Task 3: `deleteLandingPick(roomSlug, setIndex)`

**Files:**
- Modify: `src/lib/db/landing-picks.ts`
- Modify: `tests/db/landing-picks.test.ts`

- [ ] **Step 1: Append failing test**

```typescript
import { deleteLandingPick } from '@/lib/db/landing-picks';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';

describe('deleteLandingPick', () => {
  it('deletes by sk = ROOM#{slug}#{setIndex}', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({} as never);
    await deleteLandingPick('bedroom', 1);
    const cmd = vi.mocked(dynamodb.send).mock.calls[0][0] as DeleteCommand;
    expect(cmd).toBeInstanceOf(DeleteCommand);
    expect(cmd.input.Key).toEqual({ pk: 'LANDING_PICK', sk: 'ROOM#bedroom#1' });
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npm run test -- tests/db/landing-picks.test.ts`
Expected: FAIL — `deleteLandingPick` undefined.

- [ ] **Step 3: Add `deleteLandingPick`**

Append to `src/lib/db/landing-picks.ts` (also add `DeleteCommand` to existing aws-sdk import):

```typescript
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';

export async function deleteLandingPick(
  roomSlug: ThumbnailRoom,
  setIndex: number,
): Promise<void> {
  await dynamodb.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { pk: 'LANDING_PICK', sk: `${ROOM_SK_PREFIX}${roomSlug}#${setIndex}` },
  }));
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npm run test -- tests/db/landing-picks.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/landing-picks.ts tests/db/landing-picks.test.ts
git commit -m "feat(landing-picks): add deleteLandingPick(roomSlug, setIndex)"
```

---

## Phase 2 — Slot-map updates

### Task 4: `mergeAllSlots` + `isRoomVisible`

**Files:**
- Modify: `src/lib/landing/slot-map.ts`
- Modify: `tests/lib/landing/slot-map.test.ts`

- [ ] **Step 1: Append tests**

```typescript
import { mergeAllSlots, isRoomVisible } from '@/lib/landing/slot-map';

describe('mergeAllSlots', () => {
  it('returns empty object when picks input is empty', () => {
    expect(mergeAllSlots({})).toEqual({});
  });

  it('produces one LandingSlot per fully-covered enabled set', () => {
    const allStyles = ['Modern','Scandinavian','Coastal','Hamptons','Luxury','Farmhouse','Mid-Century Modern','Industrial','Minimalist','Contemporary Australian','Japandi','Boho'];
    const fullPicks = Object.fromEntries(allStyles.map((s) => [s, `staged-${s}.jpg`]));
    const fullHeroes = Object.fromEntries(allStyles.map((s) => [s, `hero-${s}.jpg`]));

    const picks = {
      bedroom: [
        { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#0' as const, enabled: true,
          picks: fullPicks, heroByStyle: fullHeroes, updatedAt: '2026-05-02T00:00:00Z' },
        { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#1' as const, enabled: true,
          picks: fullPicks, heroByStyle: fullHeroes, updatedAt: '2026-05-02T00:00:00Z' },
      ],
    };
    const resolved: Record<string, string> = {};
    for (const s of allStyles) {
      resolved[`staged-${s}.jpg`] = `https://cdn/staged-${s}.jpg`;
      resolved[`hero-${s}.jpg`] = `https://cdn/hero-${s}.jpg`;
    }

    const out = mergeAllSlots(picks, resolved);
    expect(out.bedroom).toHaveLength(2);
    expect(out.bedroom?.[0].styles.Modern.src).toBe('https://cdn/staged-Modern.jpg');
  });

  it('drops disabled or partial sets but keeps the room if any set is visible', () => {
    const allStyles = ['Modern','Scandinavian','Coastal','Hamptons','Luxury','Farmhouse','Mid-Century Modern','Industrial','Minimalist','Contemporary Australian','Japandi','Boho'];
    const fullPicks = Object.fromEntries(allStyles.map((s) => [s, `s-${s}.jpg`]));
    const partialPicks = { Modern: 's-Modern.jpg' };
    const resolved: Record<string, string> = {};
    for (const s of allStyles) resolved[`s-${s}.jpg`] = `https://cdn/s-${s}.jpg`;

    const picks = {
      bedroom: [
        { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#0' as const, enabled: false,
          picks: fullPicks, updatedAt: '2026-05-02T00:00:00Z' },
        { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#1' as const, enabled: true,
          picks: partialPicks, updatedAt: '2026-05-02T00:00:00Z' },
        { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#2' as const, enabled: true,
          picks: fullPicks, updatedAt: '2026-05-02T00:00:00Z' },
      ],
    };
    const out = mergeAllSlots(picks, resolved);
    expect(out.bedroom).toHaveLength(1); // only set #2 survives
  });

  it('drops the room entirely when no set is visible', () => {
    const partial = { Modern: 's.jpg' };
    const picks = {
      bedroom: [
        { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#0' as const, enabled: false,
          picks: partial, updatedAt: '2026-05-02T00:00:00Z' },
      ],
    };
    const out = mergeAllSlots(picks, { 's.jpg': 'https://cdn/s.jpg' });
    expect(out.bedroom).toBeUndefined();
  });
});

describe('isRoomVisible', () => {
  it('returns false for empty array', () => {
    expect(isRoomVisible([])).toBe(false);
  });

  it('returns true when any set in the array is fully covered + enabled', () => {
    const allStyles = ['Modern','Scandinavian','Coastal','Hamptons','Luxury','Farmhouse','Mid-Century Modern','Industrial','Minimalist','Contemporary Australian','Japandi','Boho'];
    const fullPicks = Object.fromEntries(allStyles.map((s) => [s, `${s}.jpg`]));
    const sets = [
      { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#0' as const, enabled: false,
        picks: fullPicks, updatedAt: '2026-05-02T00:00:00Z' },
      { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#1' as const, enabled: true,
        picks: fullPicks, updatedAt: '2026-05-02T00:00:00Z' },
    ];
    expect(isRoomVisible(sets)).toBe(true);
  });

  it('returns false when every set is partial or disabled', () => {
    const sets = [
      { pk: 'LANDING_PICK' as const, sk: 'ROOM#bedroom#0' as const, enabled: true,
        picks: { Modern: 'm.jpg' }, updatedAt: '2026-05-02T00:00:00Z' },
    ];
    expect(isRoomVisible(sets)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `npm run test -- tests/lib/landing/slot-map.test.ts`
Expected: FAIL — `mergeAllSlots`, `isRoomVisible` undefined.

- [ ] **Step 3: Add the two helpers**

Append to `src/lib/landing/slot-map.ts`:

```typescript
/**
 * Apply mergeSlots to every set per room, drop nulls, drop empty rooms.
 * Used by the public-landing server shell to build the slotMap arrays.
 */
export function mergeAllSlots(
  picks: Partial<Record<ThumbnailRoom, LandingPick[]>>,
  resolved: Record<string, string> = {},
): Partial<Record<ThumbnailRoom, LandingSlot[]>> {
  const out: Partial<Record<ThumbnailRoom, LandingSlot[]>> = {};
  for (const slug of Object.keys(picks) as ThumbnailRoom[]) {
    const sets = picks[slug] ?? [];
    const slots: LandingSlot[] = [];
    for (const set of sets) {
      const slot = mergeSlots(set, resolved);
      if (slot) slots.push(slot);
    }
    if (slots.length > 0) out[slug] = slots;
  }
  return out;
}

/**
 * True when at least one set in the array is enabled and fully picked
 * (12 of 12 styles). Drives the public-landing pill switcher.
 */
export function isRoomVisible(sets: LandingPick[]): boolean {
  return sets.some((s) => isRoomFullyCovered(s));
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npm run test -- tests/lib/landing/slot-map.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing/slot-map.ts tests/lib/landing/slot-map.test.ts
git commit -m "feat(landing): mergeAllSlots and isRoomVisible for multi-set rooms"
```

---

## Phase 3 — Public landing

### Task 5: Update server shell to build slot ARRAYS per room

**Files:**
- Modify: `src/components/landing/style-showcase.tsx`

- [ ] **Step 1: Replace the body of `StyleShowcase()`**

In `src/components/landing/style-showcase.tsx`, change the imports and the function body to:

```typescript
import { getLandingPicks } from '@/lib/db/landing-picks';
import { mergeAllSlots, isRoomVisible, type LandingSlot } from '@/lib/landing/slot-map';
import { getPublicImageUrl } from '@/lib/aws/image-urls';
import type { ThumbnailRoom } from '@/components/staging/style-row';
import { StyleShowcaseClient } from './style-showcase-client';

const ROOM_SLUGS: readonly ThumbnailRoom[] = [
  'living', 'bedroom', 'dining-room', 'master-suite', 'kitchen', 'bathroom',
  'home-office', 'kids-room', 'studio', 'guest-room', 'outdoor', 'living-room',
] as const;

const PREFERRED_ORDER: readonly ThumbnailRoom[] = [
  'living-room', 'living', 'dining-room', 'bedroom', 'master-suite',
  'kitchen', 'bathroom', 'home-office', 'kids-room', 'studio',
  'guest-room', 'outdoor',
];

const HUMAN_LABELS: Record<ThumbnailRoom, string> = {
  'living': 'Living · Dining',
  'living-room': 'Living Room',
  'dining-room': 'Dining Room',
  'bedroom': 'Bedroom',
  'master-suite': 'Master Suite',
  'kitchen': 'Kitchen',
  'bathroom': 'Bathroom',
  'home-office': 'Home Office',
  'kids-room': 'Kids Room',
  'studio': 'Studio',
  'guest-room': 'Guest Room',
  'outdoor': 'Outdoor',
};

export async function StyleShowcase() {
  let picks: Awaited<ReturnType<typeof getLandingPicks>> = {};
  try {
    picks = await getLandingPicks();
  } catch {
    picks = {};
  }

  // Resolve every staged + hero S3 key from EVERY set.
  const keysToResolve = new Set<string>();
  for (const slug of ROOM_SLUGS) {
    const sets = picks[slug] ?? [];
    for (const p of sets) {
      for (const k of Object.values(p.picks ?? {})) if (k) keysToResolve.add(k);
      for (const k of Object.values(p.heroByStyle ?? {})) if (k) keysToResolve.add(k);
    }
  }
  const resolved: Record<string, string> = {};
  await Promise.all(
    [...keysToResolve].map(async (k) => {
      const url = await getPublicImageUrl(k);
      if (url) resolved[k] = url;
    }),
  );

  const slotMap = mergeAllSlots(picks, resolved);

  // visibleSlugs follows PREFERRED_ORDER, only including rooms with at least
  // one visible set.
  const visibleSlugs: ThumbnailRoom[] = [];
  for (const slug of PREFERRED_ORDER) {
    if (isRoomVisible(picks[slug] ?? [])) visibleSlugs.push(slug);
  }

  const availableRooms = visibleSlugs.map((slug) => ({
    slug,
    label: HUMAN_LABELS[slug],
  }));

  return <StyleShowcaseClient slotMap={slotMap} availableRooms={availableRooms} />;
}
```

- [ ] **Step 2: Verify type-check + build**

Run: `npm run type-check`
Expected: PASS — `style-showcase-client.tsx` will need its prop type updated next, but TypeScript won't catch the prop mismatch until the next task. The server file itself compiles.

Run: `npm run build`
Expected: May FAIL on `style-showcase-client.tsx` because the prop shape changed. That's OK — Task 6 fixes the client.

- [ ] **Step 3: Commit (with broken build expected — fixed in Task 6)**

```bash
git add src/components/landing/style-showcase.tsx
git commit -m "refactor(landing): server shell builds slot ARRAYS per room (multi-set step 1)"
```

---

### Task 6: Public client — `activeSetByRoom` state + dot navigation + swipe

**Files:**
- Modify: `src/components/landing/style-showcase-client.tsx`

- [ ] **Step 1: Read the existing file end-to-end**

Use the Read tool on `src/components/landing/style-showcase-client.tsx`. Note: the prop is currently `slotMap: Partial<Record<ThumbnailRoom, LandingSlot>>`. It now needs to become `LandingSlot[]`.

- [ ] **Step 2: Update the prop signature and state**

Change the function signature at the top of the component:

```typescript
export function StyleShowcaseClient({
  slotMap,
  availableRooms,
}: {
  slotMap: Partial<Record<ThumbnailRoom, LandingSlot[]>>;
  availableRooms: { slug: ThumbnailRoom; label: string }[];
}) {
  const [activeStyle, setActiveStyle] = useState<StagingStyle>('Modern');
  const [activeRoom, setActiveRoom] = useState<ThumbnailRoom>(
    availableRooms[0]?.slug ?? ('living-room' as ThumbnailRoom),
  );
  // Track the active set per room — dots navigation. Defaults to set 0.
  const [activeSetByRoom, setActiveSetByRoom] = useState<Partial<Record<ThumbnailRoom, number>>>({});
  // (keep existing notesByRoom + notesFetched state below — unchanged)
```

- [ ] **Step 3: Replace `activeSlot` resolution**

Find the line `const activeSlot = slotMap[activeRoom];` and replace it + the lines around it with:

```typescript
  const activeRoomSets = slotMap[activeRoom] ?? [];
  const activeSetIndex = Math.min(
    activeSetByRoom[activeRoom] ?? 0,
    Math.max(0, activeRoomSets.length - 1),
  );
  const activeSlot = activeRoomSets[activeSetIndex];
  const setCount = activeRoomSets.length;
  // Soft-fail if no slot
  if (!activeSlot) return null;
```

(The rest of the file's `activeStyleSlot`, `previewSrc`, `heroSrc`, `canCompare`, `comboKey`, etc. should still resolve from `activeSlot` correctly without changes.)

- [ ] **Step 4: Add the dot navigation inside the preview wrapper**

Find the `<div ref={previewRef} className="md:col-span-6">` block. Inside the `<motion.div key={comboKey} ...>` wrapper, AFTER the slider/static-image render but BEFORE the closing `</motion.div>`, add the dot row:

```tsx
{setCount > 1 && (
  <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/30 backdrop-blur-sm rounded-full px-2.5 py-1.5 z-10">
    {Array.from({ length: setCount }, (_, i) => {
      const isActive = i === activeSetIndex;
      return (
        <button
          key={i}
          type="button"
          onClick={() => setActiveSetByRoom((prev) => ({ ...prev, [activeRoom]: i }))}
          aria-label={`View set ${i + 1} of ${setCount}`}
          aria-pressed={isActive}
          className={cn(
            'rounded-full transition-all',
            isActive ? 'size-2.5 bg-white' : 'size-2 bg-white/55 hover:bg-white/85',
          )}
        />
      );
    })}
  </div>
)}
```

For this to position correctly, also confirm the parent container has `position: relative`. The motion.div wraps the `BeforeAfterSlider` / static image; both render into a `relative` container or one of their wrappers. Ensure the dot row is a sibling of the image inside a `relative` parent. If needed, wrap the inner render in:

```tsx
<div className="relative">
  {/* slider or static image */}
  {/* dot row from above */}
</div>
```

- [ ] **Step 5: Add touch-swipe handler on the preview area**

After the `useEffect` block for `notesFetched`, add a swipe-detect effect:

```typescript
  // Touch-swipe between sets on the preview area. Activates only when a room
  // has more than one set; otherwise no-op.
  useEffect(() => {
    if (setCount <= 1) return;
    const el = previewRef.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    function onStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    }
    function onEnd(e: TouchEvent) {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Horizontal-dominant swipe ≥ 50px
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        setActiveSetByRoom((prev) => {
          const cur = prev[activeRoom] ?? 0;
          const next = dx < 0 ? Math.min(cur + 1, setCount - 1) : Math.max(cur - 1, 0);
          return { ...prev, [activeRoom]: next };
        });
      }
    }
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
    };
  }, [activeRoom, setCount]);
```

- [ ] **Step 6: Verify build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/landing/style-showcase-client.tsx
git commit -m "feat(landing): activeSetByRoom + dot nav + swipe in showcase preview"
```

---

## Phase 4 — Server endpoints

### Task 7: POST `/api/admin/landing-picks` accepts `setIndex`

**Files:**
- Modify: `src/app/api/admin/landing-picks/route.ts`
- Modify: `tests/api/admin-landing-picks.test.ts`

- [ ] **Step 1: Update the test for setIndex param**

Replace the third test in `tests/api/admin-landing-picks.test.ts` ("upserts and revalidates / on success") and add a 400-on-out-of-range test:

```typescript
  it('upserts at the requested setIndex and revalidates', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    const { dynamodb } = await import('@/lib/aws/dynamodb');
    vi.mocked(dynamodb.send).mockResolvedValueOnce({
      Items: [{ stagedS3Key: 'tenants/a/m.jpg', heroS3Key: 'tenants/a/h.jpg' }],
    } as never);

    const res = await POST(makeReq({
      roomSlug: 'bedroom',
      setIndex: 2,
      enabled: true,
      picks: { Modern: 'tenants/a/m.jpg' },
    }));
    expect(res.status).toBe(200);
    expect(upsertLandingPick).toHaveBeenCalledWith('bedroom', 2, {
      enabled: true,
      picks: { Modern: 'tenants/a/m.jpg' },
      heroByStyle: { Modern: 'tenants/a/h.jpg' },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/');
  });

  it('defaults setIndex to 0 when omitted (legacy clients)', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    const { dynamodb } = await import('@/lib/aws/dynamodb');
    vi.mocked(dynamodb.send).mockResolvedValueOnce({ Items: [] } as never);

    await POST(makeReq({
      roomSlug: 'bedroom', enabled: true, picks: {},
    }));
    expect(upsertLandingPick).toHaveBeenCalledWith('bedroom', 0, expect.anything());
  });

  it('returns 400 when setIndex is out of range', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    const res = await POST(makeReq({
      roomSlug: 'bedroom', setIndex: 99, enabled: true,
    }));
    expect(res.status).toBe(400);
    expect(upsertLandingPick).not.toHaveBeenCalled();
  });
```

(The "ignores client-sent heroByStyle" test should also have its `expect(upsertLandingPick).toHaveBeenCalledWith` updated to include `0` as the second arg.)

- [ ] **Step 2: Run, verify FAIL**

Run: `npm run test -- tests/api/admin-landing-picks.test.ts`
Expected: FAIL — `upsertLandingPick` calls don't include setIndex.

- [ ] **Step 3: Update the route handler**

In `src/app/api/admin/landing-picks/route.ts`, change the `Body` interface and POST body to:

```typescript
interface Body {
  roomSlug: string;
  setIndex?: number;
  enabled?: boolean;
  picks?: Record<string, string>;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!body.roomSlug || !(ROOM_SLUGS as readonly string[]).includes(body.roomSlug)) {
    return NextResponse.json({ error: 'invalid roomSlug' }, { status: 400 });
  }
  const setIndex = body.setIndex ?? 0;
  if (!Number.isInteger(setIndex) || setIndex < 0 || setIndex >= 10) {
    return NextResponse.json({ error: 'setIndex out of range' }, { status: 400 });
  }
  const heroByStyle = body.picks
    ? await resolveHeroByStyle(session.user.id, body.picks)
    : undefined;
  await upsertLandingPick(body.roomSlug as ThumbnailRoom, setIndex, {
    enabled: body.enabled,
    picks: body.picks,
    heroByStyle,
  });
  revalidatePath('/');
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npm run test -- tests/api/admin-landing-picks.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/landing-picks/route.ts tests/api/admin-landing-picks.test.ts
git commit -m "feat(api): POST landing-picks accepts setIndex (default 0)"
```

---

### Task 8: DELETE `/api/admin/landing-picks?roomSlug=&setIndex=`

**Files:**
- Modify: `src/app/api/admin/landing-picks/route.ts`
- Modify: `tests/api/admin-landing-picks.test.ts`

- [ ] **Step 1: Append failing tests**

```typescript
import { deleteLandingPick } from '@/lib/db/landing-picks';
// (the existing vi.mock for '@/lib/db/landing-picks' already lists upsertLandingPick;
//  extend it to include deleteLandingPick: vi.fn())

describe('DELETE /api/admin/landing-picks', () => {
  it('returns 403 for non-admin', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'u1', email: 'someone@x.com' },
    } as never);
    const req = new Request('http://x/api/admin/landing-picks?roomSlug=bedroom&setIndex=1', { method: 'DELETE' });
    const res = await DELETE(req);
    expect(res.status).toBe(403);
    expect(deleteLandingPick).not.toHaveBeenCalled();
  });

  it('deletes by roomSlug + setIndex and revalidates /', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    const req = new Request('http://x/api/admin/landing-picks?roomSlug=bedroom&setIndex=1', { method: 'DELETE' });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    expect(deleteLandingPick).toHaveBeenCalledWith('bedroom', 1);
    expect(revalidatePath).toHaveBeenCalledWith('/');
  });

  it('returns 400 when roomSlug or setIndex missing', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    const req = new Request('http://x/api/admin/landing-picks?roomSlug=bedroom', { method: 'DELETE' });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });
});
```

(Remember to also import `DELETE` from the route file at the top of the test.)

- [ ] **Step 2: Run, verify FAIL**

Run: `npm run test -- tests/api/admin-landing-picks.test.ts`
Expected: FAIL — `DELETE` not exported.

- [ ] **Step 3: Add the DELETE handler**

Append to `src/app/api/admin/landing-picks/route.ts`:

```typescript
import { upsertLandingPick, deleteLandingPick } from '@/lib/db/landing-picks';
// (replace the existing single-import line above)

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const roomSlug = url.searchParams.get('roomSlug');
  const setIndexStr = url.searchParams.get('setIndex');
  if (!roomSlug || !(ROOM_SLUGS as readonly string[]).includes(roomSlug)) {
    return NextResponse.json({ error: 'invalid roomSlug' }, { status: 400 });
  }
  if (setIndexStr === null) {
    return NextResponse.json({ error: 'setIndex required' }, { status: 400 });
  }
  const setIndex = Number(setIndexStr);
  if (!Number.isInteger(setIndex) || setIndex < 0 || setIndex >= 10) {
    return NextResponse.json({ error: 'setIndex out of range' }, { status: 400 });
  }
  await deleteLandingPick(roomSlug as ThumbnailRoom, setIndex);
  revalidatePath('/');
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `npm run test -- tests/api/admin-landing-picks.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/landing-picks/route.ts tests/api/admin-landing-picks.test.ts
git commit -m "feat(api): DELETE /api/admin/landing-picks?roomSlug=&setIndex="
```

---

## Phase 5 — Admin picker UI (sub-tabs + Add + Delete)

### Task 9: Read existing client + plan local-state migration

**Files:**
- Read-only: `src/app/admin/landing-images/landing-images-client.tsx`

- [ ] **Step 1: Read the entire existing client file**

Use the Read tool. Note especially:
- `picks` state shape: `Partial<Record<ThumbnailRoom, LandingPick>>`
- `draftPicks`, `draftHeroes`, `draftEnabled` — drive the active room's pending edits
- The `useEffect` that resets drafts when `activeRoom` changes
- The `save()` callback — POSTs to `/api/admin/landing-picks`
- The viewer modal at the bottom

The transformation needed:
- `picks` becomes `Partial<Record<ThumbnailRoom, LandingPick[]>>` (matching the new `getLandingPicks` return shape)
- Add `activeSetByRoom: Partial<Record<ThumbnailRoom, number>>` state
- `setsByRoom` derived from picks (just an alias really)
- Drafts operate on the active room's active set
- `+ Add new` creates a local-only set (not yet in `picks`); first save persists
- Per-set `× Delete` button calls DELETE then removes from local state

- [ ] **Step 2: No commit — this is a read/understand task**

Skip committing.

---

### Task 10: Update admin client — sub-tabs, +Add, ×Delete, draft sync

**Files:**
- Modify: `src/app/admin/landing-images/landing-images-client.tsx`

This is one big task because all the changes are entangled in the same component. Read the file first, then apply the changes below in order.

- [ ] **Step 1: Update the props type and the component opening**

Change the props interface to:

```typescript
export function LandingImagesClient({
  roomSlugs,
  initialPicks,
}: {
  roomSlugs: ThumbnailRoom[];
  initialPicks: Partial<Record<ThumbnailRoom, LandingPick[]>>;
}) {
```

(The server shell at `src/app/admin/landing-images/page.tsx` will need its prop forwarding updated too — see Step 7 below.)

- [ ] **Step 2: Replace the state declarations at the top of the function body**

```typescript
  const [picks, setPicks] = useState(initialPicks);
  const [activeRoom, setActiveRoom] = useState<ThumbnailRoom>(roomSlugs[0]);
  const [activeSetIndexByRoom, setActiveSetIndexByRoom] = useState<Partial<Record<ThumbnailRoom, number>>>({});
  // Local-only drafts for sets that haven't been saved yet (after +Add).
  // Keyed by `${roomSlug}#${setIndex}`. Cleared on first successful save.
  const [draftSets, setDraftSets] = useState<Record<string, LandingPick>>({});
  const [candidates, setCandidates] = useState<CandidatesResponse | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [saving, setSaving] = useState(false);

  // Combined sets list per room: persisted picks + local drafts (sorted by setIndex).
  const setsForActiveRoom = useMemo(() => {
    const persisted = picks[activeRoom] ?? [];
    const drafts = Object.values(draftSets).filter((s) => s.sk.startsWith(`ROOM#${activeRoom}#`));
    const all = [...persisted, ...drafts];
    return all.sort((a, b) => parseSetIndex(a.sk) - parseSetIndex(b.sk));
  }, [picks, draftSets, activeRoom]);

  const activeSetIndex = activeSetIndexByRoom[activeRoom] ?? 0;
  const activeSet = setsForActiveRoom.find((s) => parseSetIndex(s.sk) === activeSetIndex);

  const [draftPicks, setDraftPicks] = useState<Partial<Record<StagingStyle, string>>>(activeSet?.picks ?? {});
  const [draftHeroes, setDraftHeroes] = useState<Partial<Record<StagingStyle, string>>>(activeSet?.heroByStyle ?? {});
  const [draftEnabled, setDraftEnabled] = useState<boolean>(activeSet?.enabled ?? false);

  const [viewerStyle, setViewerStyle] = useState<StagingStyle | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Re-sync drafts when the active room or active setIndex changes.
  useEffect(() => {
    setDraftPicks(activeSet?.picks ?? {});
    setDraftHeroes(activeSet?.heroByStyle ?? {});
    setDraftEnabled(activeSet?.enabled ?? false);
  }, [activeRoom, activeSetIndex, activeSet]);

  // Fetch candidates for the active room (unchanged behaviour from v1).
  useEffect(() => {
    setLoadingCandidates(true);
    fetch(`/api/admin/landing-picks/candidates?room=${activeRoom}`)
      .then((r) => r.json())
      .then(setCandidates)
      .finally(() => setLoadingCandidates(false));
  }, [activeRoom]);
```

Also add at the top of the file (outside the component):

```typescript
function parseSetIndex(sk: string): number {
  const m = sk.match(/#(\d+)$/);
  return m ? Number(m[1]) : 0;
}
```

- [ ] **Step 3: Update `save()` to POST with setIndex and clear matching draft**

```typescript
  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/landing-picks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roomSlug: activeRoom,
          setIndex: activeSetIndex,
          enabled: draftEnabled,
          picks: draftPicks,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      const updated: LandingPick = {
        pk: 'LANDING_PICK',
        sk: `ROOM#${activeRoom}#${activeSetIndex}`,
        enabled: draftEnabled,
        picks: draftPicks,
        heroByStyle: draftHeroes,
        updatedAt: new Date().toISOString(),
      };
      setPicks((prev) => {
        const list = prev[activeRoom] ?? [];
        const without = list.filter((p) => parseSetIndex(p.sk) !== activeSetIndex);
        return { ...prev, [activeRoom]: [...without, updated].sort((a, b) => parseSetIndex(a.sk) - parseSetIndex(b.sk)) };
      });
      // First-save promotes a draft to persisted; clear the draft entry.
      setDraftSets((d) => {
        const k = `ROOM#${activeRoom}#${activeSetIndex}`;
        if (!(k in d)) return d;
        const next = { ...d };
        delete next[k];
        return next;
      });
      toast.success('Landing updated', {
        description: 'Refresh / in a private window to see picks live.',
      });
    } catch {
      toast.error('Save failed — try again');
    } finally {
      setSaving(false);
    }
  }, [activeRoom, activeSetIndex, draftEnabled, draftPicks, draftHeroes]);
```

- [ ] **Step 4: Add `addNewSet()` and `deleteSet()` handlers**

```typescript
  function nextAvailableSetIndex(): number {
    const used = new Set(setsForActiveRoom.map((s) => parseSetIndex(s.sk)));
    for (let i = 0; i < 10; i++) if (!used.has(i)) return i;
    return -1;
  }

  function addNewSet() {
    const idx = nextAvailableSetIndex();
    if (idx === -1) {
      toast.error('Maximum 10 sets per room');
      return;
    }
    const sk = `ROOM#${activeRoom}#${idx}` as `ROOM#${string}`;
    setDraftSets((d) => ({
      ...d,
      [sk]: {
        pk: 'LANDING_PICK',
        sk,
        enabled: false,
        picks: {},
        heroByStyle: {},
        updatedAt: new Date().toISOString(),
      },
    }));
    setActiveSetIndexByRoom((prev) => ({ ...prev, [activeRoom]: idx }));
  }

  const [confirmingDelete, setConfirmingDelete] = useState<{ slug: ThumbnailRoom; setIndex: number } | null>(null);

  async function deleteSet(slug: ThumbnailRoom, setIndex: number) {
    // Local-only draft? Just drop from state.
    const draftKey = `ROOM#${slug}#${setIndex}`;
    if (draftSets[draftKey]) {
      setDraftSets((d) => {
        const n = { ...d };
        delete n[draftKey];
        return n;
      });
      setActiveSetIndexByRoom((prev) => ({ ...prev, [slug]: 0 }));
      setConfirmingDelete(null);
      return;
    }
    // Persisted — call DELETE endpoint.
    try {
      const res = await fetch(`/api/admin/landing-picks?roomSlug=${slug}&setIndex=${setIndex}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setPicks((prev) => {
        const list = prev[slug] ?? [];
        return { ...prev, [slug]: list.filter((p) => parseSetIndex(p.sk) !== setIndex) };
      });
      setActiveSetIndexByRoom((prev) => ({ ...prev, [slug]: 0 }));
      toast.success(`Set ${setIndex + 1} deleted`);
    } catch {
      toast.error('Delete failed — try again');
    } finally {
      setConfirmingDelete(null);
    }
  }
```

- [ ] **Step 5: Add the sub-tab row right after the room pill row (before the existing "Enable" checkbox)**

```tsx
{/* Sub-tab row — sets within the active room */}
<div className="mt-4 flex flex-wrap items-center gap-1">
  {setsForActiveRoom.map((s) => {
    const idx = parseSetIndex(s.sk);
    const isActive = idx === activeSetIndex;
    const isDraft = !!draftSets[s.sk];
    return (
      <div key={s.sk} className="relative group">
        <button
          type="button"
          onClick={() => setActiveSetIndexByRoom((prev) => ({ ...prev, [activeRoom]: idx }))}
          className={cn(
            'px-3 h-8 rounded-md text-sm font-medium border transition-colors flex items-center gap-2',
            isActive
              ? 'bg-brand-navy text-white border-brand-navy'
              : 'bg-white text-brand-navy border-surface-border hover:bg-surface-secondary',
          )}
        >
          Set {idx + 1}
          {isDraft && <span className="text-[10px] uppercase tracking-wider opacity-70">draft</span>}
        </button>
        <button
          type="button"
          onClick={() => setConfirmingDelete({ slug: activeRoom, setIndex: idx })}
          aria-label={`Delete set ${idx + 1}`}
          className="absolute -top-1 -right-1 size-4 rounded-full bg-brand-coral text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          ×
        </button>
      </div>
    );
  })}
  <button
    type="button"
    onClick={addNewSet}
    className="px-3 h-8 rounded-md text-sm font-medium border border-dashed border-surface-border text-brand-navy/70 hover:bg-surface-secondary transition-colors"
  >
    + Add new
  </button>
</div>
```

(The `cn` import probably isn't yet in this file; add `import { cn } from '@/lib/utils/cn';` at the top.)

- [ ] **Step 6: Add the in-app delete-confirm modal at the bottom of the JSX (next to the existing viewer modal)**

```tsx
{confirmingDelete && (
  <div
    className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    onClick={() => setConfirmingDelete(null)}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-elevated"
    >
      <h3 className="font-heading text-lg text-brand-navy">
        Delete Set {confirmingDelete.setIndex + 1}?
      </h3>
      <p className="mt-2 text-sm text-ink-secondary">
        This removes the set from the public landing immediately. Your individual stagings are not deleted.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setConfirmingDelete(null)}
          className="px-4 h-10 rounded-lg border border-surface-border text-sm font-medium text-brand-navy hover:bg-surface-secondary"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => deleteSet(confirmingDelete.slug, confirmingDelete.setIndex)}
          className="px-4 h-10 rounded-lg bg-brand-coral text-white text-sm font-bold hover:opacity-90"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 7: Update the server shell to forward arrays**

In `src/app/admin/landing-images/page.tsx`, the prop forwarded to `<LandingImagesClient>` is `initialPicks={picks}`. Since `getLandingPicks` now returns arrays, no code change needed at the call site — TypeScript carries the new shape through. Run `npm run type-check` to confirm.

- [ ] **Step 8: Verify build**

Run: `npm run type-check && npm run build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/admin/landing-images/landing-images-client.tsx src/app/admin/landing-images/page.tsx
git commit -m "feat(admin): sub-tabs + Add + Delete for multi-set landing picker"
```

---

## Phase 6 — Smoke

### Task 11: Manual smoke test on live site

**Files:** none (smoke checklist only)

- [ ] **Step 1: Final build + test pass**

Run: `npm run test`
Expected: All landing-pick test files green; pre-existing batch-job test failures are unrelated.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 2: Push**

```bash
git push origin master
```

Wait for Amplify build (~3 min).

- [ ] **Step 3: Smoke walkthrough**

1. Open `/admin/landing-images`. Click Bedroom (or any room with existing picks).
2. Sub-tab row should appear: `Set 1` (your existing set, persisted) + `+ Add new`.
3. Click `+ Add new`. New `Set 2` tab appears with "draft" label, empty 12-style grid.
4. Pick 12 styles via the Browse modal, tick "Enable", Save. Toast confirms. The "draft" label disappears.
5. Refresh the public landing (`/?cachebust=v3` to skip CDN). Bedroom showcase should now show `● ●` dots in the bottom-right of the preview image.
6. Click the second dot. Preview swaps to your new set. Click back to first dot — preview swaps back.
7. On mobile: same dots, plus horizontal swipe also navigates between sets.
8. Back in admin, hover Set 2's tab → small × appears. Click it. In-app modal asks confirm. Confirm → set deleted, dots disappear from public landing on next refresh.
9. Verify legacy single-set rooms (Studio, Living Room, Dining Room) still render exactly as today — no dots, just one preview.

- [ ] **Step 4: Mark plan complete if smoke passes**

```bash
echo "Multi-set landing rooms shipped."
```

---

## Self-review against spec

- ✅ Schema with `ROOM#{slug}#{setIndex}` + legacy compat → Tasks 1, 2, 3
- ✅ `mergeAllSlots` + `isRoomVisible` → Task 4
- ✅ Public landing dots + swipe → Tasks 5, 6
- ✅ Admin sub-tabs + Add + Delete + in-app confirm → Tasks 9, 10
- ✅ Server `setIndex` validation + DELETE endpoint → Tasks 7, 8
- ✅ Backward-compat read of legacy `ROOM#{slug}` → Task 1's `parseSk` fallback
- ✅ Server-side `heroByStyle` resolution preserved → Task 7 keeps `resolveHeroByStyle` call
- ✅ Tests at every layer → Tasks 1-4, 7, 8
- ✅ Smoke walkthrough → Task 11
