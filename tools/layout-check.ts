/**
 * The room's two rules about edges, checked (CLAUDE.md §4d, §7b, §8):
 *
 *   npm run layout-check
 *
 * 1. **Nothing is used from off the floor.** In every lease, fully furnished, every seat a
 *    station draws is on the floor, and every comfort people use faces open floor — the
 *    bottom row and the right-hand column have no wall drawn, and that is where the derived
 *    slots put the comforts, all of them once facing out past the edge.
 * 2. **A bigger room keeps the arrangement.** Signing each lease in turn, every piece lands
 *    where `grownOffset` says — against the edge it was against, or on the tile it had —
 *    and a reload puts back exactly the room that was saved.
 *
 * Exits non-zero if any check fails.
 */
import {
  applyEraLayout,
  installFurniture,
  resetStations,
  STATIONS,
  STATION_MAP,
  GRID,
  footprint,
  seatPosition,
  seatsOf,
  placeStation,
  setStationLayout,
  yawOf,
  setAmenityLayout,
  amenityPlacement,
  leisureSpots,
  seatTiles,
  isBlocked,
} from '@/machines/layout';
import { FURNITURE, FURNITURE_MAP } from '@/utils/furniture';
import { AMENITIES, amenityDef } from '@/utils/amenities';

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const seatsOffFloor = (): string[] => {
  const W = GRID.width;
  const H = GRID.height;
  return STATIONS.filter((s) => s.tile.x >= 0)
    .filter((s) =>
      [...Array(Math.min(seatsOf(s) ?? 1, 12)).keys()].some((i) => {
        const p = seatPosition(s, i);
        return p.x < -0.45 || p.y < -0.45 || p.x > W - 0.55 || p.y > H - 0.55;
      }),
    )
    .map((s) => s.id);
};

console.log('\n  Nothing is used from off the floor\n');
for (const era of [1, 2, 3, 4]) {
  resetStations();
  applyEraLayout(era);
  let n = 0;
  // Three of everything: a full room is where a long table ends up next to an edge.
  for (let round = 0; round < 3; round += 1) {
    for (const f of FURNITURE) if (f.type !== 'cnc') installFurniture(f.type, `${f.id}-${n++}`, f.name, f.span, f.id);
  }
  const floor = AMENITIES.filter((a) => a.mount === 'floor' && a.era <= era).map((a) => a.id);
  setAmenityLayout(floor, {});
  const facingOut: string[] = [];
  const unusable: string[] = [];
  for (const id of floor) {
    const p = amenityPlacement(id);
    const use = amenityDef(id)?.use;
    if (!p || !use) continue;
    if (!use.pair) {
      const turn = (p.yaw * Math.PI) / 2;
      const front = { x: p.x + Math.round(Math.sin(turn)), y: p.y + Math.round(Math.cos(turn)) };
      if (front.x < 0 || front.y < 0 || front.x >= GRID.width || front.y >= GRID.height) facingOut.push(id);
    }
    if (!leisureSpots(id).length) unusable.push(id);
  }
  const off = seatsOffFloor();
  check(`era ${era}: every seat on the floor`, off.length === 0, off.join(', '));
  // Nobody walks through a long bench's chairs: the row they are drawn on is not floor.
  const benches = STATIONS.filter((s) => s.tile.x >= 0 && seatTiles(s).length);
  const open = benches.filter((s) => seatTiles(s).some((t) => !isBlocked(t))).map((s) => s.id);
  check(`era ${era}: a long bench's chairs are not a corridor (${benches.length} benches)`, benches.length > 0 && open.length === 0, open.join(', '));
  check(`era ${era}: no comfort faces off the floor`, facingOut.length === 0, facingOut.join(', '));
  check(`era ${era}: every placed comfort can be used`, unusable.length === 0, unusable.join(', '));
}

console.log('\n  A bigger room keeps the arrangement\n');
resetStations();
applyEraLayout(1);
const bought: { id: string; f: string }[] = [];
['software-station', 'maker-bench', 'meeting-corner', 'software-station', 'assembly-table'].forEach((f, i) => {
  const d = FURNITURE_MAP[f];
  const s = installFurniture(d.type, `${f}-${i}`, d.name, d.span, d.id);
  if (s) bought.push({ id: s.id, f });
});
// The player's touch: the project table moved toward the right-hand side.
placeStation('table-1', { x: 4, y: 4 }, 0);
for (let era = 1; era < 4; era += 1) {
  const from = { width: GRID.width, height: GRID.height };
  const snap = STATIONS.filter((s) => s.tile.x >= 0).map((s) => ({ id: s.id, tile: { ...s.tile }, region: [...footprint(s), s.stand] }));
  const placements = applyEraLayout(era + 1, true);
  // Stated without `grownOffset`, so the check cannot agree with a broken rule: a piece
  // within a tile of the right-hand edge (and not the left) keeps its distance to that edge,
  // anything else keeps its column; the same for the bottom edge and the back.
  const moved = snap.filter((was) => {
    const now = STATION_MAP[was.id];
    const xs = was.region.map((t) => t.x);
    const ys = was.region.map((t) => t.y);
    const right = Math.min(...xs) > 1 && Math.max(...xs) >= from.width - 2;
    const bottom = Math.min(...ys) > 1 && Math.max(...ys) >= from.height - 2;
    const x = right ? GRID.width - 1 - (from.width - 1 - was.tile.x) : was.tile.x;
    const y = bottom ? GRID.height - 1 - (from.height - 1 - was.tile.y) : was.tile.y;
    return now.tile.x !== x || now.tile.y !== y;
  });
  check(`lease ${era} → ${era + 1}: every piece where it was, carried with its edge`, moved.length === 0, moved.map((m) => m.id).join(', '));
  const off = seatsOffFloor();
  check(`lease ${era} → ${era + 1}: every seat on the floor`, off.length === 0, off.join(', '));
  const saved = STATIONS.map((s) => ({ id: s.id, tile: { ...s.tile }, yaw: yawOf(s) }));
  resetStations();
  applyEraLayout(era + 1);
  for (const b of bought) {
    const d = FURNITURE_MAP[b.f];
    installFurniture(d.type, b.id, d.name, d.span, d.id);
  }
  setStationLayout(placements);
  const differs = saved.filter((s) => {
    const n = STATION_MAP[s.id];
    return !n || n.tile.x !== s.tile.x || n.tile.y !== s.tile.y || yawOf(n) !== s.yaw;
  });
  check(`lease ${era} → ${era + 1}: a reload puts back the same room`, differs.length === 0, differs.map((d) => d.id).join(', '));
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n  ${failed ? `${failed}/${results.length} checks failed` : `all ${results.length} checks passed`}\n`);
process.exit(failed ? 1 : 0);
