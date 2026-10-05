'use client';

import { useState, useEffect } from 'react';
import type { FlagReview } from '@/types';
import { cn } from '@/lib/utils/cn';

interface ReviewRowProps {
  review: FlagReview;
  onResolved: (id: string) => void;
  onInspect: (review: FlagReview) => void;
}

export function ReviewRow({ review, onResolved, onInspect }: ReviewRowProps) {
  const [working, setWorking] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const timeAgo = (() => {
    const s = (Date.now() - new Date(review.createdAt).getTime()) / 1000;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  })();

  const act = async (verb: 'accept' | 'decline') => {
    setWorking(verb);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${review.id}/${verb}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Failed to ${verb}`);
      onResolved(review.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${verb}`);
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="bg-white border border-surface-border rounded-xl p-4 sm:p-5">
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-4 sm:gap-5 items-start">
        <button
          type="button"
          onClick={() => onInspect(review)}
          className="flex gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal rounded-lg"
          aria-label="Open full-size comparison"
        >
          <Thumb s3Key={review.originalS3Key} label="ORIG" />
          <Thumb s3Key={review.stagedS3Key} label="STAGED" />
        </button>

        <div className="min-w-0">
          <h3 className="font-semibold text-brand-navy text-sm">
            {review.userEmail} · {review.roomTypes.join(', ')} · {review.style}
          </h3>
          <p className="text-xs text-ink-muted mt-0.5">{timeAgo}</p>
          {review.userNote && (
            <blockquote className="mt-2 text-sm text-ink italic border-l-2 border-brand-teal pl-3 py-1 bg-surface-secondary rounded-r">
              {review.userNote}
            </blockquote>
          )}
        </div>

        <div className="flex gap-2 sm:flex-col sm:w-auto">
          <button
            type="button"
            disabled={!!working}
            onClick={() => act('accept')}
            className={cn(
              'flex-1 sm:flex-none text-xs font-semibold px-4 py-2 rounded-lg transition-colors',
              'bg-brand-teal text-white hover:bg-brand-teal/90 disabled:opacity-50',
            )}
          >
            {working === 'accept' ? 'Refunding…' : 'Accept · refund'}
          </button>
          <button
            type="button"
            disabled={!!working}
            onClick={() => act('decline')}
            className={cn(
              'flex-1 sm:flex-none text-xs font-semibold px-4 py-2 rounded-lg transition-colors',
              'bg-white border border-surface-border text-ink-secondary hover:border-ink-muted disabled:opacity-50',
            )}
          >
            {working === 'decline' ? 'Declining…' : 'Decline'}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Thumb({ s3Key, label }: { s3Key: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!s3Key) { setUrl(null); return; }
    let cancelled = false;
    fetch(`/api/upload/signed?key=${encodeURIComponent(s3Key)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled) setUrl(data?.url || null); })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
  }, [s3Key]);

  return (
    <div className="relative w-16 h-12 sm:w-20 sm:h-16 rounded-md overflow-hidden border border-surface-border bg-surface-secondary">
      {url ? (
        <img
          src={url}
          alt={label}
          className="size-full object-cover"
          loading="lazy"
        />
      ) : null}
      <span className="absolute top-0.5 left-0.5 text-[8px] font-bold bg-black/60 text-white px-1 rounded">
        {label}
      </span>
    </div>
  );
}
