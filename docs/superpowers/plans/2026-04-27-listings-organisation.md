# Listings Organisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional Listing layer between user and image so agents can organise stagings by property, and re-open any source upload to add more styles without re-uploading.

**Architecture:** One new DDB entity (`Listing`) under `USER#{userId}` with `sk = LISTING#{iso}#{ulid}`. One nullable field (`listingId`) added to existing `Staging` records — `null` means *Unsorted*. No `SourceUpload` entity; source uploads are grouped client-side by the existing `heroS3Key` (this grouping logic already exists in `/api/stagings`). Five new/modified API endpoints. Dashboard's flat gallery becomes a listings grid; new `/listings/[id]` and `/listings/[id]/source/[heroKeyHash]` pages render the existing `UploadGroup` shape filtered by listing. Wizard step 1 gets a Listing pill; wizard accepts `?listingId=` and `?heroS3Key=` deep-link params for "Add another style" flows.

**Tech Stack:** Next.js 14 App Router, TypeScript, DynamoDB single-table (`stageright`), `@aws-sdk/lib-dynamodb`, `ulid`, vitest for tests, `getSession()` for auth, existing `assertKeysAccessible` for S3 ownership checks. Lambda (`lambda/staging-worker/`) needs manual redeploy when modified — see CLAUDE.md "Deploying the staging-worker Lambda".

**Spec:** `docs/superpowers/specs/2026-04-27-listings-organisation-design.md`.

---

## File Structure

**Created:**
- `src/lib/db/listings.ts` — `Listing` interface + CRUD (`createListing`, `getUserListings`, `getListingById`, `updateListing`, `deleteListing`, `setListingCoverIfMissing`).
- `src/app/api/listings/route.ts` — `POST` (create), `GET` (list with counts).
- `src/app/api/listings/[id]/route.ts` — `GET` (single), `PATCH` (rename/address), `DELETE` (cascade-clears `listingId` on stagings).
- `src/lib/utils/hero-key-hash.ts` — short stable hash (`hashHeroKey(s3Key)` + `findHeroByHash(stagings, hash)`).
- `src/components/dashboard/listings-grid.tsx` — listings grid (Unsorted-first).
- `src/components/staging/listing-pill.tsx` — wizard step 1 listing selector + sheet.
- `src/app/listings/[id]/page.tsx` — listing detail page.
- `src/app/listings/[id]/source/[heroKeyHash]/page.tsx` — source detail page with sticky "Add another style" CTA.
- `tests/lib/db/listings.test.ts`
- `tests/api/listings.test.ts`
- `tests/api/listings-id.test.ts`
- `tests/lib/utils/hero-key-hash.test.ts`
- Updates to `tests/api/stage-batch.test.ts` and a new `tests/api/stage.test.ts` are in-task.

**Modified:**
- `src/lib/db/stagings.ts` — add `listingId?: string` to `Staging` interface and `createStaging` input. (Lambda also writes Stagings — see Task 5.)
- `src/lib/db/batch-jobs.ts` — add optional `listingId` to `BatchJob` and `BatchJobInput`; persist on the BATCH#... item.
- `src/app/api/stage/route.ts` — accept `listingId` in body, validate ownership, forward to Lambda.
- `src/app/api/stage/batch/route.ts` — accept `listingId`, validate ownership, forward to `createBatchJob` and to each Lambda invocation.
- `src/app/api/stagings/route.ts` — accept `?listingId=` query param (filters stagings by listingId; `unsorted` => `!listingId`).
- `lambda/staging-worker/index.mjs` — accept `listingId` param; if present, persist on the Staging row and call a one-shot conditional `setListingCoverIfMissing`-style update directly via DDB.
- `src/app/dashboard/page.tsx` — replace `<StagingGallery />` with `<ListingsGrid />`.
- `src/app/stage/page.tsx` — mount `ListingPill` in step 1; read `?listingId=` and `?heroS3Key=` query params; when both present, skip the upload step and lock the listing.

**Deleted:** none. `staging-gallery.tsx` is reused by `/listings/[id]/page.tsx` via a new `listingId` prop.

---

## Conventions

- **Auth:** every server route calls `getSession()` first; ownership-scoped reads/writes assert `record.userId === session.user.id`.
- **Validation:** use `zod` for body parsing on new routes (the codebase already depends on it).
- **Tests:** vitest, tests in `tests/` mirror source structure. Mock `@/lib/aws/dynamodb` with a `sendMock` (see `tests/lib/db/batch-jobs.test.ts` for the canonical pattern).
- **Reserved id:** the string `'unsorted'` is the Unsorted listing's id. Never written to DDB. PATCH/DELETE return `400` for it.
- **TDD:** server-side files (DB helpers, API routes, pure utils) get tests-first. UI files (pages, components) follow the existing project convention — typecheck + smoke test only.
- **Commits:** one commit per task at the end of the task.

---

## Task 1: Listings DDB helper

**Files:**
- Create: `src/lib/db/listings.ts`
- Test: `tests/lib/db/listings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/db/listings.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.fn();
vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: (...args: unknown[]) => sendMock(...args) },
  TABLE_NAME: 'stageright',
}));

import {
  createListing,
  getUserListings,
  getListingById,
  updateListing,
  deleteListing,
  setListingCoverIfMissing,
} from '@/lib/db/listings';

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({});
});

describe('createListing', () => {
  it('writes a USER#... / LISTING#... row with ulid id', async () => {
    const listing = await createListing({ userId: 'u1', name: '12 Smith St' });
    expect(listing.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(listing.pk).toBe('USER#u1');
    expect(listing.sk).toMatch(/^LISTING#.*#[0-9A-Z]{26}$/);
    expect(listing.name).toBe('12 Smith St');
    expect(listing.coverS3Key).toBeUndefined();
    expect(listing.address).toBeUndefined();
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input.Item.pk).toBe('USER#u1');
    expect(cmd.input.Item.userId).toBe('u1');
  });

  it('persists optional address', async () => {
    const listing = await createListing({ userId: 'u1', name: 'A', address: '12 Smith St, Brisbane' });
    expect(listing.address).toBe('12 Smith St, Brisbane');
  });
});

describe('getUserListings', () => {
  it('queries USER#... begins_with LISTING# in reverse order', async () => {
    sendMock.mockResolvedValueOnce({ Items: [{ id: 'l1', name: 'A' }] });
    const result = await getUserListings('u1');
    expect(result).toEqual([{ id: 'l1', name: 'A' }]);
    const cmd = sendMock.mock.calls[0][0];
    expect(cmd.input.KeyConditionExpression).toContain('begins_with(sk, :sk)');
    expect(cmd.input.ExpressionAttributeValues[':sk']).toBe('LISTING#');
    expect(cmd.input.ScanIndexForward).toBe(false);
  });
});

describe('getListingById', () => {
  it('queries USER#... begins_with LISTING# and matches id', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [
        { id: 'l1', userId: 'u1', name: 'A' },
        { id: 'l2', userId: 'u1', name: 'B' },
      ],
    });
    const result = await getListingById('u1', 'l2');
    expect(result?.name).toBe('B');
  });

  it('returns null when not found', async () => {
    sendMock.mockResolvedValueOnce({ Items: [] });
    expect(await getListingById('u1', 'nope')).toBeNull();
  });
});

describe('updateListing', () => {
  it('updates name and address with sk + bumps updatedAt', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [{ id: 'l1', userId: 'u1', sk: 'LISTING#2026-01-01#l1', name: 'Old' }],
    });
    sendMock.mockResolvedValueOnce({});
    await updateListing('u1', 'l1', { name: 'New', address: 'Addr' });
    const updateCmd = sendMock.mock.calls[1][0];
    expect(updateCmd.input.UpdateExpression).toContain('#name = :name');
    expect(updateCmd.input.UpdateExpression).toContain('address = :address');
    expect(updateCmd.input.UpdateExpression).toContain('updatedAt = :updatedAt');
  });
});

describe('deleteListing', () => {
  it('deletes by computed sk', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [{ id: 'l1', userId: 'u1', sk: 'LISTING#2026-01-01#l1' }],
    });
    sendMock.mockResolvedValueOnce({});
    await deleteListing('u1', 'l1');
    const cmd = sendMock.mock.calls[1][0];
    expect(cmd.input.Key.sk).toBe('LISTING#2026-01-01#l1');
  });
});

describe('setListingCoverIfMissing', () => {
  it('uses ConditionExpression to only set when coverS3Key is missing', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [{ id: 'l1', userId: 'u1', sk: 'LISTING#2026-01-01#l1' }],
    });
    sendMock.mockResolvedValueOnce({});
    await setListingCoverIfMissing('u1', 'l1', 'staged/some.jpg');
    const cmd = sendMock.mock.calls[1][0];
    expect(cmd.input.UpdateExpression).toContain('coverS3Key = :cover');
    expect(cmd.input.ConditionExpression).toContain('attribute_not_exists(coverS3Key)');
  });

  it('swallows ConditionalCheckFailedException', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [{ id: 'l1', userId: 'u1', sk: 'LISTING#2026-01-01#l1' }],
    });
    const err = new Error('cond failed');
    (err as unknown as { name: string }).name = 'ConditionalCheckFailedException';
    sendMock.mockRejectedValueOnce(err);
    await expect(setListingCoverIfMissing('u1', 'l1', 'k')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/db/listings.test.ts`
