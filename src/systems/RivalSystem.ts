import type { RivalState, ScoreRow } from '@/game/types';
import { AWARDS, RIVALS, RIVAL_STANDOUT } from '@/utils/rivals';

import { rng } from '@/utils/rng';

/** Keeps the average build's impact at its reputation, so standouts are spread, not inflation. */
const standoutNorm = ({ chance, boost: [low, high] }: { chance: number; boost: readonly [number, number] }) =>
  1 / (1 - chance + chance * ((low + high) / 2));

/**
 * The other hackerspaces, simulated cheaply. They are not running the real pipeline —
 * they are a pace-setter, so the player has something to be measured against at the end of
 * each year (CLAUDE.md §11). Each has a different shape so the leaderboard is not a single
 * ladder: one is rich and unknown, one is famous and broke.
 */
export function createRivals(): RivalState[] {
  return RIVALS.map((def) => ({
    id: def.id,
    projects: 0,
    members: def.startMembers,
    cash: def.startCash,
    reputation: 0,
    progress: 0,
    bestBuild: null,
  }));
}

export interface RivalPressure {
  /** Difficulty and the yearly ramp, folded into one multiplier each. */
  pace: number;
  reputation: number;
  /** The player's reputation, for the rubber band (`RIVAL_BAND`). Absent, there is none. */
  player?: number;
}

/**
 * **The field keeps pace with the player** (§3c). A rival far ahead of you slows, one
 * behind speeds up: its pace is multiplied by `((you + soften) / (them + soften)) ^ pull`,
 * held between `slowest` and `fastest`. The field was tuned against the autoplayer, which
 * ships a hundred builds in sixty days; a person plays a tenth of that, and Konya was three
 * times the table by the first awards night. Each space keeps its own shape — Konya is still
 * the quickest — it just cannot vanish over the horizon, or be left on it.
 */
export const RIVAL_BAND = { soften: 1500, pull: 1, slowest: 0.35, fastest: 1.25 };

function bandFactor(rival: number, player: number | undefined): number {
  if (player === undefined) return 1;
  const ratio = (player + RIVAL_BAND.soften) / (rival + RIVAL_BAND.soften);
  return Math.min(RIVAL_BAND.fastest, Math.max(RIVAL_BAND.slowest, Math.pow(ratio, RIVAL_BAND.pull)));
}

/** Advance every rival by a day. */
/** Reputation past which a rival's pace stops compounding (see `tickRivals`). */
export const RIVAL_GROWTH_KNEE = 14000;

export function tickRivals(rivals: RivalState[], pressure: RivalPressure = { pace: 1, reputation: 1 }) {
  for (const rival of rivals) {
    const def = RIVALS.find((d) => d.id === rival.id)!;

    // They speed up as they get known, the same way the player does — **up to a point**.
    // The compounding was tuned over a 220-day horizon; once a year became 365 days it ran on
    // unchecked and the field overtook the player by day 400, whose own growth flattens when
    // the roster is full. Past `RIVAL_GROWTH_KNEE` reputation a space keeps its pace but
    // stops accelerating, which leaves everything before the knee exactly as it was.
    const known = Math.min(rival.reputation, RIVAL_GROWTH_KNEE);
    const pace = def.shipPace * (1 + known / def.paceGrowth) * pressure.pace * bandFactor(rival.reputation, pressure.player);
    rival.progress += pace * rng.range(0.55, 1.45);
    while (rival.progress >= 1) {
      rival.progress -= 1;
      rival.projects += 1;
      const earned = Math.round(def.repPerProject * pressure.reputation * rng.range(0.7, 1.3));
      rival.reputation += earned;
      // How loud the build was. A standout changes this and only this: fed into reputation it
      // compounded through `paceGrowth` and the field finished a third higher than it should.
      const shape = def.standout ?? RIVAL_STANDOUT;
      const standout = rng.chance(shape.chance) ? rng.range(shape.boost[0], shape.boost[1]) : 1;
      const impact = Math.round(earned * standout * standoutNorm(shape));
      const name = rng.pick(def.builds);
      if (!rival.bestBuild || impact > rival.bestBuild.score) {
        rival.bestBuild = { name, score: impact };
      }
      // The loudest five of all time, one entry per build name, for the projects table.
      const hits = (rival.hits ??= []);
      const same = hits.find((h) => h.name === name);
      if (same) same.score = Math.max(same.score, impact);
      else hits.push({ name, score: impact });
      hits.sort((a, b) => b.score - a.score);
      hits.length = Math.min(hits.length, 5);
      rival.cash += Math.round(def.cashPerProject * rng.range(0.6, 1.4));
    }

    rival.cash = Math.max(0, rival.cash + Math.round(def.cashPerDay * rng.range(0.4, 1.6)));

    // People follow reputation, with a ceiling on how big the place can get.
    const pull = def.startMembers + Math.floor(rival.reputation / def.repPerMember);
    rival.members = Math.min(def.maxMembers, pull);
  }
}

export interface CeremonyAward {
  category: string;
  blurb: string;
  winnerId: string;
  winnerName: string;
  value: string;
  playerWon: boolean;
}

/** Where one space stood on one awards night. The only record a year leaves of the table. */
export interface YearStanding {
  id: string;
  rank: number;
  reputation: number;
}

export interface Ceremony {
  year: number;
  awards: CeremonyAward[];
  /** Reputation the player earned from the night. */
  reputationGained: number;
  /**
   * The whole field, in order, as it stood that night. The standings themselves are a live
   * snapshot — they only ever say where everybody is *now* — so without this a run keeps no
   * history at all, and "are they pulling away from me?" is unanswerable the day after.
   */
  standings: YearStanding[];
}

/**
 * Work out the year's prizes. Every category is measured over the year just gone, not all
 * time — otherwise the first winner keeps winning and the ceremony stops meaning anything.
 */
export function runCeremony(year: number, rows: ScoreRow[]): Ceremony {
  const winners = new Map<string, string>();
  const awards: CeremonyAward[] = AWARDS.map((award) => {
    const barred = award.notWinnerOf ? winners.get(award.notWinnerOf) : undefined;
    const best = rows
      .filter((row) => row.id !== barred)
      .sort((a, b) => award.value(b) - award.value(a))[0];
    winners.set(award.label, best.id);
    return {
      category: award.label,
      blurb: award.blurb,
      winnerId: best.id,
      winnerName: best.name,
      value: award.format(award.value(best), best),
      playerWon: best.id === 'player',
    };
  });
  const reputationGained = awards.reduce(
    (sum, award) => sum + (award.playerWon ? AWARDS.find((a) => a.label === award.category)!.reputation : 0),
    0,
  );
  const standings = [...rows]
    .sort((a, b) => b.reputation - a.reputation)
    .map((row, index) => ({ id: row.id, rank: index + 1, reputation: row.reputation }));
  return { year, awards, reputationGained, standings };
}
