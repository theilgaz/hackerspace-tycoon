import type { IconName } from '@/ui/icons';
import { COMFORT } from './constants';

/**
 * The Shop (CLAUDE.md §7b) — what you buy for the *people* rather than for the work.
 *
 * Machines make parts; these make the place worth turning up to, which §13 says is the only
 * thing that actually matters: **the binding constraint on a volunteer space is whether
 * anybody is in the building.** So every entry here has to reach attendance, and almost all
 * of them do it through the same channel — `mood`, which already drives both the show-up
 * roll in `planDay` and the work rate in `MemberEntity.workRate`. Mood was the one stat the
 * design doc described and nothing ever wrote to; the shop is what writes to it.
 *
 * **A comfort with no cost is not a decision**, so most of them carry monthly upkeep on the
 * bill, and the two that people play on cost focus: a table tennis table genuinely does mean
 * less work gets done, and it is still worth buying. That tension is the whole panel.
 */
export interface AmenityEffect {
  /** Added to everyone's own temperament, before the saturation curve. */
  mood?: number;
  /** Multiplier on work rate — a property of the room, not of the person. */
  focus?: number;
  /** Multiplier on energy recovered while resting. */
  rest?: number;
  /** Multiplier on energy burned while working. Lower is better. */
  fatigue?: number;
  /** Multiplier on how fast interest decays. Lower is better. */
  drift?: number;
  /** Multiplier on the recruitment clock — a good space gets talked about. */
  draw?: number;
}

export interface AmenityDef {
  id: string;
  name: string;
  /** What it is, in the room. */
  blurb: string;
  icon: IconName;
  era: number;
  price: number;
  /** Power, refills, fish food. Charged on the monthly statement. */
  upkeep: number;
  effect: AmenityEffect;
  /** How the prop is drawn, and whether it takes a floor tile or hangs on the wall. */
  shape:
    | 'coffee'
    | 'water'
    | 'couch'
    | 'fridge'
    | 'ac'
    | 'pingpong'
    | 'aquarium'
    | 'arcade'
    | 'acoustics';
  mount: 'floor' | 'wall';
  /** The prop's own colour; the room is otherwise deliberately grey. */
  tone: string;
}

export const AMENITIES: AmenityDef[] = [
  {
    id: 'coffee',
    name: 'Coffee Machine',
    blurb: 'Beans, a grinder, and an end to the jar of instant nobody admits to buying.',
    icon: 'flame',
    era: 1,
    price: 3200,
    upkeep: 420,
    effect: { mood: 3, rest: 1.25, fatigue: 0.95 },
    shape: 'coffee',
    mount: 'floor',
    tone: '#8a5a3c',
  },
  {
    id: 'water',
    name: 'Water Cooler',
    blurb: 'A bottle on a stand. It is also where half the decisions in the space get made.',
    icon: 'dish',
    era: 1,
    price: 1600,
    upkeep: 280,
    effect: { mood: 2, fatigue: 0.92 },
    shape: 'water',
    mount: 'floor',
    tone: '#5aa9f0',
  },
  {
    id: 'couch',
    name: 'A Proper Couch',
    blurb: 'The one by the door was skipped. This one you can actually fall asleep on.',
    icon: 'home',
    era: 1,
    price: 5400,
    upkeep: 0,
    effect: { mood: 4, rest: 1.35 },
    shape: 'couch',
    mount: 'floor',
    tone: '#4f6f52',
  },
  {
    id: 'fridge',
    name: 'Drinks Fridge',
    blurb: 'Cold drinks, an honesty box, and a reason to stay for one more hour.',
    icon: 'package',
    era: 2,
    price: 7500,
    upkeep: 700,
    effect: { mood: 4, draw: 1.06 },
    shape: 'fridge',
    mount: 'floor',
    tone: '#3f7f8f',
  },
  {
    id: 'ac',
    name: 'Air Conditioning',
    blurb: 'A unit on the wall. August stops being a month where nothing ships.',
    icon: 'wifi',
    era: 2,
    price: 14000,
    upkeep: 1900,
    effect: { mood: 3, focus: 1.1, fatigue: 0.85 },
    shape: 'ac',
    mount: 'wall',
    tone: '#cbd3de',
  },
  {
    id: 'pingpong',
    name: 'Table Tennis',
    blurb: 'Nobody will ever work through a rally. Everybody will turn up for one.',
    icon: 'gamepad',
    era: 2,
    price: 6800,
    upkeep: 0,
    effect: { mood: 6, focus: 0.95, draw: 1.08 },
    shape: 'pingpong',
    mount: 'floor',
    tone: '#2f6b4f',
  },
  {
    id: 'aquarium',
    name: 'Aquarium',
    blurb: 'Six fish and a filter. Staring at it is the closest this place gets to calm.',
    icon: 'dish',
    era: 2,
    price: 9000,
    upkeep: 600,
    effect: { mood: 3, drift: 0.85 },
    shape: 'aquarium',
    mount: 'floor',
    tone: '#2f8fa8',
  },
  {
    id: 'arcade',
    name: 'Arcade Cabinet',
    blurb: 'A restored upright with a dodgy joystick. Half the applicants come for this.',
    icon: 'gamepad',
    era: 3,
    price: 22000,
    upkeep: 900,
    effect: { mood: 7, focus: 0.92, draw: 1.15 },
    shape: 'arcade',
    mount: 'floor',
    tone: '#c058a0',
  },
  {
    id: 'acoustics',
    name: 'Acoustic Panels',
    blurb: 'Foam on the walls, so the CNC stops ruining everybody else’s afternoon.',
    icon: 'building',
    era: 3,
    price: 17000,
    upkeep: 0,
    effect: { focus: 1.12, drift: 0.93 },
    shape: 'acoustics',
    mount: 'wall',
    tone: '#5a5f6b',
  },
];

