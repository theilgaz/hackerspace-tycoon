import { store } from '@/game/store';
import type { MachineSnapshot, ProjectData, StageKey } from '@/game/types';
import { MemberEntity } from '@/entities/MemberEntity';
import { Machine, type Job } from '@/machines/Machine';
import { DOOR, IDLE_TILES, STAGE_STATION, STATIONS, STATION_MAP } from '@/machines/layout';
import {
  BOUNTY,
  DRIFT,
  FAB,
  FILAMENT,
  GHOST_DECAY,
  MACHINE,
  MEMBER,
  PERFECTIONIST_QUALITY_GATE,
  ROSTER,
  STAGE_MAP,
  TIME,
} from '@/utils/constants';
import { clock, hours, uid } from '@/utils/format';
import { rng } from '@/utils/rng';
import {
  addWork,
  createDroneProject,
  generateParts,
  partsOutstanding,
  remainingWork,
  resolveTest,
  stageComplete,
} from './ProjectSystem';

interface DayPlan {
  attending: boolean;
  arriveAt: number;
  leaveAt: number;
}

/**
 * The heart of the game. Members, machines and the project live here; management data
 * (cash, log, clock) lives in the Zustand store. The sim writes a runtime snapshot to the
 * store at 5 Hz and the UI reads only the store (CLAUDE.md §11).
 *
 * This module must never import `three` or touch the DOM — it has to be runnable headless
 * so that balance can be tested.
 */
export class Simulation {
  members: MemberEntity[] = [];
  machines: Machine[] = [];
  project: ProjectData = createDroneProject();

  day = 1;
  time = 9;
  private plans = new Map<string, DayPlan>();
  private snapshotTimer = 0;
  private fabricationSeeded = false;
  private requeueTimer = 0;

  constructor() {
    for (const def of STATIONS) {
      const capacity = def.type === 'fdm' ? FILAMENT.spoolGrams : 0;
      this.machines.push(new Machine(def, capacity));
    }
    this.members = ROSTER.map((data) => new MemberEntity(data, DOOR));
    this.planDay();
    this.log(`Day 1. The garage smells of PLA and instant coffee.`, 'info');
    this.log(`Pitched "${this.project.name}" — see who bites.`, 'info');
  }

  get printer(): Machine {
    return this.machines.find((m) => m.type === 'fdm')!;
  }

  private log(text: string, kind: 'info' | 'good' | 'bad' | 'warn' = 'info') {
    store.getState().pushLog(text, kind);
  }

  // -------------------------------------------------------------------------
  // Clock
  // -------------------------------------------------------------------------

  /** `dtReal` is real seconds; speed is the player's 1x/2x/4x. */
  tick(dtReal: number, speed: number) {
    if (this.project.shipped) return;
    const dt = (dtReal * speed) / TIME.secondsPerHour; // sim-hours

    this.time += dt;
    while (this.time >= TIME.hoursPerDay) {
      this.time -= TIME.hoursPerDay;
      this.day += 1;
      this.endOfDay();
      this.planDay();
    }

    this.tickMembers(dt);
    this.tickMemberRequeue(dt);
    this.tickMachines(dt);
    this.advanceStageIfReady();

    store.getState().setClock(this.day, this.time);

    this.snapshotTimer += dtReal;
    if (this.snapshotTimer >= TIME.snapshotInterval) {
      this.snapshotTimer = 0;
      this.publish();
    }
  }

  private endOfDay() {
    for (const m of this.members) {
      if (m.present) m.leave();
      // A night's sleep, and whatever else their life contains.
      m.data.energy = Math.min(100, m.data.energy + 45);
      if (this.plans.get(m.id)?.attending && m.hasTrait('ghost')) {
        m.ghostFactor *= GHOST_DECAY;
      }
    }
  }

