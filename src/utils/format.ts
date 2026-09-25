import { localeData, num } from '@/i18n/locale';

let counter = 0;
export function uid(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}`;
}

/**
 * Move the counter past every id a loaded save already holds. It is a plain counter that
 * restarts at zero with the page, so after a reload the next build was handed `proj_5` while
 * a saved build still had it — two cards on the bench opened, closed and said "you" together.
 */
export function uidPast(saved: string) {
  for (const match of saved.matchAll(/"[a-z]+_([0-9a-z]+)"/g)) {
    const n = parseInt(match[1], 36);
    if (Number.isFinite(n) && n > counter && n < 1e9) counter = n;
  }
}

export function money(value: number): string {
  return `₺${num(Math.round(value))}`;
}

/** Sim hours → "14:20" style clock within a day. */
export function clock(simHours: number): string {
  const h = Math.floor(simHours % 24);
  const m = Math.floor((simHours % 1) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function hours(value: number): string {
  const unit = localeData().hourUnit;
  return value >= 10 ? `${Math.round(value)}${unit}` : `${num(value, 1)}${unit}`;
}

/**
 * A duration the way the player reads it (design §2): **days, never hours**. Machine time
 * runs round the clock (`perDay` 24); hand work and courses run on the working day (8).
 * Rounded to the half day — "1.5 days" is a plan, "13h" is a spreadsheet.
 */
export function span(hours: number, perDay = 24): string {
  const days = hours / perDay;
  if (days <= 0) return localeData().spanDays(0);
  if (days < 0.25) return localeData().underHalfDay;
  return localeData().spanDays(Math.max(0.5, Math.round(days * 2) / 2));
}

/** Hand work and courses: counted in working days of eight hours. */
export const workSpan = (hours: number): string => span(hours, 8);

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function dayName(day: number): string {
  return localeData().days[(day - 1) % 7];
}

// --- The calendar (§3c) ------------------------------------------------------

/**
 * The run keeps a date. **A year is 100 days**, split across twelve months so a date still
 * reads as one, and the space opens on 1 January 2026. The **awards are held on day 90 of
 * every year** — the first on the ninetieth day of the run, the next on day 190, and so on:
 * late enough that the year has a shape, early enough that a first-time player reaches it.
 *
 * It was 365 days with the night on 1 December for a while; the first awards night then
 * arrived on day 335, which almost nobody would ever play to.
 */
export const CALENDAR = {
  startYear: 2026,
  /**
   * A year is sixty days (CLAUDE.md §3c). It was a hundred, with the night on day 90: at a
   * couple of real minutes a day that put the first awards three and a half hours in and the
   * second past seven — most players would never have seen a second night.
   */
  daysPerYear: 60,
  /** Day of the year (1-based) the awards are held on. */
  awardsOnDay: 55,
};

/** The first day of year-day `index` (0-based) for a month, spreading 100 days over 12. */
const monthStart = (month: number) => Math.ceil((month * CALENDAR.daysPerYear) / 12);

/** Day 1 is 1 January 2026. */
export function gameDate(day: number): { year: number; month: number; dayOfMonth: number } {
  const index = Math.max(0, day - 1);
  const year = CALENDAR.startYear + Math.floor(index / CALENDAR.daysPerYear);
  const rest = index % CALENDAR.daysPerYear;
  let month = 0;
  while (month < 11 && rest >= monthStart(month + 1)) month += 1;
  return { year, month: month + 1, dayOfMonth: rest - monthStart(month) + 1 };
}

export function monthName(month: number): string {
  return localeData().months[Math.min(11, Math.max(0, month - 1))];
}

/** "12 Mar 2026" — short enough for the top bar. */
export function shortDate(day: number): string {
  const d = gameDate(day);
  return `${d.dayOfMonth} ${monthName(d.month).slice(0, 3)} ${d.year}`;
}

/** "12 Mar" — a date inside the year already on screen. */
export function dayMonth(day: number): string {
  const d = gameDate(day);
  return `${d.dayOfMonth} ${monthName(d.month).slice(0, 3)}`;
}

/** The awards night (day 90) of the calendar year that `day` falls in. */
export function awardsDay(day: number): number {
  const d = gameDate(day);
  const yearStartDay = (d.year - CALENDAR.startYear) * CALENDAR.daysPerYear + 1;
  return yearStartDay + CALENDAR.awardsOnDay - 1;
}
