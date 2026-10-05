'use client';

/**
 * /design-preview
 *
 * The locked design system for the onboarding rebuild. Open this page,
 * resize the window across mobile / tablet / desktop, and judge the
 * tokens + primitives in real fonts and real colours.
 *
 * Nothing here is wired into the live onboarding yet. Once each section
 * is approved, the components used here become the source of truth for
 * the real screens.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { StyleSwitcherTrigger } from '@/components/dashboard/style-switcher-trigger';

const EXPO = [0.16, 1, 0.3, 1] as const;

export default function DesignPreviewPage() {
  return (
    <div className="bg-surface-secondary min-h-[100dvh]">
      <PreviewNav />
      <main className="mx-auto max-w-[1200px] px-6 sm:px-10 lg:px-16 py-16 sm:py-24 space-y-32">
        <TokensSection />
        <PrimitivesSection />
      </main>
      <footer className="mx-auto max-w-[1200px] px-6 sm:px-10 lg:px-16 pb-24 text-[12px] text-brand-navy/55 font-medium">
        Resize the browser window to see the mobile / sm / lg variants.
      </footer>
    </div>
  );
}

/* ───────────────────── Nav ───────────────────── */

function PreviewNav() {
  return (
    <nav className="sticky top-0 z-30 bg-surface-secondary/85 backdrop-blur-md border-b border-brand-navy/[0.08]">
      <div className="mx-auto max-w-[1200px] px-6 sm:px-10 lg:px-16 h-14 flex items-center justify-between">
        <span className="font-heading text-[18px] sm:text-[20px] tracking-tight text-brand-navy">
          StageRight · Design Preview
        </span>
        <div className="flex items-center gap-5 text-[12px] sm:text-[13px] font-semibold uppercase tracking-[0.18em] text-brand-navy/65">
          <a href="#tokens" className="hover:text-brand-navy transition-colors">Tokens</a>
          <a href="#primitives" className="hover:text-brand-navy transition-colors">Primitives</a>
        </div>
      </div>
    </nav>
  );
}

/* ───────────────────── Section header ───────────────────── */

function SectionTitle({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <header id={id} className="scroll-mt-24">
      <p className="inline-flex items-center gap-2 text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.24em] text-brand-navy/60">
        <span aria-hidden className="block size-1 rounded-full bg-brand-teal" />
        {eyebrow}
      </p>
      <h2 className="mt-3 font-heading text-brand-navy text-[36px] sm:text-[52px] lg:text-[72px] leading-[1.0] tracking-[-0.02em]">
        {title}
      </h2>
      <span aria-hidden className="block mt-6 h-[2px] w-12 bg-brand-teal/65" />
    </header>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-heading text-brand-navy text-[24px] sm:text-[28px] tracking-tight leading-tight">
      {children}
    </h3>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[11px] sm:text-[12px] font-mono text-brand-navy/55 mt-1.5">
      {children}
    </span>
  );
}

/* ───────────────────── 1. TOKENS ───────────────────── */

