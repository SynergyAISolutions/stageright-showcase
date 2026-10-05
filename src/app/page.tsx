import { LandingShell } from '@/components/landing/landing-shell';
import { Nav } from '@/components/landing/nav';
import { Hero } from '@/components/landing/hero';
import { HowItWorks } from '@/components/landing/how-it-works';
import { StyleShowcase } from '@/components/landing/style-showcase';
import { Comparison } from '@/components/landing/comparison';
import { Disclosure } from '@/components/landing/disclosure';
// ThreeTakesSection — held off the live landing until we have real
// admin-generated triple-bundle images to populate it. The component
// ships in the repo (src/components/landing/three-takes-section.tsx);
// re-import and re-insert below once assets exist under
// public/landing/three-takes/.
// import { ThreeTakesSection } from '@/components/landing/three-takes-section';
import { ByokTeaser } from '@/components/landing/byok-teaser';
import { Pricing } from '@/components/landing/pricing';
import { Faq } from '@/components/landing/faq';
import { Footer } from '@/components/landing/footer';

// Force-dynamic: every public landing render hits the Lambda + DDB. The
// 60s ISR cache was reliably stale-pinning admin saves for minutes at a
// time (revalidatePath wasn't propagating in practice on Amplify). With
// the picker still being actively curated, instant freshness > cache
// performance. Revisit once the curating lull starts and traffic grows.
export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <LandingShell>
      <Nav />
      <main>
        <Hero />
        <Comparison />
        <Disclosure />
        <HowItWorks />
        <StyleShowcase />
        {/* <ThreeTakesSection /> — held until admin triple-bundle images exist */}
        <ByokTeaser />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </LandingShell>
  );
}
