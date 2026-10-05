# Admin Landing Image Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/admin/landing-images` so Tara can curate the public landing's hero room + per-style staged images per room type, with picks stored in DynamoDB and the landing reading them at request time (existing local JPGs remain a per-slot fallback).

**Architecture:** New DynamoDB record per room (`pk='LANDING_PICK', sk='ROOM#{slug}'`) stores `enabled`, `originalS3Key`, and a `picks` map of `style → stagedS3Key`. The public landing's `StyleShowcase` is refactored into a server-component shell that fetches picks and computes a merged slot map, passing the result to a client interactive child. Picked stagings render via signed S3 URLs (long TTL); a small per-thumbnail client wrapper falls back to the local JPG on `<img onError>`. Admin UI is a single page with three zones (room pills → hero picker → per-style grid).

**Tech Stack:** Next.js 14 App Router (React Server Components), TypeScript, DynamoDB single-table (`stageright`), AWS SDK v3 (`@aws-sdk/lib-dynamodb`, `@aws-sdk/s3-request-presigner`), Vitest with `vi.mock` of `@/lib/aws/dynamodb`, Tailwind CSS.

**Files (create):**
- `src/lib/db/landing-picks.ts` — DDB helpers + `LandingPick` type
- `src/lib/aws/image-urls.ts` — `getPublicImageUrl(s3Key)` helper
- `src/lib/landing/slot-map.ts` — pure merge logic (picks + fallback → slot map; visibility rule)
- `src/components/landing/landing-thumbnail.tsx` — small client component, `<img>` with `onError` fallback
- `src/components/landing/style-showcase-client.tsx` — interactive child holding pill state + render
- `src/app/api/admin/landing-picks/route.ts` — POST upsert
- `src/app/api/admin/landing-picks/candidates/route.ts` — GET candidates per room
- `src/app/admin/landing-images/page.tsx` — server component shell
- `src/app/admin/landing-images/landing-images-client.tsx` — client UI (three zones)
- `tests/db/landing-picks.test.ts`, `tests/lib/landing-slot-map.test.ts`, `tests/api/admin-landing-picks.test.ts`, `tests/api/admin-landing-picks-candidates.test.ts`

**Files (modify):**
- `src/components/landing/style-showcase.tsx` — drop `'use client'`, become server-component shell calling `getLandingPicks` + `mergeSlots`, render `<StyleShowcaseClient slotMap={...} />`
- `src/app/admin/layout.tsx` — add nav link to `/admin/landing-images`

---

## Phase 1 — Data layer (types + DynamoDB helpers)

### Task 1: `LandingPick` type + `getLandingPicks()` reader

**Files:**
- Create: `src/lib/db/landing-picks.ts`
- Test: `tests/db/landing-picks.test.ts`

- [ ] **Step 1: Write the failing test for `getLandingPicks`**

```typescript
// tests/db/landing-picks.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: vi.fn(async () => ({})) },
  TABLE_NAME: 'stageright',
}));

import { getLandingPicks } from '@/lib/db/landing-picks';
import { dynamodb } from '@/lib/aws/dynamodb';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

beforeEach(() => { vi.clearAllMocks(); });

describe('getLandingPicks', () => {
  it('queries pk=LANDING_PICK and returns a record-keyed map', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({
      Items: [
        { pk: 'LANDING_PICK', sk: 'ROOM#bedroom', enabled: true, originalS3Key: 'tenants/a/h.jpg', picks: { Modern: 'tenants/a/m.jpg' }, updatedAt: '2026-04-29T00:00:00Z' },
        { pk: 'LANDING_PICK', sk: 'ROOM#kitchen', enabled: false, picks: {}, updatedAt: '2026-04-29T00:00:00Z' },
      ],
    } as never);

    const result = await getLandingPicks();
    expect(result.bedroom?.enabled).toBe(true);
    expect(result.bedroom?.originalS3Key).toBe('tenants/a/h.jpg');
    expect(result.bedroom?.picks.Modern).toBe('tenants/a/m.jpg');
    expect(result.kitchen?.enabled).toBe(false);

    const cmd = vi.mocked(dynamodb.send).mock.calls[0][0] as QueryCommand;
    expect(cmd).toBeInstanceOf(QueryCommand);
    expect(cmd.input.KeyConditionExpression).toBe('pk = :pk');
    expect(cmd.input.ExpressionAttributeValues?.[':pk']).toBe('LANDING_PICK');
  });

  it('returns empty object when no records', async () => {
    vi.mocked(dynamodb.send).mockResolvedValueOnce({ Items: [] } as never);
    const result = await getLandingPicks();
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/db/landing-picks.test.ts`
Expected: FAIL with `Cannot find module '@/lib/db/landing-picks'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/db/landing-picks.ts
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import type { StagingStyle } from '@/lib/ai/prompts';
import type { ThumbnailRoom } from '@/components/staging/style-row';

export interface LandingPick {
  pk: 'LANDING_PICK';
  sk: `ROOM#${string}`;
  enabled: boolean;
  originalS3Key?: string;
  picks: Partial<Record<StagingStyle, string>>;
  updatedAt: string;
}

const ROOM_SK_PREFIX = 'ROOM#';

function slugFromSk(sk: string): ThumbnailRoom {
  return sk.slice(ROOM_SK_PREFIX.length) as ThumbnailRoom;
}

