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
  /** For printers: which model is sitting there. Drives capacity, speed and reliability. */
  model?: string;
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
  { id: 'printer-1', type: 'fdm', label: 'A1 Mini Combo', model: 'a1-mini', tile: { x: 3, y: 0 }, stand: { x: 3, y: 1 } },
  { id: 'bench', type: 'bench', label: 'Solder Bench', tile: { x: 0, y: 2 }, stand: { x: 1, y: 2 } },
  { id: 'assembly', type: 'assembly', label: 'Assembly Table', tile: { x: 0, y: 4 }, stand: { x: 1, y: 4 } },
  // The sofa sits at an angle facing the room: nobody puts a sofa nose-first into a wall.
  { id: 'lounge', type: 'lounge', label: 'Sofa & Kettle', tile: { x: 1, y: 6 }, stand: { x: 2, y: 7 } },
];

/**
 * Where new kit lands. Machines carry on along the same two walls rather than appearing
 * wherever there is room, and **printers and tools get separate walls on purpose**: they
 * used to share one pool, so a player who bought four printers filled the floor and the
 * CNC they had spent three weeks building had nowhere to go. It logged a warning and was
 * gone. Three slots each is also the cap on both — the back wall holds four printers in
 * total, and the left wall has exactly enough room for the CNC, the reflow oven and the
 * dry box.
 */
const PRINTER_SLOTS: { tile: Tile; stand: Tile }[] = [
  { tile: { x: 4, y: 0 }, stand: { x: 4, y: 1 } },
  { tile: { x: 2, y: 0 }, stand: { x: 2, y: 1 } },
  { tile: { x: 5, y: 0 }, stand: { x: 5, y: 1 } },
];

// Tools line the open right-hand side rather than squeezing in between the benches. Six
// stations along one wall in consecutive rows read as a pile, and it left half the floor bare.
const TOOL_SLOTS: { tile: Tile; stand: Tile }[] = [
  { tile: { x: 5, y: 2 }, stand: { x: 4, y: 2 } },
  { tile: { x: 5, y: 4 }, stand: { x: 4, y: 4 } },
  { tile: { x: 5, y: 6 }, stand: { x: 4, y: 6 } },
];

const slotsFor = (type: MachineType) => (type === 'fdm' ? PRINTER_SLOTS : TOOL_SLOTS);

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

/** How many more of this kind of machine the space has room for. */
export function freeSlots(type: MachineType = 'fdm'): number {
  const used = new Set(STATIONS.map((s) => `${s.tile.x},${s.tile.y}`));
  return slotsFor(type).filter((s) => !used.has(`${s.tile.x},${s.tile.y}`)).length;
}

/** Install a newly built or bought machine into the next free expansion slot. */
export function installStation(
  type: MachineType,
  id: string,
  model?: string,
  label?: string,
): StationDef | null {
  const used = new Set(STATIONS.map((s) => `${s.tile.x},${s.tile.y}`));
  const slot = slotsFor(type).find((s) => !used.has(`${s.tile.x},${s.tile.y}`));
  if (!slot) return null;
  const def: StationDef = {
    id,
    type,
    label: label ?? MACHINE_LABEL[type],
    model,
    tile: slot.tile,
    stand: slot.stand,
  };
  STATIONS.push(def);
  STATION_MAP[id] = def;
  BLOCKED.add(`${def.tile.x},${def.tile.y}`);
  return def;
}

/** Machines added by tool projects, so a save can put them back. */
export function installedStations(): {
  id: string;
  type: MachineType;
  model?: string;
  label?: string;
}[] {
  const starting = new Set(STARTING_STATIONS.map((s) => s.id));
  return STATIONS.filter((s) => !starting.has(s.id)).map((s) => ({
    id: s.id,
    type: s.type,
    model: s.model,
    label: s.label,
  }));
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
