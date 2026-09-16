// Generate the square favicon set from the brand logo (SEO audit T-14, 14 Sept 2026).
//
// The site linked the 900 x 491 logo.jpg as its icon. Google only shows a favicon
// beside a result when it is square and a multiple of 48 px, and the tab icon was a
// squashed logo. This crops the circular emblem out of site/public/logo.jpg and writes:
//   site/public/favicon.ico        32 x 32  (an ICO container holding one PNG)
//   site/public/icon-192.png      192 x 192 (Google's search-result favicon; 4 x 48)
//   site/public/apple-touch-icon.png 180 x 180
// Run from the repo root: node scripts/make-favicons.mjs
// Uses the sharp that Astro installs under site/node_modules (no new dependency).
// Re-run whenever logo.jpg changes; the outputs are committed so the build needs nothing.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = path.join(root, 'site', 'public');
const sharp = createRequire(path.join(root, 'site', 'package.json'))('sharp');

// The emblem (the gold-ringed circle) sits on the left of the 900 x 491 logo; this
// square holds it with a little of the dark background as margin. Measured by eye
// against the image, re-check if the artwork is ever re-exported.
const EMBLEM = { left: 48, top: 88, width: 314, height: 314 };

const src = path.join(pub, 'logo.jpg');
const meta = await sharp(src).metadata();
if (meta.width !== 900 || meta.height !== 491) {
  throw new Error(`logo.jpg is ${meta.width} x ${meta.height}, not the 900 x 491 the crop box was measured on; re-measure EMBLEM`);
}

async function square(size) {
  return sharp(src).extract(EMBLEM).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: true, colours: 256, dither: 0.6 }).toBuffer();
}

// A minimal ICO: 6-byte header, one 16-byte directory entry, then a PNG payload
// (every current browser reads PNG-in-ICO).
function ico(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0); // width
  entry.writeUInt8(size, 1); // height
  entry.writeUInt8(0, 2); // colour palette: none
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12); // payload offset
  return Buffer.concat([header, entry, png]);
}

fs.writeFileSync(path.join(pub, 'icon-192.png'), await square(192));
fs.writeFileSync(path.join(pub, 'apple-touch-icon.png'), await square(180));
fs.writeFileSync(path.join(pub, 'favicon.ico'), ico(await square(32), 32));
for (const f of ['icon-192.png', 'apple-touch-icon.png', 'favicon.ico']) {
  console.log(f.padEnd(22), fs.statSync(path.join(pub, f)).size, 'bytes');
}
