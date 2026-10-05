# Watermark & Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Burn a "Virtually Staged · AI" watermark into every staged image at generation time, ship an in-app listing-copy hub, add a gentle onboarding compliance screen, and draft ToS clauses (lawyer-gated).

**Architecture:** Watermark is composited in Lambda via Sharp + an SVG-rendered pill before S3 upload (one re-encode pass). Admin staging skips it. Hub is static at `/dashboard/listing-copy`, no DB. Onboarding screen is a new step between `result` and `fact-ai` — pure feature reveal, no checkboxes.

**Tech Stack:** Sharp 0.33+ in Lambda (new), librsvg (Sharp-bundled) for SVG-to-raster, Outfit-Medium.ttf bundled in Lambda, Vitest for unit tests, React Testing Library for component tests, existing Next.js 14 App Router + Tailwind.

**Spec:** `docs/superpowers/specs/2026-04-26-watermark-and-disclosure-design.md`

---

## File Structure

**New files:**
- `lambda/staging-worker/lib/watermark-svg.mjs` — pure function, generates pill SVG
- `lambda/staging-worker/lib/watermark-svg.test.mjs` — unit tests
- `lambda/staging-worker/lib/apply-watermark.mjs` — Sharp composite wrapper
- `lambda/staging-worker/lib/apply-watermark.test.mjs` — integration tests with sample image
- `lambda/staging-worker/assets/fonts/Outfit-Medium.ttf` — font asset
- `src/lib/disclosure/copy.ts` — listing copy variants + last-updated constant
- `src/lib/disclosure/why-it-matters.ts` — explainer content (platforms, regions)
- `src/lib/disclosure/copy.test.ts` — unit tests for the copy data shape
- `src/components/disclosure/copy-card.tsx` — card with copy-to-clipboard button
- `src/components/disclosure/why-it-matters.tsx` — expandable accordion section
- `src/components/disclosure/listing-copy-button.tsx` — button used on result screen + dashboard menu link
- `src/app/dashboard/listing-copy/page.tsx` — the hub page
- `src/components/onboarding/disclosure-perks-screen.tsx` — onboarding step
- `src/app/legal/terms/page.tsx` — ToS page (PR4 only)
- `src/components/legal/tos-acceptance-banner.tsx` — re-acceptance banner (PR4 only)

**Modified files:**
- `lambda/staging-worker/package.json` — add `sharp` dependency
- `lambda/staging-worker/index.mjs` — insert watermark step before S3 upload
- `src/app/api/stage/route.ts` — compute `applyWatermark` flag, pass to Lambda
- `src/app/api/stage/batch/route.ts` — same
- `src/lib/aws/lambda.ts` — add `applyWatermark` to invoke payload type
- `src/components/onboarding/onboarding-progress-bar.tsx` — insert `disclosure-perks` into `STEP_ORDER`
- `src/app/onboarding/onboarding-flow.tsx` — add `disclosure-perks` step + render
- `src/types/index.ts` — remove "No watermark" lines from paid `PLANS` configs; add `tosAcceptedVersion?` to User (PR4)
- `src/app/stage/page.tsx` — add Listing copy button to result screen
- `src/app/dashboard/page.tsx` (or wherever the dashboard menu lives — implementer to verify) — add Listing copy menu entry

---

# PR 1 — Watermark burn-in (Lambda)

## Task 1.1: Add Sharp dependency to Lambda

**Files:**
- Modify: `lambda/staging-worker/package.json`

- [ ] **Step 1: Add sharp to dependencies**

Open `lambda/staging-worker/package.json` and add `"sharp": "^0.33.5"` to the `dependencies` block (alphabetical between `@google/genai` and `ulid`).

Resulting file:

```json
{
  "name": "stageright-staging-worker",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "@anthropic-ai/bedrock-sdk": "^0.28.1",
    "@anthropic-ai/sdk": "^0.90.0",
    "@aws-sdk/client-bedrock-runtime": "^3.995.0",
    "@aws-sdk/client-dynamodb": "^3.995.0",
    "@aws-sdk/client-s3": "^3.995.0",
    "@aws-sdk/lib-dynamodb": "^3.995.0",
    "@aws-sdk/s3-request-presigner": "^3.995.0",
    "@google/genai": "^1.43.0",
    "sharp": "^0.33.5",
    "ulid": "^2.3.0"
  }
}
```

- [ ] **Step 2: Install with Linux glibc binaries (cross-platform from Windows)**

Run from `lambda/staging-worker/`:

```bash
cd lambda/staging-worker && rm -rf node_modules && npm install --cpu=x64 --os=linux --libc=glibc
```

Without `--libc=glibc`, npm may pull musl binaries which crash on Lambda's glibc runtime. Without `--cpu=x64 --os=linux`, npm pulls Windows binaries.

- [ ] **Step 3: Verify Sharp is importable**

Run from `lambda/staging-worker/`:

```bash
node --input-type=module -e "import('sharp').then(s => console.log('OK:', s.default.versions.sharp))"
```

Expected output: `OK: 0.33.5` (or similar).

- [ ] **Step 4: Commit**

```bash
git add lambda/staging-worker/package.json lambda/staging-worker/package-lock.json
git commit -m "feat(lambda): add sharp for watermark compositing"
```

---

## Task 1.2: Bundle the Outfit font asset

**Files:**
- Create: `lambda/staging-worker/assets/fonts/Outfit-Medium.ttf`

- [ ] **Step 1: Download Outfit-Medium.ttf from Google Fonts**

Outfit is licensed under SIL Open Font License (free to bundle). Download from:

```bash
mkdir -p lambda/staging-worker/assets/fonts && curl -L -o lambda/staging-worker/assets/fonts/Outfit-Medium.ttf "https://github.com/googlefonts/outfit/raw/main/fonts/ttf/Outfit-Medium.ttf"
```

- [ ] **Step 2: Verify file is a valid TTF**

```bash
file lambda/staging-worker/assets/fonts/Outfit-Medium.ttf
```

Expected: `TrueType Font data` or similar. File size should be ~50-80KB.

- [ ] **Step 3: Commit**

```bash
git add lambda/staging-worker/assets/fonts/Outfit-Medium.ttf
git commit -m "feat(lambda): bundle Outfit-Medium.ttf for watermark text"
```

---

## Task 1.3: Build the SVG generator (TDD)

**Files:**
- Create: `lambda/staging-worker/lib/watermark-svg.mjs`
- Create: `lambda/staging-worker/lib/watermark-svg.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `lambda/staging-worker/lib/watermark-svg.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { buildWatermarkPill } from './watermark-svg.mjs';

