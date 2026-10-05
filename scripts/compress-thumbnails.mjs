import sharp from 'sharp';
import { readdir, stat, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const [, , roomDir] = process.argv;
if (!roomDir) {
  console.error('Usage: node compress-thumbnails.mjs <roomDir>');
  process.exit(1);
}

const TARGET_WIDTH = 1200;
const QUALITY = 78;

const files = (await readdir(roomDir)).filter((f) => f.endsWith('.jpg'));
for (const file of files) {
  const path = join(roomDir, file);
  const tmp = path + '.tmp';
  const before = (await stat(path)).size;
  await sharp(path)
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true })
    .toFile(tmp);
  await unlink(path);
  await rename(tmp, path);
  const after = (await stat(path)).size;
  console.log(
    `${file.padEnd(32)} ${(before / 1024).toFixed(0).padStart(4)} KB -> ${(after / 1024).toFixed(0).padStart(4)} KB  (-${(100 - (after / before) * 100).toFixed(0)}%)`,
  );
}
