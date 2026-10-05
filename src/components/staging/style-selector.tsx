'use client';

import { motion } from 'framer-motion';
import { STAGING_STYLES, STYLE_DETAILS, type StagingStyle } from '@/lib/ai/prompts';
import { cn } from '@/lib/utils/cn';

const STYLE_COLORS: Record<StagingStyle, string> = {
  Modern: '#4a5568',
  Scandinavian: '#d4c5a9',
  Coastal: '#7db8c9',
  Hamptons: '#2c4a6e',
  Luxury: '#8b6914',
  Farmhouse: '#a68a5b',
  'Mid-Century Modern': '#c46b3a',
  Industrial: '#6b7280',
  Minimalist: '#e5e7eb',
  'Contemporary Australian': '#7a9e7e',
  Japandi: '#a89785',
  Boho: '#c97c4a',
};

interface StyleSelectorProps {
  selected: StagingStyle;
  onSelect: (style: StagingStyle) => void;
  className?: string;
}

export function StyleSelector({ selected, onSelect, className }: StyleSelectorProps) {
  return (
    <div className={className}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
        {STAGING_STYLES.map((style) => {
          const isActive = selected === style;
          return (
            <button
              type="button"
              key={style}
              onClick={() => onSelect(style)}
              className={cn(
                'relative rounded-xl p-3 sm:p-3.5 text-left transition-all duration-200 group min-h-[88px] overflow-hidden',
                isActive
                  ? 'bg-white shadow-medium ring-2 ring-brand-teal/40'
                  : 'bg-white/50 border border-surface-border hover:bg-white hover:shadow-soft active:scale-[0.98]',
              )}
            >
              {/* Color swatch */}
              <div
                className="size-7 rounded-lg border border-black/5 mb-2.5"
                style={{ backgroundColor: STYLE_COLORS[style] }}
              />
              <p
                className={cn(
                  'text-xs sm:text-sm font-medium leading-tight transition-colors break-words hyphens-auto',
                  isActive ? 'text-brand-navy' : 'text-ink-secondary group-hover:text-ink',
                )}
                lang="en"
              >
                {style}
              </p>

              {isActive && (
                <motion.div
                  layoutId="style-active-dot"
                  className="absolute top-2.5 right-2.5 size-2 rounded-full bg-brand-teal"
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected style detail */}
      <motion.div
        key={selected}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
        className="mt-4 bg-white rounded-xl border border-surface-border p-4"
      >
        <p className="text-sm text-ink-secondary leading-relaxed">
          {STYLE_DETAILS[selected]}
        </p>
      </motion.div>
    </div>
  );
}

// ---------- Quality tier picker ----------

export type QualityTier = 'standard' | 'hd';

interface QualityPickerProps {
  selected: QualityTier;
  onSelect: (tier: QualityTier) => void;
  className?: string;
}

export function QualityPicker({ selected, onSelect, className }: QualityPickerProps) {
  return (
    <div className={cn('flex flex-col sm:flex-row gap-3', className)}>
      <button
        type="button"
        onClick={() => onSelect('standard')}
        className={cn(
          'flex-1 relative rounded-xl p-4 text-left transition-all duration-200 min-h-[112px]',
          selected === 'standard'
            ? 'bg-white shadow-medium ring-2 ring-brand-teal/40'
            : 'bg-white/50 border border-surface-border hover:bg-white hover:shadow-soft active:scale-[0.98]',
        )}
      >
        <p className="text-sm font-medium text-brand-navy">Standard</p>
        <p className="mt-1 text-xs text-ink-muted">Fast, great for most rooms</p>
        <p className="mt-2 text-lg font-heading text-brand-navy">3 credits</p>
        {selected === 'standard' && (
          <motion.div
            layoutId="quality-ring"
            className="absolute top-3 right-3 size-2 rounded-full bg-brand-teal"
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          />
        )}
      </button>

      <button
        type="button"
        onClick={() => onSelect('hd')}
        className={cn(
          'flex-1 relative rounded-xl p-4 pr-14 text-left transition-all duration-200 min-h-[112px]',
          selected === 'hd'
            ? 'bg-white shadow-medium ring-2 ring-brand-gold/40'
            : 'bg-white/50 border border-surface-border hover:bg-white hover:shadow-soft active:scale-[0.98]',
        )}
      >
        <p className="text-sm font-medium text-brand-navy">HD Quality</p>
        <p className="mt-1 text-xs text-ink-muted">Best for hero shots &amp; luxury</p>
        <p className="mt-2 text-lg font-heading text-brand-navy">5 credits</p>
        <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-wider bg-brand-gold/15 text-brand-gold px-1.5 py-0.5 rounded">
          Pro
        </span>
        {selected === 'hd' && (
          <motion.div
            layoutId="quality-ring"
            className="absolute bottom-3 right-3 size-2 rounded-full bg-brand-gold"
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          />
        )}
      </button>
    </div>
  );
}
