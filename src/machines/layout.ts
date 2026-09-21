import type { MachineType, StageKey } from '@/game/types';
import type { Tile } from '@/utils/grid';

/**
 * The floor, which **grows with the lease** (§8). Mutated in place by `applyEraLayout` so
 * everything holding a reference — the renderer, pathfinding — follows without being told.
 *
 * The steps are deliberately modest. A bigger room is more walking, and §13 records a run
 * where volunteers spent 80% of their visit walking and project lengths tripled; `npm run
 * time-budget` is what keeps this honest.
 */
export const GRID = { width: 6, height: 8 };

const ERA_SIZE = [
  { width: 6, height: 8 },
  { width: 6, height: 8 }, // the garage
  { width: 9, height: 10 }, // Unit 4B
  { width: 12, height: 12 }, // the warehouse
];

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
  // It sits out in the middle of the door end, facing up the room, so it reads as part of the
  // floor rather than tucked behind the benches. Facing +x from here would put its user on the
  // same tile as whoever runs the third tool slot.
  { id: 'lounge', type: 'lounge', label: 'Sofa & Kettle', tile: { x: 3, y: 6 }, stand: { x: 3, y: 5 } },
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
// Both pools are derived from the current grid, so a bigger lease is simply more room for
// kit rather than a set of fixed tiles that end up stranded in the middle of the floor.
function printerSlots(): { tile: Tile; stand: Tile }[] {
  // The back wall, working outward from the printer you start with.
  // Spaced out rather than shoulder to shoulder: a warehouse holds more printers than a
  // garage, but a wall of nine of them is neither a decision nor a room you want to look at.
  return [4, 2, 5, 7, 9, 11]
    .filter((x) => x < GRID.width)
    .map((x) => ({ tile: { x, y: 0 }, stand: { x, y: 1 } }));
}

// Tools line the open right-hand side rather than squeezing in between the benches: six
// stations along one wall in consecutive rows read as a pile.
function toolSlots(): { tile: Tile; stand: Tile }[] {
  const x = GRID.width - 1;
  const slots: { tile: Tile; stand: Tile }[] = [];
  for (let y = 2; y <= GRID.height - 3; y += 2) {
    slots.push({ tile: { x, y }, stand: { x: x - 1, y } });
  }
  return slots;
}

const slotsFor = (type: MachineType) => (type === 'fdm' ? printerSlots() : toolSlots());

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

/** Take a machine off the floor — its slot goes back in the pool. */
export function removeStation(id: string): boolean {
  const index = STATIONS.findIndex((s) => s.id === id);
  if (index < 0) return false;
  const [def] = STATIONS.splice(index, 1);
  delete STATION_MAP[id];
  BLOCKED.delete(`${def.tile.x},${def.tile.y}`);
  return true;
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

/** Front door — members appear and leave here. It follows the far corner as the room grows. */
export const DOOR: Tile = { x: 0, y: 7 };

/** The aisle. People loiter here rather than inside somebody's workspace. */
export const IDLE_TILES: Tile[] = [
  { x: 3, y: 3 },
  { x: 4, y: 3 },
  { x: 2, y: 5 },
  { x: 4, y: 5 },
];

/**
 * Resize the floor for a lease and put everything back against a wall. Signing for a bigger
 * unit means rearranging — a bench left on the tile it had in the garage would be standing in
 * the middle of the warehouse. Station **ids and types are preserved**; only their tiles move.
 */
export function applyEraLayout(era: number) {
  const size = ERA_SIZE[Math.min(ERA_SIZE.length - 1, Math.max(1, era))];
  GRID.width = size.width;
  GRID.height = size.height;
  DOOR.x = 0;
  DOOR.y = GRID.height - 1;

  const mid = Math.floor(GRID.width / 2);
  IDLE_TILES.length = 0;
  IDLE_TILES.push(
    { x: mid, y: 3 },
    { x: mid + 1, y: 3 },
    { x: mid, y: GRID.height - 4 },
    { x: mid + 1, y: GRID.height - 4 },
  );

  // The five you start with are anchored to the two walls; the sofa follows the door.
  const anchors: Record<string, { tile: Tile; stand: Tile }> = {
    'cad-desk': { tile: { x: 1, y: 0 }, stand: { x: 1, y: 1 } },
    'printer-1': { tile: { x: 3, y: 0 }, stand: { x: 3, y: 1 } },
    bench: { tile: { x: 0, y: 2 }, stand: { x: 1, y: 2 } },
    assembly: { tile: { x: 0, y: 4 }, stand: { x: 1, y: 4 } },
    // Same rule as the starting arrangement above: out in the middle of the door end,
    // facing up the room, with its user in front of it rather than behind.
    lounge: {
      tile: { x: Math.floor(GRID.width / 2), y: GRID.height - 2 },
      stand: { x: Math.floor(GRID.width / 2), y: GRID.height - 3 },
    },
  };

  const printers = printerSlots().filter((s) => s.tile.x !== 1 && s.tile.x !== 3);
  const tools = toolSlots();
  let nextPrinter = 0;
  let nextTool = 0;
  for (const station of STATIONS) {
    const anchor = anchors[station.id];
    const slot = anchor ?? (station.type === 'fdm' ? printers[nextPrinter++] : tools[nextTool++]);
    if (!slot) continue; // no room at this size; it keeps the tile it had
    station.tile = { ...slot.tile };
    station.stand = { ...slot.stand };
  }

  BLOCKED.clear();
  for (const station of STATIONS) BLOCKED.add(`${station.tile.x},${station.tile.y}`);
}

export function isBlocked(tile: Tile): boolean {
  return BLOCKED.has(`${tile.x},${tile.y}`);
}
