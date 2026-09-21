import type { ClaimKey, ProjectData, StageKey } from '@/game/types';
import { STAGE_ORDER } from '@/utils/constants';
import { HYPE } from '@/utils/constants';
import { CLAIM_MAP, STAGE_INTEREST, tasteMatch, type SubredditDef } from '@/utils/subreddits';

/**
 * Reddit, as a scoring function (CLAUDE.md §6). It imports nothing from `three` and touches
 * no DOM, so the whole attention layer is measurable headless — which is the only reason the
 * overclaim curve below could be tuned at all.
 */

export interface Reaction {
  upvotes: number;
  hype: number;
  /** Reputation the post costs you when the room turns on it. Never positive. */
  reputationHit: number;
  comment: string;
  /** True when the claim outran the work. The interesting failure. */
  burned: boolean;
}

/**
 * What the work actually justifies, 0-1. Quality is most of it, but how far through the
 * pipeline you are matters too: a beautifully specified idea is still an idea, and the room
 * can tell the difference between a render and a photograph.
 */
export function merit(project: ProjectData): number {
  const reached = STAGE_ORDER.indexOf(project.stage) / (STAGE_ORDER.length - 1);
  return project.quality * HYPE.meritFromQuality + reached * (1 - HYPE.meritFromQuality);
}

/**
 * Novelty. The same build in the same room is worth less every time, which is what stops
 * the verb collapsing into "post every day and never leave the desk". Spreading across
 * rooms is the counter-play, and it is meant to be.
 */
export function novelty(postsAlready: number): number {
  return 1 / (1 + postsAlready * HYPE.repeatPenalty);
}

/**
 * The reaction. `verdict` is the whole design in one line: the claim's multiplier minus
 * however far it outran the work, scaled by how sceptical the room is. A bold claim in
 * r/homeassistant is cheap; the same words in r/programming are a reputation event.
 */
export function react(
  project: ProjectData,
  sub: SubredditDef,
  claim: ClaimKey,
  postsAlready: number,
): Reaction {
  const def = CLAIM_MAP[claim];
  const taste = tasteMatch(project.tags, sub);
  const interest = STAGE_INTEREST[project.stage];
  const earned = merit(project);
  const overreach = Math.max(0, def.ask - earned);
  const verdict = Math.max(
    -HYPE.worstVerdict,
    def.multiplier - overreach * sub.skepticism * HYPE.backfire,
  );

  const reach = HYPE.perPost * sub.audience * taste * interest * novelty(postsAlready);
  const upvotes = Math.round(reach * verdict);
  const burned = verdict < 0;
  return {
    upvotes,
    hype: Math.round(upvotes * HYPE.hypePerUpvote),
    reputationHit: burned ? Math.round(upvotes * HYPE.reputationPerBurn) : 0,
    comment: commentFor({ taste, interest, verdict, overreach, burned, claim, sub, project }),
    burned,
  };
}

/**
 * The top comment. It has one job: say *why* the number came out as it did, so the player
 * can work out what to do differently. A score with no explanation is noise.
 */
function commentFor(ctx: {
  taste: number;
  interest: number;
  verdict: number;
  overreach: number;
  burned: boolean;
  claim: ClaimKey;
  sub: SubredditDef;
  project: ProjectData;
}): string {
  const { taste, interest, burned, overreach, sub, project } = ctx;
  if (burned) {
    if (overreach > 0.5) return `"Bold words for something that is still at ${project.stage}."`;
    return `"This is a remix of a design that has been on Thingiverse for years."`;
  }
  if (taste <= 0.4) return `"Neat, but what is this doing in ${sub.name}?"`;
  if (interest <= 0.45) return `"Come back when there is something to look at."`;
  if (ctx.verdict >= 1.3) return `"This is the best thing I have seen here all year."`;
  if (taste >= 0.9) return `"Exactly what this sub is for. Saved."`;
  return `"Nice work. What is the layer height?"`;
}

/** Attention has a shelf life — this is the anti-drift clock (§6). */
export function decayHype(hype: number): number {
  const next = hype * (1 - HYPE.decayPerDay);
  return next < HYPE.floor ? 0 : next;
}

/** Everything hype feeds is scaled off this, so one curve governs the whole layer. */
export function hypePressure(hype: number): number {
  return hype / (hype + HYPE.halfEffect);
}

export type { StageKey };
