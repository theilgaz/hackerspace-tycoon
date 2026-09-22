import type { MachineType, StageKey } from '@/game/types';
import { findPath, sameTile, type Tile } from '@/utils/grid';

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

/**
 * Where the Shop's comforts stand (§7b). They get the **open edges** — the bottom row and
 * the odd rows of the right-hand column that the tool slots step over — rather than a wall
 * shared with the kit: the two working walls are already spoken for, and a fridge wedged
 * between the solder bench and the assembly table would be in somebody's way in a room
 * where being in the way costs hours.
 *
 * The first two columns of the bottom row are left clear because the door is down there and
 * everybody walks in through it.
 */
export function amenitySlots(): Tile[] {
  const slots: Tile[] = [];
  const bottom = GRID.height - 1;
  // Spaced out, then filled in — the same rule the printer wall follows. Seven comforts
  // shoulder to shoulder along one edge read as a skip, not as a room; with a tile between
  // them each one is a thing you bought.
  for (let x = 2; x < GRID.width; x += 2) slots.push({ x, y: bottom });
  for (let y = 3; y <= GRID.height - 3; y += 2) slots.push({ x: GRID.width - 1, y });
  for (let x = 3; x < GRID.width - 1; x += 2) slots.push({ x, y: bottom });
  return slots;
}

/**
 * Tiles the comforts occupy. Kept apart from `BLOCKED` on purpose: `applyEraLayout` wipes
 * that set and refills it from the stations, so anything folded into it would quietly stop
 * blocking the moment a lease was signed.
 */
const PROPS = new Set<string>();

/** Where one comfort stands, and which way it faces. `yaw` is quarter turns, 0-3. */
export interface Placement {
  x: number;
  y: number;
  yaw: number;
}

/** Floor-standing comforts the space owns, in the order they were bought. */
let amenityFloorIds: string[] = [];
/** Where the player has put them. Anything not in here takes the next derived slot. */
let amenityCustom: Record<string, Placement> = {};
const amenityPlaces = new Map<string, Placement>();

const key = (tile: { x: number; y: number }) => `${tile.x},${tile.y}`;

/**
 * Tiles a comfort must not stand on. **The stand tiles matter as much as the stations**: a
 * fridge parked on the tile somebody has to occupy to use the solder bench does not block
 * the bench, it strands it — the path finder simply never arrives and the station goes
 * quiet with nothing on screen to explain why.
 */
function reservedTiles(): Set<string> {
  const out = new Set<string>();
  for (const station of STATIONS) {
    out.add(key(station.tile));
    out.add(key(station.stand));
  }
  out.add(key(DOOR));
  for (const tile of IDLE_TILES) out.add(key(tile));
  return out;
}

/** Can this comfort stand here? Used by the room's move mode to light the legal tiles. */
export function amenityTileFree(tile: Tile, ignoreId?: string): boolean {
  if (tile.x < 0 || tile.y < 0 || tile.x >= GRID.width || tile.y >= GRID.height) return false;
  if (reservedTiles().has(key(tile))) return false;
  for (const [id, place] of amenityPlaces) {
    if (id !== ignoreId && place.x === tile.x && place.y === tile.y) return false;
  }
  return true;
}

/** Where a given comfort currently stands, custom or derived. */
export function amenityPlacement(id: string): Placement | undefined {
  return amenityPlaces.get(id);
}

function rebuildProps() {
  amenityPlaces.clear();
  const reserved = reservedTiles();
  const taken = new Set<string>();

  // Player-chosen tiles are laid down first, so a derived slot can never steal one. A
  // placement that has stopped being legal — a lease moved a bench onto it — is dropped
  // here and the item falls back to a derived slot rather than standing inside a table.
  for (const id of amenityFloorIds) {
    const custom = amenityCustom[id];
    if (!custom) continue;
    const at = key(custom);
    if (custom.x >= GRID.width || custom.y >= GRID.height) continue;
    if (reserved.has(at) || taken.has(at)) continue;
    amenityPlaces.set(id, { ...custom });
    taken.add(at);
  }

  const slots = amenitySlots();
  let next = 0;
  for (const id of amenityFloorIds) {
    if (amenityPlaces.has(id)) continue;
    while (next < slots.length && (taken.has(key(slots[next])) || reserved.has(key(slots[next])))) {
      next += 1;
    }
    if (next >= slots.length) continue; // more comforts than edges; it waits for a lease
    const slot = slots[next];
    next += 1;
    amenityPlaces.set(id, { x: slot.x, y: slot.y, yaw: 0 });
    taken.add(key(slot));
  }

  PROPS.clear();
  for (const place of amenityPlaces.values()) PROPS.add(key(place));
}

/**
 * Called whenever the owned list or the player's arrangement changes. Wall-mounted items
 * are not passed in — they take no floor and cannot be moved.
 */
export function setAmenityLayout(floorIds: string[], custom: Record<string, Placement>) {
  amenityFloorIds = floorIds;
  amenityCustom = custom;
  rebuildProps();
}

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

/**
 * Where the player has dragged a station, if anywhere. **A station carries its stand tile
 * with it**, which is the whole reason moving one is harder than moving a sofa: the tile in
 * front of a bench is not decoration, it is the only place a person can stand to use it.
 */
export interface StationPlacement {
  x: number;
  y: number;
  /** Quarter turns, 0-3. The stand is the neighbouring tile this points at. */
  yaw: number;
}

