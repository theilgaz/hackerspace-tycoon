/**
 * Difficulty is expressed entirely as pressure from the other spaces plus how much rope
 * you start with — never as a change to your own rules. The player's pipeline, hours and
 * costs behave identically at every setting, so advice and intuition carry across.
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
   * The rivals get faster every year on top of their own compounding, so a long game
   * keeps tightening rather than settling once you are ahead.
   */
  yearRamp: number;
}

export const DIFFICULTIES: DifficultyDef[] = [
  {
    key: 'easy',
    label: 'Easy',
    blurb: 'The other spaces potter along. Room to make mistakes and still place well.',
    pressure: 1,
    accent: '#7ac74f',
    rivalPace: 0.7,
    rivalRep: 0.7,
    startCash: 10000,
    yearRamp: 0.04,
  },
  {
    key: 'normal',
    label: 'Normal',
    blurb: 'A real scene. Win an award and you earned it.',
    pressure: 2,
    accent: '#f0b429',
    rivalPace: 1,
    rivalRep: 1,
    startCash: 7000,
    yearRamp: 0.08,
  },
  {
    key: 'hard',
    label: 'Hard',
    blurb: 'Everyone is on it, and getting quicker every year. Thin margins from day one.',
    pressure: 3,
    accent: '#e2725b',
    rivalPace: 1.3,
    rivalRep: 1.25,
    startCash: 5000,
    yearRamp: 0.13,
  },
];

export const DIFFICULTY_MAP: Record<DifficultyKey, DifficultyDef> = Object.fromEntries(
  DIFFICULTIES.map((d) => [d.key, d]),
) as Record<DifficultyKey, DifficultyDef>;
