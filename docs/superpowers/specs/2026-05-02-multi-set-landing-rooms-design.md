# Multi-set landing rooms — Design

**Date:** 2026-05-02
**Status:** Spec — awaiting plan
**Owner:** Tara
**Builds on:** `docs/superpowers/specs/2026-04-29-admin-landing-image-picker-design.md`

## Problem

The admin landing image picker today supports exactly one curated set per room type — one Bedroom, one Living Room, one Dining Room. Tara wants to surface multiple sets per room type on the public landing showcase (e.g. three different bedrooms a visitor can flick between) without making the room pill switcher repetitive ("Bedroom 1 | Bedroom 2 | Bedroom 3").

## Goals

- Admin can add 2+ sets per room type via the existing `/admin/landing-images` page.
- Public landing surfaces additional sets via small dot navigation in the preview area — primary pill row stays one entry per room TYPE.
- Each set is independently enabled and pick-completed; the visibility rule from v1 (all 12 styles + enabled) applies per-set.
- Existing single-set records keep working without migration; their data is treated as set 0.
- Server stays the source of truth for `heroByStyle` (resolved per-pick) and visibility filtering.

## Non-goals

- Reordering sets via drag-and-drop. v1 ships with stable ordinal indices; reorder is a v2.
- Per-set custom labels (e.g. "Master suite"). Sets are anonymous; the room TYPE is the headline.
- Sharing picks across sets. Each set is its own selection.
- Per-set notes or descriptions. Out of scope for the showcase.
- More than 10 sets per room. Validated server-side; nobody needs that many.

## User flows

### Admin (curating)

