import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { downloadFromS3 } from '@/lib/aws/s3';
import { parseConciergeNotes, stripConciergeNotes } from './parse-concierge-notes';

export interface RunAnalysisInput {
  heroS3Key: string;
  referenceS3Keys: string[];
  roomTypes: string[];
  /**
   * Optional staging style (e.g. "Modern", "Coastal"). When present, a
   * per-room style calibration block is appended to the analysis prompt.
   */
  style?: string;
  notes: string;
  /**
   * Admin opt-in: when true, run the analysis through the direct Anthropic
   * API on claude-opus-4-7 instead of the default Bedrock Opus 4.6 path.
   * Requires ANTHROPIC_API_KEY. Defaults to false — regular users always
   * use the Bedrock path.
   */
  useOpus47?: boolean;
}

export interface RunAnalysisResult {
  analysis: string;
  concierge_notes: string[];  // 0-4 strings parsed from the CONCIERGE NOTES section
}

/**
 * User-notes block — injected when the wizard's Notes step produced content.
 * We ask the analyser to interpret the user's free-form note as CONSTRAINTS
 * on the staging, and to fold them into the existing constraints map alongside
 * style calibration. Treated on the same footing as style — a first-class
 * input, not an afterthought appended at the end.
 */
function userNotesBlock(notes: string): string {
  return `
USER NOTES — the user wrote the following about this space, the furniture they want, or things to avoid:
"""
${notes.trim()}
"""

Treat these notes as CONTEXT that shapes the staging plan, not a replacement for it. Fold them into your CONSTRAINTS MAP and your Furniture WITHIN constraints reasoning. Distinguish two modes by reading the user's language:

ADDITIVE mode (default) — the user names items they want ("include…", "add…", or bare item lists). Those items appear IN ADDITION TO the standard furniture a real Australian home of this room type and style would contain. Example: "include an L-shaped sofa and a potted plant" → deliver the full living-room arrangement (sofa, coffee table, rug, lamps, art, etc.) with the L-shaped sofa AS the sofa and a potted plant placed appropriately. Do NOT strip anything out because the user didn't name it.

EXCLUSIVE mode — the user uses limiting language: "only X", "just X", "nothing else", "no other furniture", "X only". Those items form the complete set. The default furniture does NOT appear. Example: "only a bed and two nightstands, nothing else" → exactly those three items, no dresser, no rug, no art, no lamp.

NEGATIVE CONSTRAINTS — "no glass", "avoid chrome", "no standing lamps" — omit those items from whatever plan you produce (additive or exclusive). Translate vague lifestyle notes to concrete material choices: "client has a dog" → durable woven rugs, no delicate glass surfaces, no tippable floor lamps; "nursery" → soft palette, rounded edges, include a cot if bedroom.

Surface any EXCLUDE list only when you detect exclusive language or a negative constraint. Default to additive.`;
}

/**
 * Style calibration block — injected into the analysis prompt when a style is
 * chosen. Purpose: get the analyser to reason about THIS room's capacity to
 * carry THIS style, producing concrete CAN / CANNOT lists that downstream
 * staging can respect. This directly addresses two observed failure modes:
 *   - Boho changing walls to add textile treatments (macrame, tapestry).
 *   - Luxury inflating the perceived scale of small/ordinary rooms.
 *
 * Kept strictly additive — does not replace the existing structural rules;
 * sits alongside them so the staging model gets a deeper constraint set
 * without losing the "walls/floors/windows unchanged" core promise.
 */
function styleCalibrationBlock(style: string): string {
  return `
STYLE APPLICATION — "${style}" calibrated to THIS specific room:
- Concrete pieces that FIT this room's actual surfaces, lighting, proportions (be specific — e.g. "low rattan bed frame in natural finish", not "boho bed"). Name materials, not tropes.
- Features that DO NOT fit here and must NOT appear. Reason from the room, not the style. Examples to consider: a room with extensive glazing has no solid wall for textiles/tapestry; a compact room cannot carry a chaise, grand chandelier, or double-dresser; an already-patterned floor excludes bold rugs; low ceilings preclude pendant clusters.
- Walls, floors, ceilings, windows, doors, built-ins are NEVER part of the "${style}" treatment. "${style}" is applied ONLY to freestanding furniture and to décor items placed on EXISTING surfaces — never by changing the surfaces themselves. No murals, no wall-colour changes, no fabric wall panels, no ceiling treatments. Wall-hung items (art, mirrors, sconces) go on EXISTING suitable walls only (never on glass, not on fixed structural features).
- Density rule: match what a real Australian home of this size would actually contain. Empty walking space is functional — do not fill it just because "${style}" traditionally includes more items. Decorative styles (Boho, Luxury, Hamptons) require RESTRAINT in visually-busy rooms (feature walls, strong glazing, exposed beams). Minimal styles (Minimalist, Japandi, Scandinavian) stay sparse even in large rooms.
- Scale rule: match furniture to this room's ACTUAL dimensions, not to style stereotype. If "${style}" traditionally reads as grand and this room is modest, one well-chosen statement piece is enough. Do not render the room as larger than it is.`;
}

