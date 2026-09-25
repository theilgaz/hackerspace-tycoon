import type { ProjectCategory } from '@/game/types';
import { CATEGORY_ORDER } from './categories';
import { MARKET } from './constants';
import { rng } from './rng';

/**
 * What the market wants, genre by genre (CLAUDE.md §4d). A number around 1.0 that
 * multiplies what a release pays: a hot genre pays more for the same build, a cold one less.
 *
 * It wanders every day and is pulled back toward normal, so a trend is a window rather
 * than a new permanent state — and every ship into a genre cools it a little. Between the
 * two, "ship another software project" stops being the answer to every month.
 */
export type Market = Record<ProjectCategory, number>;

const clamp = (value: number) => Math.max(MARKET.min, Math.min(MARKET.max, value));

export function freshMarket(): Market {
  const [lo, hi] = MARKET.start;
  return Object.fromEntries(
    CATEGORY_ORDER.map((category) => [category, Number(rng.range(lo, hi).toFixed(3))]),
  ) as Market;
}

/** A day passes: every genre wanders a little and drifts back toward 1.0. */
export function driftMarket(market: Market): Market {
  const next = { ...market };
  for (const category of CATEGORY_ORDER) {
    const now = market[category] ?? 1;
    const wander = rng.range(-MARKET.noise, MARKET.noise);
    next[category] = Number(clamp(now + (1 - now) * MARKET.revert + wander).toFixed(3));
  }
  return next;
}

/** Somebody shipped into this genre, so there is a little less appetite for the next one. */
export function coolMarket(market: Market, category: ProjectCategory): Market {
  return { ...market, [category]: Number(clamp((market[category] ?? 1) * MARKET.shipDip).toFixed(3)) };
}

/** How the demand reads, for a badge. */
export function demandLabel(value: number): { label: string; tone: 'hot' | 'warm' | 'flat' | 'cold' } {
  if (value >= 1.25) return { label: 'hot', tone: 'hot' };
  if (value >= 1.07) return { label: 'rising', tone: 'warm' };
  if (value > 0.9) return { label: 'steady', tone: 'flat' };
  return { label: 'cooling', tone: 'cold' };
}
