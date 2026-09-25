import { MemberEntity } from './MemberEntity';
import type { MemberData, PlayerSnapshot, SkillKey, Tag } from '@/game/types';
import { MEMBER, PLAYER, PLAYER_SKILLS } from '@/utils/constants';
import type { Tile } from '@/utils/grid';
import { primaryWing } from '@/utils/categories';

/**
 * You. A member like any other, except: you never drift, you can be told what to do, and
 * **your day is a single number** — eighteen hours, spent on building and managing alike
 * (CLAUDE.md §3a). When they are gone you go home, whatever the clock says.
 *
 * The budget is what keeps the influence model intact. Without it you would simply be the
 * best volunteer in the room and nobody else would matter.
 */
export class PlayerEntity extends MemberEntity {
  hoursToday = PLAYER.dayHours;
  hoursLeft = PLAYER.dayHours;
  /**
   * The project you have put yourself on. A project, not a stage — like everyone else on a
   * team, you stay through the stage changes and work whatever currently needs hands.
   */
  project: string | null = null;

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

  /** A fresh eighteen hours. No carry-over and no hangover: the day is the whole resource. */
  startDay() {
    this.hoursToday = PLAYER.dayHours;
    this.hoursLeft = PLAYER.dayHours;
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
  override workRate(skill: SkillKey | null, _tags: Tag[] = [], boost = 0): number {
    const level = Math.min(5, (skill ? this.data.skills[skill] : 2) + boost);
    let rate = MEMBER.baseWorkRate * (1 + (level - 1) * MEMBER.skillRateBonus);
    rate *= 1 + ((this.data.mood - 50) / 50) * MEMBER.moodRateSwing;
    return Math.max(0.1, rate);
  }

  playerSnapshot(): PlayerSnapshot {
    return {
      primary: primaryWing(this.data.skills, this.data.passions),
      present: this.present,
      activity: this.activity,
      hoursToday: this.hoursToday,
      hoursLeft: this.hoursLeft,
      // The one bar the UI draws. It *is* the day: hours and energy are the same thing now.
      energy: (this.hoursLeft / Math.max(1, this.hoursToday)) * 100,
      project: this.project,
      stage: null,
      tile: this.tile,
      pos: { ...this.pos },
      seat: null,
      spot: null,
      share: null,
      note: this.note,
      skills: { ...this.data.skills },
    };
  }
}
