/**
 * The books (CLAUDE.md §7). Income is lumpy — projects ship when they ship — and the costs
 * are steady, which is the whole tension: a quiet month still costs you a month.
 *
 * **Nobody is paid.** This is a volunteer space, so the people on your books are members
 * rather than staff, and they pay *you* — a flat monthly subscription each. Two kinds of
 * member, deliberately: the **crew** are the named people who turn up and build things, and
 * the **community** is the wider public who pay a smaller amount to use the place and whose
 * number follows your reputation. The crew is capped by the roster; the community is not,
 * which is what keeps a long run's income growing.
 */
export const ECONOMY = {
  /** Days between bills. Three to an awards year. */
  billEvery: 30,

  /** Monthly rent by era. The lease you sign gets heavier as the space does. */
  rent: [3000, 11000, 40000],

  /**
   * What each of the crew pays a month, flat — the same whether they are in five days a week
   * or two. A subscription is not rent on someone's time, and charging a part-timer less for
   * being available less is backwards.
   */
  crewDues: 2000,

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

/** How many of the wider public are paying to use the place. */
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