/**
 * Static instructions — cached across all analyses within the 5-min TTL.
 * MUST stay byte-stable across requests. Do NOT interpolate timestamps,
 * per-request IDs, or other volatile content here.
 *
 * Focal-point guidance is folded into section 3 below so the system prompt
 * stays cache-friendly regardless of room-type count; per-request zone
 * identification happens in the user message.
 */
const ANALYSIS_SYSTEM_PROMPT = `You are an expert interior designer preparing to virtually stage a room photo.

When multiple images are provided, IMAGE 1 is the ONLY photo that will be staged. Images 2 onwards are OTHER ANGLES of the exact same room — use them ONLY to understand the room's 3D layout and what exists outside Image 1's frame.

Your analysis follows this structure:

STEP 1 — CAMERA POSITION ANALYSIS (when reference angles are provided):
- Where is the camera positioned in Image 1 relative to the room?
- What is BEHIND the camera?
- What is to the LEFT outside the frame?
- What is to the RIGHT outside the frame?
- What zone/area does Image 1 actually show?

STEP 2 — Respond with the sections below. When references are not provided, skip camera position analysis and go straight to these sections using Image 1 alone.

1. **Camera position & what's visible**: What zone does Image 1 show? What's behind the camera, left, right? (Skip if no references.)

2. **Features to preserve UNCHANGED**: Every architectural feature — walls, flooring, ceiling, doors, windows, blinds, fixtures, outlets, mirrors, built-ins.

3. **FOCAL POINT** — where the room ORIENTS ITSELF. Per zone, pick the strongest focal point visible in the hero photo:
   - Living / family / lounge zone — fireplace, mounted TV or natural TV wall, feature wall, prominent built-in, strong architectural feature. Default: longest uninterrupted wall.
   - Dining zone — EXISTING pendant or chandelier is IMMOVABLE and anchors the table directly below it. Otherwise feature wall or window with genuine view.
   - Kitchen zone — island counter, range/hood, or work triangle center.
   - Outdoor / patio / deck / balcony — fire pit, outdoor fireplace, pergola, pool edge, strong view (garden/water/bushland), or longest seating-accommodating edge.
   - Bedroom — headboard wall (wall opposite door, or longest uninterrupted wall clearing door swing).
   Open-plan caveat: if zones share the space with no obvious divider, use light-fixture positions, ceiling beams, or flooring transitions as zone boundaries. Multi-zone rooms identify focal points SEPARATELY per zone.

4. **CONSTRAINTS MAP (most important section)**: Room features are IMMOVABLE. Furniture must work AROUND them. For each constraint define a NO-GO ZONE:
   - DOORS: swing direction and arc — no furniture within.
   - WARDROBES/CLOSETS: access clearance needed — no furniture blocking.
   - MIRRORS/FEATURE WALLS: furniture COMPLEMENTS, does not cover.
   - WINDOWS: keep accessible, don't block natural light.
   - WALKING PATHS: door to bed, door to wardrobe, door to window. Minimum 70cm.
   - BUILT-INS: heaters, air con, shelves — need clearance.

5. **Furniture WITHIN constraints**: Given no-go zones, suggest the BEST arrangement. For EACH piece:
   - WHICH WALL
   - ORIENTATION: state which direction it faces AND which focal point it's oriented toward (e.g. "sofa faces the fireplace", "dining table centered directly under the existing pendant")
   - POSITION: centered or offset and why
   - Fewer well-placed pieces beat cramming.

6. **CONCIERGE NOTES** — 3 to 4 short observations about this SPECIFIC ROOM, written for the USER to read during the 20–40 s wait for their staged image. These layer on top of 3 style-derived notes the app already has — your job here is ROOM-SPECIFIC observation, not STYLE-GENERAL description. Rules:
   - Each note ≤ 14 words. Present tense. Warm, observational, no jargon.
   - Reference something real and visible in the hero photo (a feature, a lighting direction, a proportion).
   - Observational, NOT promissory. Say "Noted the bay window — keeping that sightline clear" not "We'll fix the wall crack".
   - Never mention structural changes, colour changes, or anything we would not deliver.
   - If USER NOTES are present in the user message (above the style calibration block), include EXACTLY ONE note that echoes the user's wording back (e.g. user said "cosy" → "You asked for cosy — leaning into soft timber tones"). This is a single, concrete acknowledgement, not a paraphrase.
   - Do NOT include the style name or room type unless it adds real information beyond the user already knowing what they picked.

Format the section EXACTLY as below, with one bullet per note and no extra commentary. Emit ONE optional third bullet when a user-echo note is warranted, per the rule above — do NOT echo this instruction in your output:

CONCIERGE NOTES:
- [note 1]
- [note 2]

CRITICAL: constraints come FIRST. Function over aesthetics.`;