function TokensSection() {
  return (
    <section className="space-y-20">
      <SectionTitle id="tokens" eyebrow="Section 1" title="Design tokens." />

      {/* Typography */}
      <div className="space-y-10">
        <SubTitle>Typography</SubTitle>
        <p className="text-[16px] sm:text-[18px] text-brand-navy/75 max-w-[60ch] font-medium leading-relaxed">
          DM Serif Display for editorial moments, Outfit for everything else.
          Each role renders here at the actual size for the current viewport
          width — resize the window and watch the scale change.
        </p>

        <div className="space-y-12 pt-6">
          <TypeSpec
            label="Eyebrow"
            classes="text-[11px] sm:text-[12px] lg:text-[13px] font-semibold uppercase tracking-[0.24em] text-brand-navy/60"
            sample={
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className="block size-1 rounded-full bg-brand-teal" />
                The shift
              </span>
            }
            note="Always paired with a 4px brand-teal dot. Use to introduce headlines, never alone."
          />

          <TypeSpec
            label="Hero headline"
            classes="font-heading text-brand-navy text-[44px] sm:text-[76px] lg:text-[128px] leading-[0.96] tracking-[-0.025em]"
            sample={
              <>Under a minute. <span className="italic text-brand-teal">From $0.73 AUD 🇦🇺 a photo.</span></>
            }
            note="Welcome / Bridge / Bombshell post-stat / FactCredit. The italic teal accent on the punchline word is mandatory — at least one per hero."
          />

          <TypeSpec
            label="Section headline"
            classes="font-heading text-brand-navy text-[32px] sm:text-[48px] lg:text-[72px] leading-[1.0] tracking-[-0.02em]"
            sample={<>What do you do?</>}
            note="Role / Volume / Listing-type / FactAi / HowItWorks / Style / Result. Italic teal accent still allowed but optional."
          />

          <TypeSpec
            label="Sub / supporting"
            classes="text-[17px] sm:text-[20px] lg:text-[24px] font-medium text-brand-navy/75 leading-snug"
            sample={<>Ninety seconds from upload to staged.</>}
            note="The line directly under a headline. Sits 24px below — same idea, continued."
          />

          <TypeSpec
            label="Stat"
            classes="font-heading text-brand-teal text-[88px] sm:text-[136px] lg:text-[200px] leading-[0.92] tracking-[-0.03em] tabular-nums"
            sample={<>$2,700</>}
            note="The editorial peak. One per screen, max. Bombshell number, FactCredit punchline word. Always teal on cream."
          />

          <TypeSpec
            label="Body / choice label"
            classes="text-[17px] sm:text-[18px] font-medium text-brand-navy"
            sample={<>Solo agent</>}
            note="Choice row labels, body copy, captions."
          />

          <TypeSpec
            label="Button label"
            classes="text-[16px] sm:text-[17px] font-semibold tracking-tight text-white"
            sample={<span className="bg-brand-navy px-5 py-2 rounded-md">Continue</span>}
            note="White on navy. tracking-tight."
          />
        </div>
      </div>

      {/* Spacing */}
      <div className="space-y-10 pt-12 border-t border-brand-navy/[0.08]">
        <SubTitle>Spacing rhythm</SubTitle>
        <p className="text-[16px] sm:text-[18px] text-brand-navy/75 max-w-[60ch] font-medium leading-relaxed">
          One rule: same idea = close, different idea = breathing room. Five
          tokens cover every gap on every screen.
        </p>
        <div className="space-y-6 pt-4">
          <SpacingSpec px={6} token="gap-1.5" use="Within a single line — eyebrow dot ↔ label" />
          <SpacingSpec px={12} token="gap-3" use="Within one visual unit — icon + label" />
          <SpacingSpec px={24} token="gap-6" use="Same idea continued — headline → sub" />
          <SpacingSpec px={40} token="gap-10" use="Different idea begins — one paragraph → next" />
          <SpacingSpec px={64} token="gap-16" use="Major section break — content end → CTA" />
        </div>
      </div>

      {/* Colour */}
      <div className="space-y-10 pt-12 border-t border-brand-navy/[0.08]">
        <SubTitle>Colour roles</SubTitle>
        <p className="text-[16px] sm:text-[18px] text-brand-navy/75 max-w-[60ch] font-medium leading-relaxed">
          Brand-teal appears on every onboarding screen as the cream-canvas accent.
          Brand-teal-light only ever appears on dark backgrounds. Brand-gold and
          brand-coral are reserved.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
          <Swatch hex="#f8f9fb" name="surface-secondary" role="The cream canvas. Every screen's home." textOnDark={false} />
          <Swatch hex="#0f1d2e" name="brand-navy" role="Dominant ink. Headlines, body, CTA bg." textOnDark={true} />
          <Swatch hex="#1a7a6d" name="brand-teal" role="Accent on cream only. Italic word, eyebrow dot, hairline rule." textOnDark={true} />
          <Swatch hex="#23a594" name="brand-teal-light" role="Accent on dark only. Generating screen, CTA inner-arrow tint." textOnDark={true} />
          <Swatch hex="#c9a24f" name="brand-gold" role="Reserved — not used in onboarding." textOnDark={true} />
          <Swatch hex="#d4725c" name="brand-coral" role="Reserved — not used in onboarding." textOnDark={true} />
        </div>
      </div>

      {/* Motion */}
      <div className="space-y-10 pt-12 border-t border-brand-navy/[0.08]">
        <SubTitle>Motion</SubTitle>
        <p className="text-[16px] sm:text-[18px] text-brand-navy/75 max-w-[60ch] font-medium leading-relaxed">
          One easing curve for everything: <code className="font-mono text-[14px] text-brand-teal">cubic-bezier(0.16, 1, 0.3, 1)</code>.
          Click the demos to replay.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          <MotionDemo title="Reveal beat" duration="0.85s" description="translate-y-18 blur-8 opacity-0 → 0/0/1">
            {(key) => (
              <motion.p
                key={key}
                initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.85, ease: EXPO }}
                className="font-heading text-brand-navy text-[28px] sm:text-[32px] tracking-tight"
              >
                The shift arrives.
              </motion.p>
            )}
          </MotionDemo>

          <MotionDemo title="Stat scale-in" duration="1.1s" description="adds scale-0.78 → 1">
            {(key) => (
              <motion.p
                key={key}
                initial={{ opacity: 0, y: 14, scale: 0.78, filter: 'blur(10px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                transition={{ duration: 1.1, ease: EXPO }}
                className="font-heading text-brand-teal text-[64px] sm:text-[88px] tracking-tight tabular-nums"
              >
                $2,700
              </motion.p>
            )}
          </MotionDemo>

          <MotionDemo title="Suspense hold" duration="1.5s before content arrives" description="eyebrow with «...» sits alone, then the content lands">
            {(key) => <SuspenseDemo key={key} />}
          </MotionDemo>

          <MotionDemo title="Page transition" duration="0.7s" description="cross-fade between screens">
            {(key) => <PageTransitionDemo key={key} />}
          </MotionDemo>
        </div>
      </div>
    </section>
  );
}

