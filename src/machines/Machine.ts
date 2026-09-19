import type { JobSnapshot, MachineSnapshot, MachineType } from '@/game/types';
import { MACHINE } from '@/utils/constants';
import { rng } from '@/utils/rng';
import type { StationDef } from './layout';

export interface Job {
  id: string;
  projectId: string;
  partId: string;
  partName: string;
  hoursRequired: number;
  progress: number;
  /** Grams the job needs in total. */
  material: number;
  /** Grams already consumed — wasted if the job fails. */
  materialDrawn: number;
}

export type JobResult =
  | { kind: 'done'; job: Job }
  | { kind: 'failed'; job: Job; reason: string; atHour: number };

/**
 * A machine processes one job at a time on the sim clock, regardless of whether anyone
 * is in the building (CLAUDE.md §5). Failure is rolled continuously across the job, so a
 * print genuinely can die at hour 19 of 22 and take the filament with it.
 */
export class Machine {
  readonly id: string;
  readonly type: MachineType;
  readonly label: string;
  readonly def: StationDef;

  queue: Job[] = [];
  current: Job | null = null;
  /** 0-1; drifts down with use and pushes failure odds up. */
  calibration = 0.92;
  consumable: number;
  readonly consumableMax: number;
  /** Set while a member stands at the machine — lowers failure odds. */
  operatorSkill = 0;
  /** Kit the space owns that changes the odds, e.g. a filament dry box. */
  failureModifier = 1;

  constructor(def: StationDef, consumableMax = 0) {
    this.def = def;
    this.id = def.id;
    this.type = def.type;
    this.label = def.label;
    this.consumableMax = consumableMax;
    this.consumable = consumableMax;
  }

  get running(): boolean {
    return this.current !== null;
  }

  enqueue(job: Job) {
    this.queue.push(job);
  }

  /** Player-driven queue reordering (CLAUDE.md §5). */
  moveJob(jobId: string, direction: -1 | 1) {
    const index = this.queue.findIndex((j) => j.id === jobId);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= this.queue.length) return;
    const [job] = this.queue.splice(index, 1);
    this.queue.splice(target, 0, job);
  }

  cancelJob(jobId: string): Job | null {
    const index = this.queue.findIndex((j) => j.id === jobId);
    if (index < 0) return null;
    return this.queue.splice(index, 1)[0];
  }

  /**
   * Chance this job fails at some point over its full remaining duration.
   * §13.3 — weights between machine calibration, operator skill and material.
   */
  jobFailureChance(job: Job): number {
    const calibrationTerm = 1 + (1 - this.calibration) * (MACHINE.calibrationPenalty - 1);
    const operatorTerm = Math.pow(MACHINE.operatorSkillFactor, Math.max(0, this.operatorSkill - 1));
    // Longer jobs are riskier in absolute terms, which is the whole point of the 11-hour print.
    const lengthTerm = 0.75 + job.hoursRequired / 16;
    return Math.min(0.9, MACHINE.baseJobFailure * calibrationTerm * operatorTerm * lengthTerm * this.failureModifier);
  }

  /** True when the machine physically cannot start work: nothing left to make it from. */
  get starved(): boolean {
    return this.consumableMax > 0 && this.consumable <= 0;
  }

  /** Advance by `dt` sim-hours. Returns a result when the current job resolves. */
  tick(dt: number): JobResult | null {
    if (!this.current) {
      // An empty spool means the machine waits, not that it burns through the queue
      // failing every job instantly. Without this, going broke produces hundreds of
      // failures in a few days instead of one idle printer.
      if (this.starved) return null;
      const next = this.queue.shift();
      if (!next) return null;
      this.current = next;
    }

    const job = this.current;
    const step = Math.min(dt, job.hoursRequired - job.progress);

    // Consumable draw is proportional to progress; running dry kills the job.
    if (this.consumableMax > 0) {
      const draw = (step / job.hoursRequired) * job.material;
      if (this.consumable < draw) {
        this.consumable = 0;
        return this.fail(job, 'ran out of filament');
      }
      this.consumable -= draw;
      job.materialDrawn += draw;
    }

    job.progress += step;
    this.calibration = Math.max(0, this.calibration - MACHINE.calibrationDrift * step);

    // Continuous hazard: convert whole-job failure odds into a per-slice roll.
    const total = this.jobFailureChance(job);
    const sliceChance = 1 - Math.pow(1 - total, step / job.hoursRequired);
    if (rng.chance(sliceChance)) {
      return this.fail(job, this.failureReason());
    }

    if (job.progress >= job.hoursRequired - 1e-6) {
      this.current = null;
      return { kind: 'done', job };
    }
    return null;
  }

  private fail(job: Job, reason: string): JobResult {
    const atHour = job.progress;
    this.current = null;
    return { kind: 'failed', job, reason, atHour };
  }

  private failureReason(): string {
    if (this.calibration < MACHINE.calibrationWarning) {
      return rng.pick(['bed adhesion let go', 'first layer lifted', 'nozzle jammed']);
    }
    return rng.pick([
      'turned into spaghetti',
      'layer shift',
      'thermal runaway trip',
      'part knocked loose by the gantry',
    ]);
  }

  calibrate(dt: number) {
    this.calibration = Math.min(1, this.calibration + MACHINE.calibrationRestore * dt);
  }

  refill(grams: number) {
    this.consumable = Math.min(this.consumableMax, this.consumable + grams);
  }

  private jobSnapshot(job: Job): JobSnapshot {
    return {
      id: job.id,
      projectId: job.projectId,
      partName: job.partName,
      hoursRequired: job.hoursRequired,
      progress: job.progress,
      material: job.material,
    };
  }

  snapshot(): MachineSnapshot {
    return {
      id: this.id,
      type: this.type,
      label: this.label,
      tile: this.def.tile,
      running: this.running,
      calibration: this.calibration,
      consumable: this.consumable,
      consumableMax: this.consumableMax,
      current: this.current ? this.jobSnapshot(this.current) : null,
      queue: this.queue.map((j) => this.jobSnapshot(j)),
      risk: this.current ? this.jobFailureChance(this.current) : 0,
    };
  }
}