export const amenityDef = (id: string): AmenityDef | undefined =>
  AMENITIES.find((a) => a.id === id);

/** Everything the comforts add up to. The sim reads this and nothing else from the shop. */
export interface Comforts {
  /** Mood added to each member's own temperament, already through the saturation curve. */
  mood: number;
  focus: number;
  rest: number;
  fatigue: number;
  drift: number;
  draw: number;
  /** Total monthly upkeep, for the bill. */
  upkeep: number;
}

export const NO_COMFORTS: Comforts = {
  mood: 0,
  focus: 1,
  rest: 1,
  fatigue: 1,
  drift: 1,
  draw: 1,
  upkeep: 0,
};

/**
 * Fold the owned list into one bundle.
 *
 * **Mood saturates and the multipliers do not.** Comforts are the one thing in the game a
 * player can simply keep buying, so a straight sum would let a kitted-out warehouse run
 * everybody at maximum mood permanently — the fourth nice thing in a room is worth much
 * less than the first. The multipliers are left to compound because each of them is a
 * different mechanism and there are only ever one or two of each.
 */
export function comfortsOf(owned: string[]): Comforts {
  const result: Comforts = { ...NO_COMFORTS };
  let moodSum = 0;
  for (const id of owned) {
    const def = amenityDef(id);
    if (!def) continue;
    moodSum += def.effect.mood ?? 0;
    result.focus *= def.effect.focus ?? 1;
    result.rest *= def.effect.rest ?? 1;
    result.fatigue *= def.effect.fatigue ?? 1;
    result.drift *= def.effect.drift ?? 1;
    result.draw *= def.effect.draw ?? 1;
    result.upkeep += def.upkeep;
  }
  result.mood = COMFORT.moodCap * (1 - Math.exp(-moodSum / COMFORT.moodCap));
  return result;
}

/** One line per effect, for the shop card and the People panel. Positive reads as good. */
export function effectLines(effect: AmenityEffect): { label: string; good: boolean }[] {
  const lines: { label: string; good: boolean }[] = [];
  const pct = (value: number) => `${value > 1 ? '+' : '−'}${Math.round(Math.abs(value - 1) * 100)}%`;
  if (effect.mood) lines.push({ label: `mood +${effect.mood}`, good: true });
  if (effect.focus) lines.push({ label: `work rate ${pct(effect.focus)}`, good: effect.focus > 1 });
  if (effect.rest) lines.push({ label: `rest ${pct(effect.rest)}`, good: effect.rest > 1 });
  if (effect.fatigue) lines.push({ label: `tiring ${pct(effect.fatigue)}`, good: effect.fatigue < 1 });
  if (effect.drift) lines.push({ label: `drift ${pct(effect.drift)}`, good: effect.drift < 1 });
  if (effect.draw) lines.push({ label: `word of mouth ${pct(effect.draw)}`, good: effect.draw > 1 });
  return lines;
}