1. Open `/admin/landing-images` → click a room pill (e.g. Bedroom).
2. Sub-tab row appears under the pill row: `Set 1 | Set 2 | + Add new`. If only one set exists today, the row shows `Set 1 | + Add new` with no left tab visible (single-set rooms keep today's UX exactly).
3. Click `+ Add new` → an empty Set N opens in the picker. The 12-style grid is empty; the enable checkbox is off.
4. Pick the 12 styles via the existing modal flow → tick "Enable Bedroom (Set 2)" → Save. Server resolves heroByStyle, writes the new record.
5. Switch between sets via sub-tabs to compare or edit. Each set has its own Save button (only one set saves at a time).
6. Per-set "Delete this set" button (small, low-priority placement) removes the record. Set indices DO NOT shift — if you delete set 1 of 3, the remaining sets keep their indices (0 and 2), and `+ Add new` fills the lowest available slot.

### Public landing (visiting)

1. Visit `/`. Style showcase pill row shows one entry per room TYPE that has 1+ enabled+full sets.
2. Click Bedroom → preview renders the first set's first style.
3. If Bedroom has multiple visible sets, **dots appear at the bottom-right of the preview image** (`● ● ○`). Click a dot to flip to the next set; the active style stays the same.
4. Mobile: same dots, larger touch hitbox; horizontal swipe on the preview also navigates between sets.

## Architecture

```
DDB                                       Server (RSC)                       Client
─────────────────────────────             ─────────────────────────          ──────────────────────
LANDING_PICK / ROOM#bedroom#0       ─┐
LANDING_PICK / ROOM#bedroom#1       ─┼─→  getLandingPicks()                  StyleShowcaseClient
LANDING_PICK / ROOM#living-room#0   ─┘    returns:                            renders pill (room
LANDING_PICK / ROOM#bedroom         ─→    Record<room, LandingPick[]>        TYPE) + dots (set
   (legacy, treated as #0)                                                    index within type).
                                          mergeAllSlots(picks, resolved):
                                          Record<room, LandingSlot[]>
                                          ↓
                                          StyleShowcaseClient slotMap prop
```

## Data model

### Sort key format

```
sk = `ROOM#${slug}#${setIndex}`     // new format, setIndex ∈ 0..9
sk = `ROOM#${slug}`                  // legacy, single set; read as setIndex=0
```

Both formats coexist. Reads normalize to `{slug, setIndex}` tuples; writes always use the new format with explicit `#0` for the first set.

### Record shape

Unchanged from v1 — each `LandingPick` row is one set:

```typescript
interface LandingPick {
  pk: 'LANDING_PICK';
  sk: string;                         // ROOM#bedroom#0, ROOM#living-room#1, etc.
  enabled: boolean;
  picks: Partial<Record<StagingStyle, string>>;
  heroByStyle?: Partial<Record<StagingStyle, string>>;
  updatedAt: string;
}
```

The setIndex lives in `sk`. Does not need to be denormalized into the record body.

## Server contract

### `getLandingPicks()` (read)

Returns `Partial<Record<ThumbnailRoom, LandingPick[]>>` — array of sets per room type, sorted by ascending setIndex. Internal helper `parseSk(sk)` returns `{slug, setIndex}` for both formats.

### `getNextSetIndex(roomSlug)` (helper)

Reads existing sets for a room, returns the lowest unused index in `[0, 10)`. Used by the admin picker when the user clicks `+ Add new`.

### `upsertLandingPick(roomSlug, setIndex, input)` (write)

Now takes `setIndex` as a required second arg. Writes to `ROOM#${slug}#${setIndex}`. Existing sk-based merge logic stays the same. Server-side `heroByStyle` resolution from picks (already shipped 2026-05-02) is preserved.

### `deleteLandingPick(roomSlug, setIndex)` (new)

Deletes a single set record by sk. Returns `{ok: true}` on success. Admin endpoint:
- `DELETE /api/admin/landing-picks?roomSlug=bedroom&setIndex=1`

### `POST /api/admin/landing-picks`

Body grows a required `setIndex: number` field. Validation: `0 ≤ setIndex < 10`. 400 if out of range. Same admin gate.

### `GET /api/admin/landing-picks/candidates?room=...`

Unchanged — candidates (admin's eligible stagings) don't depend on set index.

## Slot-map changes

### `LandingSlot` (per set)

Stays the same shape as v1 — `{styles: Record<StagingStyle, LandingStyleSlot>}`.

### New: `mergeAllSlots`

```typescript
function mergeAllSlots(
  picks: Partial<Record<ThumbnailRoom, LandingPick[]>>,
  resolved: Record<string, string>,
): Partial<Record<ThumbnailRoom, LandingSlot[]>>;
```

For each room, runs the existing `mergeSlots` per pick, filters out nulls (disabled or unresolvable), preserves setIndex order. A room with all sets disabled gets dropped from the output entirely (matches v1 behaviour).

### Visibility rule (`isRoomFullyCovered`)

Already takes a single `LandingPick`. Stays unchanged. The new wrapper `isRoomVisible(LandingPick[])` returns `true` if at least one set in the array is fully covered.

## Client UI

### Public showcase (`StyleShowcaseClient`)

- New state: `activeSetByRoom: Record<ThumbnailRoom, number>` — last-clicked set index per room. Defaults to 0. Persists in component state across pill clicks (not URL).
- The `slotMap` prop becomes `Partial<Record<ThumbnailRoom, LandingSlot[]>>`.
- Resolve `activeSlot = slotMap[activeRoom]?.[activeSetByRoom[activeRoom] ?? 0]`. The rest of the existing render path (StyleRow list, BeforeAfterSlider preview) consumes one slot exactly as today — no change inside the preview itself.
- New dots component: rendered inside the BeforeAfterSlider container, absolute bottom-right, only when `slotMap[activeRoom].length > 1`. Each dot is a button; active dot is filled, others outlined. Plain CSS, no extra component file.
- Mobile horizontal swipe handled by listening for touch events on the preview container; each successful swipe advances `activeSetByRoom[activeRoom]` (clamps at ends).

### Admin picker (`landing-images-client.tsx`)

- New state: `activeSetIndexByRoom: Record<ThumbnailRoom, number>` and `setsByRoom: Record<ThumbnailRoom, LandingPick[]>` (replaces today's flat `picks: Partial<Record<ThumbnailRoom, LandingPick>>`).
- Sub-tab row under the room pills, only when picking a room: `Set 1` (button per existing set) + `+ Add new` (creates a LOCAL-ONLY draft set with the next available index, switches to it, no DDB write yet).
- The new set only persists when the admin hits Save — first save creates the record. Until then it's draft state in memory; navigating away discards it.
- Each persisted set tab also gets a small `×` button for delete. Clicking it shows an in-app confirm modal (not native `confirm()` per project rule). Confirming fires `DELETE /api/admin/landing-picks?roomSlug=...&setIndex=...` and removes the set from local state.
- Active set's draft state (`draftPicks`, `draftHeroes`, `draftEnabled`) operates on the active set only.
- Save button behaviour unchanged for the active set — POST with `setIndex` to upsert.

## Edge cases

| Case | Handling |
|------|----------|
| Existing legacy `ROOM#{slug}` records | `parseSk` recognises and returns setIndex=0. Read transparently. On next save, the API rewrites to `ROOM#{slug}#0` to normalise (idempotent). |
| Admin deletes set 0, leaves set 1 | `setIndex` stays 1 for the surviving set. `+ Add new` fills slot 0 next time (lowest available). |
| All sets for a room disabled | Room drops from public landing pill switcher. Same as v1 single-set behaviour. |
| User clicks dot for a set that's been disabled mid-session | Server's filter dropped it; the dot row only renders sets present in the slot map, so this can't happen client-side. |
| `setIndex` collision (two writes racing) | Last-write-wins per sk. Acceptable — single admin scenario. |
| Public landing dot navigation on a touch-only device | Dots are full buttons with adequate touch targets (32px min). Swipe is a bonus. |
| `+ Add new` clicked with 10 sets already present | Button disabled; tooltip explains the limit. Server also rejects setIndex >= 10 with 400. |

## Backward compatibility

Existing 4 `LANDING_PICK` records (Bedroom, Studio, Living Room, Dining Room) all use `ROOM#{slug}` format today. They will:
- Read correctly as setIndex=0 immediately after deploy
- Continue rendering on the public landing without admin action
- Get rewritten to `ROOM#{slug}#0` format the next time the admin saves them (transparent)

No migration script needed.

## Performance

- One DDB query per page render (existing). The query already returns all `LANDING_PICK` records, so adding more sets just returns more items in the same call. No extra round-trips.
- Public landing rendered with `revalidate = 60` already — admin saves are visible within a minute.
- Per-set `getPublicImageUrl` calls happen in parallel (existing pattern). Adds N more signed URL generations per extra set per room.

## Out of scope (deferred)

- Drag-to-reorder sets within a room.
- Per-set labels / descriptions.
- Sharing picks across sets.
- More than 10 sets.
- Mobile-specific dot variants (e.g. swipe gestures with momentum).
- Public-landing analytics on which sets get clicked most.

## Testing

- **Unit:** `parseSk` (new + legacy formats), `getNextSetIndex` (gaps + full slate), `mergeAllSlots`, `isRoomVisible`.
- **Integration:** save endpoint accepts setIndex, rejects out-of-range; delete endpoint removes one record; reads return arrays.
- **Manual smoke:** add a second Bedroom set in admin, save, refresh public landing, see dot row, click dots, see preview swap. Delete the new set, refresh, dots disappear, primary set still renders.
- **Regression:** legacy `ROOM#{slug}` records still appear on the landing without admin action.

## Files touched

- **New:** none
- **Modified:** `src/lib/db/landing-picks.ts` (sk parser, array reads, write+delete with setIndex), `src/lib/landing/slot-map.ts` (mergeAllSlots, isRoomVisible), `src/components/landing/style-showcase.tsx` (group by room, pass arrays), `src/components/landing/style-showcase-client.tsx` (activeSetByRoom + dot row + swipe), `src/app/admin/landing-images/landing-images-client.tsx` (sub-tabs, +Add, ×Delete), `src/app/api/admin/landing-picks/route.ts` (setIndex param + DELETE handler), tests updated.
