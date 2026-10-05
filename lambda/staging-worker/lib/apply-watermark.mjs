import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const FONT_PATH = join(HERE, '..', 'assets', 'fonts', 'Outfit-Medium.ttf');

/**
 * Composites the StageRight "Virtually Staged · AI" watermark onto a
 * staged image buffer. Returns a new buffer in the same format.
 *
 * Architecture: text is rendered by Sharp's native text input (Pango +
 * direct fontfile path) — NOT inside the SVG. Lambda's librsvg ignores
 * @font-face rules and has no system Outfit, so SVG-rendered text
 * comes out as .notdef boxes. Sharp's text input bypasses librsvg
 * entirely and uses the bundled font file directly. The pill background
 * is a tiny rect-only SVG composited under the text PNG.
 *
 * Pill dimensions are sized to the actual rendered text width — no
 * empirical char-advance estimation needed.
 *
 * Throws on Sharp errors — caller should mark the staging job as
 * failed rather than silently serving a clean image (compliance promise
 * is "every image labelled").
 */
export async function applyWatermark(imageBuffer, mimeType) {
  const meta = await sharp(imageBuffer).metadata();
  if (!meta.width || !meta.height) {
    throw new Error('applyWatermark: cannot read image dimensions');
  }

  const fontPx = Math.round(meta.width * 0.024);
  const fontPt = Math.round(fontPx * 0.75); // px → pt at 96 DPI
  const padV   = Math.round(meta.width * 0.010);
  const padH   = Math.round(meta.width * 0.022);
  const margin = Math.round(meta.width * 0.04);

  // 1. Render the text via Sharp's text input. Pango markup gives the
  //    middot reduced opacity (alpha "80" of "ff" ≈ 50%).
  const textBuffer = await sharp({
    text: {
      text: '<span foreground="#ffffff">Virtually Staged<span foreground="#ffffff80"> · </span>AI</span>',
      fontfile: FONT_PATH,
      font: `Outfit Medium ${fontPt}`,
      rgba: true,
      dpi: 96,
    },
  }).png().toBuffer();
  const textMeta = await sharp(textBuffer).metadata();

  const pillW = textMeta.width + padH * 2;
  const pillH = textMeta.height + padV * 2;

  // 2. Pill background — rounded navy rect, no text.
  const pillBgSvg = `<svg width="${pillW}" height="${pillH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="rgba(15,29,46,0.86)"/>
  </svg>`;

  // 3. Composite text centred on the pill background.
  const pill = await sharp(Buffer.from(pillBgSvg))
    .composite([{ input: textBuffer, gravity: 'center' }])
    .png()
    .toBuffer();

  // 4. Composite the finished pill onto the staged image.
  const pipeline = sharp(imageBuffer).composite([{
    input: pill,
    top:  meta.height - pillH - margin,
    left: meta.width  - pillW - margin,
  }]);

  return mimeType === 'image/png'
    ? pipeline.png({ compressionLevel: 9 }).toBuffer()
    : pipeline.jpeg({ quality: 95 }).toBuffer();
}
