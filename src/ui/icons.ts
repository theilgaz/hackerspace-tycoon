import type { ProjectCategory } from '@/game/types';

/**
 * Line icons, in the lucide idiom: 24x24 box, no fill, 1.75 stroke, currentColor.
 * They replace the emoji the wizard used to lean on — emoji render at whatever size and
 * weight the platform feels like, which is exactly why a set of them never looks designed.
 */
/**
 * **Not annotated `Record<string, string>` on purpose.** It was, and that made
 * `IconName = keyof typeof PATHS` mean `string` — so `icon('tooling')` typechecked, drew
 * `<svg>undefined</svg>`, and put an empty box on the leaderboard. `satisfies` keeps the
 * shape check without throwing the literal keys away.
 */
const PATHS = {
  globe:
    '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/>' +
    '<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  cpu:
    '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/>' +
    '<path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>',
  wifi:
    '<path d="M5 12.6a10 10 0 0 1 14 0"/><path d="M1.5 9.1a15 15 0 0 1 21 0"/>' +
    '<path d="M8.5 16.1a5 5 0 0 1 7 0"/><path d="M12 20h.01"/>',
  antenna:
    '<path d="M4.9 19.1a10 10 0 0 1 0-14.2"/><path d="M7.8 16.2a6 6 0 0 1 0-8.4"/>' +
    '<path d="M16.2 7.8a6 6 0 0 1 0 8.4"/><path d="M19.1 4.9a10 10 0 0 1 0 14.2"/>' +
    '<circle cx="12" cy="12" r="2"/>',
  bot:
    '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M12 8V5.5"/>' +
    '<circle cx="12" cy="4" r="1.4"/><path d="M8.5 13v2M15.5 13v2"/><path d="M1 13v2M23 13v2"/>',
  cog:
    '<circle cx="12" cy="12" r="3.1"/>' +
    '<circle cx="12" cy="12" r="7.4" stroke-dasharray="2.6 2.3"/>',
  gamepad:
    '<rect x="2" y="7" width="20" height="10" rx="4"/><path d="M6 12h3M7.5 10.5v3"/>' +
    '<path d="M15.5 11h.01M18 13.5h.01"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.3V21h13V9.3"/><path d="M10 21v-6h4v6"/>',
  wrench:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' +
    '<path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  mail: '<rect x="2" y="4.5" width="20" height="15" rx="2"/><path d="m22 7.5-10 6-10-6"/>',
  clipboard:
    '<rect x="8" y="2" width="8" height="4" rx="1"/>' +
    '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>' +
    '<path d="M9 12h6M9 16h4"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trophy:
    '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/>' +
    '<path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/>' +
    '<path d="M10 14h4v3h-4zM8 20h8"/><path d="M12 17v3"/>',
  /* A plain arrow survives 11px where a stylised upvote chevron turns to mush. */
  arrowUp: '<path d="M12 20V5"/><path d="m5.5 11.5 6.5-6.5 6.5 6.5"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  printer:
    '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/>' +
    '<rect x="6" y="14" width="12" height="7" rx="1"/>',
  package: '<path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5"/><path d="M12 12v10"/>',
  /* A hand glyph was unreadable at badge size; a pulse line survives 11px. */
  effort: '<path d="M22 12h-4l-3 8.5L9 3.5 6 12H2"/>',
  coins: '<circle cx="8" cy="8" r="5.5"/><path d="M15 6.2a5.5 5.5 0 0 1 0 11.6"/><path d="M6.5 8h3"/>',
  flame: '<path d="M12 22a7 7 0 0 0 7-7c0-5-4-6-4-10 0 0-3 1.5-3 5 0-2-2-3-2-3s-1 2-1 4c0 1.5-2 2-2 4a7 7 0 0 0 5 7z"/>',
  building:
    '<rect x="4" y="3" width="16" height="18" rx="1.5"/>' +
    '<path d="M8.5 7h2M13.5 7h2M8.5 11h2M13.5 11h2M8.5 15h2M13.5 15h2"/>' +
    '<path d="M10 21v-2.5h4V21"/>',
  lightbulb:
    '<path d="M9.5 18h5"/><path d="M10.5 21h3"/>' +
    '<path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .9 1.6l.1.6h5.2l.1-.6c.1-.6.4-1.2.9-1.6A6 6 0 0 0 12 3z"/>',
  /* Crossing arrows: one run clear, the other broken where it passes under. */
  shuffle:
    '<path d="M3 21 21 3"/><path d="M16 3h5v5"/>' +
    '<path d="M3 3 9 9"/><path d="M15 15 21 21"/><path d="M16 21h5v-5"/>',
  leaf:
    '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/>' +
    '<path d="M2 21c0-3 1.9-5.4 5.2-6"/>',
  book:
    '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/>' +
    '<path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  hammer:
    '<path d="m15 12-8.4 8.4a2.1 2.1 0 1 1-3-3L12 9"/><path d="M17.6 15 22 10.6"/>' +
    '<path d="m20.9 11.7-1.3-1.3a2 2 0 0 1-.6-1.4V7.9l-2.4-2.4a6 6 0 0 0-4.3-1.8H9l.9.9a6.5 6.5 0 0 1 1.9 4.6v1.4l2 2h1.2c.5 0 1 .2 1.4.6l1.3 1.3"/>',
  star:
    '<path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/>',
  sparkles:
    '<path d="M9.9 3.5 11 7.3a2 2 0 0 0 1.3 1.3l3.8 1.1-3.8 1.1a2 2 0 0 0-1.3 1.3L9.9 16l-1.1-3.8a2 2 0 0 0-1.3-1.3L3.7 9.8l3.8-1.1a2 2 0 0 0 1.3-1.3z"/>' +
    '<path d="M19 3v4M17 5h4M18 16v3M16.5 17.5h3"/>',
  table:
    '<rect x="3" y="7" width="18" height="5" rx="1"/><path d="M6 12v7M18 12v7"/>' +
    '<path d="M3 4h4M17 4h4"/>',
  trendUp: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  trendDown: '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
  dish:
    '<circle cx="12" cy="12" r="8.5"/><path d="M12 12 18.2 5.8"/>' +
    '<path d="M7.6 12A4.4 4.4 0 0 1 12 7.6"/>',
  // --- Badges for the start screen: things a hackerspace would paint on its door ---
  terminal: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m7 11 2-2-2-2"/><path d="M11 13h4"/>',
  zap:
    '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 ' +
    '.78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  rocket:
    '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>' +
    '<path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>' +
    '<path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  bug:
    '<path d="m8 2 1.88 1.88M14.12 3.88 16 2"/><path d="M9 7.13v-1a3 3 0 1 1 6 0v1"/>' +
    '<path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/>' +
    '<path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4"/>' +
    '<path d="M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
  flask:
    '<path d="M10 2v7.53a2 2 0 0 1-.21.9L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.07-10.12' +
    'A2 2 0 0 1 14 9.53V2"/><path d="M8.5 2h7M7 16h10"/>',
  atom:
    '<circle cx="12" cy="12" r="1"/>' +
    '<path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5-2.04 2.03-.02 7.36 4.5 11.9 ' +
    '4.54 4.52 9.87 6.54 11.9 4.5Z"/>' +
    '<path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5-4.52 4.54-6.54 9.87-4.5 ' +
    '11.9 2.03 2.04 7.36.02 11.9-4.5Z"/>',
  magnet:
    '<path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15"/>' +
    '<path d="m5 8 4 4M12 15l4 4"/>',
  // The hacker emblem: Conway's glider, five cells of a three-by-three. Drawn as outlined
  // squares, not filled, because a data-URL copy for the wall sign has no currentColor fill.
  glider:
    '<rect x="9.5" y="3.5" width="5" height="5" rx=".8"/><rect x="15.5" y="9.5" width="5" height="5" rx=".8"/>' +
    '<rect x="3.5" y="15.5" width="5" height="5" rx=".8"/><rect x="9.5" y="15.5" width="5" height="5" rx=".8"/>' +
    '<rect x="15.5" y="15.5" width="5" height="5" rx=".8"/>',
} satisfies Record<string, string>;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, className = 'ui-icon'): string {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}

/**
 * The same glyph as a standalone SVG document, for the places a stylesheet cannot reach —
 * `icon()` leans on `.ui-icon` for its size and stroke width, and a canvas drawing an
 * `<img>` has no stylesheet at all. `currentColor` is resolved here for the same reason.
 */
export function iconDataUrl(name: IconName, colour: string, size = 128, stroke = 1.75): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${colour}" stroke-width="${stroke}" stroke-linecap="round" ` +
    `stroke-linejoin="round">${PATHS[name]}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** One icon per genre, so a category reads the same everywhere it appears. */
export const CATEGORY_ICON: Record<ProjectCategory, IconName> = {
  software: 'code',
  electronics: 'cpu',
  comms: 'antenna',
  mechanical: 'cog',
};
