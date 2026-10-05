'use client';

import type { Bundle } from '@/types';
import { cn } from '@/lib/utils/cn';

interface TakeCountStepProps {
  value: Bundle;
  onChange: (next: Bundle) => void;
}

export function TakeCountStep({ value, onChange }: TakeCountStepProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col justify-center gap-3 max-w-[560px] mx-auto w-full py-2">
      <Card
        selected={value === 'triple'}
        recommended
        title="Three Takes per style"
        body="3 versions of every chosen style."
        meta="2 credits per style"
        onClick={() => onChange('triple')}
      />
      <Card
        selected={value === 'single'}
        title="Single Take per style"
        body="1 version of every chosen style."
        meta="1 credit per style"
        onClick={() => onChange('single')}
      />
    </div>
  );
}

interface CardProps {
  selected: boolean;
  recommended?: boolean;
  title: string;
  body: string;
  meta: string;
  onClick: () => void;
}

function Card({ selected, recommended, title, body, meta, onClick }: CardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'w-full text-left rounded-2xl border-2 p-5 transition-all flex flex-col justify-center min-h-[170px]',
        selected
          ? 'bg-sr-terra/[0.10] border-sr-terra/40 text-sr-ink shadow-[0_4px_16px_-8px_rgba(199,111,78,0.35)]'
          : 'bg-white border-sr-ink/[0.10] hover:border-sr-terra/40 hover:bg-sr-terra/[0.04]',
      )}
    >
      {recommended && (
        <p className="text-xs font-bold tracking-wider uppercase text-sr-terra bg-sr-terra/[0.12] border border-sr-terra/30 inline-block px-2 py-0.5 rounded-full mb-2 self-start">
          &#9733; Recommended
        </p>
      )}
      <p className="font-display text-2xl text-sr-ink">{title}</p>
      <p className="mt-2 text-base text-sr-ink-soft">{body}</p>
      <p className="mt-3 text-sm font-semibold text-sr-terra">{meta}</p>
    </button>
  );
}
