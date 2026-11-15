// Builds the Segno Cue icon/splash sources in this folder (SVG + PNG).
// Then run `npx capacitor-assets generate --ios --android ...` (see README)
// to produce every platform size.
//
//   node assets/build-icons.mjs
//
// The segno geometry must match SegnoMark in src/components/Brand.tsx.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));

// --- the segno (𝄋), in a 32×32 box -------------------------------------
// A leaning, rounded S (not an upright letter S, which with a line through
// it reads as "$"), a long shallow slash, and a dot either side.
export const S_PATH =
  'M24.6 10.2C25.4 6.4 20.6 4.4 16.8 4.6 12.6 4.8 10.4 7.8 11.6 10.6 12.8 13.4 17.2 14.6 19.6 16.2 22.4 18 22.6 21.6 20.6 23.6 18.6 25.6 13.2 26.2 10.2 24.2 8.6 23 7.8 22.2 7.4 21.6';
export const S_TRANSFORM =
  'translate(16 16) rotate(-10) scale(1.14 0.85) translate(-16 -16)';
export const SLASH = 'M4 25.5 28 6.5';
export const DOTS = [
  [3.4, 14.6],
  [28.6, 17.4],
];

const amber = `<linearGradient id="amber" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fde68a"/><stop offset="0.45" stop-color="#fbbf24"/><stop offset="1" stop-color="#f59e0b"/>
    </linearGradient>`;
const navy = `<radialGradient id="bg" cx="50%" cy="38%" r="75%">
      <stop offset="0" stop-color="#22305a"/><stop offset="0.55" stop-color="#111a33"/><stop offset="1" stop-color="#0a0f1f"/>
    </radialGradient>`;

const sign = (size, k) => {
  const o = size / 2 - 16 * k;
  const dots = DOTS.map(
    ([x, y]) => `<circle cx="${x}" cy="${y}" r="2.3" fill="url(#amber)" stroke="none"/>`
  ).join('\n    ');
  return `<g transform="translate(${o} ${o}) scale(${k})" fill="none" stroke="url(#amber)" stroke-linecap="round">
    <path d="${S_PATH}" transform="${S_TRANSFORM}" stroke-width="2.6"/>
    <path d="${SLASH}" stroke-width="1.8"/>
    ${dots}
  </g>`;
};

// Five faint staff lines behind the sign.
const staff = (size, gap) =>
  [0, 1, 2, 3, 4]
    .map((i) => {
      const y = size / 2 + (i - 2) * gap;
      return `<line x1="0" y1="${y}" x2="${size}" y2="${y}" stroke="#94a3b8" stroke-opacity="0.13" stroke-width="${size / 256}"/>`;
    })
    .join('\n  ');

const svg = (size, defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    ${defs}
  </defs>
  ${body}
</svg>
`;

const files = {
  // iOS + legacy Android icon: full-bleed art.
  'icon-only': svg(1024, `${navy}\n    ${amber}`,
    `<rect width="1024" height="1024" fill="url(#bg)"/>\n  ${staff(1024, 96)}\n  ${sign(1024, 22)}`),
  // Android adaptive icon layers (the generator insets both to the visible area).
  'icon-background': svg(1024, navy,
    `<rect width="1024" height="1024" fill="url(#bg)"/>\n  ${staff(1024, 96)}`),
  'icon-foreground': svg(1024, amber, sign(1024, 22)),
  // Launch screen: flat app background so it blends into the first frame.
  splash: svg(2732, amber, `<rect width="2732" height="2732" fill="#0f172a"/>\n  ${sign(2732, 19)}`),
};

for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(here, `${name}.svg`), content);
  await sharp(Buffer.from(content)).png().toFile(join(here, `${name}.png`));
}
await sharp(join(here, 'splash.png')).toFile(join(here, 'splash-dark.png'));
for (const size of [192, 512]) {
  await sharp(join(here, 'icon-only.png'))
    .resize(size)
    .toFile(join(here, '..', 'public', `icon-${size}.png`));
}
console.log('Built icon sources in assets/ and PWA icons in public/.');