function TypeSpec({
  label,
  classes,
  sample,
  note,
}: {
  label: string;
  classes: string;
  sample: React.ReactNode;
  note: string;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6 lg:gap-12 items-start">
      <div className="lg:pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-navy/55">
          {label}
        </p>
        <p className="mt-2 text-[14px] text-brand-navy/75 max-w-[28ch] leading-snug">
          {note}
        </p>
      </div>
      <div>
        <div className={classes}>{sample}</div>
        <Caption>{classes}</Caption>
      </div>
    </div>
  );
}

function SpacingSpec({ px, token, use }: { px: number; token: string; use: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3 sm:gap-8 items-center">
      <div>
        <p className="font-mono text-[13px] text-brand-navy">{token}</p>
        <p className="font-mono text-[11px] text-brand-navy/55">{px}px</p>
      </div>
      <div className="flex items-center gap-4">
        <span className="block bg-brand-teal h-1 rounded-full" style={{ width: `${px * 2}px` }} />
        <span className="text-[13px] sm:text-[14px] text-brand-navy/85 font-medium">{use}</span>
      </div>
    </div>
  );
}

function Swatch({
  hex,
  name,
  role,
  textOnDark,
}: {
  hex: string;
  name: string;
  role: string;
  textOnDark: boolean;
}) {
  return (
    <div className="rounded-2xl overflow-hidden border border-brand-navy/[0.08]">
      <div
        className="h-28 flex items-end p-4"
        style={{ backgroundColor: hex }}
      >
        <span
          className={`font-mono text-[12px] font-semibold ${textOnDark ? 'text-white' : 'text-brand-navy'}`}
        >
          {hex}
        </span>
      </div>
      <div className="p-4 bg-white">
        <p className="font-mono text-[13px] text-brand-navy">{name}</p>
        <p className="mt-1 text-[13px] text-brand-navy/65 leading-snug">{role}</p>
      </div>
    </div>
  );
}

