import { getLandingPicks } from '@/lib/db/landing-picks';
import type { ThumbnailRoom } from '@/components/staging/style-row';
import { LandingImagesClient } from './landing-images-client';

export const dynamic = 'force-dynamic';

// Mirrors ROOM_SLUGS in src/components/staging/style-row.tsx. Inlined here
// because that file is 'use client' — pulling a value (not just a type)
// from a client module into a server component breaks the server-side
// prerender ("Cannot read Symbol exports" — Next.js 14 specific). Keep
// these in sync when adding new room slugs.
const ROOM_SLUGS: readonly ThumbnailRoom[] = [
  'living',
  'bedroom',
  'dining-room',
  'master-suite',
  'kitchen',
  'bathroom',
  'home-office',
  'kids-room',
  'studio',
  'guest-room',
  'outdoor',
  'living-room',
  'bedroom-bathroom',
] as const;

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
