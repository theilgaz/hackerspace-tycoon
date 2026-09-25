/**
 * Dilemmas (CLAUDE.md §7c): every fifteen to twenty days something happens that the space
 * has to answer, and **every answer costs something** — money, a day, a person, a mood.
 * There is no free option on any card; the decision is which cost this run can carry right
 * now. The text lives in `i18n/*\/dilemma.ts`, keyed by id; this file is the numbers.
 *
 * Money scales with the lease's rent, so a card costs about the same share of a month in
 * the garage as it does in the warehouse.
 */

/** A temporary modifier on the space: a multiplier that lasts `days`. */
export type DilemmaMod = 'work' | 'printers' | 'power' | 'filament';

export type DilemmaEffect =
  /** Money, as a share of the month's rent; negative is a cost. `min` is the floor of its size. */
  | { kind: 'cash'; rent: number; min: number }
  /** Reputation, as a share of what the space has; negative is lost. */
  | { kind: 'rep'; share: number; min: number }
  /** Mood, for everybody on the books or for the card's one person. */
  | { kind: 'mood'; who: 'all' | 'target'; delta: number }
  /** The card's person stays at home this many days. */
  | { kind: 'away'; days: number }
  /** The card's person leaves the space. */
  | { kind: 'leave' }
  /** A multiplier on the space for a while: work pace, printers (0 = stopped), power, filament. */
  | { kind: 'mod'; mod: DilemmaMod; value: number; days: number }
  /** The rest of your day goes on it. */
  | { kind: 'dayOff' }
  /** Something that may or may not happen. */
  | { kind: 'chance'; p: number; then: DilemmaEffect[] };

export interface DilemmaOption {
  key: 'a' | 'b' | 'c';
  effects: DilemmaEffect[];
}

export interface DilemmaDef {
  id: string;
  /** Whom the card is about, when it is about somebody. */
  target?: 'crew' | 'best';
  /** What the space needs for the card to make sense. */
  needs?: 'printer' | 'project' | 'three';
  options: DilemmaOption[];
}

export const DILEMMA = {
  /** Days between cards: the next one lands this many days after the last was answered. */
  every: [15, 20] as [number, number],
  /** The hour of the day a card arrives: after everybody is in. */
  atHour: 10,
  /** Cards not dealt again until this many others have been. */
  memory: 4,
};

export const DILEMMAS: DilemmaDef[] = [
  {
    // The fire inspector: pay now, or pay in power and risk a fine.
    id: 'inspection',
    options: [
      { key: 'a', effects: [{ kind: 'cash', rent: -0.6, min: 1800 }] },
      {
        key: 'b',
        effects: [
          { kind: 'mod', mod: 'power', value: 2, days: 20 },
          { kind: 'chance', p: 0.35, then: [{ kind: 'cash', rent: -1.1, min: 3000 }] },
        ],
      },
    ],
  },
  {
    // A client wants it sooner: crunch, or disappoint them.
    id: 'rush',
    needs: 'project',
    options: [
      { key: 'a', effects: [{ kind: 'mod', mod: 'work', value: 1.25, days: 5 }, { kind: 'mood', who: 'all', delta: -14 }] },
      { key: 'b', effects: [{ kind: 'rep', share: -0.04, min: 40 }] },
    ],
  },
  {
    // Somebody is running on empty.
    id: 'burnout',
    target: 'crew',
    options: [
      { key: 'a', effects: [{ kind: 'away', days: 3 }, { kind: 'mood', who: 'target', delta: 18 }] },
      { key: 'b', effects: [{ kind: 'mood', who: 'target', delta: -25 }, { kind: 'chance', p: 0.3, then: [{ kind: 'leave' }] }] },
    ],
  },
  {
    // The printers' board has fried.
    id: 'printer',
    needs: 'printer',
    options: [
      { key: 'a', effects: [{ kind: 'cash', rent: -0.35, min: 1200 }] },
      { key: 'b', effects: [{ kind: 'mod', mod: 'printers', value: 0, days: 4 }] },
    ],
  },
  {
    // The neighbours have had enough of the noise.
    id: 'neighbours',
    options: [
      { key: 'a', effects: [{ kind: 'mod', mod: 'work', value: 0.88, days: 10 }] },
      { key: 'b', effects: [{ kind: 'cash', rent: -0.5, min: 1500 }] },
    ],
  },
  {
    // Another space wants your best person.
    id: 'poach',
    target: 'best',
    needs: 'three',
    options: [
      { key: 'a', effects: [{ kind: 'cash', rent: -0.8, min: 2500 }, { kind: 'mood', who: 'target', delta: 10 }] },
      { key: 'b', effects: [{ kind: 'leave' }, { kind: 'rep', share: 0.02, min: 20 }] },
    ],
  },
  {
    // A journalist at the door, today.
    id: 'press',
    options: [
      {
        key: 'a',
        effects: [{ kind: 'dayOff' }, { kind: 'mod', mod: 'work', value: 0.6, days: 1 }, { kind: 'rep', share: 0.07, min: 120 }],
      },
      { key: 'b', effects: [] },
    ],
  },
  {
    // The filament supplier is putting prices up.
    id: 'supplier',
    needs: 'printer',
    options: [
      { key: 'a', effects: [{ kind: 'cash', rent: -0.4, min: 1200 }] },
      { key: 'b', effects: [{ kind: 'mod', mod: 'filament', value: 1.7, days: 30 }] },
    ],
  },
  {
    // A grant, due tomorrow.
    id: 'grant',
    options: [
      { key: 'a', effects: [{ kind: 'dayOff' }, { kind: 'chance', p: 0.5, then: [{ kind: 'cash', rent: 1.4, min: 4000 }] }] },
      { key: 'b', effects: [] },
    ],
  },
  {
    // The crew wants a hackathon weekend.
    id: 'hackathon',
    options: [
      { key: 'a', effects: [{ kind: 'cash', rent: -0.3, min: 900 }, { kind: 'mood', who: 'all', delta: 12 }] },
      { key: 'b', effects: [{ kind: 'mood', who: 'all', delta: -8 }] },
    ],
  },
];

export const DILEMMA_MAP: Record<string, DilemmaDef> = Object.fromEntries(DILEMMAS.map((d) => [d.id, d]));

/** What an effect's money comes to at this rent. */
export function effectCash(effect: Extract<DilemmaEffect, { kind: 'cash' }>, rent: number): number {
  const size = Math.max(effect.min, Math.abs(effect.rent) * rent);
  return Math.round((Math.sign(effect.rent) * size) / 100) * 100;
}

/** What an effect's reputation comes to for a space this well known. */
export function effectRep(effect: Extract<DilemmaEffect, { kind: 'rep' }>, reputation: number): number {
  return Math.round(Math.sign(effect.share) * Math.max(effect.min, Math.abs(effect.share) * reputation));
}
