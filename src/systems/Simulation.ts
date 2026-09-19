import { store } from '@/game/store';
import type {
  Assignment,
  BacklogEntry,
  MachineSnapshot,
  MachineType,
  ProjectData,
  ProjectDef,
  StageKey,
} from '@/game/types';
import { MemberEntity } from '@/entities/MemberEntity';
import { PlayerEntity } from '@/entities/PlayerEntity';
import { Machine, type Job } from '@/machines/Machine';
import {
  DOOR,
  IDLE_TILES,
  STAGE_STATION,
  STATIONS,
  installStation,
  resetStations,
  stationOfType,
} from '@/machines/layout';
import {
  BACKLOG,
  BOUNTY,
  DRIFT,
  FAB,
  FILAMENT,
  GHOST_DECAY,
  MACHINE,
  MEMBER,
  PERFECTIONIST_QUALITY_GATE,
  PLAYER,
  ROSTER,
  SOURCING,
  STAGE_MAP,
  TIME,
  VERB_HOURS,
  eraDef,
} from '@/utils/constants';
import { CATALOG_MAP, canBuild, catalogForEra } from '@/utils/catalog';
import { clock, uid } from '@/utils/format';
import { rng } from '@/utils/rng';
import {
  addWork,
  expediteCost,
  generateParts,
  partsOutstanding,
  partsPending,
  remainingWork,
  resolveTest,
  stageComplete,
  startProject,
} from './ProjectSystem';

interface DayPlan {
  attending: boolean;
  arriveAt: number;
  leaveAt: number;
}

const FAB_MACHINES: MachineType[] = ['fdm', 'cnc'];

/**
 * The heart of the game. Members, the player, machines and the active projects live here;
 * management data (cash, backlog, era, log) lives in the Zustand store. The sim writes a
 * runtime snapshot to the store at 5 Hz and the UI reads only the store (CLAUDE.md §11).
 *
 * This module must never import `three` or touch the DOM — it has to be runnable headless
 * so that balance can be tested.
 */
export class Simulation {
  members: MemberEntity[] = [];
  player: PlayerEntity;
  machines: Machine[] = [];
  projects: ProjectData[] = [];

  day = 1;
  time = 9;
  private plans = new Map<string, DayPlan>();
  private snapshotTimer = 0;
  private seeded = new Set<string>();
  private requeueTimers = new Map<string, number>();

  constructor() {
    resetStations();
    for (const def of STATIONS) {
      if (!FAB_MACHINES.includes(def.type)) continue;
      this.machines.push(new Machine(def, def.type === 'fdm' ? FILAMENT.spoolGrams : 0));
    }
    this.members = ROSTER.map((data) => new MemberEntity({ ...data }, DOOR));
    this.player = new PlayerEntity(DOOR);
    this.player.arrive(DOOR);
    this.planDay();
    this.player.startDay();
    this.refreshBacklog();
    this.log('Day 1. The garage smells of PLA and instant coffee.', 'info');
    this.log('Pick something to build — check the backlog.', 'info');
    // The game opens paused, and publish() otherwise only runs inside tick(). Without this
    // the UI sees no player, reads your hours as zero, and disables every pitch button.
    this.publish();
  }

  /** Absolute sim-hour since the start; sourcing deadlines are anchored to this. */
  get totalHours(): number {
    return (this.day - 1) * TIME.hoursPerDay + this.time;
  }

  get printer(): Machine {
    return this.machines.find((m) => m.type === 'fdm')!;
  }

  machineFor(type: MachineType): Machine | undefined {
    return this.machines.find((m) => m.type === type);
  }

  project(id: string): ProjectData | undefined {
    return this.projects.find((p) => p.id === id);
  }

  private log(text: string, kind: 'info' | 'good' | 'bad' | 'warn' = 'info') {
    store.getState().pushLog(text, kind);
  }

  // -------------------------------------------------------------------------
  // Clock
  // -------------------------------------------------------------------------