function MotionDemo({
  title,
  duration,
  description,
  children,
}: {
  title: string;
  duration: string;
  description: string;
  children: (key: number) => React.ReactNode;
}) {
  const [k, setK] = useState(0);
  return (
    <div className="rounded-2xl border border-brand-navy/[0.08] bg-white p-6 sm:p-8">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="font-heading text-[20px] sm:text-[22px] text-brand-navy tracking-tight">
            {title}
          </p>
          <p className="mt-1 text-[12px] font-mono text-brand-navy/55">{duration} · {description}</p>
        </div>
        <button
          type="button"
          onClick={() => setK((x) => x + 1)}
          className="text-[12px] font-semibold uppercase tracking-[0.18em] text-brand-teal hover:text-brand-teal/70 transition-colors"
        >
          Replay ↻
        </button>
      </div>
      <div className="mt-6 min-h-[140px] flex items-center justify-center">
        {children(k)}
      </div>
    </div>
  );
}

function SuspenseDemo() {
  const [phase, setPhase] = useState<'eyebrow' | 'content'>('eyebrow');
  useEffect(() => {
    const t = setTimeout(() => setPhase('content'), 1500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="text-center space-y-6 min-h-[80px]">
      <motion.span
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EXPO }}
        className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.24em] text-brand-navy/65"
      >
        <span aria-hidden className="block size-1 rounded-full bg-brand-teal" />
        And one more thing…
      </motion.span>
      {phase === 'content' && (
        <motion.p
          initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.85, ease: EXPO }}
          className="font-heading text-brand-navy text-[24px] sm:text-[28px] tracking-tight"
        >
          Every 7 stages, <span className="italic text-brand-teal">on us.</span>
        </motion.p>
      )}
    </div>
  );
}

function PageTransitionDemo() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.7, ease: EXPO }}
      className="font-heading text-brand-navy text-[28px] tracking-tight"
    >
      Next screen.
    </motion.div>
  );
}

/* ───────────────────── 2. PRIMITIVES ───────────────────── */

