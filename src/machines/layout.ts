import type { MachineType, Seat, StageKey } from '@/game/types';
import { SEATS } from '@/utils/constants';
import { amenityDef } from '@/utils/amenities';
import { FURNITURE_MAP } from '@/utils/furniture';
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
  { width: 15, height: 14 }, // the old factory
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
  /**
   * Tiles it covers. Everything is one tile except the large project table, which is two:
   * the second runs sideways from the first, across the stand tile's line of sight.
   */
  span?: number;
  /**
   * Bought from the Build menu rather than installed into a kit slot (§4d). It has no slot
   * of its own, so a lease puts it back wherever there is room rather than on a fixed wall.
   */
  furniture?: boolean;
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
  { id: 'cad-desk', type: 'cad-desk', label: 'Software Station', tile: { x: 1, y: 0 }, stand: { x: 1, y: 1 } },
  { id: 'printer-1', type: 'fdm', label: 'A1 Mini Combo', model: 'a1-mini', tile: { x: 3, y: 0 }, stand: { x: 3, y: 1 } },
  { id: 'bench', type: 'bench', label: 'Maker Station', model: 'solder-bench', tile: { x: 0, y: 2 }, stand: { x: 1, y: 2 } },
  { id: 'assembly', type: 'assembly', label: 'Assembly Table', tile: { x: 0, y: 4 }, stand: { x: 1, y: 4 } },
  // A second desk, because one seat per workstation (§4d) would otherwise make the garage a
  // one-person CAD shop on day one — and the first thing a new player learns should be the
  // pipeline, not that they need to go shopping.
  // It sits in the back corner rather than by the door: anything next to the door turns the
  // way in into a pinch, and a pinch is one purchase away from a wall.
  { id: 'desk-2', type: 'cad-desk', label: 'Software Station', tile: { x: 0, y: 0 }, stand: { x: 0, y: 1 } },
  // Every project starts at a table (§4d), so the garage comes with one. It sits out in the
  // floor rather than against a wall, because people sit round it on every side.
  { id: 'table-1', type: 'table-small', label: 'Project Table', tile: { x: 3, y: 3 }, stand: { x: 3, y: 4 } },
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
  return [4, 2, 5, 7, 9, 11, 13]
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
    for (const tile of footprint(station)) out.add(key(tile));
    out.add(key(station.stand));
    // A table's chairs are drawn on the tiles round it, so nothing else stands there.
    if (isTable(station.type)) {
      for (const tile of footprint(station)) {
        for (const step of STAND_OFFSET) out.add(key({ x: tile.x + step.x, y: tile.y + step.y }));
      }
    }
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
  PROPS.clear();
  const reserved = reservedTiles();

  // **Every prop is laid down with the room still walkable**, derived ones included. Only a
  // move by hand used to be checked, so the derived slots — the whole bottom row — could
  // fill up one comfort at a time until the door was walled in, and every station in the
  // room went quiet at once. Nothing on screen says why when that happens (§7b).
  const tryPlace = (id: string, place: Placement): boolean => {
    const at = key(place);
    if (place.x >= GRID.width || place.y >= GRID.height) return false;
    if (reserved.has(at) || PROPS.has(at)) return false;
    PROPS.add(at);
    if (!everyStandReachable()) {
      PROPS.delete(at);
      return false;
    }
    amenityPlaces.set(id, { ...place });
    return true;
  };

  // Player-chosen tiles are laid down first, so a derived slot can never steal one. A
  // placement that has stopped being legal — a lease moved a bench onto it — is dropped
  // here and the item falls back to a derived slot rather than standing inside a table.
  for (const id of amenityFloorIds) {
    const custom = amenityCustom[id];
    if (custom) tryPlace(id, custom);
  }

  const slots = amenitySlots();
  let next = 0;
  for (const id of amenityFloorIds) {
    if (amenityPlaces.has(id)) continue;
    while (next < slots.length && !tryPlace(id, { x: slots[next].x, y: slots[next].y, yaw: 0 })) {
      next += 1;
    }
    next += 1;
    if (amenityPlaces.has(id)) continue;
    // **The edges ran out, so anywhere will do.** A plant bought and paid for that never
    // appears reads as a bug, not as a full room; the Build panel refuses a purchase only
    // when there is genuinely nowhere left (see `amenityRoom`).
    for (const tile of openTiles()) {
      if (tryPlace(id, { x: tile.x, y: tile.y, yaw: 0 })) break;
    }
  }
}

