import { getLandingPicks } from '@/lib/db/landing-picks';
import { mergeAllSlots, isRoomVisible, type LandingSlot } from '@/lib/landing/slot-map';
import { getPublicImageUrl } from '@/lib/aws/image-urls';
import type { ThumbnailRoom } from '@/components/staging/style-row';
import { StyleShowcaseClient } from './style-showcase-client';

const ROOM_SLUGS: readonly ThumbnailRoom[] = [
  'living', 'bedroom', 'dining-room', 'master-suite', 'kitchen', 'bathroom',
  'home-office', 'kids-room', 'studio', 'guest-room', 'outdoor', 'living-room',
  'bedroom-bathroom',
] as const;

const PREFERRED_ORDER: readonly ThumbnailRoom[] = [
  'living-room', 'living', 'dining-room', 'bedroom', 'bedroom-bathroom',
  'master-suite', 'kitchen', 'bathroom', 'home-office', 'kids-room',
  'studio', 'guest-room', 'outdoor',
];

const HUMAN_LABELS: Record<ThumbnailRoom, string> = {
  'living': 'Living · Dining',
  'living-room': 'Living Room',
  'dining-room': 'Dining Room',
  'bedroom': 'Bedroom',
  'bedroom-bathroom': 'Bedroom · Bathroom',
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

  // Resolve every staged + hero S3 key from EVERY set across all rooms.
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
  // one fully-covered enabled set.
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
