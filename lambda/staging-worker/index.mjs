/**
 * StageRight Staging Worker Lambda
 *
 * Uses @google/genai SDK with multi-turn chat for edits.
 * Thought signatures are handled automatically by the SDK.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GoogleGenAI } from '@google/genai';
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { ulid } from 'ulid';
import { applyWatermark } from './lib/apply-watermark.mjs';

const REGION = process.env.AWS_REGION || 'ap-southeast-2';
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'stageright';
const S3_BUCKET = process.env.S3_BUCKET_NAME || 'stageright-images';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const dynamodb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION }),
  { marshallOptions: { removeUndefinedValues: true } },
);

const s3 = new S3Client({ region: REGION });
const bedrock = new BedrockRuntimeClient({ region: REGION });
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const lambdaClient = new LambdaClient({ region: REGION });
const SELF_FUNCTION_NAME = process.env.AWS_LAMBDA_FUNCTION_NAME || 'stageright-staging-worker';

// Claude clients for in-Lambda analysis. Bedrock authenticates via the standard
// AWS credentials chain (IAM role on Lambda). Anthropic direct is lazy-init so
// the module doesn't throw when ANTHROPIC_API_KEY is unset (useOpus47=false path).
const anthropicBedrock = new AnthropicBedrock({ awsRegion: REGION });

let anthropicDirectClient = null;
function getAnthropicDirectClient() {
  if (!anthropicDirectClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not set — cannot use Opus 4.7 direct path');
    }
    anthropicDirectClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicDirectClient;
}

async function setListingCoverIfMissing(userId, listingId, stagedS3Key) {
  if (!userId || !listingId) return;
  try {
    const listings = await dynamodb.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'LISTING#' },
      Limit: 200,
    }));
    const match = (listings.Items || []).find((l) => l.id === listingId);
    if (!match) return;
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: match.sk },
      UpdateExpression: 'SET coverS3Key = :cover, updatedAt = :now',
      ConditionExpression: 'attribute_not_exists(coverS3Key)',
      ExpressionAttributeValues: { ':cover': stagedS3Key, ':now': new Date().toISOString() },
    }));
  } catch (err) {
    if (err && err.name === 'ConditionalCheckFailedException') return;
    console.warn('[StagingWorker] setListingCoverIfMissing failed:', err && err.message);
  }
}

// ---------- Analysis (in-Lambda per-style calibration) ----------
//
// Ported byte-identical from src/lib/ai/run-analysis.ts so the batch route can
// fan out fast (no in-route analysis) and each sub-Lambda computes its own
// style-specific analysis inside its 300s budget.
//
// Keep ANALYSIS_SYSTEM_PROMPT, userNotesBlock, and styleCalibrationBlock
// byte-identical to the TS module — they are load-bearing accumulated
// calibration from months of tuning.

function userNotesBlock(notes) {
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

function styleCalibrationBlock(style) {
  return `
STYLE APPLICATION — "${style}" calibrated to THIS specific room:
- Concrete pieces that FIT this room's actual surfaces, lighting, proportions (be specific — e.g. "low rattan bed frame in natural finish", not "boho bed"). Name materials, not tropes.
- Features that DO NOT fit here and must NOT appear. Reason from the room, not the style. Examples to consider: a room with extensive glazing has no solid wall for textiles/tapestry; a compact room cannot carry a chaise, grand chandelier, or double-dresser; an already-patterned floor excludes bold rugs; low ceilings preclude pendant clusters.
- Walls, floors, ceilings, windows, doors, built-ins are NEVER part of the "${style}" treatment. "${style}" is applied ONLY to freestanding furniture and to décor items placed on EXISTING surfaces — never by changing the surfaces themselves. No murals, no wall-colour changes, no fabric wall panels, no ceiling treatments. Wall-hung items (art, mirrors, sconces) go on EXISTING suitable walls only (never on glass, not on fixed structural features).
- Density rule: match what a real Australian home of this size would actually contain. Empty walking space is functional — do not fill it just because "${style}" traditionally includes more items. Decorative styles (Boho, Luxury, Hamptons) require RESTRAINT in visually-busy rooms (feature walls, strong glazing, exposed beams). Minimal styles (Minimalist, Japandi, Scandinavian) stay sparse even in large rooms.
- Scale rule: match furniture to this room's ACTUAL dimensions, not to style stereotype. If "${style}" traditionally reads as grand and this room is modest, one well-chosen statement piece is enough. Do not render the room as larger than it is.`;
}

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

// ---------- CONCIERGE NOTES parser ----------
//
// KEEP IN SYNC with src/lib/ai/parse-concierge-notes.ts. The Lambda is
// bundled standalone (no shared module with the Next.js app), so both
// files must be updated together when either changes. Regex literals and
// slice limits MUST match byte-for-byte across both files — client and
// server parse the same Claude output and any drift will manifest as
// inconsistent concierge-note counts between single-style (Next.js
// parser) and batch (Lambda parser) paths.

function parseConciergeNotes(analysis) {
  const match = analysis.match(/CONCIERGE NOTES:\s*\n((?:\s*-\s*.+\n?)+)/i);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*/, '').trim())
    .filter((line) => line.length > 0 && line.length <= 200)
    .slice(0, 4);
}

function stripConciergeNotes(analysis) {
  return analysis
    .replace(/(?:^|\n+)CONCIERGE NOTES:\s*\n(?:\s*-\s*.+\n?)+/i, '')
    .trim();
}

// ---------- DEAD CODE — kept for reference until the next Lambda redeploy ----------
// Bonus accounting moved to API layer (Phase F). These helpers are no longer called.
// Safe to delete on the next round of Lambda cleanup.
const BONUS_EVERY = 7;

async function grantBonusIfDue(ddb, tableName, userId) {
  let newCount = 0;
  try {
    const res = await ddb.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression: 'ADD stagesCompletedTotal :one SET updatedAt = :now',
      ConditionExpression: '#plan <> :admin',
      ExpressionAttributeNames: { '#plan': 'plan' },
      ExpressionAttributeValues: {
        ':one': 1,
        ':now': new Date().toISOString(),
        ':admin': 'admin',
      },
      ReturnValues: 'UPDATED_NEW',
    }));
    newCount = (res.Attributes && res.Attributes.stagesCompletedTotal) || 0;
  } catch (e) {
    if (e && e.name === 'ConditionalCheckFailedException') {
      return { bonusGranted: false };
    }
    throw e;
  }

  if (newCount <= 0 || newCount % BONUS_EVERY !== 0) {
    return { bonusGranted: false };
  }

  let newCreditsRemaining = 0;
  try {
    const res = await ddb.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression:
        'ADD creditsRemaining :one SET lastBonusStageCount = :n, updatedAt = :now',
      ConditionExpression:
        'attribute_not_exists(lastBonusStageCount) OR lastBonusStageCount <> :n',
      ExpressionAttributeValues: {
        ':one': 1,
        ':n': newCount,
        ':now': new Date().toISOString(),
      },
      ReturnValues: 'UPDATED_NEW',
    }));
    newCreditsRemaining = (res.Attributes && res.Attributes.creditsRemaining) || 0;
  } catch (e) {
    if (e && e.name === 'ConditionalCheckFailedException') {
      return { bonusGranted: false };
    }
    throw e;
  }

  return { bonusGranted: true, newStageCount: newCount, newCreditsRemaining };
}

async function recordBatchSubJobCompletion(ddb, tableName, { userId, batchId, subJobIndex }) {
  const i = subJobIndex;
  try {
    await ddb.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: `BATCH#${batchId}`, sk: 'META' },
      UpdateExpression: `SET subJobs[${i}].stageCounted = :true`,
      ConditionExpression: `attribute_not_exists(subJobs[${i}].stageCounted)`,
      ExpressionAttributeValues: { ':true': true },
    }));
  } catch (e) {
    if (e && e.name === 'ConditionalCheckFailedException') {
      return { bonusGranted: false };
    }
    throw e;
  }

  const result = await grantBonusIfDue(ddb, tableName, userId);
  if (!result.bonusGranted) return result;

  try {
    await ddb.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: `BATCH#${batchId}`, sk: 'META' },
      UpdateExpression: `SET subJobs[${i}].bonusTriggered = :true, subJobs[${i}].bonusStageCount = :n`,
      ExpressionAttributeValues: { ':true': true, ':n': result.newStageCount },
    }));
  } catch {
    /* credit granted; marker failed — client won't ceremony this variant. Acceptable. */
  }

  return result;
}

async function recordSingleStageCompletion(ddb, tableName, { userId, stagingPk, stagingSk }) {
  try {
    await ddb.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: stagingPk, sk: stagingSk },
      UpdateExpression: 'SET stageCounted = :true',
      ConditionExpression: 'attribute_not_exists(stageCounted)',
      ExpressionAttributeValues: { ':true': true },
    }));
  } catch (e) {
    if (e && e.name === 'ConditionalCheckFailedException') {
      return { bonusGranted: false };
    }
    throw e;
  }

  const result = await grantBonusIfDue(ddb, tableName, userId);
  if (!result.bonusGranted) return result;

  try {
    await ddb.send(new UpdateCommand({
      TableName: tableName,
      Key: { pk: stagingPk, sk: stagingSk },
      UpdateExpression: 'SET bonusTriggered = :true, bonusStageCount = :n',
      ExpressionAttributeValues: { ':true': true, ':n': result.newStageCount },
    }));
  } catch {
    /* acceptable */
  }

  return result;
}

function buildAnalysisUserContext({ roomTypes, style, notes, hasRefs }) {
  const roomTypeStr = roomTypes.length > 0
    ? `This space contains: ${roomTypes.join(' + ')}. Suggest furniture appropriate for these zone(s) ONLY.`
    : '';
  const refsLine = hasRefs
    ? `Multiple photos provided — IMAGE 1 is the only one to stage. Others are reference angles.`
    : `Single photo provided.`;
  const styleBlock = style ? `\n\n${styleCalibrationBlock(style)}` : '';
  const notesBlockStr = notes && notes.trim().length > 0
    ? `\n\n${userNotesBlock(notes)}`
    : '';
  return [refsLine, roomTypeStr, styleBlock, notesBlockStr].filter(Boolean).join('\n\n').trim();
}

