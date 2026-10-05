# Admin-controlled landing image picker — Design

**Date:** 2026-04-29
**Status:** Spec — awaiting plan
**Owner:** Tara

## Problem

Landing-page style thumbnails today live as committed JPGs at `public/style-thumbnails/{room-slug}/{style-slug}.jpg`. The `scripts/import-room.mjs` helper bulk-pulls "the latest staging per style" from DynamoDB + S3 for an admin user, but it auto-picks. Tara wants a UI to:

1. Pick the **one empty-room hero photo** that anchors the landing for each room type.
2. For each of the 12 styles in that room, pick the **specific staged variant** of that exact hero (Three Takes means there are usually multiple variants of each style for the same hero).
3. See those picks reflected on the public landing **within seconds**, without a code commit or Amplify deploy.

The win is a coherent "this is THE bedroom; here are 12 styles applied to it" story across the showcase, with the admin in full control of which images sell the product.

## Goals

- Admin can curate the landing's room+style imagery via a UI, not by hand-running a script.
- Updates propagate to the live site within seconds (no commit, no Amplify rebuild).
- The 6 rooms × 12 styles already live on the landing today never break or degrade during or after this feature ships.
- The admin can enable rooms not currently surfaced (the 6 of 12 defined slugs that aren't yet on the pill switcher) once they have full coverage.
- Implementation is scoped to the public landing only — onboarding's cached demo flow and the wizard's `StyleRow` thumbnails stay on local JPGs.

## Non-goals

- Multi-admin / multi-tenant landing curation. This is single-admin (Tara).
- Allowing non-admin users to influence what shows on the landing.
- Drag-to-reorder rooms in the pill switcher (deferred — v1 uses the existing `AVAILABLE_ROOMS` order plus newly-enabled rooms appended).
- Editing/uploading original empty rooms inside this picker. If the admin wants a hero they haven't staged yet, they go to `/stage` first.
- Replacing the onboarding demo's cached bedroom assets. Those stay on local JPGs.
- Touching the wizard's `StyleRow` thumbnails. Same reason.

## User flow

1. Admin opens `/admin/landing-images` (gated by `ADMIN_EMAILS`).
2. Sees a horizontal pill row of all 12 room slugs. Each pill shows the room name, an enabled/hidden toggle, and a completion counter (`8/12 styles picked`).
3. Clicks a room → middle zone shows every unique empty-room photo the admin has staged in that room type, drawn from their gallery (DynamoDB stagings filtered to `roomTypes` containing that room's label, grouped by `heroS3Key`).
4. Clicks a hero → marks it as the original for the room. If the admin had previously chosen a different hero, the existing per-style picks are cleared (with a confirm modal warning "you're starting over").
5. Bottom zone shows 12 rows, one per style. Each row lists every staging the admin has of (selected hero × that style). Admin clicks one → marks it as the pick. Selected pick gets a teal border.
6. Rows with zero matching stagings show a "Stage it" CTA that deep-links to `/stage` with the hero + style preloaded.
7. "Save & sync to landing" button is sticky-bottom. On click: writes the room record to DynamoDB, fires `revalidatePath('/')`, toast confirms "Landing updated" with a "View live" link.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ /admin/         │  POST   │  /api/admin/     │  write  │   DynamoDB       │
│ landing-images  │ ──────▶ │  landing-picks   │ ──────▶ │   pk=LANDING_PICK│
│ (admin UI)      │         │  (auth-gated)    │         │   sk=ROOM#bedroom│
└─────────────────┘         └──────────────────┘         └──────────────────┘
                                                                  │
                                                                  │ revalidatePath('/')
                                                                  ▼
┌─────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ Public landing  │  read   │  Server          │  query  │   DynamoDB       │
│ (style-showcase)│ ◀────── │  Component       │ ◀────── │   (cached + ISR) │
│                 │         │                  │         │                  │
│ <img src=       │         │  build merged    │         └──────────────────┘
│   pick ?? local │         │  slot map        │
│  />             │         │                  │         ┌──────────────────┐
└─────────────────┘         └──────────────────┘         │  S3 / CloudFront │
                                                         │  (image source)  │
                                                         └──────────────────┘
```

**Key decision: existing `public/style-thumbnails/` JPGs stay as fallbacks.** Any slot without an admin pick falls through to the existing local JPG, so the landing renders identically to today on day one with zero migration work. Admin overrides slot-by-slot at their own pace.

## Data model

One DynamoDB record per room:

```typescript
type LandingPick = {
  pk: 'LANDING_PICK';
  sk: `ROOM#${RoomSlug}`;          // 'ROOM#bedroom', 'ROOM#kitchen', etc.
  enabled: boolean;                 // controls visibility on the landing pill switcher
  originalS3Key?: string;           // the hero / empty room
  picks: Partial<Record<StagingStyle, string>>; // style → S3 key of picked staging
  updatedAt: string;                // ISO timestamp
};
```

Records keyed by `pk = 'LANDING_PICK'` allow a single Query to fetch all rooms in one round-trip. No GSI needed.

## Server contract

### `GET` (server-component reads)

A new helper `getLandingPicks()` in `src/lib/db/landing-picks.ts`:

```typescript
async function getLandingPicks(): Promise<Record<RoomSlug, LandingPick>>;
```

Cached via React's `cache()` so the same render reuses the result.

### `POST /api/admin/landing-picks`

Body: `{ roomSlug, enabled?, originalS3Key?, picks? }` (any subset for partial updates).

Behaviour:
1. Auth: must be in `ADMIN_EMAILS`. 403 otherwise.
2. Validate: room slug ∈ `ROOM_SLUGS`; S3 keys must belong to the admin's tenant prefix.
3. Upsert the `LANDING_PICK` record (read-modify-write to merge with existing picks if `originalS3Key` unchanged).
4. If `originalS3Key` changed from a previous value, **clear all existing per-style picks** (they were tied to the old hero).
5. `revalidatePath('/')` so the landing refetches on the next request.
6. Return the saved record.

### `GET /api/admin/landing-picks/candidates?room=<slug>`

Returns the admin's eligible candidates for a room:

```typescript
{
  heroes: { s3Key: string; createdAt: string }[];        // unique heroS3Keys, latest-first
  stagings: {
    heroS3Key: string;
    style: StagingStyle;
    stagedS3Key: string;
    createdAt: string;
  }[];
}
```

Drawn from the admin's `STAGING#` records filtered to `roomTypes contains <room label>`.

## Read path on the public landing

`StyleShowcase` (server component) calls `getLandingPicks()`, then for each `(room, style)` slot computes the merged image source:

```typescript
const imageSrc =
  picks[room]?.picks[style]
    ? cloudfrontUrlFor(picks[room].picks[style])
    : `/style-thumbnails/${room}/${styleSlug}.jpg`;
```

The `<img>` gets an `onError` handler (already a small client wrapper) that falls back to the local JPG if the S3 URL 404s — defence-in-depth so a deleted staging never produces a broken icon on the public site.

## Pill switcher visibility rule

A room appears on the landing pill switcher iff:
- It is in the `LANDING_PICK` table with `enabled: true` AND has all 12 style picks (admin-curated path), **OR**
- It is in the existing `AVAILABLE_ROOMS` constant in `style-showcase.tsx` AND has all 12 local JPGs on disk (legacy fallback path — covers the 6 already-live rooms).

The legacy path lets today's 6 rooms keep showing without any admin work. The admin-curated path lets new rooms come online once the admin completes them.

The picker UI mirrors this rule via the `8/12` completion counter on each room pill.

## Image delivery

Picked S3 keys are served via the existing CloudFront distribution (already configured per CLAUDE.md). The helper `cloudfrontUrlFor(s3Key)` lives in `src/lib/aws/s3.ts` if not already present.

## Auth + scoping

- `/admin/landing-images` is wrapped by the existing admin layout at `src/app/admin/layout.tsx` which gates on `ADMIN_EMAILS`.
- The candidates API only returns stagings owned by the calling admin user. Admin can only pick from their own gallery — same constraint as `import-room.mjs` today.

## Edge cases

| Case | Handling |
|---|---|
| Picked staging deleted from S3 | `<img onError>` falls back to local JPG; landing never breaks. |
| Admin disables a room mid-session | `enabled: false` written; pill switcher excludes it. Local JPGs still exist; re-enabling restores instantly. |
| Style has no matching staging for selected hero | Row shows "Stage it" CTA deep-linking to `/stage?hero=...&style=...`. Room stays below 12-style threshold and isn't shown on the landing yet. |
| Admin swaps the hero on a partially-picked room | Confirm modal: "Changing the original will clear your X picked styles." Confirming clears `picks` to `{}`. |
| Concurrent edits across browser tabs | Last-write-wins. Acceptable for single-admin use case. |
| Image aspect ratio drift between picks | Landing CSS already uses `object-cover` containers; cropping is consistent. |
| DynamoDB read fails on the landing | Server component catches the error, falls through to legacy AVAILABLE_ROOMS + local JPGs. Logged but invisible to users. |
| Admin removes a pick (style → null) | Record updated to remove that key from `picks`. Slot reverts to local JPG fallback if available; otherwise that room drops below the 12-style threshold and disappears from the pill switcher. |

## Performance

- Landing currently fetches no DynamoDB. This adds one small Query (`pk = LANDING_PICK`, ~6-12 small items) per server render.
- React `cache()` deduplicates within a render.
- Next.js ISR + `revalidatePath('/')` on save means production sees the new picks within a single render cycle (~seconds), but cached pageviews between saves don't re-query DynamoDB.

## Out of scope (deferred)

- Drag-to-reorder rooms in the pill switcher (v2 if desired).
- Bulk operations (e.g., "import all latest" — the existing `scripts/import-room.mjs` still works for that).
- Image cropping/zoom inside the picker.
- Pre-staging from inside the picker (the "Stage it" CTA hands off to `/stage`).
- Auditing / history of past picks.
- Onboarding demo / wizard `StyleRow` integration.

## Testing

- **Unit:** `getLandingPicks()` merge logic; visibility-rule resolver; original-change-clears-picks logic.
- **Integration:** end-to-end save flow — POST writes record, `revalidatePath('/')` invalidates, next GET returns merged slot map.
- **Manual smoke:** open `/admin/landing-images`, pick a hero + 12 styles for an unused room (e.g. Kitchen), save, hit `/` in a private window, confirm Kitchen pill appears and shows the picked images.
- **Regression:** the 6 currently-live rooms continue rendering exactly as today when there are zero `LANDING_PICK` records.

## Files touched (anticipated)

- **New:** `src/app/admin/landing-images/page.tsx`, `src/app/api/admin/landing-picks/route.ts`, `src/app/api/admin/landing-picks/candidates/route.ts`, `src/lib/db/landing-picks.ts`, `src/lib/aws/cloudfront.ts` (if not already present).
- **Modified:** `src/components/landing/style-showcase.tsx` (becomes a thin server-component wrapper that fetches picks + computes the slot map, passing the result to a client `<StyleShowcaseClient>`); `src/app/admin/layout.tsx` (add nav entry for the new page).
- **Untouched:** onboarding flow, wizard `StyleRow`, `scripts/import-room.mjs` (kept as the fallback bulk path), public/style-thumbnails JPGs.
