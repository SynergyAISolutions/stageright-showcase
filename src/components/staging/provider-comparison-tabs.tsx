'use client';

import type { ComparisonResult, ComparisonVariantId } from '@/types';

interface ProviderComparisonTabsProps {
  comparison: ComparisonResult;
  onProviderChange: (variantId: ComparisonVariantId) => void;
}

const variantOrder: ComparisonVariantId[] = [
  'gemini-full',
  'openai-full-low',
  'openai-full-medium',
  'openai-full-high',
  'openai-lean-medium',
  'openai-lean-high',
];

export function ProviderComparisonTabs({
  comparison,
  onProviderChange,
}: ProviderComparisonTabsProps) {
  const active = comparison.results[comparison.activeVariant];
  if (!active) return null;

  return (
    <div className="rounded-3xl border border-brand-gold/30 bg-white/95 shadow-sm p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-brand-navy/45">
            Admin model comparison
          </p>
          <p className="text-sm text-brand-navy/70">
            Same original, same style, switch the generated side.
          </p>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Staging model comparison"
        className="grid grid-cols-2 gap-2"
      >
        {variantOrder
          .map((variantId) => {
          const result = comparison.results[variantId];
          if (!result) return null;
          const selected = comparison.activeVariant === variantId;
          const failed = !!result.error && !result.imageUrl;

          return (
            <button
              key={variantId}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onProviderChange(variantId)}
              className={[
                'rounded-2xl border px-3 py-3 text-left transition-all',
                selected
                  ? 'border-brand-navy bg-brand-navy text-white shadow-sm'
                  : 'border-brand-navy/10 bg-brand-cream/50 text-brand-navy hover:border-brand-gold/60',
              ].join(' ')}
            >
              <span className="block text-[13px] font-semibold leading-tight">
                {result.label}
              </span>
              <span className={selected ? 'text-[11px] text-white/65' : 'text-[11px] text-brand-navy/45'}>
                {failed ? 'Failed' : result.imageUrl ? 'Ready' : 'Waiting'}
              </span>
            </button>
          );
        })}
      </div>

      {active.error && !active.imageUrl ? (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          <p className="font-medium">{active.label} failed</p>
          <p className="mt-1 text-red-700">{active.error}</p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-brand-navy/55">
          Viewing {active.label} · {active.modelId}
        </p>
      )}
    </div>
  );
}
