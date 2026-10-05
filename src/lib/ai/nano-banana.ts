/**
 * Gemini Nano Banana image staging.
 *
 * REST API pattern matches content-producer/src/lib/ai/gemini-image.ts
 * Uses fetch() directly (not SDK) to avoid Next.js bundling issues.
 */

export type StagingModel = 'nano-banana-2' | 'nano-banana-pro';

const MODEL_IDS: Record<StagingModel, string> = {
  'nano-banana-2': 'gemini-3.1-flash-image-preview',
  'nano-banana-pro': 'gemini-3-pro-image-preview',
};

const COST_PER_IMAGE: Record<StagingModel, number> = {
  'nano-banana-2': 0.045,
  'nano-banana-pro': 0.134,
};

export interface ReferenceImage {
  base64: string;
  mimeType: string;
}

export interface StagingResult {
  imageData: string; // base64
  mimeType: string;
  text: string;
  model: StagingModel;
  estimatedCost: number;
}

// ---------- Retry wrapper (matches content-producer) ----------

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 2,
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, init);
      return response;
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`[Nano Banana] Fetch attempt ${attempt + 1} failed, retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Unreachable');
}

// ---------- Aspect ratio helper ----------

function getAspectRatioFromDimensions(
  width: number,
  height: number,
): string | undefined {
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.05) return '1:1';
  if (Math.abs(ratio - 16 / 9) < 0.05) return '16:9';
  if (Math.abs(ratio - 9 / 16) < 0.05) return '9:16';
  if (Math.abs(ratio - 4 / 3) < 0.05) return '4:3';
  if (Math.abs(ratio - 3 / 4) < 0.05) return '3:4';
  return undefined;
}

// ---------- Build prompt ----------

function buildPrompt(
  style: string,
  photoIndex: number,
  totalPhotos: number,
  refinement?: string,
  roomAnalysis?: string,
): string {
  if (refinement) {
    return `You are a professional interior designer and virtual stager for real estate.

Previously you staged this room with ${style} furniture. The user wants a revision:
"${refinement}"

CRITICAL RULES:
- Output the EXACT same image dimensions, aspect ratio, and camera angle as the input photo
- Do NOT crop, zoom, rotate, or reframe the image in any way
- Do NOT change any walls, floors, ceilings, windows, doors, or built-in features
- Do NOT change wall colors, floor materials, or window positions
- Do NOT add or remove any architectural elements
- Furniture must respect the room's perspective, scale, and lighting direction
- Place furniture in realistic positions (not blocking doorways or windows)
- The result must look like a professional real estate listing photo
- Output a photorealistic image, NOT a rendering or illustration
- The output image MUST be the same orientation (landscape/portrait) as the input`;
  }

  // Keep analysis concise — truncate if too long
  const trimmedAnalysis = roomAnalysis && roomAnalysis.length > 800
    ? roomAnalysis.substring(0, 800) + '...'
    : roomAnalysis;

  const analysisBlock = trimmedAnalysis
    ? `\nCONSTRAINTS & FURNITURE PLACEMENT (follow these strictly — NO-GO ZONES are non-negotiable):\n${trimmedAnalysis}`
    : '';

  const core = `You are editing a REAL photograph. The room is REAL — do NOT reimagine it.

RULES:
1. Keep ALL walls, floors, ceilings, windows, doors, fixtures EXACTLY as-is. No color changes, no material changes.
2. "${style}" applies ONLY to furniture — NOT the room. If the room has carpet, it stays carpet regardless of style.
3. ONLY add freestanding furniture onto the existing floor. No wall-mounting.
4. Match the room's perspective, lighting, and scale. Photorealistic output.
5. Same dimensions and orientation as input.`;

  if (totalPhotos > 1) {
    return `${core}
${analysisBlock}

${totalPhotos} angles of the same room shown. STAGE ONLY IMAGE ${photoIndex + 1} with ${style} furniture. Others are spatial reference.`;
  }

  return `${core}
${analysisBlock}

Add ${style} freestanding furniture to this room photo.`;
}

// ---------- Stage a room (with optional reference images) ----------

export async function stageRoom(
  imageBase64: string,
  imageMimeType: string,
  style: string,
  model: StagingModel = 'nano-banana-2',
  options?: {
    referenceImages?: ReferenceImage[];
    photoIndex?: number;
    totalPhotos?: number;
    refinement?: string;
    roomAnalysis?: string;
    roomTypes?: string[];
  },
): Promise<StagingResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set.');
  }

  const refs = options?.referenceImages || [];
  const photoIndex = options?.photoIndex ?? 0;
  const totalPhotos = options?.totalPhotos ?? (refs.length > 0 ? refs.length + 1 : 1);
  const refinement = options?.refinement;

  const modelId = MODEL_IDS[model];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const roomAnalysis = options?.roomAnalysis;
  const roomTypes = options?.roomTypes;
  const roomTypeContext = roomTypes && roomTypes.length > 0
    ? `\nThis space is being staged as: ${roomTypes.join(' + ')}. ONLY place furniture appropriate for ${roomTypes.join(' and ')}.`
    : '';
  const fullAnalysis = roomAnalysis
    ? roomAnalysis + roomTypeContext
    : roomTypeContext || undefined;
  const prompt = buildPrompt(style, photoIndex, totalPhotos, refinement, fullAnalysis);

  // Build parts: prompt text, then all images (target first, then references)
  const parts: Record<string, unknown>[] = [{ text: prompt }];

  // Add target image (the one to stage)
  parts.push({
    inlineData: {
      mimeType: imageMimeType,
      data: imageBase64,
    },
  });

  // Add reference images
  for (const ref of refs) {
    parts.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: ref.base64,
      },
    });
  }

  // Detect aspect ratio from input image dimensions if possible
  const imageConfig: Record<string, unknown> = {};
  // We don't have pixel dimensions here, but we can at least request
  // the output matches common ratios. The model will try to match input.

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: Object.keys(imageConfig).length > 0 ? imageConfig : undefined,
    },
  };

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const responseParts = data.candidates?.[0]?.content?.parts || [];

  let imageData = '';
  let mimeType = 'image/png';
  let text = '';

  for (const part of responseParts) {
    if (part.inlineData?.data) {
      imageData = part.inlineData.data;
      mimeType = part.inlineData.mimeType || 'image/png';
    }
    if (part.text) {
      text = part.text;
    }
  }

  if (!imageData) {
    throw new Error(`Gemini returned no image. Response: ${text || 'empty'}`);
  }

  return {
    imageData,
    mimeType,
    text,
    model,
    estimatedCost: COST_PER_IMAGE[model],
  };
}

export { COST_PER_IMAGE, MODEL_IDS, getAspectRatioFromDimensions };