/**
 * Run the structural/calibration analysis inside the Lambda. Mirrors
 * src/lib/ai/run-analysis.ts's runAnalysis() logic — only the transport
 * differs (no S3 re-download; hero + refs passed in as base64 strings from
 * the staging path which already downloaded them).
 *
 * Admin opt-in (useOpus47=true) routes to direct Anthropic API on Opus 4.7.
 * Non-admin / missing ANTHROPIC_API_KEY → Bedrock Opus 4.6 fallback.
 */
async function runAnalysisInLambda({ heroBase64, refsBase64, style, notes, roomTypes, useOpus47 }) {
  const hasRefs = Array.isArray(refsBase64) && refsBase64.length > 0;
  const userText = buildAnalysisUserContext({ roomTypes: roomTypes || [], style, notes: notes || '', hasRefs });

  const imageBlocks = [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: heroBase64 } },
    ...(hasRefs ? refsBase64.map((data) => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data },
    })) : []),
  ];

  // Admin opt-in: direct Anthropic API on Opus 4.7. Gracefully degrade to
  // Bedrock if the key is missing so a misconfigured env doesn't break
  // non-admin batches that share this Lambda.
  let client;
  let modelId;
  if (useOpus47 && process.env.ANTHROPIC_API_KEY) {
    client = getAnthropicDirectClient();
    modelId = 'claude-opus-4-7';
  } else {
    if (useOpus47) {
      console.warn('[Analysis] useOpus47=true but ANTHROPIC_API_KEY missing — falling back to Bedrock Opus 4.6');
    }
    client = anthropicBedrock;
    modelId = 'au.anthropic.claude-opus-4-6-v1';
  }

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 1400,   // was 1200 — extra room for CONCIERGE NOTES bullets
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

  const analysis = (response.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  if (!analysis) {
    throw new Error('Claude returned no analysis text');
  }

  const concierge_notes = parseConciergeNotes(analysis);
  const analysisForStaging = stripConciergeNotes(analysis);
  return { analysis: analysisForStaging, concierge_notes };
}

// ---------- Leader fan-out ----------
//
// In triple mode, the API only invokes slot-1 Lambdas as leaders. Each leader
// runs analysis once, persists the result to BATCH_JOB.roomAnalysisByStyle[style]
// + conciergeNotesByStyle[style] for observability, then async-invokes the
// slot-2 and slot-3 Lambdas for its style with the analysis baked into their
// payload. Siblings receive a non-empty roomAnalysis and skip their own
// analysis (existing behaviour at the empty-string fallback below).
//
// Spec: docs/superpowers/specs/2026-05-06-stage-batch-cold-start-design.md

async function fanOutSiblings({ batchId, style, leaderEvent, sharedAnalysis, sharedConciergeNotes }) {
  // Read the BATCH_JOB record to find sibling jobIds.
  const got = await dynamodb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { pk: `BATCH#${batchId}`, sk: 'META' },
    ConsistentRead: true,
  }));
  if (!got.Item) {
    console.error(`[StagingWorker] fanOut: batch ${batchId} not found`);
    return;
  }
  const sub = (got.Item.subJobs || []).find((s) => s.style === style);
  if (!sub) {
    console.error(`[StagingWorker] fanOut: subJob for style=${style} not in batch ${batchId}`);
    return;
  }
  const siblings = (sub.variants || []).filter((v) => v.slot !== 1);

  // Dispatch config per slot — must match TRIPLE_VARIANTS in src/types/index.ts.
  // Slot 2 = GPT Image 2 Full Medium. Slot 3 = GPT Image 2 Full High.
  // If src/types.ts changes, this MUST change with it.
  const slotConfig = {
    2: { provider: 'openai', model: 'gpt-image-2', quality: 'medium' },
    3: { provider: 'openai', model: 'gpt-image-2', quality: 'high' },
  };

  await Promise.all(siblings.map(async (variant) => {
    const cfg = slotConfig[variant.slot];
    if (!cfg) {
      console.error(`[StagingWorker] fanOut: no config for slot ${variant.slot}`);
      return;
    }
    const siblingPayload = {
      jobId: variant.jobId,
      action: 'stage',
      batchId,
      params: {
        ...leaderEvent.params,
        sessionId: variant.jobId,
        roomAnalysis: sharedAnalysis,
        conciergeNotes: sharedConciergeNotes,
        provider: cfg.provider,
        model: cfg.model,
        quality: cfg.quality,
        variantSlot: variant.slot,
        isLeader: false, // explicit
      },
    };
    try {
      await lambdaClient.send(new InvokeCommand({
        FunctionName: SELF_FUNCTION_NAME,
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify(siblingPayload)),
      }));
      console.log(`[StagingWorker] Fanned out sibling slot=${variant.slot} jobId=${variant.jobId}`);
    } catch (err) {
      console.error(`[StagingWorker] Sibling invoke failed slot=${variant.slot}: ${err.message}`);
      // Mark this variant errored directly so terminal-state refund fires.
      try {
        await propagateToBatch({
          batchId, jobId: variant.jobId, style,
          success: false, error: `fanout-failed: ${err.message}`,
          variantSlot: variant.slot,
        });
      } catch (propErr) {
        console.error(`[StagingWorker] propagateToBatch on fanout failure also failed: ${propErr.message}`);
      }
    }
  }));
}

async function runAsLeader(event) {
  const { params, batchId } = event;
  const { style, roomTypes = [], notes = '', useOpus47, heroS3Key, referenceS3Keys = [] } = params;
  console.log(`[StagingWorker] LEADER for style=${style} batchId=${batchId}`);

  // 1. Download images once. We re-use these buffers for both the leader's
  //    analysis call AND the leader's own stageRoom call below — saves a
  //    full re-download (2-4 MB per image) on the hot path.
  let heroBuf = null;
  let refsBufs = [];
  try {
    heroBuf = await downloadFromS3(heroS3Key);
    refsBufs = await Promise.all(referenceS3Keys.map(downloadFromS3));
  } catch (err) {
    console.error(`[StagingWorker] LEADER S3 download failed style=${style}: ${err.message}`);
    // Fall through with null heroBuf — analysis below will be skipped, fan-out
    // proceeds with empty analysis, leader's own stageRoom re-downloads.
  }

  // 2. Run analysis. If it fails, log and continue with empty analysis —
  //    siblings will fall back to per-Lambda analysis. Cost increase on this
  //    rare failure path is acceptable.
  let analysis = '';
  let conciergeNotes = [];
  if (heroBuf) {
    try {
      const result = await runAnalysisInLambda({
        heroBase64: heroBuf.toString('base64'),
        refsBase64: refsBufs.map((b) => b.toString('base64')),
        style, notes, roomTypes, useOpus47,
      });
      analysis = result.analysis || '';
      conciergeNotes = result.concierge_notes || [];
    } catch (err) {
      console.error(`[StagingWorker] LEADER analysis failed style=${style}: ${err.message}`);
    }
  }

  // 3. Persist for observability. Best-effort — failure here does not block
  //    fan-out (siblings get analysis from payload, not from DDB).
  if (analysis) {
    try {
      await setRoomAnalysisForStyleInLambda({
        batchId, style, analysis, conciergeNotes,
      });
    } catch (err) {
      console.warn(`[StagingWorker] LEADER ddb persist failed style=${style}: ${err.message}`);
    }
  }

  // 4. Fan out to slots 2 + 3.
  await fanOutSiblings({
    batchId, style,
    leaderEvent: event,
    sharedAnalysis: analysis,
    sharedConciergeNotes: conciergeNotes,
  });

  // 5. Return analysis + buffers so the leader's own variant can re-use them —
  //    saves re-running analysis and re-downloading images in stageRoom.
  return { analysis, conciergeNotes, heroBuf, refsBufs };
}

// In-Lambda mirror of src/lib/db/batch-jobs.ts setRoomAnalysisForStyle.
// Kept here (not factored into a shared module) because the Lambda's bundling
// is independent of the Next.js app — sharing TS code would require
// restructuring. Keep these two implementations byte-aligned on schema.
async function setRoomAnalysisForStyleInLambda({ batchId, style, analysis, conciergeNotes }) {
  // Step 1: defensively initialise parent maps if missing (no-op when present).
  // createBatchJob always inits these to {}, so this is belt-and-braces — but
  // cheap insurance for any record that ever lacked them.
  await dynamodb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk: `BATCH#${batchId}`, sk: 'META' },
    UpdateExpression:
      'SET roomAnalysisByStyle = if_not_exists(roomAnalysisByStyle, :emptyMap), ' +
      'conciergeNotesByStyle = if_not_exists(conciergeNotesByStyle, :emptyMap)',
    ExpressionAttributeValues: { ':emptyMap': {} },
  }));
  // Step 2: path-targeted write of this style's data, now safe.
  await dynamodb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk: `BATCH#${batchId}`, sk: 'META' },
    UpdateExpression: 'SET roomAnalysisByStyle.#style = :a, conciergeNotesByStyle.#style = :n',
    ExpressionAttributeNames: { '#style': style },
    ExpressionAttributeValues: { ':a': analysis, ':n': conciergeNotes },
  }));
}

// ---------- S3 helpers ----------

async function downloadFromS3(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  const bytes = await res.Body.transformToByteArray();
  return Buffer.from(bytes);
}

async function uploadToS3(key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET, Key: key, Body: buffer, ContentType: contentType,
  }));
  return key;
}

async function getSignedDownloadUrl(key, expiresIn = 3600) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), { expiresIn });
}

// ---------- Job helpers ----------