describe('buildWatermarkPill', () => {
  it('scales font size to 2.4% of image width', () => {
    const { svg } = buildWatermarkPill(1024);
    // 1024 * 0.024 = 24.576 → rounded 25
    expect(svg).toMatch(/font-size="25"/);
  });

  it('scales font size for 4K images', () => {
    const { svg } = buildWatermarkPill(4096);
    // 4096 * 0.024 = 98.304 → rounded 98
    expect(svg).toMatch(/font-size="98"/);
  });

  it('returns pill dimensions consistent with the SVG width attribute', () => {
    const { svg, pillW, pillH } = buildWatermarkPill(2048);
    expect(svg).toMatch(new RegExp(`width="${pillW}"`));
    expect(svg).toMatch(new RegExp(`height="${pillH}"`));
  });

  it('embeds the locked watermark text', () => {
    const { svg } = buildWatermarkPill(1024);
    expect(svg).toContain('Virtually Staged');
    expect(svg).toContain('AI');
    expect(svg).toContain('opacity="0.5"'); // middot
  });

  it('uses the brand navy fill at 86% opacity', () => {
    const { svg } = buildWatermarkPill(1024);
    expect(svg).toContain('fill="rgba(15,29,46,0.86)"');
  });

  it('references the bundled Outfit font via file:// URL', () => {
    const { svg } = buildWatermarkPill(1024);
    expect(svg).toContain("file:///var/task/assets/fonts/Outfit-Medium.ttf");
  });

  it('produces a pill width that is roughly 14% of image width', () => {
    const { pillW } = buildWatermarkPill(1024);
    // Target: ~143px for 1024px image. Allow ±10% tolerance for char-width estimation.
    expect(pillW).toBeGreaterThan(128);
    expect(pillW).toBeLessThan(170);
  });
});
```

- [ ] **Step 2: Run the tests — should fail (file not yet created)**

Run from project root:

```bash
npx vitest run lambda/staging-worker/lib/watermark-svg.test.mjs
```

Expected: errors on import — `Cannot find module ./watermark-svg.mjs`.

- [ ] **Step 3: Implement watermark-svg.mjs**

Create `lambda/staging-worker/lib/watermark-svg.mjs`:

```js
/**
 * Builds the SVG for the "Virtually Staged · AI" watermark pill.
 *
 * Pure function — no side effects, no I/O. Returns the pill SVG only
 * (NOT the full image canvas). The Sharp composite step positions the
 * pill on the image at the correct corner.
 *
 * All dimensions scale off image width so the watermark stays
 * proportional from 1K through 4K outputs.
 */