export async function getLandingPicks(): Promise<Partial<Record<ThumbnailRoom, LandingPick>>> {
  const res = await dynamodb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': 'LANDING_PICK' },
  }));
  const items = (res.Items ?? []) as LandingPick[];
  const out: Partial<Record<ThumbnailRoom, LandingPick>> = {};
  for (const item of items) {
    out[slugFromSk(item.sk)] = item;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/db/landing-picks.test.ts`
Expected: PASS, both tests green

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/landing-picks.ts tests/db/landing-picks.test.ts
git commit -m "feat(landing-picks): add LandingPick type and getLandingPicks reader"
```

---

### Task 2: `upsertLandingPick()` writer with hero-change → clear picks rule

**Files:**
- Modify: `src/lib/db/landing-picks.ts`
- Test: `tests/db/landing-picks.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test**

Append to `tests/db/landing-picks.test.ts`:

```typescript
import { upsertLandingPick } from '@/lib/db/landing-picks';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

describe('upsertLandingPick', () => {
  it('writes a new room record with merged fields when none exists', async () => {
    vi.mocked(dynamodb.send)
      .mockResolvedValueOnce({ Item: undefined } as never) // GetCommand
      .mockResolvedValueOnce({} as never);                  // UpdateCommand

    await upsertLandingPick('bedroom', {
      enabled: true,
      originalS3Key: 'tenants/a/h.jpg',
      picks: { Modern: 'tenants/a/m.jpg' },
    });

    const get = vi.mocked(dynamodb.send).mock.calls[0][0] as GetCommand;
    expect(get).toBeInstanceOf(GetCommand);
    expect(get.input.Key).toEqual({ pk: 'LANDING_PICK', sk: 'ROOM#bedroom' });

    const upd = vi.mocked(dynamodb.send).mock.calls[1][0] as UpdateCommand;
    expect(upd).toBeInstanceOf(UpdateCommand);
    expect(upd.input.ExpressionAttributeValues?.[':enabled']).toBe(true);
    expect(upd.input.ExpressionAttributeValues?.[':original']).toBe('tenants/a/h.jpg');
    expect(upd.input.ExpressionAttributeValues?.[':picks']).toEqual({ Modern: 'tenants/a/m.jpg' });
  });

  it('clears picks when originalS3Key changes from existing record', async () => {
    vi.mocked(dynamodb.send)
      .mockResolvedValueOnce({
        Item: {
          pk: 'LANDING_PICK',
          sk: 'ROOM#bedroom',
          enabled: true,
          originalS3Key: 'tenants/a/old-hero.jpg',
          picks: { Modern: 'tenants/a/old-modern.jpg', Coastal: 'tenants/a/old-coastal.jpg' },
          updatedAt: '2026-04-28T00:00:00Z',
        },
      } as never)
      .mockResolvedValueOnce({} as never);

    await upsertLandingPick('bedroom', { originalS3Key: 'tenants/a/new-hero.jpg' });

    const upd = vi.mocked(dynamodb.send).mock.calls[1][0] as UpdateCommand;
    expect(upd.input.ExpressionAttributeValues?.[':original']).toBe('tenants/a/new-hero.jpg');
    expect(upd.input.ExpressionAttributeValues?.[':picks']).toEqual({});
  });

  it('preserves existing picks when originalS3Key is unchanged', async () => {
    vi.mocked(dynamodb.send)
      .mockResolvedValueOnce({
        Item: {
          pk: 'LANDING_PICK',
          sk: 'ROOM#bedroom',
          enabled: true,
          originalS3Key: 'tenants/a/h.jpg',
          picks: { Modern: 'tenants/a/m.jpg' },
          updatedAt: '2026-04-28T00:00:00Z',
        },
      } as never)
      .mockResolvedValueOnce({} as never);

    await upsertLandingPick('bedroom', { picks: { Coastal: 'tenants/a/c.jpg' } });

    const upd = vi.mocked(dynamodb.send).mock.calls[1][0] as UpdateCommand;
    // Picks merged: existing Modern + new Coastal
    expect(upd.input.ExpressionAttributeValues?.[':picks']).toEqual({
      Modern: 'tenants/a/m.jpg',
      Coastal: 'tenants/a/c.jpg',
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- tests/db/landing-picks.test.ts`
Expected: FAIL — `upsertLandingPick` not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/db/landing-picks.ts`:

```typescript
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { ThumbnailRoom } from '@/components/staging/style-row';

export interface UpsertLandingPickInput {
  enabled?: boolean;
  originalS3Key?: string;
  picks?: Partial<Record<StagingStyle, string>>;
}

export async function upsertLandingPick(
  roomSlug: ThumbnailRoom,
  input: UpsertLandingPickInput,
): Promise<void> {
  const sk = `${ROOM_SK_PREFIX}${roomSlug}` as const;

  const existing = await dynamodb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: 'LANDING_PICK', sk },
  }));
  const prev = (existing.Item ?? null) as LandingPick | null;

  // Hero changed → clear picks. Otherwise merge new picks onto existing.
  let nextPicks: Partial<Record<StagingStyle, string>>;
  const heroChanged =
    input.originalS3Key !== undefined &&
    prev?.originalS3Key !== undefined &&
    input.originalS3Key !== prev.originalS3Key;
  if (heroChanged) {
    nextPicks = {};
  } else {
    nextPicks = { ...(prev?.picks ?? {}), ...(input.picks ?? {}) };
  }

  const nextEnabled = input.enabled ?? prev?.enabled ?? false;
  const nextOriginal = input.originalS3Key ?? prev?.originalS3Key;
  const updatedAt = new Date().toISOString();

  await dynamodb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk: 'LANDING_PICK', sk },
    UpdateExpression:
      'SET enabled = :enabled, picks = :picks, updatedAt = :updatedAt' +
      (nextOriginal !== undefined ? ', originalS3Key = :original' : ''),
    ExpressionAttributeValues: {
      ':enabled': nextEnabled,
      ':picks': nextPicks,
      ':updatedAt': updatedAt,
      ...(nextOriginal !== undefined ? { ':original': nextOriginal } : {}),
    },
  }));
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npm run test -- tests/db/landing-picks.test.ts`
Expected: PASS, all five tests green

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/landing-picks.ts tests/db/landing-picks.test.ts
git commit -m "feat(landing-picks): add upsertLandingPick with hero-change clears-picks rule"
```

---

## Phase 2 — Image URL helper

### Task 3: `getPublicImageUrl(s3Key)` for picked stagings

**Files:**
- Create: `src/lib/aws/image-urls.ts`
- Test: `tests/lib/image-urls.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/image-urls.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(async () => 'https://signed.example/image.jpg?expires=...'),
}));
vi.mock('@/lib/aws/s3', () => ({
  s3: {},
  BUCKET_NAME: 'stageright-images',
}));

import { getPublicImageUrl } from '@/lib/aws/image-urls';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

beforeEach(() => { vi.clearAllMocks(); });

describe('getPublicImageUrl', () => {
  it('returns a signed S3 URL with a long TTL for landing display', async () => {
    const url = await getPublicImageUrl('tenants/a/staged-modern.jpg');
    expect(url).toBe('https://signed.example/image.jpg?expires=...');
    const args = vi.mocked(getSignedUrl).mock.calls[0];
    // Third arg: { expiresIn: <seconds> }. Should be at least 7 days.
    const opts = args[2] as { expiresIn: number };
    expect(opts.expiresIn).toBeGreaterThanOrEqual(60 * 60 * 24 * 7);
  });

  it('returns null for an empty/undefined key', async () => {
    expect(await getPublicImageUrl(undefined)).toBeNull();
    expect(await getPublicImageUrl('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- tests/lib/image-urls.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```typescript
// src/lib/aws/image-urls.ts
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3, BUCKET_NAME } from '@/lib/aws/s3';

const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;

/**
 * Public-readable URL for an S3 image, suitable for embedding in the public
 * landing page. Today this returns a signed URL with a 7-day TTL — long
 * enough that ISR-cached landing renders don't expire mid-session, short
 * enough that a deleted/rotated key invalidates within a week. If/when
 * CloudFront with OAI is wired up for the bucket, swap this implementation
 * to return `https://<distribution>/<key>` directly.
 */
export async function getPublicImageUrl(s3Key: string | undefined): Promise<string | null> {
  if (!s3Key) return null;
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key }),
    { expiresIn: SEVEN_DAYS_SECONDS },
  );
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npm run test -- tests/lib/image-urls.test.ts`
Expected: PASS, both tests green

- [ ] **Step 5: Commit**

```bash
git add src/lib/aws/image-urls.ts tests/lib/image-urls.test.ts
git commit -m "feat(aws): add getPublicImageUrl signed-url helper for landing"
```

---

## Phase 3 — Slot-map merge logic + visibility rule

### Task 4: Pure `mergeSlots` function (picks + fallback → slot map)

**Files:**
- Create: `src/lib/landing/slot-map.ts`
- Test: `tests/lib/landing-slot-map.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/landing-slot-map.test.ts
import { describe, it, expect } from 'vitest';
import { mergeSlots, type LandingSlot } from '@/lib/landing/slot-map';

describe('mergeSlots', () => {
  it('returns empty for a room with no picks and no fallback list entry', () => {
    const out = mergeSlots('kitchen', undefined, false);
    expect(out).toBeNull();
  });

  it('uses local fallback when room is in legacy list and no pick exists', () => {
    const out = mergeSlots('bedroom', undefined, true);
    expect(out?.heroSrc).toBe('/style-thumbnails/bedroom/_original.jpg');
    expect(out?.styles.Modern.src).toBe('/style-thumbnails/bedroom/modern.jpg');
    expect(out?.styles.Modern.fallback).toBe('/style-thumbnails/bedroom/modern.jpg');
    expect(out?.styles.Modern.fromPick).toBe(false);
  });

  it('uses pick-derived URLs when both pick and legacy fallback exist', () => {
    const pick = {
      pk: 'LANDING_PICK' as const,
      sk: 'ROOM#bedroom' as const,
      enabled: true,
      originalS3Key: 'tenants/a/hero.jpg',
      picks: { Modern: 'tenants/a/staged-modern.jpg' },
      updatedAt: '2026-04-29T00:00:00Z',
    };
    const resolved = {
      'tenants/a/hero.jpg': 'https://cdn/hero.jpg',
      'tenants/a/staged-modern.jpg': 'https://cdn/modern.jpg',
    };
    const out = mergeSlots('bedroom', pick, true, resolved);
    expect(out?.heroSrc).toBe('https://cdn/hero.jpg');
    expect(out?.styles.Modern.src).toBe('https://cdn/modern.jpg');
    expect(out?.styles.Modern.fromPick).toBe(true);
    // Style without a pick still falls back to local
    expect(out?.styles.Coastal.src).toBe('/style-thumbnails/bedroom/coastal.jpg');
    expect(out?.styles.Coastal.fromPick).toBe(false);
  });

  it('respects enabled=false: returns null even with picks', () => {
    const pick = {
      pk: 'LANDING_PICK' as const,
      sk: 'ROOM#bedroom' as const,
      enabled: false,
      originalS3Key: 'tenants/a/hero.jpg',
      picks: { Modern: 'tenants/a/m.jpg' },
      updatedAt: '2026-04-29T00:00:00Z',
    };
    expect(mergeSlots('bedroom', pick, true)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- tests/lib/landing-slot-map.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```typescript
// src/lib/landing/slot-map.ts
import type { LandingPick } from '@/lib/db/landing-picks';
import type { ThumbnailRoom } from '@/components/staging/style-row';
import { STAGING_STYLES, styleToFilename, type StagingStyle } from '@/lib/ai/prompts';

export interface LandingStyleSlot {
  src: string;       // primary URL the <img> should load
  fallback: string;  // local JPG path to swap to onError
  fromPick: boolean; // true if src came from an admin pick
}

export interface LandingSlot {
  heroSrc: string;
  heroFallback: string;
  styles: Record<StagingStyle, LandingStyleSlot>;
}

function localStyleSrc(roomSlug: ThumbnailRoom, style: StagingStyle): string {
  return `/style-thumbnails/${roomSlug}/${styleToFilename(style)}.jpg`;
}

function localHeroSrc(roomSlug: ThumbnailRoom): string {
  return `/style-thumbnails/${roomSlug}/_original.jpg`;
}

/**
 * Compute the slot map for a single room. Returns null if the room should
 * NOT appear on the landing pill switcher (rule: must be enabled in pick OR
 * present in legacy list).
 *
 * @param resolved - Map of S3 key → resolved public URL. Pre-computed by
 *   the caller (server component) so this function stays pure.
 */
export function mergeSlots(
  roomSlug: ThumbnailRoom,
  pick: LandingPick | undefined,
  inLegacyList: boolean,
  resolved: Record<string, string> = {},
): LandingSlot | null {
  // Disabled pick → not visible.
  if (pick && pick.enabled === false) return null;

  // No pick AND not in legacy list → not visible.
  if (!pick && !inLegacyList) return null;

  const heroFallback = localHeroSrc(roomSlug);
  const heroSrc = pick?.originalS3Key ? resolved[pick.originalS3Key] ?? heroFallback : heroFallback;

  const styles: Record<StagingStyle, LandingStyleSlot> = {} as Record<StagingStyle, LandingStyleSlot>;
  for (const style of STAGING_STYLES) {
    const fallback = localStyleSrc(roomSlug, style);
    const pickedKey = pick?.picks?.[style];
    if (pickedKey && resolved[pickedKey]) {
      styles[style] = { src: resolved[pickedKey], fallback, fromPick: true };
    } else {
      styles[style] = { src: fallback, fallback, fromPick: false };
    }
  }
  return { heroSrc, heroFallback, styles };
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npm run test -- tests/lib/landing-slot-map.test.ts`
Expected: PASS, all four tests green

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing/slot-map.ts tests/lib/landing-slot-map.test.ts
git commit -m "feat(landing): pure mergeSlots merging picks + legacy fallback"
```

---

### Task 5: Visibility rule — `isRoomFullyCovered`

**Files:**
- Modify: `src/lib/landing/slot-map.ts`
- Test: `tests/lib/landing-slot-map.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/lib/landing-slot-map.test.ts`:

```typescript
import { isRoomFullyCovered } from '@/lib/landing/slot-map';

describe('isRoomFullyCovered', () => {
  it('returns true when room is in legacy list (assume 12 local JPGs exist)', () => {
    expect(isRoomFullyCovered('bedroom', undefined, true)).toBe(true);
  });

  it('returns true when pick has all 12 styles regardless of legacy list', () => {
    const allStyles = ['Modern','Scandinavian','Coastal','Hamptons','Luxury','Farmhouse','Mid-Century Modern','Industrial','Minimalist','Contemporary Australian','Japandi','Boho'];
    const picks = Object.fromEntries(allStyles.map((s) => [s, `tenants/a/${s}.jpg`]));
    const pick = {
      pk: 'LANDING_PICK' as const,
      sk: 'ROOM#kitchen' as const,
      enabled: true,
      originalS3Key: 'tenants/a/hero.jpg',
      picks,
      updatedAt: '2026-04-29T00:00:00Z',
    };
    expect(isRoomFullyCovered('kitchen', pick, false)).toBe(true);
  });

  it('returns false when pick has only some styles and not in legacy list', () => {
    const pick = {
      pk: 'LANDING_PICK' as const,
      sk: 'ROOM#kitchen' as const,
      enabled: true,
      originalS3Key: 'tenants/a/hero.jpg',
      picks: { Modern: 'tenants/a/m.jpg' },
      updatedAt: '2026-04-29T00:00:00Z',
    };
    expect(isRoomFullyCovered('kitchen', pick, false)).toBe(false);
  });

  it('returns false when pick is disabled even with full coverage', () => {
    const allStyles = ['Modern','Scandinavian','Coastal','Hamptons','Luxury','Farmhouse','Mid-Century Modern','Industrial','Minimalist','Contemporary Australian','Japandi','Boho'];
    const picks = Object.fromEntries(allStyles.map((s) => [s, `tenants/a/${s}.jpg`]));
    const pick = {
      pk: 'LANDING_PICK' as const,
      sk: 'ROOM#kitchen' as const,
      enabled: false,
      originalS3Key: 'tenants/a/hero.jpg',
      picks,
      updatedAt: '2026-04-29T00:00:00Z',
    };
    expect(isRoomFullyCovered('kitchen', pick, false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- tests/lib/landing-slot-map.test.ts`
Expected: FAIL — `isRoomFullyCovered` not exported

- [ ] **Step 3: Implement**

Append to `src/lib/landing/slot-map.ts`:

```typescript
export function isRoomFullyCovered(
  roomSlug: ThumbnailRoom,
  pick: LandingPick | undefined,
  inLegacyList: boolean,
): boolean {
  if (pick) {
    if (!pick.enabled) return false;
    const allStyles: StagingStyle[] = [...STAGING_STYLES];
    return allStyles.every((s) => Boolean(pick.picks?.[s]));
  }
  // No pick: rely on legacy list (which is curated to only contain
  // rooms with all 12 local JPGs present per AVAILABLE_ROOMS contract).
  return inLegacyList;
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npm run test -- tests/lib/landing-slot-map.test.ts`
Expected: PASS, eight tests total green

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing/slot-map.ts tests/lib/landing-slot-map.test.ts
git commit -m "feat(landing): isRoomFullyCovered visibility rule for pill switcher"
```

---

## Phase 4 — Refactor `StyleShowcase` into server shell + client child

### Task 6: Per-thumbnail client wrapper with onError fallback

**Files:**
- Create: `src/components/landing/landing-thumbnail.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/landing/landing-thumbnail.tsx
'use client';

import { useState } from 'react';

interface LandingThumbnailProps {
  src: string;
  fallback: string;
  alt: string;
  className?: string;
}

/**
 * Server-resolved <img> with onError fallback to a local JPG. Used for
 * landing thumbnails so a deleted picked staging never leaves a broken
 * icon on the public site.
 */
export function LandingThumbnail({ src, fallback, alt, className }: LandingThumbnailProps) {
  const [current, setCurrent] = useState(src);
  const [erroredOnce, setErroredOnce] = useState(false);
  return (
    <img
      src={current}
      alt={alt}
      className={className}
      onError={() => {
        if (!erroredOnce && current !== fallback) {
          setErroredOnce(true);
          setCurrent(fallback);
        }
      }}
    />
  );
}
```

- [ ] **Step 2: Verify build compiles**

Run: `npm run type-check`
Expected: PASS, no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/components/landing/landing-thumbnail.tsx
git commit -m "feat(landing): LandingThumbnail with onError fallback wrapper"
```

---

### Task 7: Split `StyleShowcase` — extract client child

**Files:**
- Create: `src/components/landing/style-showcase-client.tsx`
- Modify: `src/components/landing/style-showcase.tsx`

- [ ] **Step 1: Read the current `StyleShowcase` and verify shape**

Run: `cat src/components/landing/style-showcase.tsx`
Expected: starts with `'use client';`, exports a client component with `useState` for `activeStyle` + `activeRoom`.

- [ ] **Step 2: Move the existing client logic into `style-showcase-client.tsx` verbatim, accepting a `slotMap` prop**

```tsx
// src/components/landing/style-showcase-client.tsx
'use client';

// Move the FULL contents of the current style-showcase.tsx into this file
// EXCEPT the AVAILABLE_ROOMS const (it stays in the server shell, see Task 8).
// Replace the export name from `StyleShowcase` to `StyleShowcaseClient`, and
// accept the following props:
//
//   { slotMap: Partial<Record<ThumbnailRoom, LandingSlot>>;
//     availableRooms: { slug: ThumbnailRoom; label: string }[]; }
//
// Inside the component, replace every `/style-thumbnails/${slug}/${style}.jpg`
// hardcoded src with a lookup into `slotMap[slug]?.styles[style]?.src` and
// pass that through `<LandingThumbnail />` for the onError fallback.
// Replace `/style-thumbnails/${slug}/_original.jpg` references with
// `slotMap[slug]?.heroSrc`.
//
// Importantly: keep all motion / pill-switching / state behaviour exactly
// as it was. The ONLY change is the source of the image URLs.
```

(The implementing engineer reads the current file's actual lines and adapts them. Image src lookups become `slotMap` reads, everything else preserved.)

- [ ] **Step 3: Replace `style-showcase.tsx` with a server-component shell**

```tsx
// src/components/landing/style-showcase.tsx
import { getLandingPicks } from '@/lib/db/landing-picks';
import { mergeSlots, isRoomFullyCovered, type LandingSlot } from '@/lib/landing/slot-map';
import { getPublicImageUrl } from '@/lib/aws/image-urls';
import { ROOM_SLUGS, type ThumbnailRoom } from '@/components/staging/style-row';
import { StyleShowcaseClient } from './style-showcase-client';

// Legacy room list — rooms that have all 12 local JPGs already on disk and
// were surfaced before the admin picker existed. These remain visible on
// the landing without needing any LANDING_PICK record. New rooms must be
// enabled and fully picked via /admin/landing-images to appear.
const LEGACY_AVAILABLE_ROOMS: { slug: ThumbnailRoom; label: string }[] = [
  { slug: 'living-room', label: 'Living Room' },
  { slug: 'living', label: 'Living · Dining' },
  { slug: 'dining-room', label: 'Dining Room' },
  { slug: 'bedroom', label: 'Bedroom' },
  { slug: 'kids-room', label: 'Kids Room' },
  { slug: 'guest-room', label: 'Guest Room' },
];

export async function StyleShowcase() {
  let picks: Awaited<ReturnType<typeof getLandingPicks>> = {};
  try {
    picks = await getLandingPicks();
  } catch {
    // DDB read failure → fall through to legacy list with empty picks.
    picks = {};
  }

  // Resolve all S3 keys to public URLs in a single pass.
  const keysToResolve = new Set<string>();
  for (const slug of ROOM_SLUGS) {
    const p = picks[slug];
    if (!p) continue;
    if (p.originalS3Key) keysToResolve.add(p.originalS3Key);
    for (const k of Object.values(p.picks ?? {})) {
      if (k) keysToResolve.add(k);
    }
  }
  const resolved: Record<string, string> = {};
  await Promise.all(
    [...keysToResolve].map(async (k) => {
      const url = await getPublicImageUrl(k);
      if (url) resolved[k] = url;
    }),
  );

  // Build the visible-rooms list + slot map.
  const legacySlugs = new Set(LEGACY_AVAILABLE_ROOMS.map((r) => r.slug));
  const slotMap: Partial<Record<ThumbnailRoom, LandingSlot>> = {};
  const availableRooms: { slug: ThumbnailRoom; label: string }[] = [];

  // Preserve legacy order first.
  for (const r of LEGACY_AVAILABLE_ROOMS) {
    if (!isRoomFullyCovered(r.slug, picks[r.slug], true)) continue;
    const slot = mergeSlots(r.slug, picks[r.slug], true, resolved);
    if (slot) {
      slotMap[r.slug] = slot;
      availableRooms.push(r);
    }
  }
  // Then admin-enabled rooms not in the legacy list.
  for (const slug of ROOM_SLUGS) {
    if (legacySlugs.has(slug)) continue;
    const p = picks[slug];
    if (!isRoomFullyCovered(slug, p, false)) continue;
    const slot = mergeSlots(slug, p, false, resolved);
    if (slot) {
      slotMap[slug] = slot;
      availableRooms.push({ slug, label: humanLabelFor(slug) });
    }
  }

  return <StyleShowcaseClient slotMap={slotMap} availableRooms={availableRooms} />;
}

function humanLabelFor(slug: ThumbnailRoom): string {
  return slug
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}
```

- [ ] **Step 4: Verify build + type-check + smoke**

Run: `npm run type-check && npm run build`
Expected: PASS. The landing builds; `StyleShowcase` is now a server async function.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/style-showcase-client.tsx src/components/landing/style-showcase.tsx
git commit -m "refactor(landing): split StyleShowcase into server shell + client child reading slotMap"
```

---

## Phase 5 — Candidates API

### Task 8: `GET /api/admin/landing-picks/candidates?room=<slug>`

**Files:**
- Create: `src/app/api/admin/landing-picks/candidates/route.ts`
- Test: `tests/api/admin-landing-picks-candidates.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/admin-landing-picks-candidates.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: vi.fn() },
  TABLE_NAME: 'stageright',
}));
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));
vi.mock('@/types', async () => {
  const actual = await vi.importActual<typeof import('@/types')>('@/types');
  return { ...actual, ADMIN_EMAILS: ['admin@example.com'] };
});

import { GET } from '@/app/api/admin/landing-picks/candidates/route';
import { getSession } from '@/lib/auth/session';
import { dynamodb } from '@/lib/aws/dynamodb';

beforeEach(() => { vi.clearAllMocks(); });

function makeReq(url: string) {
  return new Request(url);
}

describe('GET /api/admin/landing-picks/candidates', () => {
  it('returns 403 for non-admin', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'u1', email: 'someone@x.com' },
    } as never);
    const res = await GET(makeReq('http://x/?room=bedroom'));
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid room slug', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    const res = await GET(makeReq('http://x/?room=garage'));
    expect(res.status).toBe(400);
  });

  it('queries admin stagings filtered to room and returns grouped heroes + stagings', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    vi.mocked(dynamodb.send).mockResolvedValueOnce({
      Items: [
        { heroS3Key: 'h1', stagedS3Key: 's1m', style: 'Modern', roomTypes: ['Bedroom'], createdAt: '2026-04-29T01:00:00Z' },
        { heroS3Key: 'h1', stagedS3Key: 's1c', style: 'Coastal', roomTypes: ['Bedroom'], createdAt: '2026-04-29T02:00:00Z' },
        { heroS3Key: 'h2', stagedS3Key: 's2m', style: 'Modern', roomTypes: ['Bedroom'], createdAt: '2026-04-29T03:00:00Z' },
      ],
    } as never);

    const res = await GET(makeReq('http://x/?room=bedroom'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.heroes).toHaveLength(2);
    // latest-first ordering
    expect(body.heroes[0].s3Key).toBe('h2');
    expect(body.heroes[1].s3Key).toBe('h1');
    expect(body.stagings).toHaveLength(3);
    expect(body.stagings[0]).toMatchObject({ heroS3Key: 'h2', style: 'Modern', stagedS3Key: 's2m' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- tests/api/admin-landing-picks-candidates.test.ts`
Expected: FAIL — route module not found

- [ ] **Step 3: Implement**

```typescript
// src/app/api/admin/landing-picks/candidates/route.ts
import { NextResponse } from 'next/server';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';
import { ROOM_SLUGS, type ThumbnailRoom } from '@/components/staging/style-row';

const ROOM_LABELS: Record<ThumbnailRoom, string> = {
  'living': 'Living + Dining',
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

interface Candidate {
  heroS3Key: string;
  style: string;
  stagedS3Key: string;
  createdAt: string;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const room = url.searchParams.get('room') as ThumbnailRoom | null;
  if (!room || !(ROOM_SLUGS as readonly string[]).includes(room)) {
    return NextResponse.json({ error: 'invalid room slug' }, { status: 400 });
  }
  const label = ROOM_LABELS[room];

  const res = await dynamodb.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    FilterExpression: 'contains(roomTypes, :r)',
    ExpressionAttributeNames: { '#s': 'style' },
    ExpressionAttributeValues: {
      ':pk': `USER#${session.user.id}`,
      ':sk': 'STAGING#',
      ':r': label,
    },
    ProjectionExpression: 'heroS3Key, stagedS3Key, #s, createdAt',
  }));

  const items = (res.Items ?? []) as Candidate[];
  // Latest-first by createdAt.
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // Unique heroes, latest createdAt wins for the listed timestamp.
  const heroMap = new Map<string, string>();
  for (const it of items) {
    if (!heroMap.has(it.heroS3Key)) heroMap.set(it.heroS3Key, it.createdAt);
  }
  const heroes = [...heroMap.entries()].map(([s3Key, createdAt]) => ({ s3Key, createdAt }));

  return NextResponse.json({ heroes, stagings: items });
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npm run test -- tests/api/admin-landing-picks-candidates.test.ts`
Expected: PASS, all three tests green

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/landing-picks/candidates/route.ts tests/api/admin-landing-picks-candidates.test.ts
git commit -m "feat(api): GET /api/admin/landing-picks/candidates lists admin's hero + staging options"
```

---

## Phase 6 — Save API + revalidate

### Task 9: `POST /api/admin/landing-picks`

**Files:**
- Create: `src/app/api/admin/landing-picks/route.ts`
- Test: `tests/api/admin-landing-picks.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/admin-landing-picks.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/landing-picks', () => ({
  upsertLandingPick: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));
vi.mock('@/types', async () => {
  const actual = await vi.importActual<typeof import('@/types')>('@/types');
  return { ...actual, ADMIN_EMAILS: ['admin@example.com'] };
});

import { POST } from '@/app/api/admin/landing-picks/route';
import { getSession } from '@/lib/auth/session';
import { upsertLandingPick } from '@/lib/db/landing-picks';
import { revalidatePath } from 'next/cache';

beforeEach(() => { vi.clearAllMocks(); });

function makeReq(body: unknown) {
  return new Request('http://x/api/admin/landing-picks', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/admin/landing-picks', () => {
  it('returns 403 for non-admin', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'u1', email: 'someone@x.com' },
    } as never);
    const res = await POST(makeReq({ roomSlug: 'bedroom', enabled: true }));
    expect(res.status).toBe(403);
    expect(upsertLandingPick).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid roomSlug', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    const res = await POST(makeReq({ roomSlug: 'garage', enabled: true }));
    expect(res.status).toBe(400);
  });

  it('upserts and revalidates / on success', async () => {
    vi.mocked(getSession).mockResolvedValueOnce({
      user: { id: 'a1', email: 'admin@example.com' },
    } as never);
    const res = await POST(makeReq({
      roomSlug: 'bedroom',
      enabled: true,
      originalS3Key: 'tenants/a/h.jpg',
      picks: { Modern: 'tenants/a/m.jpg' },
    }));
    expect(res.status).toBe(200);
    expect(upsertLandingPick).toHaveBeenCalledWith('bedroom', {
      enabled: true,
      originalS3Key: 'tenants/a/h.jpg',
      picks: { Modern: 'tenants/a/m.jpg' },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test -- tests/api/admin-landing-picks.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```typescript
// src/app/api/admin/landing-picks/route.ts
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';
import { upsertLandingPick } from '@/lib/db/landing-picks';
import { ROOM_SLUGS, type ThumbnailRoom } from '@/components/staging/style-row';

interface Body {
  roomSlug: string;
  enabled?: boolean;
  originalS3Key?: string;
  picks?: Record<string, string>;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
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
  await upsertLandingPick(body.roomSlug as ThumbnailRoom, {
    enabled: body.enabled,
    originalS3Key: body.originalS3Key,
    picks: body.picks,
  });
  revalidatePath('/');
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run to verify passing**

Run: `npm run test -- tests/api/admin-landing-picks.test.ts`
Expected: PASS, three tests green

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/landing-picks/route.ts tests/api/admin-landing-picks.test.ts
git commit -m "feat(api): POST /api/admin/landing-picks upsert + revalidate /"
```

---

## Phase 7 — Admin picker UI

### Task 10: Admin picker page (server shell)

**Files:**
- Create: `src/app/admin/landing-images/page.tsx`

- [ ] **Step 1: Write the server-component shell**

```tsx
// src/app/admin/landing-images/page.tsx
import { getLandingPicks } from '@/lib/db/landing-picks';
import { ROOM_SLUGS } from '@/components/staging/style-row';
import { LandingImagesClient } from './landing-images-client';

export const dynamic = 'force-dynamic';

export default async function LandingImagesPage() {
  const picks = await getLandingPicks();
  return (
    <main className="mx-auto max-w-[1400px] px-4 sm:px-6 py-8">
      <header className="mb-8">
        <h1 className="font-heading text-3xl text-brand-navy tracking-tight">
          Landing images
        </h1>
        <p className="mt-2 text-[15px] text-ink-secondary max-w-2xl">
          Curate which empty room and which staged variant per style appears
          on the public landing page. Saves take effect on the live site within
          seconds — no deploy required.
        </p>
      </header>
      <LandingImagesClient roomSlugs={[...ROOM_SLUGS]} initialPicks={picks} />
    </main>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run type-check`
Expected: PASS (note: client file doesn't exist yet — TS will complain. Create stub first.)

- [ ] **Step 3: Stub the client to satisfy types**

```tsx
// src/app/admin/landing-images/landing-images-client.tsx
'use client';
import type { LandingPick } from '@/lib/db/landing-picks';
import type { ThumbnailRoom } from '@/components/staging/style-row';

export function LandingImagesClient({
  roomSlugs,
  initialPicks,
}: {
  roomSlugs: ThumbnailRoom[];
  initialPicks: Partial<Record<ThumbnailRoom, LandingPick>>;
}) {
  return <div>landing-images-client (Task 11 fills this in)</div>;
}
```

- [ ] **Step 4: Type-check + commit**

Run: `npm run type-check`
Expected: PASS

```bash
git add src/app/admin/landing-images/page.tsx src/app/admin/landing-images/landing-images-client.tsx
git commit -m "feat(admin): /admin/landing-images server shell + client stub"
```

---

### Task 11: Admin picker client UI — three zones

**Files:**
- Modify: `src/app/admin/landing-images/landing-images-client.tsx`

- [ ] **Step 1: Implement the three-zone interactive UI**

```tsx
// src/app/admin/landing-images/landing-images-client.tsx
'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import type { LandingPick } from '@/lib/db/landing-picks';
import type { ThumbnailRoom } from '@/components/staging/style-row';
import { STAGING_STYLES, type StagingStyle } from '@/lib/ai/prompts';

interface CandidatesResponse {
  heroes: { s3Key: string; createdAt: string }[];
  stagings: { heroS3Key: string; style: string; stagedS3Key: string; createdAt: string }[];
}

const HUMAN_LABELS: Record<ThumbnailRoom, string> = {
  'living': 'Living + Dining', 'living-room': 'Living Room', 'dining-room': 'Dining Room',
  'bedroom': 'Bedroom', 'master-suite': 'Master Suite', 'kitchen': 'Kitchen',
  'bathroom': 'Bathroom', 'home-office': 'Home Office', 'kids-room': 'Kids Room',
  'studio': 'Studio', 'guest-room': 'Guest Room', 'outdoor': 'Outdoor',
};

function countPicks(p: LandingPick | undefined): number {
  if (!p?.picks) return 0;
  return STAGING_STYLES.filter((s) => p.picks?.[s]).length;
}

export function LandingImagesClient({
  roomSlugs,
  initialPicks,
}: {
  roomSlugs: ThumbnailRoom[];
  initialPicks: Partial<Record<ThumbnailRoom, LandingPick>>;
}) {
  const [picks, setPicks] = useState(initialPicks);
  const [activeRoom, setActiveRoom] = useState<ThumbnailRoom>(roomSlugs[0]);
  const [candidates, setCandidates] = useState<CandidatesResponse | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [saving, setSaving] = useState(false);

  // Local working draft for the active room (not persisted until Save).
  const [draftHero, setDraftHero] = useState<string | undefined>(picks[activeRoom]?.originalS3Key);
  const [draftPicks, setDraftPicks] = useState<Partial<Record<StagingStyle, string>>>(
    picks[activeRoom]?.picks ?? {},
  );
  const [draftEnabled, setDraftEnabled] = useState<boolean>(picks[activeRoom]?.enabled ?? false);

  useEffect(() => {
    setDraftHero(picks[activeRoom]?.originalS3Key);
    setDraftPicks(picks[activeRoom]?.picks ?? {});
    setDraftEnabled(picks[activeRoom]?.enabled ?? false);
    setLoadingCandidates(true);
    fetch(`/api/admin/landing-picks/candidates?room=${activeRoom}`)
      .then((r) => r.json())
      .then(setCandidates)
      .finally(() => setLoadingCandidates(false));
  }, [activeRoom, picks]);

  function pickHero(key: string) {
    if (draftHero && draftHero !== key && Object.keys(draftPicks).length > 0) {
      // No native confirm() — banned by feedback_no_browser_native_dialogs.
      // Silently clear picks and surface the consequence via toast so the
      // admin sees what happened. The Save action is still required to
      // persist, so they can undo by clicking the previous hero.
      setDraftPicks({});
      toast.info('Style picks cleared — hero changed', {
        description: 'Pick variants again, or click your previous hero to undo.',
      });
    }
    setDraftHero(key);
  }

  function pickStyle(style: StagingStyle, key: string) {
    setDraftPicks((p) => ({ ...p, [style]: key }));
  }

  function clearStyle(style: StagingStyle) {
    setDraftPicks((p) => {
      const next = { ...p };
      delete next[style];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/landing-picks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roomSlug: activeRoom,
          enabled: draftEnabled,
          originalS3Key: draftHero,
          picks: draftPicks,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      const updated: LandingPick = {
        pk: 'LANDING_PICK',
        sk: `ROOM#${activeRoom}`,
        enabled: draftEnabled,
        originalS3Key: draftHero,
        picks: draftPicks,
        updatedAt: new Date().toISOString(),
      };
      setPicks((prev) => ({ ...prev, [activeRoom]: updated }));
      toast.success('Landing updated', {
        description: 'Refresh / in a private window to see the picks live.',
      });
    } catch {
      toast.error('Save failed — try again');
    } finally {
      setSaving(false);
    }
  }

  const stagingsForActiveHero = candidates?.stagings.filter(
    (s) => s.heroS3Key === draftHero,
  ) ?? [];

  return (
    <div className="space-y-8">
      {/* Zone 1: room pills */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-brand-teal mb-3">
          Rooms
        </h2>
        <div className="flex flex-wrap gap-2">
          {roomSlugs.map((slug) => {
            const p = picks[slug];
            const n = countPicks(p);
            const active = slug === activeRoom;
            return (
              <button
                key={slug}
                onClick={() => setActiveRoom(slug)}
                className={[
                  'px-3 h-9 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2',
                  active
                    ? 'bg-brand-navy text-white border-brand-navy'
                    : 'bg-white text-brand-navy border-surface-border hover:bg-surface-secondary',
                ].join(' ')}
              >
                <span>{HUMAN_LABELS[slug]}</span>
                <span className={['text-[11px] tabular-nums px-1.5 py-0.5 rounded', active ? 'bg-white/20' : 'bg-surface-secondary'].join(' ')}>
                  {n}/12
                </span>
                {p?.enabled === false && (
                  <span className="text-[11px] uppercase opacity-60">hidden</span>
                )}
              </button>
            );
          })}
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draftEnabled}
            onChange={(e) => setDraftEnabled(e.target.checked)}
          />
          Enable {HUMAN_LABELS[activeRoom]} on the public landing
        </label>
      </section>

      {/* Zone 2: hero picker */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-brand-teal mb-3">
          Empty room (hero)
        </h2>
        {loadingCandidates && <p className="text-sm text-ink-secondary">Loading…</p>}
        {!loadingCandidates && candidates && candidates.heroes.length === 0 && (
          <p className="text-sm text-ink-secondary">
            No stagings of {HUMAN_LABELS[activeRoom]} yet under this admin account. Stage one first via /stage.
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {candidates?.heroes.map((h) => {
            const selected = h.s3Key === draftHero;
            return (
              <button
                key={h.s3Key}
                onClick={() => pickHero(h.s3Key)}
                className={[
                  'aspect-[4/3] rounded-lg overflow-hidden border-2 bg-surface-secondary',
                  selected ? 'border-brand-teal' : 'border-transparent hover:border-surface-border',
                ].join(' ')}
              >
                <img src={`/api/admin/preview?key=${encodeURIComponent(h.s3Key)}`} alt="" className="w-full h-full object-cover" />
              </button>
            );
          })}
        </div>
      </section>

      {/* Zone 3: per-style grid */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-brand-teal mb-3">
          Styles
        </h2>
        {!draftHero && (
          <p className="text-sm text-ink-secondary">Pick an empty room above first.</p>
        )}
        {draftHero && (
          <div className="space-y-3">
            {STAGING_STYLES.map((style) => {
              const variants = stagingsForActiveHero.filter((s) => s.style === style);
              const picked = draftPicks[style];
              return (
                <div key={style} className="grid grid-cols-[160px_1fr] gap-4 items-start py-3 border-t border-surface-border">
                  <div className="pt-2">
                    <p className="font-medium text-brand-navy">{style}</p>
                    {picked && (
                      <button onClick={() => clearStyle(style)} className="mt-1 text-[12px] text-brand-coral hover:underline">
                        Clear pick
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {variants.length === 0 && (
                      <a
                        href={`/stage?hero=${encodeURIComponent(draftHero)}&style=${encodeURIComponent(style)}`}
                        className="inline-flex items-center px-3 h-9 rounded-lg bg-brand-teal text-white text-sm font-medium"
                      >
                        Stage it →
                      </a>
                    )}
                    {variants.map((v) => {
                      const selected = picked === v.stagedS3Key;
                      return (
                        <button
                          key={v.stagedS3Key}
                          onClick={() => pickStyle(style, v.stagedS3Key)}
                          className={[
                            'aspect-[4/3] w-32 rounded-lg overflow-hidden border-2 bg-surface-secondary',
                            selected ? 'border-brand-teal' : 'border-transparent hover:border-surface-border',
                          ].join(' ')}
                        >
                          <img src={`/api/admin/preview?key=${encodeURIComponent(v.stagedS3Key)}`} alt="" className="w-full h-full object-cover" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-white/90 backdrop-blur-sm border-t border-surface-border flex items-center justify-between">
        <p className="text-sm text-ink-secondary">
          {countPicks({ pk: 'LANDING_PICK', sk: `ROOM#${activeRoom}`, enabled: draftEnabled, originalS3Key: draftHero, picks: draftPicks, updatedAt: '' })}
          /12 styles picked for {HUMAN_LABELS[activeRoom]}
        </p>
        <button
          onClick={save}
          disabled={saving}
          className="px-5 h-10 rounded-lg bg-brand-navy text-white font-medium disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save & sync to landing'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the admin S3 preview endpoint (used by `<img>` thumbnails in the picker)**

Create `src/app/api/admin/preview/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { ADMIN_EMAILS } from '@/types';
import { getPublicImageUrl } from '@/lib/aws/image-urls';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'missing key' }, { status: 400 });
  const signed = await getPublicImageUrl(key);
  if (!signed) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.redirect(signed, 307);
}
```

- [ ] **Step 3: Verify build**

Run: `npm run type-check && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/landing-images/landing-images-client.tsx src/app/api/admin/preview/route.ts
git commit -m "feat(admin): three-zone landing-images picker UI + preview endpoint"
```

---

## Phase 8 — Admin nav link + smoke test

### Task 12: Add nav link in admin layout

**Files:**
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Add the link next to the existing admin nav entries**

```tsx
// In src/app/admin/layout.tsx, inside the existing <nav> bar, append AFTER
// the "Review queue" link:

<Link
  href="/admin/landing-images"
  className="px-3 h-8 rounded-md inline-flex items-center font-medium hover:bg-white/[0.08] transition-colors"
>
  Landing images
</Link>
```

- [ ] **Step 2: Verify build**

Run: `npm run type-check && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/layout.tsx
git commit -m "feat(admin): add Landing images link to admin nav"
```

---

### Task 13: End-to-end smoke test (manual)

**Files:** none (smoke checklist)

- [ ] **Step 1: Pre-deploy regression**

Run: `npm run build && npm run test`
Expected: Build succeeds. All tests green. Landing renders with the existing 6 rooms exactly as before because no `LANDING_PICK` records exist yet.

- [ ] **Step 2: Deploy to Amplify**

```bash
git push origin master
```

Wait for Amplify build (~3 min). Verify `/` still shows the existing 6 rooms with current thumbnails.

- [ ] **Step 3: Manual picker walk-through (admin account, on the live site)**

1. Sign in as an admin email.
2. Visit `/admin/landing-images` — page loads with all 12 room pills, all showing `0/12`.
3. Click `Bedroom`. Pill goes active. Hero picker shows all your unique empty bedrooms. Pick one.
4. For each of the 12 styles, pick a variant. The completion counter ticks up.
5. Tick "Enable Bedroom on the public landing".
6. Click "Save & sync to landing". Toast confirms. No errors.
7. Open `/` in a private window. Bedroom pill switcher still shows the legacy bedroom thumbnails (because a fully-covered legacy bedroom is preferred over picks; this is intentional — to switch to picks, just pick all 12 styles AND the legacy local JPGs are overridden because the slot map prefers picks over fallback when present).
8. Verify the bedroom shows your picked images on the landing.
9. Disable a previously-enabled custom room (e.g., Kitchen if you fully picked it earlier) — confirm it disappears from the pill switcher within seconds of save.

- [ ] **Step 4: If smoke passes, mark plan complete**

```bash
# No code commit needed. Plan is complete.
echo "Smoke test passed — admin landing image picker shipped."
```

---

## Self-review against spec

- ✅ Hierarchical hero + per-style picks → Tasks 4, 11
- ✅ All 12 room slugs as candidates → Task 11 uses `roomSlugs` from server
- ✅ Existing JPGs as fallback → Tasks 4 (mergeSlots), 6 (LandingThumbnail onError)
- ✅ Visibility rule (must be fully covered) → Task 5 + Task 7 server-shell filter
- ✅ Hero change clears picks → Task 2
- ✅ Save + revalidate → Task 9
- ✅ Admin auth gating → Tasks 8, 9 (session + ADMIN_EMAILS check)
- ✅ Onboarding/wizard untouched → no modifications to those files in any task
- ✅ Edge cases handled (DDB read fail, picked staging deleted, disabled room, image aspect drift) → Task 6 (onError), Task 7 (try/catch around getLandingPicks), Task 4 (enabled flag), inherited landing CSS
- ✅ Tests: unit for db, lib, api → Tasks 1, 2, 3, 4, 5, 8, 9
