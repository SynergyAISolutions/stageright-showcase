// Builds the StageRight Android / PWA icon set from a single transparent source.
// Run with: node scripts/build-android-icons.mjs

import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'scripts/source-assets/icon-source.png');
const OUT = path.join(ROOT, 'public/icons/android');

const LIGHT_BG = { r: 0xFA, g: 0xF6, b: 0xEF, alpha: 1 };  // manifest background_color
const DARK_BG  = { r: 0x1F, g: 0x35, b: 0x39, alpha: 1 };  // manifest theme_color
const CREAM    = [0xFA, 0xF6, 0xEF];
const CHARCOAL = [0x1F, 0x35, 0x39];
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

// 1) Knock out the near-white background to actually-transparent (the source
//    PNG ships with a #F4F4F5 fill that LOOKS transparent against ChatGPT's
//    UI but is solid colour and would print as a white box on every tile).
// 2) Trim the resulting transparent border so the mark fills its bounds.
async function loadTrimmed() {
  const { data, info } = await sharp(SOURCE).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i], g = out[i+1], b = out[i+2];
    const min = Math.min(r, g, b);
    // Near-white → fully transparent. Threshold tuned so anti-aliased
    // mark edges (which dip to ~200) survive.
    if (min >= 225) {
      out[i+3] = 0;
    } else if (min >= 200) {
      // Blend zone: scale alpha based on distance from white. Keeps edges crisp.
      out[i+3] = Math.round(((225 - min) / 25) * 255);
    }
  }
  const knocked = await sharp(out, { raw: info }).png().toBuffer();
  return await sharp(knocked).trim().png().toBuffer();
}

// Recolor the dark "house" pixels (low-saturation, dark) to cream.
// Leaves the coral star alone. Used for dark-bg variants where charcoal would vanish.
async function swapDarkToCream(srcBuf) {
  const { data, info } = await sharp(srcBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i], g = out[i+1], b = out[i+2], a = out[i+3];
    if (a < 30) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const isLowSaturation = (max - min) < 35;
    const isDark = max < 120;
    if (isLowSaturation && isDark) {
      out[i] = CREAM[0]; out[i+1] = CREAM[1]; out[i+2] = CREAM[2];
    }
  }
  return await sharp(out, { raw: info }).png().toBuffer();
}

// Replace every non-transparent pixel with `rgb`, keep alpha. For monochrome variants.
async function flatten(srcBuf, rgb) {
  const { data, info } = await sharp(srcBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i+3] === 0) continue;
    out[i] = rgb[0]; out[i+1] = rgb[1]; out[i+2] = rgb[2];
  }
  return await sharp(out, { raw: info }).png().toBuffer();
}

// Centered composite of `mark` inside a `size`x`size` tile filled with `bg`.
// `scale` is the fraction of the tile the mark occupies (rest is breathing room).
async function tileOnBg(mark, size, bg, scale) {
  const inner = Math.round(size * scale);
  const resized = await sharp(mark)
    .resize(inner, inner, { fit: 'contain', background: TRANSPARENT })
    .toBuffer();
  return await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toBuffer();
}

// Centered composite on a transparent tile (for adaptive foreground / logo marks).
async function tileTransparent(mark, size, scale) {
  const inner = Math.round(size * scale);
  const resized = await sharp(mark)
    .resize(inner, inner, { fit: 'contain', background: TRANSPARENT })
    .toBuffer();
  return await sharp({ create: { width: size, height: size, channels: 4, background: TRANSPARENT } })
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toBuffer();
}

// Solid colour fill (adaptive background layer).
async function solidFill(size, bg) {
  return await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .png()
    .toBuffer();
}

async function write(name, buf) {
  const out = path.join(OUT, name);
  await fs.writeFile(out, buf);
  const { size } = await fs.stat(out);
  console.log(`  ${name.padEnd(34)} ${(size/1024).toFixed(1)} KB`);
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  console.log(`Reading: ${path.relative(ROOT, SOURCE)}`);
  const trimmed = await loadTrimmed();
  const cream = await swapDarkToCream(trimmed);

  console.log('\nApp icons (any) — transparent, mark full-bleed');
  await write('icon-light-192.png', await tileTransparent(trimmed, 192, 1.0));
  await write('icon-light-512.png', await tileTransparent(trimmed, 512, 1.0));
  await write('icon-dark-192.png',  await tileTransparent(cream,   192, 1.0));
  await write('icon-dark-512.png',  await tileTransparent(cream,   512, 1.0));

  console.log('\nMaskable — mark @ 66% on solid bg (Android REQUIRES opaque, crops outer 20%)');
  await write('maskable-light-192.png', await tileOnBg(trimmed, 192, LIGHT_BG, 0.66));
  await write('maskable-light-512.png', await tileOnBg(trimmed, 512, LIGHT_BG, 0.66));
  await write('maskable-dark-192.png',  await tileOnBg(cream,   192, DARK_BG,  0.66));
  await write('maskable-dark-512.png',  await tileOnBg(cream,   512, DARK_BG,  0.66));

  console.log('\nAdaptive — foreground (transparent, mark @ 66%) + background (solid)');
  await write('adaptive-foreground-light.png', await tileTransparent(trimmed, 512, 0.66));
  await write('adaptive-foreground-dark.png',  await tileTransparent(cream,   512, 0.66));
  await write('adaptive-background-light.png', await solidFill(512, LIGHT_BG));
  await write('adaptive-background-dark.png',  await solidFill(512, DARK_BG));

  console.log('\nMonochrome — single-colour silhouette (Android themed icons)');
  await write('monochrome-light.png', await tileTransparent(await flatten(trimmed, CHARCOAL), 512, 0.66));
  await write('monochrome-dark.png',  await tileTransparent(await flatten(trimmed, CREAM),    512, 0.66));

  console.log('\nLogo marks — for app header / OG / SEO (transparent, full-bleed)');
  await write('logo-mark-light.png', await tileTransparent(trimmed, 512, 1.0));
  await write('logo-mark-dark.png',  await tileTransparent(cream,   512, 1.0));

  console.log('\nPlay Store listing — mark @ 72% on cream (extra breathing room)');
  await write('play-store-icon.png', await tileOnBg(trimmed, 512, LIGHT_BG, 0.72));

  console.log('\nDone. Open public/icons/android/preview.html to review.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
