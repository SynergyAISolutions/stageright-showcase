'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { HeroUpload } from '@/components/wizard/hero-upload';
import { ReferenceUpload } from '@/components/wizard/reference-upload';
import { RoomTypeSelector, type RoomType } from '@/components/staging/room-type-selector';
import { STAGING_STYLES, STYLE_TAGLINES, type StagingStyle } from '@/lib/ai/prompts';
import { BeforeAfterSlider } from '@/components/comparison/before-after-slider';
import { CompareCarousel, type CarouselVariant, type CarouselJob } from '@/components/admin/compare-carousel';
import type { RoomPhoto } from '@/components/wizard/types';
import { cn } from '@/lib/utils/cn';

type JobStatus = 'pending' | 'running' | 'done' | 'error';
type AnalysisMode = 'full' | 'lean-direct';
type PromptMode = 'hero-only' | 'spatial-ref';

interface Variant {
  id: string;
  provider: 'gemini' | 'openai';
  quality: 'low' | 'medium' | 'high' | null;
  analysisMode: AnalysisMode;
  promptMode?: PromptMode;
  label: string;
  shortLabel: string;
}

const VARIANTS: Variant[] = [
  { id: 'gemini-full', provider: 'gemini', quality: null, analysisMode: 'full', label: 'Gemini Nano Banana Pro', shortLabel: 'Gemini NB Pro' },
  { id: 'openai-full-low', provider: 'openai', quality: 'low', analysisMode: 'full', label: 'GPT Image 2 · Full Low', shortLabel: 'GPT Full Low' },
  { id: 'openai-full-medium', provider: 'openai', quality: 'medium', analysisMode: 'full', label: 'GPT Image 2 · Full Medium', shortLabel: 'GPT Full Med' },
  { id: 'openai-full-high', provider: 'openai', quality: 'high', analysisMode: 'full', label: 'GPT Image 2 · Full High', shortLabel: 'GPT Full High' },
  { id: 'openai-lean-medium', provider: 'openai', quality: 'medium', analysisMode: 'lean-direct', label: 'GPT Image 2 · Lean Medium', shortLabel: 'GPT Lean Med' },
  { id: 'openai-lean-high', provider: 'openai', quality: 'high', analysisMode: 'lean-direct', label: 'GPT Image 2 · Lean High', shortLabel: 'GPT Lean High' },
];

function variantsForPromptMode(promptMode: PromptMode): Variant[] {
  return VARIANTS.map((variant) => {
    if (variant.analysisMode !== 'lean-direct' || promptMode !== 'spatial-ref') {
      return { ...variant, promptMode };
    }
    const isHigh = variant.quality === 'high';
    return {
      ...variant,
      promptMode,
      label: `GPT Image 2 · Lean Ref ${isHigh ? 'High' : 'Medium'}`,
      shortLabel: `GPT Lean Ref ${isHigh ? 'High' : 'Med'}`,
    };
  });
}

const COST_USD: Record<string, number> = {
  gemini: 0.20,
  'openai-full-low': 0.011,
  'openai-full-medium': 0.042,
  'openai-full-high': 0.167,
  'openai-lean-medium': 0.042,
  'openai-lean-high': 0.167,
};
const ANALYSIS_USD_PER_STYLE = 0.12;
const USD_TO_AUD = 1.52;

function variantCostKey(
  provider: 'gemini' | 'openai',
  quality: 'low' | 'medium' | 'high' | null,
  analysisMode: AnalysisMode = 'full',
): string {
  if (provider === 'gemini') return 'gemini';
  return analysisMode === 'lean-direct' ? `openai-lean-${quality}` : `openai-full-${quality}`;
}

/** Per-image AUD cost for a successful generation. Failed cells are billed at 0
 *  — OpenAI/Gemini don't charge for non-delivered images. Analysis cost is
 *  tracked separately at the style level since one analysis serves all 4
 *  variants and is billed even on retry/fail (input tokens consumed). */
