/** Mulberry32 — small, fast, seedable. Deterministic runs make balance testable. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;
  constructor(seed = Date.now()) {
    this.next = mulberry32(seed);
  }
  /** [0,1) */
  float() {
    return this.next();
  }
  /** [min,max) */
  range(min: number, max: number) {
    return min + this.next() * (max - min);
  }
  /** [min,max] integer */
  int(min: number, max: number) {
    return Math.floor(this.range(min, max + 1));
  }
  chance(p: number) {
    return this.next() < p;
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)];
  }
  reseed(seed: number) {
    this.next = mulberry32(seed);
  }
}

export const rng = new Rng();
