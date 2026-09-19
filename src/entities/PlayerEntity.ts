import { MemberEntity } from './MemberEntity';
import type { Assignment, MemberData, PlayerSnapshot, StageDef } from '@/game/types';
import { MEMBER, PLAYER, PLAYER_SKILLS } from '@/utils/constants';
import type { Tile } from '@/utils/grid';

/**
 * You. A member like any other, except: you never drift, you can be told what to do, and
 * your hours are a hard daily budget shared between building and managing (CLAUDE.md §3a).
 *
 * The budget is what keeps the influence model intact. Without it you would simply be the
 * best volunteer in the room and nobody else would matter.
 */
export class PlayerEntity extends MemberEntity {
  hoursToday = PLAYER.baseHours;
  hoursLeft = PLAYER.baseHours;
  /** What you have chosen to work on yourself. */
  task: Assignment | null = null;
  /** Set while you are levelling the printer bed rather than doing project work. */
  calibrating = false;

  constructor(startTile: Tile) {
    const data: MemberData = {
      id: 'player',
      name: PLAYER.name,
      skills: { ...PLAYER_SKILLS },
      passions: {},
      energy: 100,
      mood: 70,
      commitment: 40,
      traits: [],
      window: [PLAYER.startHour, 24],
    };
    super(data, startTile);
  }

  get burntOut(): boolean {
    return this.data.energy < PLAYER.burnoutEnergy;
  }

  /** Energy shapes tomorrow, not today — overwork is a decision with a delayed bill. */
  startDay() {
    this.data.energy = Math.min(100, this.data.energy + PLAYER.energyRestore);
    const factor = 0.5 + this.data.energy / 200;
    this.hoursToday = Math.max(PLAYER.minHours, Math.min(PLAYER.baseHours + 1, PLAYER.baseHours * factor));
    this.hoursLeft = this.hoursToday;
  }

  /** Spend hours on a management verb. Returns false when the day is gone. */
  spendHours(cost: number): boolean {
    if (this.hoursLeft < cost) return false;
    this.hoursLeft -= cost;
    return true;
  }

  canAfford(cost: number): boolean {
    return this.hoursLeft >= cost;
  }

  /** No passion penalty: it is your hackerspace, you work on whatever needs working on. */
  override workRate(stage: StageDef): number {
    const level = stage.skill ? this.data.skills[stage.skill] : 2;
    let rate = MEMBER.baseWorkRate * (1 + (level - 1) * MEMBER.skillRateBonus);
    rate *= 1 + ((this.data.mood - 50) / 50) * MEMBER.moodRateSwing;
    if (this.burntOut) rate *= 0.7;
    return Math.max(0.1, rate);
  }

  playerSnapshot(): PlayerSnapshot {
    return {
      present: this.present,
      activity: this.activity,
      hoursToday: this.hoursToday,
      hoursLeft: this.hoursLeft,
      energy: this.data.energy,
      strain: Math.max(0, 100 - this.data.energy),
      burntOut: this.burntOut,
      task: this.task ? { ...this.task } : null,
      tile: this.tile,
      pos: { ...this.pos },
      note: this.note,
      skills: { ...this.data.skills },
    };
  }
}
