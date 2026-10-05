import Link from 'next/link';
import { StaggerContainer, FadeUp } from '@/components/ui/motion';
import { Brand } from '@/components/onboarding/brand';

// Bring-your-own-keys teaser. PLANNED, NOT BUILT: every line of copy here
// must keep saying "coming soon" and must never imply the mode works today.
// Visual language: the dashed outline (card + rows) is the blueprint signal
// for "drawn up, not built yet". It sits on the page's base background as a
// quiet bridge into the cream-soft Pricing section, so it never competes
// with the tier grid that follows.
//
// The key-to-job mapping mirrors the live pipeline exactly: Claude Opus
// writes the room analysis, Gemini (NB Pro) renders take 1, OpenAI
// (GPT Image 2) renders takes 2 and 3. Keep it in sync if that changes.

const FR_DISPLAY = { fontVariationSettings: '"opsz" 144, "SOFT" 30' };
const FR_ITALIC = { fontVariationSettings: '"opsz" 144, "SOFT" 80' };
const FR_ROW = { fontVariationSettings: '"opsz" 72, "SOFT" 30' };

const KEYS = [
  { provider: 'Claude', job: 'Room analysis' },
  { provider: 'Gemini', job: 'Take 1' },
  { provider: 'OpenAI', job: 'Takes 2 and 3' },
] as const;

export function ByokTeaser() {
  return (
    <section
      id="bring-your-own-keys"
      aria-labelledby="byok-heading"
      className="relative z-10 pb-14 sm:pb-20"
    >
      <div className="mx-auto max-w-[1240px] px-5 sm:px-10">
        <StaggerContainer>
          <FadeUp>
            <div className="rounded-[20px] bg-sr-surface border border-dashed border-sr-hairline-2 p-6 sm:p-10 lg:p-14">
              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-10 lg:gap-16 items-center">
                {/* Copy column, strict reading order */}
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-3 mb-5 font-mono text-[12.5px] font-medium uppercase tracking-[0.2em] text-[#4F7E5E]">
                    <span className="size-1.5 rounded-full bg-[#4F7E5E]" aria-hidden />
                    Coming soon
                  </span>

                  {/* Two forced lines as block spans; text-balance inside each
                      so narrow widths wrap evenly instead of orphaning a word.
                      From lg the copy column is a share of the viewport, so the
                      size tracks it (calc) to keep line 2 on one line from 1024px up. */}
                  <h2
                    id="byok-heading"
                    className="font-display font-normal text-[clamp(26px,4.2vw,46px)] lg:text-[clamp(30px,calc(4.8vw_-_14px),46px)] leading-[1.1] tracking-[-0.03em] text-sr-ink"
                    style={FR_DISPLAY}
                  >
                    <span className="block text-balance">Bring your own API keys.</span>
                    <span className="block text-balance">
                      The power of <Brand />,{' '}
                      <em
                        className="not-italic font-display italic font-light text-[#4F7E5E] whitespace-nowrap"
                        style={FR_ITALIC}
                      >
                        at cost.
                      </em>
                    </span>
                  </h2>

                  <p className="mt-5 text-[clamp(16px,1.6vw,19px)] text-sr-ink-soft max-w-[520px] leading-[1.45]">
                    Connect your own Claude, Gemini and OpenAI keys and pay the providers directly for
                    what you generate.
                  </p>

                  <p className="mt-6 text-[15px] leading-[1.5] text-sr-ink-soft">
                    Until then, your first 30 credits are on us.{' '}
                    <Link
                      href="/onboarding"
                      className="font-medium text-sr-ink underline underline-offset-4 decoration-sr-ink/40 hover:text-sr-terra hover:decoration-sr-terra transition-colors whitespace-nowrap"
                    >
                      Start free
                    </Link>
                  </p>
                </div>

                {/* What each key powers */}
                <div className="min-w-0 w-full max-w-[480px] lg:max-w-none">
                  <div className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-sr-ink-mute">
                    Your keys
                  </div>
                  <ul className="flex flex-col gap-2.5">
                    {KEYS.map((row) => (
                      <li
                        key={row.provider}
                        className="flex items-center justify-between gap-4 rounded-xl border border-dashed border-sr-hairline-2 px-4 py-3.5"
                      >
                        <span
                          className="font-display text-[19px] sm:text-[20px] leading-none text-sr-ink whitespace-nowrap"
                          style={FR_ROW}
                        >
                          {row.provider}
                        </span>
                        <span className="font-mono text-[10.5px] sm:text-[11px] font-medium uppercase tracking-[0.14em] text-sr-ink-soft whitespace-nowrap">
                          {row.job}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </FadeUp>
        </StaggerContainer>
      </div>
    </section>
  );
}
