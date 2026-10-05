'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import type { LandingPick } from '@/lib/db/landing-picks';
import type { ThumbnailRoom } from '@/components/staging/style-row';
import { STAGING_STYLES, type StagingStyle } from '@/lib/ai/prompts';
import { BeforeAfterSlider } from '@/components/comparison/before-after-slider';
import { cn } from '@/lib/utils/cn';

function parseSetIndex(sk: string): number {
  const m = sk.match(/#(\d+)$/);
  return m ? Number(m[1]) : 0;
}

interface CandidatesResponse {
  heroes: { s3Key: string; createdAt: string }[];
  stagings: { heroS3Key: string; style: string; stagedS3Key: string; createdAt: string }[];
  urls: Record<string, string>;
}

const HUMAN_LABELS: Record<ThumbnailRoom, string> = {
  'living': 'Living + Dining', 'living-room': 'Living Room', 'dining-room': 'Dining Room',
  'bedroom': 'Bedroom', 'bedroom-bathroom': 'Bedroom + Bathroom',
  'master-suite': 'Master Suite', 'kitchen': 'Kitchen',
  'bathroom': 'Bathroom', 'home-office': 'Home Office', 'kids-room': 'Kids Room',
  'studio': 'Studio', 'guest-room': 'Guest Room', 'outdoor': 'Outdoor',
};

function countPicks(p: LandingPick | undefined): number {
  if (!p?.picks) return 0;
  return STAGING_STYLES.filter((s) => p.picks?.[s]).length;
}

function countPicksAcrossSets(list: LandingPick[] | undefined): number {
  if (!list || list.length === 0) return 0;
  return list.reduce((sum, p) => sum + countPicks(p), 0);
}

export function LandingImagesClient({
  roomSlugs,
  initialPicks,
}: {
  roomSlugs: ThumbnailRoom[];
  initialPicks: Partial<Record<ThumbnailRoom, LandingPick[]>>;
}) {
  const [picks, setPicks] = useState(initialPicks);
  const [activeRoom, setActiveRoom] = useState<ThumbnailRoom>(roomSlugs[0]);
  const [activeSetIndexByRoom, setActiveSetIndexByRoom] = useState<Partial<Record<ThumbnailRoom, number>>>({});
  // Local-only drafts for sets that haven't been saved yet (after +Add).
  // Keyed by `ROOM#${roomSlug}#${setIndex}` (matches sk format). Cleared on
  // first successful save.
  const [draftSets, setDraftSets] = useState<Record<string, LandingPick>>({});
  const [candidates, setCandidates] = useState<CandidatesResponse | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [saving, setSaving] = useState(false);

  // Combined sets list per room: persisted picks + local drafts (sorted by setIndex).
  const setsForActiveRoom = useMemo(() => {
    const persisted = picks[activeRoom] ?? [];
    const drafts = Object.values(draftSets).filter((s) => s.sk.startsWith(`ROOM#${activeRoom}#`));
    const all = [...persisted, ...drafts];
    return all.sort((a, b) => parseSetIndex(a.sk) - parseSetIndex(b.sk));
  }, [picks, draftSets, activeRoom]);

  const activeSetIndex = activeSetIndexByRoom[activeRoom] ?? 0;
  const activeSet = setsForActiveRoom.find((s) => parseSetIndex(s.sk) === activeSetIndex)
    ?? setsForActiveRoom[0];

  const [draftPicks, setDraftPicks] = useState<Partial<Record<StagingStyle, string>>>(activeSet?.picks ?? {});
  // Per-style hero source: tracks which empty room each style was generated
  // from. Sent to the save endpoint so the public landing's slider can
  // render a meaningful before/after comparison.
  const [draftHeroes, setDraftHeroes] = useState<Partial<Record<StagingStyle, string>>>(activeSet?.heroByStyle ?? {});
  const [draftEnabled, setDraftEnabled] = useState<boolean>(activeSet?.enabled ?? false);

  // Modal viewer — when set, opens fullscreen comparison for that style.
  const [viewerStyle, setViewerStyle] = useState<StagingStyle | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);

  const [confirmingDelete, setConfirmingDelete] = useState<{ slug: ThumbnailRoom; setIndex: number } | null>(null);

  // Re-sync drafts when the active room or active setIndex changes.
  useEffect(() => {
    setDraftPicks(activeSet?.picks ?? {});
    setDraftHeroes(activeSet?.heroByStyle ?? {});
    setDraftEnabled(activeSet?.enabled ?? false);
  }, [activeRoom, activeSetIndex, activeSet]);

  // Fetch candidates whenever the active room changes (the candidates list
  // is per-room, not per-set — same pool of variants regardless of which
  // set you're editing).
  //
  // Stale-response guard: if the user clicks Room A then quickly clicks
  // Room B, A's fetch may still be in-flight and resolve AFTER B's. Without
  // this guard, the state is set to A's candidates while the active pill
  // is B — confusing wrong-room data. The cleanup function flips a
  // `cancelled` flag so a late response is dropped.
  useEffect(() => {
    let cancelled = false;
    setCandidates(null);
    setLoadingCandidates(true);
    fetch(`/api/admin/landing-picks/candidates?room=${activeRoom}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setCandidates(data);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingCandidates(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeRoom]);

  // Build per-style variant lists once per candidates change. Each variant
  // carries its source heroS3Key so the modal slider can show before/after.
  const variantsByStyle = useMemo(() => {
    const out: Partial<Record<StagingStyle, { stagedS3Key: string; heroS3Key: string; createdAt: string }[]>> = {};
    if (!candidates) return out;
    for (const style of STAGING_STYLES) {
      out[style] = candidates.stagings
        .filter((s) => s.style === style)
        .map((s) => ({
          stagedS3Key: s.stagedS3Key,
          heroS3Key: s.heroS3Key,
          createdAt: s.createdAt,
        }));
    }
    return out;
  }, [candidates]);

  function pickStyle(style: StagingStyle, stagedKey: string, heroKey: string) {
    setDraftPicks((p) => ({ ...p, [style]: stagedKey }));
    setDraftHeroes((h) => ({ ...h, [style]: heroKey }));
  }

  function clearStyle(style: StagingStyle) {
    setDraftPicks((p) => {
      const next = { ...p };
      delete next[style];
      return next;
    });
    setDraftHeroes((h) => {
      const next = { ...h };
      delete next[style];
      return next;
    });
  }

  function nextAvailableSetIndex(): number {
    const used = new Set(setsForActiveRoom.map((s) => parseSetIndex(s.sk)));
    for (let i = 0; i < 10; i++) if (!used.has(i)) return i;
    return -1;
  }

  function addNewSet() {
    const idx = nextAvailableSetIndex();
    if (idx === -1) {
      toast.error('Maximum 10 sets per room');
      return;
    }
    const sk = `ROOM#${activeRoom}#${idx}` as `ROOM#${string}`;
    setDraftSets((d) => ({
      ...d,
      [sk]: {
        pk: 'LANDING_PICK',
        sk,
        enabled: false,
        picks: {},
        heroByStyle: {},
        updatedAt: new Date().toISOString(),
      },
    }));
    setActiveSetIndexByRoom((prev) => ({ ...prev, [activeRoom]: idx }));
  }

  async function deleteSet(slug: ThumbnailRoom, setIndex: number) {
    // Local-only draft? Just drop from state, no API call.
    const draftKey = `ROOM#${slug}#${setIndex}`;
    if (draftSets[draftKey]) {
      setDraftSets((d) => {
        const n = { ...d };
        delete n[draftKey];
        return n;
      });
      setActiveSetIndexByRoom((prev) => ({ ...prev, [slug]: 0 }));
      setConfirmingDelete(null);
      return;
    }
    // Persisted — call DELETE endpoint.
    try {
      const res = await fetch(`/api/admin/landing-picks?roomSlug=${slug}&setIndex=${setIndex}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setPicks((prev) => {
        const list = prev[slug] ?? [];
        return { ...prev, [slug]: list.filter((p) => parseSetIndex(p.sk) !== setIndex) };
      });
      setActiveSetIndexByRoom((prev) => ({ ...prev, [slug]: 0 }));
      toast.success(`Set ${setIndex + 1} deleted`);
    } catch {
      toast.error('Delete failed — try again');
    } finally {
      setConfirmingDelete(null);
    }
  }

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/landing-picks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          roomSlug: activeRoom,
          setIndex: activeSetIndex,
          enabled: draftEnabled,
          picks: draftPicks,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      const updated: LandingPick = {
        pk: 'LANDING_PICK',
        sk: `ROOM#${activeRoom}#${activeSetIndex}`,
        enabled: draftEnabled,
        picks: draftPicks,
        heroByStyle: draftHeroes,
        updatedAt: new Date().toISOString(),
      };
      setPicks((prev) => {
        const list = prev[activeRoom] ?? [];
        const without = list.filter((p) => parseSetIndex(p.sk) !== activeSetIndex);
        return {
          ...prev,
          [activeRoom]: [...without, updated].sort((a, b) => parseSetIndex(a.sk) - parseSetIndex(b.sk)),
        };
      });
      // First-save promotes a draft to persisted; clear the draft entry.
      setDraftSets((d) => {
        const k = `ROOM#${activeRoom}#${activeSetIndex}`;
        if (!(k in d)) return d;
        const next = { ...d };
        delete next[k];
        return next;
      });
      toast.success('Landing updated', {
        description: 'Refresh / in a private window to see picks live.',
      });
    } catch {
      toast.error('Save failed — try again');
    } finally {
      setSaving(false);
    }
  }, [activeRoom, activeSetIndex, draftEnabled, draftPicks, draftHeroes]);

  // Keyboard nav inside the viewer modal.
  useEffect(() => {
    if (!viewerStyle) return;
    function onKey(e: KeyboardEvent) {
      const list = variantsByStyle[viewerStyle!] ?? [];
      if (list.length === 0) return;
      if (e.key === 'ArrowRight') setViewerIndex((i) => (i + 1) % list.length);
      if (e.key === 'ArrowLeft') setViewerIndex((i) => (i - 1 + list.length) % list.length);
      if (e.key === 'Escape') setViewerStyle(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerStyle, variantsByStyle]);

  const draftCount = STAGING_STYLES.filter((s) => draftPicks[s]).length;

  return (
    <div className="space-y-8">
      {/* Room tabs */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-brand-teal mb-3">
          Rooms
        </h2>
        <div className="flex flex-wrap gap-2">
          {roomSlugs.map((slug) => {
            const list = picks[slug];
            const setCount = list?.length ?? 0;
            const totalPicks = countPicksAcrossSets(list);
            const active = slug === activeRoom;
            return (
              <button
                key={slug}
                onClick={() => setActiveRoom(slug)}
                className={[
                  'px-3 h-9 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2',
                  active
                    ? 'bg-brand-navy text-white border-brand-navy'
                    : 'bg-white text-brand-navy border-surface-border hover:bg-surface-secondary',
                ].join(' ')}
              >
                <span>{HUMAN_LABELS[slug]}</span>
                <span className={['text-[11px] tabular-nums px-1.5 py-0.5 rounded', active ? 'bg-white/20' : 'bg-surface-secondary'].join(' ')}>
                  {setCount} {setCount === 1 ? 'set' : 'sets'} · {totalPicks}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sub-tab row — sets within the active room */}
        <div className="mt-4 flex flex-wrap items-center gap-1">
          {setsForActiveRoom.map((s) => {
            const idx = parseSetIndex(s.sk);
            const isActive = idx === activeSetIndex;
            const isDraft = !!draftSets[s.sk];
            return (
              <div key={s.sk} className="relative group">
                <button
                  type="button"
                  onClick={() => setActiveSetIndexByRoom((prev) => ({ ...prev, [activeRoom]: idx }))}
                  className={cn(
                    'px-3 h-8 rounded-md text-sm font-medium border transition-colors flex items-center gap-2',
                    isActive
                      ? 'bg-brand-navy text-white border-brand-navy'
                      : 'bg-white text-brand-navy border-surface-border hover:bg-surface-secondary',
                  )}
                >
                  Set {idx + 1}
                  {isDraft && <span className="text-[10px] uppercase tracking-wider opacity-70">draft</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete({ slug: activeRoom, setIndex: idx })}
                  aria-label={`Delete set ${idx + 1}`}
                  className="absolute -top-1 -right-1 size-4 rounded-full bg-brand-coral text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addNewSet}
            className="px-3 h-8 rounded-md text-sm font-medium border border-dashed border-surface-border text-brand-navy/70 hover:bg-surface-secondary transition-colors"
          >
            + Add new
          </button>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draftEnabled}
            onChange={(e) => setDraftEnabled(e.target.checked)}
          />
          Enable {HUMAN_LABELS[activeRoom]} on the public landing
        </label>
      </section>

      {/* Per-style rows: each row shows current pick (large) + a "Browse N variants" button. */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-brand-teal mb-3">
          Styles
        </h2>
        {loadingCandidates && <p className="text-sm text-ink-secondary">Loading…</p>}
        {!loadingCandidates && candidates && (
          <div className="space-y-4">
            {STAGING_STYLES.map((style) => {
              const variants = variantsByStyle[style] ?? [];
              const picked = draftPicks[style];
              const pickedUrl = picked ? candidates.urls[picked] : undefined;
              const hasVariants = variants.length > 0;
              return (
                <div
                  key={style}
                  className="grid grid-cols-[180px_1fr] gap-4 items-center py-3 border-t border-surface-border"
                >
                  <div>
                    <p className="font-medium text-brand-navy text-base">{style}</p>
                    <p className="text-xs text-ink-secondary mt-0.5">
                      {hasVariants ? `${variants.length} variant${variants.length === 1 ? '' : 's'}` : 'No stagings yet'}
                    </p>
                    {picked && (
                      <button onClick={() => clearStyle(style)} className="mt-1 text-xs text-brand-coral hover:underline">
                        Clear pick
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Picked thumbnail (or empty placeholder) */}
                    <div className="aspect-[4/3] w-48 sm:w-56 rounded-lg overflow-hidden border-2 border-brand-teal bg-surface-secondary flex items-center justify-center text-xs text-ink-secondary">
                      {pickedUrl ? (
                        <Image src={pickedUrl} alt="" fill sizes="240px" className="object-cover" />
                      ) : (
                        <span>Not picked</span>
                      )}
                    </div>
                    {/* Browse CTA */}
                    {hasVariants ? (
                      <button
                        onClick={() => {
                          setViewerStyle(style);
                          // Open on the picked one if any, else first.
                          const idx = picked ? variants.findIndex((v) => v.stagedS3Key === picked) : 0;
                          setViewerIndex(idx >= 0 ? idx : 0);
                        }}
                        className="inline-flex items-center px-4 h-10 rounded-lg bg-brand-navy text-white text-sm font-medium hover:bg-brand-navy-light transition-colors"
                      >
                        {picked ? 'Change' : 'Browse'} {variants.length} variant{variants.length === 1 ? '' : 's'}
                      </button>
                    ) : (
                      <a
                        href={`/stage?style=${encodeURIComponent(style)}`}
                        className="inline-flex items-center px-3 h-10 rounded-lg bg-brand-teal text-white text-sm font-medium"
                      >
                        Stage it →
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Sticky save bar */}
      <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-white/90 backdrop-blur-sm border-t border-surface-border flex items-center justify-between">
        <p className="text-sm text-ink-secondary">
          {draftCount}/12 styles picked for {HUMAN_LABELS[activeRoom]}
        </p>
        <button
          onClick={save}
          disabled={saving}
          className="px-5 h-10 rounded-lg bg-brand-navy text-white font-medium disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save & sync to landing'}
        </button>
      </div>

      {/* Fullscreen viewer modal */}
      {viewerStyle && candidates && (
        <ViewerModal
          style={viewerStyle}
          variants={variantsByStyle[viewerStyle] ?? []}
          urls={candidates.urls}
          activeIndex={viewerIndex}
          onIndexChange={setViewerIndex}
          currentPick={draftPicks[viewerStyle]}
          onPick={(stagedKey, heroKey) => {
            pickStyle(viewerStyle, stagedKey, heroKey);
            toast.success(`${viewerStyle} pick updated — remember to Save`);
          }}
          onClose={() => setViewerStyle(null)}
        />
      )}

      {/* In-app confirm-delete modal */}
      {confirmingDelete && (
        <div
          className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmingDelete(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-elevated"
          >
            <h3 className="font-heading text-lg text-brand-navy">
              Delete Set {confirmingDelete.setIndex + 1}?
            </h3>
            <p className="mt-2 text-sm text-ink-secondary">
              This removes the set from the public landing immediately. Your individual stagings are not deleted.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(null)}
                className="px-4 h-10 rounded-lg border border-surface-border text-sm font-medium text-brand-navy hover:bg-surface-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteSet(confirmingDelete.slug, confirmingDelete.setIndex)}
                className="px-4 h-10 rounded-lg bg-brand-coral text-white text-sm font-bold hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ViewerModalProps {
  style: StagingStyle;
  variants: { stagedS3Key: string; heroS3Key: string; createdAt: string }[];
  urls: Record<string, string>;
  activeIndex: number;
  onIndexChange: (i: number) => void;
  currentPick: string | undefined;
  onPick: (stagedKey: string, heroKey: string) => void;
  onClose: () => void;
}

function ViewerModal({
  style,
  variants,
  urls,
  activeIndex,
  onIndexChange,
  currentPick,
  onPick,
  onClose,
}: ViewerModalProps) {
  // Compare-mode toggle: when true, drag-slider before (empty) vs after
  // (staged). When false, just the staged image full-screen.
  const [compareMode, setCompareMode] = useState(true);
  if (variants.length === 0) return null;
  const current = variants[Math.max(0, Math.min(activeIndex, variants.length - 1))];
  const stagedUrl = urls[current.stagedS3Key];
  const heroUrl = urls[current.heroS3Key];
  const isPicked = currentPick === current.stagedS3Key;
  const canCompare = Boolean(heroUrl && stagedUrl);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex flex-col"
      role="dialog"
      aria-modal="true"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 h-14 text-white">
        <div className="flex items-center gap-3">
          <span className="font-bold text-base">{style}</span>
          <span className="text-sm opacity-75 tabular-nums">
            {activeIndex + 1} / {variants.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canCompare && (
            <button
              onClick={() => setCompareMode((v) => !v)}
              className={[
                'h-9 px-3 rounded-full text-xs font-bold uppercase tracking-wider transition-colors',
                compareMode
                  ? 'bg-brand-teal text-white'
                  : 'bg-white/10 text-white/80 hover:bg-white/20',
              ].join(' ')}
            >
              {compareMode ? 'Compare ON' : 'Compare OFF'}
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="size-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-xl leading-none"
          >
            ×
          </button>
        </div>
      </div>

      {/* Big image — slider in compare mode, plain img otherwise */}
      <div
        className="flex-1 flex items-center justify-center px-4 sm:px-12 pb-4 relative min-h-0"
        style={{ containerType: 'size' }}
      >
        {variants.length > 1 && (
          <button
            onClick={() => onIndexChange((activeIndex - 1 + variants.length) % variants.length)}
            aria-label="Previous"
            className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 size-10 sm:size-12 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center text-2xl z-10"
          >
            ‹
          </button>
        )}
        {compareMode && canCompare ? (
          <BeforeAfterSlider
            beforeSrc={heroUrl!}
            afterSrc={stagedUrl!}
            beforeLabel="Empty"
            afterLabel={style}
            fitParent
            className="shadow-2xl"
          />
        ) : stagedUrl ? (
          <div className="relative w-full h-full">
            <Image
              src={stagedUrl}
              alt={`${style} variant ${activeIndex + 1}`}
              fill
              priority
              sizes="100vw"
              className="object-contain rounded-lg shadow-2xl"
            />
          </div>
        ) : (
          <span className="text-white">Image unavailable</span>
        )}
        {variants.length > 1 && (
          <button
            onClick={() => onIndexChange((activeIndex + 1) % variants.length)}
            aria-label="Next"
            className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 size-10 sm:size-12 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center text-2xl z-10"
          >
            ›
          </button>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3 border-t border-white/10">
        {/* Variant strip */}
        <div className="flex gap-2 overflow-x-auto flex-1 min-w-0">
          {variants.map((v, i) => {
            const thumbUrl = urls[v.stagedS3Key];
            const active = i === activeIndex;
            return (
              <button
                key={v.stagedS3Key}
                onClick={() => onIndexChange(i)}
                className={[
                  'flex-shrink-0 aspect-[4/3] w-20 rounded-md overflow-hidden border-2',
                  active ? 'border-brand-teal-light' : 'border-transparent opacity-60 hover:opacity-100',
                ].join(' ')}
              >
                {thumbUrl && <Image src={thumbUrl} alt="" fill sizes="80px" className="object-cover" />}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => onPick(current.stagedS3Key, current.heroS3Key)}
          disabled={isPicked}
          className={[
            'px-5 h-11 rounded-lg font-bold text-sm whitespace-nowrap transition-colors',
            isPicked
              ? 'bg-white/20 text-white/60 cursor-not-allowed'
              : 'bg-brand-teal text-white hover:bg-brand-teal-light',
          ].join(' ')}
        >
          {isPicked ? 'Picked ✓' : 'Pick this one'}
        </button>
      </div>
    </div>
  );
}
