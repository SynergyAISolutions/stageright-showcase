/**
 * Structural validation via Meta SAM 2 (Replicate) + masked pixel comparison.
 *
 * Goal: detect when a staged image's WALL/FLOOR/CEILING/WINDOW pixels have
 * meaningfully diverged from the original empty-room photo — i.e. the AI
 * has "rebuilt the room" rather than just adding furniture.
 *
 * Approach:
 *   1. SAM 2 automatic segmentation on the ORIGINAL image → structural mask.
 *      (SAM works better on the empty photo — no furniture clutter to confuse
 *      its segmentation; the largest region-touching-edge segments are walls
 *      and floor by construction.)
 *   2. Decode both images to same-size RGB pixel arrays via sharp.
 *   3. For every pixel inside the structural mask, compute RGB Euclidean
 *      distance between original and staged. Average across the mask.
 *   4. Return a normalised 0-1 score. Low = structure preserved. High = the
 *      AI changed the walls/floor/etc and we can see it.
 *
 * If SAM is unavailable (no token / API error), we degrade gracefully to a
 * whole-image pixel compare and flag the result as "coarse" — the caller
 * knows to interpret carefully because furniture pixels will dominate.
 */
import Replicate from 'replicate';
import sharp from 'sharp';
import { uploadToS3, getSignedDownloadUrl, getS3Key } from '@/lib/aws/s3';
import { ulid } from 'ulid';

// Calibrated against real-world StageRight data (Pro model, varied rooms/styles):
// a staging that preserves structure cleanly scores around 3-7% deviation;
// a staging that rebuilt walls/wall surfaces scores 15%+. Threshold at 7%
// gives strong separation without flagging noise from anti-aliasing and
// mild lighting shift.
const STRUCTURAL_DEVIATION_THRESHOLD = 0.07;

// Max Y-coordinate (as fraction of frame height) that a pixel is allowed to
// count as structural. Furniture below this line is likely to occlude walls
// in the staged image; above the line, walls are almost never occluded.
const TOP_HALF_MASK_CUTOFF = 0.50;

// Common size for pixel comparisons. Keeps SAM fast and memory low; any
// structural change large enough to matter will show up at this resolution.
const COMPARE_WIDTH = 512;
const COMPARE_HEIGHT = 384;

export type ValidationBucket = 'tight-match' | 'minor-shift' | 'major-shift' | 'undetermined';

export interface ValidationResult {
  passed: boolean;
  deviationScore: number; // 0-1, lower is better
  bucket: ValidationBucket;
  samUsed: boolean;
  message: string;
  /** For admin debugging — the size of the structural region as % of frame. */
  structuralCoveragePct?: number;
  /** If SAM failed, the actual reason — so we can debug instead of guessing. */
  samError?: string;
  /** What was received back from Replicate (type/shape summary). */
  samRawShape?: string;
}

// ---------- Image decoding ----------

async function decodeToRgb(
  buffer: Buffer,
): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buffer)
    .resize(COMPARE_WIDTH, COMPARE_HEIGHT, { fit: 'fill' }) // fill so mask + images align perfectly
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// ---------- Upload helper so SAM has a public URL ----------

async function getPublicImageUrl(buffer: Buffer, mimeType: string): Promise<string> {
  const id = ulid();
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const s3Key = getS3Key('validation', 'originals', id, `original.${ext}`);
  await uploadToS3(s3Key, buffer, mimeType);
  return getSignedDownloadUrl(s3Key, 600); // 10-minute expiry — enough for SAM to fetch it
}

// ---------- SAM 2 structural mask ----------

interface MaskBuildResult {
  mask: Buffer | null;
  error?: string;
  rawShape?: string;
}

/**
 * Run SAM 2 on the image, pick the largest few segments that touch the frame
 * edge (walls/floor/ceiling almost always touch edges), rasterise them into a
 * single 0/255 mask at COMPARE_WIDTH × COMPARE_HEIGHT.
 *
 * Returns a diagnostic object instead of a bare Buffer so the caller can
 * surface WHY the mask build failed (model not found, auth denied, weird
 * response shape, etc.) — essential for debugging what's actually happening.
 */
