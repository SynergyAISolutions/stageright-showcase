import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { deductCredits, getUserById } from '@/lib/db/users';
import { createBatchJob } from '@/lib/db/batch-jobs';
import { invokeStagingWorker } from '@/lib/aws/lambda';
import { STAGING_STYLES } from '@/lib/ai/prompts';
import { assertKeysAccessible } from '@/lib/auth/s3-ownership';
import { ADMIN_EMAILS } from '@/types';
import { getListingById } from '@/lib/db/listings';
import {
  variantsForBundle,
  creditsPerStyle,
  maxStylesForBundle,
  type Bundle,
} from '@/types';

export const dynamic = 'force-dynamic';

const VALID_STYLES = new Set<string>(STAGING_STYLES);

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const isAdmin = ADMIN_EMAILS.includes(session.user.email);

  let body: {
    heroS3Key?: string;
    referenceS3Keys?: string[];
    roomTypes?: string[];
    styles?: string[];
    notes?: string;
    bundle?: Bundle;
    listingId?: string;
    /**
     * First-stage-only engine override. Allows the onboarding flow to force a
     * specific engine for the user's first staging (e.g. GPT Image 2 Full High
     * instead of the default slot-1 NB Pro). Only honored when:
     *   - bundle === 'single', AND
     *   - the user has zero credits spent (= true first-stage)
     * Otherwise silently ignored.
     */
    engineOverride?: {
      provider?: 'gemini' | 'openai';
      quality?: 'standard' | 'low' | 'medium' | 'high';
      analysisMode?: 'full' | 'lean-direct';
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const {
    heroS3Key,
    referenceS3Keys = [],
    roomTypes = [],
    styles = [],
    notes = '',
    bundle = 'triple',
  } = body;

  if (!heroS3Key) {
    return NextResponse.json({ error: 'heroS3Key required' }, { status: 400 });
  }
  if (bundle !== 'single' && bundle !== 'triple') {
    return NextResponse.json({ error: 'bundle must be single or triple' }, { status: 400 });
  }

  const access = assertKeysAccessible([heroS3Key, ...referenceS3Keys], session.user);
  if (!access.ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const maxStyles = maxStylesForBundle(bundle);
  if (!Array.isArray(styles) || styles.length < 1 || styles.length > maxStyles) {
    return NextResponse.json(
      { error: `styles must be 1 to ${maxStyles} entries for bundle '${bundle}'` },
      { status: 400 },
    );
  }
  if (new Set(styles).size !== styles.length) {
    return NextResponse.json({ error: 'duplicate styles not allowed' }, { status: 400 });
  }
  for (const s of styles) {
    if (!VALID_STYLES.has(s)) {
      return NextResponse.json({ error: `unknown style: ${s}` }, { status: 400 });
    }
  }

  const rawListingId = body.listingId;
  let listingId: string | undefined;
  if (rawListingId && rawListingId !== 'unsorted') {
    const owned = await getListingById(session.user.id, rawListingId);
    if (!owned) {
      return NextResponse.json({ error: 'unknown listingId' }, { status: 400 });
    }
    listingId = rawListingId;
  }

  // Engine override (first-stage only). Resolved BEFORE credit deduction so
  // we can use a single getUserById() lookup for both the override gate and
  // any future first-stage logic. The override is silently ignored if the
  // user is no longer first-stage — no error, just falls back to defaults.
  let effectiveOverride: {
    provider: 'gemini' | 'openai';
    model: 'nano-banana-pro' | 'gpt-image-2';
    quality: 'standard' | 'low' | 'medium' | 'high';
    analysisMode: 'full' | 'lean-direct';
  } | null = null;
  if (bundle === 'single' && body.engineOverride) {
    const user = await getUserById(session.user.id);
    const creditsSpent = user?.stagesCompletedTotal ?? 0;
    if (creditsSpent === 0) {
      const ov = body.engineOverride;
      const provider = ov.provider ?? 'gemini';
      effectiveOverride = {
        provider,
        model: provider === 'openai' ? 'gpt-image-2' : 'nano-banana-pro',
        quality: ov.quality ?? 'standard',
        analysisMode: ov.analysisMode ?? 'full',
      };
    }
  }

  const creditAction = bundle === 'triple' ? 'staging_triple' : 'staging_standard';
  const creditCost = styles.length * creditsPerStyle(bundle);
  const deductResult = await deductCredits(session.user.id, creditAction, creditCost);
  if (!deductResult.success) {
    return NextResponse.json(
      { error: 'insufficient credits', creditsRemaining: deductResult.creditsRemaining },
      { status: 402 },
    );
  }

  // Analysis no longer runs at the API layer. The staging-worker Lambda runs
  // it instead — for triple bundle, the slot-1 leader per style runs analysis
  // once and fans out to siblings with the result. For single bundle, the
  // Lambda runs its own analysis exactly as today. See spec
  // docs/superpowers/specs/2026-05-06-stage-batch-cold-start-design.md.
  const batch = await createBatchJob({
    userId: session.user.id,
    bundle,
    heroS3Key,
    referenceS3Keys,
    roomTypes,
    notes,
    styles,
    listingId,
  });

  const variantConfigs = variantsForBundle(bundle);

  await Promise.all(
    batch.subJobs.flatMap((sub) =>
      sub.variants
        // Triple mode: only invoke slot-1 leaders — they fan out to siblings
        // from inside the Lambda. Single mode: only one variant exists, this
        // is a no-op filter.
        .filter((v) => bundle === 'single' || v.slot === 1)
        .map((variant) => {
        const cfg = variantConfigs.find((c) => c.slot === variant.slot);
        if (!cfg) {
          // Defensive: variantsForBundle and createBatchJob are both built from
          // TRIPLE_VARIANTS / SINGLE_VARIANTS; if they ever drift, fail loudly.
          throw new Error(
            `variant slot ${variant.slot} not in bundle '${bundle}' config`,
          );
        }
        // Apply the first-stage engine override if it resolved earlier.
        // effectiveOverride is null in all but the onboarding-style first
        // staging case, so this is a passthrough for everyone else.
        const dispatchProvider = effectiveOverride?.provider ?? cfg.provider;
        const dispatchModel = effectiveOverride?.model ?? cfg.model;
        const dispatchQuality = effectiveOverride?.quality ?? cfg.quality;
        const dispatchAnalysisMode = effectiveOverride?.analysisMode ?? 'full';
        return invokeStagingWorker({
          jobId: variant.jobId,
          action: 'stage',
          batchId: batch.batchId,
          params: {
            userId: session.user.id,
            sessionId: variant.jobId,
            heroS3Key,
            referenceS3Keys,
            roomTypes,
            style: sub.style,
            notes,
            // Always empty from the API now. The Lambda either receives this
            // pre-populated from a leader's fan-out (siblings in triple mode)
            // or runs its own analysis (single mode + leaders themselves).
            roomAnalysis: '',
            conciergeNotes: [],
            useOpus47: true,
            model: dispatchModel,
            provider: dispatchProvider,
            quality: dispatchQuality,
            analysisMode: dispatchAnalysisMode,
            variantSlot: variant.slot,
            bundle,
            applyWatermark: !isAdmin,
            ...(bundle === 'triple' ? { isLeader: true } : {}),
            ...(listingId ? { listingId } : {}),
          },
        });
      }),
    ),
  );

  return NextResponse.json(
    {
      batchId: batch.batchId,
      bundle,
      subJobs: batch.subJobs.map((s) => ({
        style: s.style,
        variants: s.variants.map((v) => ({ slot: v.slot, jobId: v.jobId })),
      })),
    },
    { status: 202 },
  );
}
