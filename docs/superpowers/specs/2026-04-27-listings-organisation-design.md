# Listings: Organising Stagings By Property

**Date:** 2026-04-27
**Status:** Approved (brainstorming → spec)
**Owner:** Tara

## Problem

Today every staged image lives in a single flat gallery on `/dashboard`. An agent juggling 5 properties has no way to group "the four rooms I staged for 12 Smith St" together, and re-running another style on a previously uploaded photo means going through `/stage` from scratch and re-uploading the hero.

Two user goals fall out of this:

1. **Organise work by property** — tell the four rooms of one listing apart from another listing's rooms.
2. **Re-open a source upload and add more styles** without re-uploading.

## Solution Summary

Introduce an optional **Listing** layer between user and image. Default destination for any staging is **Unsorted** — listings never become mandatory. Inside a listing, stagings are grouped by their existing `heroS3Key` so the same source photo collects multiple staged styles beneath it.

Hierarchy:

```
User
└── Listing (e.g. "12 Smith St")        ← new entity
    └── Source upload (one room photo)  ← grouped client-side by heroS3Key, not a DDB entity
        └── Staged outputs (1 per style; edit history below each is unchanged)
```

No bundle/share actions in v1 — pure organisation.

## Data Model

Single-table DynamoDB stays. **One new entity, one new field on existing Staging records, no separate SourceUpload entity.**

### New entity: Listing

```
pk:           USER#{userId}
sk:           LISTING#{createdAtIso}#{listingId}
id:           ulid
userId:       string
name:         string         // "12 Smith St, Brisbane"
address?:     string         // free text, optional
coverS3Key?:  string         // staged image S3 key, auto-set from first completed staging in the listing
createdAt:    string (iso)
updatedAt:    string (iso)
```

Listing query mirrors the existing `getUserStagings` pattern: `pk = USER#{userId} AND begins_with(sk, 'LISTING#')`, `ScanIndexForward: false` for newest-first.

### Modified entity: Staging

Adds one nullable field:

```
listingId?: string   // null/missing = Unsorted
```

No other changes to the Staging shape. All other code paths that read or write Staging records remain valid because `listingId` is optional.

### Why no SourceUpload entity

Every Staging already carries `heroS3Key` and `roomTypes`. The "source upload" concept is just `GROUP BY heroS3Key` within a listing's stagings — render the hero once, list the staged styles below it. Adding a third entity would duplicate metadata that already lives on Staging and force extra writes per stage. Promoting it to a real entity is a v2 decision driven by source-level features (e.g. "delete this whole source and its variants").

### Querying stagings in a listing

Filter `getUserStagings` results by `listingId` client-side. At realistic agent volumes (tens to low hundreds of stagings per user) this is fast. If volume ever forces a change, add a GSI keyed on `LISTING#{listingId}` later — the field is already on the record.

### Migration

Zero. Existing Staging records have no `listingId`; the dashboard treats `!listingId` as Unsorted. No backfill, no one-time onboarding step, no parallel "old gallery" UI to maintain.

### "Unsorted" representation

Unsorted is **not** a real DDB row. It's a reserved client-side id (`'unsorted'`) the UI uses everywhere a listingId would normally appear: `/listings/unsorted`, the listing pill, etc. On read, a request for the Unsorted listing translates to "stagings where `!listingId`". On write, picking Unsorted in the wizard means *omit* `listingId` from the Staging record (rather than writing the literal string). The Listing API rejects any `PATCH` or `DELETE` against `id === 'unsorted'`.

## Routes & UX

| Route | What it shows |
|---|---|
| `/dashboard` | **Reshaped.** Credits chrome at top stays. The flat `StagingGallery` is replaced by a **Listings grid** — cards showing listing name, cover image, image count, last-activity timestamp. First card is always **Unsorted** (special — cannot be renamed or deleted; hosts pre-feature stagings and any new "skip listing" uploads). |
| `/listings/[id]` | **New.** Single listing view. Header: name, image count, **"Add room photo"** CTA → wizard with listing pre-filled. Body groups stagings by `heroS3Key` — one tile per source upload showing the hero thumbnail and a strip of the staged styles already done for it. Tap a tile to open the source detail. |
| `/listings/[id]/source/[heroKeyHash]` | **New.** Source detail. Big hero photo at top. Below: a grid of staged outputs for this source. Each opens the existing full-screen `gallery-viewer.tsx` overlay (no fork). Sticky CTA: **"+ Add another style"** → wizard with hero + listing pre-filled, jumps straight to style selection. |
| `/stage` | **Lightly modified.** New "Listing" pill in step 1 alongside room-type / style. Defaults to *Unsorted*. Tap opens a sheet: pick existing listing or "+ New listing" (inline name field, address optional). When entered via "Add another style" deep-link, listing is pre-selected and locked, and the hero step is skipped. |

