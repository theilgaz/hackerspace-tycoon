import type { MemberActivity, MemberData, MemberSnapshot, SkillKey, Tag } from '@/game/types';
import { MEMBER } from '@/utils/constants';
import { findPath, sameTile, type Tile } from '@/utils/grid';
import { GRID, isBlocked } from '@/machines/layout';

/**
 * A volunteer. The player never commands one of these — the Simulation asks it what it
 * *wants* to do, and it answers based on passion, interest, mood and energy (CLAUDE.md §3).
 */
export class MemberEntity {
  readonly data: MemberData;
  tile: Tile;
  pos: { x: number; y: number };
  private path: Tile[] = [];

  activity: MemberActivity = 'away';
  present = false;
  /** Project this member is allocated to. One at a time — that is the constraint. */
  team: string | null = null;
  interest = 0;
  note = '';
  /** Ghost trait: multiplier on show-up chance, decaying each day they attend. */
  ghostFactor = 1;
  /** Hour of day they will go home. */
  leaveAt = 0;
  /** Stages they have burned out on, with sim-hours left before they will reconsider. */
  private cooldowns = new Map<string, number>();

  constructor(data: MemberData, startTile: Tile) {
    this.data = data;
    this.tile = { ...startTile };
    this.pos = { x: startTile.x, y: startTile.y };
  }

  get id() {
    return this.data.id;
  }
  get name() {
    return this.data.name;
  }
  hasTrait(trait: MemberData['traits'][number]): boolean {
    return this.data.traits.includes(trait);
  }

  /** Strongest passion overlap with a set of project tags. 0-1. */
  passionMatch(tags: Tag[]): number {
    let best = 0;
    for (const tag of tags) best = Math.max(best, this.data.passions[tag] ?? 0);
    return best;
  }

  /** Work units per sim-hour, given the skill this stage actually leans on. */
  workRate(skill: SkillKey | null, tags: Tag[] = []): number {
    const level = skill ? this.data.skills[skill] : 2;
    let rate = MEMBER.baseWorkRate * (1 + (level - 1) * MEMBER.skillRateBonus);
    rate *= 1 + ((this.data.mood - 50) / 50) * MEMBER.moodRateSwing;
    if (this.passionMatch(tags) < 0.4) rate *= MEMBER.offPassionPenalty;
    if (this.data.energy < MEMBER.tiredThreshold) rate *= 0.6;
    return Math.max(0.1, rate);
  }

  /** Burnout memory ticks down even while they are at home. */
  tickCooldowns(dt: number) {
    for (const [stage, left] of this.cooldowns) {
      const next = left - dt;
      if (next <= 0) this.cooldowns.delete(stage);
      else this.cooldowns.set(stage, next);
    }
  }

  /** Burnout and refusals are remembered per project: this drone, not drones in general. */
  isCoolingOff(projectId: string): boolean {
    return this.cooldowns.has(projectId);
  }

  setCooldown(projectId: string, simHours: number) {
    this.cooldowns.set(projectId, simHours);
  }

  /** Pizza forgives everything. */
  clearCooldowns() {
    this.cooldowns.clear();
  }

  walkTo(target: Tile) {
    if (sameTile(this.tile, target) && this.path.length === 0) return;
    this.path = findPath(this.tile, target, GRID.width, GRID.height, isBlocked);
    if (this.path.length) this.activity = 'walking';
  }

  get walking() {
    return this.path.length > 0;
  }

  get destination(): Tile | null {
    return this.path.length ? this.path[this.path.length - 1] : null;
  }

  /** Move along the current path. `dt` is sim-hours. */
  advance(dt: number) {
    if (!this.path.length) {
      this.pos.x += (this.tile.x - this.pos.x) * Math.min(1, dt * 8);
      this.pos.y += (this.tile.y - this.pos.y) * Math.min(1, dt * 8);
      return;
    }
    let budget = MEMBER.walkSpeed * dt;
    while (budget > 0 && this.path.length) {
      const next = this.path[0];
      const dx = next.x - this.pos.x;
      const dy = next.y - this.pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= budget || dist < 1e-4) {
        this.pos.x = next.x;
        this.pos.y = next.y;
        this.tile = { ...next };
        this.path.shift();
        budget -= dist;
      } else {
        this.pos.x += (dx / dist) * budget;
        this.pos.y += (dy / dist) * budget;
        budget = 0;
      }
    }
  }

  arrive(door: Tile) {
    this.present = true;
    this.tile = { ...door };
    this.pos = { x: door.x, y: door.y };
    this.activity = 'idle';
  }

  leave() {
    this.present = false;
    this.activity = 'away';
    this.path = [];
    this.note = 'at home';
  }

  snapshot(): MemberSnapshot {
    return {
      id: this.id,
      name: this.name,
      present: this.present,
      activity: this.activity,
      team: this.team,
      affinity: {},
      interest: this.interest,
      energy: this.data.energy,
      mood: this.data.mood,
      tile: this.tile,
      pos: { ...this.pos },
      note: this.note,
    };
  }
}
