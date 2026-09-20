import type { ProjectCategory } from '@/game/types';

/**
 * Line icons, in the lucide idiom: 24x24 box, no fill, 1.75 stroke, currentColor.
 * They replace the emoji the wizard used to lean on — emoji render at whatever size and
 * weight the platform feels like, which is exactly why a set of them never looks designed.
 */
const PATHS: Record<string, string> = {
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
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  printer:
    '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/>' +
    '<rect x="6" y="14" width="12" height="7" rx="1"/>',
  package: '<path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5"/><path d="M12 12v10"/>',
  /* A hand glyph was unreadable at badge size; a pulse line survives 11px. */
  effort: '<path d="M22 12h-4l-3 8.5L9 3.5 6 12H2"/>',
  coins: '<circle cx="8" cy="8" r="5.5"/><path d="M15 6.2a5.5 5.5 0 0 1 0 11.6"/><path d="M6.5 8h3"/>',
  flame: '<path d="M12 22a7 7 0 0 0 7-7c0-5-4-6-4-10 0 0-3 1.5-3 5 0-2-2-3-2-3s-1 2-1 4c0 1.5-2 2-2 4a7 7 0 0 0 5 7z"/>',
};

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, className = 'ui-icon'): string {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}

/** One icon per genre, so a category reads the same everywhere it appears. */
export const CATEGORY_ICON: Record<ProjectCategory, IconName> = {
  software: 'code',
  electronics: 'cpu',
  iot: 'wifi',
  radio: 'antenna',
  robotics: 'bot',
  mechanical: 'cog',
  retro: 'gamepad',
  home: 'home',
  tooling: 'wrench',
  civic: 'users',
};