function variantCostAud(
  provider: 'gemini' | 'openai',
  quality: 'low' | 'medium' | 'high' | null,
  analysisMode: AnalysisMode = 'full',
): number {
  return COST_USD[variantCostKey(provider, quality, analysisMode)] * USD_TO_AUD;
}
const ANALYSIS_AUD_PER_STYLE = ANALYSIS_USD_PER_STYLE * USD_TO_AUD;

interface Job {
  jobId: string;
  style: StagingStyle | string;
  provider: 'gemini' | 'openai';
  quality: 'low' | 'medium' | 'high' | null;
  analysisMode: AnalysisMode;
  promptMode?: PromptMode;
  label: string;
  status: JobStatus;
  imageUrl?: string;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

interface RunSummary {
  runId: string;
  createdAt: string;
  heroSignedUrl: string | null;
  roomTypes: string[];
  styles: string[];
  jobCount: number;
}

async function uploadToS3(photo: RoomPhoto): Promise<string> {
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: photo.base64, imageMimeType: photo.mimeType }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Upload failed');
  }
  const { s3Key } = await res.json();
  return s3Key as string;
}

export default function AdminComparePage() {
  return (
    <Suspense fallback={null}>
      <AdminComparePageInner />
    </Suspense>
  );
}

function AdminComparePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const runIdFromUrl = searchParams.get('run');

  // ---------- form state ----------
  const [heroPhoto, setHeroPhoto] = useState<RoomPhoto | null>(null);
  const [refPhotos, setRefPhotos] = useState<RoomPhoto[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [styles, setStyles] = useState<StagingStyle[]>(['Modern']);
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ---------- run state ----------
  const [jobs, setJobs] = useState<Job[]>([]);
  const [analysisFailures, setAnalysisFailures] = useState<string[]>([]);
  const [savedHeroUrl, setSavedHeroUrl] = useState<string | null>(null); // when loading from URL
  const [runStyles, setRunStyles] = useState<string[]>([]); // ordered list for grid/carousel
  const [view, setView] = useState<'grid' | 'compare'>('grid');
  const [runPromptMode, setRunPromptMode] = useState<PromptMode>('hero-only');
  const [loadingRun, setLoadingRun] = useState(false);
  const [loadRunError, setLoadRunError] = useState<string | null>(null);

  // ---------- recent runs (form view only) ----------
  const [recentRuns, setRecentRuns] = useState<RunSummary[] | null>(null);

  const heroPreview = heroPhoto?.preview ?? savedHeroUrl ?? '';

  // ---------- cost preview ----------
  const costAud = useMemo(() => {
    const perStyleUsd =
      COST_USD.gemini + COST_USD['openai-full-low'] + COST_USD['openai-full-medium'] +
      COST_USD['openai-full-high'] + COST_USD['openai-lean-medium'] +
      COST_USD['openai-lean-high'] + ANALYSIS_USD_PER_STYLE;
    return styles.length * perStyleUsd * USD_TO_AUD;
  }, [styles.length]);

  // ---------- load saved run on mount / URL change ----------
  useEffect(() => {
    if (!runIdFromUrl) {
      // Reset run state when URL has no run param
      setJobs([]);
      setRunStyles([]);
      setSavedHeroUrl(null);
      setRunPromptMode('hero-only');
      setLoadRunError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingRun(true);
      setLoadRunError(null);
      try {
        const res = await fetch(`/api/admin/compare/runs/${encodeURIComponent(runIdFromUrl)}`, { cache: 'no-store' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to load run (${res.status})`);
        }
        const data = await res.json() as {
          runId: string;
          createdAt: string;
          heroSignedUrl: string;
          promptMode?: PromptMode;
          referenceS3Keys?: string[];
          styles: string[];
          jobs: Array<{
            jobId: string;
            status: JobStatus;
            imageUrl?: string;
            error?: string;
            style: string;
            provider: 'gemini' | 'openai';
            quality: 'low' | 'medium' | 'high' | null;
            analysisMode: AnalysisMode;
            promptMode?: PromptMode;
            label: string;
          }>;
        };
        if (cancelled) return;
        const now = Date.now();
        setSavedHeroUrl(data.heroSignedUrl);
        setRunPromptMode(data.promptMode ?? ((data.referenceS3Keys?.length ?? 0) > 0 ? 'spatial-ref' : 'hero-only'));
        setRunStyles(data.styles);
        setJobs(data.jobs.map((j) => ({
          ...j,
          analysisMode: j.analysisMode ?? 'full',
          promptMode: j.promptMode ?? data.promptMode,
          startedAt: now,
          finishedAt: (j.status === 'done' || j.status === 'error') ? now : undefined,
        })));
      } catch (err) {
        if (!cancelled) setLoadRunError(err instanceof Error ? err.message : 'Failed to load run');
      } finally {
        if (!cancelled) setLoadingRun(false);
      }
    })();
    return () => { cancelled = true; };
  }, [runIdFromUrl]);

  // ---------- load recent runs (only when no run is open) ----------
  useEffect(() => {
    if (runIdFromUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/compare/runs', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as { runs: RunSummary[] };
        if (!cancelled) setRecentRuns(data.runs);
      } catch {/* non-fatal */}
    })();
    return () => { cancelled = true; };
  }, [runIdFromUrl]);

  // ---------- submit ----------
  const handleSubmit = useCallback(async () => {
    if (!heroPhoto) { setSubmitError('Upload a hero photo first.'); return; }
    if (roomTypes.length === 0) { setSubmitError('Pick at least one room type.'); return; }
    if (styles.length === 0) { setSubmitError('Pick at least one style.'); return; }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const heroS3Key = await uploadToS3(heroPhoto);
      const referenceS3Keys: string[] = [];
      for (const ref of refPhotos) {
        try { referenceS3Keys.push(await uploadToS3(ref)); } catch {/* skip */}
      }
      const res = await fetch('/api/admin/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heroS3Key, referenceS3Keys, roomTypes, styles, notes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Comparison run failed (${res.status})`);
      }
      const data = await res.json() as {
        runId: string;
        jobs: Array<{ jobId: string; style: StagingStyle; provider: 'gemini' | 'openai'; quality: 'low' | 'medium' | 'high' | null; analysisMode: AnalysisMode; promptMode?: PromptMode; label: string }>;
        analysisFailures: string[];
      };
      const now = Date.now();
      const promptMode: PromptMode = referenceS3Keys.length > 0 ? 'spatial-ref' : 'hero-only';
      setRunStyles(styles);
      setRunPromptMode(promptMode);
      setJobs(data.jobs.map((j) => ({ ...j, analysisMode: j.analysisMode ?? 'full', promptMode: j.promptMode ?? promptMode, status: 'pending' as JobStatus, startedAt: now })));
      setAnalysisFailures(data.analysisFailures || []);
      // Push run id into URL — bookmarkable + survives refresh.
      router.replace(`/admin/compare?run=${data.runId}`, { scroll: false });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }, [heroPhoto, refPhotos, roomTypes, styles, notes, router]);

  // ---------- poll loop ----------
  // Single endpoint hit per tick — /api/admin/compare/runs/[runId] already
  // returns every job's current status and a fresh signed URL for any that
  // are done. Earlier we polled /api/jobs once per job, which fired 12
  // simultaneous Cognito-backed session checks per tick and got rate-
  // limited (Cognito returned 401s, which all bubbled up as cell errors).
  const pollingRef = useRef<number | null>(null);
  useEffect(() => {
    if (!runIdFromUrl) return;
    if (jobs.length === 0) return;
    const anyPending = jobs.some((j) => j.status === 'pending' || j.status === 'running');
    if (!anyPending) return;

    const tick = async () => {
      try {
        const r = await fetch(`/api/admin/compare/runs/${encodeURIComponent(runIdFromUrl)}`, { cache: 'no-store' });
        if (!r.ok) return;
        const data = await r.json() as {
          jobs: Array<{
            jobId: string;
            status: JobStatus;
            imageUrl?: string;
            error?: string;
            style: string;
            provider: 'gemini' | 'openai';
            quality: 'low' | 'medium' | 'high' | null;
            analysisMode: AnalysisMode;
            promptMode?: PromptMode;
            label: string;
          }>;
        };
        setJobs((prev) => {
          const next = prev.map((existing) => {
            const fresh = data.jobs.find((j) => j.jobId === existing.jobId);
            if (!fresh) return existing;
            const finishedAt = (fresh.status === 'done' || fresh.status === 'error') && !existing.finishedAt
              ? Date.now()
              : existing.finishedAt;
            return {
              ...existing,
              status: fresh.status,
              imageUrl: fresh.imageUrl ?? existing.imageUrl,
              error: fresh.error ?? existing.error,
              analysisMode: fresh.analysisMode ?? existing.analysisMode,
              promptMode: fresh.promptMode ?? existing.promptMode,
              finishedAt,
            };
          });
          return next;
        });
      } catch {
        // Network blip — let the next tick try again.
      }
    };
    tick();
    pollingRef.current = window.setInterval(tick, 4000);
    return () => { if (pollingRef.current) window.clearInterval(pollingRef.current); };
  }, [runIdFromUrl, jobs]);

  const allDone = jobs.length > 0 && jobs.every((j) => j.status === 'done' || j.status === 'error');
  const doneCount = jobs.filter((j) => j.status === 'done').length;

  const startNewRun = useCallback(() => {
    router.replace('/admin/compare', { scroll: false });
    setHeroPhoto(null);
    setRefPhotos([]);
    setRoomTypes([]);
    setStyles(['Modern']);
    setNotes('');
    setSubmitError(null);
    setRunPromptMode('hero-only');
    setAnalysisFailures([]);
  }, [router]);

  // ---------- render ----------
  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-surface-border bg-white">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-navy/50">Admin · Model evaluation</p>
            <h1 className="font-heading text-3xl text-brand-navy mt-1 truncate">Compare staging models</h1>
            <p className="text-sm text-ink-muted mt-1 hidden sm:block">Run Gemini, GPT Image 2 full-analysis, and GPT Image 2 lean-direct variants on the same brief, side-by-side.</p>
          </div>
          {runIdFromUrl && (
            <button
              type="button"
              onClick={startNewRun}
              className="h-10 px-4 rounded-lg border border-surface-border bg-white text-sm font-medium text-brand-navy hover:bg-surface-bg active:scale-[0.98] transition-all whitespace-nowrap"
            >
              New run
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-8 space-y-8">
        {!runIdFromUrl && (
          <FormPanel
            heroPhoto={heroPhoto}
            onHeroChange={setHeroPhoto}
            refPhotos={refPhotos}
            onRefChange={setRefPhotos}
            roomTypes={roomTypes}
            onRoomTypesChange={setRoomTypes}
            styles={styles}
            onStylesChange={setStyles}
            notes={notes}
            onNotesChange={setNotes}
            costAud={costAud}
            promptMode={refPhotos.length > 0 ? 'spatial-ref' : 'hero-only'}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onSubmit={handleSubmit}
            recentRuns={recentRuns}
          />
        )}

        {runIdFromUrl && loadingRun && (
          <div className="rounded-2xl border border-surface-border bg-white p-12 text-center">
            <div className="size-8 mx-auto rounded-full border-2 border-brand-navy/20 border-t-brand-teal animate-spin" />
            <p className="mt-3 text-sm text-ink-muted">Loading run…</p>
          </div>
        )}

        {runIdFromUrl && loadRunError && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-5">
            <p className="text-sm font-semibold text-red-800">{loadRunError}</p>
            <button onClick={startNewRun} className="mt-3 text-sm font-semibold text-red-900 underline underline-offset-4">
              Start a new run
            </button>
          </div>
        )}

        {runIdFromUrl && !loadingRun && !loadRunError && jobs.length > 0 && (
          <ResultsPanel
            heroPreview={heroPreview}
            jobs={jobs}
            allDone={allDone}
            doneCount={doneCount}
            analysisFailures={analysisFailures}
            runStyles={runStyles}
            promptMode={runPromptMode}
            view={view}
            onViewChange={setView}
          />
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- form panel

interface FormPanelProps {
  heroPhoto: RoomPhoto | null;
  onHeroChange: (p: RoomPhoto | null) => void;
  refPhotos: RoomPhoto[];
  onRefChange: (p: RoomPhoto[]) => void;
  roomTypes: RoomType[];
  onRoomTypesChange: (r: RoomType[]) => void;
  styles: StagingStyle[];
  onStylesChange: (s: StagingStyle[]) => void;
  notes: string;
  onNotesChange: (s: string) => void;
  costAud: number;
  promptMode: PromptMode;
  isSubmitting: boolean;
  submitError: string | null;
  onSubmit: () => void;
  recentRuns: RunSummary[] | null;
}

function FormPanel({
  heroPhoto, onHeroChange, refPhotos, onRefChange,
  roomTypes, onRoomTypesChange,
  styles, onStylesChange,
  notes, onNotesChange,
  costAud, promptMode, isSubmitting, submitError, onSubmit,
  recentRuns,
}: FormPanelProps) {
  const toggleStyle = (s: StagingStyle) => {
    onStylesChange(styles.includes(s) ? styles.filter((x) => x !== s) : [...styles, s]);
  };
  const runModeLabel = promptMode === 'spatial-ref' ? 'Reference-aware' : 'Hero-only';
  const leanModeCopy = promptMode === 'spatial-ref'
    ? 'lean OpenAI variants use the spatial-reference prompt'
    : 'lean OpenAI variants use the hero-only prompt';

  return (
    <div className="space-y-8">
      {recentRuns && recentRuns.length > 0 && (
        <RecentRunsList runs={recentRuns} />
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-8">
        <div className="space-y-7">
          <section>
            <h2 className="font-heading text-xl text-brand-navy mb-3">1 · Hero photo</h2>
            <HeroUpload heroPhoto={heroPhoto} onChange={onHeroChange} />
          </section>

          {heroPhoto && (
            <>
              <section>
                <h2 className="font-heading text-xl text-brand-navy mb-3">2 · Reference angles <span className="text-sm text-ink-muted font-sans font-normal">(optional)</span></h2>
                <ReferenceUpload photos={refPhotos} onChange={onRefChange} />
              </section>

              <section>
                <h2 className="font-heading text-xl text-brand-navy mb-3">3 · Room types</h2>
                <RoomTypeSelector
                  selected={roomTypes}
                  onToggle={(t) => onRoomTypesChange(roomTypes.includes(t) ? roomTypes.filter((r) => r !== t) : [...roomTypes, t])}
                />
              </section>

              <section>
                <h2 className="font-heading text-xl text-brand-navy mb-3">4 · Styles to test</h2>
                <p className="text-sm text-ink-muted mb-3">Pick 1–12. Each style runs all {VARIANTS.length} model variants.</p>
                <div className="flex flex-wrap gap-2">
                  {STAGING_STYLES.map((s) => {
                    const selected = styles.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleStyle(s)}
                        title={STYLE_TAGLINES[s]}
                        className={cn(
                          'h-10 px-4 rounded-full border text-sm font-medium transition-all active:scale-[0.98]',
                          selected
                            ? 'border-brand-teal bg-brand-teal/[0.06] text-brand-navy shadow-[0_4px_16px_-8px_rgba(35,165,148,0.35)]'
                            : 'border-surface-border bg-white text-brand-navy hover:border-brand-navy/30',
                        )}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <h2 className="font-heading text-xl text-brand-navy mb-3">5 · Notes <span className="text-sm text-ink-muted font-sans font-normal">(optional)</span></h2>
                <textarea
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                  placeholder="e.g. Include an L-shaped sofa. Avoid glass and chrome."
                  rows={3}
                  className="w-full rounded-xl border border-surface-border bg-white p-4 text-sm text-brand-navy placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
                />
              </section>
            </>
          )}
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-soft">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-navy/45">Run summary</p>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Styles" value={String(styles.length || 0)} />
              <Row label="Run mode" value={runModeLabel} />
              <Row label="Variants per style" value={String(VARIANTS.length)} />
              <Row label="Total images" value={String((styles.length || 0) * VARIANTS.length)} />
              <Row label="Analyses" value={`${styles.length || 0} full-analysis · lean skips`} />
            </dl>
            <hr className="my-4 border-surface-border" />
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink-muted">Est. cost</span>
              <span className="font-heading text-2xl text-brand-navy">~A${costAud.toFixed(2)}</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-muted leading-snug">
              Includes Gemini, GPT-Image-2 full-analysis low/medium/high, and lean-direct medium/high. One full analysis per style; {leanModeCopy}. USD → AUD ×{USD_TO_AUD}.
            </p>

            <button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting || !heroPhoto || roomTypes.length === 0 || styles.length === 0}
              className="mt-5 w-full h-12 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Dispatching jobs…' : `Run comparison${styles.length > 0 ? ` · ${styles.length * VARIANTS.length} images` : ''}`}
            </button>

            {submitError && (
              <p role="alert" className="mt-3 text-sm text-red-600">{submitError}</p>
            )}
            <p className="mt-3 text-[11px] text-ink-muted leading-snug">
              Doesn&apos;t spend credits. Doesn&apos;t write to your gallery. Saved to your run history below.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-brand-navy font-medium tabular-nums">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- recent runs

function RecentRunsList({ runs }: { runs: RunSummary[] }) {
  return (
    <section>
      <h2 className="font-heading text-xl text-brand-navy mb-3">Recent runs <span className="text-sm text-ink-muted font-sans font-normal">({runs.length})</span></h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {runs.map((r) => (
          <Link
            key={r.runId}
            href={`/admin/compare?run=${r.runId}`}
            className="group rounded-xl border border-surface-border bg-white overflow-hidden hover:border-brand-navy/30 transition-colors"
          >
            <div className="aspect-[16/10] bg-surface-bg overflow-hidden">
              {r.heroSignedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.heroSignedUrl} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-ink-muted">No preview</div>
              )}
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold text-brand-navy truncate">
                {r.styles.length} {r.styles.length === 1 ? 'style' : 'styles'} · {r.jobCount} images
              </p>
              <p className="text-xs text-ink-muted truncate mt-0.5">
                {r.styles.slice(0, 3).join(' · ')}{r.styles.length > 3 ? ` +${r.styles.length - 3}` : ''}
              </p>
              <p className="text-[11px] text-ink-muted mt-1">
                {formatRelativeTime(r.createdAt)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ---------------------------------------------------------------- results panel

interface ResultsPanelProps {
  heroPreview: string;
  jobs: Job[];
  allDone: boolean;
  doneCount: number;
  analysisFailures: string[];
  runStyles: string[];
  promptMode: PromptMode;
  view: 'grid' | 'compare';
  onViewChange: (v: 'grid' | 'compare') => void;
}

function ResultsPanel({ heroPreview, jobs, allDone, doneCount, analysisFailures, runStyles, promptMode, view, onViewChange }: ResultsPanelProps) {
  // Cost accounting. Successful image generations only count their own cost.
  // Analysis is always counted (even when it fails, input tokens were consumed).
  // We show actual incurred cost as the run progresses, plus a projected total.
  const incurredImageCostAud = jobs.reduce(
    (sum, j) => sum + (j.status === 'done' ? variantCostAud(j.provider, j.quality, j.analysisMode) : 0),
    0,
  );
  const projectedImageCostAud = jobs.reduce(
    (sum, j) => sum + variantCostAud(j.provider, j.quality, j.analysisMode),
    0,
  );
  const analysisCostAud = runStyles.length * ANALYSIS_AUD_PER_STYLE;
  const incurredTotalAud = incurredImageCostAud + analysisCostAud;
  const projectedTotalAud = projectedImageCostAud + analysisCostAud;
  const displayVariants = variantsForPromptMode(promptMode);
  const runModeLabel = promptMode === 'spatial-ref' ? 'Reference-aware' : 'Hero-only';
  const carouselVariants: CarouselVariant[] = displayVariants.map((v) => ({
    id: v.id,
    provider: v.provider,
    quality: v.quality,
    analysisMode: v.analysisMode,
    promptMode: v.promptMode,
    label: v.label,
    shortLabel: v.shortLabel,
    costAud: variantCostAud(v.provider, v.quality, v.analysisMode),
  }));
  const carouselJobs: CarouselJob[] = jobs.map((j) => ({
    jobId: j.jobId,
    style: j.style,
    provider: j.provider,
    quality: j.quality,
    analysisMode: j.analysisMode,
    promptMode: j.promptMode,
    status: j.status,
    imageUrl: j.imageUrl,
    error: j.error,
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-surface-border bg-white p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-6 flex-wrap">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-navy/45">Progress</p>
            <p className="font-heading text-xl text-brand-navy mt-1">
              {allDone ? `Done · ${doneCount} of ${jobs.length} succeeded` : `${doneCount} of ${jobs.length} ready`}
            </p>
            <p className="text-[10px] text-ink-muted mt-0.5">
              {runModeLabel} six-variant run
            </p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-navy/45">Cost</p>
            <p className="font-heading text-xl text-brand-navy mt-1 tabular-nums">
              A${incurredTotalAud.toFixed(2)}
              {!allDone && (
                <span className="text-sm text-ink-muted font-sans font-normal"> / projected A${projectedTotalAud.toFixed(2)}</span>
              )}
            </p>
            <p className="text-[10px] text-ink-muted">
              {jobs.filter((j) => j.status === 'done').length} images · {runStyles.length} {runStyles.length === 1 ? 'analysis' : 'analyses'} (A${analysisCostAud.toFixed(2)})
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-48 h-2 rounded-full bg-surface-border overflow-hidden">
            <div
              className="h-full bg-brand-teal transition-[width] duration-500 ease-out"
              style={{ width: `${jobs.length === 0 ? 0 : Math.round((doneCount / jobs.length) * 100)}%` }}
            />
          </div>
          {/* View toggle */}
          <div className="inline-flex rounded-full border border-surface-border bg-white p-1">
            <button
              type="button"
              onClick={() => onViewChange('grid')}
              className={cn('h-8 px-3 rounded-full text-xs font-semibold transition-all', view === 'grid' ? 'bg-brand-navy text-white' : 'text-brand-navy hover:bg-surface-bg')}
            >Grid</button>
            <button
              type="button"
              onClick={() => onViewChange('compare')}
              className={cn('h-8 px-3 rounded-full text-xs font-semibold transition-all', view === 'compare' ? 'bg-brand-navy text-white' : 'text-brand-navy hover:bg-surface-bg')}
            >Compare</button>
          </div>
        </div>
      </div>

      {analysisFailures.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Analysis failed for these styles (still ran with no analysis): {analysisFailures.join(', ')}
        </div>
      )}

      {view === 'compare' && runStyles.length > 0 && (
        <CompareCarousel
          heroSrc={heroPreview}
          styles={runStyles}
          variants={carouselVariants}
          jobs={carouselJobs}
          analysisCostAud={ANALYSIS_AUD_PER_STYLE}
        />
      )}

      {view === 'grid' && runStyles.map((style) => {
        const styleJobs = jobs.filter((j) => j.style === style);
        const rowIncurred = styleJobs.reduce(
          (sum, j) => sum + (j.status === 'done' ? variantCostAud(j.provider, j.quality, j.analysisMode) : 0),
          0,
        ) + ANALYSIS_AUD_PER_STYLE;
        return (
          <section key={style}>
            <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
              <h2 className="font-heading text-2xl text-brand-navy">{style}</h2>
              <p className="text-sm text-ink-muted tabular-nums">
                A${rowIncurred.toFixed(2)}
                <span className="text-[11px] text-ink-muted/70"> · incl. A${ANALYSIS_AUD_PER_STYLE.toFixed(2)} analysis</span>
              </p>
            </div>
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <div className="grid gap-4 min-w-[1500px] grid-cols-6">
                {displayVariants.map((v) => {
                  const job = styleJobs.find((j) =>
                    j.provider === v.provider &&
                    j.quality === v.quality &&
                    j.analysisMode === v.analysisMode &&
                    (!j.promptMode || !v.promptMode || j.promptMode === v.promptMode),
                  );
                  return <ResultCell key={v.shortLabel} variant={v} job={job} heroPreview={heroPreview} />;
                })}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ResultCell({ variant, job, heroPreview }: { variant: Variant; job?: Job; heroPreview: string }) {
  // No matching job means this slot was never run in this comparison —
  // typically a new variant viewed inside a saved run that pre-dated it.
  // Render a clear "not run" state so the cell doesn't look like it's
  // forever-pending.
  const hasJob = !!job;
  const status: JobStatus = job?.status ?? 'pending';
  const elapsed = job ? ((job.finishedAt ?? Date.now()) - job.startedAt) / 1000 : 0;
  return (
    <div className="rounded-xl border border-surface-border bg-white overflow-hidden flex flex-col">
      <div className="px-3 py-2 border-b border-surface-border flex items-center justify-between bg-white">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-navy">{variant.shortLabel}</p>
        {hasJob ? <StatusBadge status={status} /> : (
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full bg-brand-navy/5 text-brand-navy/50">Not run</span>
        )}
      </div>
      <div className="aspect-[4/3] relative bg-surface-bg" style={{ containerType: 'size' }}>
        {!hasJob ? (
          <div className="absolute inset-0 p-4 flex flex-col items-center justify-center text-center gap-1">
            <p className="text-xs font-semibold text-brand-navy/70">Not generated in this run</p>
            <p className="text-[10px] text-ink-muted leading-snug max-w-[18ch]">This variant was added after this run.</p>
          </div>
        ) : status === 'done' && job?.imageUrl ? (
          <BeforeAfterSlider
            beforeSrc={heroPreview}
            afterSrc={job.imageUrl}
            beforeLabel="Original"
            afterLabel={variant.shortLabel}
            fitParent
            className="absolute inset-0"
          />
        ) : status === 'error' ? (
          <div className="absolute inset-0 p-4 flex items-center justify-center text-center">
            <p className="text-xs text-red-700 leading-snug">{job?.error || 'Generation failed'}</p>
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-8 rounded-full border-2 border-brand-navy/20 border-t-brand-teal animate-spin" />
          </div>
        )}
      </div>
      <div className="px-3 py-2 text-[11px] text-ink-muted tabular-nums flex items-center justify-between gap-2">
        <span>
          {!hasJob ? '—' : status === 'done' && job ? `Generated in ${elapsed.toFixed(1)}s` : status === 'error' ? 'Failed' : `${elapsed.toFixed(0)}s elapsed`}
        </span>
        <span className={cn(
          'text-brand-navy font-semibold',
          status === 'error' && 'text-ink-muted/60 line-through',
          !hasJob && 'text-ink-muted/40 line-through',
        )}>
          A${variantCostAud(variant.provider, variant.quality, variant.analysisMode).toFixed(3)}
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'bg-brand-navy/10 text-brand-navy' },
    running: { label: 'Running', cls: 'bg-brand-teal/15 text-brand-teal' },
    done: { label: 'Done', cls: 'bg-emerald-100 text-emerald-800' },
    error: { label: 'Error', cls: 'bg-red-100 text-red-800' },
  };
  const m = map[status];
  return <span className={cn('text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full', m.cls)}>{m.label}</span>;
}