async function updateJob(jobId, updates) {
  const entries = Object.entries(updates);
  const names = {};
  const values = { ':now': new Date().toISOString() };
  const setParts = ['updatedAt = :now'];

  for (const [key, val] of entries) {
    names[`#${key}`] = key;
    values[`:${key}`] = val;
    setParts.push(`#${key} = :${key}`);
  }

  await dynamodb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk: `JOB#${jobId}`, sk: 'META' },
    UpdateExpression: `SET ${setParts.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

// ---------- Batch job propagation ----------
// When the calling API passed a batchId, propagate completion / failure up to
// the BATCH_JOB record. Uses read-modify-write with conditional retry to
// handle concurrent sibling Lambda finishes. On error, also refunds 1 credit
// so batch credits are pay-per-success (legacy/single-style path only).
//
// For triple-bundle invocations (variantSlot defined), the jobId matches a
// variant record nested under subJobs[i].variants[j]. Failures in variant mode
// do NOT increment refundedCredits and do NOT issue a per-variant credit refund
// — partial refunds for triple bundles are handled by the API layer (B.4).
//
// Retries up to 10 attempts with 20-100ms randomized jitter, matching the
// Next.js markSubJobDone/markSubJobError implementation. This is the batching
// race-condition hot path: with the 10-style cap, up to 10 Lambdas can finish
// within the same second and all race to update this record. Without jitter
// two co-failing Lambdas can ping-pong on ConditionalCheckFailedException.
async function propagateToBatch({ batchId, jobId, style, success, stagedS3Key, sessionId, error, userId, conciergeNotes, variantSlot }) {
  let propagated = false;
  let subJobIndex = -1;
  let variantIndex = -1;

  for (let attempt = 0; attempt < 10; attempt++) {
    const got = await dynamodb.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: `BATCH#${batchId}`, sk: 'META' },
    }));
    const current = got.Item;
    if (!current) {
      console.warn(`[batch] BATCH_JOB ${batchId} not found; skipping propagation`);
      return { index: -1 };
    }

    // Variant-mode lookup: search subJobs[].variants[] for the matching jobId.
    let foundVariant = false;
    for (let i = 0; i < (current.subJobs || []).length; i++) {
      const s = current.subJobs[i];
      const variants = s.variants || [];
      for (let j = 0; j < variants.length; j++) {
        if (variants[j].jobId === jobId) {
          subJobIndex = i;
          variantIndex = j;
          foundVariant = true;
          break;
        }
      }
      if (foundVariant) break;
    }

    if (!foundVariant) {
      // Legacy lookup: match by top-level subJob.jobId.
      subJobIndex = (current.subJobs || []).findIndex((s) => s.jobId === jobId);
      variantIndex = -1;
    }

    if (subJobIndex < 0) {
      console.warn(`[batch] subJob/variant for jobId ${jobId} not found in BATCH_JOB ${batchId}`);
      return { index: -1 };
    }

    let newSubJobs;
    let updateExpr;

    if (variantIndex >= 0) {
      // Defensive invariant: the located subJob MUST have a variants array. If
      // it doesn't, we'd silently replace it with `variants: []` — bail loudly
      // so we surface the mismatch instead of corrupting state.
      const targetSubJob = current.subJobs[subJobIndex];
      if (!Array.isArray(targetSubJob?.variants)) {
        throw new Error(
          `propagateToBatch: variant-mode invocation (jobId=${jobId}) targeted subJob without variants[] (style="${targetSubJob?.style}", batchId=${batchId})`,
        );
      }
      // Idempotency guard: if this variant is already terminal, a prior writer
      // (the stale-watchdog, or a duplicate invoke) has already counted it.
      // Re-counting pushes completed+failed past total and wedges the batch on
      // "running" forever. Skip the write + the increment.
      const existingVariant = targetSubJob.variants[variantIndex];
      if (existingVariant && (existingVariant.status === 'done' || existingVariant.status === 'failed_after_retry')) {
        console.warn(`[batch] variant ${jobId} already terminal (${existingVariant.status}); skipping re-count`);
        return { index: subJobIndex, variantIndex };
      }
      // Variant-mode write: update subJobs[i].variants[j].
      // Failures write 'failed_after_retry' (the Lambda already exhausted its
      // silent retry before reaching this point). No refundedCredits increment
      // — the API layer handles partial refunds for triple bundles (B.4 task).
      newSubJobs = current.subJobs.map((s, i) => {
        if (i !== subJobIndex) return s;
        const newVariants = (s.variants || []).map((v, j) => {
          if (j !== variantIndex) return v;
          return success
            ? { ...v, status: 'done', stagedS3Key, conciergeNotes }
            : { ...v, status: 'failed_after_retry', error, retried: true };
        });
        // Parent status rollup: 'done' once every variant is terminal (done OR
        // failed_after_retry); 'running' if any is mid-flight; 'pending' otherwise.
        const allTerminal = newVariants.every(
          (v) => v.status === 'done' || v.status === 'failed_after_retry',
        );
        const anyRunning = newVariants.some((v) => v.status === 'running');
        const parentStatus = allTerminal ? 'done' : anyRunning ? 'running' : 'pending';
        return { ...s, status: parentStatus, variants: newVariants };
      });
      updateExpr = success
        ? 'ADD completed :one SET subJobs = :sj'
        : 'ADD failed :one SET subJobs = :sj';
    } else {
      // Legacy single-style write — today's behaviour.
      newSubJobs = (current.subJobs || []).map((s) => {
        if (s.jobId !== jobId) return s;
        return success
          ? { ...s, status: 'done', stagedS3Key, sessionId, conciergeNotes }
          : { ...s, status: 'error', error };
      });
      updateExpr = success
        ? 'ADD completed :one SET subJobs = :sj'
        : 'ADD failed :one, refundedCredits :one SET subJobs = :sj';
    }

    try {
      await dynamodb.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: `BATCH#${batchId}`, sk: 'META' },
        UpdateExpression: updateExpr,
        ConditionExpression: 'completed = :oldC AND failed = :oldF',
        ExpressionAttributeValues: {
          ':one': 1, ':sj': newSubJobs,
          ':oldC': current.completed, ':oldF': current.failed,
        },
      }));
      propagated = true;
      break;
    } catch (err) {
      if (err?.name !== 'ConditionalCheckFailedException') throw err;
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 80));
      // sibling Lambda wrote between our read and update; retry
    }
  }

  if (!propagated) {
    throw new Error(`propagateToBatch: exceeded retries for ${batchId}/${jobId}`);
  }

  // Per-variant refund for legacy single-style failures only. Variant-mode
  // failures are refunded by the API layer's partial-refund logic at terminal
  // batch state (B.4 task).
  if (!success && userId && variantIndex < 0) {
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: 'PROFILE' },
      UpdateExpression: 'ADD creditsRemaining :one SET updatedAt = :now, lastRefundReason = :r',
      ExpressionAttributeValues: {
        ':one': 1,
        ':now': new Date().toISOString(),
        ':r': `batch-sub-job-error:${batchId}:${style}`,
      },
    }));
  }

  return { index: subJobIndex, variantIndex };
}

// ---------- Extract image from SDK response ----------

function extractImage(response) {
  const parts = response.candidates?.[0]?.content?.parts || [];
  let imageData = '', mimeType = 'image/png', text = '';

  for (const part of parts) {
    if (part.inlineData?.data) {
      imageData = part.inlineData.data;
      mimeType = part.inlineData.mimeType || 'image/png';
    }
    if (part.text) {
      text = part.text;
    }
  }

  return { imageData, mimeType, text };
}

// ---------- Extract usage metadata from Gemini response ----------

function extractGeminiUsage(response, modelId) {
  const usage = response.usageMetadata || {};
  const details = {
    promptTokenCount: usage.promptTokenCount || 0,
    candidatesTokenCount: usage.candidatesTokenCount || 0,
    totalTokenCount: usage.totalTokenCount || 0,
    thoughtsTokenCount: usage.thoughtsTokenCount || 0,
    promptTokensDetails: usage.promptTokensDetails || [],
    candidatesTokensDetails: usage.candidatesTokensDetails || [],
    model: modelId,
  };
  console.log(`[Usage] Gemini ${modelId}: input=${details.promptTokenCount} output=${details.candidatesTokenCount} total=${details.totalTokenCount} thoughts=${details.thoughtsTokenCount}`);
  if (details.promptTokensDetails.length) {
    for (const d of details.promptTokensDetails) console.log(`[Usage]   input ${d.modality}: ${d.tokenCount} tokens`);
  }
  if (details.candidatesTokensDetails.length) {
    for (const d of details.candidatesTokensDetails) console.log(`[Usage]   output ${d.modality}: ${d.tokenCount} tokens`);
  }
  return details;
}

// ---------- Extract usage from Bedrock/Claude response ----------

function extractBedrockUsage(parsedBody, modelId) {
  const usage = parsedBody.usage || {};
  const details = {
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    model: modelId,
  };
  console.log(`[Usage] Bedrock ${modelId}: input=${details.inputTokens} output=${details.outputTokens}`);
  return details;
}

// ---------- Upload result to S3 ----------

async function uploadResult(imageData, mimeType, applyWm = false) {
  const jobId = ulid();
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const s3Key = `tenants/anonymous/staged/${jobId}/staged.${ext}`;
  const rawBuffer = Buffer.from(imageData, 'base64');
  const finalBuffer = applyWm ? await applyWatermark(rawBuffer, mimeType) : rawBuffer;
  await uploadToS3(s3Key, finalBuffer, mimeType);
  const signedUrl = await getSignedDownloadUrl(s3Key);
  return { s3Key, signedUrl };
}

