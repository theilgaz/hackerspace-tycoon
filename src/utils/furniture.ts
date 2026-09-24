import type { MachineType } from '@/game/types';
import type { IconName } from '@/ui/icons';
import { SEATS } from './constants';

/**
 * The Build menu's workspace (CLAUDE.md §4d): the furniture work actually happens at.
 *
 * Every project now starts at a **project table** and is then worked at **workstations**,
 * one person to a seat, so the room itself is a constraint for the first time. A crew of
 * five cannot plan at a four-seat table, and five people cannot all do the CAD at two
 * desks — the answer to both is to build, and the floor is what limits how much.
 */
export interface FurnitureDef {
  id: string;
  type: MachineType;
  name: string;
  blurb: string;
  icon: IconName;
  era: number;
  price: number;
  /** Tiles it covers — the large table is the only thing that takes two. */
  span: number;
  /** What it is for, in a word, for the card's badge. */
  use: string;
  /**
   * The variants (§4d) — the same kind of station done differently. Each one is a trade:
   * **a reward with no matching cost is not a choice** (§13), so the faster desk is dear,
   * the cheaper seat is slower, and the kickoff corner takes two tiles.
   */
  /** Seats, when not the kind's usual number. */
  seats?: number;
  /** Work rate of whoever sits here, against a plain station of the same kind. */
  rate?: number;
  /** Energy burned working here, against a plain station. Lower is better. */
  fatigue?: number;
  /** A kickoff held here goes this much faster. */
  kickoff?: number;
  /** Owning one multiplies the test risk of electronics builds — the scope finds it first. */
  testRisk?: number;
  /** Which corner of the Work shelf it is under: what it is for, not what kind of seat. */
  corner: FurnitureCorner;
}

export type FurnitureCorner = 'hacker' | 'maker' | 'meeting';
export const FURNITURE_CORNERS: FurnitureCorner[] = ['hacker', 'maker', 'meeting'];

export const FURNITURE: FurnitureDef[] = [
  // --- Hacker corner: screens and keyboards --------------------------------------
  {
    id: 'software-station',
    type: 'cad-desk',
    name: 'Software Station',
    blurb: 'Two screens and a good chair. Code, CAD, simulation and the write-up all happen here.',
    icon: 'code',
    era: 1,
    price: 1800,
    span: 1,
    use: 'code · CAD · docs',
    corner: 'hacker',
  },
  {
    id: 'long-bench',
    type: 'cad-desk',
    name: 'Long Hacker Bench',
    blurb: 'One long desk, three chairs, a tangle of cables. Cheaper seats, and elbows.',
    icon: 'users',
    era: 1,
    price: 3900,
    span: 2,
    use: 'code · CAD · 3 seats',
    seats: 3,
    rate: 0.92,
    corner: 'hacker',
  },
  // --- Maker corner: irons, pegboards and the machines that cut ---------------------
  // The one-seat hardware bench, and the garage's own. Its id is still the soldering
  // bench's so saved rooms keep it; the plain Hardware Station it replaced is gone.
  {
    id: 'solder-bench',
    type: 'bench',
    name: 'Maker Station',
    blurb: 'An iron, a scope, a fume arm and a pegboard of tools. Boards go together faster, and fewer come back.',
    icon: 'wrench',
    era: 1,
    price: 3400,
    span: 1,
    use: 'electronics · fewer failed tests',
    rate: 1.2,
    testRisk: 0.75,
    corner: 'maker',
  },
  {
    id: 'maker-bench',
    type: 'bench',
    name: 'Long Maker Bench',
    blurb: 'Three stools, three mats, one pegboard. Cheaper seats, and somebody always has your pliers.',
    icon: 'wrench',
    era: 1,
    price: 5200,
    span: 2,
    use: 'electronics · 3 seats',
    seats: 3,
    rate: 0.92,
    corner: 'maker',
  },
  {
    id: 'assembly-table',
    type: 'assembly',
    name: 'Assembly Table',
    blurb: 'A big flat top for bolting mechanical things together. Room for two.',
    icon: 'wrench',
    era: 1,
    price: 1500,
    span: 1,
    use: 'mechanical assembly',
    corner: 'maker',
  },
  // A machine, not a seat: it cuts parts on the clock like a printer. The CNC Router project
  // builds one for the price of its parts and six weeks of a crew; this is the cheque instead.
  {
    id: 'cnc-router',
    type: 'cnc',
    name: 'CNC Router',
    blurb: 'Aluminium and hardwood, cut to the tenth of a millimetre. The e-bike and the motorcycle need one.',
    icon: 'cog',
    era: 2,
    price: 26000,
    span: 1,
    use: 'cuts CNC parts',
    corner: 'maker',
  },
  // --- Meeting corner: where a crew sits down together, and where it learns ----------
  {
    id: 'table-small',
    type: 'table-small',
    name: 'Small Project Table',
    blurb: 'Four chairs round a square top. Where a weekend build gets agreed.',
    icon: 'users',
    era: 1,
    price: 900,
    span: 1,
    use: 'kickoffs up to 4',
    corner: 'meeting',
  },
  {
    id: 'table-large',
    type: 'table-large',
    name: 'Large Project Table',
    blurb: 'Ten chairs and a long top. The only way a crew of five or more plans anything.',
    icon: 'users',
    era: 1,
    price: 4800,
    span: 2,
    use: 'kickoffs up to 10',
    corner: 'meeting',
  },
  {
    id: 'meeting-corner',
    type: 'table-small',
    name: 'Meeting Corner',
    blurb: 'A sofa, two armchairs, a low table and a whiteboard on wheels. Kickoffs get agreed faster here.',
    icon: 'users',
    era: 1,
    price: 3600,
    span: 2,
    use: 'kickoffs up to 6 · faster',
    seats: 6,
    kickoff: 1.35,
    corner: 'meeting',
  },
  {
    id: 'learning-station',
    type: 'learning',
    name: 'Learning Station',
    blurb: 'Two chairs, a screen full of courses and a shelf of manuals. Train people up here.',
    icon: 'book',
    era: 1,
    price: 3200,
    span: 1,
    use: 'training',
    corner: 'meeting',
  },
];

export const FURNITURE_MAP: Record<string, FurnitureDef> = Object.fromEntries(
  FURNITURE.map((def) => [def.id, def]),
);

export const furnitureSeats = (def: FurnitureDef): number => def.seats ?? SEATS[def.type] ?? 1;

/**
 * Which piece of furniture a station on the floor is. A bought one carries its catalogue id
 * as its model; the kit the garage came with, and anything saved before variants, is the
 * plain one of its kind — the first entry of that type.
 */
export function furnitureOf(station: { type: MachineType; model?: string }): FurnitureDef | undefined {
  return (station.model ? FURNITURE_MAP[station.model] : undefined) ?? furnitureFor(station.type);
}

/** What to buy when people are queueing for a kind of seat. */
export function furnitureFor(type: MachineType): FurnitureDef | undefined {
  return FURNITURE.find((def) => def.type === type);
}
