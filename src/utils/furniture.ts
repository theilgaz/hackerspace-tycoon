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
}

export const FURNITURE: FurnitureDef[] = [
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
  },
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
  },
  {
    id: 'hardware-station',
    type: 'bench',
    name: 'Hardware Station',
    blurb: 'Iron, scope, bench supply and a fume extractor. Electronics get assembled here.',
    icon: 'cpu',
    era: 1,
    price: 2400,
    span: 1,
    use: 'electronics assembly',
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
  },
];

export const FURNITURE_MAP: Record<string, FurnitureDef> = Object.fromEntries(
  FURNITURE.map((def) => [def.id, def]),
);

export const furnitureSeats = (def: FurnitureDef): number => SEATS[def.type] ?? 1;

/** What to buy when people are queueing for a kind of seat. */
export function furnitureFor(type: MachineType): FurnitureDef | undefined {
  return FURNITURE.find((def) => def.type === type);
}