  /** `dtReal` is real seconds; speed is the player's 1x/2x/4x. */
  tick(dtReal: number, speed: number) {
    const dt = (dtReal * speed) / TIME.secondsPerHour; // sim-hours

    this.time += dt;
    while (this.time >= TIME.hoursPerDay) {
      this.time -= TIME.hoursPerDay;
      this.day += 1;
      this.endOfDay();
      this.planDay();
      this.player.startDay();
      this.refreshBacklog();
    }

    this.tickMembers(dt);
    this.tickPlayer(dt);
    this.tickRequeue(dt);
    this.tickMachines(dt);
    this.advanceProjects();

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
      m.data.energy = Math.min(100, m.data.energy + 45);
      if (this.plans.get(m.id)?.attending && m.hasTrait('ghost')) {
        m.ghostFactor *= GHOST_DECAY;
      }
    }
  }

  /** §13.2 — commitment (hours/week) decides whether they turn up at all. */
  private planDay() {
    for (const m of this.members) {
      const moodFactor = 0.6 + m.data.mood / 125;
      // A live bounty on something they care about drags them in and keeps them longer.
      const tempted = this.projects.some(
        (p) =>
          p.bounties.includes(p.stage) &&
          p.required[p.stage] > 0 &&
          m.passionMatch(p.tags) >= BOUNTY.temptThreshold,
      );
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
      this.plans.set(m.id, { attending, arriveAt, leaveAt: Math.min(close, arriveAt + todayHours) });
      m.leaveAt = Math.min(close, arriveAt + todayHours);
    }
  }

  // -------------------------------------------------------------------------
  // Backlog — where projects come from (CLAUDE.md §4a)
  // -------------------------------------------------------------------------

  private buildableDefs(): ProjectDef[] {
    const { era, ownedMachines } = store.getState();
    const active = new Set(this.projects.map((p) => p.defId));
    return catalogForEra(era).filter(
      (def) => canBuild(def, ownedMachines) && !active.has(def.id) && !this.seeded.has(def.id),
    );
  }

  private refreshBacklog() {
    const state = store.getState();
    // Offers go stale. A sponsor who waited a fortnight has found somebody else.
    const live = state.backlog.filter((entry) => {
      if (entry.expiresOnDay && this.day > entry.expiresOnDay) {
        const def = CATALOG_MAP[entry.defId];
        this.log(`The ${def.name} offer expired.`, 'warn');
        return false;
      }
      return true;
    });
    if (live.length !== state.backlog.length) store.getState().setBacklog(live);
    if (live.length >= BACKLOG.maxOffers) return;

    const options = this.buildableDefs().filter((def) => !live.some((e) => e.defId === def.id));
    if (!options.length) return;

    // A member proposes something they are already excited about.
    if (rng.chance(BACKLOG.memberProposalChance)) {
      const member = rng.pick(this.members);
      const liked = options.filter((def) => member.passionMatch(def.tags) >= 0.4);
      if (liked.length) {
        const def = rng.pick(liked);
        this.addOffer({ defId: def.id, source: 'member', proposerId: member.id });
        this.log(`${member.name}: "we should build a ${def.name}. I'll take a stage myself."`, 'good');
      }
    }

    // A sponsor wants something specific, with money attached and a deadline.
    if (rng.chance(BACKLOG.sponsorChance)) {
      const def = rng.pick(options);
      const [lo, hi] = BACKLOG.sponsorCashRatio;
      const cash = Math.round((def.bomCost * rng.range(lo, hi)) / 100) * 100;
      const [dlo, dhi] = BACKLOG.sponsorDeadlineDays;
      this.addOffer({
        defId: def.id,
        source: 'sponsor',
        sponsorCash: cash,
        expiresOnDay: this.day + rng.int(dlo, dhi),
      });
      this.log(`A sponsor will pay ₺${cash.toLocaleString('tr-TR')} for a ${def.name}.`, 'good');
    }

    // Reddit is briefly obsessed with something. Ship while the wave lasts.
    if (rng.chance(BACKLOG.trendingChance)) {
      const def = rng.pick(options);
      const [mlo, mhi] = BACKLOG.trendingHypeMultiplier;
      const [dlo, dhi] = BACKLOG.trendingDeadlineDays;
      this.addOffer({
        defId: def.id,
        source: 'trending',
        hypeMultiplier: Number(rng.range(mlo, mhi).toFixed(2)),
        expiresOnDay: this.day + rng.int(dlo, dhi),
      });
      this.log(`r/DIY is full of ${def.name} builds this week.`, 'info');
    }
  }

  private addOffer(partial: Omit<BacklogEntry, 'id'>) {
    store.getState().addOffer({ id: uid('offer'), ...partial });
  }

  // -------------------------------------------------------------------------
  // Members
  // -------------------------------------------------------------------------

  /** Stages currently open to volunteers, across every active project. */
  private openAssignments(): Assignment[] {
    const out: Assignment[] = [];
    for (const p of this.projects) {
      if (p.shipped) continue;
      if (p.required[p.stage] <= 0) continue;
      // Nobody can assemble a thing whose parts are still in a container somewhere.
      if (p.stage === 'assembly' && partsPending(p, this.totalHours)) continue;
      out.push({ projectId: p.id, stage: p.stage });
    }
    return out;
  }

  private tickMembers(dt: number) {
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

      this.decideActivity(m, dt);
      m.advance(dt);
      this.performActivity(m, dt);
    }

    this.applyWork(dt);
  }

  /** Work is applied per project-stage, with diminishing returns for the crowd. */
  private applyWork(dt: number) {
    const groups = new Map<string, { project: ProjectData; workers: MemberEntity[] }>();

    for (const m of this.members) {
      if (!m.present || m.activity !== 'working' || !m.signedUp) continue;
      const project = this.project(m.signedUp.projectId);
      if (!project || project.stage !== m.signedUp.stage) continue;
      const key = `${project.id}:${project.stage}`;
      if (!groups.has(key)) groups.set(key, { project, workers: [] });
      groups.get(key)!.workers.push(m);
    }

    // The player counts as a worker on whatever they picked.
    if (this.player.present && this.player.activity === 'working' && this.player.task) {
      const project = this.project(this.player.task.projectId);
      if (project && project.stage === this.player.task.stage) {
        const key = `${project.id}:${project.stage}`;
        if (!groups.has(key)) groups.set(key, { project, workers: [] });
        // You lead the effort you have chosen to join.
        groups.get(key)!.workers.unshift(this.player);
      }
    }

    for (const { project, workers } of groups.values()) {
      const stage = STAGE_MAP[project.stage];
      let total = 0;
      let craftSum = 0;
      let rateSum = 0;
      workers.slice(0, MEMBER.maxWorkersPerStage).forEach((m, index) => {
        const factor = index === 0 ? 1 : MEMBER.extraWorkerFactor;
        const rate = m.workRate(stage, project.tags) * factor;
        total += rate * dt;
        rateSum += rate;
        const level = stage.skill ? m.data.skills[stage.skill] : 2;
        craftSum += (level / 5) * rate;
      });
      const craft = rateSum > 0 ? craftSum / rateSum : 0.5;
      addWork(project, total, Math.min(1, Math.max(0.1, craft)));
    }
  }

  /** The influence model in one function: nobody is told what to do. */
  private decideActivity(m: MemberEntity, _dt: number) {
    if (m.activity === 'resting') {
      if (m.data.energy >= 65) {
        m.activity = 'idle';
        m.note = 'back on it';
      } else {
        if (!m.walking && !this.atStation(m, 'lounge')) m.walkTo(stationOfType('lounge')!.stand);
        return;
      }
    }
    if (m.data.energy < MEMBER.tiredThreshold) {
      m.activity = 'resting';
      m.note = 'needs a sit-down';
      m.walkTo(stationOfType('lounge')!.stand);
      return;
    }

    // Still signed up for something that has moved on? Release them.
    if (m.signedUp) {
      const project = this.project(m.signedUp.projectId);
      if (!project || project.shipped || project.stage !== m.signedUp.stage) {
        m.signedUp = null;
      }
    }

    // Drift: interest gone, they unsign. This is the game's core antagonist.
    if (m.signedUp && m.interest < DRIFT.abandonThreshold) {
      const project = this.project(m.signedUp.projectId);
      this.log(
        `${m.name} drifted off ${project ? project.name : 'the project'} (${STAGE_MAP[m.signedUp.stage].label.toLowerCase()}).`,
        'warn',
      );
      m.setCooldown(m.signedUp, DRIFT.cooldownHours);
      m.signedUp = null;
      m.note = 'lost interest';
    }

    // Sign-up: the best match across every project competing for this person.
    if (!m.signedUp) {
      let best: { assignment: Assignment; appetite: number } | null = null;
      for (const assignment of this.openAssignments()) {
        if (m.isCoolingOff(assignment)) continue;
        const project = this.project(assignment.projectId)!;
        const stage = STAGE_MAP[assignment.stage];
        const match = m.passionMatch(project.tags);
        const bounty = project.bounties.includes(assignment.stage);
        const proposer = project.proposerId === m.id ? BACKLOG.proposerInterestBonus : 0;
        const appetite = match * (0.45 + stage.appeal * 0.55) + (bounty ? 0.5 : 0) + proposer;
        if (!best || appetite > best.appetite) best = { assignment, appetite };
      }
      if (best && best.appetite >= DRIFT.signupThreshold && rng.chance(0.55)) {
        const project = this.project(best.assignment.projectId)!;
        const bounty = project.bounties.includes(best.assignment.stage);
        m.signedUp = best.assignment;
        m.interest = Math.min(
          1.4,
          DRIFT.startInterest * (0.5 + m.passionMatch(project.tags)) + (bounty ? DRIFT.bountyInterest : 0),
        );
        m.note = `${project.name}: ${STAGE_MAP[best.assignment.stage].label.toLowerCase()}`;
      }
    }

    if (m.signedUp) {
      const stationType = STAGE_STATION[m.signedUp.stage];
      if (stationType) {
        const station = stationOfType(stationType);
        if (station) {
          if (this.atStation(m, stationType)) {
            m.activity = 'working';
          } else if (!m.walking) {
            m.walkTo(station.stand);
          }
          return;
        }
      }
    }

    // Nothing to build by hand? Somebody may fuss over the printer instead.
    const printer = this.printer;
    if (printer.calibration < MACHINE.calibrationWarning || printer.running) {
      if (this.atStation(m, 'fdm')) {
        m.activity = 'babysitting';
        m.note = printer.calibration < MACHINE.calibrationWarning ? 'levelling the bed' : 'watching the print';
      } else if (!m.walking) {
        m.walkTo(printer.def.stand);
      }
      return;
    }

    if (!m.walking && m.activity !== 'idle') {
      m.activity = 'idle';
      m.note = 'hanging around';
      m.walkTo(rng.pick(IDLE_TILES));
    } else if (!m.walking) {
      m.activity = 'idle';
    }
  }

  private performActivity(m: MemberEntity, dt: number) {
    switch (m.activity) {
      case 'working': {
        const stage = m.signedUp ? STAGE_MAP[m.signedUp.stage] : null;
        m.data.energy = Math.max(0, m.data.energy - MEMBER.energyDrain * dt);
        if (stage) m.interest -= DRIFT.decayPerHour * (1 - stage.appeal) * dt;
        break;
      }
      case 'resting':
        m.data.energy = Math.min(100, m.data.energy + MEMBER.energyRestore * dt);
        break;
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

  private atStation(m: MemberEntity, type: MachineType): boolean {
    const station = stationOfType(type);
    if (!station) return false;
    return !m.walking && m.tile.x === station.stand.x && m.tile.y === station.stand.y;
  }

  // -------------------------------------------------------------------------
  // The player
  // -------------------------------------------------------------------------

  private tickPlayer(dt: number) {
    const p = this.player;

    if (p.hoursLeft <= 0) {
      if (!p.present) return;
      if (p.tile.x === DOOR.x && p.tile.y === DOOR.y && !p.walking) {
        p.leave();
        p.note = 'done for today';
        return;
      }
      p.task = null;
      p.calibrating = false;
      p.note = 'out of hours';
      if (!p.walking) p.walkTo(DOOR);
      p.advance(dt);
      return;
    }

    if (!p.present) {
      if (this.time >= PLAYER.startHour) {
        p.arrive(DOOR);
        p.note = 'in the space';
      }
      return;
    }

    // Chosen task finished or moved on under you.
    if (p.task) {
      const project = this.project(p.task.projectId);
      if (!project || project.shipped || project.stage !== p.task.stage) {
        p.task = null;
        p.note = 'looking for something to do';
      }
    }

    if (p.calibrating) {
      const printer = this.printer;
      if (this.atStation(p, 'fdm')) {
        p.activity = 'babysitting';
        p.note = 'levelling the bed';
        printer.operatorSkill = Math.max(printer.operatorSkill, p.data.skills.machining);
        printer.calibrate(dt);
        this.spendPlayerTime(dt);
        if (printer.calibration >= 0.99) {
          p.calibrating = false;
          p.note = 'bed is flat again';
        }
      } else if (!p.walking) {
        p.walkTo(printer.def.stand);
      }
      p.advance(dt);
      return;
    }

    if (p.task) {
      const stationType = STAGE_STATION[p.task.stage];
      const station = stationType ? stationOfType(stationType) : undefined;
      if (station) {
        if (this.atStation(p, station.type)) {
          p.activity = 'working';
          p.note = `${this.project(p.task.projectId)!.name}: ${STAGE_MAP[p.task.stage].label.toLowerCase()}`;
          this.spendPlayerTime(dt);
        } else if (!p.walking) {
          p.walkTo(station.stand);
        }
      }
      p.advance(dt);
      return;
    }

    if (!p.walking && p.activity !== 'idle') {
      p.activity = 'idle';
      p.note = 'free — pick something';
      p.walkTo(rng.pick(IDLE_TILES));
    } else if (!p.walking) {
      p.activity = 'idle';
    }
    p.advance(dt);
  }

  private spendPlayerTime(dt: number) {
    this.player.hoursLeft = Math.max(0, this.player.hoursLeft - dt);
    this.player.data.energy = Math.max(0, this.player.data.energy - PLAYER.energyDrain * dt);
  }

  /** Charge a management verb against today's budget. */
  private chargeHours(verb: keyof typeof VERB_HOURS | string): boolean {
    const cost = VERB_HOURS[verb] ?? 0;
    if (!this.player.canAfford(cost)) {
      this.log(`No hours left today for that.`, 'bad');
      return false;
    }
    this.player.spendHours(cost);
    return true;
  }

  // -------------------------------------------------------------------------
  // Machines
  // -------------------------------------------------------------------------

  /**
   * Nobody is obliged to notice a failed print, but somebody in the building eventually
   * does. The player can always re-queue instantly and save the wait.
   */
  private tickRequeue(dt: number) {
    const witness = this.members.some((m) => m.present) || this.player.present;
    for (const project of this.projects) {
      if (project.stage !== 'fabrication') {
        this.requeueTimers.delete(project.id);
        continue;
      }
      const pending = project.parts.filter((p) => p.status === 'pending');
      if (!pending.length) {
        this.requeueTimers.set(project.id, 0);
        continue;
      }
      // No point queueing onto a machine with nothing to make it from.
      const starved = pending.every((p) => this.machineFor(p.machineType)?.starved ?? true);
      if (starved) continue;
      // Accumulate only while somebody is around, but do NOT reset when they go home:
      // volunteers arrive in 2-3 hour bursts and a continuous-presence timer never elapses.
      if (!witness) continue;
      const next = (this.requeueTimers.get(project.id) ?? 0) + dt;
      if (next < FAB.memberRequeueHours) {
        this.requeueTimers.set(project.id, next);
        continue;
      }
      this.requeueTimers.set(project.id, 0);
      this.queuePart(project.id, pending[0].id);
      const who = this.members.find((m) => m.present)?.name ?? 'You';
      this.log(`${who} re-queued ${pending[0].name} (${project.name}).`, 'info');
    }
  }

  private tickMachines(dt: number) {
    for (const machine of this.machines) {
      const operated = this.members.some(
        (m) => m.present && m.activity === 'babysitting' && this.atStation(m, machine.type),
      );
      if (!operated && !(this.player.present && this.player.calibrating)) machine.operatorSkill = 0;

      const result = machine.tick(dt);
      if (!result) continue;

      const project = this.project(result.job.projectId);
      const part = project?.parts.find((p) => p.id === result.job.partId);
      const label = project ? ` (${project.name})` : '';
      if (result.kind === 'done') {
        if (part) part.status = 'done';
        this.log(`${result.job.partName} finished${label}. ${clock(this.time)}`, 'good');
      } else {
        if (part) {
          part.status = 'pending';
          part.attempts += 1;
        }
        const wasted = Math.round(result.job.materialDrawn * MACHINE.wasteOnFailure);
        this.log(
          `${result.job.partName}${label} ${result.reason} at hour ${result.atHour.toFixed(1)} of ${result.job.hoursRequired}.` +
            (wasted > 0 ? ` ${wasted}g wasted.` : ''),
          'bad',
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Stage advancement
  // -------------------------------------------------------------------------

  private advanceProjects() {
    for (const project of [...this.projects]) {
      this.advanceProject(project);
    }
  }

  private advanceProject(project: ProjectData) {
    const stage = project.stage;

    if (stage === 'fabrication') {
      if (!this.seeded.has(project.id)) {
        this.seeded.add(project.id);
        this.queueAllPending(project.id);
      }
      if (partsOutstanding(project).length === 0 && project.parts.length > 0) {
        this.setStage(project, 'assembly', `${project.name}: all parts made.`, 'good');
      }
      return;
    }

    if (stage === 'test') {
      const outcome = resolveTest(project);
      if (outcome.passed) {
        this.setStage(project, 'release', `${project.name} works. Passed on attempt ${project.testAttempts}.`, 'good');
      } else {
        this.log(`${project.name} failed testing: ${outcome.defect}`, 'bad');
        this.setStage(project, 'iterate', outcome.brokenPartId ? `A part needs remaking.` : `Back to CAD.`, 'warn');
      }
      return;
    }

    if (!stageComplete(project)) return;

    // Perfectionist gate: they will not sign off on shoddy work (CLAUDE.md §3).
    const blocker = this.members.find(
      (m) =>
        m.present &&
        m.signedUp?.projectId === project.id &&
        m.signedUp.stage === stage &&
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
        this.setStage(project, 'cad', `${project.name}: concept locked.`);
        break;
      case 'cad':
        generateParts(project);
        this.setStage(
          project,
          'simulation',
          `${project.name}: CAD done at ${Math.round(project.quality * 100)}% quality, ${project.parts.length} parts to make.`,
        );
        break;
      case 'simulation':
        this.setStage(project, 'fabrication', `${project.name}: simulation clean.`);
        break;
      case 'assembly':
        this.setStage(project, 'test', `${project.name} assembled. Time to find out.`);
        break;
      case 'iterate': {
        const outstanding = partsOutstanding(project);
        if (outstanding.length) {
          this.seeded.delete(project.id);
          this.setStage(project, 'fabrication', `${project.name}: ${outstanding.length} part(s) back on the machine.`);
        } else {
          this.setStage(project, 'test', `${project.name}: fixes in, testing again.`);
        }
        break;
      }
      case 'release':
        this.ship(project);
        break;
      default:
        break;
    }
  }

  private setStage(
    project: ProjectData,
    next: StageKey,
    message: string,
    kind: 'info' | 'good' | 'bad' | 'warn' = 'info',
  ) {
    project.stage = next;
    if (next === 'fabrication') this.seeded.delete(project.id);
    // A new stage means new sign-ups. Nobody is carried over — this is the drift engine.
    for (const m of this.members) {
      if (m.signedUp?.projectId === project.id) m.signedUp = null;
    }
    if (this.player.task?.projectId === project.id) this.player.task = null;
    if (message) this.log(message, kind);
  }

  private ship(project: ProjectData) {
    const def = CATALOG_MAP[project.defId];
    project.shipped = true;
    this.projects = this.projects.filter((p) => p.id !== project.id);
    this.seeded.delete(project.id);

    if (def.payout > 0) {
      store.getState().earn(def.payout);
      this.log(`${project.name} shipped on day ${this.day} — ₺${def.payout.toLocaleString('tr-TR')}.`, 'good');
    } else {
      this.log(`${project.name} shipped on day ${this.day}.`, 'good');
    }

    if (def.unlocksMachine) this.installMachine(def.unlocksMachine);

    const before = store.getState().era;
    store.getState().recordShipped();
    const after = store.getState().era;
    if (after > before) {
      this.log(`You can take on ${eraDef(after).slots} projects at once now — ${eraDef(after).name}.`, 'good');
    }
  }

  private installMachine(type: MachineType) {
    const def = installStation(type, `${type}-${this.machines.length + 1}`);
    if (!def) {
      this.log(`No room left for the new machine. It lives in the corridor.`, 'warn');
      return;
    }
    if (FAB_MACHINES.includes(type)) {
      this.machines.push(new Machine(def, type === 'fdm' ? FILAMENT.spoolGrams : 0));
    }
    store.getState().ownMachine(type);
    this.log(`${def.label} is up and running. New things are possible.`, 'good');
  }

  // -------------------------------------------------------------------------
  // Player verbs (CLAUDE.md §3) — every one costs hours
  // -------------------------------------------------------------------------

  get slotsUsed(): number {
    return this.projects.length;
  }

  get slotsTotal(): number {
    return eraDef(store.getState().era).slots;
  }

  /** Start something. `offerId` is set when taking a backlog offer rather than the catalog. */
  pitch(defId: string, offerId?: string): boolean {
    const state = store.getState();
    if (this.slotsUsed >= this.slotsTotal) {
      this.log(`No room for another project right now.`, 'bad');
      return false;
    }
    const def = CATALOG_MAP[defId];
    if (!def || !canBuild(def, state.ownedMachines)) {
      this.log(`The space can't build that yet.`, 'bad');
      return false;
    }
    if (!this.chargeHours('pitch')) return false;

    const offer = offerId ? state.backlog.find((e) => e.id === offerId) : undefined;
    const entry: BacklogEntry = offer ?? { id: uid('offer'), defId, source: 'catalog' };
    const project = startProject(entry, this.day);

    // Owning a reflow oven takes the misery out of electronics assembly.
    if (state.ownedMachines.includes('reflow') && def.category === 'electronics') {
      project.required.assembly = Math.round(project.required.assembly * 0.75);
    }

    this.projects.push(project);
    this.seeded.delete(project.id);
    if (offer) {
      store.getState().removeOffer(offer.id);
      if (offer.sponsorCash) {
        store.getState().earn(offer.sponsorCash);
        this.log(`Sponsor paid ₺${offer.sponsorCash.toLocaleString('tr-TR')} up front for ${def.name}.`, 'good');
      }
      if (offer.proposerId) {
        const member = this.members.find((m) => m.id === offer.proposerId);
        if (member) {
          member.signedUp = { projectId: project.id, stage: 'concept' };
          member.interest = 1.2;
          this.log(`${member.name} signed straight up for ${def.name}.`, 'good');
        }
      }
    }
    this.log(`Pitched ${def.name}. ${def.blurb}`, 'info');
    return true;
  }

  /** Put yourself on a stage. The one place in the game you can give a direct order. */
  workOn(projectId: string, stage: StageKey) {
    const project = this.project(projectId);
    if (!project || project.stage !== stage) return;
    if (STAGE_STATION[stage] === null) {
      this.log(`That stage isn't done by hand.`, 'warn');
      return;
    }
    if (stage === 'assembly' && partsPending(project, this.totalHours)) {
      this.log(`The parts for ${project.name} haven't arrived yet.`, 'warn');
      return;
    }
    this.player.calibrating = false;
    this.player.task = { projectId, stage };
  }

  stopWork() {
    this.player.task = null;
    this.player.calibrating = false;
  }

  calibratePrinter() {
    this.player.task = null;
    this.player.calibrating = true;
  }

  /** Re-pitch: re-roll interest among members who have not signed up. */
  repitch(projectId: string) {
    const project = this.project(projectId);
    if (!project) return;
    if (!this.chargeHours('repitch')) return;
    const stage = STAGE_MAP[project.stage];
    let took = 0;
    for (const m of this.members) {
      if (m.signedUp || !m.present) continue;
      const assignment: Assignment = { projectId, stage: project.stage };
      if (m.isCoolingOff(assignment)) continue;
      const match = m.passionMatch(project.tags) + DRIFT.repitchBonus;
      if (match * (0.45 + stage.appeal * 0.55) >= DRIFT.signupThreshold && rng.chance(0.6)) {
        m.signedUp = assignment;
        m.interest = DRIFT.startInterest * (0.5 + match);
        took += 1;
      }
    }
    this.log(
      took ? `Re-pitched ${project.name}: ${took} signed up.` : `Re-pitched ${project.name}. Nobody bit.`,
      took ? 'good' : 'warn',
    );
  }

  bountyCost(projectId: string): number {
    const project = this.project(projectId);
    if (!project) return BOUNTY.minCost;
    return Math.max(BOUNTY.minCost, Math.round(remainingWork(project) * BOUNTY.costPerWorkUnit));
  }

  /** The only reliable way to get boring work done. */
  postBounty(projectId: string): boolean {
    const project = this.project(projectId);
    if (!project || project.bounties.includes(project.stage)) return false;
    const cost = this.bountyCost(projectId);
    if (store.getState().cash < cost) {
      this.log(`Not enough cash for a bounty.`, 'bad');
      return false;
    }
    if (!this.chargeHours('bounty')) return false;
    store.getState().spend(cost);
    project.bounties.push(project.stage);
    for (const m of this.members) {
      m.interest = Math.min(1.4, m.interest + DRIFT.bountyInterest);
      m.clearCooldowns();
    }
    this.log(`Bounty on ${project.name} · ${STAGE_MAP[project.stage].label}. Pizza is on the way.`, 'good');
    return true;
  }

  /** Order the bought parts. Cheap now, expensive to have forgotten (CLAUDE.md §4). */
  orderParts(projectId: string): boolean {
    const project = this.project(projectId);
    if (!project || project.partsOrdered) return false;
    if (store.getState().cash < project.bomCost) {
      this.log(`Not enough cash for the ${project.name} bill of materials.`, 'bad');
      return false;
    }
    if (!this.chargeHours('order')) return false;
    store.getState().spend(project.bomCost);
    project.partsOrdered = true;
    project.partsArriveAt = this.totalHours + project.leadDays * TIME.hoursPerDay;
    this.log(`Ordered parts for ${project.name}. ${project.leadDays} days out.`, 'info');
    return true;
  }

  expediteCostFor(projectId: string): number {
    const project = this.project(projectId);
    return project ? expediteCost(project, this.totalHours) : 0;
  }

  expediteParts(projectId: string): boolean {
    const project = this.project(projectId);
    if (!project || !project.partsOrdered) return false;
    const remaining = project.partsArriveAt - this.totalHours;
    if (remaining <= 0) return false;
    const cost = expediteCost(project, this.totalHours);
    if (store.getState().cash < cost) {
      this.log(`Not enough cash to expedite.`, 'bad');
      return false;
    }
    if (!this.chargeHours('expedite')) return false;
    store.getState().spend(cost);
    project.partsArriveAt = this.totalHours + remaining * SOURCING.expediteFactor;
    this.log(`Paid to expedite the ${project.name} order.`, 'good');
    return true;
  }

  skipSimulation(projectId: string) {
    const project = this.project(projectId);
    if (!project || project.stage !== 'simulation') return;
    project.simulationSkipped = true;
    this.setStage(project, 'fabrication', `${project.name}: simulation skipped. Hope the maths was right.`, 'warn');
  }

  queuePart(projectId: string, partId: string) {
    const project = this.project(projectId);
    const part = project?.parts.find((p) => p.id === partId);
    if (!project || !part || part.status === 'done' || part.status === 'queued') return;
    const machine = this.machineFor(part.machineType);
    if (!machine) {
      this.log(`No ${part.machineType} in the space for ${part.name}.`, 'bad');
      return;
    }
    const job: Job = {
      id: uid('job'),
      projectId: project.id,
      partId: part.id,
      partName: part.name,
      hoursRequired: part.hours,
      progress: 0,
      material: part.material,
      materialDrawn: 0,
    };
    part.status = 'queued';
    machine.enqueue(job);
  }

  queueAllPending(projectId: string) {
    const project = this.project(projectId);
    if (!project) return;
    const pending = project.parts.filter((p) => p.status === 'pending');
    pending.forEach((p) => this.queuePart(projectId, p.id));
    if (pending.length) this.log(`${pending.length} part(s) queued (${project.name}).`);
  }

  moveJob(machineId: string, jobId: string, direction: -1 | 1) {
    this.machines.find((m) => m.id === machineId)?.moveJob(jobId, direction);
  }

  cancelJob(machineId: string, jobId: string) {
    const machine = this.machines.find((m) => m.id === machineId);
    const job = machine?.cancelJob(jobId);
    if (!job) return;
    const part = this.project(job.projectId)?.parts.find((p) => p.id === job.partId);
    if (part) part.status = 'pending';
  }

  buyFilament(): boolean {
    if (store.getState().cash < FILAMENT.spoolCost) {
      this.log(`Not enough cash for filament.`, 'bad');
      return false;
    }
    if (!this.chargeHours('filament')) return false;
    store.getState().spend(FILAMENT.spoolCost);
    this.printer.refill(FILAMENT.spoolGrams);
    this.log(`New spool loaded.`, 'good');
    return true;
  }

  // -------------------------------------------------------------------------

  /**
   * Public because every player action must push a snapshot immediately: the game can be
   * paused, and otherwise a pitch, an order or a queue change would not reach the UI until
   * the clock next moved. Game wraps each UI handler in this.
   */
  publish() {
    const machines: MachineSnapshot[] = this.machines.map((m) => m.snapshot());
    store.getState().setRuntime({
      members: this.members.map((m) => m.snapshot()),
      machines,
      projects: this.projects.map((p) => structuredClone(p)),
      player: this.player.playerSnapshot(),
    });
  }
}
