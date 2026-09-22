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
 * The run keeps a real date rather than "Y1, day 37". A year is 90 sim-days split into
 * twelve months, the space opens its doors in **January 2026**, and the awards are held
 * every **October** the way a real scene's would be — which also means the first ceremony
 * arrives two months before the year is out, instead of landing on New Year's Eve.
 */
export const CALENDAR = {
  startYear: 2026,
  daysPerYear: 90,
  /** 1-12. The awards are in October, so the award year runs October to October. */
  awardsMonth: 10,
};

const DAYS_PER_MONTH = CALENDAR.daysPerYear / 12;

/** Day 1 is 1 January 2026. */
export function gameDate(day: number): { year: number; month: number; dayOfMonth: number } {
  const index = Math.max(0, day - 1);
  const year = CALENDAR.startYear + Math.floor(index / CALENDAR.daysPerYear);
  const dayOfYear = index % CALENDAR.daysPerYear;
  const month = Math.min(11, Math.floor(dayOfYear / DAYS_PER_MONTH));
  const dayOfMonth = Math.floor(dayOfYear - month * DAYS_PER_MONTH) + 1;
  return { year, month: month + 1, dayOfMonth };
}

export function monthName(month: number): string {
  return localeData().months[Math.min(11, Math.max(0, month - 1))];
}

/** "12 Mar 2026" — short enough for the top bar. */
export function shortDate(day: number): string {
  const d = gameDate(day);
  return `${d.dayOfMonth} ${monthName(d.month).slice(0, 3)} ${d.year}`;
}

/** The first day of the awards month in the calendar year that `day` falls in. */
export function awardsDay(day: number): number {
  const d = gameDate(day);
  const yearStartDay = (d.year - CALENDAR.startYear) * CALENDAR.daysPerYear + 1;
  return yearStartDay + Math.round((CALENDAR.awardsMonth - 1) * DAYS_PER_MONTH);
}
