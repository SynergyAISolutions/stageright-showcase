import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { applyWatermark } from './apply-watermark.mjs';

let pngFixture;
let jpegFixture;

beforeAll(async () => {
  // Generate a fixture image — solid grey 1024×768 — so tests are
  // hermetic and don't depend on bundled binaries.
  pngFixture = await sharp({
    create: { width: 1024, height: 768, channels: 3, background: { r: 200, g: 200, b: 200 } },
  }).png().toBuffer();
  jpegFixture = await sharp({
    create: { width: 1024, height: 768, channels: 3, background: { r: 200, g: 200, b: 200 } },
  }).jpeg({ quality: 95 }).toBuffer();
});

describe('applyWatermark', () => {
  it('returns a PNG buffer when given a PNG mime type', async () => {
    const out = await applyWatermark(pngFixture, 'image/png');
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('png');
  });

  it('returns a JPEG buffer when given a JPEG mime type', async () => {
    const out = await applyWatermark(jpegFixture, 'image/jpeg');
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
  });

  it('preserves output dimensions matching input', async () => {
    const out = await applyWatermark(pngFixture, 'image/png');
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(768);
  });

  it('changes pixels in the bottom-right quadrant (where the pill lands)', async () => {
    const out = await applyWatermark(pngFixture, 'image/png');
    // Sample a pixel inside the pill but OUTSIDE the centered text glyphs.
    // For a 1024-wide image: pillW≈214, pillH≈45, margin=41.
    // Pill spans left≈769→983, top≈682→727. Text is centered horizontally,
    // spanning roughly 800→950. (790, 705) sits in the navy left-margin
    // strip inside the pill — guaranteed to hit the navy fill, not white text.
    // Original pixel was rgb(200,200,200). After watermark, this region is
    // rgba(15,29,46,0.86) over rgb(200,200,200) ≈ rgb(41,52,67)-ish.
    const { data } = await sharp(out).extract({ left: 790, top: 705, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    const [r, g, b] = data;
    expect(r).toBeLessThan(80);
    expect(g).toBeLessThan(90);
    expect(b).toBeLessThan(100);
  });

  it('leaves the top-left quadrant unchanged', async () => {
    const out = await applyWatermark(pngFixture, 'image/png');
    const { data } = await sharp(out).extract({ left: 50, top: 50, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    const [r, g, b] = data;
    expect(r).toBe(200);
    expect(g).toBe(200);
    expect(b).toBe(200);
  });
});