/**
 * Per-request user context — images + style/notes/room-type calibration.
 * Explicitly NOT cached (varies per request).
 */
function buildUserContext(args: {
  roomTypes: string[];
  style?: string;
  notes: string;
  hasRefs: boolean;
}): string {
  const roomTypeStr = args.roomTypes.length > 0
    ? `This space contains: ${args.roomTypes.join(' + ')}. Suggest furniture appropriate for these zone(s) ONLY.`
    : '';
  const refsLine = args.hasRefs
    ? `Multiple photos provided — IMAGE 1 is the only one to stage. Others are reference angles.`
    : `Single photo provided.`;
  const styleBlock = args.style ? `\n\n${styleCalibrationBlock(args.style)}` : '';
  const notesBlockStr = args.notes && args.notes.trim().length > 0
    ? `\n\n${userNotesBlock(args.notes)}`
    : '';
  return [refsLine, roomTypeStr, styleBlock, notesBlockStr].filter(Boolean).join('\n\n').trim();
}

// Bedrock client — authenticates via the standard AWS credentials chain (env,
// profile, IAM role). No ANTHROPIC_API_KEY needed. Region defaults to
// AWS_REGION or falls back to ap-southeast-2 (Sydney).
const bedrockClient = new AnthropicBedrock({
  awsRegion: process.env.AWS_REGION || 'ap-southeast-2',
});

// Anthropic direct — used only when admin opts into Opus 4.7.
// Lazy-init so the module doesn't throw when ANTHROPIC_API_KEY is unset.
let anthropicDirectClient: Anthropic | null = null;
function getAnthropicDirectClient(): Anthropic {
  if (!anthropicDirectClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not set — cannot use Opus 4.7 direct path');
    }
    anthropicDirectClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicDirectClient;
}

/**
 * Core analysis logic, extracted from `/api/analyse` so server-side callers
 * (e.g. the batch-staging entry route) can run it in-process without an HTTP
 * round-trip. Pure: no auth, no request parsing, no NextResponse.
 *
 * Behaviour is identical to the HTTP route — any change here must also be
 * reflected in what single-staging clients see.
 */
export async function runAnalysis(input: RunAnalysisInput): Promise<RunAnalysisResult> {
  const { heroS3Key, referenceS3Keys, roomTypes, style, notes, useOpus47 = false } = input;
  const allKeys = [heroS3Key, ...referenceS3Keys];
  const hasRefs = referenceS3Keys.length > 0;

  // Download all images in parallel.
  const imageBuffers = await Promise.all(allKeys.map((k) => downloadFromS3(k)));

  const userText = buildUserContext({ roomTypes, style, notes, hasRefs });

  const imageBlocks = imageBuffers.map((buf) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/jpeg' as const,
      data: buf.toString('base64'),
    },
  }));

  // Admin opt-in: direct Anthropic API on Opus 4.7. Otherwise stay on the
  // default Bedrock Opus 4.6 AU inference profile. Both SDKs share an
  // identical messages.create shape — only the client and model id differ.
  const client = useOpus47 ? getAnthropicDirectClient() : bedrockClient;
  const modelId = useOpus47 ? 'claude-opus-4-7' : 'au.anthropic.claude-opus-4-6-v1';

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 1400,
    thinking: { type: 'adaptive' },
    system: [
      {
        type: 'text',
        text: ANALYSIS_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: userText },
        ],
      },
    ],
  });

  // Extract text from the response — Claude returns a ContentBlock[] with
  // potentially interleaved thinking + text blocks; we only want the text.
  const analysis = response.content
    .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  if (!analysis) {
    throw new Error('Claude returned no analysis text');
  }

  const concierge_notes = parseConciergeNotes(analysis);
  const analysisForLambda = stripConciergeNotes(analysis);
  return { analysis: analysisForLambda, concierge_notes };
}