async function buildStructuralMask(imageUrl: string): Promise<MaskBuildResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return { mask: null, error: 'REPLICATE_API_TOKEN not set in the environment' };
  }

  const replicate = new Replicate({ auth: token });

  // Replicate's .run() with a bare "meta/sam-2" slug 404s because the model
  // isn't configured to be callable via the /v1/models/{owner}/{name}/predictions
  // endpoint. Fetch the model's latest_version.id first, then call the
  // identifier with the explicit version hash (":version") — that works for
  // any model whether or not Replicate has flagged it "official".
  let versionId: string | undefined;
  try {
    const modelRes = await fetch('https://api.replicate.com/v1/models/meta/sam-2', {
      headers: { Authorization: `Token ${token}` },
    });
    if (!modelRes.ok) {
      const body = await modelRes.text().catch(() => '');
      return {
        mask: null,
        error: `Could not fetch model info: HTTP ${modelRes.status} ${body.slice(0, 200)}`,
      };
    }
    const modelInfo = await modelRes.json() as { latest_version?: { id?: string } };
    versionId = modelInfo.latest_version?.id;
    if (!versionId) {
      return { mask: null, error: 'Replicate model info returned no latest_version.id' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { mask: null, error: `Model lookup failed: ${msg}` };
  }

  let raw: unknown;
  try {
    raw = await replicate.run(
      `meta/sam-2:${versionId}` as `${string}/${string}:${string}`,
      {
        input: {
          image: imageUrl,
          // Automatic "everything" mode — segment the whole image, no prompts.
          use_m2m: true,
          points_per_side: 16,
        },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[validate] SAM call threw', msg);
    return { mask: null, error: `Replicate prediction failed (version ${versionId.slice(0, 8)}…): ${msg}` };
  }

  const rawShape = describeShape(raw);

  try {

    // SAM's output shape varies across Replicate SDK versions. In SDK v1.x,
    // file outputs are FileOutput objects (with a .url() method), not bare
    // strings. We handle: string, URL, FileOutput, plain {url:...} or
    // {href:...} object.
    const output = raw;
    let maskUrls: string[] = [];

    if (Array.isArray(output)) {
      maskUrls = output.map(extractUrl).filter((v): v is string => v !== null);
    } else if (output && typeof output === 'object') {
      const obj = output as Record<string, unknown>;

      // Prefer individual_masks (gives us per-segment URLs we can rank).
      if (Array.isArray(obj.individual_masks)) {
        maskUrls = obj.individual_masks
          .map(extractUrl)
          .filter((v): v is string => v !== null);
      }

      // Fallback: combined_mask (a single merged mask — crude but usable).
      if (maskUrls.length === 0 && obj.combined_mask !== undefined) {
        const combinedUrl = extractUrl(obj.combined_mask);
        if (combinedUrl) {
          const mask = await fetchAndNormaliseMask(combinedUrl);
          return mask
            ? { mask, rawShape }
            : { mask: null, error: 'combined_mask URL fetched but image decode failed', rawShape };
        }
      }
    } else {
      const single = extractUrl(output);
      if (single) maskUrls = [single];
    }

    if (maskUrls.length === 0) {
      const innerShapes = describeInnerShapes(output);
      return {
        mask: null,
        error: `SAM ran but no URLs could be extracted. Shape details: ${innerShapes}`,
        rawShape,
      };
    }

    // Fetch each mask, score it, pick top N "structural-looking" ones.
    const scored = await Promise.all(
      maskUrls.slice(0, 20).map(async (url) => {
        const mask = await fetchAndNormaliseMask(url);
        if (!mask) return null;
        const summary = summariseMask(mask);
        return { mask, ...summary };
      }),
    );

    // Structural candidates: segments that (a) touch a frame edge AND (b)
    // have their vertical centre of mass in the TOP 60% of the frame.
    //
    // The Y-centre filter is the key defence against the "floor problem":
    // floors are large, edge-touching segments but their centre of mass sits
    // in the bottom 20-30% of the frame. Including them pollutes the score
    // because furniture in the staged image covers those floor pixels — the
    // validator would register that as 'structural change' when it's really
    // just furniture placement.
    //
    // Walls typically sit with Y-centre 0.3-0.5, ceilings 0.1-0.2. Both pass.
    // Floors at Y-centre 0.7+ are correctly excluded.
    const candidates = scored
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .filter((x) => x.touchesEdge && x.area > 0.02) // at least 2% of frame
      .filter((x) => x.centerY < 0.60) // exclude floor-dominant segments
      .sort((a, b) => b.area - a.area)
      .slice(0, 5); // top 5 largest remaining segments

    if (candidates.length === 0) {
      return {
        mask: null,
        error: `SAM ran but no segments met the structural criteria (edge-touching, area>=2%, top 60% of frame). Got ${scored.filter(Boolean).length} total segments.`,
        rawShape,
      };
    }

    // Union the candidate masks into one structural mask.
    const union = Buffer.alloc(COMPARE_WIDTH * COMPARE_HEIGHT, 0);
    for (const c of candidates) {
      for (let i = 0; i < union.length; i++) {
        if (c.mask[i] > 127) union[i] = 255;
      }
    }

    // Restrict to the TOP half of the frame — the single biggest win for
    // mask quality. Furniture (beds, sofas, dressers) sits in the bottom
    // half and occludes wall pixels there; those wall pixels end up being
    // furniture in the staged image, producing false 'structural change'.
    const cutoffY = Math.floor(COMPARE_HEIGHT * TOP_HALF_MASK_CUTOFF);
    for (let y = cutoffY; y < COMPARE_HEIGHT; y++) {
      for (let x = 0; x < COMPARE_WIDTH; x++) {
        union[y * COMPARE_WIDTH + x] = 0;
      }
    }

    // Erode inward to shave boundary artefacts from fuzzy segmentation + the
    // Y-cutoff line itself.
    return { mask: erodeMask(union, 6), rawShape };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[validate] SAM post-processing error', msg);
    return { mask: null, error: `Mask post-processing failed: ${msg}`, rawShape };
  }
}

/** Short description of the Replicate response shape for debugging. */
function describeShape(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return `string(${v.length} chars)`;
  if (typeof v === 'function') return 'function';
  if (Array.isArray(v)) return `array(length=${v.length})`;
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj);
    return `object{${keys.slice(0, 5).join(',')}${keys.length > 5 ? ',…' : ''}}`;
  }
  return typeof v;
}

/**
 * Drill into an object's top-level fields and describe each — used when the
 * top-level shape check passes (e.g., we got `object{combined_mask,individual_masks}`)
 * but extraction still failed, so we need to know what those fields actually
 * contain (FileOutput? string? nested object?).
 */
function describeInnerShapes(v: unknown): string {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return describeShape(v);
  const obj = v as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of Object.keys(obj).slice(0, 5)) {
    parts.push(`${k}=${describeShape(obj[k])}`);
  }
  return parts.join(', ');
}