function mimeTypeForKey(key) {
  const lower = (key || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function buildOpenAIStagingPrompt({ style, roomTypes = [], notes = '', roomAnalysis = '' }) {
  const roomLabel = roomTypes.length ? roomTypes.join(' + ') : 'room';
  const trimmedNotes = (notes || '').trim();
  const trimmedAnalysis = roomAnalysis && roomAnalysis.length > 1800
    ? roomAnalysis.substring(0, 1800) + '...'
    : roomAnalysis;

  return [
    'You are editing a real property photograph for professional real estate virtual staging.',
    '',
    'PRIMARY TASK:',
    `Add freestanding ${style} furniture and decor suitable for a ${roomLabel}.`,
    '',
    'NON-NEGOTIABLE STRUCTURAL RULES:',
    '- Keep walls, floors, ceilings, windows, doors, room shape, camera position, crop, perspective, lighting direction, and built-in fixtures exactly unchanged.',
    '- Do not change wall colour, flooring material, ceiling height, cabinetry, benchtops, fireplace, outlets, air-conditioning, blinds, or any architectural detail.',
    '- Do not add, remove, repaint, resize, move, or restyle any built-in feature.',
    '- Style applies only to movable furniture, rugs, lamps, art, plants, and decor.',
    '- Output must remain photorealistic and suitable for a real estate listing.',
    '',
    trimmedAnalysis ? `ROOM ANALYSIS TO OBEY:\n${trimmedAnalysis}` : '',
    trimmedNotes ? `USER NOTES, HIGHEST PRIORITY WHEN COMPATIBLE WITH STRUCTURAL RULES:\n${trimmedNotes}` : '',
  ].filter(Boolean).join('\n');
}

function buildOpenAILeanDirectPrompt({ style, roomTypes = [], notes = '' }) {
  const roomLabel = roomTypes.length ? roomTypes.join(' + ') : 'room';
  const trimmedNotes = (notes || '').trim();

  return [
    'Create a premium real estate virtual staging image from this real property photo.',
    '',
    'Preserve the photograph\'s fixed structure exactly. Do not move, repaint, resize, remove, replace, or reinterpret any immovable element: walls, floors, ceilings, doors, windows, hallways, built-ins, columns, fireplaces, cabinetry, benchtops, fixtures, vents, stairs, railings, exterior views, or the camera angle.',
    '',
    'Before adding furniture, carefully inspect the image to understand the room geometry, visible boundaries, doors, windows, openings, traffic paths, wall features, light direction, floor area, and any parts of the space that are implied but not visible. Use that understanding to place furniture naturally and realistically.',
    '',
    'Only add movable furniture, rugs, lighting, plants, wall art, and decor appropriate for a premium real estate listing. Do not invent new walls, windows, doors, alcoves, corners, floor area, or rooms outside the visible photograph. If a piece of furniture would not fit in the visible or safely inferred space, choose a smaller piece or omit it.',
    '',
    `Style: ${style}`,
    `Room type: ${roomLabel}`,
    trimmedNotes ? `User notes: ${trimmedNotes}` : '',
    '',
    'The result must be photorealistic, elegant, uncluttered, and commercially suitable for selling or leasing a property.',
  ].filter(Boolean).join('\n');
}

function buildOpenAILeanSpatialReferencePrompt({ style, roomTypes = [], notes = '' }) {
  const roomLabel = roomTypes.length ? roomTypes.join(' + ') : 'room';
  const trimmedNotes = (notes || '').trim();

  return [
    'Image 1 is the target real estate photo and the only image to edit.',
    '',
    'Images 2 and onward are spatial reference images of the same room or connected space. Use them only to understand room geometry, wall positions, windows, doors, hallways, openings, traffic paths, scale, and any implied off-camera continuation of the space.',
    '',
    'Do not copy the camera angle, crop, lighting, furniture, styling, decor, or composition from the reference images into Image 1.',
    '',
    'Do not merge the images into a collage. Do not create a new viewpoint. Do not stage Images 2 and onward.',
    '',
    'The final output must preserve Image 1\'s camera angle, crop, fixed structure, walls, floors, ceilings, windows, doors, built-ins, openings, and visible architectural details exactly.',
    '',
    'Create a premium real estate virtual staging image from Image 1.',
    '',
    'Only add movable furniture, rugs, lighting, plants, wall art, and decor appropriate for a premium real estate listing. Do not invent new walls, windows, doors, alcoves, corners, floor area, or rooms outside Image 1. If a piece of furniture would not fit in the visible or safely inferred space, choose a smaller piece or omit it.',
    '',
    `Style: ${style}`,
    `Room type: ${roomLabel}`,
    trimmedNotes ? `User notes: ${trimmedNotes}` : '',
    '',
    'The result must be photorealistic, elegant, uncluttered, and commercially suitable for selling or leasing a property.',
  ].filter(Boolean).join('\n');
}

function extractOpenAIImageData(data) {
  const first = data?.data?.[0];
  if (!first?.b64_json) {
    throw new Error(`OpenAI returned no image. Response: ${JSON.stringify(data).slice(0, 1000)}`);
  }
  return {
    imageData: first.b64_json,
    mimeType: 'image/png',
  };
}

async function stageRoomWithOpenAI(params, jobId) {
  const { heroS3Key, referenceS3Keys = [], style, roomTypes = [], notes = '', useOpus47 } = params;
  let { roomAnalysis = '' } = params;
  const analysisMode = params.analysisMode === 'lean-direct' ? 'lean-direct' : 'full';
  const promptMode = referenceS3Keys.length > 0 && params.promptMode === 'spatial-ref' ? 'spatial-ref' : 'hero-only';
  // OpenAI Images API quality tier: 'low' | 'medium' | 'high' | 'auto'.
  // Different price/quality points — used by /admin/compare to evaluate
  // each tier against Gemini for the same brief. Default 'auto'.
  const quality = ['low', 'medium', 'high', 'auto'].includes(params.quality) ? params.quality : 'auto';

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set.');
  }

  const heroMimeType = mimeTypeForKey(heroS3Key);
  const heroBuffer = await downloadFromS3(heroS3Key);
  const heroBase64 = heroBuffer.toString('base64');

  const refImages = [];
  for (const key of referenceS3Keys || []) {
    const buffer = await downloadFromS3(key);
    refImages.push({
      key,
      buffer,
      base64: buffer.toString('base64'),
      mimeType: mimeTypeForKey(key),
    });
  }

  let conciergeNotes = [];
  if (analysisMode !== 'lean-direct' && (!roomAnalysis || roomAnalysis.trim() === '')) {
    const tag = jobId ? `[${jobId}]` : '[openai-stage]';
    console.log(`${tag} No pre-computed analysis — running in-Lambda for OpenAI comparison style="${style}"`);
    try {
      const result = await runAnalysisInLambda({
        heroBase64,
        refsBase64: refImages.map((ref) => ref.base64),
        style,
        notes,
        roomTypes,
        useOpus47: !!useOpus47,
      });
      roomAnalysis = result.analysis;
      conciergeNotes = result.concierge_notes || [];
    } catch (err) {
      console.error('[OpenAI] analysis failed:', err.message);
      roomAnalysis = '';
      conciergeNotes = [];
    }
  }

  const prompt = analysisMode === 'lean-direct'
    ? promptMode === 'spatial-ref'
      ? buildOpenAILeanSpatialReferencePrompt({ style, roomTypes, notes })
      : buildOpenAILeanDirectPrompt({ style, roomTypes, notes })
    : buildOpenAIStagingPrompt({ style, roomTypes, notes, roomAnalysis });
  const form = new FormData();
  form.append('model', 'gpt-image-2');
  form.append('prompt', prompt);
  form.append('quality', quality);
  form.append('image[]', new Blob([heroBuffer], { type: heroMimeType }), 'hero.jpg');
  refImages.forEach((ref, index) => {
    form.append('image[]', new Blob([ref.buffer], { type: ref.mimeType }), `reference-${index + 1}.jpg`);
  });

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const { imageData, mimeType } = extractOpenAIImageData(data);
  const applyWm = params.applyWatermark !== false && !params.comparisonId;
  const { s3Key, signedUrl } = await uploadResult(imageData, mimeType, applyWm);

  return {
    s3Key,
    signedUrl,
    text: '',
    mimeType,
    provider: 'openai',
    modelId: `gpt-image-2:${quality}`,
    quality,
    analysisMode,
    promptMode,
    comparisonVariantId: params.comparisonVariantId,
    prompt,
    persistableModelParts: [],
    roomAnalysis,
    conciergeNotes,
    usage: { stage: { provider: 'openai', model: 'gpt-image-2', quality, analysisMode, promptMode } },
  };
}

// ---------- Stage (SDK, single turn) ----------

async function stageRoom(params, jobId) {
  const provider = params.provider || 'gemini';
  if (provider === 'openai') {
    return stageRoomWithOpenAI(params, jobId);
  }

  const { heroS3Key, referenceS3Keys, style, model, roomTypes, notes, useOpus47 } = params;
  let { roomAnalysis } = params;

  // Hero: re-use leader's buffer when handed off (triple-mode slot-1 leader),
  // otherwise download. _heroBuffer is set by the handler's runAsLeader wire-up
  // and is undefined for siblings + single-mode invocations.
  const heroBuffer = params._heroBuffer ?? (await downloadFromS3(heroS3Key));
  const heroBase64 = heroBuffer.toString('base64');

  // References: same pattern. _refsBuffers is the Buffer[] handed off by the
  // leader, base64-encoded here once. Fallback path downloads from S3.
  const refImages = [];
  if (params._refsBuffers && params._refsBuffers.length > 0) {
    for (const buf of params._refsBuffers) {
      refImages.push(buf.toString('base64'));
    }
  } else if (referenceS3Keys?.length) {
    for (const key of referenceS3Keys) {
      const buf = await downloadFromS3(key);
      refImages.push(buf.toString('base64'));
    }
  }

  // NEW: capture concierge notes from the Lambda's analysis (for propagateToBatch).
  // Declared with `let` so the post-try scope can still read it; stays `[]` if
  // the caller provided pre-computed analysis (legacy single-stage path) or
  // the in-Lambda analysis failed.
  let conciergeNotes = [];

  // If caller didn't pre-compute the analysis (batch path), run it here using
  // the already-downloaded images. Each sub-Lambda does its own per-style
  // analysis — API route stays fast (no SSR 28s timeout), Lambda owns the
  // ~15s analysis spend inside its 300s budget.
  if (!roomAnalysis || roomAnalysis.trim() === '') {
    const tag = jobId ? `[${jobId}]` : '[stage]';
    console.log(`${tag} No pre-computed analysis — running in-Lambda for style="${style}" useOpus47=${!!useOpus47}`);
    const analysisStart = Date.now();
    try {
      const result = await runAnalysisInLambda({
        heroBase64,
        refsBase64: refImages,
        style,
        notes: notes || '',
        roomTypes: roomTypes || [],
        useOpus47: !!useOpus47,
      });
      roomAnalysis = result.analysis;
      conciergeNotes = result.concierge_notes || [];
      const elapsed = Date.now() - analysisStart;
      console.log(`${tag} Analysis ran in-Lambda (${roomAnalysis.length} chars, ${elapsed}ms, notes=${conciergeNotes.length})`);
    } catch (err) {
      console.error(`${tag} In-Lambda analysis failed:`, err.message);
      // Fall through with empty analysis — staging can still proceed without
      // it (the prompt has sensible defaults). Better a generic staging than
      // a whole-batch failure from one analysis hiccup.
      roomAnalysis = '';
      conciergeNotes = [];
    }
  }

  // Build analysis block. Cap raised from 800 → 1800 chars so the analysis's
  // CONSTRAINTS MAP + Furniture-within-constraints + user-notes EXCLUDE list
  // all survive into the image prompt. Below 1800 these were being cut.
  const trimmedAnalysis = roomAnalysis && roomAnalysis.length > 1800
    ? roomAnalysis.substring(0, 1800) + '...'
    : roomAnalysis;

  const analysisBlock = trimmedAnalysis
    ? `\nCONSTRAINTS & FURNITURE PLACEMENT:\n${trimmedAnalysis}`
    : '';

  // User notes ride as a FIRST-CLASS directive — not buried inside analysis.
  // Placed at the top of the prompt so Nano Banana treats it as the
  // primary instruction, above both structural rules and the room-type
  // functional checklist. When a user says "I want X, nothing else",
  // this block is how that wish survives the prompt.
  const trimmedNotes = (notes || '').trim();
  const notesBlock = trimmedNotes
    ? `\nUSER NOTES — the user wrote the following about this space, the furniture they want, or things to avoid. Treat the notes as important additional requirements on top of the structural rules, the analysis, and the style's usual tropes. Where a note specifically names or excludes an item, apply the note for that item. For everything the notes do NOT mention, keep the full set of functional furniture defaults and style conventions — the note EXTENDS the staging, it does not REPLACE it.
"""
${trimmedNotes}
"""

Apply as follows:
- If the user names specific pieces with colours, materials, or counts — deliver those pieces with those attributes. A "blue desk chair" must be rendered as a chair that is visibly blue. Do not substitute a neutral colour.
- If the user forbids something, do not include it — but still include the rest of the functional furniture the room needs.
- If the user names an EXHAUSTIVE set ("only", "just", "nothing else", "just the essentials", "minimum"), render ONLY those items.
- Otherwise, the note extends the defaults — keep the functional furniture checklist and style conventions intact, and weave the note's items in alongside them.\n`
    : '';

  // Room-type functional furniture requirements with realistic adult-scale sizes.
  // Sizes anchor the model so furniture isn't undersized — pick from the ranges
  // based on the visible room size.
  const ROOM_TYPE_CHECKLISTS = {
    'Living Room': '3-seater sofa (~2.2m wide) for typical rooms or 2-seater (~1.6m) only for visibly small rooms; coffee table (~1.2m × 0.6m); side tables or console; 55–65" wall-mounted TV, or 43–50" on a media unit if wall-mounting is not feasible; floor or table lamps; rug (2m × 3m) centred under the main seating; wall art',
    'Dining Room': 'dining table sized to the space — 4-seater (1.2m × 0.8m) for small rooms, 6-seater (1.8m × 0.9m) for typical, 8-seater (2.2m × 1m) for large; matching chairs with at least 60cm pull-out clearance behind each; pendant light or chandelier centred over the table if the ceiling allows; sideboard or buffet only if space permits',
    'Bedroom': 'bed sized to the room — queen (1.5m × 2m) or double (1.35m × 1.9m); upholstered or timber headboard; matching bedside tables (~0.5m × 0.4m) on each side; bedside lamps; rug either under the foot half of the bed or at the foot; wall art above the headboard',
    'Master Suite': 'king bed (1.8m × 2m) with a generous upholstered or timber headboard; matching bedside tables on both sides with bedside lamps; an accent armchair or bench at the foot of the bed if space permits; luxurious rug under the foot half of the bed; wall art above the headboard; a dresser or console if the room has a wall for it. This is a premium master suite — err on richness and scale',
    'Kitchen': 'usually no staging needed; if there is a breakfast bar or island, add 2 or 3 barstools at counter height (seat ~65cm) or bar height (seat ~75cm) to match. Optional: a bowl of fruit or small decor on a counter',
    'Bathroom': 'minimal staging — rolled towels, a small plant, a decorative basket or tray, maybe a small stool; do NOT add major furniture',
    'Home Office': 'desk at least 1.2m wide (1.4–1.6m for a larger room), 0.6m deep; ergonomic office chair; bookcase or shelving (~0.8–1m wide); desk lamp; optional armchair or reading nook only if the room has clear space; wall art',
    'Kids Room': 'single or kid-size bed with a playful headboard; bedside table with a small lamp; a small desk or activity table with a chair; toy storage (basket, bookshelf, or low cabinet); soft rug; age-appropriate wall art or a gentle colour palette. Absolutely not a master-bedroom layout',
    'Studio': 'combine living and sleeping zones in one space — a compact sofa (2-seater, ~1.6m) or daybed that doubles as seating; a queen or double bed clearly separated from the living area (by a rug or console if no partition); a small dining or work table with 2 chairs; a floor lamp or two; a rug grounding each zone; wall art',
    'Guest Room': 'queen or double bed (less elaborate than a master); simple headboard; one or two bedside tables with small lamps; a small luggage bench or chair if space allows; a rug; modest wall art. Keep it welcoming but understated',
    'Outdoor': 'outdoor-appropriate furniture only — weather-resistant lounge chairs or a small outdoor sofa; a small coffee or side table; outdoor dining table and chairs if there is room for it; a potted plant or two; an outdoor rug; string lights or a lantern if lighting fits. Do NOT add indoor furniture',
  };

  const GENERIC_CHECKLIST = 'appropriate adult-scale furniture for the space as shown in the analysis';
  const checklists = roomTypes?.length
    ? roomTypes.map(t => `- ${t}: ${ROOM_TYPE_CHECKLISTS[t] || GENERIC_CHECKLIST}`).join('\n')
    : '';

  const roomTypeContext = roomTypes?.length
    ? `\nThis space is: ${roomTypes.join(' + ')}.\n\nFUNCTIONAL FURNITURE REQUIREMENTS — this is the baseline set of items this room type contains. Include all applicable items unless the analysis's constraints map says they won't fit or the user's notes excluded them. The analysis above tells you WHERE each piece goes (which wall, facing which focal point) and HOW to refine the plan (no-go zones, orientation). Use both in tandem: checklist = WHAT to include, analysis = WHERE and HOW.\n${checklists}`
    : '';

  const core = `You are editing a REAL photograph. The room is REAL — do NOT reimagine it.

RULES:
1. Keep ALL walls, floors, ceilings, windows, doors, fixtures EXACTLY as-is.
2. "${style}" applies ONLY to furniture and decor — NOT the room structure.
3. Add freestanding furniture onto the existing floor AND functional wall-mounted items appropriate to the room type (e.g., wall-mounted TV in a living room, framed art, sconces). Wall-mounted items do not alter the wall — they sit on it.
4. Orient furniture for real-room function, NOT for camera-flattering composition. Seating faces the TV or focal point even if this means the camera shows the back of the sofa — that is correct and expected. Do NOT rotate furniture to present its best face to the camera. The photograph was taken to capture the room; you are adding furniture to live in the room, not to pose for the camera.
5. Size furniture to real adult scale using the dimensions in the FUNCTIONAL FURNITURE REQUIREMENTS below. Do NOT undersize — if in doubt, choose the larger option from the range. Furniture should look like it belongs to an adult home, not a doll's house.
6. Match the room's perspective, lighting, and scale. Photorealistic output.
7. Same dimensions and orientation as input.
8. The visible edges of the photograph are the edges of the room. Do NOT extend, reimagine, or invent any area outside what the original photo shows. If correctly-oriented furniture does not fit, shrink the furniture or reduce the count — do not expand the room. Never add corners, walls, alcoves, doorways, windows, or floor space the photo does not show.`;

  const totalPhotos = 1 + refImages.length;
  let prompt;
  if (totalPhotos > 1) {
    prompt = `${notesBlock}${core}${analysisBlock}${roomTypeContext}\n\n${totalPhotos} angles shown. STAGE ONLY IMAGE 1 with ${style} furniture. Others are spatial reference. Include the FUNCTIONAL FURNITURE REQUIREMENTS items above, placed according to the orientations and focal-point anchors the analysis identified.${trimmedNotes ? ' The USER NOTES at the top are already folded into that plan.' : ''} The image-generation model has a strong built-in bias toward camera-facing furniture; override it. The focal point identified by the analysis anchors orientation, not the camera.`;
  } else {
    prompt = `${notesBlock}${core}${analysisBlock}${roomTypeContext}\n\nStage this room in ${style} style. Include the FUNCTIONAL FURNITURE REQUIREMENTS items above, placed according to the orientations and focal-point anchors the analysis identified.${trimmedNotes ? ' The USER NOTES at the top are already folded into that plan.' : ''} The image-generation model has a strong built-in bias toward camera-facing furniture; override it. The focal point identified by the analysis anchors orientation, not the camera.`;
  }

  // Build message parts
  const messageParts = [
    { text: prompt },
    { inlineData: { mimeType: 'image/jpeg', data: heroBase64 } },
  ];
  for (const refBase64 of refImages) {
    messageParts.push({ inlineData: { mimeType: 'image/jpeg', data: refBase64 } });
  }

  // Use SDK chat for staging — this creates the session with thought signatures
  const modelId = model === 'nano-banana-pro' ? 'gemini-3-pro-image-preview' : 'gemini-3.1-flash-image-preview';

  const chat = ai.chats.create({
    model: modelId,
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  const response = await chat.sendMessage({ message: messageParts });

  const responsePartsRaw = response.candidates?.[0]?.content?.parts || [];

  // Diagnostic: report what signatures actually came back. Google's docs (April 2026)
  // say signatures are guaranteed on the first part after thoughts and on every
  // inlineData part for image preview models. We log to verify reality matches docs.
  const sigReport = responsePartsRaw.map((p, i) => ({
    i,
    hasText: !!p.text,
    hasInlineData: !!p.inlineData,
    hasSig: !!p.thoughtSignature,
    sigLen: p.thoughtSignature?.length || 0,
  }));
  console.log('[Stage] Response parts sig report:', JSON.stringify(sigReport));

  const { imageData, mimeType, text } = extractImage(response);
  if (!imageData) throw new Error(`No image returned: ${text || 'empty'}`);

  const geminiUsage = extractGeminiUsage(response, modelId);
  const applyWm = params.applyWatermark !== false && !params.comparisonId;
  const { s3Key, signedUrl } = await uploadResult(imageData, mimeType, applyWm);

  // Build a persistable representation of the model turn's parts.
  // Replace the inline image bytes with the S3 key we just uploaded so the
  // DynamoDB record stays small. Keep every thoughtSignature exactly as returned.
  const persistableModelParts = responsePartsRaw.map((p) => {
    const out = {};
    if (p.text !== undefined && p.text !== null) {
      out.type = 'text';
      out.text = p.text;
    } else if (p.inlineData) {
      out.type = 'image';
      out.s3Key = s3Key;
      out.mimeType = p.inlineData.mimeType || 'image/png';
    }
    if (p.thoughtSignature) {
      out.thoughtSignature = p.thoughtSignature;
    }
    return out;
  });

  return {
    s3Key,
    signedUrl,
    text,
    mimeType,
    modelId,
    prompt,
    persistableModelParts,
    roomAnalysis, // echo back so handler persists the in-Lambda-computed analysis
    conciergeNotes,
    usage: { stage: geminiUsage },
  };
}

// ---------- Replay state S3 helpers ----------
// Thought signatures for image preview models are multi-MB (observed ~2MB each),
// far exceeding DynamoDB's 400KB item limit. Store the full replay JSON in S3
// and reference it by the staged image's ulid.
//
// Design: every staged variant (initial + each edit) gets its own replay file.
// The file contains the full chat history up to and including that variant, so
// a subsequent edit from any variant can load its replay and continue the chain.

function ulidFromStagedKey(key) {
  if (!key) return null;
  const m = key.match(/\/staged\/([A-Z0-9]{26})\//i);
  return m ? m[1] : null;
}

function replayKeyForUlid(ulid) {
  return `replay/${ulid}.json`;
}

async function saveReplayState(key, state) {
  await uploadToS3(key, Buffer.from(JSON.stringify(state), 'utf-8'), 'application/json');
  return key;
}

async function loadReplayState(key) {
  const buf = await downloadFromS3(key);
  return JSON.parse(buf.toString('utf-8'));
}

// Rehydrate a history array stored as s3-key placeholders into Gemini-ready parts.
async function rehydrateHistory(historyStored) {
  const out = [];
  for (const turn of historyStored) {
    const parts = [];
    for (const p of turn.parts) {
      if (p.type === 'text') {
        const mp = { text: p.text || '' };
        if (p.thoughtSignature) mp.thoughtSignature = p.thoughtSignature;
        parts.push(mp);
      } else if (p.type === 'image' && p.s3Key) {
        const buf = await downloadFromS3(p.s3Key);
        const mp = {
          inlineData: { mimeType: p.mimeType || 'image/jpeg', data: buf.toString('base64') },
        };
        if (p.thoughtSignature) mp.thoughtSignature = p.thoughtSignature;
        parts.push(mp);
      }
    }
    out.push({ role: turn.role, parts });
  }
  return out;
}

// ---------- Edit (SDK multi-turn chat) ----------

async function editStaging(params) {
  const { stagedS3Key, heroS3Key, editInstruction, style, modelId: paramModelId, sessionId } = params;
  const modelId = paramModelId || 'gemini-3-pro-image-preview';

  // Size-keyword detection: Nano Banana defaults to preserving visual proportions,
  // so we still inject an authority override on resize requests even in multi-turn.
  const SIZE_KEYWORDS = /\b(bigger|larger|longer|wider|taller|smaller|shorter|narrower|thinner|tinier|huge|huger|massive|oversized|king[- ]?size|king|queen|double|single|twin|california king|upsize|downsize|enlarge|shrink|extend)\b|too (big|small|short|long|narrow|wide|thin|thick|large|tiny)/i;
  const isSizeChange = SIZE_KEYWORDS.test(editInstruction);

  // MULTI-TURN PATH: locate the parent variant's replay file (keyed by the
  // stagedS3Key the user is editing from). That file contains the full chat
  // history up to that variant — we replay it, append the edit instruction,
  // and persist a NEW replay file for the resulting variant.
  const parentUlid = ulidFromStagedKey(stagedS3Key);
  const parentReplayKey = parentUlid ? replayKeyForUlid(parentUlid) : null;
  if (parentReplayKey) {
    try {
      let replayState = null;
      try {
        replayState = await loadReplayState(parentReplayKey);
      } catch (loadErr) {
        console.warn(`[Edit] No replay file at ${parentReplayKey}:`, loadErr.message);
      }
      const history = replayState?.history;
      const hasAnySig = Array.isArray(history) && history.some((t) =>
        (t.parts || []).some((p) => p.thoughtSignature),
      );

      if (hasAnySig) {
        console.log(`[Edit] MULTI-TURN path. parent=${parentUlid}, turns=${history.length}, sizeChange=${isSizeChange}, instruction: "${editInstruction}"`);

        const rehydrated = await rehydrateHistory(history);

        // Re-attach the hero empty-room image to the CURRENT edit turn.
        // It's already in turn 1 of history, but recency weights heavily in
        // Nano Banana — giving the hero fresh attention on every edit pulls
        // structural fidelity back toward ground truth.
        const firstUserTurn = rehydrated[0];
        const heroInlinePart = firstUserTurn?.parts?.find((p) => p.inlineData);

        const sizeBlock = isSizeChange ? `

SIZE-CHANGE NOTE: For any object(s) whose size the user named, change only its dimensions — keep its colour, fabric, material, pattern, and style exactly the same as your previous image. Do NOT redesign size-changed objects.` : '';

        const editText = `REFERENCE IMAGE ATTACHED BELOW: the original empty room — your structural ground truth (same photo you were shown in turn 1, attached here for emphasis). Use it ONLY to preserve or restore room structure (walls, windows, doors, ceiling, floor, fixtures). Do NOT re-stage from this empty room — keep every piece of furniture you placed in your previous image.

Apply the following change(s) to the previous staged image:
"${editInstruction}"${sizeBlock}

Keep the room structure identical to the attached reference. Keep every other piece of furniture, decor, and lighting at its current size, position, colour, style, and material. Do NOT redraw or restyle anything the user did not mention. Output must match the previous staged image's dimensions and orientation.`;

        const chat = ai.chats.create({
          model: modelId,
          history: rehydrated,
          config: { responseModalities: ['TEXT', 'IMAGE'] },
        });

        const messageParts = heroInlinePart
          ? [{ text: editText }, { inlineData: heroInlinePart.inlineData }]
          : [{ text: editText }];
        console.log(`[Edit] Sending edit with ${messageParts.length} parts (hero re-attached: ${!!heroInlinePart}).`);

        const response = await chat.sendMessage({ message: messageParts });

        const editPartsRaw = response.candidates?.[0]?.content?.parts || [];
        console.log('[Edit] Multi-turn response sig report:', JSON.stringify(
          editPartsRaw.map((p) => ({ hasText: !!p.text, hasInlineData: !!p.inlineData, hasSig: !!p.thoughtSignature })),
        ));

        const { imageData, mimeType, text } = extractImage(response);
        if (!imageData) throw new Error(`No image returned from multi-turn edit: ${text || 'empty'}`);

        const geminiUsage = extractGeminiUsage(response, modelId);
        const applyWm = params.applyWatermark !== false && !params.comparisonId;
        const { s3Key, signedUrl } = await uploadResult(imageData, mimeType, applyWm);

        // Build persistable parts for THIS edit's model turn, referencing the
        // just-uploaded S3 key instead of carrying base64 in the JSON.
        const newModelPersistable = editPartsRaw.map((p) => {
          const out = {};
          if (p.text !== undefined && p.text !== null) {
            out.type = 'text';
            out.text = p.text;
          } else if (p.inlineData) {
            out.type = 'image';
            out.s3Key = s3Key;
            out.mimeType = p.inlineData.mimeType || 'image/png';
          }
          if (p.thoughtSignature) out.thoughtSignature = p.thoughtSignature;
          return out;
        });

        // New replay history = parent history + user edit turn + model response turn.
        // Persist the user turn matching what was actually sent — text + re-attached
        // hero — so future replays are exact and any future-turn signatures stay valid.
        const heroStoredPart = history[0]?.parts?.find((p) => p.type === 'image');
        const userTurnParts = [{ type: 'text', text: editText }];
        if (heroStoredPart) {
          userTurnParts.push({
            type: 'image',
            s3Key: heroStoredPart.s3Key,
            mimeType: heroStoredPart.mimeType,
          });
        }
        const newHistory = [
          ...history,
          { role: 'user', parts: userTurnParts },
          { role: 'model', parts: newModelPersistable },
        ];

        return {
          s3Key,
          signedUrl,
          text,
          multiTurn: true,
          newReplayHistory: newHistory,
          usage: { edit: geminiUsage },
        };
      }

      console.log(`[Edit] No persisted signatures on parent replay — falling back to single-turn.`);
    } catch (mtErr) {
      console.warn('[Edit] Multi-turn path failed, falling back to single-turn:', mtErr.message);
    }
  }

  // SINGLE-TURN FALLBACK (original behaviour, kept for sessions pre-dating the
  // signature-persistence change, and as a safety net if multi-turn errors).
  console.log(`[Edit] SINGLE-TURN path. sizeChange=${isSizeChange}, instruction: "${editInstruction}"`);

  // Download both images
  const [heroBuffer, stagedBuffer] = await Promise.all([
    downloadFromS3(heroS3Key),
    downloadFromS3(stagedS3Key),
  ]);
  const heroBase64 = heroBuffer.toString('base64');
  const stagedBase64 = stagedBuffer.toString('base64');

  const sizeAuthorityBlock = isSizeChange ? `

SIZE-CHANGE NOTE: For any object(s) whose size the user named, change only its dimensions — keep its colour, fabric, material, pattern, and style exactly the same as in IMAGE 2. Do NOT redesign size-changed objects.
` : '';

  const prompt = `You are correcting a virtually staged real estate photo.

IMAGE 1 (first image below) is the ORIGINAL EMPTY ROOM — structural ground truth. Walls, floors, ceiling, windows, doors, and every fixture must appear EXACTLY as in this photo.

IMAGE 2 (second image below) is a FLAWED staging of that room in ${style} style. The user has identified specific change(s) that must be applied.

THE CHANGE(S), AS THE USER DESCRIBES THEM:
"${editInstruction}"
${sizeAuthorityBlock}
AUTHORITY RULES:
1. The user's description is CORRECT. Your job is to produce the corrected version — NOT to second-guess whether the described change is needed.
2. The corrected image must be VISIBLY different from IMAGE 2 in the way the user described. A near-identical output is a failure of the task.
3. If the user says an object is too small, it IS too small. If they say it is in the wrong position, it IS. Do not defend IMAGE 2.

PRESERVATION RULES (apply to everything the user did NOT mention):
1. Room structure matches IMAGE 1 exactly — walls, floors, ceiling, windows, doors, fixtures unchanged.
2. All other furniture from IMAGE 2 stays at its current size, position, and style.
3. Same perspective, camera angle, lighting direction, dimensions, and orientation as IMAGE 2.
4. Same ${style} aesthetic and colour palette as IMAGE 2.
5. Photorealistic output.`;

  const response = await ai.models.generateContent({
    model: modelId,
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/jpeg', data: heroBase64 } },
        { inlineData: { mimeType: 'image/jpeg', data: stagedBase64 } },
      ],
    }],
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
    },
  });

  const { imageData, mimeType, text } = extractImage(response);
  if (!imageData) throw new Error(`No image returned from edit: ${text || 'empty'}`);

  const geminiUsage = extractGeminiUsage(response, modelId);
  const applyWm = params.applyWatermark !== false && !params.comparisonId;
  const { s3Key, signedUrl } = await uploadResult(imageData, mimeType, applyWm);
  return { s3Key, signedUrl, text, multiTurn: false, usage: { edit: geminiUsage } };
}

