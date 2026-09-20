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
 * Two working walls with a clear aisle down the middle, and the sofa at the door end.
 * Furniture scattered across an open floor reads as clutter; a room reads as a workshop
 * when the benches line up and the walking space is obvious.
 */
const STARTING_STATIONS: StationDef[] = [
  { id: 'cad-desk', type: 'cad-desk', label: 'CAD Desk', tile: { x: 1, y: 1 }, stand: { x: 1, y: 2 } },
  { id: 'printer-1', type: 'fdm', label: 'A1 Mini Combo', tile: { x: 4, y: 1 }, stand: { x: 4, y: 2 } },
  { id: 'bench', type: 'bench', label: 'Solder Bench', tile: { x: 1, y: 3 }, stand: { x: 1, y: 4 } },
  { id: 'assembly', type: 'assembly', label: 'Assembly Table', tile: { x: 4, y: 3 }, stand: { x: 4, y: 4 } },
  { id: 'lounge', type: 'lounge', label: 'Sofa & Kettle', tile: { x: 2, y: 6 }, stand: { x: 2, y: 5 } },
];

/** Where a machine unlocked by a tool project gets installed. */
/** New machines continue the two working walls rather than landing wherever there is room. */
const EXPANSION_SLOTS: { tile: Tile; stand: Tile }[] = [
  { tile: { x: 4, y: 6 }, stand: { x: 4, y: 5 } },
  { tile: { x: 1, y: 6 }, stand: { x: 1, y: 5 } },
  { tile: { x: 0, y: 1 }, stand: { x: 0, y: 2 } },
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
  { x: 2, y: 2 },
  { x: 3, y: 2 },
  { x: 2, y: 4 },
  { x: 3, y: 4 },
];

export function isBlocked(tile: Tile): boolean {
  return BLOCKED.has(`${tile.x},${tile.y}`);
}