export function buildWatermarkPill(imgWidth) {
  const fontSize = Math.round(imgWidth * 0.024);
  const padV     = Math.round(imgWidth * 0.010);
  const padH     = Math.round(imgWidth * 0.022);
  // Outfit Medium average char advance ≈ 0.52 × font-size.
  // Text "Virtually Staged · AI" is 21 characters including spaces and middot.
  const textW    = Math.round(fontSize * 0.52 * 21);
  const pillW    = textW + padH * 2;
  const pillH    = fontSize + padV * 2;

  const shadowBlur   = Math.max(1, Math.round(fontSize * 0.16));
  const shadowOffset = Math.max(1, Math.round(fontSize * 0.08));

  const svg = `<svg width="${pillW}" height="${pillH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @font-face {
        font-family: 'Outfit';
        src: url('file:///var/task/assets/fonts/Outfit-Medium.ttf') format('truetype');
        font-weight: 500;
      }
    </style>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${shadowBlur}"/>
      <feOffset dy="${shadowOffset}"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.25"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${pillW}" height="${pillH}" rx="${pillH / 2}"
        fill="rgba(15,29,46,0.86)" filter="url(#shadow)"/>
  <text x="${pillW / 2}" y="${pillH / 2}" font-family="Outfit, sans-serif"
        font-weight="500" font-size="${fontSize}" fill="#fff"
        letter-spacing="0.2" text-anchor="middle" dominant-baseline="central">
    Virtually Staged<tspan opacity="0.5"> · </tspan>AI
  </text>
</svg>`;

  return { svg, pillW, pillH };
}
```

- [ ] **Step 4: Run the tests — should pass**

```bash
npx vitest run lambda/staging-worker/lib/watermark-svg.test.mjs
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add lambda/staging-worker/lib/watermark-svg.mjs lambda/staging-worker/lib/watermark-svg.test.mjs
git commit -m "feat(lambda): SVG watermark pill generator with TDD"
```

---

## Task 1.4: Build the Sharp composite wrapper (TDD)

**Files:**
- Create: `lambda/staging-worker/lib/apply-watermark.mjs`
- Create: `lambda/staging-worker/lib/apply-watermark.test.mjs`

- [ ] **Step 1: Write the failing integration tests**

Create `lambda/staging-worker/lib/apply-watermark.test.mjs`:

```js
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
    // Sample a pixel where the pill should be — bottom-right at ~92% of width, ~93% of height.
    // Original pixel was rgb(200,200,200). After watermark, the pill area should be navy-ish (much darker).
    const { data } = await sharp(out).extract({ left: 920, top: 720, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    const [r, g, b] = data;
    // Pill is rgba(15,29,46,0.86) over rgb(200,200,200) — composite ≈ rgb(41,52,67)-ish
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
```

- [ ] **Step 2: Run the tests — should fail**

```bash
npx vitest run lambda/staging-worker/lib/apply-watermark.test.mjs
```

Expected: errors on import — `Cannot find module ./apply-watermark.mjs`.

- [ ] **Step 3: Implement apply-watermark.mjs**

Create `lambda/staging-worker/lib/apply-watermark.mjs`:

```js
import sharp from 'sharp';
import { buildWatermarkPill } from './watermark-svg.mjs';

/**
 * Composites the StageRight "Virtually Staged · AI" watermark onto a
 * staged image buffer. Returns a new buffer in the same format.
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

  const { svg, pillW, pillH } = buildWatermarkPill(meta.width);
  const margin = Math.round(meta.width * 0.04);

  const pipeline = sharp(imageBuffer).composite([{
    input: Buffer.from(svg),
    top:  meta.height - pillH - margin,
    left: meta.width  - pillW - margin,
  }]);

  return mimeType === 'image/png'
    ? pipeline.png({ compressionLevel: 9 }).toBuffer()
    : pipeline.jpeg({ quality: 95 }).toBuffer();
}
```

- [ ] **Step 4: Run the tests — should pass**

```bash
npx vitest run lambda/staging-worker/lib/apply-watermark.test.mjs
```

Expected: 5 passed.

If the "changes pixels in the bottom-right quadrant" test fails because the sample point misses the pill, adjust the sample coordinates — the actual pill position depends on rounded values from `buildWatermarkPill(1024)`. Compute: `pillW≈143, pillH≈38, margin=41`. Pill spans `left=840` to `983`, `top=689` to `727`. A reliable sample point is `left=900, top=710`.

- [ ] **Step 5: Commit**

```bash
git add lambda/staging-worker/lib/apply-watermark.mjs lambda/staging-worker/lib/apply-watermark.test.mjs
git commit -m "feat(lambda): apply-watermark Sharp composite with TDD"
```

---

## Task 1.5: Wire watermark step into Lambda index.mjs

**Files:**
- Modify: `lambda/staging-worker/index.mjs`

- [ ] **Step 1: Locate the staging completion path**

Read `lambda/staging-worker/index.mjs` to find the section after the model returns image bytes and before the S3 upload. Look for an existing `PutObjectCommand` or `uploadToS3` call — the watermark step inserts immediately before it, on the buffer the model returned.

- [ ] **Step 2: Add the watermark import at the top**

```js
import { applyWatermark } from './lib/apply-watermark.mjs';
```

- [ ] **Step 3: Insert the watermark step**

Wherever the staged image buffer is about to be uploaded, replace:

```js
// Before
await s3Client.send(new PutObjectCommand({ Bucket, Key: stagedKey, Body: stagedBuffer, ContentType: mimeType }));
```

with:

```js
// After
const applyWm = params.applyWatermark !== false && !params.comparisonId;
const finalBuffer = applyWm
  ? await applyWatermark(stagedBuffer, mimeType)
  : stagedBuffer;
await s3Client.send(new PutObjectCommand({ Bucket, Key: stagedKey, Body: finalBuffer, ContentType: mimeType }));
```

The `params.applyWatermark !== false` check defaults to TRUE if undefined — fail-safe for any legacy invocation that hasn't been redeployed.

The `!params.comparisonId` keeps the admin compare flow watermark-free (existing behaviour preserved).

- [ ] **Step 4: Verify there's only ONE upload path that needs this**

Search the file for `PutObjectCommand` to confirm there isn't a separate code path for OpenAI vs Gemini that would each need the same change. If there are multiple, apply the same wrapper to each.

```bash
grep -n "PutObjectCommand" lambda/staging-worker/index.mjs
```

If multiple matches, repeat Step 3's wrapping at each upload site that handles staged (not original) images.

- [ ] **Step 5: Smoke-test syntax — Lambda code parses**

```bash
node --check lambda/staging-worker/index.mjs
```

Expected: no output (success). Errors here mean a syntax issue.

- [ ] **Step 6: Commit**

```bash
git add lambda/staging-worker/index.mjs
git commit -m "feat(lambda): apply watermark before S3 upload"
```

---

## Task 1.6: Update `/api/stage` route to compute applyWatermark flag

**Files:**
- Modify: `src/app/api/stage/route.ts`
- Modify: `src/lib/aws/lambda.ts` (add `applyWatermark` to invoke payload type if it's typed)

- [ ] **Step 1: Read the Lambda invoke types**

```bash
cat src/lib/aws/lambda.ts | head -80
```

Locate the type definition for the `params` object passed to `invokeStagingWorker`. If it's strictly typed, add `applyWatermark?: boolean` to the type.

- [ ] **Step 2: Add admin detection to the route**

Open `src/app/api/stage/route.ts`. Add the import at the top:

```ts
import { ADMIN_EMAILS } from '@/types';
```

Then after the session check (around line 38-40, just after `if (!session)`), add:

```ts
const isAdmin = ADMIN_EMAILS.includes(session.user.email);
```

- [ ] **Step 3: Pass the flag to the Lambda invoke**

In the `invokeStagingWorker({ ... params: { ... } })` call (around line 88-101), add `applyWatermark: !isAdmin,` to the params object:

```ts
await invokeStagingWorker({
  jobId,
  action: 'stage',
  params: {
    userId: session.user.id,
    heroS3Key: imageS3Key,
    referenceS3Keys: referenceS3Keys || [],
    style,
    model: forcedModel,
    useOpus47: true,
    roomAnalysis: roomAnalysis || '',
    roomTypes: roomTypes || [],
    notes: notes || '',
    applyWatermark: !isAdmin,  // ← NEW
  },
});
```

- [ ] **Step 4: Type-check passes**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/stage/route.ts src/lib/aws/lambda.ts
git commit -m "feat(api): pass applyWatermark flag to Lambda from /api/stage"
```

---

## Task 1.7: Update `/api/stage/batch` route the same way

**Files:**
- Modify: `src/app/api/stage/batch/route.ts`

- [ ] **Step 1: Add the import + admin check**

Open `src/app/api/stage/batch/route.ts`. Add to imports:

```ts
import { ADMIN_EMAILS } from '@/types';
```

After the session check (around line 14-17), add:

```ts
const isAdmin = ADMIN_EMAILS.includes(session.user.email);
```

- [ ] **Step 2: Pass the flag in the fan-out invoke**

In the `Promise.all(batch.subJobs.map(...))` block (around line 84-105), add `applyWatermark: !isAdmin,` to the params object:

```ts
await Promise.all(
  batch.subJobs.map((sub) =>
    invokeStagingWorker({
      jobId: sub.jobId,
      action: 'stage',
      batchId: batch.batchId,
      params: {
        userId: session.user.id,
        sessionId: sub.jobId,
        heroS3Key,
        referenceS3Keys,
        roomTypes,
        style: sub.style,
        notes,
        roomAnalysis: '',
        useOpus47,
        model: 'nano-banana-pro',
        quality: 'standard',
        applyWatermark: !isAdmin,  // ← NEW
      },
    }),
  ),
);
```

- [ ] **Step 3: Type-check passes**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/stage/batch/route.ts
git commit -m "feat(api): pass applyWatermark flag from /api/stage/batch"
```

---

## Task 1.8: Remove obsolete "No watermark" copy from PLANS

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Remove the line from each paid plan**

Open `src/types/index.ts`. Find the `PLANS` constant (around line 59). Remove the `'No watermark'` entries from the `features` arrays of:
- `starter` (line ~83)
- `professional` (line ~95)
- `lifetime_starter` (line ~125)
- `lifetime_pro` (line ~138)

After the change, those features arrays look like:

```ts
starter: {
  // ...
  features: [
    '35 credits per month',
    'Standard quality',
    'Download in full resolution',
    'Reference photo support',
  ],
},
professional: {
  // ...
  features: [
    '75 credits per month',
    'Standard + HD quality',
    'Priority generation',
    'Conversational editing',
    'Before/after export',
  ],
},
lifetime_starter: {
  // ...
  features: [
    '500 credits — never expire',
    'Standard quality',
    'Download in full resolution',
    'Buy top-ups anytime',
  ],
},
lifetime_pro: {
  // ...
  features: [
    '1,200 credits — never expire',
    'Standard + HD quality',
    'Priority generation',
    'Conversational editing',
    'Buy top-ups anytime',
  ],
},
```

The `agency` plan never had "No watermark" — leave as is. The `free` and `admin` plans never had it either.

- [ ] **Step 2: Verify the watermark copy is gone everywhere**

```bash
grep -rn "No watermark" src/
```

Expected: empty (no matches).

- [ ] **Step 3: Type-check + lint**

```bash
npm run type-check && npm run lint
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "chore(plans): drop 'No watermark' from paid plan features (now universal)"
```

---

## Task 1.9: Deploy Lambda and smoke-test

**Files:** None changed in this task — deployment + verification.

- [ ] **Step 1: Zip the Lambda**

Per `CLAUDE.md` "Deploying the staging-worker Lambda" — must use the .NET ZipFile path due to Windows MAX_PATH limits in deep node_modules:

```powershell
powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; \$src = '\\?\C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images\lambda\staging-worker'; \$dst = '\\?\C:\Users\taraf\OneDrive\Desktop\Cursor Projects\real-estate-images\lambda\staging-worker.zip'; if (Test-Path \$dst) { Remove-Item \$dst -Force }; [System.IO.Compression.ZipFile]::CreateFromDirectory(\$src, \$dst, [System.IO.Compression.CompressionLevel]::Optimal, \$false)"
```

Expected: completes silently. Verify size:

```bash
ls -la lambda/staging-worker.zip
```

Expected: ~35-45MB. If under 25MB or over 50MB, something is wrong (Sharp binaries missing or too much was included).

- [ ] **Step 2: Upload to Lambda**

```bash
cd lambda && aws lambda update-function-code \
  --function-name stageright-staging-worker \
  --zip-file fileb://staging-worker.zip \
  --region ap-southeast-2
```

- [ ] **Step 3: Wait for rollover**

```bash
aws lambda get-function-configuration \
  --function-name stageright-staging-worker \
  --region ap-southeast-2 \
  --query "{LastUpdateStatus:LastUpdateStatus,State:State}"
```

Wait until `LastUpdateStatus=Successful` and `State=Active` (usually <30s).

- [ ] **Step 4: Smoke test — non-admin user**

In a logged-in non-admin browser session (or with a non-admin test account):

1. Visit `/stage`
2. Upload any test photo
3. Pick any room type and style
4. Click stage
5. When the result appears, **verify the watermark is visible** in the bottom-right corner of the staged image (small dark navy pill, "Virtually Staged · AI")

If the watermark doesn't appear:
- Check CloudWatch logs for the Lambda — look for `applyWatermark` errors
- Verify the route's payload includes `applyWatermark: true` (CloudWatch should log invoke params)
- Verify the font file path resolves — Sharp/librsvg sometimes fails silently if the font isn't found, falling back to system serif. The watermark will still render but in the wrong font.

- [ ] **Step 5: Smoke test — admin user**

Log in as admin (taraferguson.business@gmail.com or tara@aiwave.com.au), generate a stage. **Verify NO watermark** appears.

- [ ] **Step 6: Smoke test — share-export inheritance**

On the non-admin staged image's result screen, click Share Export. Open the downloaded 1080×1920 PNG. The "after" half should show the watermark already burned in (pulled from the watermarked S3 image — no extra work needed).

- [ ] **Step 7: Smoke test — download endpoint**

Click Download from the result screen. Open the downloaded image. **Watermark visible.**

If all four smoke tests pass, **PR1 is shippable.**

- [ ] **Step 8: Commit any debugging fixes (if needed)**

If you had to adjust anything during smoke testing, commit those fixes. Otherwise this step is a no-op.

---

# PR 2 — In-app listing-copy hub

## Task 2.1: Create the copy variants source (TDD-light)

**Files:**
- Create: `src/lib/disclosure/copy.ts`
- Create: `src/lib/disclosure/copy.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/disclosure/copy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LISTING_COPY_VARIANTS, COPY_LAST_UPDATED } from './copy';

describe('LISTING_COPY_VARIANTS', () => {
  it('exposes three variants with stable ids', () => {
    expect(LISTING_COPY_VARIANTS.map((v) => v.id)).toEqual(['standard', 'short', 'eu']);
  });

  it('every variant has non-empty label and text', () => {
    for (const v of LISTING_COPY_VARIANTS) {
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.text.length).toBeGreaterThan(0);
    }
  });

  it('every variant text contains "AI" so the disclosure is unambiguous', () => {
    for (const v of LISTING_COPY_VARIANTS) {
      expect(v.text).toMatch(/AI/);
    }
  });
});

describe('COPY_LAST_UPDATED', () => {
  it('is a valid ISO date string', () => {
    expect(() => new Date(COPY_LAST_UPDATED).toISOString()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
npx vitest run src/lib/disclosure/copy.test.ts
```

Expected: import error.

- [ ] **Step 3: Implement copy.ts**

Create `src/lib/disclosure/copy.ts`:

```ts
export interface ListingCopyVariant {
  id: 'standard' | 'short' | 'eu';
  label: string;
  description: string;
  text: string;
}

export const LISTING_COPY_VARIANTS: ListingCopyVariant[] = [
  {
    id: 'standard',
    label: 'Standard',
    description: 'Recommended for most listings.',
    text: 'Image virtually staged with AI. Furniture is illustrative; the property is sold unfurnished.',
  },
  {
    id: 'short',
    label: 'Short',
    description: 'When listing space is tight.',
    text: 'Image virtually staged with AI.',
  },
  {
    id: 'eu',
    label: 'EU-friendly',
    description: 'Extra explicit per EU AI Act Art. 50.',
    text: 'AI-generated image. Property sold unfurnished.',
  },
];

// Bump this when the copy changes — the hub footer surfaces it for confidence.
export const COPY_LAST_UPDATED = '2026-04-26';
```

- [ ] **Step 4: Run — should pass**

```bash
npx vitest run src/lib/disclosure/copy.test.ts
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/disclosure/copy.ts src/lib/disclosure/copy.test.ts
git commit -m "feat(disclosure): listing-copy variants with TDD"
```

---

## Task 2.2: Create the why-it-matters content source

**Files:**
- Create: `src/lib/disclosure/why-it-matters.ts`

- [ ] **Step 1: Implement the content source**

Create `src/lib/disclosure/why-it-matters.ts`:

```ts
export interface PlatformNote {
  name: string;
  note: string;
}

export interface RegionNote {
  name: string;
  note: string;
}

export const PLATFORM_NOTES: PlatformNote[] = [
  { name: 'realestate.com.au', note: 'Requires virtually-staged images to be labelled. The on-image label and a one-line listing note both meet their rules.' },
  { name: 'Domain', note: 'Requires disclosure of digitally-altered imagery in the listing description. Pair with the on-image label for full coverage.' },
  { name: 'Zillow', note: 'Photo guidelines require "Virtually Staged" or equivalent labelling on the image itself. Listings flagged without a label are removed.' },
  { name: 'Rightmove', note: '2023 listing guidelines require a "Virtually Staged" or "CGI" label on the image. The StageRight watermark satisfies this.' },
  { name: 'Zoopla', note: 'Aligned with Rightmove — on-image label required, listing description disclosure recommended.' },
];

export const REGION_NOTES: RegionNote[] = [
  {
    name: 'Australia',
    note: 'ACL s18 (misleading or deceptive conduct) covers undisclosed virtual staging — civil penalties up to A$50M for corporations. Victoria has the most explicit "label digitally altered images" guidance via Consumer Affairs Victoria. NSW, QLD, WA, SA, TAS, ACT, NT have no virtual-staging-specific rules; ACL applies. Add the listing-description note in addition to the on-image label.',
  },
  {
    name: 'United Kingdom',
    note: 'CPRs 2008 (Reg 5 misleading actions, Reg 6 misleading omissions) cover undisclosed virtual staging. Trading Standards enforces. The Digital Markets, Competition and Consumers Act 2024 raised CMA fining authority to 10% of global turnover.',
  },
  {
    name: 'United States',
    note: 'NAR Code of Ethics Article 12 + Standard of Practice 12-10 require truthful representation. Most state real-estate commissions enforce via general misleading-advertising rules; no state has a virtual-staging-specific statute. Most major MLS require both image-level and listing-text disclosure — non-compliance = listing removal + member fines.',
  },
  {
    name: 'European Union',
    note: 'EU AI Act Article 50 — both providers (machine-readable marking) and deployers (human-readable disclosure). Provider obligation is satisfied by Google/OpenAI signed metadata on the model output. Deployer obligation falls on the agent — use the EU-friendly listing copy variant when publishing to EU consumers. Effective 2 August 2026.',
  },
];

export const ON_IMAGE_EXPLAINER = `Every StageRight image carries a "Virtually Staged · AI" pill in the bottom-right corner. The label is burned into the image — it travels with the file when downloaded, shared, or screenshot-cropped (within reason), so your listing stays above board on REA, Domain, Zillow, Rightmove, and any major platform.`;

export const WHY_LISTING_DESCRIPTION_MATTERS = `The on-image label covers the image. Your listing description covers the listing. Most platforms expect both — the description note is a one-line addition to your existing copy and pre-empts buyer questions.`;
```

- [ ] **Step 2: Type-check passes**

```bash
npm run type-check
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/disclosure/why-it-matters.ts
git commit -m "feat(disclosure): why-it-matters content source"
```

---

## Task 2.3: Build the CopyCard component

**Files:**
- Create: `src/components/disclosure/copy-card.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/disclosure/copy-card.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { ListingCopyVariant } from '@/lib/disclosure/copy';

interface CopyCardProps {
  variant: ListingCopyVariant;
}

export function CopyCard({ variant }: CopyCardProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(variant.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked — silently no-op; user can manually select the text
    }
  };

  return (
    <div className="rounded-2xl bg-white border border-brand-navy/10 p-5 shadow-[0_1px_2px_rgba(15,29,46,0.04)]">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-brand-teal">
          {variant.label}
        </span>
        {variant.id === 'standard' && (
          <span className="text-[10px] font-medium tracking-[0.1em] uppercase text-brand-navy/50">
            Recommended
          </span>
        )}
      </div>
      <p className="text-[15px] text-brand-navy leading-snug font-normal mb-1.5">
        {variant.text}
      </p>
      <p className="text-[12px] text-brand-navy/55 mb-4">{variant.description}</p>
      <button
        type="button"
        onClick={onCopy}
        className={cn(
          'w-full flex items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-medium transition-colors',
          copied
            ? 'bg-brand-teal text-white'
            : 'bg-brand-teal/10 text-brand-teal hover:bg-brand-teal/15',
        )}
      >
        {copied ? (
          <>
            <Check className="size-3.5" /> Copied
          </>
        ) : (
          <>
            <Copy className="size-3.5" /> Copy
          </>
        )}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

```bash
npm run type-check && npm run lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/disclosure/copy-card.tsx
git commit -m "feat(disclosure): CopyCard component with copy-to-clipboard"
```

---

## Task 2.4: Build the WhyItMatters accordion

**Files:**
- Create: `src/components/disclosure/why-it-matters.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/disclosure/why-it-matters.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import {
  PLATFORM_NOTES,
  REGION_NOTES,
  ON_IMAGE_EXPLAINER,
  WHY_LISTING_DESCRIPTION_MATTERS,
} from '@/lib/disclosure/why-it-matters';

export function WhyItMatters() {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl bg-brand-navy/[0.04] border border-brand-navy/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="font-heading text-brand-navy text-[18px]">Why this matters</span>
        <ChevronDown
          className={cn('size-4 text-brand-navy/60 transition-transform duration-300', open && 'rotate-180')}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 flex flex-col gap-5 text-[14px] leading-relaxed text-brand-navy/80">
              <Block title="What's already on every image">{ON_IMAGE_EXPLAINER}</Block>
              <Block title="Why your listing description matters">{WHY_LISTING_DESCRIPTION_MATTERS}</Block>
              <div>
                <h4 className="font-semibold text-brand-navy mb-2 text-[13px] tracking-[0.04em] uppercase">
                  Platform notes
                </h4>
                <ul className="flex flex-col gap-2">
                  {PLATFORM_NOTES.map((p) => (
                    <li key={p.name}>
                      <span className="font-medium text-brand-navy">{p.name}.</span> {p.note}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-brand-navy mb-2 text-[13px] tracking-[0.04em] uppercase">
                  By region
                </h4>
                <div className="flex flex-col gap-3">
                  {REGION_NOTES.map((r) => (
                    <div key={r.name}>
                      <div className="font-medium text-brand-navy mb-0.5">{r.name}</div>
                      <div>{r.note}</div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[12px] text-brand-navy/50 italic">
                StageRight provides this overview for convenience. It is not legal advice — consult an
                Australian commercial lawyer (or your local equivalent) for binding guidance.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="font-semibold text-brand-navy mb-1.5 text-[13px] tracking-[0.04em] uppercase">
        {title}
      </h4>
      <p>{children}</p>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

```bash
npm run type-check && npm run lint
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/disclosure/why-it-matters.tsx
git commit -m "feat(disclosure): WhyItMatters expandable accordion"
```

---

## Task 2.5: Assemble the /dashboard/listing-copy page

**Files:**
- Create: `src/app/dashboard/listing-copy/page.tsx`

- [ ] **Step 1: Implement the page**

Create `src/app/dashboard/listing-copy/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { CopyCard } from '@/components/disclosure/copy-card';
import { WhyItMatters } from '@/components/disclosure/why-it-matters';
import { LISTING_COPY_VARIANTS, COPY_LAST_UPDATED } from '@/lib/disclosure/copy';

export const dynamic = 'force-dynamic';

export default async function ListingCopyPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <div className="min-h-[100dvh] bg-surface-secondary">
      <main className="mx-auto max-w-2xl px-6 sm:px-8 py-12 sm:py-16 flex flex-col gap-8">
        <header className="flex flex-col gap-3">
          <span className="text-[11px] font-semibold tracking-[0.18em] uppercase text-brand-teal">
            Listing copy
          </span>
          <h1 className="font-heading text-brand-navy text-[40px] sm:text-[52px] leading-[0.98] tracking-[-0.025em]">
            Copy &amp; paste for{' '}
            <span className="italic text-brand-teal">any listing.</span>
          </h1>
          <p className="text-[15px] text-brand-navy/70 leading-relaxed">
            Drop one of these lines into your listing description. We&apos;ve sized them so they read
            well next to your real-estate copy.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          {LISTING_COPY_VARIANTS.map((v) => (
            <CopyCard key={v.id} variant={v} />
          ))}
        </section>

        <aside className="rounded-2xl bg-white/60 border border-brand-navy/8 px-5 py-4 text-[13px] leading-relaxed text-brand-navy/75">
          StageRight handles the on-image label and provenance metadata. Including a one-line note
          like the above in your listing description is your call — most platforms (REA, Domain,
          Zillow, Rightmove) require it, and it builds buyer trust.{' '}
          <span className="text-brand-navy/55 italic">We&apos;re not legal advice.</span>
        </aside>

        <WhyItMatters />

        <footer className="text-[12px] text-brand-navy/40 text-center">
          Last updated {COPY_LAST_UPDATED}.{' '}
          <a href="/legal/terms" className="underline hover:text-brand-teal">
            Read the full Terms of Service →
          </a>
        </footer>
      </main>
    </div>
  );
}
```

Note: the link to `/legal/terms` works whether the page exists yet (PR4) or 404s. Acceptable for PR2 launch.

- [ ] **Step 2: Type-check passes**

```bash
npm run type-check
```

Expected: clean.

- [ ] **Step 3: Smoke test**

```bash
npm run dev
```

Visit `http://localhost:3000/dashboard/listing-copy`. Expected:
- Three copy cards render
- Click "Copy" on each → see "Copied" pill briefly, paste somewhere to confirm clipboard has the right text
- Click "Why this matters" → accordion expands smoothly, shows on-image explainer + listing-description note + 5 platform rows + 4 region rows + legal-advice disclaimer
- Click again → accordion collapses
- Footer shows last-updated date and ToS link

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/listing-copy/page.tsx
git commit -m "feat(dashboard): listing-copy hub page"
```

---

## Task 2.6: Add "Listing copy" to the dashboard menu

**Files:**
- Modify: dashboard menu component (path TBD by reading)

- [ ] **Step 1: Find the dashboard menu code**

```bash
grep -rn "Sign Out\|signOut\|UserMenu" src/app/dashboard src/components/dashboard 2>/dev/null
```

Locate the user menu / nav component that shows existing entries (e.g. "Sign Out", "Account"). Open the file.

- [ ] **Step 2: Add a "Listing copy" entry**

Add a `Link` to `/dashboard/listing-copy` adjacent to the existing menu entries. Use the same styling pattern. For example, if the menu uses `<Link>`:

```tsx
<Link
  href="/dashboard/listing-copy"
  className="block px-4 py-2 text-sm text-brand-navy hover:bg-brand-navy/5"
>
  Listing copy
</Link>
```

If the menu uses a list of icons + labels, add a matching entry. Match the existing pattern — do not invent a new style.

- [ ] **Step 3: Smoke test**

Run dev server, log in, open the user menu. Expected:
- "Listing copy" entry appears in the menu
- Clicking it navigates to `/dashboard/listing-copy`

- [ ] **Step 4: Commit**

```bash
git add <the modified file>
git commit -m "feat(dashboard): add 'Listing copy' to user menu"
```

---

## Task 2.7: Add Listing Copy button to the wizard result screen

**Files:**
- Modify: `src/app/stage/page.tsx` (the result step rendering)
- Create: `src/components/disclosure/listing-copy-button.tsx`

- [ ] **Step 1: Build the reusable button component**

Create `src/components/disclosure/listing-copy-button.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';

export function ListingCopyButton({ className }: { className?: string }) {
  return (
    <Link
      href="/dashboard/listing-copy"
      className={
        className ??
        'inline-flex items-center gap-2 rounded-full border border-brand-navy/15 bg-white/80 px-4 py-2.5 text-[13px] font-medium text-brand-navy hover:border-brand-teal hover:bg-brand-teal/5 transition-colors'
      }
    >
      <FileText className="size-4" />
      Listing copy
    </Link>
  );
}
```

- [ ] **Step 2: Find the result-screen action area in stage/page.tsx**

```bash
grep -n "ShareExportButton\|Download\|/api/download" src/app/stage/page.tsx | head -20
```

Locate the cluster of action buttons on the result step (Download + Share Export). Open `src/app/stage/page.tsx`.

- [ ] **Step 3: Add the import**

At the top of `src/app/stage/page.tsx`, add:

```tsx
import { ListingCopyButton } from '@/components/disclosure/listing-copy-button';
```

- [ ] **Step 4: Render the button alongside Download/Share**

In the result-step JSX, place `<ListingCopyButton />` adjacent to the existing Download and Share Export buttons, inside the same flex/grid container. Match the visual rhythm — same gap, same row.

For example, if the existing markup is:

```tsx
<div className="flex items-center gap-3">
  <a href={downloadHref} className="...">Download</a>
  <ShareExportButton ... />
</div>
```

Change to:

```tsx
<div className="flex items-center gap-3 flex-wrap">
  <a href={downloadHref} className="...">Download</a>
  <ShareExportButton ... />
  <ListingCopyButton />
</div>
```

`flex-wrap` ensures the third button doesn't push the row past the viewport on small screens.

- [ ] **Step 5: Smoke test**

Run dev server. Stage an image. On the result screen:
- See three buttons: Download / Share / Listing copy
- Click Listing copy → navigates to `/dashboard/listing-copy`
- Resize to mobile (375px) → buttons wrap cleanly, no overflow

- [ ] **Step 6: Commit**

```bash
git add src/app/stage/page.tsx src/components/disclosure/listing-copy-button.tsx
git commit -m "feat(stage): add Listing copy button to result screen"
```

---

# PR 3 — Onboarding compliance screen

## Task 3.1: Build the DisclosurePerksScreen component

**Files:**
- Create: `src/components/onboarding/disclosure-perks-screen.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/onboarding/disclosure-perks-screen.tsx`:

```tsx
'use client';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Eyebrow } from './eyebrow';
import { OnboardingCta } from './onboarding-cta';
import { OnboardingShell } from './onboarding-shell';

const EXPO = [0.16, 1, 0.3, 1] as const;

interface Props {
  onContinue: () => void;
  onBack?: () => void;
}

export function DisclosurePerksScreen({ onContinue }: Props) {
  return (
    <OnboardingShell
      cta={<OnboardingCta label="Continue" onClick={onContinue} delay={1.2} />}
    >
      <div className="w-full max-w-xl lg:max-w-2xl flex flex-col h-full justify-between gap-6 sm:gap-8">

        {/* Section 1 — intro */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EXPO }}
          >
            <Eyebrow>One last perk</Eyebrow>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.95, ease: EXPO, delay: 0.2 }}
            className="mt-6 sm:mt-8 font-heading text-brand-navy text-[40px] sm:text-[56px] lg:text-[80px] leading-[0.98] tracking-[-0.025em]"
          >
            Disclosure,
            <br />
            <span className="italic text-brand-teal">handled.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EXPO, delay: 0.45 }}
            className="mt-5 sm:mt-7 text-[15px] sm:text-[18px] lg:text-[20px] text-brand-navy/70 leading-relaxed"
          >
            Two small things we take care of for you, every time.
          </motion.p>
        </div>

        {/* Section 2 — perks */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EXPO, delay: 0.65 }}
          className="rounded-2xl bg-white border border-brand-navy/8 px-5 sm:px-6 shadow-[0_1px_2px_rgba(15,29,46,0.03)]"
        >
          <Perk
            title='"Virtually Staged · AI" label'
            sub="A small mark in the corner of every image."
          />
          <div className="border-t border-brand-navy/6" />
          <Perk
            title="Ready-to-paste listing copy"
            sub="In the app whenever you need it."
          />
        </motion.div>

        {/* Section 3 — footer note (CTA is in OnboardingShell) */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, ease: EXPO, delay: 1.1 }}
          className="text-center text-[12px] sm:text-[13px] text-brand-navy/50"
        >
          Find it any time under{' '}
          <span className="text-brand-teal font-medium">Listing copy</span>
        </motion.p>
      </div>
    </OnboardingShell>
  );
}