Expected: FAIL with "Cannot find module '@/lib/db/listings'".

- [ ] **Step 3: Implement `src/lib/db/listings.ts`**

```typescript
/**
 * Listings group a user's stagings by property. Listings are optional —
 * the dashboard treats stagings without a listingId as the special
 * "Unsorted" listing (id === 'unsorted'), which is not a real DDB row.
 */
import {
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';

export interface Listing {
  pk: string;
  sk: string;
  id: string;
  userId: string;
  name: string;
  address?: string;
  coverS3Key?: string;
  createdAt: string;
  updatedAt: string;
}

export async function createListing(data: {
  userId: string;
  name: string;
  address?: string;
}): Promise<Listing> {
  const nowIso = new Date().toISOString();
  const id = ulid();
  const item: Listing = {
    pk: `USER#${data.userId}`,
    sk: `LISTING#${nowIso}#${id}`,
    id,
    userId: data.userId,
    name: data.name,
    ...(data.address ? { address: data.address } : {}),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await dynamodb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return item;
}

export async function getUserListings(userId: string, limit = 200): Promise<Listing[]> {
  const result = await dynamodb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'LISTING#',
      },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (result.Items as Listing[]) || [];
}

export async function getListingById(userId: string, id: string): Promise<Listing | null> {
  const all = await getUserListings(userId, 1000);
  return all.find((l) => l.id === id) || null;
}

export async function updateListing(
  userId: string,
  id: string,
  patch: { name?: string; address?: string },
): Promise<void> {
  const listing = await getListingById(userId, id);
  if (!listing) return;
  const sets: string[] = ['updatedAt = :updatedAt'];
  const values: Record<string, unknown> = { ':updatedAt': new Date().toISOString() };
  const names: Record<string, string> = {};
  if (patch.name !== undefined) {
    sets.push('#name = :name');
    values[':name'] = patch.name;
    names['#name'] = 'name';
  }
  if (patch.address !== undefined) {
    sets.push('address = :address');
    values[':address'] = patch.address;
  }
  await dynamodb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: listing.sk },
      UpdateExpression: 'SET ' + sets.join(', '),
      ExpressionAttributeValues: values,
      ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
    }),
  );
}

export async function deleteListing(userId: string, id: string): Promise<void> {
  const listing = await getListingById(userId, id);
  if (!listing) return;
  await dynamodb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: listing.sk },
    }),
  );
}

export async function setListingCoverIfMissing(
  userId: string,
  id: string,
  stagedS3Key: string,
): Promise<void> {
  const listing = await getListingById(userId, id);
  if (!listing) return;
  try {
    await dynamodb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: `USER#${userId}`, sk: listing.sk },
        UpdateExpression: 'SET coverS3Key = :cover, updatedAt = :now',
        ConditionExpression: 'attribute_not_exists(coverS3Key)',
        ExpressionAttributeValues: {
          ':cover': stagedS3Key,
          ':now': new Date().toISOString(),
        },
      }),
    );
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === 'ConditionalCheckFailedException') return;
    throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/db/listings.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/listings.ts tests/lib/db/listings.test.ts
git commit -m "feat(db): listings entity + CRUD helpers"
```

---

## Task 2: Hero key hash util

**Files:**
- Create: `src/lib/utils/hero-key-hash.ts`
- Test: `tests/lib/utils/hero-key-hash.test.ts`

The detail route is `/listings/[id]/source/[heroKeyHash]`. We hash the S3 key so the URL never exposes the raw key. Resolution: page handler hashes every staging's heroS3Key and matches.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/utils/hero-key-hash.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { hashHeroKey, findHeroByHash } from '@/lib/utils/hero-key-hash';

describe('hashHeroKey', () => {
  it('returns a 16-char base64url string', () => {
    const h = hashHeroKey('tenants/u1/hero/abc.jpg');
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is stable for the same input', () => {
    const a = hashHeroKey('tenants/u1/hero/abc.jpg');
    const b = hashHeroKey('tenants/u1/hero/abc.jpg');
    expect(a).toBe(b);
  });

  it('differs for different inputs', () => {
    expect(hashHeroKey('a')).not.toBe(hashHeroKey('b'));
  });
});

describe('findHeroByHash', () => {
  it('returns the heroS3Key whose hash matches', () => {
    const keys = ['tenants/u1/a.jpg', 'tenants/u1/b.jpg'];
    const hash = hashHeroKey(keys[1]);
    expect(findHeroByHash(keys, hash)).toBe(keys[1]);
  });

  it('returns null when nothing matches', () => {
    expect(findHeroByHash(['x', 'y'], 'nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/utils/hero-key-hash.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/utils/hero-key-hash.ts`**

```typescript
import { createHash } from 'node:crypto';

export function hashHeroKey(s3Key: string): string {
  return createHash('sha1').update(s3Key).digest('base64url').slice(0, 16);
}

export function findHeroByHash(heroS3Keys: string[], hash: string): string | null {
  for (const k of heroS3Keys) {
    if (hashHeroKey(k) === hash) return k;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/utils/hero-key-hash.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/hero-key-hash.ts tests/lib/utils/hero-key-hash.test.ts
git commit -m "feat(utils): heroKey -> short stable hash for URL routing"
```

---

## Task 3: POST/GET `/api/listings`

**Files:**
- Create: `src/app/api/listings/route.ts`
- Create: `tests/api/listings.test.ts`

