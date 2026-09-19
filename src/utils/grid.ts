export interface Tile {
  x: number;
  y: number;
}

export function sameTile(a: Tile, b: Tile): boolean {
  return a.x === b.x && a.y === b.y;
}

export function manhattan(a: Tile, b: Tile): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

const NEIGHBOURS: ReadonlyArray<Tile> = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/**
 * BFS path on a small grid. The spaces in this game are tens of tiles, not thousands —
 * A* only earns its complexity if profiling says so (CLAUDE.md §10).
 * Returns the tiles to walk through, excluding the start tile. Empty array if unreachable.
 */
export function findPath(
  start: Tile,
  goal: Tile,
  width: number,
  height: number,
  blocked: (t: Tile) => boolean,
): Tile[] {
  if (sameTile(start, goal)) return [];
  const key = (t: Tile) => t.y * width + t.x;
  const cameFrom = new Map<number, number>();
  const queue: Tile[] = [start];
  const seen = new Set<number>([key(start)]);

  while (queue.length) {
    const current = queue.shift()!;
    for (const step of NEIGHBOURS) {
      const next = { x: current.x + step.x, y: current.y + step.y };
      if (next.x < 0 || next.y < 0 || next.x >= width || next.y >= height) continue;
      const k = key(next);
      if (seen.has(k)) continue;
      // The goal itself may be "blocked" (a machine tile) — you walk up to it, not onto it.
      if (blocked(next) && !sameTile(next, goal)) continue;
      seen.add(k);
      cameFrom.set(k, key(current));
      if (sameTile(next, goal)) {
        const path: Tile[] = [];
        let cursor = k;
        while (cursor !== key(start)) {
          path.push({ x: cursor % width, y: Math.floor(cursor / width) });
          cursor = cameFrom.get(cursor)!;
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return [];
}
