/**
 * Difficulty sets the pressure from the other spaces, how much rope you start with, and
 * **how many people you have and how fast more turn up**.
 *
 * The rules of your own pipeline never change: a stage costs the same work, a print takes
 * the same hours, a bill charges the same rent, so advice and intuition still carry across
 * settings. What changes is the size of the crew applying them — which is the honest lever
 * in a game where §13 established that hands in the building are the binding constraint.
 */
export type DifficultyKey = 'easy' | 'normal' | 'hard';

export interface DifficultyDef {
  key: DifficultyKey;
  label: string;
  blurb: string;
  /** Bars lit on the pressure meter, out of three. The setting's one visual. */
  pressure: number;
  /** Accent for the meter and the badge tint — the §11 inline `--tone` exception. */
  accent: string;
  /** Multipliers on how fast the rivals build and how much name they make doing it. */
  rivalPace: number;
  rivalRep: number;
  /** Opening cash. The first two months are thin until a reputation brings dues in. */
  startCash: number;
  /**
   * People on the books on day one, you not included. Taken from the top of the applicant
   * ladder, so an easy start is the same people you would have recruited first anyway.
   */
  startMembers: number;
  /**
   * Days of word of mouth between one person getting in touch and the next. Reputation still
   * decides *who* is interested; this decides how fast the queue moves.
   */
  recruitEvery: number;
  /**
   * The rivals get faster every year on top of their own compounding, so a long game
   * keeps tightening rather than settling once you are ahead.
   */
  yearRamp: number;
}

export const DIFFICULTIES: DifficultyDef[] = [
  {
    key: 'easy',
    label: 'Easy',
    blurb: 'A crew of ten already, and a queue at the door. Room to make mistakes.',
    pressure: 1,
    accent: '#7ac74f',
    rivalPace: 0.95,
    rivalRep: 0.95,
    startCash: 10000,
    startMembers: 10,
    recruitEvery: 10,
    yearRamp: 0.04,
  },
  {
    key: 'normal',
    label: 'Normal',
    blurb: 'Four of you, and somebody new about once a month. Win an award and you earned it.',
    pressure: 2,
    accent: '#f0b429',
    rivalPace: 1.0,
    rivalRep: 1.0,
    startCash: 7000,
    startMembers: 4,
    recruitEvery: 30,
    yearRamp: 0.08,
  },
  {
    key: 'hard',
    label: 'Hard',
    blurb: 'Two of you in a garage. People trickle in. Thin margins from day one.',
    pressure: 3,
    accent: '#e2725b',
    rivalPace: 1.0,
    rivalRep: 1.0,
    startCash: 5000,
    startMembers: 2,
    recruitEvery: 40,
    yearRamp: 0.13,
  },
];

export const DIFFICULTY_MAP: Record<DifficultyKey, DifficultyDef> = Object.fromEntries(
  DIFFICULTIES.map((d) => [d.key, d]),
) as Record<DifficultyKey, DifficultyDef>;