`heroKeyHash` is a short stable hash of the heroS3Key (e.g. base64url of sha1, first 16 chars) so URLs don't expose raw S3 paths. Resolved server-side back to the full key when the page loads.

### The "Unsorted" tile is load-bearing

It's where every existing user's gallery lands on day one (zero migration), it's where one-shot uploads go for users who don't want to think about listings, and it's the release valve so the listing layer never feels mandatory. Renaming Unsorted or "promoting Unsorted contents into a real listing" is a v2 nicety; for v1 it simply exists and works.

### Loading states

Listings grid reuses the existing dashboard skeleton pattern. Source detail reuses `gallery-viewer.tsx` for the individual-variant overlay rather than forking it.

## API Surface

Five new/modified endpoints. Everything else (auth, credits, Lambda, S3, watermarking, bonus credits) stays untouched.

### New

- **`POST /api/listings`** — create. Body: `{ name, address? }`. Returns the new Listing.
- **`GET /api/listings`** — list user's listings, newest first. Returns `[{ ...listing, imageCount, sourceCount, lastActivityAt }]`. Counts derived server-side from a single Stagings query so the grid doesn't N+1.
- **`GET /api/listings/[id]`** — single listing plus its stagings (already filtered by `listingId`, grouped server-side by `heroS3Key`).
- **`PATCH /api/listings/[id]`** — rename / edit address. Reject when targeting the special Unsorted id.
- **`DELETE /api/listings/[id]`** — deletes the listing record only; its stagings reset to `listingId = null` (move to Unsorted) rather than being deleted. Reject when targeting Unsorted.

### Modified

- **`POST /api/stage/batch`** and **`POST /api/stage`** — accept optional `listingId` in the body. Persisted onto each created Staging. If the target listing has no `coverS3Key` yet, set it to this batch's first successful `stagedS3Key` in the same DDB write so the dashboard cover renders immediately.

### Auth

All listing routes go through the existing session-cookie auth helper. All listing-scoped reads/writes assert `listing.userId === session.userId`. Stage routes additionally assert that any supplied `listingId` belongs to the calling user before persisting it on the new Staging records (defence-in-depth — same posture as the recent `s3-ownership.ts` work).

## Out Of Scope (v1)

Called out so they don't sneak in:

- Bundle download (zip of all stagings in a listing)
- Public share link for a listing (read-only vendor gallery)
- Multi-select / drag-to-listing on the dashboard
- Renaming or deleting Unsorted, or "promote Unsorted into a real listing"
- Listing status (Active / Delivered / Archived)
- SourceUpload entity in DDB
- Edit/refinement history surface (still dormant per existing memory)
- `listingId` GSI — only added if client-side filter ever stops being fast enough

## Open Questions

None blocking implementation. Decisions to revisit after live use:

- Should the dashboard hide listings older than N days behind a "Show archived" affordance? (Defer until an agent has >5 listings.)
- Should "Add another style" allow multi-style batch in one click? (Probably yes — wizard already supports batch — but UX needs sketching.)

## Implementation Order (high level)

To be detailed in the writing-plans pass. Rough order:

1. DDB helpers (`src/lib/db/listings.ts`) + Listing type.
2. API routes (`/api/listings/*`) + auth checks.
3. Modify `POST /api/stage` and `/api/stage/batch` to accept and persist `listingId`; auto-set `coverS3Key`.
4. Wizard step 1: Listing pill + sheet (existing listings + "+ New listing").
5. Dashboard: replace `StagingGallery` with `ListingsGrid` (Unsorted-first).
6. `/listings/[id]` page with grouped-by-hero source tiles.
7. `/listings/[id]/source/[heroKeyHash]` source detail + "+ Add another style" deep-link into wizard.
8. Wire deep-link path through wizard so hero step is skipped and listing is locked.