/** Every floor tile, the room's edges first and the middle last. */
function openTiles(): Tile[] {
  const out: Tile[] = [];
  for (let y = 0; y < GRID.height; y += 1) for (let x = 0; x < GRID.width; x += 1) out.push({ x, y });
  const mid = { x: (GRID.width - 1) / 2, y: (GRID.height - 1) / 2 };
  return out.sort(
    (a, b) => Math.hypot(b.x - mid.x, b.y - mid.y) - Math.hypot(a.x - mid.x, a.y - mid.y),
  );
}

/** Is there anywhere left to stand one more floor item? Asked before selling one. */
export function amenityRoom(): boolean {
  const reserved = reservedTiles();
  for (const tile of openTiles()) {
    const at = key(tile);
    if (reserved.has(at) || PROPS.has(at)) continue;
    PROPS.add(at);
    const ok = everyStandReachable();
    PROPS.delete(at);
    if (ok) return true;
  }
  return false;
}

// --- The back wall -----------------------------------------------------------------

/**
 * Something hung on the back wall: how wide it is in tiles, and where it goes if the player
 * has not chosen. A width of 0 is a backdrop — the acoustic panels run behind everything else
 * and clash with nothing.
 */
export interface WallItem {
  id: string;
  width: number;
  /** Where it hangs by default, as a tile column along the back wall; may be fractional. */
  prefer?: number;
}

let wallItems: WallItem[] = [];
const wallPlaces = new Map<string, number>();

/** Where along the back wall a hung comfort is, as a tile column. */
export function wallColumn(id: string): number | undefined {
  return wallPlaces.get(id);
}

/**
 * Can this item hang at this column? Inside the wall, and clear of everything else hung
 * there — two things on one nail was the one rule the old fixed spots existed to keep.
 */
export function wallColumnFree(column: number, id: string): boolean {
  const item = wallItems.find((w) => w.id === id);
  if (!item) return false;
  const half = Math.max(1, item.width) / 2;
  if (column - half < -0.5 || column + half > GRID.width - 0.5) return false;
  if (!item.width) return true;
  for (const other of wallItems) {
    if (other.id === id || !other.width) continue;
    const at = wallPlaces.get(other.id);
    if (at === undefined) continue;
    if (Math.abs(at - column) < (other.width + item.width) / 2) return false;
  }
  return true;
}

function rebuildWall(custom: Record<string, Placement>) {
  wallPlaces.clear();
  const tryHang = (id: string, column: number): boolean => {
    if (!wallColumnFree(column, id)) return false;
    wallPlaces.set(id, column);
    return true;
  };
  // Chosen spots first, so a default can never take one; then the defaults; then the first
  // free column, so something paid for always hangs somewhere.
  for (const item of wallItems) {
    const place = custom[item.id];
    if (place && place.y < 0) tryHang(item.id, place.x);
  }
  const spots = [0.6, 2.6, 4.6, 1.6, 3.6, 6.6, 8.6, 10.6, 12.6];
  let next = 0;
  for (const item of wallItems) {
    if (wallPlaces.has(item.id)) continue;
    if (item.prefer !== undefined && tryHang(item.id, Math.min(GRID.width - 1.4, item.prefer))) continue;
    while (next < spots.length && !tryHang(item.id, Math.min(GRID.width - 2, spots[next]))) next += 1;
    next += 1;
    if (wallPlaces.has(item.id)) continue;
    for (let column = 0; column < GRID.width; column += 1) if (tryHang(item.id, column)) break;
  }
}

/**
 * Called whenever the owned list or the player's arrangement changes. Wall-hung items take
 * no floor, so they are laid out on their own row: the back wall.
 */
export function setAmenityLayout(
  floorIds: string[],
  custom: Record<string, Placement>,
  wall: WallItem[] = [],
) {
  amenityFloorIds = floorIds;
  amenityCustom = custom;
  wallItems = wall;
  rebuildProps();
  rebuildWall(custom);
}

