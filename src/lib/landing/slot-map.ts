import type { LandingPick } from '@/lib/db/landing-picks';
import type { ThumbnailRoom } from '@/components/staging/style-row';
import { STAGING_STYLES, type StagingStyle } from '@/lib/ai/prompts';

export interface LandingStyleSlot {
  /** URL of the staged image to show. */
  src: string;
  /** URL of the empty-room source the staged image was generated from.
   *  Optional — when present, the public landing renders a draggable
   *  before/after slider; when missing it shows the staged image only. */
  heroSrc?: string;
}

export interface LandingSlot {
  styles: Record<StagingStyle, LandingStyleSlot>;
}

/**
 * Compute the public-landing slot map for a single room.
 *
 * Visibility rule: a room appears on the landing iff it has an enabled
 * LandingPick record with all 12 styles picked. The legacy local-JPG
 * fallback path is GONE — only admin-curated rooms appear, by Tara's
 * explicit direction (2026-05-02).
 *
 * @param pick      - Admin-saved LandingPick record from DDB.
 * @param resolved  - Map of S3 key → resolved public URL (signed S3
 *   URL or CloudFront), pre-computed by the caller (server component).
 *   This keeps mergeSlots a pure function.
 */
export function mergeSlots(
  pick: LandingPick | undefined,
  resolved: Record<string, string> = {},
): LandingSlot | null {
  if (!pick) return null;
  if (pick.enabled === false) return null;

  const styles = {} as Record<StagingStyle, LandingStyleSlot>;
  let hasAny = false;
  for (const style of STAGING_STYLES) {
    const stagedKey = pick.picks?.[style];
    const heroKey = pick.heroByStyle?.[style];
    const stagedUrl = stagedKey ? resolved[stagedKey] : undefined;
    if (!stagedKey || !stagedUrl) {
      // Missing pick or unresolvable URL — leave slot blank rather than
      // fabricating a URL or falling back to a legacy file.
      continue;
    }
    hasAny = true;
    styles[style] = {
      src: stagedUrl,
      ...(heroKey && resolved[heroKey] ? { heroSrc: resolved[heroKey] } : {}),
    };
  }
  if (!hasAny) return null;
  return { styles };
}

/**
 * Returns true if a room has full style coverage (all 12 styles picked
 * by the admin) and should appear on the public landing pill switcher.
 *
 * No legacy fallback: the only path to landing visibility is an
 * enabled admin pick with all 12 styles set. enabled=false always hides.
 */
export function isRoomFullyCovered(
  pick: LandingPick | undefined,
): boolean {
  if (!pick) return false;
  if (!pick.enabled) return false;
  return STAGING_STYLES.every((s) => Boolean(pick.picks?.[s]));
}

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
      if (!isRoomFullyCovered(set)) continue;
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