function Perk({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex items-start gap-3.5 py-4 sm:py-5">
      <span className="size-7 sm:size-8 rounded-full bg-brand-teal text-white flex items-center justify-center shadow-[0_2px_8px_rgba(35,165,148,0.25)] shrink-0 mt-0.5">
        <Check className="size-3.5 sm:size-4" strokeWidth={3} />
      </span>
      <div>
        <div className="text-[15px] sm:text-[16px] font-semibold text-brand-navy leading-snug">
          {title}
        </div>
        <div className="text-[13px] sm:text-[14px] text-brand-navy/55 mt-0.5">{sub}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

```bash
npm run type-check && npm run lint
```

Expected: clean. If `OnboardingCta` does not accept a `delay` prop, drop the `delay={1.2}` argument.

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/disclosure-perks-screen.tsx
git commit -m "feat(onboarding): DisclosurePerksScreen component"
```

---

## Task 3.2: Wire the new step into the onboarding flow

**Files:**
- Modify: `src/app/onboarding/onboarding-flow.tsx`

- [ ] **Step 1: Add 'disclosure-perks' to the OnboardingStep type**

In `src/app/onboarding/onboarding-flow.tsx`, find the `OnboardingStep` union (around line 38-53) and add `'disclosure-perks'` between `'result'` and `'fact-ai'`:

```ts
export type OnboardingStep =
  | 'welcome'
  | 'role'
  | 'listing-type'
  | 'commercial'
  | 'volume'
  | 'bombshell'
  | 'bridge'
  | 'how-it-works'
  | 'upload'
  | 'rooms'
  | 'style'
  | 'generating'
  | 'result'
  | 'disclosure-perks'  // ← NEW
  | 'fact-ai'
  | 'fact-credit';
```

- [ ] **Step 2: Add the import**

Near the other onboarding-screen imports (around line 13-25):

```ts
import { DisclosurePerksScreen } from '@/components/onboarding/disclosure-perks-screen';
```

- [ ] **Step 3: Render the new step**

In the JSX where the steps are rendered (around line 405), find the `result` step block. Update the result step's `onContinue` to go to `disclosure-perks` instead of `fact-ai`:

```tsx
{step === 'result' && stagedUrl && originalUrl && (
  <OnboardingShell
    cta={<OnboardingCta label="Continue" onClick={() => setStep('disclosure-perks')} />}
  >
    {/* ... existing result content ... */}
  </OnboardingShell>
)}
```

Then add the new step block between the result and fact-ai blocks:

```tsx
{step === 'disclosure-perks' && (
  <DisclosurePerksScreen
    onContinue={() => setStep('fact-ai')}
    onBack={() => setStep('result')}
  />
)}
```

Leave fact-ai and fact-credit blocks unchanged — they still chain through to dashboard.

- [ ] **Step 4: Type-check passes**

```bash
npm run type-check
```

Expected: clean. The exhaustive `OnboardingStep` union should now include the new step everywhere it's referenced.

- [ ] **Step 5: Commit**

```bash
git add src/app/onboarding/onboarding-flow.tsx
git commit -m "feat(onboarding): wire DisclosurePerksScreen between result and fact-ai"
```

---

## Task 3.3: Update the progress bar STEP_ORDER

**Files:**
- Modify: `src/components/onboarding/onboarding-progress-bar.tsx`

- [ ] **Step 1: Insert 'disclosure-perks' into STEP_ORDER**

In `src/components/onboarding/onboarding-progress-bar.tsx` (line 6-22), add the step between `'result'` and `'fact-ai'`:

```ts
const STEP_ORDER: OnboardingStep[] = [
  'welcome',
  'role',
  'listing-type',
  'commercial',
  'volume',
  'bombshell',
  'bridge',
  'how-it-works',
  'upload',
  'rooms',
  'style',
  'generating',
  'result',
  'disclosure-perks',  // ← NEW
  'fact-ai',
  'fact-credit',
];
```

- [ ] **Step 2: Decide whether disclosure-perks should hide the progress bar**

The current `CEREMONY_STEPS` set hides the progress bar during `'generating'` and `'result'`. The disclosure-perks screen is post-result educational — leave the progress bar visible (consistent with `fact-ai` and `fact-credit`). No change to `CEREMONY_STEPS`.

- [ ] **Step 3: Type-check passes**

```bash
npm run type-check
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding/onboarding-progress-bar.tsx
git commit -m "feat(onboarding): include disclosure-perks in progress bar"
```

---

## Task 3.4: Verify layout across viewports (the key visual gate)

**Files:** None changed — verification only.

- [ ] **Step 1: Run dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open Chrome DevTools Device Toolbar**

Hit Cmd/Ctrl+Shift+M, select iPhone SE (375 × 667) profile.

- [ ] **Step 3: Navigate to disclosure-perks**

Sign up as a new test user (or impersonate one), proceed through onboarding to the result step, then click Continue to land on disclosure-perks.

- [ ] **Step 4: Visual checks on iPhone SE (375 × 667)**

- [ ] Eyebrow + headline visible at top, not crammed
- [ ] Both perks visible without scrolling — no clipping at the bottom
- [ ] CTA button visible and tappable above the safe-area
- [ ] Footer note visible above the CTA
- [ ] No top-clumping (the design that section 5 of the spec explicitly forbids)
- [ ] Animation runs smoothly on first mount

- [ ] **Step 5: Visual checks on iPhone 14 Pro Max (430 × 932)**

Same checks. Generous spacing — content should breathe, not cluster.

- [ ] **Step 6: Visual checks on iPad Mini (768 × 1024)**

Same checks. Type sizes step up; content centred. CTA still pinned to bottom.

- [ ] **Step 7: Visual checks on desktop (1440 × 900 — the typical browser dev viewport)**

Same checks. `OnboardingShell`'s max-w-xl/2xl caps the content width — no awkward stretching.

- [ ] **Step 8: Browser-back from disclosure-perks → result still works**

Use the browser back button (or any back affordance the OnboardingShell exposes). Verify navigation goes back to the result step. The result image should still be there (state preserved).

- [ ] **Step 9: Forward from disclosure-perks → fact-ai chain still works**

Click Continue on disclosure-perks. Land on fact-ai. Click Continue. Land on fact-credit. Click Continue. Land on `/dashboard`.

- [ ] **Step 10: If anything fails, fix inline and re-verify**

Common issues:
- Top-clumping: ensure the outermost div uses `flex flex-col h-full justify-between` (the implementation's `justify-between` distribution)
- Headline too large on small phones: drop the `lg:` breakpoint values down a tier (e.g., `lg:text-[80px]` → `lg:text-[64px]`)
- CTA hidden by safe-area: trust `OnboardingShell`'s built-in safe-area padding; do not override it

- [ ] **Step 11: No-op commit if no changes were needed**

If you had to make any visual fixes, commit them:

```bash
git add src/components/onboarding/disclosure-perks-screen.tsx
git commit -m "fix(onboarding): adjust disclosure-perks for [breakpoint]"
```

Otherwise skip.

---

# PR 4 — ToS clauses (HOLD UNTIL LAWYER REVIEW)

> **⚠️ DO NOT MERGE PR 4 BEFORE AUSTRALIAN LAWYER SIGN-OFF.** This PR's tasks build the surface; the merge to live is gated on legal review.

## Task 4.1: Add tosAcceptedVersion to User type

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add the field to the User interface**

In `src/types/index.ts`, find the `User` interface (around line 171-189) and add `tosAcceptedVersion?: string;` after `lastBonusStageCount?`:

```ts
export interface User extends BaseEntity {
  id: string;
  email: string;
  name: string;
  plan: Plan;
  // ... existing fields ...
  lastBonusStageCount?: number;
  tosAcceptedVersion?: string;  // ← NEW (e.g. "2026-04-26")
}
```

- [ ] **Step 2: Add the current ToS version constant**

At the top of `src/types/index.ts` (or in a new `src/lib/legal/version.ts`), export:

```ts
export const TOS_CURRENT_VERSION = '2026-04-26';
```

The version string is a date — bump it whenever clauses change.

- [ ] **Step 3: Type-check passes**

```bash
npm run type-check
```

Expected: clean (the field is optional, no migrations triggered).

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(legal): add tosAcceptedVersion to User"
```

---

## Task 4.2: Build the ToS page

**Files:**
- Create: `src/app/legal/terms/page.tsx`

- [ ] **Step 1: Implement the page with the five draft clauses**

Create `src/app/legal/terms/page.tsx`:

```tsx
import { TOS_CURRENT_VERSION } from '@/types';

export const metadata = {
  title: 'Terms of Service · StageRight',
};

export default function TermsPage() {
  return (
    <div className="min-h-[100dvh] bg-surface-secondary">
      <main className="mx-auto max-w-2xl px-6 sm:px-8 py-12 sm:py-16 flex flex-col gap-8">
        <header>
          <span className="text-[11px] font-semibold tracking-[0.18em] uppercase text-brand-teal">
            Legal
          </span>
          <h1 className="mt-3 font-heading text-brand-navy text-[40px] sm:text-[52px] leading-[0.98] tracking-[-0.025em]">
            Terms of Service
          </h1>
          <p className="mt-4 text-[13px] text-brand-navy/55">
            Effective {TOS_CURRENT_VERSION}.
          </p>
        </header>

        <article className="prose prose-sm sm:prose-base max-w-none text-brand-navy/85 leading-relaxed">
          <section>
            <h2 className="font-heading text-brand-navy text-[24px] mt-0">1. Disclosure responsibility</h2>
            <p>
              You acknowledge that disclosure of virtually-staged or AI-generated imagery to
              prospective purchasers, tenants, real-estate platforms, MLS, and regulators is your
              sole responsibility. StageRight provides watermarking, provenance metadata, and
              suggested disclosure wording as tools; you are responsible for ensuring such
              disclosures comply with applicable laws and platform rules in every jurisdiction in
              which you publish the imagery.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-brand-navy text-[24px]">2. No removal of provenance markers</h2>
            <p>
              You must not remove, alter, crop, obscure, or otherwise compromise any watermark,
              content credentials, signed metadata, or provenance information applied by StageRight
              to generated images. Any image so altered is no longer authorised for use under these
              Terms.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-brand-navy text-[24px]">3. Indemnity</h2>
            <p>
              You indemnify StageRight, its directors, employees and affiliates against all claims,
              losses, damages, fines, and costs (including reasonable legal fees) arising from:
              (a) your failure to disclose the AI-generated nature of imagery; (b) your removal or
              alteration of provenance markers contrary to clause 2; or (c) your use of imagery in
              a manner that misrepresents the actual condition of a property.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-brand-navy text-[24px]">4. No legal advice</h2>
            <p>
              Any disclosure wording, jurisdiction guidance, or platform-rule summary provided by
              StageRight (including in-app, in onboarding, and at <code>/dashboard/listing-copy</code>)
              is provided for your convenience only and does not constitute legal advice. You should
              obtain independent legal advice for your jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-brand-navy text-[24px]">5. EU-specific obligations</h2>
            <p>
              Where you publish imagery to consumers in the European Union, you acknowledge separate
              disclosure obligations as a deployer of an AI system under Article 50 of Regulation
              (EU) 2024/1689 (EU AI Act), and are responsible for compliance with those obligations
              regardless of any features or wording provided by StageRight.
            </p>
          </section>

          <p className="text-[12px] text-brand-navy/50 italic mt-12">
            These Terms are provided in plain language for clarity. They are part of the binding
            agreement between you and StageRight.
          </p>
        </article>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

```bash
npm run type-check && npm run lint
```

Expected: clean.

- [ ] **Step 3: Smoke test**

Visit `http://localhost:3000/legal/terms`. Expected:
- Page renders with header, effective date, five sections
- Layout matches existing dashboard chrome (cream surface, DM Serif headlines, brand teal accents)

- [ ] **Step 4: Commit**

```bash
git add src/app/legal/terms/page.tsx
git commit -m "feat(legal): ToS page with five draft clauses"
```

---

## Task 4.3: Build the ToS acceptance banner

**Files:**
- Create: `src/components/legal/tos-acceptance-banner.tsx`
- Create: `src/app/api/legal/accept-tos/route.ts`

- [ ] **Step 1: Implement the banner component**

Create `src/components/legal/tos-acceptance-banner.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  /** TOS_CURRENT_VERSION — passed in from the server */
  currentVersion: string;
}

export function TosAcceptanceBanner({ currentVersion }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onAccept = async () => {
    setSubmitting(true);
    try {
      const r = await fetch('/api/legal/accept-tos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: currentVersion }),
      });
      if (r.ok) setDismissed(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -8, opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-2xl bg-brand-teal/[0.08] border border-brand-teal/25 px-5 py-4 flex flex-wrap items-center gap-3 text-[14px]"
        >
          <span className="flex-1 min-w-[260px] text-brand-navy/85 leading-relaxed">
            We&apos;ve updated our{' '}
            <Link href="/legal/terms" className="text-brand-teal underline hover:no-underline">
              Terms of Service
            </Link>
            . Have a quick read and accept to continue.
          </span>
          <button
            type="button"
            onClick={onAccept}
            disabled={submitting}
            className="rounded-full bg-brand-navy text-white px-5 py-2 text-[13px] font-medium disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'I accept'}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Implement the accept-tos API route**

Create `src/app/api/legal/accept-tos/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { dynamodb, TABLE_NAME } from '@/lib/aws/dynamodb';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { TOS_CURRENT_VERSION } from '@/types';

export const dynamic = 'force-dynamic';

const schema = z.object({ version: z.string() });

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success || parsed.data.version !== TOS_CURRENT_VERSION) {
    return NextResponse.json({ error: 'invalid version' }, { status: 400 });
  }

  await dynamodb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${session.user.id}`, sk: 'PROFILE' },
    UpdateExpression: 'SET tosAcceptedVersion = :v, updatedAt = :now',
    ExpressionAttributeValues: {
      ':v': TOS_CURRENT_VERSION,
      ':now': new Date().toISOString(),
    },
  }));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Type-check passes**

```bash
npm run type-check
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/legal/tos-acceptance-banner.tsx src/app/api/legal/accept-tos/route.ts
git commit -m "feat(legal): ToS acceptance banner + accept-tos API route"
```

---

## Task 4.4: Wire the banner into the dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx` (or the dashboard layout — locate during execution)

- [ ] **Step 1: Find the dashboard entry point**

```bash
ls src/app/dashboard/
```

If there's a `layout.tsx`, that's the place. Otherwise modify `page.tsx`.

- [ ] **Step 2: Conditionally render the banner**

In the dashboard server component, add:

```tsx
import { getSession } from '@/lib/auth/session';
import { TosAcceptanceBanner } from '@/components/legal/tos-acceptance-banner';
import { TOS_CURRENT_VERSION } from '@/types';

// inside the server component, after fetching the user:
const session = await getSession();
const needsAcceptance =
  session && session.user.tosAcceptedVersion !== TOS_CURRENT_VERSION;

return (
  <>
    {needsAcceptance && (
      <div className="px-6 sm:px-8 pt-6">
        <TosAcceptanceBanner currentVersion={TOS_CURRENT_VERSION} />
      </div>
    )}
    {/* ... rest of dashboard ... */}
  </>
);
```

If `session.user` doesn't include `tosAcceptedVersion` from the session object, fetch the User record from DDB at the top of the dashboard page and use that.

- [ ] **Step 3: Smoke test**

- Log in as an existing test user with no `tosAcceptedVersion` field set
- Visit `/dashboard` → banner should appear at the top
- Click "I accept" → banner dismisses, network tab shows POST `/api/legal/accept-tos` 200
- Refresh the page → banner does NOT reappear (acceptance persisted)

- [ ] **Step 4: Commit**

```bash
git add <the modified dashboard file>
git commit -m "feat(legal): show ToS acceptance banner on dashboard for existing users"
```

---

## Task 4.5: Open PR4 with [blocked-on-legal] label

**Files:** None changed.

- [ ] **Step 1: Push the PR4 branch**

```bash
git push -u origin <pr4-branch-name>
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat(legal): ToS clauses + acceptance banner [BLOCKED ON LEGAL REVIEW]" --body "$(cat <<'EOF'
## Summary

Ships the five ToS clauses + acceptance banner per the watermark+disclosure spec.

**Do NOT merge until reviewed by an Australian commercial lawyer.**

The clauses cover:
1. User responsibility for disclosure
2. No removal of provenance markers
3. Indemnity
4. No legal advice
5. EU-specific obligations (AI Act Art. 50)

## What the lawyer should specifically check

- Whether the AU ACL "unfair contract terms" regime treats the indemnity as void (B2B context — likely not, but verify)
- Whether clause 2 needs an explicit authorisation-revocation mechanism
- Whether clause 5 should also reference UK CPRs and US state-level rules
- Whether the ToS needs re-presentation to every existing user, or only post-cutoff

## Test plan
- [ ] Visit /legal/terms — page renders all five clauses
- [ ] Login as user with no tosAcceptedVersion → banner shows on dashboard
- [ ] Click "I accept" → banner dismisses, DDB record updated
- [ ] Refresh → banner does not return
- [ ] New user signup flow still works (does not break by missing acceptance)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Add the blocking label**

```bash
gh pr edit <pr-number> --add-label blocked-on-legal
```

(If the label doesn't exist yet: `gh label create blocked-on-legal --description "Cannot merge — awaiting legal review" --color B60205`)

- [ ] **Step 4: Notify the lawyer**

Email or chat the lawyer the PR URL with the four "what to specifically check" items from the spec/PR body.

PR4 sits open until cleared.

---

# Final verification (before declaring all four PRs done)

- [ ] **All 9 tasks in PR1 complete + Lambda redeployed + smoke tests pass**
- [ ] **All 7 tasks in PR2 complete + dev-server smoke tests pass**
- [ ] **All 4 tasks in PR3 complete + viewport-checks pass on 4 device sizes**
- [ ] **All 5 tasks in PR4 complete + PR open + lawyer notified**
- [ ] Run `npm run build` end-to-end — no errors
- [ ] Update `CLAUDE.md` "Current Staging Pipeline" section to reflect that watermarking is now part of the pipeline (one-line addition under step 7: "Apply watermark via Sharp + SVG pill (skipped for admin and admin/compare)")

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): note watermark step in staging pipeline"
```

---

# Appendix — Open questions resolved during planning

- **Q1 (existing terms page)**: VERIFIED ABSENT during spec drafting. PR4 scaffolds from scratch.
- **Q2 (dashboard menu structure)**: Resolved at execution time in Task 2.6 — implementer greps for existing menu pattern and matches it.
- **Q3 (result-screen button placement)**: Resolved in Task 2.7 — third button in the existing flex row, with `flex-wrap` for mobile.
- **Q4 (progress bar step count)**: Resolved in Task 3.3 — insert into `STEP_ORDER`. The percent calc auto-updates.
- **Q5 (acceptance banner UX)**: Resolved as a soft inline banner on the dashboard top (Task 4.3), not a modal. Single-tap accept, dismisses on success.
