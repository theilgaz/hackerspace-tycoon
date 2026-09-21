import type { ClaimKey, StageKey, Tag } from '@/game/types';
import type { IconName } from '@/ui/icons';

/**
 * The publisher (CLAUDE.md §6). Attention is not a single number you farm — it is six rooms
 * with different tastes and different patience, and choosing the room is the decision.
 *
 * The shape that makes that decision real is **audience traded against skepticism**: the
 * places that could make your name are the places that will call you out. A generalist room
 * is warm and forgiving but never multiplies much, because everything is welcome there.
 */
export interface SubredditDef {
  id: string;
  name: string;
  blurb: string;
  icon: IconName;
  /** How many people see it at all. The ceiling on a post. */
  audience: number;
  /** What they care about, most defining first — weighted like a genre's tags (§4b). */
  tasteTags: Tag[];
  /** How hard they come down on a claim the work does not back up. */
  skepticism: number;
  /**
   * Taste granted to anything at all. Only the generalist room has one: it is always
   * somewhere to post and never a big win, which is the whole of its character.
   */
  floor?: number;
}

export const SUBREDDITS: SubredditDef[] = [
  {
    id: 'printing',
    name: 'r/3Dprinting',
    blurb: 'Enormous, and it has seen ten thousand benchies. Show it the print, not the pitch.',
    icon: 'printer',
    audience: 0.85,
    tasteTags: ['machining', 'cad', 'design'],
    skepticism: 0.6,
  },
  {
    id: 'electronics',
    name: 'r/electronics',
    blurb: 'Somebody will zoom in on your solder joints. Somebody always does.',
    icon: 'cpu',
    audience: 0.6,
    tasteTags: ['electronics', 'retro', 'iot'],
    skepticism: 0.85,
  },
  {
    id: 'homeassistant',
    name: 'r/homeassistant',
    blurb: 'Delighted by anything that talks to anything. Low bar, warm room.',
    icon: 'antenna',
    audience: 0.55,
    tasteTags: ['iot', 'software', 'electronics'],
    skepticism: 0.35,
  },
  {
    id: 'radio',
    name: 'r/amateurradio',
    blurb: 'Small, expert, and it will want to see the SWR plot.',
    icon: 'antenna',
    audience: 0.35,
    tasteTags: ['radio', 'electronics'],
    skepticism: 0.8,
  },
  {
    id: 'somethingimade',
    name: 'r/somethingimade',
    blurb: 'Everything is welcome, which is exactly why nothing stands out.',
    icon: 'lightbulb',
    audience: 0.8,
    tasteTags: ['woodworking', 'food', 'civic', 'design'],
    skepticism: 0.25,
    floor: 0.45,
  },
  {
    id: 'programming',
    name: 'r/programming',
    blurb: 'The biggest room in the building and the least impressed by anything.',
    icon: 'code',
    audience: 1,
    tasteTags: ['software', 'design'],
    skepticism: 1,
  },
];

export const SUBREDDIT_MAP: Record<string, SubredditDef> = Object.fromEntries(
  SUBREDDITS.map((s) => [s.id, s]),
);

/** Ordered weights, same rule as a genre's tags: put the most defining tag first. */
const TASTE_WEIGHTS = [1, 0.7, 0.5];

/** How much this room cares about this project at all. 0-1. */
export function tasteMatch(tags: Tag[], sub: SubredditDef): number {
  let best = sub.floor ?? 0;
  sub.tasteTags.forEach((tag, index) => {
    if (tags.includes(tag)) best = Math.max(best, TASTE_WEIGHTS[index] ?? 0.4);
  });
  return best;
}

/**
 * How interesting the work is to look at right now. A finished thing is the easy win; a
 * bed full of parts is nearly as good, because that is what the photographs are of. Nobody
 * has ever upvoted a requirements list.
 */
export const STAGE_INTEREST: Record<StageKey, number> = {
  concept: 0.3,
  cad: 0.55,
  simulation: 0.4,
  fabrication: 0.8,
  assembly: 0.85,
  test: 0.7,
  iterate: 0.5,
  release: 1,
};

/**
 * What you said it was. The whole verb lives here: a bigger claim multiplies the room's
 * reaction and demands the work back it up, and `ask` is the merit bar it sets. Overreach is
 * punished by the room's skepticism, so the same boast is free in one place and fatal in
 * another.
 */
export interface ClaimDef {
  key: ClaimKey;
  label: string;
  blurb: string;
  ask: number;
  multiplier: number;
}

export const CLAIMS: ClaimDef[] = [
  {
    key: 'wip',
    label: 'Work in progress',
    blurb: 'Photos and an honest caption. Nobody can call you a liar.',
    ask: 0,
    multiplier: 0.7,
  },
  {
    key: 'works',
    label: 'It works',
    blurb: 'You are saying it is finished and it functions. It had better.',
    ask: 0.55,
    multiplier: 1,
  },
  {
    key: 'bold',
    label: 'Nobody has built this',
    blurb: 'The front page or the pillory, and the room decides which.',
    ask: 0.85,
    multiplier: 1.55,
  },
];

export const CLAIM_MAP: Record<ClaimKey, ClaimDef> = Object.fromEntries(
  CLAIMS.map((c) => [c.key, c]),
) as Record<ClaimKey, ClaimDef>;
