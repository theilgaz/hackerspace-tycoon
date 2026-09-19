import type { MachineType, StageKey } from '@/game/types';
import type { Tile } from '@/utils/grid';

/** Era 1 — the garage (CLAUDE.md §8). Fixed for the vertical slice. */
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

export const STATIONS: StationDef[] = [
  { id: 'cad-desk', type: 'cad-desk', label: 'CAD Desk', tile: { x: 1, y: 1 }, stand: { x: 1, y: 2 } },
  { id: 'printer-1', type: 'fdm', label: 'Ender (FDM)', tile: { x: 4, y: 1 }, stand: { x: 4, y: 2 } },
  { id: 'assembly', type: 'assembly', label: 'Assembly Table', tile: { x: 1, y: 5 }, stand: { x: 1, y: 4 } },
  { id: 'bench', type: 'bench', label: 'Solder Bench', tile: { x: 4, y: 5 }, stand: { x: 4, y: 4 } },
  { id: 'lounge', type: 'lounge', label: 'Sofa & Kettle', tile: { x: 2, y: 7 }, stand: { x: 2, y: 6 } },
];

export const STATION_MAP: Record<string, StationDef> = Object.fromEntries(
  STATIONS.map((s) => [s.id, s]),
);

/** Where the work of each stage physically happens. */
export const STAGE_STATION: Record<StageKey, string | null> = {
  concept: 'lounge', // arguing over coffee is still work
  cad: 'cad-desk',
  simulation: 'cad-desk',
  fabrication: null, // machine-driven; members only babysit or calibrate
  assembly: 'assembly',
  test: null,
  iterate: 'cad-desk',
  release: 'cad-desk',
};

/** Front door — members appear and leave here. */
export const DOOR: Tile = { x: 0, y: 7 };

export const IDLE_TILES: Tile[] = [
  { x: 2, y: 3 },
  { x: 3, y: 3 },
  { x: 2, y: 4 },
  { x: 3, y: 6 },
];

const BLOCKED = new Set(STATIONS.map((s) => `${s.tile.x},${s.tile.y}`));

export function isBlocked(tile: Tile): boolean {
  return BLOCKED.has(`${tile.x},${tile.y}`);
}