export const MACHINE_LABEL: Record<MachineType, string> = {
  fdm: 'FDM Printer',
  bench: 'Maker Station',
  assembly: 'Assembly Table',
  'cad-desk': 'Software Station',
  lounge: 'Sofa & Kettle',
  cnc: 'CNC Router',
  reflow: 'Reflow Oven',
  drybox: 'Filament Dry Box',
  'table-small': 'Small Project Table',
  'table-large': 'Large Project Table',
  learning: 'Learning Station',
};

/** The tiles a station covers. One, except the large table. */
export function footprint(def: Pick<StationDef, 'tile' | 'stand' | 'span'>): Tile[] {
  const tiles = [{ ...def.tile }];
  const span = def.span ?? 1;
  if (span > 1) {
    // Sideways from the stand's line of sight, so the long edge faces the person using it.
    const along = sideways(def);
    for (let i = 1; i < span; i += 1) {
      tiles.push({ x: def.tile.x + along.x * i, y: def.tile.y + along.y * i });
    }
  }
  return tiles;
}

/** The unit step across a station's front — always +x or +y, so the footprint is stable. */
function sideways(def: Pick<StationDef, 'tile' | 'stand'>): Tile {
  const dx = def.stand.x - def.tile.x;
  return dx === 0 ? { x: 1, y: 0 } : { x: 0, y: 1 };
}

/** How far a workstation's chair is pulled out from the middle of its tile (`SpaceView.chair`). */
export const CHAIR_REACH = 0.52;

/** How many people can work at it at once. Undefined means no limit. */
export function seatsOf(def: Pick<StationDef, 'type' | 'model'>): number | undefined {
  // A variant (a long bench, a pair desk) says its own number; everything else its kind's.
  return (def.model ? FURNITURE_MAP[def.model]?.seats : undefined) ?? SEATS[def.type];
}

/**
 * Where the n-th person at a station sits, in fractional tile coordinates. **A seat is a
 * drawing position, not a tile**: the path finder walks everyone to the stand tile, and the
 * renderer puts them round the table from there. Ten people on ten tiles would need a
 * room the garage does not have.
 */
export function seatPosition(def: StationDef, index: number): Seat {
  const tiles = footprint(def);
  const front = { x: def.stand.x - def.tile.x, y: def.stand.y - def.tile.y };
  const across = sideways(def);
  const centre = {
    x: tiles.reduce((sum, t) => sum + t.x, 0) / tiles.length,
    y: tiles.reduce((sum, t) => sum + t.y, 0) / tiles.length,
  };
  const at = (x: number, y: number, look = centre): Seat => ({ x, y, look: { ...look } });

  if (def.model === 'meeting-corner') {
    // A sofa of three along the back, three armchairs along the front, facing each other
    // over the low table.
    const side = index % 2 === 0 ? -1 : 1;
    const along = [-0.62, 0, 0.62][Math.floor(index / 2) % 3];
    return at(centre.x + front.x * side * 0.55 + across.x * along, centre.y + front.y * side * 0.55 + across.y * along);
  }
  if (def.type === 'table-small') {
    // The side facing the room first, then the flanks, then the back.
    const order = [front, across, { x: -across.x, y: -across.y }, { x: -front.x, y: -front.y }];
    const side = order[index % order.length];
    return at(def.tile.x + side.x * 0.6, def.tile.y + side.y * 0.6);
  }
  if (def.type === 'table-large') {
    // Four down each long side, one at each end.
    const places: Seat[] = [];
    for (const tile of tiles) {
      for (const shift of [-0.22, 0.22]) {
        places.push(at(tile.x + front.x * 0.62 + across.x * shift, tile.y + front.y * 0.62 + across.y * shift));
      }
    }
    places.push(at(tiles[0].x - across.x * 0.62, tiles[0].y - across.y * 0.62));
    places.push(at(tiles[tiles.length - 1].x + across.x * 0.62, tiles[tiles.length - 1].y + across.y * 0.62));
    for (const tile of tiles) {
      for (const shift of [-0.22, 0.22]) {
        places.push(at(tile.x - front.x * 0.62 + across.x * shift, tile.y - front.y * 0.62 + across.y * shift));
      }
    }
    return places[index % places.length];
  }
  const seats = seatsOf(def) ?? 1;
  const look = { x: centre.x, y: centre.y };
  // **In the chair, not on the stand tile.** The renderer pulls every chair up to the desk
  // (`CHAIR_REACH` from the station's middle), and seating people a full tile out put them
  // behind their own chair, sitting on air. The assembly table has no chairs: its crew
  // works on their feet.
  const reach = def.type === 'assembly' ? 0.72 : CHAIR_REACH;
  const stand = def.type === 'assembly';
  const shift = seats <= 1 ? 0 : (index % seats) - (seats - 1) / 2;
  // A long bench spreads its three chairs over both of its tiles.
  const gap = def.type === 'assembly' ? 0.5 : seats > 2 ? (tiles.length * 0.9) / seats : 0.44;
  return {
    x: centre.x + front.x * reach + across.x * shift * gap,
    y: centre.y + front.y * reach + across.y * shift * gap,
    look: { x: look.x + across.x * shift * gap, y: look.y + across.y * shift * gap },
    stand,
  };
}

