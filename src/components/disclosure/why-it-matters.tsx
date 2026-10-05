'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import {
  PLATFORM_NOTES,
  REGION_NOTES,
  ON_IMAGE_EXPLAINER,
  WHY_LISTING_DESCRIPTION_MATTERS,
} from '@/lib/disclosure/why-it-matters';

export function WhyItMatters() {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl bg-sr-ink/[0.04] border border-sr-ink/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="font-display text-sr-ink text-[18px]">Why this matters</span>
        <ChevronDown
          className={cn('size-4 text-sr-ink/60 transition-transform duration-300', open && 'rotate-180')}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 flex flex-col gap-5 text-[14px] leading-relaxed text-sr-ink/80">
              <Block title="What's already on every image">{ON_IMAGE_EXPLAINER}</Block>
              <Block title="Why your listing description matters">{WHY_LISTING_DESCRIPTION_MATTERS}</Block>
              <div>
                <h4 className="font-semibold text-sr-ink mb-2 text-[13px] tracking-[0.04em] uppercase">
                  Platform notes
                </h4>
                <ul className="flex flex-col gap-2">
                  {PLATFORM_NOTES.map((p) => (
                    <li key={p.name}>
                      <span className="font-medium text-sr-ink">{p.name}.</span> {p.note}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-sr-ink mb-2 text-[13px] tracking-[0.04em] uppercase">
                  By region
                </h4>
                <div className="flex flex-col gap-3">
                  {REGION_NOTES.map((r) => (
                    <div key={r.name}>
                      <div className="font-medium text-sr-ink mb-0.5">{r.name}</div>
                      <div>{r.note}</div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[12px] text-sr-ink/50 italic">
                StageRight provides this overview for convenience. It is not legal advice — consult an
                Australian commercial lawyer (or your local equivalent) for binding guidance.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="font-semibold text-sr-ink mb-1.5 text-[13px] tracking-[0.04em] uppercase">
        {title}
      </h4>
      <p>{children}</p>
    </div>
  );
}