  /** §13.2 — commitment (hours/week) decides whether they turn up at all. */
  private planDay() {
    const bountied =
      this.project.bounties.includes(this.project.stage) && STAGE_MAP[this.project.stage].work > 0;
    for (const m of this.members) {
      const moodFactor = 0.6 + m.data.mood / 125;
      // A live bounty on a stage they care about drags them in and keeps them longer.
      const tempted = bountied && m.passionMatch(this.project.tags) >= BOUNTY.temptThreshold;
      const chance = Math.min(
        0.95,
        Math.max(
          0.05,
          m.data.commitment *
            MEMBER.showUpPerCommitmentHour *
            m.ghostFactor *
            moodFactor *
            (tempted ? BOUNTY.attendanceBoost : 1),
        ),
      );
      const attending = rng.chance(chance);
      const [open, close] = m.data.window;
      const todayHours =
        Math.max(1.5, (m.data.commitment / 4) * rng.range(0.7, 1.3)) * (tempted ? BOUNTY.stayBoost : 1);
      const arriveAt = rng.range(open, Math.max(open + 0.5, close - todayHours));
      this.plans.set(m.id, {
        attending,
        arriveAt,
        leaveAt: Math.min(close, arriveAt + todayHours),
      });
      m.leaveAt = Math.min(close, arriveAt + todayHours);
    }
  }

  // -------------------------------------------------------------------------
  // Members
  // -------------------------------------------------------------------------

  private tickMembers(dt: number) {
    const stageKey = this.project.stage;
    const stage = STAGE_MAP[stageKey];
    const workers = this.members.filter(
      (m) => m.present && m.signedUp === stageKey && m.activity === 'working',
    );

    for (const m of this.members) {
      const plan = this.plans.get(m.id)!;
      m.tickCooldowns(dt);

      if (!m.present) {
        if (plan.attending && this.time >= plan.arriveAt && this.time < plan.leaveAt) {
          m.arrive(DOOR);
          m.note = 'just arrived';
        }
        continue;
      }

      // Going-home time: walk to the door, then vanish.
      if (this.time >= plan.leaveAt) {
        if (m.tile.x === DOOR.x && m.tile.y === DOOR.y && !m.walking) {
          m.leave();
          continue;
        }
        m.note = 'heading home';
        if (!m.walking) m.walkTo(DOOR);
        m.advance(dt);
        continue;
      }

      this.decideActivity(m, stageKey);
      m.advance(dt);
      this.performActivity(m, dt, workers.length);
    }

    // Work is applied once, with diminishing returns for the crowd (CLAUDE.md §3).
    if (stage.work > 0 && workers.length) {
      let total = 0;
      let craftSum = 0;
      workers.slice(0, MEMBER.maxWorkersPerStage).forEach((m, index) => {
        const factor = index === 0 ? 1 : MEMBER.extraWorkerFactor;
        const rate = m.workRate(stage, this.project.tags) * factor;
        total += rate * dt;
        const level = stage.skill ? m.data.skills[stage.skill] : 2;
        craftSum += (level / 5) * rate;
      });
      const craft = craftSum / Math.max(0.0001, workers.reduce((s, m, i) => s + m.workRate(stage, this.project.tags) * (i === 0 ? 1 : MEMBER.extraWorkerFactor), 0));
      addWork(this.project, total, Math.min(1, Math.max(0.1, craft)));
    }
  }

