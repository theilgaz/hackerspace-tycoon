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
  /** Multipliers on how fast the rivals build and how much name they make doing it. */
  rivalPace: number;
  rivalRep: number;
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
    rivalPace: 0.7,
    rivalRep: 0.7,
    startCash: 6000,
    yearRamp: 0.04,
  },
  {
    key: 'normal',
    label: 'Normal',
    blurb: 'A real scene. Win an award and you earned it.',
    rivalPace: 1,
    rivalRep: 1,
    startCash: 4000,
    yearRamp: 0.08,
  },
  {
    key: 'hard',
    label: 'Hard',
    blurb: 'Everyone else is on it, and getting quicker every year. Thin margins from day one.',
    rivalPace: 1.3,
    rivalRep: 1.25,
    startCash: 3000,
    yearRamp: 0.13,
  },
];

export const DIFFICULTY_MAP: Record<DifficultyKey, DifficultyDef> = Object.fromEntries(
  DIFFICULTIES.map((d) => [d.key, d]),
) as Record<DifficultyKey, DifficultyDef>;
