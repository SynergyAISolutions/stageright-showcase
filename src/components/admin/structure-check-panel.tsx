/**
 * Admin-only panel for running SAM 2 structural validation on any staging
 * session. Used in two places: the result card (post-staging) and the gallery
 * viewer (retro-check on past stagings). Caller is responsible for gating
 * visibility — this component does not self-gate, so admin-check must happen
 * at the render site.
 */
'use client';

import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils/cn';

type Bucket = 'tight-match' | 'minor-shift' | 'major-shift' | 'undetermined';

interface StructureCheckResult {
  passed: boolean;
  deviationScore: number;
  bucket: Bucket;
  samUsed: boolean;
  message: string;
  structuralCoveragePct?: number;
  samError?: string;
  samRawShape?: string;
}

const BUCKET_STYLE: Record<Bucket, string> = {
  'tight-match': 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30',
  'minor-shift': 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  'major-shift': 'bg-red-500/10 text-red-700 border-red-500/30',
  'undetermined': 'bg-ink-muted/10 text-ink-muted border-surface-border',
};

const BUCKET_LABEL: Record<Bucket, string> = {
  'tight-match': 'Tight match',
  'minor-shift': 'Minor shift',
  'major-shift': 'Major shift',
  'undetermined': 'Undetermined',
};

interface StructureCheckPanelProps {
  /** The original empty-room photo S3 key (`heroS3Key` on a staging session). */
  originalS3Key: string;
  /** The specific staged variant S3 key to assess. */
  stagedS3Key: string;
  className?: string;
  /** Compact mode removes the header explanation — useful in space-constrained contexts like the gallery viewer. */
  compact?: boolean;
}

export function StructureCheckPanel({
  originalS3Key,
  stagedS3Key,
  className,
  compact = false,
}: StructureCheckPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StructureCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/validate-structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalS3Key, stagedS3Key }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Validation failed');
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setLoading(false);
    }
  }, [originalS3Key, stagedS3Key]);

  return (
    <div
      className={cn(
        'rounded-xl border border-dashed border-brand-navy/30 bg-brand-navy/[0.02] p-4',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-widest uppercase text-brand-navy">
            Admin · structural integrity
          </p>
          {!compact && (
            <p className="text-xs text-ink-muted mt-0.5">
              SAM 2 + masked pixel comparison. You see this because you are an admin — regular users never do.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading || !originalS3Key || !stagedS3Key}
          className="flex-shrink-0 text-xs font-semibold px-3 py-2 rounded-lg bg-brand-navy text-white hover:bg-brand-navy-light disabled:opacity-50 transition-colors"
        >
          {loading ? 'Checking…' : result ? 'Re-run' : 'Check structure'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {result && <ResultRows result={result} />}
    </div>
  );
}

function ResultRows({ result }: { result: StructureCheckResult }) {
  const pct = result.deviationScore >= 0 ? (result.deviationScore * 100).toFixed(2) : '—';
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border',
            BUCKET_STYLE[result.bucket],
          )}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {BUCKET_LABEL[result.bucket]}
        </span>
        <span className="text-xs text-ink-muted">
          deviation <b className="text-brand-navy">{pct}%</b>
        </span>
        {result.structuralCoveragePct !== undefined && (
          <span className="text-xs text-ink-muted">
            · mask <b className="text-brand-navy">{result.structuralCoveragePct}%</b> of frame
          </span>
        )}
        <span className={cn('text-xs', result.samUsed ? 'text-emerald-700' : 'text-amber-700')}>
          · {result.samUsed ? 'SAM 2' : 'coarse fallback'}
        </span>
      </div>
      <p className="text-xs text-ink-secondary leading-relaxed">{result.message}</p>
      {!result.samUsed && result.samError && (
        <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 space-y-1">
          <p className="text-[10px] font-bold tracking-widest uppercase text-amber-700">SAM diagnostic</p>
          <p className="text-[11px] text-amber-800 leading-relaxed">{result.samError}</p>
          {result.samRawShape && (
            <p className="text-[11px] text-amber-700/80 font-mono">Replicate returned: {result.samRawShape}</p>
          )}
        </div>
      )}
    </div>
  );
}
