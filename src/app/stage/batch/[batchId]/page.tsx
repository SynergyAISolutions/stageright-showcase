'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { BatchResult, type BatchResultSubJob } from '@/components/staging/batch-result';
import { StagingWaitConcierge, type ConciergeNote } from '@/components/staging/staging-wait-concierge';
import { buildBatchWaitNotes, type StagingStyle } from '@/lib/ai/prompts';
import { AppHeader } from '@/components/layout/app-header';
import type { Bundle } from '@/types';

interface BatchPollResponse {
  batchId: string;
  bundle: Bundle;
  listingId?: string;
  status: 'running' | 'done' | 'error';
  total: number;
  completed: number;
  failed: number;
  refundedCredits: number;
  heroImageUrl?: string;
  subJobs: BatchResultSubJob[];
  isFirstStage: boolean;
}

const POLL_MS = 3000;
const MAX_POLL_MS = 10 * 60 * 1000;
const CHECKPOINT_KEY = 'stageright:pending-batch';

export default function BatchResultPage() {
  const params = useParams<{ batchId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  // BatchResult is the fresh-staging reveal ceremony. The wizard pushes
  // ?fresh=1 on its single legitimate navigation here. Any visit without
  // the param is a re-entry (bookmark, history, shared link) and should be
  // routed to the listing's modal-driven gallery instead — see option-2
  // decision in the design conversation.
  const isFresh = searchParams.get('fresh') === '1';
  const batchId = params.batchId;
  const [data, setData] = useState<BatchPollResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string>('');
  const [roomTypeLabel, setRoomTypeLabel] = useState<string>('room');
  const [heroS3Key, setHeroS3Key] = useState<string | null>(null);
  const [roomTypes, setRoomTypes] = useState<string[]>([]);
  const [waitNotes, setWaitNotes] = useState<ConciergeNote[]>([]);

  const fetchOnce = useCallback(async (): Promise<BatchPollResponse | null> => {
    const res = await fetch(`/api/jobs/batch?id=${encodeURIComponent(batchId)}`);
    if (!res.ok) {
      if (res.status === 404) setError('Batch not found.');
      else if (res.status === 403) setError('This batch belongs to a different account.');
      else setError('Failed to check batch progress.');
      return null;
    }
    return (await res.json()) as BatchPollResponse;
  }, [batchId]);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    // Restore original image URL + room label from checkpoint (set by wizard).
    try {
      const cp = localStorage.getItem(CHECKPOINT_KEY);
      if (cp) {
        const parsed = JSON.parse(cp) as {
          originalImageUrl?: string;
          roomTypeLabel?: string;
          batchId?: string;
          heroS3Key?: string;
          roomTypes?: string[];
          styles?: StagingStyle[];
        };
        if (parsed.batchId === batchId) {
          if (parsed.originalImageUrl) setOriginalImageUrl(parsed.originalImageUrl);
          if (parsed.roomTypeLabel) setRoomTypeLabel(parsed.roomTypeLabel);
          if (parsed.heroS3Key) setHeroS3Key(parsed.heroS3Key);
          if (Array.isArray(parsed.roomTypes)) setRoomTypes(parsed.roomTypes);
          if (
            Array.isArray(parsed.styles) &&
            parsed.styles.length > 0 &&
            Array.isArray(parsed.roomTypes)
          ) {
            setWaitNotes(
              buildBatchWaitNotes({ styles: parsed.styles, roomTypes: parsed.roomTypes }),
            );
          }
        }
      }
    } catch {
      // Invalid localStorage → ignore and proceed
    }

    const tick = async () => {
      if (cancelled) return;
      const d = await fetchOnce();
      if (cancelled) return;
      if (!d) return;
      // Re-entry guard: if the user landed here without ?fresh=1, this
      // isn't the first-time reveal — bounce them to the listing (or
      // dashboard) where the GalleryViewer modal is the canonical
      // "view a staged room" surface.
      if (!isFresh) {
        router.replace(d.listingId ? `/listings/${d.listingId}` : '/dashboard');
        return;
      }
      setData(d);
      if (d.heroImageUrl) setOriginalImageUrl(d.heroImageUrl);
      if (d.status !== 'running') {
        return;
      }
      if (Date.now() - startedAt > MAX_POLL_MS) {
        setError('This batch is taking longer than expected. Refresh to keep checking.');
        return;
      }
      setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [batchId, fetchOnce, isFresh, router]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="text-center max-w-md">
          <h1 className="font-heading text-2xl text-brand-navy tracking-tight">{error}</h1>
          <button
            onClick={() => router.push('/stage')}
            className="mt-6 px-4 py-2 rounded-xl bg-brand-navy text-white text-sm"
          >
            Back to the wizard
          </button>
        </div>
      </main>
    );
  }

  const showWait = !data || data.completed === 0;

  return (
    <AnimatePresence mode="wait">
      {showWait ? (
        <motion.main
          key="wait"
          className="h-[100dvh] bg-surface-secondary flex flex-col overflow-hidden"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <StagingWaitConcierge
            heroImageUrl={originalImageUrl || ''}
            conciergeNotes={waitNotes}
            bundle={data?.bundle ?? 'single'}
          />
        </motion.main>
      ) : (
        <motion.main
          key="result"
          className="h-[100dvh] bg-sr-cream flex flex-col overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          <AppHeader />
          <BatchResult
            originalImageUrl={originalImageUrl}
            roomTypeLabel={roomTypeLabel}
            total={data!.total}
            completed={data!.completed}
            failed={data!.failed}
            subJobs={data!.subJobs}
            refundedCredits={data!.refundedCredits}
            allTerminal={data!.status !== 'running'}
            heroS3Key={heroS3Key}
            roomTypes={roomTypes}
            isFirstStage={data!.isFirstStage}
            bundle={data!.bundle ?? 'single'}
            batchId={data!.batchId}
            listingId={data!.listingId}
          />
        </motion.main>
      )}
    </AnimatePresence>
  );
}