Behaviour:
- `POST` body `{ name, address? }` → 201 with the new Listing. 400 on missing/empty name. 401 unauthenticated.
- `GET` → `{ listings: Array<Listing & { imageCount, sourceCount, lastActivityAt }> }`. Counts derived from a single `getUserStagings(userId, 500)` call so we don't N+1.

- [ ] **Step 1: Write the failing test**

Create `tests/api/listings.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db/listings', () => ({
  createListing: vi.fn(async (i) => ({
    pk: `USER#${i.userId}`,
    sk: 'LISTING#x',
    id: 'l1',
    userId: i.userId,
    name: i.name,
    address: i.address,
    createdAt: '2026-04-27T00:00:00Z',
    updatedAt: '2026-04-27T00:00:00Z',
  })),
  getUserListings: vi.fn(async () => [
    {
      pk: 'USER#u1', sk: 'LISTING#a', id: 'l1', userId: 'u1', name: 'L1',
      createdAt: '2026-04-26T00:00:00Z', updatedAt: '2026-04-26T00:00:00Z',
    },
  ]),
}));
vi.mock('@/lib/db/stagings', () => ({
  getUserStagings: vi.fn(async () => [
    { id: 's1', heroS3Key: 'h1', listingId: 'l1', createdAt: '2026-04-26T01:00:00Z' },
    { id: 's2', heroS3Key: 'h1', listingId: 'l1', createdAt: '2026-04-26T02:00:00Z' },
    { id: 's3', heroS3Key: 'h2', listingId: 'l1', createdAt: '2026-04-26T03:00:00Z' },
    { id: 's4', heroS3Key: 'h3' /* no listingId — Unsorted */, createdAt: '2026-04-26T04:00:00Z' },
  ]),
}));

import { GET, POST } from '@/app/api/listings/route';
import { getSession } from '@/lib/auth/session';

const session = { user: { id: 'u1', email: 'a@b.c' } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(session as any);
});

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/listings', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/listings', () => {
  it('401 when unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const res = await POST(makeReq({ name: 'A' }));
    expect(res.status).toBe(401);
  });

  it('400 when name missing or empty', async () => {
    expect((await POST(makeReq({}))).status).toBe(400);
    expect((await POST(makeReq({ name: '' }))).status).toBe(400);
    expect((await POST(makeReq({ name: '   ' }))).status).toBe(400);
  });

  it('201 with the new listing on success', async () => {
    const res = await POST(makeReq({ name: '12 Smith St', address: 'Brisbane' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.listing.id).toBe('l1');
    expect(data.listing.name).toBe('12 Smith St');
  });
});

describe('GET /api/listings', () => {
  it('401 when unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns listings + per-listing counts derived from stagings', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.listings).toHaveLength(1);
    expect(data.listings[0].id).toBe('l1');
    expect(data.listings[0].imageCount).toBe(3);
    expect(data.listings[0].sourceCount).toBe(2);
    expect(data.listings[0].lastActivityAt).toBe('2026-04-26T03:00:00Z');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/listings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/app/api/listings/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createListing, getUserListings, type Listing } from '@/lib/db/listings';
import { getUserStagings } from '@/lib/db/stagings';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: { name?: string; address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const name = (body.name || '').trim();
  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }
  const address = body.address?.trim() || undefined;
  const listing = await createListing({ userId: session.user.id, name, address });
  return NextResponse.json({ listing }, { status: 201 });
}

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [listings, stagings] = await Promise.all([
    getUserListings(session.user.id),
    getUserStagings(session.user.id, 500),
  ]);

  const annotated = listings.map((l: Listing) => {
    const own = stagings.filter((s) => s.listingId === l.id);
    const sources = new Set(own.map((s) => s.heroS3Key));
    const lastActivityAt = own.reduce(
      (acc, s) => (s.createdAt > acc ? s.createdAt : acc),
      l.updatedAt,
    );
    return {
      ...l,
      imageCount: own.length,
      sourceCount: sources.size,
      lastActivityAt,
    };
  });

  return NextResponse.json({ listings: annotated });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/listings.test.ts`
Expected: PASS — 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/listings/route.ts tests/api/listings.test.ts
git commit -m "feat(api): POST/GET /api/listings"
```

---

## Task 4: GET/PATCH/DELETE `/api/listings/[id]`

**Files:**
- Create: `src/app/api/listings/[id]/route.ts`
- Create: `tests/api/listings-id.test.ts`

Behaviour:
- `GET` → single listing or 404. Reject `id === 'unsorted'` with 400 (Unsorted is not addressable as a real listing — its detail page reads `?listingId=unsorted` from `/api/stagings` instead).
- `PATCH` body `{ name?, address? }` → 200. Reject Unsorted with 400. Reject when listing belongs to another user (cross-user 404).
- `DELETE` → 200. Reject Unsorted with 400. Cascades: every Staging where `listingId === id` has the field cleared (moves to Unsorted).

Add helper `clearListingIdOnStagings(userId, listingId)` to `src/lib/db/stagings.ts` (also wraps the iteration so it's testable in isolation).

- [ ] **Step 1: Add `clearListingIdOnStagings` test to listings-stagings test file**

Create `tests/lib/db/stagings-clear-listing.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.fn();
vi.mock('@/lib/aws/dynamodb', () => ({
  dynamodb: { send: (...args: unknown[]) => sendMock(...args) },
  TABLE_NAME: 'stageright',
}));

import { clearListingIdOnStagings } from '@/lib/db/stagings';

beforeEach(() => sendMock.mockReset());

describe('clearListingIdOnStagings', () => {
  it('REMOVEs listingId on every staging matching the given listingId', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [
        { sk: 'STAGING#1', listingId: 'l1' },
        { sk: 'STAGING#2', listingId: 'l2' },
        { sk: 'STAGING#3', listingId: 'l1' },
      ],
    });
    sendMock.mockResolvedValue({});
    await clearListingIdOnStagings('u1', 'l1');
    // 1 query + 2 update calls (only the two matching rows)
    expect(sendMock).toHaveBeenCalledTimes(3);
    const updateCmd = sendMock.mock.calls[1][0];
    expect(updateCmd.input.UpdateExpression).toContain('REMOVE listingId');
    expect(updateCmd.input.Key.sk).toMatch(/STAGING#[13]/);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `npx vitest run tests/lib/db/stagings-clear-listing.test.ts`
Expected: FAIL — `clearListingIdOnStagings` not exported.

- [ ] **Step 3: Add `clearListingIdOnStagings` to `src/lib/db/stagings.ts`**

Append to `src/lib/db/stagings.ts`:

```typescript
export async function clearListingIdOnStagings(
  userId: string,
  listingId: string,
): Promise<void> {
  const all = await getUserStagings(userId, 500);
  const targets = all.filter((s) => s.listingId === listingId);
  for (const s of targets) {
    await dynamodb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: `USER#${userId}`, sk: s.sk },
        UpdateExpression: 'REMOVE listingId',
      }),
    );
  }
}
```

- [ ] **Step 4: Run to pass**

Run: `npx vitest run tests/lib/db/stagings-clear-listing.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route test**

