let counter = 0;
export function uid(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${counter.toString(36)}`;
}

export function money(value: number): string {
  return `₺${Math.round(value).toLocaleString('tr-TR')}`;
}

/** Sim hours → "14:20" style clock within a day. */
export function clock(simHours: number): string {
  const h = Math.floor(simHours % 24);
  const m = Math.floor((simHours % 1) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function hours(value: number): string {
  return value >= 10 ? `${Math.round(value)}h` : `${value.toFixed(1)}h`;
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function dayName(day: number): string {
  return DAY_NAMES[(day - 1) % 7];
}
