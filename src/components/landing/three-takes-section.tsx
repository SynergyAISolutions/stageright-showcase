'use client';

import { motion } from 'framer-motion';
import { BeforeAfterSlider } from '@/components/comparison/before-after-slider';

const springTransition = { type: 'spring' as const, stiffness: 80, damping: 20 };

export function ThreeTakesSection() {
  return (
    <section className="relative py-24 sm:py-32 bg-surface-secondary">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
          {/* Left — copy */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={springTransition}
          >
            <p className="text-[19px] font-bold tracking-wider uppercase text-brand-teal mb-4">
              3 for the price of 2
            </p>
            <h2 className="font-heading text-4xl sm:text-5xl text-brand-navy leading-[1.05]">
              Three takes on every room.
            </h2>
            <p className="mt-6 text-xl text-brand-navy/80 leading-relaxed">
              AI is creative — and inconsistent. So most rooms come in three versions:
              three different takes on the same style of the same room. Compare them.
              Pick your favourite. Keep them all.
            </p>
            <p className="mt-6 text-base text-brand-navy/60 italic">
              Prefer to move faster? Switch to single-take per style at checkout and pay 1 credit each.
            </p>
          </motion.div>

          {/* Right — visual.
              For v1 we render the existing single-image demo. Three-thumbnail
              chips come in a follow-up once an admin-generated triple-bundle
              demo exists (per `feedback_admin_only_images.md`). */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ ...springTransition, delay: 0.1 }}
          >
            <BeforeAfterSlider
              beforeSrc="/demo/empty.jpg"
              afterSrc="/demo/staged.jpg"
              beforeLabel="Original"
              afterLabel="Staged"
              className="shadow-elevated"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