Create `tests/api/listings-id.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db/listings', () => ({
  getListingById: vi.fn(),
  updateListing: vi.fn(async () => {}),
  deleteListing: vi.fn(async () => {}),
}));
vi.mock('@/lib/db/stagings', () => ({
  clearListingIdOnStagings: vi.fn(async () => {}),
}));

import { GET, PATCH, DELETE } from '@/app/api/listings/[id]/route';
import { getSession } from '@/lib/auth/session';
import { getListingById, updateListing, deleteListing } from '@/lib/db/listings';
import { clearListingIdOnStagings } from '@/lib/db/stagings';

const session = { user: { id: 'u1' } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(session as any);
});

function req(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/listings/l1', {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}),
  });
}
const ctx = (id: string) => ({ params: { id } });

describe('GET /api/listings/[id]', () => {
  it('400 for unsorted', async () => {
    const res = await GET(req('GET'), ctx('unsorted'));
    expect(res.status).toBe(400);
  });
  it('404 when missing', async () => {
    vi.mocked(getListingById).mockResolvedValueOnce(null);
    const res = await GET(req('GET'), ctx('l1'));
    expect(res.status).toBe(404);
  });
  it('200 with listing', async () => {
    vi.mocked(getListingById).mockResolvedValueOnce({ id: 'l1', userId: 'u1', name: 'A' } as any);
    const res = await GET(req('GET'), ctx('l1'));
    expect(res.status).toBe(200);
    expect((await res.json()).listing.id).toBe('l1');
  });
});

describe('PATCH /api/listings/[id]', () => {
  it('400 for unsorted', async () => {
    const res = await PATCH(req('PATCH', { name: 'X' }), ctx('unsorted'));
    expect(res.status).toBe(400);
  });
  it('404 when listing missing', async () => {
    vi.mocked(getListingById).mockResolvedValueOnce(null);
    const res = await PATCH(req('PATCH', { name: 'X' }), ctx('l1'));
    expect(res.status).toBe(404);
  });
  it('200 + updateListing called', async () => {
    vi.mocked(getListingById).mockResolvedValueOnce({ id: 'l1', userId: 'u1', name: 'Old' } as any);
    const res = await PATCH(req('PATCH', { name: 'New' }), ctx('l1'));
    expect(res.status).toBe(200);
    expect(updateListing).toHaveBeenCalledWith('u1', 'l1', { name: 'New' });
  });
});

describe('DELETE /api/listings/[id]', () => {
  it('400 for unsorted', async () => {
    const res = await DELETE(req('DELETE'), ctx('unsorted'));
    expect(res.status).toBe(400);
  });
  it('404 when missing', async () => {
    vi.mocked(getListingById).mockResolvedValueOnce(null);
    const res = await DELETE(req('DELETE'), ctx('l1'));
    expect(res.status).toBe(404);
  });
  it('clears listingId on stagings then deletes', async () => {
    vi.mocked(getListingById).mockResolvedValueOnce({ id: 'l1', userId: 'u1' } as any);
    const res = await DELETE(req('DELETE'), ctx('l1'));
    expect(res.status).toBe(200);
    expect(clearListingIdOnStagings).toHaveBeenCalledWith('u1', 'l1');
    expect(deleteListing).toHaveBeenCalledWith('u1', 'l1');
    // Order matters: clear first so a failure doesn't leave orphans pointing at a dead id
    const clearOrder = vi.mocked(clearListingIdOnStagings).mock.invocationCallOrder[0];
    const delOrder = vi.mocked(deleteListing).mock.invocationCallOrder[0];
    expect(clearOrder).toBeLessThan(delOrder);
  });
});
```

- [ ] **Step 6: Run to fail**

Run: `npx vitest run tests/api/listings-id.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/app/api/listings/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getListingById, updateListing, deleteListing } from '@/lib/db/listings';
import { clearListingIdOnStagings } from '@/lib/db/stagings';

export const dynamic = 'force-dynamic';

const UNSORTED = 'unsorted';

interface Ctx {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  if (params.id === UNSORTED) {
    return NextResponse.json({ error: 'unsorted is virtual' }, { status: 400 });
  }
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const listing = await getListingById(session.user.id, params.id);
  if (!listing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ listing });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (params.id === UNSORTED) {
    return NextResponse.json({ error: 'cannot edit unsorted' }, { status: 400 });
  }
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const listing = await getListingById(session.user.id, params.id);
  if (!listing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let body: { name?: string; address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const patch: { name?: string; address?: string } = {};
  if (body.name !== undefined) {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    patch.name = n;
  }
  if (body.address !== undefined) patch.address = body.address.trim();

  await updateListing(session.user.id, params.id, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  if (params.id === UNSORTED) {
    return NextResponse.json({ error: 'cannot delete unsorted' }, { status: 400 });
  }
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const listing = await getListingById(session.user.id, params.id);
  if (!listing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await clearListingIdOnStagings(session.user.id, params.id);
  await deleteListing(session.user.id, params.id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 8: Run to pass**

Run: `npx vitest run tests/api/listings-id.test.ts tests/lib/db/stagings-clear-listing.test.ts`
Expected: PASS — all green.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/listings/\[id\]/route.ts src/lib/db/stagings.ts tests/api/listings-id.test.ts tests/lib/db/stagings-clear-listing.test.ts
git commit -m "feat(api): GET/PATCH/DELETE /api/listings/[id] with cascade clear"
```

---

## Task 5: Thread `listingId` through stage routes & batch jobs

**Files:**
- Modify: `src/lib/db/stagings.ts` — extend `Staging` interface and `createStaging` input.
- Modify: `src/lib/db/batch-jobs.ts` — extend `BatchJob` and `BatchJobInput`; persist `listingId`.
- Modify: `src/app/api/stage/route.ts` — accept body `listingId`, validate ownership, forward.
- Modify: `src/app/api/stage/batch/route.ts` — accept body `listingId`, validate, forward to `createBatchJob` and each Lambda invocation.
- Modify: `tests/api/stage-batch.test.ts` — extend.

Validation rule: when a `listingId` is supplied, call `getListingById(userId, listingId)`; if it doesn't exist, return 400. The literal `'unsorted'` in the body is treated as "no listing" (omit from forwarded params).

- [ ] **Step 1: Extend `Staging` interface and `createStaging`**

In `src/lib/db/stagings.ts`:

```typescript
// Add to interface Staging:
  listingId?: string;
```

```typescript
// Update createStaging signature:
export async function createStaging(data: {
  userId: string;
  sessionId: string;
  style: string;
  roomTypes: string[];
  heroS3Key: string;
  stagedS3Key: string;
  notes?: string;
  listingId?: string;
}): Promise<Staging> {
  // ... existing body, then in the item construction add:
  // ...(data.listingId ? { listingId: data.listingId } : {}),
}
```

Apply the addition inside the `const item: Staging = { ... }` block, just before `notes`:

```typescript
    ...(data.listingId ? { listingId: data.listingId } : {}),
```

- [ ] **Step 2: Extend `BatchJob` types and persist**

In `src/lib/db/batch-jobs.ts`:

```typescript
// In interface BatchJob, add:
  listingId?: string;
```

```typescript
// In interface BatchJobInput, add:
  listingId?: string;
```

```typescript
// In createBatchJob's item construction, just after notes:
    ...(data.listingId ? { listingId: data.listingId } : {}),
```

- [ ] **Step 3: Write failing route tests for listingId in stage-batch**

Append to `tests/api/stage-batch.test.ts` (inside the existing `describe('POST /api/stage/batch')`):