  /** The influence model in one function: nobody is told what to do. */
  private decideActivity(m: MemberEntity, stageKey: StageKey) {
    const stage = STAGE_MAP[stageKey];

    // Exhausted people go and sit down, and there is nothing you can do about it.
    if (m.activity === 'resting') {
      if (m.data.energy >= 65) {
        m.activity = 'idle';
        m.note = 'back on it';
      } else {
        if (!m.walking && !this.atStation(m, 'lounge')) m.walkTo(STATION_MAP['lounge'].stand);
        return;
      }
    }
    if (m.data.energy < MEMBER.tiredThreshold) {
      m.activity = 'resting';
      m.note = 'needs a sit-down';
      m.walkTo(STATION_MAP['lounge'].stand);
      return;
    }

    // Drift: interest gone, they unsign. This is the game's core antagonist.
    if (m.signedUp && m.interest < DRIFT.abandonThreshold) {
      this.log(`${m.name} drifted off ${STAGE_MAP[m.signedUp].label.toLowerCase()}.`, 'warn');
      m.setCooldown(m.signedUp, DRIFT.cooldownHours);
      m.signedUp = null;
      m.note = 'lost interest';
    }

    // Sign-up: passion match against the project, weighted by how fun the stage looks.
    if (!m.signedUp) {
      const match = m.passionMatch(this.project.tags);
      const bounty = this.project.bounties.includes(stageKey);
      const appetite = match * (0.45 + stage.appeal * 0.55) + (bounty ? 0.5 : 0);
      if (stage.work > 0 && !m.isCoolingOff(stageKey) && appetite >= DRIFT.signupThreshold && rng.chance(0.55)) {
        m.signedUp = stageKey;
        m.interest = Math.min(1.2, DRIFT.startInterest * (0.5 + match) + (bounty ? DRIFT.bountyInterest : 0));
        m.note = `on ${stage.label.toLowerCase()}`;
      }
    }

    if (m.signedUp === stageKey && stage.work > 0) {
      const stationId = STAGE_STATION[stageKey];
      if (stationId) {
        const station = STATION_MAP[stationId];
        if (this.atStation(m, stationId)) {
          m.activity = 'working';
          m.note = `${stage.label.toLowerCase()}: ${hours(remainingWork(this.project) / 2)} left`;
        } else if (!m.walking) {
          m.walkTo(station.stand);
        }
      }
      return;
    }

    // Fabrication: no hands needed. Someone may babysit the printer instead.
    const printer = this.printer;
    if (stageKey === 'fabrication' || stage.work === 0) {
      if (printer.calibration < MACHINE.calibrationWarning || printer.running) {
        if (this.atStation(m, printer.id)) {
          m.activity = 'babysitting';
          m.note = printer.calibration < MACHINE.calibrationWarning ? 'levelling the bed' : 'watching the print';
        } else if (!m.walking) {
          m.walkTo(printer.def.stand);
        }
        return;
      }
    }

    if (!m.walking && m.activity !== 'idle') {
      m.activity = 'idle';
      m.note = 'hanging around';
      m.walkTo(rng.pick(IDLE_TILES));
    } else if (!m.walking) {
      m.activity = 'idle';
    }
  }

  private performActivity(m: MemberEntity, dt: number, _workerCount: number) {
    const stage = STAGE_MAP[this.project.stage];
    switch (m.activity) {
      case 'working': {
        m.data.energy = Math.max(0, m.data.energy - MEMBER.energyDrain * dt);
        m.interest -= DRIFT.decayPerHour * (1 - stage.appeal) * dt;
        break;
      }
      case 'resting': {
        m.data.energy = Math.min(100, m.data.energy + MEMBER.energyRestore * dt);
        break;
      }
      case 'babysitting': {
        const printer = this.printer;
        printer.operatorSkill = Math.max(printer.operatorSkill, m.data.skills.machining);
        if (printer.calibration < 0.98) printer.calibrate(dt);
        m.data.energy = Math.max(0, m.data.energy - MEMBER.energyDrain * 0.4 * dt);
        break;
      }
      default:
        break;
    }
  }

  private atStation(m: MemberEntity, stationId: string): boolean {
    const station = STATION_MAP[stationId];
    return !m.walking && m.tile.x === station.stand.x && m.tile.y === station.stand.y;
  }

  // -------------------------------------------------------------------------
  // Machines
  // -------------------------------------------------------------------------

  /**
   * Nobody is obliged to notice a failed print, but somebody in the building eventually
   * does. The player can always re-queue instantly and save the wait.
   */
  private tickMemberRequeue(dt: number) {
    if (this.project.stage !== 'fabrication') {
      this.requeueTimer = 0;
      return;
    }
    const pending = this.project.parts.filter((p) => p.status === 'pending');
    if (!pending.length) {
      this.requeueTimer = 0;
      return;
    }
    // Only accumulate while somebody is actually in the building — but do NOT reset when
    // they go home. Volunteers arrive in 2-3 hour bursts, so a timer needing continuous
    // presence never elapses and fabrication deadlocks.
    const witness = this.members.find((m) => m.present);
    if (!witness) return;
    this.requeueTimer += dt;
    if (this.requeueTimer < FAB.memberRequeueHours) return;
    this.requeueTimer = 0;
    this.queuePart(pending[0].id);
    this.log(`${witness.name} noticed and re-queued ${pending[0].name}.`, 'info');
  }

