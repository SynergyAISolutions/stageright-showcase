import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { AppHeader } from '@/components/layout/app-header';
import { CopyCard } from '@/components/disclosure/copy-card';
import { WhyItMatters } from '@/components/disclosure/why-it-matters';
import { LISTING_COPY_VARIANTS, COPY_LAST_UPDATED } from '@/lib/disclosure/copy';

export const dynamic = 'force-dynamic';

export default async function ListingCopyPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="min-h-[100dvh] bg-sr-cream">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-6 sm:px-8 py-12 sm:py-16 flex flex-col gap-10">
        <header className="flex flex-col gap-3">
          <span className="inline-flex items-center gap-3 font-mono text-[12px] font-semibold tracking-[0.2em] uppercase text-sr-terra">
            <span className="size-1.5 rounded-full bg-sr-terra" aria-hidden />
            Listing copy
          </span>
          <h1 className="font-display text-sr-ink text-[40px] sm:text-[52px] leading-[1.0] tracking-[-0.025em]">
            Copy &amp; paste for{' '}
            <span className="italic text-sr-terra">any listing.</span>
          </h1>
          <p className="text-[15px] sm:text-[16px] text-sr-ink/70 leading-relaxed max-w-prose">
            Drop one of these lines into your listing description. We&apos;ve sized them so they read
            well next to your real-estate copy.
          </p>
        </header>

        <section className="flex flex-col gap-4">
          {LISTING_COPY_VARIANTS.map((v) => (
            <CopyCard key={v.id} variant={v} />
          ))}
        </section>

        <aside className="rounded-2xl bg-sr-surface border border-sr-hairline px-5 py-4 text-[13px] leading-relaxed text-sr-ink/75">
          StageRight handles the on-image label and provenance metadata. Including a one-line note
          like the above in your listing description is your call &mdash; most platforms (REA, Domain,
          Zillow, Rightmove) require it, and it builds buyer trust.{' '}
          <span className="text-sr-ink-mute italic">We&apos;re not legal advice.</span>
        </aside>

        <WhyItMatters />

        <footer className="text-[12px] text-sr-ink-mute text-center">
          Last updated {COPY_LAST_UPDATED}.{' '}
          <a href="/legal/terms" className="underline hover:text-sr-terra">
            Read the full Terms of Service &rarr;
          </a>
        </footer>
      </main>
    </div>
  );
}