```typescript
  it('400 when listingId is non-empty and does not belong to user', async () => {
    const { getListingById } = await import('@/lib/db/listings');
    vi.mocked(getListingById).mockResolvedValueOnce(null);
    const res = await POST(makeReq({ ...goodBody, listingId: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('forwards listingId to createBatchJob and Lambda invocations when valid', async () => {
    const { getListingById } = await import('@/lib/db/listings');
    vi.mocked(getListingById).mockResolvedValueOnce({ id: 'l1', userId: 'u1' } as any);
    const res = await POST(makeReq({ ...goodBody, listingId: 'l1' }));
    expect(res.status).toBe(202);
    expect(createBatchJob).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'l1' }));
    expect(invokeStagingWorker).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ listingId: 'l1' }) }),
    );
  });

  it('treats listingId === "unsorted" as no listing', async () => {
    const res = await POST(makeReq({ ...goodBody, listingId: 'unsorted' }));
    expect(res.status).toBe(202);
    const call = vi.mocked(createBatchJob).mock.calls.at(-1)![0];
    expect(call.listingId).toBeUndefined();
  });
```

Add at top of test file:

```typescript
vi.mock('@/lib/db/listings', () => ({
  getListingById: vi.fn(),
}));
```

- [ ] **Step 4: Run to fail**

Run: `npx vitest run tests/api/stage-batch.test.ts`
Expected: FAIL on the new tests — `listingId` not forwarded.

- [ ] **Step 5: Update `src/app/api/stage/batch/route.ts`**

Add import:

```typescript
import { getListingById } from '@/lib/db/listings';
```

Update body destructure & validation, just after the existing style validation block (before `deductCredits`):

```typescript
  const rawListingId = (body as { listingId?: string }).listingId;
  let listingId: string | undefined;
  if (rawListingId && rawListingId !== 'unsorted') {
    const owned = await getListingById(session.user.id, rawListingId);
    if (!owned) {
      return NextResponse.json({ error: 'unknown listingId' }, { status: 400 });
    }
    listingId = rawListingId;
  }
```

Pass `listingId` to `createBatchJob`:

```typescript
  const batch = await createBatchJob({
    userId: session.user.id,
    heroS3Key,
    referenceS3Keys,
    roomTypes,
    notes,
    roomAnalysis: '',
    styles,
    listingId,
  });
```

Pass `listingId` in each `invokeStagingWorker` `params`:

```typescript
        params: {
          userId: session.user.id,
          sessionId: sub.jobId,
          heroS3Key,
          referenceS3Keys,
          roomTypes,
          style: sub.style,
          notes,
          roomAnalysis: '',
          useOpus47,
          model: 'nano-banana-pro',
          quality: 'standard',
          applyWatermark: !isAdmin,
          ...(listingId ? { listingId } : {}),
        },
```

- [ ] **Step 6: Apply the same change to `src/app/api/stage/route.ts`**

Mirror the listingId destructure/validation block and forward `listingId` in the Lambda params (search for the existing `invokeStagingWorker` call in this file).

- [ ] **Step 7: Run all api tests to pass**

Run: `npx vitest run tests/api/`
Expected: PASS — including the 3 new stage-batch tests and all existing tests.

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/stagings.ts src/lib/db/batch-jobs.ts src/app/api/stage/route.ts src/app/api/stage/batch/route.ts tests/api/stage-batch.test.ts
git commit -m "feat(stage): accept and forward listingId through batch + lambda params"
```

---

## Task 6: Filter `/api/stagings` by `listingId`

**Files:**
- Modify: `src/app/api/stagings/route.ts`

Behaviour: `GET /api/stagings?listingId=l1` returns only stagings where `staging.listingId === 'l1'`. `?listingId=unsorted` returns stagings where `!staging.listingId`. Omitted query param: existing behaviour (all).

- [ ] **Step 1: Update GET to read query param and filter**

In `src/app/api/stagings/route.ts`, change the `GET` signature to `GET(req: Request)` and after fetching `rows`:

```typescript
  const url = new URL(req.url);
  const listingFilter = url.searchParams.get('listingId');
  const filtered = listingFilter == null
    ? rows
    : listingFilter === 'unsorted'
      ? rows.filter((r) => !r.listingId)
      : rows.filter((r) => r.listingId === listingFilter);
```

Then use `filtered` instead of `rows` from that point downward. (`Promise.all(filtered.map(...))`.)

- [ ] **Step 2: Smoke test**

Run: `npx vitest run tests/api/`
Expected: PASS — no regressions.

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/stagings/route.ts
git commit -m "feat(api): /api/stagings supports ?listingId= filter incl. unsorted"
```

---

## Task 7: Lambda — persist `listingId` and auto-set listing cover

**Files:**
- Modify: `lambda/staging-worker/index.mjs`

Behaviour: when invoked with `params.listingId`, write that field on the Staging row created at line ~1315–1333. After the Staging is written, if `params.listingId` is present, run a conditional UpdateCommand that sets `coverS3Key` on the matching `LISTING#...` row only when `attribute_not_exists(coverS3Key)`.

The listing's `sk` is unknown to the Lambda (it's `LISTING#{iso}#{listingId}`). Easiest approach: query the user's LISTING# rows and find the one whose `id === params.listingId`. Cache nothing — this is a once-per-job operation.

- [ ] **Step 1: Add `listingId` to Staging item write**

Find the block at lines ~1315–1333 and add inside the `Item:` object:

```javascript
              ...(params.listingId ? { listingId: params.listingId } : {}),
```

(Place right after `comparisonId: params.comparisonId || null,` for consistency.)

- [ ] **Step 2: Add cover-set helper near top of file**

Add a helper near the other DDB helpers (search for `dynamodb.send` usages):

```javascript
async function setListingCoverIfMissing(userId, listingId, stagedS3Key) {
  if (!userId || !listingId) return;
  try {
    const listings = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'LISTING#' },
      Limit: 200,
    }));
    const match = (listings.Items || []).find((l) => l.id === listingId);
    if (!match) return;
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: match.sk },
      UpdateExpression: 'SET coverS3Key = :cover, updatedAt = :now',
      ConditionExpression: 'attribute_not_exists(coverS3Key)',
      ExpressionAttributeValues: { ':cover': stagedS3Key, ':now': new Date().toISOString() },
    }));
  } catch (err) {
    if (err && err.name === 'ConditionalCheckFailedException') return;
    console.warn('[StagingWorker] setListingCoverIfMissing failed:', err && err.message);
  }
}
```

Make sure `QueryCommand` is imported at the top:

```javascript
import { DynamoDBDocumentClient, UpdateCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
```

- [ ] **Step 3: Call the helper after the Staging row is written**

Just after the `console.log('[StagingWorker] Gallery entry created: ...')` line, add:

```javascript
          if (params.listingId) {
            await setListingCoverIfMissing(params.userId, params.listingId, result.s3Key);
          }
```

- [ ] **Step 4: Verify no syntax errors**

Run: `node --check lambda/staging-worker/index.mjs`
Expected: silent (no output) on success.

- [ ] **Step 5: Commit**

```bash
git add lambda/staging-worker/index.mjs
git commit -m "feat(lambda): persist listingId on Staging + auto-set listing cover"
```

---

## Task 8: Deploy Lambda

**Files:** none (deploy-only)

> CLAUDE.md "Deploying the staging-worker Lambda" — Amplify does NOT auto-deploy this. Without redeploy, listingId is silently dropped server-side.

- [ ] **Step 1: Zip and upload (from project root)**

