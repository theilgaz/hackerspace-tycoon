import type { RivalState, ScoreRow } from '@/game/types';
import { AWARDS, RIVALS, RIVAL_STANDOUT, RIVAL_UPVOTES_PER_REP } from '@/utils/rivals';

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
    upvotes: 0,
    bestBuild: null,
  }));
}

export interface RivalPressure {
  /** Difficulty and the yearly ramp, folded into one multiplier each. */
  pace: number;
  reputation: number;
}

/** Advance every rival by a day. */
export function tickRivals(rivals: RivalState[], pressure: RivalPressure = { pace: 1, reputation: 1 }) {
  for (const rival of rivals) {
    const def = RIVALS.find((d) => d.id === rival.id)!;

    // They speed up as they get known, the same way the player does.
    const pace = def.shipPace * (1 + rival.reputation / def.paceGrowth) * pressure.pace;
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
      rival.upvotes += Math.round(impact * RIVAL_UPVOTES_PER_REP * def.online * rng.range(0.5, 1.5));
      if (!rival.bestBuild || impact > rival.bestBuild.score) {
        rival.bestBuild = { name: rng.pick(def.builds), score: impact };
      }
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

export interface Ceremony {
  year: number;
  awards: CeremonyAward[];
  /** Reputation the player earned from the night. */
  reputationGained: number;
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
  return { year, awards, reputationGained };
}
