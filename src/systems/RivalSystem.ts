import type { RivalState, ScoreRow } from '@/game/types';
import { AWARDS, RIVALS } from '@/utils/rivals';
import { rng } from '@/utils/rng';

/**
 * Five other hackerspaces, simulated cheaply. They are not running the real pipeline —
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
  }));
}

/** Advance every rival by a day. */
export function tickRivals(rivals: RivalState[]) {
  for (const rival of rivals) {
    const def = RIVALS.find((d) => d.id === rival.id)!;

    // They speed up as they get known, the same way the player does.
    const pace = def.shipPace * (1 + rival.reputation / def.paceGrowth);
    rival.progress += pace * rng.range(0.55, 1.45);
    while (rival.progress >= 1) {
      rival.progress -= 1;
      rival.projects += 1;
      rival.reputation += Math.round(def.repPerProject * rng.range(0.7, 1.3));
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
  const awards: CeremonyAward[] = AWARDS.map((award) => {
    const best = [...rows].sort((a, b) => award.value(b) - award.value(a))[0];
    return {
      category: award.label,
      blurb: award.blurb,
      winnerId: best.id,
      winnerName: best.name,
      value: award.format(award.value(best)),
      playerWon: best.id === 'player',
    };
  });
  const reputationGained = awards.reduce(
    (sum, award) => sum + (award.playerWon ? AWARDS.find((a) => a.label === award.category)!.reputation : 0),
    0,
  );
  return { year, awards, reputationGained };
}