```bash
powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; \$src = '\\?\C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images\lambda\staging-worker'; \$dst = '\\?\C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images\lambda\staging-worker.zip'; if (Test-Path \$dst) { Remove-Item \$dst -Force }; [System.IO.Compression.ZipFile]::CreateFromDirectory(\$src, \$dst, [System.IO.Compression.CompressionLevel]::Optimal, \$false)"

cd lambda && aws lambda update-function-code \
  --function-name stageright-staging-worker \
  --zip-file fileb://staging-worker.zip \
  --region ap-southeast-2
```

- [ ] **Step 2: Wait for rollover**

```bash
aws lambda get-function-configuration \
  --function-name stageright-staging-worker \
  --region ap-southeast-2 \
  --query "{LastUpdateStatus:LastUpdateStatus,State:State}"
```

Expected: `LastUpdateStatus=Successful`, `State=Active`.

- [ ] **Step 3: No commit** (deploy is a runtime action, not a code change).

---

## Task 9: `ListingsGrid` component

**Files:**
- Create: `src/components/dashboard/listings-grid.tsx`

Visual: simple responsive grid of cards. Each card: cover thumb (signed URL or placeholder), name, image count + source count, last activity. **Unsorted card is always present and pinned first** — even when the user has zero unsorted stagings. New-listing button is a "+" tile at the end.

Use the design system primitives (StyleRow / wizard cards in `src/components/staging/` are the visual reference; do not invent a new card style). When in doubt, copy the dashboard's existing card colours / radii.

- [ ] **Step 1: Implement the component**

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';

interface ListingTile {
  id: string;
  name: string;
  imageCount: number;
  sourceCount: number;
  lastActivityAt: string;
  coverS3Key?: string;
  coverUrl?: string;
}

interface UnsortedCounts {
  imageCount: number;
  sourceCount: number;
  lastActivityAt: string | null;
  coverUrl: string | null;
}

export function ListingsGrid() {
  const [listings, setListings] = useState<ListingTile[]>([]);
  const [unsorted, setUnsorted] = useState<UnsortedCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [listingsRes, unsortedRes] = await Promise.all([
          fetch('/api/listings').then((r) => r.json()),
          fetch('/api/stagings?listingId=unsorted').then((r) => r.json()),
        ]);
        if (!alive) return;
        setListings(listingsRes.listings || []);
        const ups = (unsortedRes.uploads || []) as Array<{ heroS3Key: string; coverUrl: string; createdAt: string; totalVariants: number }>;
        setUnsorted({
          imageCount: ups.reduce((acc, u) => acc + u.totalVariants, 0),
          sourceCount: ups.length,
          lastActivityAt: ups[0]?.createdAt || null,
          coverUrl: ups[0]?.coverUrl || null,
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleCreate = async () => {
    const name = window.prompt('Listing name (e.g. 12 Smith St)')?.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return;
      const { listing } = await res.json();
      setListings((prev) => [
        { ...listing, imageCount: 0, sourceCount: 0, lastActivityAt: listing.createdAt },
        ...prev,
      ]);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="aspect-[4/3] rounded-2xl bg-stone-100 animate-pulse" />))}</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <UnsortedCard counts={unsorted} />
      {listings.map((l) => (
        <ListingCard key={l.id} listing={l} />
      ))}
      <button
        onClick={handleCreate}
        disabled={creating}
        className="aspect-[4/3] rounded-2xl border-2 border-dashed border-stone-300 hover:border-teal-500 hover:bg-teal-50/30 transition-colors flex flex-col items-center justify-center gap-2 text-stone-500 hover:text-teal-700"
      >
        <Plus className="w-6 h-6" />
        <span className="font-medium">New listing</span>
      </button>
    </div>
  );
}