let stationCustom: Record<string, StationPlacement> = {};

/** yaw → where the user stands, in the same convention the renderer turns models by. */
export const STAND_OFFSET = [
  { x: 0, y: 1 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: -1, y: 0 },
];

export const yawOf = (def: StationDef): number => {
  const dx = def.stand.x - def.tile.x;
  const dy = def.stand.y - def.tile.y;
  const found = STAND_OFFSET.findIndex((o) => o.x === dx && o.y === dy);
  return found < 0 ? 0 : found;
};

const inBounds = (tile: Tile) =>
  tile.x >= 0 && tile.y >= 0 && tile.x < GRID.width && tile.y < GRID.height;

/** Can this station's body go here? */
export function stationTileFree(tile: Tile, ignoreId?: string): boolean {
  if (!inBounds(tile)) return false;
  if (DOOR.x === tile.x && DOOR.y === tile.y) return false;
  if (PROPS.has(key(tile))) return false;
  return !STATIONS.some(
    (other) =>
      other.id !== ignoreId &&
      ((other.tile.x === tile.x && other.tile.y === tile.y) ||
        (other.stand.x === tile.x && other.stand.y === tile.y)),
  );
}

/** Can somebody stand here to use it? Walkable floor, and nobody else's spot. */
function standFree(tile: Tile, ignoreId: string): boolean {
  if (!inBounds(tile)) return false;
  if (PROPS.has(key(tile))) return false;
  return !STATIONS.some(
    (other) =>
      (other.tile.x === tile.x && other.tile.y === tile.y) ||
      (other.id !== ignoreId && other.stand.x === tile.x && other.stand.y === tile.y),
  );
}

/**
 * Put a station at a tile facing a given way. **Turning is choosing which side somebody
 * stands on**, so a yaw whose stand tile is against a wall or under a bench is not refused —
 * the next legal quarter turn is taken instead, and a station with no legal side at all is
 * what makes the move itself illegal.
 */
export function placeStation(id: string, tile: Tile, yaw: number): boolean {
  const def = STATION_MAP[id];
  if (!def || !stationTileFree(tile, id)) return false;
  const was = { tile: def.tile, stand: def.stand };
  def.tile = { x: tile.x, y: tile.y };
  for (let step = 0; step < 4; step += 1) {
    const offset = STAND_OFFSET[(((yaw + step) % 4) + 4) % 4];
    const stand = { x: tile.x + offset.x, y: tile.y + offset.y };
    if (!standFree(stand, id)) continue;
    def.stand = stand;
    rebuildBlocked();
    // **Everything has to still be reachable from the door.** A bench dropped into a pinch
    // can wall another bench off entirely, and the symptom is not an error — it is a
    // station that quietly stops being used, because the path finder returns nothing and
    // the member simply stands there. Cheap to check on a click; impossible to debug later.
    if (everyStandReachable()) {
      stationCustom[id] = { x: tile.x, y: tile.y, yaw: yawOf(def) };
      return true;
    }
  }
  def.tile = was.tile;
  def.stand = was.stand;
  rebuildBlocked();
  return false;
}

/**
 * Would putting this comfort here cut a bench off from the door? Same hazard as moving a
 * station into a pinch, and the same silent symptom — a station nobody can reach does not
 * complain, it just stops being used.
 */
export function amenityMoveSafe(id: string, tile: Tile): boolean {
  const previous = amenityPlaces.get(id);
  if (!previous) return true;
  PROPS.delete(key(previous));
  PROPS.add(key(tile));
  const ok = everyStandReachable();
  PROPS.delete(key(tile));
  PROPS.add(key(previous));
  return ok;
}

/** Can somebody walk from the front door to every station's spot? */
function everyStandReachable(): boolean {
  return STATIONS.every(
    (station) =>
      sameTile(DOOR, station.stand) ||
      findPath(DOOR, station.stand, GRID.width, GRID.height, isBlocked).length > 0,
  );
}

/** Everything the player has rearranged, for the save file. */
export function stationPlacements(): Record<string, StationPlacement> {
  return { ...stationCustom };
}

/** Put the saved arrangement back. Anything that no longer fits is quietly dropped. */
export function setStationLayout(custom: Record<string, StationPlacement>) {
  stationCustom = {};
  for (const [id, place] of Object.entries(custom ?? {})) {
    if (!STATION_MAP[id]) continue;
    placeStation(id, { x: place.x, y: place.y }, place.yaw);
  }
  rebuildBlocked();
}

function rebuildBlocked() {
  BLOCKED.clear();
  for (const station of STATIONS) BLOCKED.add(key(station.tile));
  rebuildProps();
}

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
  amenityFloorIds = [];
  amenityCustom = {};
  amenityPlaces.clear();
  stationCustom = {};
  PROPS.clear();
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
  // The comforts move too — their slots are derived from the new grid, so this re-runs
  // rather than clearing. You do not leave the aquarium behind in the garage.
  rebuildProps();
  // **A lease resets the room, and that includes anything you rearranged.** Everything has
  // just been carried to a new wall in a bigger unit; putting the old tiles back on top of
  // that would drop a bench into the middle of the warehouse, which is the exact thing
  // `applyEraLayout` exists to prevent.
  stationCustom = {};
}

export function isBlocked(tile: Tile): boolean {
  const key = `${tile.x},${tile.y}`;
  return BLOCKED.has(key) || PROPS.has(key);
}
