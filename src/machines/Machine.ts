import type { JobSnapshot, MachineSnapshot, MachineType } from '@/game/types';
import { MACHINE } from '@/utils/constants';
import { rng } from '@/utils/rng';
import type { StationDef } from './layout';
import type { MessageKey } from '@/i18n';

/** Why a print failed — a message key under `fail.*` in `src/i18n/en.ts`. */
export type FailureReason = Extract<MessageKey, `fail.${string}`>;

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
  | { kind: 'failed'; job: Job; reason: FailureReason; atHour: number };

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
  /** Set while a member stands at the machine — lowers failure odds. */
  operatorSkill = 0;
  /** Kit the space owns that changes the odds, e.g. a filament dry box. */
  failureModifier = 1;
  /**
   * Who is keeping an eye on it (§3 traits): a Gatekeeper in the building, a Night Owl in
   * after hours. Set every tick by the sim; 1 with nobody watching.
   */
  watch = 1;
  /** How fast this particular machine works. A better printer is a faster printer. */
  speed = 1;
  /** The machine's own contribution to failure odds, separate from the space's kit. */
  reliability = 1;

  /** Grams of filament used since the last statement; the sim bills it and zeroes it (§7a). */
  filamentUsed = 0;

  constructor(def: StationDef, opts: { speed?: number; reliability?: number } = {}) {
    this.def = def;
    this.id = def.id;
    this.type = def.type;
    this.label = def.label;
    this.speed = opts.speed ?? 1;
    this.reliability = opts.reliability ?? 1;
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

  /** Drop every job of one project, the one on the bed included — a cancelled order. */
  dropProject(projectId: string) {
    this.queue = this.queue.filter((job) => job.projectId !== projectId);
    if (this.current?.projectId === projectId) this.current = null;
  }

  cancelJob(jobId: string): Job | null {
    const index = this.queue.findIndex((j) => j.id === jobId);
    if (index < 0) return null;
    return this.queue.splice(index, 1)[0];
  }

  /**
   * Chance this job fails at some point over its full remaining duration.
   * §13.3 — weights between the machine, operator skill and the job's length.
   */
  jobFailureChance(job: Job): number {
    const operatorTerm = Math.pow(MACHINE.operatorSkillFactor, Math.max(0, this.operatorSkill - 1));
    // Longer jobs are riskier in absolute terms, which is the whole point of the 11-hour print.
    const lengthTerm = 0.75 + job.hoursRequired / 16;
    return Math.min(
      0.9,
      MACHINE.baseJobFailure *
        operatorTerm *
        lengthTerm *
        this.failureModifier *
        this.watch *
        this.reliability,
    );
  }

  /** Advance by `dt` sim-hours. Returns a result when the current job resolves. */
  tick(dt: number): JobResult | null {
    if (!this.current) {
      const next = this.queue.shift();
      if (!next) return null;
      this.current = next;
    }

    const job = this.current;
    // A quicker machine covers more of the job per sim-hour; the job's hours are what it
    // would take on the machine the space started with.
    const step = Math.min(dt * this.speed, job.hoursRequired - job.progress);

    // Filament is drawn as the job goes, and never runs out: it is bought as it is used and
    // lands on the monthly statement, like the power (§5). A failed print wastes what it drew.
    const draw = (step / job.hoursRequired) * job.material;
    job.materialDrawn += draw;
    this.filamentUsed += draw;

    job.progress += step;

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

  private fail(job: Job, reason: FailureReason): JobResult {
    const atHour = job.progress;
    this.current = null;
    return { kind: 'failed', job, reason, atHour };
  }

  private failureReason(): FailureReason {
    // Keys, not sentences: the log renders them in whatever language is on screen.
    return rng.pick<FailureReason>([
      'fail.spaghetti', 'fail.layerShift', 'fail.thermal', 'fail.gantry', 'fail.adhesion', 'fail.firstLayer', 'fail.nozzle',
    ]);
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
      current: this.current ? this.jobSnapshot(this.current) : null,
      queue: this.queue.map((j) => this.jobSnapshot(j)),
      risk: this.current ? this.jobFailureChance(this.current) : 0,
    };
  }
}