function PrimitivesSection() {
  return (
    <section className="space-y-20">
      <SectionTitle id="primitives" eyebrow="Section 2" title="Component primitives." />

      <div className="space-y-10">
        <SubTitle>1. Page shell + Progress bar</SubTitle>
        <p className="text-[16px] sm:text-[18px] text-brand-navy/75 max-w-[60ch] font-medium leading-relaxed">
          The page shell is the same on every onboarding screen. Progress bar at top
          (5–6px, brand-teal-light fill, glow). Content area centred. CTA pinned at
          the bottom with thumb-zone padding from the screen edges.
        </p>
        <PageShellPreview />
      </div>

      <div className="space-y-10 pt-12 border-t border-brand-navy/[0.08]">
        <SubTitle>2. CTA — full-width, bottom-pinned, thumb-zone padding</SubTitle>
        <p className="text-[16px] sm:text-[18px] text-brand-navy/75 max-w-[60ch] font-medium leading-relaxed">
          One CTA component. Solid navy rectangle, white label, brand-teal-light arrow.
          On mobile: full-width with 24px horizontal margin and 24px above the safe-area-inset.
          On desktop: max-width 480px, centred, same bottom-pinning.
        </p>
        <CtaPreview />
      </div>

      <div className="space-y-10 pt-12 border-t border-brand-navy/[0.08]">
        <SubTitle>3. Eyebrow</SubTitle>
        <p className="text-[16px] sm:text-[18px] text-brand-navy/75 max-w-[60ch] font-medium leading-relaxed">
          Tiny editorial pill. Always with a 4px brand-teal dot. Lives directly above
          a headline as the eyebrow tag.
        </p>
        <div className="flex flex-wrap gap-x-12 gap-y-6 pt-4">
          <Eyebrow>Welcome</Eyebrow>
          <Eyebrow>About you</Eyebrow>
          <Eyebrow>The shift</Eyebrow>
          <Eyebrow>How to read your stage</Eyebrow>
          <Eyebrow>And one more thing…</Eyebrow>
        </div>
      </div>

      <div className="space-y-10 pt-12 border-t border-brand-navy/[0.08]">
        <SubTitle>4. Choice row — default / hover / selected</SubTitle>
        <p className="text-[16px] sm:text-[18px] text-brand-navy/75 max-w-[60ch] font-medium leading-relaxed">
          Selected state is solid navy, never a transparent tint. Distinct from the
          cream canvas at a glance.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
          <ChoiceRowDemo state="default" />
          <ChoiceRowDemo state="hover" />
          <ChoiceRowDemo state="selected" />
          <ChoiceRowDemo state="selected-with-sub" />
        </div>
      </div>

      <div className="space-y-10 pt-12 border-t border-brand-navy/[0.08]">
        <SubTitle>5. Choice tile — for the Rooms grid</SubTitle>
        <p className="text-[16px] sm:text-[18px] text-brand-navy/75 max-w-[60ch] font-medium leading-relaxed">
          Same selected-state rule as the row: solid navy, white text, brand-teal-light icon.
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 pt-4 max-w-[680px]">
          {(['Living Room', 'Bedroom', 'Kitchen', 'Bathroom'] as const).map((label, i) => (
            <ChoiceTileDemo key={label} label={label} selected={i === 1} />
          ))}
        </div>
      </div>

      <div className="space-y-10 pt-12 border-t border-brand-navy/[0.08]">
        <SubTitle>6. Style switcher trigger</SubTitle>
        <p className="text-[16px] sm:text-[18px] text-brand-navy/75 max-w-[60ch] font-medium leading-relaxed">
          The room&apos;s headline in the gallery viewer. When a room has more than one style,
          the name carries a small hairline pill with a counter and chevron so it reads as the
          room&apos;s main menu. Hover a trigger, or click it to toggle the open state. Long names
          wrap the pill onto its own line.
        </p>
        <StyleSwitcherPreview />
      </div>
    </section>
  );
}

function PageShellPreview() {
  const [progress, setProgress] = useState(0.4);
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-brand-navy/[0.10] overflow-hidden bg-surface-secondary shadow-[0_24px_60px_-30px_rgba(15,29,46,0.25)]">
        <div className="relative w-full aspect-[9/16] sm:aspect-[16/10] max-h-[640px] overflow-hidden">
          {/* Progress bar */}
          <div className="absolute left-0 right-0 top-0 h-[5px] sm:h-[6px] bg-brand-navy/[0.15] z-20">
            <div
              className="h-full bg-brand-teal-light transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                width: `${progress * 100}%`,
                boxShadow: '0 0 14px rgba(35,165,148,0.7)',
              }}
            />
          </div>

          {/* Content area — centred placeholder */}
          <div className="absolute inset-0 pt-10 pb-[124px] flex flex-col justify-center items-center px-8">
            <div className="flex flex-col items-center text-center gap-6 max-w-[44ch]">
              <span className="inline-flex items-center gap-2 text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.24em] text-brand-navy/60">
                <span aria-hidden className="block size-1 rounded-full bg-brand-teal" />
                Section eyebrow
              </span>
              <h3 className="font-heading text-brand-navy text-[28px] sm:text-[44px] leading-[1.0] tracking-[-0.02em]">
                Headline area.
                <br />
                <span className="italic text-brand-teal">Centred content.</span>
              </h3>
              <p className="text-[15px] sm:text-[17px] font-medium text-brand-navy/70 leading-snug">
                Supporting line lives here, max ~40 chars wide.
              </p>
            </div>
          </div>

          {/* CTA — bottom pinned */}
          <div className="absolute left-0 right-0 bottom-0 px-6 pb-6 pt-4">
            <CtaButton label="Continue" full />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 text-[12px] font-mono text-brand-navy/65">
        <span>progress preview:</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={progress}
          onChange={(e) => setProgress(parseFloat(e.target.value))}
          className="flex-1 max-w-xs"
        />
        <span>{Math.round(progress * 100)}%</span>
      </div>
    </div>
  );
}

