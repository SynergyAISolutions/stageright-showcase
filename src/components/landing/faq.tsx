'use client';

import { StaggerContainer, FadeUp } from '@/components/ui/motion';

// FAQ content mirrors the FAQPage JSON-LD in layout.tsx — keep in sync if
// you edit. Native <details> / <summary> so the answer text is in the DOM
// even when collapsed (crawlable and keyboard-accessible).
const faqs = [
  {
    q: 'Is virtual staging MLS-compliant?',
    a: "Yes. StageRight output is virtual staging, not a representation of actual furniture on site. Agents should disclose in listing descriptions and label photos as 'virtually staged'. That's standard practice across Australian REIA, US NAR and Canadian REBBA guidelines.",
  },
  {
    q: 'How does AI virtual staging compare to traditional staging?',
    a: 'Physical staging typically runs $3,500–$6,000 for a three-bedroom house, takes weeks, and requires a vacant property with furniture rental and movers. Human-edit virtual staging is about $23–$35 per photo with a 24–48 hour turnaround. StageRight is from $0.73 AUD per credit (one staged image, at the 300-credit Bulk rate), in just minutes, and works on any photo, empty or furnished.',
  },
  {
    q: 'What image formats and resolutions does StageRight accept?',
    a: 'JPG or PNG up to 10 MB, any resolution. Phone photos work fine. Furnished or empty rooms are both supported.',
  },
  {
    q: 'What styles can I stage in?',
    a: 'Twelve curated interior styles: Modern, Scandinavian, Coastal, Hamptons, Luxury, Farmhouse, Mid-Century Modern, Industrial, Minimalist, Contemporary Australian, Japandi and Boho. Contemporary Australian is specifically tuned to the AU market aesthetic.',
  },
  {
    q: 'Do credits expire?',
    a: 'No. Credits never expire while your account is active. If the service is ever sunset, unused credits are refunded at purchase price. No forfeiture clauses.',
  },
  {
    q: "What's a 'take'?",
    a: 'One AI-generated version of your room in a chosen style. AI is creative and inconsistent, so Three Takes (the default) gives three versions of every styling and you almost always have one you love. You can also choose Single Take per style at checkout for half the credits.',
  },
];

const FR_DISPLAY = { fontVariationSettings: '"opsz" 144, "SOFT" 30' };
const FR_ITALIC = { fontVariationSettings: '"opsz" 144, "SOFT" 80' };
const FR_QUESTION = { fontVariationSettings: '"opsz" 48, "SOFT" 30' };

export function Faq() {
  return (
    <section id="faq" className="relative z-10 py-20 sm:py-28 lg:py-32">
      <div className="mx-auto max-w-[1240px] px-5 sm:px-10">
        <StaggerContainer>
          <FadeUp>
            <div className="max-w-[760px] mx-auto text-center mb-12 sm:mb-16">
              <span className="inline-flex items-center gap-3 mb-5 font-mono text-[12.5px] font-medium uppercase tracking-[0.2em] text-[#4F7E5E]">
                <span className="size-1.5 rounded-full bg-[#4F7E5E]" aria-hidden />
                Frequently asked
              </span>
              <h2
                className="font-display font-normal text-[clamp(32px,5vw,56px)] leading-[1.04] tracking-[-0.03em] text-sr-ink"
                style={FR_DISPLAY}
              >
                Questions about
                <br />
                AI virtual staging,{' '}
                <em
                  className="not-italic font-display italic font-light text-sr-terra"
                  style={FR_ITALIC}
                >
                  answered.
                </em>
              </h2>
            </div>
          </FadeUp>

          <FadeUp>
            <div className="max-w-[820px] mx-auto">
              {faqs.map((item, i) => (
                <details
                  key={item.q}
                  className={`faq-item group ${i === 0 ? 'border-t' : ''} border-b border-sr-hairline`}
                >
                  <summary className="list-none cursor-pointer flex items-center justify-between gap-6 py-6 sm:py-7 transition-colors hover:text-sr-terra">
                    <h3
                      className="font-display font-normal text-[clamp(18px,1.7vw,22px)] leading-[1.3] tracking-[-0.015em] text-current"
                      style={FR_QUESTION}
                    >
                      {item.q}
                    </h3>
                    <span
                      aria-hidden
                      className="flex-shrink-0 size-3.5 transition-transform duration-300 group-open:rotate-45 text-sr-ink group-hover:text-sr-terra"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M7 3v8M3 7h8"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                  </summary>
                  <div className="pb-6 sm:pb-7 max-w-[90%]">
                    <p className="text-[15px] leading-[1.65] text-sr-ink-soft">{item.a}</p>
                  </div>
                </details>
              ))}
            </div>
          </FadeUp>
        </StaggerContainer>
      </div>
    </section>
  );
}
