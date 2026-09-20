import type { Employment } from '@/game/types';

/**
 * The books (CLAUDE.md §7). Income is lumpy — projects ship when they ship — and the costs
 * are steady, which is the whole tension: a quiet month still costs you a month.
 *
 * Two kinds of people, deliberately: **staff** are the ones you hire on contracts and pay
 * wages to, and **the membership** is the public who pay dues to use the place. Dues scale
 * with reputation, so a name you have made actually pays for itself.
 */
export const ECONOMY = {
  /** Days between bills. Three to an awards year. */
  billEvery: 30,

  /** Monthly rent by era. The lease you sign gets heavier as the space does. */
  rent: [1500, 4500, 10000],

  /** Monthly wage per contract. */
  /**
   * Sized so that a shop of five is comfortable and a full roster of fifteen is a real
   * strain: growth is what the wage bill is supposed to make you think about, not survival.
   */
  wage: { 'full-time': 1000, 'part-time': 500 } as Record<Employment, number>,

  /** Power and consumables, per sim-hour a machine actually ran. */
  utilityPerMachineHour: 15,

  /**
   * Dues are meant to carry the rent, the way they do in a real space. That makes the loop
   * **ship → reputation → membership → the rent looks after itself**, and it is why the
   * early months are thin: you have no name yet, so nobody is paying to be there.
   */
  reputationPerMember: 90,
  maxMembership: 80,
  duesPerMember: 320,

  /** Miss this many bills in a row and the lease is gone. */
  missesBeforeEviction: 2,
};

export function rentFor(era: number): number {
  return ECONOMY.rent[Math.min(ECONOMY.rent.length, Math.max(1, era)) - 1];
}

/** How many of the public are paying to use the place. */
export function membershipFor(reputation: number): number {
  return Math.min(ECONOMY.maxMembership, Math.floor(reputation / ECONOMY.reputationPerMember));
}

export interface BillLine {
  label: string;
  detail: string;
  amount: number;
}

export interface Bill {
  month: number;
  day: number;
  income: BillLine[];
  costs: BillLine[];
  total: number;
  balanceBefore: number;
  balanceAfter: number;
  /** Short by this much; zero when it was covered. */
  shortfall: number;
  missesInARow: number;
  evicted: boolean;
}