// ---------- Review (Claude Opus 4.6 via Bedrock) ----------

async function reviewStaging(originalS3Key, stagedS3Key, style, roomTypes) {
  const [origBuf, stagedBuf] = await Promise.all([
    downloadFromS3(originalS3Key),
    downloadFromS3(stagedS3Key),
  ]);

  const roomTypeStr = roomTypes?.length ? roomTypes.join(' + ') : 'living space';

  const prompt = `You are a senior interior designer reviewing a virtual staging result. Be genuinely critical — only flag REAL issues, don't invent problems.

The first image is the ORIGINAL empty room. The second image is the AI-staged result (generated by AI — mirror reflections may be incorrect). Style: "${style}" for a ${roomTypeStr}.

ANTI-HALLUCINATION: Only describe furniture you can clearly see OUTSIDE of mirror reflections. Mirrors in AI images often show incorrect content.

Score each criterion (1-10):
1. roomPreservation: Walls, floors, ceiling unchanged?
2. fixtures: Switches, outlets, lights preserved?
3. reflections: Mirrors show correct reflections? (N/A if none)
4. spatialAwareness: Does furniture respect room features? Not blocking wardrobes/doors?
5. functionalLayout: Can someone live here? Open doors, access wardrobe?
6. proportionAndBalance: Right-sized, balanced?
7. styleExecution: Authentically ${style}?
8. designerSensibility: Would a designer approve?

Only flag issues you're CERTAIN about.

JSON only (no markdown):
{"score":<1-10>,"passed":<true if >=7>,"summary":"<biggest issue>","criteria":{"roomPreservation":{"score":<>,"note":"<>"},"fixtures":{"score":<>,"note":"<>"},"reflections":{"score":<>,"note":"<>"},"spatialAwareness":{"score":<>,"note":"<>"},"functionalLayout":{"score":<>,"note":"<>"},"proportionAndBalance":{"score":<>,"note":"<>"},"styleExecution":{"score":<>,"note":"<>"},"designerSensibility":{"score":<>,"note":"<>"}},"suggestions":["<>"],"fixPrompt":"<>"}`;

  try {
    const response = await bedrock.send(new InvokeModelCommand({
      modelId: 'au.anthropic.claude-opus-4-6-v1',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: origBuf.toString('base64') } },
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: stagedBuf.toString('base64') } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    }));

    const result = JSON.parse(new TextDecoder().decode(response.body));
    const bedrockUsage = extractBedrockUsage(result, 'au.anthropic.claude-opus-4-6-v1');
    const rawText = result.content?.[0]?.text || '';
    const jsonStr = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    parsed._usage = bedrockUsage;
    return parsed;
  } catch (err) {
    console.error('[Review] Claude Opus error:', err.message);
    return { score: -1, passed: true, summary: 'Review unavailable', criteria: {}, suggestions: [], fixPrompt: '' };
  }
}

