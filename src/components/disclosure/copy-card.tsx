'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { ListingCopyVariant } from '@/lib/disclosure/copy';

interface CopyCardProps {
  variant: ListingCopyVariant;
}

export function CopyCard({ variant }: CopyCardProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(variant.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked — silently no-op; user can manually select the text
    }
  };

  return (
    <div className="rounded-2xl bg-sr-surface border border-sr-hairline p-5 transition-colors hover:border-sr-hairline-2">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="font-mono text-[11px] font-semibold tracking-[0.18em] uppercase text-sr-terra">
          {variant.label}
        </span>
        {variant.id === 'standard' && (
          <span className="font-mono text-[10px] font-medium tracking-[0.14em] uppercase text-sr-ink-mute">
            Recommended
          </span>
        )}
      </div>
      <p className="text-[15px] text-sr-ink leading-snug font-normal mb-1.5">
        {variant.text}
      </p>
      <p className="text-[12px] text-sr-ink/55 mb-4">{variant.description}</p>
      <button
        type="button"
        onClick={onCopy}
        className={cn(
          'w-full flex items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-medium transition-colors',
          copied
            ? 'bg-sr-terra text-sr-cream-soft'
            : 'bg-sr-ink text-sr-cream-soft hover:bg-sr-ink-2',
        )}
      >
        {copied ? (
          <>
            <Check className="size-3.5" /> Copied
          </>
        ) : (
          <>
            <Copy className="size-3.5" /> Copy
          </>
        )}
      </button>
    </div>
  );
}