/**
 * Extract a URL string from whatever Replicate gave us. Handles:
 *   - plain strings                         → returned as-is
 *   - URL instances                         → .href
 *   - FileOutput objects (SDK v1.x)         → .url() method
 *   - objects with string url/href fields   → the string
 */
function extractUrl(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (v instanceof URL) return v.href;
  if (!v || typeof v !== 'object') return null;

  const obj = v as Record<string, unknown>;

  // FileOutput exposes .url() as a method
  if (typeof obj.url === 'function') {
    try {
      const u = (obj.url as () => unknown).call(v);
      if (typeof u === 'string') return u;
      if (u instanceof URL) return u.href;
      if (u && typeof u === 'object' && typeof (u as { href?: unknown }).href === 'string') {
        return (u as { href: string }).href;
      }
    } catch { /* noop */ }
  }

  // Plain objects with a url/href property
  if (typeof obj.url === 'string') return obj.url;
  if (typeof obj.href === 'string') return obj.href;

  return null;
}

// ---------- Mask helpers ----------

/**
 * Fetch a SAM mask URL and decode to a single-channel 0/255 buffer at
 * COMPARE_WIDTH × COMPARE_HEIGHT. Masks come in as PNGs (black/white or
 * alpha-masked); sharp handles both shapes.
 */
async function fetchAndNormaliseMask(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    const { data } = await sharp(Buffer.from(arr))
      .resize(COMPARE_WIDTH, COMPARE_HEIGHT, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return data;
  } catch {
    return null;
  }
}

function summariseMask(
  mask: Buffer,
): { area: number; touchesEdge: boolean; centerY: number } {
  const total = COMPARE_WIDTH * COMPARE_HEIGHT;
  let on = 0;
  let touchesEdge = false;
  let ySum = 0;

  for (let y = 0; y < COMPARE_HEIGHT; y++) {
    for (let x = 0; x < COMPARE_WIDTH; x++) {
      const i = y * COMPARE_WIDTH + x;
      if (mask[i] > 127) {
        on++;
        ySum += y;
        if (x === 0 || y === 0 || x === COMPARE_WIDTH - 1 || y === COMPARE_HEIGHT - 1) {
          touchesEdge = true;
        }
      }
    }
  }

  return {
    area: on / total,
    touchesEdge,
    centerY: on > 0 ? (ySum / on) / COMPARE_HEIGHT : 0,
  };
}

/**
 * Shrink the mask inward by `radius` pixels. Fast two-pass implementation
 * using a manhattan distance transform approximation: a pixel stays ON iff
 * every pixel within `radius` of it (in its row AND column) was ON in the
 * original mask. Good enough for our purposes — we only need to shave off
 * boundaries where furniture-against-wall artefacts pollute the comparison.
 */