  private tickMachines(dt: number) {
    for (const machine of this.machines) {
      if (machine.type !== 'fdm') continue;
      const hadOperator = this.members.some(
        (m) => m.present && m.activity === 'babysitting' && this.atStation(m, machine.id),
      );
      if (!hadOperator) machine.operatorSkill = 0;

      const result = machine.tick(dt);
      if (!result) continue;

      const part = this.project.parts.find((p) => p.id === result.job.partId);
      if (result.kind === 'done') {
        if (part) part.status = 'done';
        this.log(`${result.job.partName} finished. ${clock(this.time)}`, 'good');
      } else {
        if (part) {
          part.status = 'pending';
          part.attempts += 1;
        }
        const wasted = Math.round(result.job.materialDrawn * MACHINE.wasteOnFailure);
        this.log(
          `${result.job.partName} ${result.reason} at hour ${result.atHour.toFixed(1)} of ${result.job.hoursRequired}. ${wasted}g wasted.`,
          'bad',
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Stage advancement
  // -------------------------------------------------------------------------

  private advanceStageIfReady() {
    const project = this.project;
    const stage = project.stage;

    if (stage === 'fabrication') {
      if (!this.fabricationSeeded) {
        this.fabricationSeeded = true;
        this.queueAllPending();
      }
      if (partsOutstanding(project).length === 0 && project.parts.length > 0) {
        this.setStage('assembly', `All parts printed. Assembly can start.`, 'good');
      }
      return;

    }

    if (stage === 'test') {
      const outcome = resolveTest(project);
      if (outcome.passed) {
        this.setStage('release', `It flies. Test passed on attempt ${project.testAttempts}.`, 'good');
      } else {
        this.log(`Test failed: ${outcome.defect}`, 'bad');
        this.setStage(
          'iterate',
          outcome.brokenPartId ? `A part needs reprinting.` : `Back to the drawing board.`,
          'warn',
        );
      }
      return;
    }

    if (!stageComplete(project)) return;

    // Perfectionist gate: they will not sign off on shoddy work (CLAUDE.md §3).
    const blocker = this.members.find(
      (m) =>
        m.present &&
        m.signedUp === stage &&
        m.hasTrait('perfectionist') &&
        (stage === 'cad' || stage === 'iterate') &&
        project.quality < PERFECTIONIST_QUALITY_GATE,
    );
    if (blocker) {
      blocker.note = 'not signing off on this';
      return;
    }

    switch (stage) {
      case 'concept':
        this.setStage('cad', `Concept locked. ${project.parts.length === 0 ? 'Somebody has to model it now.' : ''}`);
        break;
      case 'cad':
        generateParts(project);
        this.setStage('simulation', `CAD done at ${Math.round(project.quality * 100)}% quality. ${project.parts.length} parts to make.`);
        break;
      case 'simulation':
        this.setStage('fabrication', `Simulation clean. Queueing the printer.`);
        break;
      case 'assembly':
        this.setStage('test', `Assembled. Time to find out.`);
        break;
      case 'iterate': {
        const outstanding = partsOutstanding(project);
        if (outstanding.length) {
          this.fabricationSeeded = false;
          this.setStage('fabrication', `${outstanding.length} part(s) back on the printer.`);
        } else {
          this.setStage('test', `Fixes in. Testing again.`);
        }
        break;
      }
      case 'release':
        project.shipped = true;
        store.getState().setPaused(true);
        this.log(`"${project.name}" shipped on day ${this.day}. Write-up is live.`, 'good');
        // tick() bails out once shipped, so push the terminal state now or the UI
        // never sees it and sits on the last 5 Hz snapshot forever.
        this.publish();
        break;
      default:
        break;
    }
  }

  private setStage(next: StageKey, message: string, kind: 'info' | 'good' | 'bad' | 'warn' = 'info') {
    this.project.stage = next;
    if (next === 'fabrication') this.fabricationSeeded = false;
    // A new stage means new sign-ups. Nobody is carried over — this is the drift engine.
    for (const m of this.members) {
      if (m.signedUp) m.signedUp = null;
    }
    if (message) this.log(message, kind);
  }

  // -------------------------------------------------------------------------
  // Player verbs (CLAUDE.md §3) — all indirect, none of them assign a task
  // -------------------------------------------------------------------------

  /** Re-pitch: re-roll interest among members who have not signed up. */
  repitch() {
    const stage = STAGE_MAP[this.project.stage];
    let took = 0;
    for (const m of this.members) {
      if (m.signedUp || !m.present || m.isCoolingOff(this.project.stage)) continue;
      const match = m.passionMatch(this.project.tags) + DRIFT.repitchBonus;
      if (match * (0.45 + stage.appeal * 0.55) >= DRIFT.signupThreshold && rng.chance(0.6)) {
        m.signedUp = this.project.stage;
        m.interest = DRIFT.startInterest * (0.5 + match);
        took += 1;
      }
    }
    this.log(
      took ? `Re-pitched ${stage.label}: ${took} signed up.` : `Re-pitched ${stage.label}. Nobody bit.`,
      took ? 'good' : 'warn',
    );
  }

  bountyCost(): number {
    return Math.max(BOUNTY.minCost, Math.round(remainingWork(this.project) * BOUNTY.costPerWorkUnit));
  }

  /** The only reliable way to get boring work done. */
  postBounty(): boolean {
    const stage = this.project.stage;
    if (this.project.bounties.includes(stage)) return false;
    const cost = this.bountyCost();
    if (!store.getState().spend(cost)) {
      this.log(`Not enough cash for a bounty.`, 'bad');
      return false;
    }
    this.project.bounties.push(stage);
    for (const m of this.members) {
      m.interest = Math.min(1.4, m.interest + DRIFT.bountyInterest);
      m.clearCooldowns();
    }
    this.log(`Bounty posted on ${STAGE_MAP[stage].label}. Pizza is on the way.`, 'good');
    return true;
  }

  skipSimulation() {
    if (this.project.stage !== 'simulation') return;
    this.project.simulationSkipped = true;
    this.setStage('fabrication', `Simulation skipped. Hope the maths was right.`, 'warn');
  }

  queuePart(partId: string) {
    const part = this.project.parts.find((p) => p.id === partId);
    if (!part || part.status === 'done' || part.status === 'queued') return;
    const job: Job = {
      id: uid('job'),
      projectId: this.project.id,
      partId: part.id,
      partName: part.name,
      hoursRequired: part.hours,
      progress: 0,
      material: part.material,
      materialDrawn: 0,
    };
    part.status = 'queued';
    this.printer.enqueue(job);
  }

  queueAllPending() {
    const pending = this.project.parts.filter((p) => p.status === 'pending');
    pending.forEach((p) => this.queuePart(p.id));
    if (pending.length) this.log(`${pending.length} part(s) queued on the printer.`);
  }

  moveJob(jobId: string, direction: -1 | 1) {
    this.printer.moveJob(jobId, direction);
  }

  cancelJob(jobId: string) {
    const job = this.printer.cancelJob(jobId);
    if (!job) return;
    const part = this.project.parts.find((p) => p.id === job.partId);
    if (part) part.status = 'pending';
  }

  buyFilament(): boolean {
    if (!store.getState().spend(FILAMENT.spoolCost)) {
      this.log(`Not enough cash for filament.`, 'bad');
      return false;
    }
    this.printer.refill(FILAMENT.spoolGrams);
    this.log(`New spool loaded.`, 'good');
    return true;
  }

  // -------------------------------------------------------------------------

  private publish() {
    const machines: MachineSnapshot[] = this.machines
      .filter((m) => m.type === 'fdm')
      .map((m) => m.snapshot());
    store.getState().setRuntime({
      members: this.members.map((m) => m.snapshot()),
      machines,
      project: structuredClone(this.project),
    });
  }
}
