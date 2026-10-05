'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import type { StagingStyle } from '@/lib/ai/prompts';

type RowStatus = 'pending' | 'running' | 'done' | 'error';

export interface BatchVariantRowProps {
  style: StagingStyle;
  status: RowStatus;
  imageUrl?: string;
  active?: boolean;
  errorMessage?: string;
  onClick?: () => void;
}

export function BatchVariantRow({
  style,
  status,
  imageUrl,
  active,
  errorMessage,
  onClick,
}: BatchVariantRowProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  // Clickable as soon as ANY variant has landed (i.e. imageUrl is present),
  // even if the parent style's status is still 'running' because other
  // variants are mid-flight. This lets users flick between styles in
  // triple-bundle mode while remaining variants finish in the background.
  // Pre-Three-Takes the parent status went 'done' the moment its single
  // variant finished, so the old `status === 'done'` check was equivalent.
  const isClickable = !!imageUrl && !!onClick;
  const isLoading = status === 'pending' || status === 'running';

  return (
    <button
      type="button"
      onClick={isClickable ? onClick : undefined}
      disabled={!isClickable}
      aria-pressed={active}
      className={cn(
        'w-full flex items-center gap-3 p-2 rounded-xl border transition-colors text-left',
        active
          ? 'border-brand-teal bg-brand-teal/5 shadow-soft'
          : 'border-transparent hover:border-ink-muted/30',
        // Dim/non-clickable only when NOTHING has landed yet. If a variant
        // has arrived we keep full opacity so users can switch into it
        // while other variants are still running in the background.
        isLoading && !imageUrl && 'opacity-55 cursor-default',
        status === 'error' && 'opacity-70',
      )}
    >
      <span className="flex-shrink-0 size-14 sm:size-16 rounded-lg overflow-hidden bg-surface-secondary relative">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="size-full object-cover transition-opacity duration-300"
            style={{ opacity: imgLoaded ? 1 : 0 }}
            onLoad={() => setImgLoaded(true)}
          />
        ) : (
          <span className="absolute inset-0 skeleton-shimmer" aria-hidden />
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-heading text-brand-navy text-base leading-tight tracking-tight">
          {style}
        </span>
        <span className="block text-xs text-ink-muted mt-0.5 truncate">
          {/* "Ready" the moment any variant has landed — even if siblings
              are still mid-flight. The carousel inside the active style
              shows the per-variant progress separately. */}
          {status === 'error'
            ? errorMessage || 'Failed'
            : status === 'done' || imageUrl
              ? 'Ready'
              : status === 'running'
                ? 'Generating…'
                : 'Queued'}
        </span>
      </span>
      <span
        className={cn(
          'size-2 rounded-full ml-auto flex-shrink-0',
          status === 'done' && 'bg-brand-teal',
          isLoading && 'bg-brand-teal animate-pulse',
          status === 'error' && 'bg-amber-400',
        )}
        aria-hidden
      />
    </button>
  );
}