/** Live station list — grows when a tool project ships. */
export const STATIONS: StationDef[] = [...STARTING_STATIONS];
export const STATION_MAP: Record<string, StationDef> = Object.fromEntries(
  STATIONS.map((s) => [s.id, s]),
);

const BLOCKED = new Set<string>();

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

const covers = (station: StationDef, tile: Tile) =>
  footprint(station).some((t) => t.x === tile.x && t.y === tile.y);

/** Can this station's body go here? */
export function stationTileFree(tile: Tile, ignoreId?: string): boolean {
  if (!inBounds(tile)) return false;
  if (DOOR.x === tile.x && DOOR.y === tile.y) return false;
  if (PROPS.has(key(tile))) return false;
  return !STATIONS.some(
    (other) =>
      other.id !== ignoreId &&
      (covers(other, tile) || (other.stand.x === tile.x && other.stand.y === tile.y)),
  );
}

/** Can somebody stand here to use it? Walkable floor, and nobody else's spot. */
function standFree(tile: Tile, ignoreId: string): boolean {
  if (!inBounds(tile)) return false;
  if (DOOR.x === tile.x && DOOR.y === tile.y) return false;
  if (PROPS.has(key(tile))) return false;
  return !STATIONS.some(
    (other) =>
      (other.id !== ignoreId && covers(other, tile)) ||
      (other.id !== ignoreId && other.stand.x === tile.x && other.stand.y === tile.y),
  );
}

/** Would this station fit here facing this way, ignoring whether the room stays walkable? */
function fitsAt(def: StationDef, tile: Tile, yaw: number): { stand: Tile } | null {
  const offset = STAND_OFFSET[((yaw % 4) + 4) % 4];
  const stand = { x: tile.x + offset.x, y: tile.y + offset.y };
  const body = footprint({ tile, stand, span: def.span });
  if (!body.every((t) => stationTileFree(t, def.id))) return null;
  // Its own stand must not be under its own second tile.
  if (body.some((t) => t.x === stand.x && t.y === stand.y)) return null;
  if (!standFree(stand, def.id)) return null;
  return { stand };
}

