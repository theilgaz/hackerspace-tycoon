import { localeData, num } from '@/i18n/locale';

let counter = 0;
export function uid(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}`;
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

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function dayName(day: number): string {
  return localeData().days[(day - 1) % 7];
}

// --- The calendar (§3c) ------------------------------------------------------

/**
 * The run keeps a real date rather than "Y1, day 37". **A year is 365 days**, with real
 * month lengths and no leap years — the space opens its doors on **1 January 2026**, and
 * the awards are held on **1 December** every year: 1 December 2026, 1 December 2027, and
 * on. A year used to be ninety days with the night in October; a real year makes a date
 * mean something, and December closes the year the way a scene's own awards would.
 */
export const CALENDAR = {
  startYear: 2026,
  daysPerYear: 365,
  /** Month and day of the awards night. */
  awardsMonth: 12,
  awardsDayOfMonth: 1,
};

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Day of the year (0-based) that a month and day fall on. */
function dayOfYearFor(month: number, dayOfMonth: number): number {
  let total = 0;
  for (let m = 0; m < month - 1; m += 1) total += MONTH_DAYS[m];
  return total + dayOfMonth - 1;
}

/** Day 1 is 1 January 2026. */
export function gameDate(day: number): { year: number; month: number; dayOfMonth: number } {
  const index = Math.max(0, day - 1);
  const year = CALENDAR.startYear + Math.floor(index / CALENDAR.daysPerYear);
  let rest = index % CALENDAR.daysPerYear;
  let month = 0;
  while (rest >= MONTH_DAYS[month]) {
    rest -= MONTH_DAYS[month];
    month += 1;
  }
  return { year, month: month + 1, dayOfMonth: rest + 1 };
}

export function monthName(month: number): string {
  return localeData().months[Math.min(11, Math.max(0, month - 1))];
}

/** "12 Mar 2026" — short enough for the top bar. */
export function shortDate(day: number): string {
  const d = gameDate(day);
  return `${d.dayOfMonth} ${monthName(d.month).slice(0, 3)} ${d.year}`;
}

/** The awards night (1 December) of the calendar year that `day` falls in. */
export function awardsDay(day: number): number {
  const d = gameDate(day);
  const yearStartDay = (d.year - CALENDAR.startYear) * CALENDAR.daysPerYear + 1;
  return yearStartDay + dayOfYearFor(CALENDAR.awardsMonth, CALENDAR.awardsDayOfMonth);
}