function erodeMask(mask: Buffer, radius: number): Buffer {
  const width = COMPARE_WIDTH;
  const height = COMPARE_HEIGHT;
  const horizontal = Buffer.alloc(width * height, 0);

  // Horizontal pass: a pixel stays ON iff all pixels within `radius` to the
  // left AND right are ON.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = true;
      for (let dx = -radius; dx <= radius && on; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= width || mask[y * width + nx] < 128) on = false;
      }
      if (on) horizontal[y * width + x] = 255;
    }
  }

  // Vertical pass on the horizontal result.
  const out = Buffer.alloc(width * height, 0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = true;
      for (let dy = -radius; dy <= radius && on; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height || horizontal[ny * width + x] < 128) on = false;
      }
      if (on) out[y * width + x] = 255;
    }
  }

  return out;
}

// ---------- Pixel comparison ----------

const MAX_RGB_DISTANCE = Math.sqrt(3) * 255;

/**
 * Mean RGB Euclidean distance between two decoded images, restricted to
 * pixels where `mask` is true. Returns 0-1 normalised score.
 */
function maskedMeanRgbDistance(
  a: Buffer,
  b: Buffer,
  mask: Buffer | null,
): { score: number; pixelsCompared: number } {
  const totalPixels = COMPARE_WIDTH * COMPARE_HEIGHT;
  let sum = 0;
  let count = 0;

  for (let i = 0; i < totalPixels; i++) {
    if (mask && mask[i] < 128) continue;
    const ar = a[i * 3], ag = a[i * 3 + 1], ab = a[i * 3 + 2];
    const br = b[i * 3], bg = b[i * 3 + 1], bb = b[i * 3 + 2];
    const dr = ar - br, dg = ag - bg, db = ab - bb;
    sum += Math.sqrt(dr * dr + dg * dg + db * db);
    count++;
  }

  return {
    score: count > 0 ? sum / count / MAX_RGB_DISTANCE : 0,
    pixelsCompared: count,
  };
}

// ---------- Bucket classification ----------

function classify(score: number, samUsed: boolean): ValidationBucket {
  if (!samUsed) return 'undetermined'; // coarse fallback — caller should treat cautiously
  // Thresholds calibrated against real stagings (not synthetic data):
  //   unchanged structure clusters 3-7% (lighting/anti-aliasing noise floor)
  //   modest surface tweaks      8-14%
  //   genuine structural rebuild 15%+
  if (score <= 0.07) return 'tight-match';
  if (score <= 0.15) return 'minor-shift';
  return 'major-shift';
}

// ---------- Main entry point ----------

export async function validateStructuralPreservation(
  originalBuffer: Buffer,
  originalMimeType: string,
  stagedBuffer: Buffer,
): Promise<ValidationResult> {
  try {
    const [original, staged] = await Promise.all([
      decodeToRgb(originalBuffer),
      decodeToRgb(stagedBuffer),
    ]);

    // Try SAM first — we want a structural mask on the original.
    let samResult: MaskBuildResult = { mask: null };
    try {
      const originalUrl = await getPublicImageUrl(originalBuffer, originalMimeType);
      samResult = await buildStructuralMask(originalUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      samResult = { mask: null, error: `Could not prepare image for SAM: ${msg}` };
    }

    const samUsed = samResult.mask !== null;
    const { score, pixelsCompared } = maskedMeanRgbDistance(
      original.data,
      staged.data,
      samResult.mask,
    );
    const structuralCoveragePct = samResult.mask
      ? Math.round((pixelsCompared / (COMPARE_WIDTH * COMPARE_HEIGHT)) * 100)
      : undefined;

    const bucket = classify(score, samUsed);
    const passed = samUsed && score <= STRUCTURAL_DEVIATION_THRESHOLD;

    const pct = (score * 100).toFixed(1);
    const message = samUsed
      ? `Structural deviation ${pct}% over ${structuralCoveragePct}% of the frame (threshold ${(STRUCTURAL_DEVIATION_THRESHOLD * 100).toFixed(0)}%).`
      : `Whole-frame deviation ${pct}% — SAM did not produce a mask, so this number includes furniture. See diagnostic below.`;

    return {
      passed,
      deviationScore: Math.round(score * 10000) / 10000,
      bucket,
      samUsed,
      message,
      structuralCoveragePct,
      samError: samResult.error,
      samRawShape: samResult.rawShape,
    };
  } catch (err) {
    console.error('[validate] Error', err);
    return {
      passed: true, // do not block callers on validation failure
      deviationScore: -1,
      bucket: 'undetermined',
      samUsed: false,
      message: err instanceof Error ? `Validation error: ${err.message}` : 'Validation error',
    };
  }
}

export { STRUCTURAL_DEVIATION_THRESHOLD };
