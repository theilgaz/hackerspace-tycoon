import type { IconName } from '@/ui/icons';
import { COMFORT } from './constants';
import { t } from '@/i18n';

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
  /**
   * Which shelf of the Build menu it sits on. Comforts are the Shop as it was — kit for the
   * people. Decor is smaller and cheaper: a plant, a poster, a rubber duck. It still runs
   * through mood, and so through the same saturation curve, so a room full of it is nicer
   * rather than faster (§7b's rule that the fourth nice thing is worth less than the first).
   */
  group?: 'comfort' | 'decor';
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
    | 'acoustics'
    | 'plant'
    | 'tree'
    | 'duck'
    | 'tux'
    | 'bookshelf'
    | 'beanbag'
    | 'rack'
    | 'neon'
    | 'whiteboard'
    | 'poster'
    | 'terminal'
    | 'lava';
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
  // --- Decor (§4d): the room as somewhere you would want to be ---------------
  {
    id: 'monstera',
    group: 'decor',
    name: 'Monstera',
    blurb: 'A big leafy plant in a pot. Somebody will adopt it and name it.',
    icon: 'leaf',
    era: 1,
    price: 450,
    upkeep: 0,
    effect: { mood: 1 },
    shape: 'plant',
    mount: 'floor',
    tone: '#3f8f4f',
  },
  {
    id: 'olive-tree',
    group: 'decor',
    name: 'Indoor Olive Tree',
    blurb: 'A proper tree in a proper tub. The garage stops feeling like a garage.',
    icon: 'leaf',
    era: 1,
    price: 1400,
    upkeep: 0,
    effect: { mood: 2, drift: 0.98 },
    shape: 'tree',
    mount: 'floor',
    tone: '#7a9a4a',
  },
  {
    id: 'lava-lamp',
    group: 'decor',
    name: 'Lava Lamp',
    blurb: 'Orange wax, going up and down, forever. Surprisingly good for thinking.',
    icon: 'lightbulb',
    era: 1,
    price: 250,
    upkeep: 0,
    effect: { mood: 1 },
    shape: 'lava',
    mount: 'floor',
    tone: '#ff7a3d',
  },
  {
    id: 'rubber-duck',
    group: 'decor',
    name: 'Giant Rubber Duck',
    blurb: 'Explain the bug to the duck. It works far more often than it should.',
    icon: 'bot',
    era: 1,
    price: 900,
    upkeep: 0,
    effect: { mood: 2, focus: 1.01 },
    shape: 'duck',
    mount: 'floor',
    tone: '#f0c429',
  },
  {
    id: 'tux',
    group: 'decor',
    name: 'Tux Statue',
    blurb: 'A knee-high penguin by the door. Visitors take photos with it.',
    icon: 'users',
    era: 1,
    price: 1200,
    upkeep: 0,
    effect: { mood: 2, draw: 1.02 },
    shape: 'tux',
    mount: 'floor',
    tone: '#1f2329',
  },
  {
    id: 'bookshelf',
    group: 'decor',
    name: 'Shelf of Manuals',
    blurb: 'Datasheets, animal-cover books and a Horowitz & Hill with a cracked spine.',
    icon: 'book',
    era: 1,
    price: 1600,
    upkeep: 0,
    effect: { mood: 1, focus: 1.02 },
    shape: 'bookshelf',
    mount: 'floor',
    tone: '#8a5a3c',
  },
  {
    id: 'beanbags',
    group: 'decor',
    name: 'Bean Bags',
    blurb: 'Two of them, slightly deflated. Every afternoon somebody is asleep in one.',
    icon: 'home',
    era: 1,
    price: 1300,
    upkeep: 0,
    effect: { mood: 2, rest: 1.1 },
    shape: 'beanbag',
    mount: 'floor',
    tone: '#c0584a',
  },
  {
    id: 'server-rack',
    group: 'decor',
    name: 'Server Rack',
    blurb: 'Blinkenlights. It hosts the wiki and a Minecraft server, in that order of importance.',
    icon: 'cpu',
    era: 1,
    price: 3800,
    upkeep: 150,
    effect: { mood: 1, draw: 1.03 },
    shape: 'rack',
    mount: 'floor',
    tone: '#5ecfc0',
  },
  {
    id: 'neon-sign',
    group: 'decor',
    name: 'Neon </> Sign',
    blurb: 'Pink glass tubing on the back wall. The photo everybody posts of the place.',
    icon: 'code',
    era: 1,
    price: 2200,
    upkeep: 60,
    effect: { mood: 2, draw: 1.04 },
    shape: 'neon',
    mount: 'wall',
    tone: '#ff4fd8',
  },
  {
    id: 'whiteboard',
    group: 'decor',
    name: 'Whiteboard Wall',
    blurb: 'Half a wall you can write on. Nobody ever wipes the corner that says DO NOT WIPE.',
    icon: 'clipboard',
    era: 1,
    price: 1100,
    upkeep: 0,
    effect: { focus: 1.03 },
    shape: 'whiteboard',
    mount: 'wall',
    tone: '#e8ecf2',
  },
  {
    id: 'circuit-art',
    group: 'decor',
    name: 'Circuit Art Print',
    blurb: 'A framed schematic, drawn as art. It is a real circuit, and it does work.',
    icon: 'image',
    era: 1,
    price: 600,
    upkeep: 0,
    effect: { mood: 1 },
    shape: 'poster',
    mount: 'wall',
    tone: '#5ecfc0',
  },
  {
    id: 'retro-terminal',
    group: 'decor',
    name: 'Retro Terminal',
    blurb: 'A beige terminal on a plinth, green text, still connected to something.',
    icon: 'gamepad',
    era: 2,
    price: 2600,
    upkeep: 0,
    effect: { mood: 2, draw: 1.03 },
    shape: 'terminal',
    mount: 'floor',
    tone: '#d8cfb8',
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

/**
 * One line per effect, for the Build cards and the People panel. Positive reads as good.
 * Rendered in the player's language here rather than at every call site.
 */
export function effectLines(effect: AmenityEffect): { label: string; good: boolean }[] {
  const lines: { label: string; good: boolean }[] = [];
  const pct = (value: number) => `${value > 1 ? '+' : '−'}${Math.round(Math.abs(value - 1) * 100)}%`;
  if (effect.mood) lines.push({ label: t('build.effect.mood', { value: String(effect.mood) }), good: true });
  if (effect.focus) lines.push({ label: t('build.effect.focus', { value: pct(effect.focus) }), good: effect.focus > 1 });
  if (effect.rest) lines.push({ label: t('build.effect.rest', { value: pct(effect.rest) }), good: effect.rest > 1 });
  if (effect.fatigue) {
    lines.push({ label: t('build.effect.fatigue', { value: pct(effect.fatigue) }), good: effect.fatigue < 1 });
  }
  if (effect.drift) lines.push({ label: t('build.effect.drift', { value: pct(effect.drift) }), good: effect.drift < 1 });
  if (effect.draw) lines.push({ label: t('build.effect.draw', { value: pct(effect.draw) }), good: effect.draw > 1 });
  return lines;
}
