'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const MESSAGES = [
  'Analysing room structure...',
  'Identifying walls, floors and windows...',
  'Selecting furniture placement...',
  'Matching lighting and perspective...',
  'Rendering photorealistic staging...',
  'Almost there...',
];

export function StagingLoader() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => Math.min(prev + 1, MESSAGES.length - 1));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[420px] rounded-2xl bg-surface-secondary border border-surface-border flex flex-col items-center justify-center px-8 py-12">
      {/* Animated room outline */}
      <div className="relative size-20 mb-6">
        <motion.svg
          viewBox="0 0 80 80"
          fill="none"
          className="size-20 text-brand-teal"
        >
          {/* Room outline */}
          <motion.rect
            x="10"
            y="15"
            width="60"
            height="50"
            rx="4"
            stroke="currentColor"
            strokeWidth="2"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 2, ease: 'easeInOut' }}
          />
          {/* Window */}
          <motion.rect
            x="30"
            y="20"
            width="20"
            height="12"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.5, 1] }}
            transition={{ duration: 2, delay: 1, repeat: Infinity }}
          />
          {/* Furniture items appearing */}
          <motion.rect
            x="16"
            y="45"
            width="18"
            height="14"
            rx="2"
            fill="currentColor"
            fillOpacity={0.15}
            stroke="currentColor"
            strokeWidth="1.5"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 2, type: 'spring', stiffness: 100 }}
          />
          <motion.rect
            x="46"
            y="50"
            width="18"
            height="9"
            rx="2"
            fill="currentColor"
            fillOpacity={0.15}
            stroke="currentColor"
            strokeWidth="1.5"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 3, type: 'spring', stiffness: 100 }}
          />
        </motion.svg>

        {/* Pulsing ring */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-brand-teal/20"
          animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0, 0.3] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Progress message */}
      <motion.p
        key={messageIndex}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-base font-medium text-brand-navy text-center"
      >
        {MESSAGES[messageIndex]}
      </motion.p>

      {/* Subtle progress bar */}
      <div className="mt-4 w-48 h-1 bg-surface-border rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-brand-teal rounded-full"
          initial={{ width: '0%' }}
          animate={{ width: '90%' }}
          transition={{ duration: 25, ease: 'linear' }}
        />
      </div>

      <p className="mt-4 text-xs text-ink-muted">
        This usually takes 15–30 seconds
      </p>
    </div>
  );
}
