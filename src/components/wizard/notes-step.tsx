// src/components/wizard/notes-step.tsx
'use client';

import type { RoomType } from '@/components/staging/room-type-selector';

// Common requests for listing-staging — designed for the audience that sees the
// listing (broad-appeal, light-touch). Replaces the earlier hardcoded chips that
// referenced metal/glass/pets — irrelevant to staging-for-strangers.
//
// Charcoal + plant chips deliberately push away from the sage/terra-cotta default
// the AI tends to land on; gives users a starter for variety.
const HINT_CHIPS = [
  'Keep it minimal',
  'Neutral palette',
  'Make it feel cosy',
  'No rug',
  'Add a leafy potted plant',
  'Charcoal accents',
] as const;

interface NotesStepProps {
  notes: string;
  onNotesChange: (v: string) => void;
  roomTypes: RoomType[];
  /** Display label for the style summary chip. Caller passes a StagingStyle name for single-style or "N styles" for batch. */
  style: string;
  referenceCount: number;
  onJumpTo: (step: 'upload' | 'reference' | 'rooms' | 'style') => void;
}

export function NotesStep({
  notes, onNotesChange, roomTypes, style, referenceCount, onJumpTo,
}: NotesStepProps) {
  const summaryParts: { label: string; target: 'upload' | 'reference' | 'rooms' | 'style' }[] = [
    { label: roomTypes.join(' · ') || 'No room', target: 'rooms' },
    { label: style, target: 'style' },
  ];
  if (referenceCount > 0) {
    summaryParts.push({
      label: `${referenceCount} reference${referenceCount === 1 ? '' : 's'}`,
      target: 'reference',
    });
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col justify-center gap-5 max-w-[560px] mx-auto w-full py-2">
      <div>
        <p className="text-sm text-sr-ink-soft mb-3">
          Optional &mdash; the AI handles the rest by default.
        </p>

        <textarea
          id="notes-textarea"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={4}
          placeholder="Specific pieces, things to avoid, client context&hellip;"
          className="w-full text-sm text-sr-ink bg-sr-cream rounded-xl px-4 py-3 resize-none border border-transparent focus:border-sr-terra focus:ring-2 focus:ring-sr-terra/20 focus:bg-white focus:outline-none placeholder:text-sr-ink-mute transition-colors"
        />

        <p className="mt-5 text-[10px] font-bold tracking-[0.10em] uppercase text-sr-ink-mute">
          Common requests
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {HINT_CHIPS.map((hint) => (
            <button
              key={hint}
              type="button"
              onClick={() => {
                const existing = notes.trim();
                const separator = existing.length > 0 ? ' · ' : '';
                onNotesChange(`${existing}${separator}${hint}`);
              }}
              className="text-xs text-sr-terra bg-sr-terra/[0.06] border border-sr-terra/25 hover:bg-sr-terra/[0.12] active:scale-[0.98] rounded-full px-3 py-1.5 transition-colors"
            >
              {hint}
            </button>
          ))}
        </div>
      </div>

      {/* One-line summary, quiet — replaces the previous "Your choices" card. */}
      <p className="text-[11px] text-sr-ink-mute leading-relaxed">
        {summaryParts.map((part, i) => (
          <span key={part.target}>
            {i > 0 && <span className="text-sr-ink-mute/60"> · </span>}
            <button
              type="button"
              onClick={() => onJumpTo(part.target)}
              className="hover:text-sr-terra transition-colors"
            >
              {part.label}
            </button>
          </span>
        ))}
        <span className="text-sr-ink-mute/60"> · </span>
        <button
          type="button"
          onClick={() => onJumpTo(summaryParts[0].target)}
          className="text-sr-terra underline underline-offset-2 hover:text-sr-terra/80 transition-colors"
        >
          change
        </button>
      </p>
    </div>
  );
}
