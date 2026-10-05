'use client';

import { useEffect, useState, useCallback } from 'react';
import type { FlagReview } from '@/types';
import { ReviewRow } from '@/components/admin/review-row';
import { ReviewLightbox } from '@/components/admin/review-lightbox';

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<FlagReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [inspecting, setInspecting] = useState<FlagReview | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/reviews?status=pending');
      if (r.ok) {
        const data = await r.json();
        setReviews(data.reviews);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolved = useCallback((id: string) => {
    setReviews((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return (
    <div className="min-h-[100dvh] bg-surface-secondary">
      <header className="bg-white border-b border-surface-border sticky top-0 z-30">
        <div className="mx-auto max-w-5xl px-5 sm:px-8 h-14 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-xl text-brand-navy">Flagged stagings</h1>
          </div>
          <a href="/dashboard" className="text-sm font-medium text-ink-muted hover:text-brand-navy">
            Dashboard
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 sm:px-8 py-8">
        <div className="mb-6 flex items-baseline justify-between flex-wrap gap-2">
          <p className="text-sm text-ink-secondary">
            Review submissions from users who flagged a structural mismatch. Accept to refund 1 credit.
          </p>
          <div className="flex gap-2 overflow-x-auto">
            <Stat label="pending" value={reviews.length} />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="size-6 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reviews.length === 0 ? (
          <div className="bg-white border border-surface-border rounded-xl py-16 text-center">
            <p className="font-heading text-2xl text-brand-teal">All caught up</p>
            <p className="text-sm text-ink-muted mt-1">No pending reviews. Check back later.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <ReviewRow
                key={r.id}
                review={r}
                onResolved={handleResolved}
                onInspect={setInspecting}
              />
            ))}
          </div>
        )}
      </main>

      <ReviewLightbox review={inspecting} onClose={() => setInspecting(null)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="bg-white border border-surface-border rounded-lg px-3 py-1.5 text-xs text-ink-muted whitespace-nowrap">
      <b className="text-brand-navy text-sm font-semibold mr-1">{value}</b>
      {label}
    </span>
  );
}