const SWITCHER_STATES = [
  { label: 'Short name, closed', room: 'Living Room', styleName: 'Japandi', index: 1, total: 3, open: false },
  { label: 'Long name, closed', room: 'Living Room · Dining', styleName: 'Contemporary Australian', index: 2, total: 3, open: false },
  { label: 'Open', room: 'Bedroom', styleName: 'Coastal', index: 0, total: 3, open: true },
] as const;

const SWITCHER_FRAMES = [
  { label: '320px frame (centred, as below lg)', maxWidth: 'max-w-[320px]', align: 'center' },
  { label: '768px frame (centred, as below lg)', maxWidth: 'max-w-[768px]', align: 'center' },
  { label: 'Unconstrained (real responsive alignment)', maxWidth: '', align: 'responsive' },
] as const;

function StyleSwitcherPreview() {
  return (
    <div className="space-y-12 pt-4">
      {SWITCHER_FRAMES.map((frame) => (
        <div key={frame.label} className="space-y-4">
          <Caption>{frame.label}</Caption>
          <div className="flex flex-wrap gap-4">
            {SWITCHER_STATES.map((state) => (
              <div key={state.label} className={`w-full ${frame.maxWidth}`}>
                <StyleSwitcherFrame
                  room={state.room}
                  styleName={state.styleName}
                  index={state.index}
                  total={state.total}
                  initialOpen={state.open}
                  align={frame.align}
                />
                <Caption>{state.label}</Caption>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[13px] text-brand-navy/60 max-w-[60ch] font-medium leading-relaxed">
        Frames constrain width only. Type sizes inside still follow the real viewport
        breakpoints, so resize the window to see the mobile sizes.
      </p>
    </div>
  );
}

function StyleSwitcherFrame({
  room,
  styleName,
  index,
  total,
  initialOpen,
  align,
}: {
  room: string;
  styleName: string;
  index: number;
  total: number;
  initialOpen: boolean;
  align: 'responsive' | 'center' | 'start';
}) {
  const [open, setOpen] = useState(initialOpen);
  const alignText =
    align === 'responsive' ? 'text-center lg:text-left' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <div className="rounded-2xl border border-brand-navy/[0.10] bg-sr-cream px-5 py-5">
      <div className={alignText}>
        <p className="font-mono text-[9px] sm:text-[10px] tracking-[0.16em] uppercase text-sr-ink-mute font-semibold mb-1">
          {room}
        </p>
        <div className="relative inline-block">
          <StyleSwitcherTrigger
            styleName={styleName}
            index={index}
            total={total}
            open={open}
            onToggle={() => setOpen((v) => !v)}
            align={align}
          />
        </div>
      </div>
    </div>
  );
}

function CtaPreview() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
      {/* Mobile mockup */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-navy/55 mb-3">
          Mobile — full width minus thumb-zone
        </p>
        <div className="relative w-full max-w-[420px] aspect-[9/16] mx-auto rounded-3xl border border-brand-navy/[0.10] overflow-hidden bg-surface-secondary shadow-[0_24px_60px_-30px_rgba(15,29,46,0.25)]">
          <div className="absolute inset-0 flex items-end pb-6 px-5">
            <CtaButton label="Begin" full />
          </div>
        </div>
      </div>

      {/* Desktop mockup */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-navy/55 mb-3">
          Desktop — capped at 480px, centred
        </p>
        <div className="relative w-full aspect-[16/10] rounded-3xl border border-brand-navy/[0.10] overflow-hidden bg-surface-secondary shadow-[0_24px_60px_-30px_rgba(15,29,46,0.25)]">
          <div className="absolute inset-0 flex items-end justify-center pb-8">
            <div className="w-full max-w-[480px] px-6">
              <CtaButton label="Begin" full />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────── Component primitives (live) ───────────────────── */

function CtaButton({ label, full = false }: { label: string; full?: boolean }) {
  return (
    <button
      type="button"
      className={`group relative flex items-center justify-center gap-3 bg-brand-navy text-white rounded-[14px] h-14 sm:h-[60px] px-6 hover:bg-brand-navy-light active:scale-[0.99] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 shadow-[0_10px_30px_-12px_rgba(15,29,46,0.5)] ${full ? 'w-full' : ''}`}
    >
      <span className="text-[16px] sm:text-[17px] font-semibold tracking-tight">{label}</span>
      <span className="flex items-center justify-center size-6 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-1 text-brand-teal-light">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M3 8h10M9 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.24em] text-brand-navy/60">
      <span aria-hidden className="block size-1 rounded-full bg-brand-teal" />
      {children}
    </span>
  );
}

function ChoiceRowDemo({
  state,
}: {
  state: 'default' | 'hover' | 'selected' | 'selected-with-sub';
}) {
  const selected = state === 'selected' || state === 'selected-with-sub';
  const hover = state === 'hover';

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-navy/55">
        {state}
      </p>
      <div
        className={`group relative w-full flex items-center gap-4 px-5 py-4 sm:py-[18px] rounded-[14px] text-left border-[1.5px] ${
          selected
            ? 'border-brand-navy bg-brand-navy shadow-[0_8px_24px_-10px_rgba(15,29,46,0.45)]'
            : hover
              ? 'border-brand-navy/30 bg-brand-navy/[0.015] shadow-[0_2px_12px_-6px_rgba(15,29,46,0.12)]'
              : 'border-brand-navy/[0.10] bg-white'
        }`}
      >
        <span
          className={`flex-shrink-0 inline-flex items-center justify-center size-10 rounded-lg ${
            selected ? 'bg-white/[0.10] text-brand-teal-light' : 'bg-brand-navy/[0.04] text-brand-navy/75'
          }`}
        >
          <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5">
            <circle cx="11" cy="8" r="3.5" />
            <path d="M3 19c0-4 3.5-7 8-7s8 3 8 7" strokeLinecap="round" />
          </svg>
        </span>
        <span className="flex-1 min-w-0">
          <span className={`block text-[17px] sm:text-[18px] font-medium leading-snug ${selected ? 'text-white' : 'text-brand-navy'}`}>
            Solo agent
          </span>
          {state === 'selected-with-sub' && (
            <span className="block mt-0.5 text-[13px] sm:text-[14px] leading-snug text-white/65">
              Coming soon
            </span>
          )}
        </span>
        <span
          className={`flex-shrink-0 size-[18px] rounded-full border-[1.5px] grid place-items-center ${selected ? 'border-white/80' : 'border-brand-navy/25'}`}
        >
          {selected && <span className="block size-[10px] rounded-full bg-white" />}
        </span>
      </div>
    </div>
  );
}

function ChoiceTileDemo({ label, selected }: { label: string; selected: boolean }) {
  return (
    <button
      type="button"
      className={`group relative w-full flex flex-col items-center justify-center gap-1.5 sm:gap-2 aspect-[5/4] px-2 py-3 sm:px-3 sm:py-4 rounded-[12px] border-[1.5px] ${
        selected
          ? 'border-brand-navy bg-brand-navy shadow-[0_8px_20px_-10px_rgba(15,29,46,0.45)]'
          : 'border-brand-navy/[0.10] bg-white hover:border-brand-navy/30'
      }`}
    >
      <span
        className={`flex items-center justify-center size-7 sm:size-9 rounded-lg ${
          selected ? 'bg-white/[0.10] text-brand-teal-light' : 'bg-brand-navy/[0.04] text-brand-navy/75'
        }`}
      >
        <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4 sm:size-5">
          <path d="M3 11l8-7 8 7v8a1 1 0 01-1 1H4a1 1 0 01-1-1v-8z" strokeLinejoin="round" />
        </svg>
      </span>
      <span
        className={`text-[12px] sm:text-[14px] font-medium leading-[1.15] text-center ${selected ? 'text-white' : 'text-brand-navy'}`}
      >
        {label}
      </span>
    </button>
  );
}
