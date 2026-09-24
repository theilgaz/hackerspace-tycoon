/**
 * Which language the game speaks right now. Pure module state — no DOM, no storage — so the
 * Simulation can read it headless (CLAUDE.md §11). The browser-side preference lives in
 * `preference.ts`; harnesses never touch it and run in English.
 *
 * `xx` is a pseudo-locale for development: English wrapped in ⟦…⟧, so any string on screen
 * that is *not* bracketed never went through `t()`.
 */
export type Locale = 'en' | 'tr' | 'xx';

export const LOCALES: Locale[] = ['en', 'tr', 'xx'];

interface LocaleData {
  /** What `Intl` should format numbers with. */
  numbers: string;
  /** Monday first, the way `dayName` counts. */
  days: string[];
  months: string[];
  /** Suffix for a quantity of hours: "3.5h" / "3,5 sa". */
  hourUnit: string;
  /** A span in days, as the player reads durations (design §2): half a day at the finest. */
  spanDays: (n: number) => string;
  /** Under half a day. */
  underHalfDay: string;
}

const DATA: Record<Locale, LocaleData> = {
  en: {
    numbers: 'en-GB',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    months: [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ],
    hourUnit: 'h',
    spanDays: (n) => (n === 0.5 ? 'half a day' : `${n % 1 ? n.toLocaleString('en-GB') : n} ${n === 1 ? 'day' : 'days'}`),
    underHalfDay: 'under half a day',
  },
  tr: {
    numbers: 'tr-TR',
    days: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'],
    months: [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
    ],
    hourUnit: ' sa',
    spanDays: (n) => (n === 0.5 ? 'yarım gün' : `${n.toLocaleString('tr-TR')} gün`),
    underHalfDay: 'yarım günden az',
  },
  xx: {
    numbers: 'en-GB',
    days: ['⟦Mon⟧', '⟦Tue⟧', '⟦Wed⟧', '⟦Thu⟧', '⟦Fri⟧', '⟦Sat⟧', '⟦Sun⟧'],
    months: [
      '⟦January⟧', '⟦February⟧', '⟦March⟧', '⟦April⟧', '⟦May⟧', '⟦June⟧',
      '⟦July⟧', '⟦August⟧', '⟦September⟧', '⟦October⟧', '⟦November⟧', '⟦December⟧',
    ],
    hourUnit: 'h',
    spanDays: (n) => `⟦${n} days⟧`,
    underHalfDay: '⟦under half a day⟧',
  },
};

let current: Locale = 'en';

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale) {
  current = locale;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as string[]).includes(value);
}

export function localeData(): LocaleData {
  return DATA[current];
}

/** `7000` → "7,000" or "7.000", by locale. Use this, never a bare `toLocaleString`. */
export function num(value: number, fractionDigits = 0): string {
  return value.toLocaleString(DATA[current].numbers, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** For `toLocaleUpperCase` and friends: Turkish uppercases `i` to `İ`. */
export function caseLocale(): string {
  return current === 'tr' ? 'tr' : 'en';
}
