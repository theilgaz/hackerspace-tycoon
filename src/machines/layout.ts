import type { MachineType, StageKey } from '@/game/types';
import type { Tile } from '@/utils/grid';

/** Era 1 — the garage (CLAUDE.md §8). The space itself grows in Phase 4. */
export const GRID = { width: 6, height: 8 };

export interface StationDef {
  id: string;
  type: MachineType;
  label: string;
  /** Tile the object occupies — members cannot walk through it. */
  tile: Tile;
  /** Tile a member stands on to use it. */
  stand: Tile;
}

/**
 * **Benches go against the walls.** The room has exactly two of them — the back wall along
 * `y = 0` and the left wall along `x = 0` — and everything works better when the kit is
 * pushed up against them: the floor reads as one open aisle instead of several awkward gaps,
 * and a bench with its back to a wall is simply what a workshop looks like. The first
 * arrangement sat a tile off both walls, which left a dead lane against each one and a large
 * empty floor at the door end.
 *
 * The sofa is the exception and it is deliberate: it sits by the door, because that is the
 * first thing you want to see when you walk in and the last thing you pass on the way out.
 */
const STARTING_STATIONS: StationDef[] = [
  { id: 'cad-desk', type: 'cad-desk', label: 'CAD Desk', tile: { x: 1, y: 0 }, stand: { x: 1, y: 1 } },
  { id: 'printer-1', type: 'fdm', label: 'A1 Mini Combo', tile: { x: 3, y: 0 }, stand: { x: 3, y: 1 } },
  { id: 'bench', type: 'bench', label: 'Solder Bench', tile: { x: 0, y: 2 }, stand: { x: 1, y: 2 } },
  { id: 'assembly', type: 'assembly', label: 'Assembly Table', tile: { x: 0, y: 4 }, stand: { x: 1, y: 4 } },
  { id: 'lounge', type: 'lounge', label: 'Sofa & Kettle', tile: { x: 0, y: 6 }, stand: { x: 1, y: 6 } },
];

/**
 * Where a bought or built machine lands. They carry on along the same two walls rather than
 * landing wherever there is room, so the space stays legible however much kit you buy — and
 * the back wall fills first, because that is where the printers live.
 */
const EXPANSION_SLOTS: { tile: Tile; stand: Tile }[] = [
  { tile: { x: 4, y: 0 }, stand: { x: 4, y: 1 } },
  { tile: { x: 2, y: 0 }, stand: { x: 2, y: 1 } },
  { tile: { x: 5, y: 0 }, stand: { x: 5, y: 1 } },
  { tile: { x: 0, y: 3 }, stand: { x: 1, y: 3 } },
  { tile: { x: 0, y: 5 }, stand: { x: 1, y: 5 } },
  { tile: { x: 0, y: 1 }, stand: { x: 1, y: 1 } },
];

export const MACHINE_LABEL: Record<MachineType, string> = {
  fdm: 'FDM Printer',
  bench: 'Solder Bench',
  assembly: 'Assembly Table',
  'cad-desk': 'CAD Desk',
  lounge: 'Sofa & Kettle',
  cnc: 'CNC Router',
  reflow: 'Reflow Oven',
  drybox: 'Filament Dry Box',
};

/** Live station list — grows when a tool project ships. */
export const STATIONS: StationDef[] = [...STARTING_STATIONS];
export const STATION_MAP: Record<string, StationDef> = Object.fromEntries(
  STATIONS.map((s) => [s.id, s]),
);

const BLOCKED = new Set(STATIONS.map((s) => `${s.tile.x},${s.tile.y}`));

/** Install a newly built machine into the next free expansion slot. */
export function installStation(type: MachineType, id: string): StationDef | null {
  const used = new Set(STATIONS.map((s) => `${s.tile.x},${s.tile.y}`));
  const slot = EXPANSION_SLOTS.find((s) => !used.has(`${s.tile.x},${s.tile.y}`));
  if (!slot) return null;
  const def: StationDef = { id, type, label: MACHINE_LABEL[type], tile: slot.tile, stand: slot.stand };
  STATIONS.push(def);
  STATION_MAP[id] = def;
  BLOCKED.add(`${def.tile.x},${def.tile.y}`);
  return def;
}

/** Machines added by tool projects, so a save can put them back. */
export function installedStations(): { id: string; type: MachineType }[] {
  const starting = new Set(STARTING_STATIONS.map((s) => s.id));
  return STATIONS.filter((s) => !starting.has(s.id)).map((s) => ({ id: s.id, type: s.type }));
}

/** Test hooks need the space back at its starting state between headless runs. */
export function resetStations() {
  STATIONS.length = 0;
  STATIONS.push(...STARTING_STATIONS);
  for (const key of Object.keys(STATION_MAP)) delete STATION_MAP[key];
  for (const s of STATIONS) STATION_MAP[s.id] = s;
  BLOCKED.clear();
  for (const s of STATIONS) BLOCKED.add(`${s.tile.x},${s.tile.y}`);
}

/** Where the work of each stage physically happens. */
export const STAGE_STATION: Record<StageKey, MachineType | null> = {
  concept: 'lounge', // arguing over coffee is still work
  cad: 'cad-desk',
  simulation: 'cad-desk',
  fabrication: null, // machine-driven; members only babysit or calibrate
  assembly: 'assembly',
  test: null,
  iterate: 'cad-desk',
  release: 'cad-desk',
};

export function stationOfType(type: MachineType): StationDef | undefined {
  return STATIONS.find((s) => s.type === type);
}

/** Front door — members appear and leave here. */
export const DOOR: Tile = { x: 0, y: 7 };

/** The aisle. People loiter here rather than inside somebody's workspace. */
export const IDLE_TILES: Tile[] = [
  { x: 3, y: 3 },
  { x: 4, y: 3 },
  { x: 3, y: 5 },
  { x: 4, y: 5 },
];

export function isBlocked(tile: Tile): boolean {
  return BLOCKED.has(`${tile.x},${tile.y}`);
}
