/**
 * **There is one setting, and it is the hard one.** The start screen used to offer easy,
 * normal and hard; it was taken out because a choice of how much the game should push back
 * is a choice to play less of it. Everybody starts as hard used to: two of you, somebody new
 * every five weeks, and the rivals ramping up year on year — with ₺50,000 in the bank, which
 * is normal's opening cash rather than hard's ten, so the thin start is thin in people and
 * not in money. The shape below is kept because the sim and the harnesses read it by key.
 *
 * It sets the pressure from the other spaces, how much rope you start with, and **how many
 * people you have and how fast more turn up**.
 *
 * The rules of your own pipeline never change: a stage costs the same work, a print takes
 * the same hours, a bill charges the same rent, so advice and intuition still carry across
 * settings. What changes is the size of the crew applying them — which is the honest lever
 * in a game where §13 established that hands in the building are the binding constraint.
 */
export type DifficultyKey = 'normal';

export interface DifficultyDef {
  key: DifficultyKey;
  label: string;
  blurb: string;
  /**
   * The line under the name on the start screen: the opening scene, not the terms. The
   * blurb on the card already states the numbers, so this should not repeat them.
   */
  intro: string;
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
    key: 'normal',
    label: 'Normal',
    blurb: 'Two of you in a garage. People trickle in. Win an award and you earned it.',
    intro: 'Two of you, one printer, and a landlord who wants rent on the first. Every new face is one you earned.',
    pressure: 3,
    accent: '#e2725b',
    // The field had fallen behind a player whose own pipeline kept getting quicker — shorter
    // builds, no project cap, a seventeen-hour owner, traits — and sat at 3.4× the best rival
    // by day 30. Measured (`era-pace`, 8 seeds): ×1.2 is 2.2× on day 90 and 1.4× on day 210,
    // first in 8 of 8. ×1.4 already put the player 1st-11th: pace and reputation compound
    // together, so a small step here is a big one by day 200.
    rivalPace: 1.2,
    rivalRep: 1.2,
    startCash: 50000,
    startMembers: 2,
    recruitEvery: 35,
    yearRamp: 0.13,
  },
];

export const DIFFICULTY_MAP: Record<DifficultyKey, DifficultyDef> = Object.fromEntries(
  DIFFICULTIES.map((d) => [d.key, d]),
) as Record<DifficultyKey, DifficultyDef>;
