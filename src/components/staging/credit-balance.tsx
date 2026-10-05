'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

interface CreditBalanceProps {
  credits: number;
  plan: string;
  pulse?: boolean;
  className?: string;
}

export function CreditBalance({ credits, plan, pulse, className }: CreditBalanceProps) {
  const isLow = credits <= 5 && plan !== 'admin';

  return (
    <motion.div
      animate={pulse ? {
        scale: [1, 1.08, 1],
        boxShadow: [
          '0 0 0 0 rgba(199, 111, 78, 0)',
          '0 0 0 10px rgba(199, 111, 78, 0.35)',
          '0 0 0 0 rgba(199, 111, 78, 0)',
        ],
      } : {}}
      transition={{ duration: 0.8, ease: 'easeOut' }}
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border',
        isLow
          ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-sr-terra/[0.12] text-sr-terra border-sr-terra/40',
        className,
      )}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      {plan === 'admin' ? (
        'Unlimited'
      ) : (
        <span className="tabular-nums">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={credits}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="inline-block"
            >
              {credits}
            </motion.span>
          </AnimatePresence>
          {' credits'}
        </span>
      )}
    </motion.div>
  );
}