// Classifies a Gemini generation error as a "hard" provider failure where an
// immediate same-provider retry is pointless: quota/billing exhaustion, auth,
// or permission. Transient errors (network, 5xx, timeouts) return false so the
// existing silent retry-once still applies before any fallback.
function isHardGeminiFailure(err) {
  const m = (err?.message || '').toLowerCase();
  return (
    m.includes('resource_exhausted') ||
    m.includes('depleted') ||
    m.includes('quota') ||
    m.includes('permission_denied') ||
    m.includes('api key') ||
    m.includes('429')
  );
}

// ---------- Handler ----------

export async function handler(event) {
  const { jobId, action, params, batchId } = event;
  console.log(`[StagingWorker] Job ${jobId}, action: ${action}${batchId ? `, batchId: ${batchId}` : ''}`);

  try {
    await updateJob(jobId, { status: 'running' });

    let result;
    // Hoisted so the bonus-credit call site below (outside the action branch)
    // can reference the Staging record key written by the single-stage path.
    let galleryStagingSk = null;

    if (action === 'stage') {
      // If this invocation is a triple-mode leader, run shared analysis +
      // fan out siblings BEFORE running our own variant. The leader's own
      // staging then uses the analysis it just computed (via params mutation)
      // to skip the in-stageRoom analysis fallback.
      if (params.isLeader && batchId) {
        const leaderResult = await runAsLeader(event);
        // Mutate params so stageRoom's existing "if roomAnalysis empty, run
        // own analysis" branch is skipped — we already have it.
        params.roomAnalysis = leaderResult.analysis;
        params.conciergeNotes = leaderResult.conciergeNotes;
        // Hand off the already-downloaded buffers so stageRoom's Gemini path
        // skips its second download. Underscore prefix marks them as in-process
        // transient state — they never cross the Lambda invoke boundary.
        if (leaderResult.heroBuf) {
          params._heroBuffer = leaderResult.heroBuf;
          params._refsBuffers = leaderResult.refsBufs;
        }
      }

      // Silent retry-once on generation failure. If the first attempt throws,
      // log a warning and try once more before letting the outer error path
      // handle a second failure (which will call propagateToBatch with
      // success: false and write 'failed_after_retry' for variant mode).
      // Safe because stageRoom throws only before its S3 upload (line ~1021's
      // "No image returned" check or earlier API errors). If that invariant
      // changes — i.e. stageRoom can throw AFTER uploadResult — add cleanup of
      // orphaned S3 objects from the first attempt before retry.
      try {
        result = await stageRoom(params, jobId);
      } catch (firstErr) {
        // For a hard provider failure (depleted billing / 429 / auth) a same-
        // provider retry just hits the same wall — skip it and go straight to
        // the fallback. Transient errors still get the silent retry-once.
        const hardFail = isHardGeminiFailure(firstErr);
        console.warn(
          `[StagingWorker] Job ${jobId} generation failed once: ${firstErr?.message}; ` +
            (hardFail ? 'hard provider failure, skipping same-provider retry' : 'retrying'),
        );
        let lastErr = firstErr;
        if (!hardFail) {
          try {
            result = await stageRoom(params, jobId);
          } catch (secondErr) {
            lastErr = secondErr;
          }
        }

        if (!result) {
          // Cross-provider fallback for SINGLE-TAKE jobs only. If the Gemini
          // (NB Pro) path is unavailable, a single-take customer would get
          // nothing, so fall back to the GPT Image 2 Full Medium flow. Triple
          // mode already runs GPT Medium (slot 2) + GPT High (slot 3), so a
          // slot-1 fallback would just duplicate slot 2 — those are covered by
          // partial refund instead.
          const canFallback =
            params.bundle === 'single' &&
            (params.provider ?? 'gemini') === 'gemini' &&
            !params.comparisonId &&
            !!process.env.OPENAI_API_KEY;
          if (!canFallback) {
            console.error(`[StagingWorker] Job ${jobId} generation failed after retry: ${lastErr?.message}`);
            throw lastErr;
          }
          console.warn(
            `[StagingWorker] Job ${jobId} Gemini unavailable (${lastErr?.message}); ` +
              'falling back to GPT Image 2 Full Medium',
          );
          try {
            result = await stageRoom(
              { ...params, provider: 'openai', model: 'gpt-image-2', quality: 'medium', analysisMode: 'full' },
              jobId,
            );
          } catch (fallbackErr) {
            console.error(`[StagingWorker] Job ${jobId} GPT medium fallback also failed: ${fallbackErr?.message}`);
            throw fallbackErr;
          }
        }
      }

      // Triple-mode: API pre-derived conciergeNotes per style (shared across the
      // 3 variants). Use those instead of letting the Lambda re-derive from its
      // own analysis. Single-mode: API sends an empty array (or nothing) and the
      // Lambda's own notes (if any) flow through unchanged.
      const apiNotes = Array.isArray(params.conciergeNotes) ? params.conciergeNotes : [];
      const conciergeNotes = apiNotes.length > 0
        ? apiNotes
        : (Array.isArray(result.conciergeNotes) ? result.conciergeNotes : []);
      result = { ...result, conciergeNotes };

      if (!result.provider) result.provider = params.provider || 'gemini';
      if (!result.modelId) {
        // Provider-aware: a single-take Gemini job that fell back to OpenAI
        // returns provider 'openai', so label it gpt-image-2 — not a Gemini id
        // derived from the original params.model (still 'nano-banana-pro').
        result.modelId =
          result.provider === 'openai'
            ? 'gpt-image-2'
            : params.model === 'nano-banana-pro'
              ? 'gemini-3-pro-image-preview'
              : 'gemini-3.1-flash-image-preview';
      }

      // Create staging session for multi-turn edits
      const sessionId = ulid();
      const sessionNow = new Date().toISOString();

      // Create gallery entry (persists until user deletes via gallery UI).
      // Comparison runs (admin model-eval tool) skip gallery writes —
      // 4-12 images per run would otherwise flood the admin gallery.
      if (params.userId && !params.comparisonId) {
        try {
          const stagingId = ulid();
          galleryStagingSk = `STAGING#${sessionNow}#${stagingId}`;
          await dynamodb.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              pk: `USER#${params.userId}`,
              sk: galleryStagingSk,
              id: stagingId,
              userId: params.userId,
              sessionId,
              style: params.style,
              roomTypes: params.roomTypes || [],
              heroS3Key: params.heroS3Key,
              stagedS3Key: result.s3Key,
              notes: params.notes || '',
              provider: result.provider || params.provider || 'gemini',
              modelId: result.modelId,
              comparisonId: params.comparisonId || null,
              ...(params.listingId ? { listingId: params.listingId } : {}),
              createdAt: sessionNow,
            },
          }));
          console.log(`[StagingWorker] Gallery entry created: ${galleryStagingSk}`);
          if (params.listingId) {
            await setListingCoverIfMissing(params.userId, params.listingId, result.s3Key);
          }
        } catch (galleryErr) {
          console.warn('[StagingWorker] Gallery create failed:', galleryErr.message);
        }
      }

      // Write replay state to S3, keyed by the staged image's ulid so every
      // variant (initial + edits) has its own self-contained history.
      const stagedUlid = ulidFromStagedKey(result.s3Key);
      let replayStateS3Key = null;
      if ((result.provider || params.provider || 'gemini') === 'gemini' && stagedUlid) {
        try {
          const userTurn = {
            role: 'user',
            parts: [
              { type: 'text', text: result.prompt },
              { type: 'image', s3Key: params.heroS3Key, mimeType: 'image/jpeg' },
              ...(params.referenceS3Keys || []).map((k) => ({
                type: 'image', s3Key: k, mimeType: 'image/jpeg',
              })),
            ],
          };
          const modelTurn = { role: 'model', parts: result.persistableModelParts || [] };
          replayStateS3Key = replayKeyForUlid(stagedUlid);
          await saveReplayState(replayStateS3Key, { history: [userTurn, modelTurn] });
          console.log(`[StagingWorker] Replay state saved to S3: ${replayStateS3Key}`);
        } catch (replayErr) {
          console.warn('[StagingWorker] Replay state save failed:', replayErr.message);
          replayStateS3Key = null;
        }
      }

      await dynamodb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          pk: `SESSION#${sessionId}`,
          sk: 'META',
          sessionId,
          userId: params.userId || null,
          galleryStagingSk,
          heroS3Key: params.heroS3Key,
          referenceS3Keys: params.referenceS3Keys || [],
          style: params.style,
          model: params.model || result.modelId,
          provider: result.provider || params.provider || 'gemini',
          comparisonId: params.comparisonId || null,
          roomTypes: params.roomTypes || [],
          // Prefer the analysis the stageRoom actually used (may have been
          // computed in-Lambda when params.roomAnalysis was empty).
          roomAnalysis: result.roomAnalysis || params.roomAnalysis || '',
          turns: [
            { role: 'user', text: result.prompt, imageS3Key: params.heroS3Key },
            { role: 'model', text: result.text || '', imageS3Key: result.s3Key },
          ],
          // Multi-turn replay state lives in S3 (thought signatures exceed DDB limit)
          replayStateS3Key,
          createdAt: sessionNow,
          updatedAt: sessionNow,
        },
      }));
      result.sessionId = sessionId;
      console.log(`[StagingWorker] Session created: ${sessionId}`);

      // Design review disabled for v1 — saves Bedrock tokens and removes a
      // UI surface that was producing inaccurate feedback. Keep the code
      // path reviewStaging() available for future re-enabling.
      console.log(`[Usage] Full pipeline usage:`, JSON.stringify(result.usage));
    } else if (action === 'edit') {
      result = await editStaging(params);

      // If multi-turn produced a fresh replay history, persist it keyed by
      // the new staged variant's ulid so the next edit (from this variant)
      // can continue the chain.
      if (result.newReplayHistory) {
        const newUlid = ulidFromStagedKey(result.s3Key);
        if (newUlid) {
          try {
            const key = replayKeyForUlid(newUlid);
            await saveReplayState(key, { history: result.newReplayHistory });
            console.log(`[StagingWorker] Replay state saved for edit variant: ${key}`);
          } catch (replayErr) {
            console.warn('[StagingWorker] Edit replay save failed:', replayErr.message);
          }
        }
      }

      // Design review disabled for v1 (see stage handler comment above).

      // Update session with new edit turn + update gallery entry's stagedS3Key
      if (params.sessionId) {
        try {
          const sessionResult = await dynamodb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { pk: `SESSION#${params.sessionId}`, sk: 'META' },
          }));
          if (sessionResult.Item) {
            const newTurns = [
              ...sessionResult.Item.turns,
              { role: 'user', text: params.editInstruction },
              { role: 'model', text: result.text || '', imageS3Key: result.s3Key },
            ];
            await dynamodb.send(new UpdateCommand({
              TableName: TABLE_NAME,
              Key: { pk: `SESSION#${params.sessionId}`, sk: 'META' },
              UpdateExpression: 'SET turns = :turns, updatedAt = :now',
              ExpressionAttributeValues: { ':turns': newTurns, ':now': new Date().toISOString() },
            }));

            // Write a NEW gallery entry for this edit so user can browse
            // every variant of their session individually
            const sessionUserId = sessionResult.Item.userId;
            if (sessionUserId) {
              try {
                const variantId = ulid();
                const variantNow = new Date().toISOString();
                await dynamodb.send(new PutCommand({
                  TableName: TABLE_NAME,
                  Item: {
                    pk: `USER#${sessionUserId}`,
                    sk: `STAGING#${variantNow}#${variantId}`,
                    id: variantId,
                    userId: sessionUserId,
                    sessionId: params.sessionId,
                    style: sessionResult.Item.style,
                    roomTypes: sessionResult.Item.roomTypes || [],
                    heroS3Key: sessionResult.Item.heroS3Key,
                    stagedS3Key: result.s3Key,
                    editInstruction: params.editInstruction || null,
                    createdAt: variantNow,
                  },
                }));
                console.log(`[StagingWorker] Gallery variant created for edit: ${variantId}`);
              } catch (galleryErr) {
                console.warn('[StagingWorker] Gallery variant create failed:', galleryErr.message);
              }
            }
          }
          result.sessionId = params.sessionId;
        } catch (sessErr) {
          console.warn('[StagingWorker] Session update failed:', sessErr.message);
        }
      }
    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    result.provider = result.provider || params.provider || 'gemini';
    result.modelId = result.modelId || params.model || 'unknown';

    // Strip bulky fields before writing the job result to DynamoDB.
    // persistableModelParts + newReplayHistory carry multi-MB thought
    // signatures and are already persisted to S3 via replay/{ulid}.json.
    // roomAnalysis (up to ~6KB) is already saved on the SESSION record and
    // doesn't need to live on the JOB record too.
    // conciergeNotes is written to the BATCH sub-job record via propagateToBatch
    // instead — keep it off the JOB record to avoid duplication.
    const {
      persistableModelParts: _p,
      newReplayHistory: _h,
      roomAnalysis: _ra,
      conciergeNotes: _cn,
      ...jobResult
    } = result;
    await updateJob(jobId, { status: 'done', result: JSON.stringify(jobResult) });

    if (batchId) {
      const propResult = await propagateToBatch({
        batchId,
        jobId,
        style: params?.style,
        success: true,
        stagedS3Key: result.s3Key,
        sessionId: result.sessionId,
        conciergeNotes: result.conciergeNotes,
        variantSlot: params?.variantSlot,
      });

      // Bonus credit accounting moved to the API layer (src/lib/db/users.ts
      // `deductCredits`) as of Phase F. The Lambda no longer increments
      // stagesCompletedTotal — the API increments by `cost` on each successful
      // deduction, granting +1 creditsRemaining per 7-boundary crossed.
    }

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error(`[StagingWorker] Error:`, err);
    await updateJob(jobId, { status: 'error', error: err.message });

    if (batchId) {
      try {
        await propagateToBatch({
          batchId,
          jobId,
          style: params?.style,
          success: false,
          error: err.message,
          userId: params?.userId,
          variantSlot: params?.variantSlot,
        });
      } catch (propErr) {
        console.error('[StagingWorker] Batch propagation on error path failed:', propErr.message);
      }
    }

    return { statusCode: 500, body: err.message };
  }
}
