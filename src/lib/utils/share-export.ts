/**
 * Client-side share-export renderer. Composites the before + after images
 * with a style nameplate into a 1080×1920 vertical PNG for sharing to
 * Instagram, email, or client messages.
 *
 * Browser-only (uses Canvas 2D API). Requires S3 signed URLs to return
 * `Access-Control-Allow-Origin` — the crossOrigin='anonymous' attribute
 * forces CORS-clean loading so canvas.toBlob() doesn't taint.
 *
 * CORS verified: bucket `stageright-images` has AllowedOrigins: ["*"],
 * AllowedMethods: ["GET", "HEAD"] as of 2026-04-21. Canvas export works.
 */

interface RenderShareExportInput {
  beforeImageUrl: string;
  afterImageUrl: string;
  style: string;
  roomTypes: string[];
}

interface CoverCrop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Pure helper — compute the source rect to sample from an image so it
 * covers the destination box (object-fit: cover behaviour). Exported
 * for unit testing; also used internally by drawCoveredImage.
 */
export function computeCoverCrop(args: {
  srcW: number;
  srcH: number;
  dstW: number;
  dstH: number;
}): CoverCrop {
  const srcRatio = args.srcW / args.srcH;
  const dstRatio = args.dstW / args.dstH;
  if (srcRatio > dstRatio) {
    const sw = args.srcH * dstRatio;
    return { sx: (args.srcW - sw) / 2, sy: 0, sw, sh: args.srcH };
  } else if (srcRatio < dstRatio) {
    const sh = args.srcW / dstRatio;
    return { sx: 0, sy: (args.srcH - sh) / 2, sw: args.srcW, sh };
  }
  return { sx: 0, sy: 0, sw: args.srcW, sh: args.srcH };
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function drawCoveredImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const crop = computeCoverCrop({ srcW: img.width, srcH: img.height, dstW: w, dstH: h });
  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, x, y, w, h);
}

export async function renderShareExport(input: RenderShareExportInput): Promise<Blob> {
  const WIDTH = 1080;
  const HEIGHT = 1920;

  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.load('600 96px "DM Serif Display"');
      await document.fonts.load('500 22px "Outfit"');
    } catch {
      /* non-fatal — fall back to system serif/sans if fonts can't load */
    }
  }

  const [beforeImg, afterImg] = await Promise.all([
    loadImage(input.beforeImageUrl),
    loadImage(input.afterImageUrl),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Background — soft warm off-white
  ctx.fillStyle = '#faf7f2';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Layout
  const PAD = 60;
  const TEXT_BAND_HEIGHT = 240;
  const IMG_HEIGHT = (HEIGHT - TEXT_BAND_HEIGHT - PAD * 2) / 2;
  const IMG_WIDTH = WIDTH - PAD * 2;

  // Before (top)
  drawCoveredImage(ctx, beforeImg, PAD, PAD, IMG_WIDTH, IMG_HEIGHT);
  // After (bottom)
  drawCoveredImage(ctx, afterImg, PAD, PAD + IMG_HEIGHT + TEXT_BAND_HEIGHT, IMG_WIDTH, IMG_HEIGHT);

  // Text band
  const bandTop = PAD + IMG_HEIGHT;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // Eyebrow
  ctx.font = '500 22px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#64748b';
  const eyebrow = input.roomTypes.join(' · ').toUpperCase();
  ctx.fillText(eyebrow, WIDTH / 2, bandTop + 70);

  // Style name
  ctx.font = '600 96px "DM Serif Display", Georgia, serif';
  ctx.fillStyle = '#0f1d2e';
  ctx.fillText(input.style, WIDTH / 2, bandTop + 150);

  // Footer
  ctx.font = '500 20px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('Staged with StageRight', WIDTH / 2, HEIGHT - 40);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob returned null'));
      },
      'image/png',
      0.95,
    );
  });
}