/** Is there any way this station could stand on this tile? What the move markers ask. */
export function stationFits(id: string, tile: Tile): boolean {
  const def = STATION_MAP[id];
  if (!def) return false;
  return [0, 1, 2, 3].some((yaw) => fitsAt(def, tile, yaw) !== null);
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
  for (let step = 0; step < 4; step += 1) {
    const fit = fitsAt(def, tile, yaw + step);
    if (!fit) continue;
    def.tile = { x: tile.x, y: tile.y };
    def.stand = fit.stand;
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

/**
 * Can somebody walk from the front door to every station's spot? One flood fill from the
 * door rather than a path search per station: this runs for every candidate tile when the
 * room looks for somewhere to put a new desk, and for every comfort when the props are laid
 * down, so a search per station made the Build panel stutter.
 */
function everyStandReachable(): boolean {
  const reached = reachableFromDoor();
  return STATIONS.every((station) => station.stand.x < 0 || reached.has(key(station.stand)));
}

/** Every floor tile somebody can walk to from the door. One flood fill, not a path per tile. */
function reachableFromDoor(): Set<string> {
  const reached = new Set<string>([key(DOOR)]);
  const queue: Tile[] = [{ ...DOOR }];
  while (queue.length) {
    const at = queue.shift()!;
    for (const step of STAND_OFFSET) {
      const next = { x: at.x + step.x, y: at.y + step.y };
      if (!inBounds(next)) continue;
      const k = key(next);
      if (reached.has(k) || isBlocked(next)) continue;
      reached.add(k);
      queue.push(next);
    }
  }
  return reached;
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
  for (const station of STATIONS) for (const tile of footprint(station)) BLOCKED.add(key(tile));
  rebuildProps();
  deriveIdleTiles();
}

/**
 * Where people loiter. Derived rather than fixed, because a project table in the middle of
 * the floor now takes exactly the tiles the old list named — and a person told to wait on
 * a blocked tile never arrives.
 */
function deriveIdleTiles() {
  const stands = new Set(STATIONS.map((s) => key(s.stand)));
  const mid = { x: (GRID.width - 1) / 2, y: (GRID.height - 1) / 2 };
  const open: Tile[] = [];
  for (let y = 1; y < GRID.height - 1; y += 1) {
    for (let x = 1; x < GRID.width; x += 1) {
      const at = key({ x, y });
      if (BLOCKED.has(at) || PROPS.has(at) || stands.has(at)) continue;
      if (x === DOOR.x && y === DOOR.y) continue;
      open.push({ x, y });
    }
  }
  open.sort(
    (a, b) => Math.hypot(a.x - mid.x, a.y - mid.y) - Math.hypot(b.x - mid.x, b.y - mid.y),
  );
  IDLE_TILES.length = 0;
  IDLE_TILES.push(...open.slice(0, 4));
  if (!IDLE_TILES.length) IDLE_TILES.push({ ...DOOR });
}

/** Every tile any station covers, for the slot checks below. */
function usedTiles(): Set<string> {
  const used = new Set<string>();
  for (const station of STATIONS) {
    for (const tile of footprint(station)) used.add(key(tile));
    used.add(key(station.stand));
  }
  return used;
}

/** How many more of this kind of machine the space has room for. */
export function freeSlots(type: MachineType = 'fdm'): number {
  const used = usedTiles();
  return slotsFor(type).filter((s) => !used.has(key(s.tile)) && !used.has(key(s.stand))).length;
}

/** Install a newly built or bought machine into the next free expansion slot. */
export function installStation(
  type: MachineType,
  id: string,
  model?: string,
  label?: string,
): StationDef | null {
  const used = usedTiles();
  const slot = slotsFor(type).find((s) => !used.has(key(s.tile)) && !used.has(key(s.stand)));
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
  rebuildBlocked();
  return def;
}

/**
 * Where a piece of bought furniture wants to stand, best first. Desks and benches go against
 * a wall, because that is what a workshop looks like and it keeps the aisle open; tables go
 * out in the floor, because people sit round them on every side.
 *
 * The kit slots — the printer wall and the tool column — are kept out of it. A desk bought
 * today must not take the tile the CNC will need in three weeks, which is the exact bug the
 * separate printer and tool walls were built to prevent (§5).
 */
function furnitureCandidates(type: MachineType): { tile: Tile; yaw: number }[] {
  const out: { tile: Tile; yaw: number }[] = [];
  const W = GRID.width;
  const H = GRID.height;
  const table = type === 'table-small' || type === 'table-large';
  if (!table) {
    for (let x = 0; x < W; x += 1) out.push({ tile: { x, y: 0 }, yaw: 0 });
    for (let y = 1; y < H - 1; y += 1) out.push({ tile: { x: 0, y }, yaw: 1 });
    for (let y = 1; y < H - 1; y += 1) out.push({ tile: { x: W - 1, y }, yaw: 3 });
  }
  const mid = { x: (W - 1) / 2, y: (H - 1) / 2 };
  const inner: Tile[] = [];
  for (let y = 1; y < H - 1; y += 1) for (let x = 1; x < W - 1; x += 1) inner.push({ x, y });
  inner.sort((a, b) => Math.hypot(a.x - mid.x, a.y - mid.y) - Math.hypot(b.x - mid.x, b.y - mid.y));
  for (const tile of inner) for (const yaw of [0, 1, 2, 3]) out.push({ tile, yaw });
  return out;
}

function kitSlotTiles(): Set<string> {
  const out = new Set<string>();
  for (const slot of [...printerSlots(), ...toolSlots()]) {
    out.add(key(slot.tile));
    out.add(key(slot.stand));
  }
  return out;
}

/**
 * Find a spot for a piece of furniture and put it there. It is tried in place and kept only
 * if every station — this one included — can still be reached from the door, the same rule
 * moving anything follows. Null when the room is full, which is the honest answer to "can
 * I fit a large table in the garage".
 */
function seatFurniture(def: StationDef): boolean {
  const reserved = kitSlotTiles();
  for (const pass of [true, false]) {
    for (const { tile, yaw } of furnitureCandidates(def.type)) {
      const fit = fitsAt(def, tile, yaw);
      if (!fit) continue;
      const body = footprint({ tile, stand: fit.stand, span: def.span });
      // First pass keeps clear of the kit slots; the second allows them, so a full room
      // still takes the desk rather than refusing it outright.
      if (pass && [...body, fit.stand].some((t) => reserved.has(key(t)))) continue;
      // Idle tiles are derived, so anything may take one — but nothing goes right beside the
      // door. The way in is the one tile every path in the room shares.
      if (body.some((t) => Math.abs(t.x - DOOR.x) + Math.abs(t.y - DOOR.y) <= 1)) continue;
      // Tables keep a clear ring between them: chairs are drawn round every side, and two
      // tables shoulder to shoulder read as one enormous one with a crew of fourteen.
      if (isTable(def.type) && tooCloseToATable(def.id, body)) continue;
      def.tile = { ...tile };
      def.stand = fit.stand;
      // A trial only needs the station tiles; the props are laid out again once, on success.
      blockStations();
      if (everyStandReachable()) {
        rebuildBlocked();
        return true;
      }
    }
  }
  def.tile = { x: -1, y: -1 };
  def.stand = { x: -1, y: -1 };
  blockStations();
  return false;
}

function tooCloseToATable(id: string, body: Tile[]): boolean {
  return STATIONS.some(
    (other) =>
      other.id !== id &&
      isTable(other.type) &&
      footprint(other).some((t) => body.some((b) => Math.abs(t.x - b.x) <= 2 && Math.abs(t.y - b.y) <= 2)),
  );
}

function blockStations() {
  BLOCKED.clear();
  for (const station of STATIONS) for (const tile of footprint(station)) BLOCKED.add(key(tile));
}

/** Can a new piece of this furniture go anywhere at all? The Build menu asks before selling. */
export function furnitureFits(type: MachineType, span = 1): boolean {
  const probe: StationDef = {
    id: '__probe__',
    type,
    label: '',
    tile: { x: -1, y: -1 },
    stand: { x: -1, y: -1 },
    span,
    furniture: true,
  };
  STATIONS.push(probe);
  STATION_MAP[probe.id] = probe;
  const ok = seatFurniture(probe);
  STATIONS.pop();
  delete STATION_MAP[probe.id];
  rebuildBlocked();
  return ok;
}

/**
 * Could a new station of this type stand on this tile, facing some legal way, with the
 * room still walkable? Asked by Build mode for every tile while something is being placed
 * — before anything is paid for. A probe goes on the floor and comes straight off again.
 */
export function newStationFitsAt(type: MachineType, span: number, tile: Tile): boolean {
  if (!inBounds(tile)) return false;
  const probe: StationDef = {
    id: '__place__',
    type,
    label: '',
    tile: { x: -1, y: -1 },
    stand: { x: -1, y: -1 },
    span,
    furniture: true,
  };
  STATIONS.push(probe);
  STATION_MAP[probe.id] = probe;
  const ok = placeStation(probe.id, tile, 0);
  STATIONS.pop();
  delete STATION_MAP[probe.id];
  delete stationCustom[probe.id];
  rebuildBlocked();
  return ok;
}

/** Could a new floor comfort stand on this tile without walling anything in? */
export function newAmenityFitsAt(tile: Tile): boolean {
  if (!amenityTileFree(tile)) return false;
  const at = key(tile);
  PROPS.add(at);
  const ok = everyStandReachable();
  PROPS.delete(at);
  return ok;
}

/** Put a bought table or workstation on the floor. Null if there is no room for it. */
export function installFurniture(
  type: MachineType,
  id: string,
  label: string,
  span = 1,
  model?: string,
): StationDef | null {
  const def: StationDef = {
    id,
    type,
    label,
    tile: { x: -1, y: -1 },
    stand: { x: -1, y: -1 },
    span,
    furniture: true,
    // Which catalogue piece it is: the variants draw, seat and work differently.
    model,
  };
  STATIONS.push(def);
  STATION_MAP[id] = def;
  if (seatFurniture(def)) return def;
  STATIONS.pop();
  delete STATION_MAP[id];
  rebuildBlocked();
  return null;
}

/** Take a machine off the floor — its slot goes back in the pool. */
export function removeStation(id: string): boolean {
  const index = STATIONS.findIndex((s) => s.id === id);
  if (index < 0) return false;
  STATIONS.splice(index, 1);
  delete STATION_MAP[id];
  rebuildBlocked();
  return true;
}

/** Machines added by tool projects, so a save can put them back. */
export function installedStations(): {
  id: string;
  type: MachineType;
  model?: string;
  label?: string;
  span?: number;
  furniture?: boolean;
}[] {
  const starting = new Set(STARTING_STATIONS.map((s) => s.id));
  return STATIONS.filter((s) => !starting.has(s.id)).map((s) => ({
    id: s.id,
    type: s.type,
    model: s.model,
    label: s.label,
    span: s.span,
    furniture: s.furniture,
  }));
}

/** Test hooks need the space back at its starting state between headless runs. */
export function resetStations() {
  STATIONS.length = 0;
  // Copies, not the originals: stations are moved in place, and a headless harness that
  // runs a dozen seeds would otherwise start every run with the last one's arrangement.
  STATIONS.push(...STARTING_STATIONS.map((s) => ({ ...s, tile: { ...s.tile }, stand: { ...s.stand } })));
  for (const key of Object.keys(STATION_MAP)) delete STATION_MAP[key];
  for (const s of STATIONS) STATION_MAP[s.id] = s;
  BLOCKED.clear();
  for (const s of STATIONS) for (const tile of footprint(s)) BLOCKED.add(key(tile));
  amenityFloorIds = [];
  amenityCustom = {};
  amenityPlaces.clear();
  stationCustom = {};
  PROPS.clear();
}

/** Where the work of each stage physically happens. */
export const STAGE_STATION: Record<StageKey, MachineType | null> = {
  // The kickoff happens at whichever project table the project holds (§4d). The type here
  // only says "a table"; the sim seats the crew at the specific one.
  concept: 'table-small',
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

/** Every station of a type — there can be several desks now, each with its own seat. */
export function stationsOfType(type: MachineType): StationDef[] {
  return STATIONS.filter((s) => s.type === type);
}

export const isTable = (type: MachineType) => type === 'table-small' || type === 'table-large';

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

  // The kit you start with is anchored to the two walls; the sofa follows the door and the
  // project table stays out in the floor.
  const anchors: Record<string, { tile: Tile; stand: Tile }> = {
    'cad-desk': { tile: { x: 1, y: 0 }, stand: { x: 1, y: 1 } },
    'printer-1': { tile: { x: 3, y: 0 }, stand: { x: 3, y: 1 } },
    bench: { tile: { x: 0, y: 2 }, stand: { x: 1, y: 2 } },
    assembly: { tile: { x: 0, y: 4 }, stand: { x: 1, y: 4 } },
    'desk-2': { tile: { x: 0, y: 0 }, stand: { x: 0, y: 1 } },
    'table-1': { tile: { x: mid, y: 3 }, stand: { x: mid, y: 4 } },
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
  const furniture: StationDef[] = [];
  for (const station of STATIONS) {
    const anchor = anchors[station.id];
    if (!anchor && station.furniture) {
      // Bought furniture has no slot of its own; it goes wherever there is room once the
      // kit is back against the walls.
      furniture.push(station);
      station.tile = { x: -1, y: -1 };
      station.stand = { x: -1, y: -1 };
      continue;
    }
    const slot = anchor ?? (station.type === 'fdm' ? printers[nextPrinter++] : tools[nextTool++]);
    if (!slot) continue; // no room at this size; it keeps the tile it had
    station.tile = { ...slot.tile };
    station.stand = { ...slot.stand };
    // The sofa grows with the lease: a two-seater by the garage door, a proper corner with
    // a side table from Unit 4B on.
    if (station.type === 'lounge') station.span = era >= 2 ? 2 : undefined;
  }

  // The comforts move too — their slots are derived from the new grid, so this re-runs
  // rather than clearing. You do not leave the aquarium behind in the garage.
  rebuildBlocked();
  for (const station of furniture) {
    // A lease only ever makes the room bigger, so everything that fitted before fits now.
    // If one somehow does not, it waits off the floor rather than standing inside a wall.
    seatFurniture(station);
  }
  rebuildBlocked();
  // **A lease resets the room, and that includes anything you rearranged.** Everything has
  // just been carried to a new wall in a bigger unit; putting the old tiles back on top of
  // that would drop a bench into the middle of the warehouse, which is the exact thing
  // `applyEraLayout` exists to prevent.
  stationCustom = {};
}

// The garage as it stands on day one, before anything has been moved or bought.
rebuildBlocked();

export function isBlocked(tile: Tile): boolean {
  const key = `${tile.x},${tile.y}`;
  return BLOCKED.has(key) || PROPS.has(key);
}

/**
 * Where people stand or sit to use a comfort on a break (§7b), one entry per person it
 * takes. **The seat is a drawing position and the tile is where the path finder takes
 * them** — the same split a project table uses: a prop blocks its own tile, so everybody
 * walks to a free tile beside it and the renderer puts them in the chair or at the end of
 * the table from there. Empty when it is not on the floor or nobody can get next to it.
 */
export function leisureSpots(id: string): { tile: Tile; seat: Seat }[] {
  const use = amenityDef(id)?.use;
  const place = amenityPlaces.get(id);
  if (!use || !place) return [];
  const turn = (place.yaw * Math.PI) / 2;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  // The prop's frame into the grid's: the renderer turns the node by `rotation.y`, and the
  // grid's x and y are the world's x and z.
  const toGrid = (x: number, z: number) => ({ x: place.x + x * c + z * s, y: place.y - x * s + z * c });
  const stands = new Set(STATIONS.map((station) => key(station.stand)));
  // Reachable, not merely free: the tile between two props on the bottom row is empty
  // and walled in, and a break chosen there is somebody walking nowhere.
  const reached = reachableFromDoor();
  const open = (tile: Tile) => reached.has(key(tile)) && !(tile.x === DOOR.x && tile.y === DOOR.y);
  const around = STAND_OFFSET.map((step) => ({ x: place.x + step.x, y: place.y + step.y })).filter(open);
  if (!around.length) return [];
  // Nearest to where the spot is, and off a workstation's stand tile where there is a choice.
  const rank = (tile: Tile, at: { x: number; y: number }) =>
    Math.hypot(tile.x - at.x, tile.y - at.y) + (stands.has(key(tile)) ? 2 : 0);
  const out: { tile: Tile; seat: Seat }[] = [];
  const used = new Set<string>();
  for (const spot of use.spots) {
    const at = toGrid(spot.x, spot.z);
    if (spot.sit !== undefined) {
      // In the seat itself: walk to the nearest free tile, then sit down on the seat.
      const tile = [...around].sort((a, b) => rank(a, at) - rank(b, at))[0];
      out.push({ tile, seat: { x: at.x, y: at.y, look: toGrid(spot.look.x, spot.look.z), height: spot.sit } });
      continue;
    }
    // **On their feet, on a floor tile of their own.** A spot drawn at the prop's edge put
    // people half inside the fridge, or outside the room when the prop stood by a wall.
    const tile = around.filter((t) => !used.has(key(t))).sort((a, b) => rank(a, at) - rank(b, at))[0];
    if (!tile) continue;
    used.add(key(tile));
    const lean = 0.22; // a step toward the thing, so they read as using it
    out.push({
      tile,
      seat: {
        x: tile.x + (place.x - tile.x) * lean,
        y: tile.y + (place.y - tile.y) * lean,
        look: { x: place.x, y: place.y },
        stand: true,
      },
    });
  }
  // Nobody plays table tennis with one end of the table against a wall.
  if (use.pair && out.length < use.spots.length) return [];
  return out;
}