function UnsortedCard({ counts }: { counts: UnsortedCounts | null }) {
  return (
    <Link href="/listings/unsorted" className="block group">
      <motion.div
        whileHover={{ y: -2 }}
        className="aspect-[4/3] rounded-2xl overflow-hidden bg-stone-100 relative"
      >
        {counts?.coverUrl ? (
          <img src={counts.coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-400">No images yet</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
          <div className="font-medium">Unsorted</div>
          <div className="text-xs text-white/80">
            {counts?.imageCount ?? 0} images · {counts?.sourceCount ?? 0} sources
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

function ListingCard({ listing }: { listing: ListingTile }) {
  return (
    <Link href={`/listings/${listing.id}`} className="block group">
      <motion.div
        whileHover={{ y: -2 }}
        className="aspect-[4/3] rounded-2xl overflow-hidden bg-stone-100 relative"
      >
        {listing.coverUrl ? (
          <img src={listing.coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-400">No images yet</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
          <div className="font-medium truncate">{listing.name}</div>
          <div className="text-xs text-white/80">
            {listing.imageCount} images · {listing.sourceCount} sources
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
```

> Note: `coverUrl` for tiles is not set here — we extend `/api/listings` GET to sign cover URLs. (See Step 2.)

- [ ] **Step 2: Sign cover URLs in `/api/listings` GET**

In `src/app/api/listings/route.ts` GET, after building `annotated`, also sign each cover URL when present:

```typescript
import { getSignedDownloadUrl } from '@/lib/aws/s3';

// In GET, replace the `annotated` block with:
const annotated = await Promise.all(
  listings.map(async (l: Listing) => {
    const own = stagings.filter((s) => s.listingId === l.id);
    const sources = new Set(own.map((s) => s.heroS3Key));
    const lastActivityAt = own.reduce(
      (acc, s) => (s.createdAt > acc ? s.createdAt : acc),
      l.updatedAt,
    );
    const coverUrl = l.coverS3Key
      ? await getSignedDownloadUrl(l.coverS3Key, 3600).catch(() => null)
      : null;
    return {
      ...l,
      coverUrl,
      imageCount: own.length,
      sourceCount: sources.size,
      lastActivityAt,
    };
  }),
);
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/listings-grid.tsx src/app/api/listings/route.ts
git commit -m "feat(dashboard): ListingsGrid component + signed cover URLs"
```

---

## Task 10: Swap dashboard to use `ListingsGrid`

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Replace the import + usage**

In `src/app/dashboard/page.tsx`:

```diff
- import { StagingGallery } from '@/components/dashboard/staging-gallery';
+ import { ListingsGrid } from '@/components/dashboard/listings-grid';
```

```diff
-          <StagingGallery />
+          <ListingsGrid />
```

(The "Gallery" heading nearby should be renamed to "Listings" — search for the existing label and update.)

- [ ] **Step 2: Smoke**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(dashboard): replace flat gallery with listings grid"
```

---

## Task 11: `/listings/[id]` page (listing detail)

**Files:**
- Create: `src/app/listings/[id]/page.tsx`

Reuses `StagingGallery` with a new `listingId` prop that controls which `/api/stagings` query string is sent. Adds a header (listing name, image count, "Add room photo" CTA → `/stage?listingId=...`).

- [ ] **Step 1: Add `listingId` prop to `StagingGallery`**

In `src/components/dashboard/staging-gallery.tsx`, change:

```typescript
export function StagingGallery() {
```

to:

```typescript
export function StagingGallery({ listingId }: { listingId?: string } = {}) {
```

And update the fetch call (find `fetch('/api/stagings')`):

```typescript
      const url = listingId ? `/api/stagings?listingId=${encodeURIComponent(listingId)}` : '/api/stagings';
      const res = await fetch(url);
```

Add `listingId` to the `useCallback` deps array of `load`.

- [ ] **Step 2: Implement the page**

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getListingById } from '@/lib/db/listings';
import { StagingGallery } from '@/components/dashboard/staging-gallery';

export const dynamic = 'force-dynamic';

interface Props {
  params: { id: string };
}

export default async function ListingDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session?.user) {
    return notFound();
  }

  let title = 'Unsorted';
  let address: string | undefined;
  if (params.id !== 'unsorted') {
    const listing = await getListingById(session.user.id, params.id);
    if (!listing) return notFound();
    title = listing.name;
    address = listing.address;
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href="/dashboard" className="text-sm text-stone-500 hover:text-stone-800">
            ← Listings
          </Link>
          <h1 className="font-serif text-3xl mt-2">{title}</h1>
          {address && <p className="text-stone-500 text-sm mt-1">{address}</p>}
        </div>
        <Link
          href={`/stage?listingId=${encodeURIComponent(params.id)}`}
          className="rounded-full bg-stone-900 text-white px-5 py-2.5 text-sm font-medium hover:bg-stone-800"
        >
          Add room photo
        </Link>
      </div>
      <StagingGallery listingId={params.id} />
    </main>
  );
}
```

- [ ] **Step 3: Smoke**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/listings/\[id\]/page.tsx src/components/dashboard/staging-gallery.tsx
git commit -m "feat(listings): /listings/[id] detail page"
```

---

## Task 12: `/listings/[id]/source/[heroKeyHash]` page

**Files:**
- Create: `src/app/listings/[id]/source/[heroKeyHash]/page.tsx`

Renders the single `UploadGroup` whose `heroS3Key` matches the hash. Shows hero photo at top, list of staged variants below, sticky "+ Add another style" CTA that deep-links to `/stage?listingId=X&heroS3Key=Y`.

- [ ] **Step 1: Implement the page**

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getUserStagings } from '@/lib/db/stagings';
import { getListingById } from '@/lib/db/listings';
import { getSignedDownloadUrl } from '@/lib/aws/s3';
import { hashHeroKey } from '@/lib/utils/hero-key-hash';

export const dynamic = 'force-dynamic';

interface Props {
  params: { id: string; heroKeyHash: string };
}

export default async function SourceDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session?.user) return notFound();

  let listingTitle = 'Unsorted';
  if (params.id !== 'unsorted') {
    const listing = await getListingById(session.user.id, params.id);
    if (!listing) return notFound();
    listingTitle = listing.name;
  }

  const stagings = await getUserStagings(session.user.id, 500);
  const filtered = stagings.filter((s) =>
    params.id === 'unsorted' ? !s.listingId : s.listingId === params.id,
  );
  const match = filtered.filter((s) => hashHeroKey(s.heroS3Key) === params.heroKeyHash);
  if (match.length === 0) return notFound();

  const heroS3Key = match[0].heroS3Key;
  const heroUrl = await getSignedDownloadUrl(heroS3Key, 3600).catch(() => null);
  const variants = await Promise.all(
    match
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(async (s) => ({
        id: s.id,
        sk: s.sk,
        style: s.style,
        createdAt: s.createdAt,
        stagedUrl: await getSignedDownloadUrl(s.stagedS3Key, 3600).catch(() => null),
      })),
  );

  return (
    <main className="max-w-5xl mx-auto px-4 py-10 pb-32">
      <div className="mb-6">
        <Link
          href={`/listings/${params.id}`}
          className="text-sm text-stone-500 hover:text-stone-800"
        >
          ← {listingTitle}
        </Link>
      </div>

      {heroUrl && (
        <div className="rounded-2xl overflow-hidden mb-8 bg-stone-100">
          <img src={heroUrl} alt="Source room" className="w-full h-auto" />
        </div>
      )}

      <h2 className="font-serif text-2xl mb-4">Staged styles</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {variants.map((v) => (
          <div key={v.sk} className="rounded-xl overflow-hidden bg-stone-100">
            {v.stagedUrl && <img src={v.stagedUrl} alt={v.style} className="w-full aspect-[4/3] object-cover" />}
            <div className="px-3 py-2 text-sm font-medium">{v.style}</div>
          </div>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 p-4 bg-gradient-to-t from-white via-white/95 to-transparent">
        <div className="max-w-5xl mx-auto flex justify-end">
          <Link
            href={`/stage?listingId=${encodeURIComponent(params.id)}&heroS3Key=${encodeURIComponent(heroS3Key)}`}
            className="rounded-full bg-stone-900 text-white px-6 py-3 font-medium hover:bg-stone-800"
          >
            + Add another style
          </Link>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Smoke**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/listings/[id]/source/[heroKeyHash]/page.tsx"
git commit -m "feat(listings): source detail page with Add Another Style deep-link"
```

---

## Task 13: `ListingPill` component

**Files:**
- Create: `src/components/staging/listing-pill.tsx`

A pill-style selector with three states:
1. Default (no selection / Unsorted): label "Unsorted" with subdued styling.
2. Selected real listing: filled teal pill (per `feedback_choice_highlight_soft_teal`) showing the listing name.
3. Locked: rendered as a non-interactive pill (used when the wizard arrives via `?listingId=` deep-link).

Tap opens a sheet listing the user's listings + a "+ New listing" inline form.

- [ ] **Step 1: Implement the component**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, FolderOpen, Plus } from 'lucide-react';

interface Listing {
  id: string;
  name: string;
  address?: string;
}

interface Props {
  value: string; // 'unsorted' | listingId
  onChange: (id: string) => void;
  locked?: boolean;
}

export function ListingPill({ value, onChange, locked = false }: Props) {
  const [open, setOpen] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/listings')
      .then((r) => r.json())
      .then((d) => setListings(d.listings || []))
      .finally(() => setLoading(false));
  }, [open]);

  const selectedName =
    value === 'unsorted' ? 'Unsorted' : listings.find((l) => l.id === value)?.name || 'Listing';

  const isReal = value !== 'unsorted';

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return;
      const { listing } = await res.json();
      setListings((prev) => [listing, ...prev]);
      onChange(listing.id);
      setNewName('');
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={locked}
        onClick={() => setOpen(true)}
        className={[
          'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
          locked && 'cursor-not-allowed opacity-80',
          isReal
            ? 'border border-teal-500 bg-teal-50/60 text-stone-900'
            : 'border border-stone-300 bg-white text-stone-700 hover:border-stone-400',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <FolderOpen className="w-4 h-4" />
        <span>{selectedName}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              exit={{ y: 40 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md bg-white rounded-2xl p-5 max-h-[80vh] overflow-y-auto"
            >
              <h2 className="font-serif text-xl mb-4">Choose a listing</h2>

              <button
                onClick={() => {
                  onChange('unsorted');
                  setOpen(false);
                }}
                className="w-full text-left p-3 rounded-xl hover:bg-stone-50 flex items-center justify-between"
              >
                <span>Unsorted</span>
                {value === 'unsorted' && <Check className="w-4 h-4 text-teal-600" />}
              </button>

              {loading && <div className="text-stone-400 text-sm py-3">Loading…</div>}

              {listings.map((l) => (
                <button
                  key={l.id}
                  onClick={() => {
                    onChange(l.id);
                    setOpen(false);
                  }}
                  className="w-full text-left p-3 rounded-xl hover:bg-stone-50 flex items-center justify-between"
                >
                  <span>
                    <span className="block">{l.name}</span>
                    {l.address && <span className="block text-xs text-stone-500">{l.address}</span>}
                  </span>
                  {value === l.id && <Check className="w-4 h-4 text-teal-600" />}
                </button>
              ))}

              <div className="mt-4 pt-4 border-t border-stone-200">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="New listing name"
                    className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim() || creating}
                    className="rounded-xl bg-stone-900 text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4 inline" /> Create
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/staging/listing-pill.tsx
git commit -m "feat(staging): listing pill + sheet selector"
```

---

## Task 14: Wire listing pill + deep-link params into wizard

**Files:**
- Modify: `src/app/stage/page.tsx`

Two surfaces:
1. **Listing pill in step 1.** Default `value = 'unsorted'`. Send `listingId` (or omit when `'unsorted'`) on the `POST /api/stage/batch` call.
2. **Deep-link support.** When `?listingId=` is present, set the pill's value and lock it. When `?heroS3Key=` is present, skip the upload step (treat that key as the already-uploaded hero) and jump straight to style selection.

> File is 1126 lines — locate `useState` calls near the top of the component and insert there. Locate the existing batch-submit handler (search for `'/api/stage/batch'`) and add `listingId` to the body.

- [ ] **Step 1: Add listingId state + read query params**

Near the top of the component function in `src/app/stage/page.tsx`:

```typescript
import { ListingPill } from '@/components/staging/listing-pill';
import { useSearchParams } from 'next/navigation';
```

```typescript
const searchParams = useSearchParams();
const initialListingId = searchParams.get('listingId') || 'unsorted';
const initialHeroS3Key = searchParams.get('heroS3Key') || null;
const [listingId, setListingId] = useState<string>(initialListingId);
const listingLocked = !!searchParams.get('listingId');
```

If the wizard already has a hero-key state setter (search for `setHeroS3Key` or similar), pre-fill it from `initialHeroS3Key` in a `useEffect` that also advances the wizard step past upload when both `initialListingId` and `initialHeroS3Key` are present. Otherwise, plumb through the existing "hero already exists" path the same way the wizard handles a previously-uploaded hero (locate the upload step component — likely `HeroUpload` — and check whether it accepts a pre-filled value).

- [ ] **Step 2: Mount the pill in step 1's UI**

Find the JSX block for step 1 (search for the room-type / style row UI) and add:

```tsx
<ListingPill value={listingId} onChange={setListingId} locked={listingLocked} />
```

Position it next to (or just above) the existing room-type selector.

- [ ] **Step 3: Forward listingId on submit**

Find the `fetch('/api/stage/batch'` call (or its single-stage equivalent) and add to its JSON body:

```typescript
listingId: listingId === 'unsorted' ? undefined : listingId,
```

(Server already accepts the literal `'unsorted'` and treats it as no listing — passing `undefined` is just cleaner.)

- [ ] **Step 4: Skip upload step when deep-linked with heroS3Key**

In the same component, add a `useEffect` that runs once on mount:

```typescript
useEffect(() => {
  if (initialHeroS3Key && initialListingId !== 'unsorted') {
    // Adopt the existing hero into the wizard's state without re-uploading.
    // The exact setter depends on the existing wizard internals — set the
    // hero S3 key AND any derived URL state, then advance to the style step.
    // (Reuse whatever the upload-success callback does today.)
  }
}, []);
```

> This step requires reading the wizard's existing upload-success handler to know which setters to call. The implementation comment is a deliberate marker: when executing this task, search for the existing handler that runs after a successful upload and call exactly the same setters, then transition the wizard to step 2 (style selection).

- [ ] **Step 5: Build + smoke**

Run: `npm run build`
Expected: PASS.

Open `http://localhost:3000/stage`, confirm pill renders defaulting to Unsorted.
Open `http://localhost:3000/stage?listingId=<existing-listing-id>`, confirm pill is locked to that listing.

- [ ] **Step 6: Commit**

```bash
git add src/app/stage/page.tsx
git commit -m "feat(stage): listing pill + deep-link listingId + heroS3Key params"
```

---

## Task 15: End-to-end smoke

**Files:** none (manual test only)

This is the verification gate before committing the final state. Skipping it has burned us before — the spec'd Lambda step writes a field the API never reads back if the deploy was missed.

- [ ] **Step 1: Run all tests**

Run: `npm run test && npm run type-check && npm run lint`
Expected: all PASS.

- [ ] **Step 2: Build production**

Run: `npm run build`
Expected: PASS, no apostrophe-escape errors (CLAUDE.md gotcha).

- [ ] **Step 3: Manual flow — admin account**

1. `/dashboard` shows Listings grid with Unsorted card pinned first; pre-existing stagings appear inside Unsorted.
2. Create a new listing "Smoke Test St" via the "+" tile.
3. Open `/listings/<smoke-test-id>` — empty state.
4. Click **Add room photo** — wizard opens with the listing pill showing "Smoke Test St" and locked.
5. Upload a hero photo, pick 2 styles, submit. Wait for staging.
6. Return to `/dashboard` — Smoke Test St cover thumbnail shows the staged image, count = 2.
7. Open the listing → tap the source upload tile → on `/listings/.../source/...` page, tap **+ Add another style**.
8. Wizard opens with hero pre-filled, listing locked, on the style step. Pick 1 more style, submit. Confirm new staging lands inside the same source.
9. Delete the listing via PATCH/DELETE (manual `curl` is fine) — confirm those 3 stagings revert to Unsorted.

- [ ] **Step 4: Commit any tweaks discovered during smoke**

```bash
git add -A && git commit -m "fix(listings): <whatever>"  # only if something needed fixing
```

---

## Self-Review Checklist (run before handing off)

- [ ] Every spec section has at least one task implementing it. Cross-check:
  - **Listing entity** → Task 1
  - **listingId on Staging** → Task 5 (interface + Lambda Task 7)
  - **POST/GET /api/listings** → Task 3
  - **GET/PATCH/DELETE /api/listings/[id]** → Task 4
  - **Stage routes accept listingId** → Task 5
  - **Auto-set coverS3Key from first staging** → Task 7 (Lambda)
  - **Lambda redeploy** → Task 8
  - **/api/stagings ?listingId= filter** → Task 6
  - **Hero key hash route token** → Task 2
  - **Dashboard listings grid** → Tasks 9 + 10
  - **/listings/[id]** → Task 11
  - **/listings/[id]/source/[heroKeyHash]** → Task 12
  - **Listing pill in wizard** → Task 13 + 14
  - **Deep-link skip-upload from "Add another style"** → Task 14
  - **Unsorted handling end-to-end** → Tasks 4 (reject), 6 (filter), 9 (pinned card), 11 (page handles `unsorted`)

- [ ] No "TBD" / "implement later" placeholders. (One step in Task 14 references "the existing upload-success handler" and instructs the implementer to copy its setters — this is a deliberate concrete instruction, not a placeholder.)

- [ ] Type/method names consistent across tasks: `setListingCoverIfMissing` (DB) and the inline Lambda copy share the same condition expression and field name. `clearListingIdOnStagings` is defined and called in Task 4.

- [ ] `listingId === 'unsorted'` handling is consistent: rejected by `/api/listings/[id]` PATCH/DELETE (Task 4); treated as `undefined` by stage routes (Task 5); treated as `!listingId` filter by `/api/stagings` (Task 6); pinned-first card on dashboard (Task 9); routes through `/listings/unsorted` (Tasks 11, 12).
