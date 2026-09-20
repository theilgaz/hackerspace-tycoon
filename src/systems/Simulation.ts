import { store } from '@/game/store';
import type {
  BacklogEntry,
  MemberData,
  RivalState,
  ScoreRow,
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
  APPLICANTS,
  PLAYER,
  RECRUIT,
  SHELVE,
  ROSTER,
  TEAM,
  SOURCING,
  STAGE_MAP,
  TIME,
  VERB_HOURS,
  eraDef,
} from '@/utils/constants';
import { CATALOG_MAP, canBuild, catalogForEra } from '@/utils/catalog';
import { RIVAL_MAP, YEAR_DAYS } from '@/utils/rivals';
import { createRivals, runCeremony, tickRivals } from './RivalSystem';
import { categoryAffinity, stageLabel, stageSkill, stageStation } from '@/utils/categories';
import { clock, money, uid } from '@/utils/format';
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
  /** The other spaces in town, and where we are in the awards year (§11). */
  rivals: RivalState[] = createRivals();
  private yearStart = { day: 1, projects: 0, reputation: 0 };
  private rivalYearStart = new Map<string, { projects: number; reputation: number }>();

  constructor() {
    resetStations();
    for (const def of STATIONS) {
      if (!FAB_MACHINES.includes(def.type)) continue;
      this.machines.push(new Machine(def, def.type === 'fdm' ? FILAMENT.spoolGrams : 0));
    }
    this.members = ROSTER.map((data) => new MemberEntity({ ...data }, DOOR));
    this.player = new PlayerEntity(DOOR);
    this.player.arrive(DOOR);
    for (const rival of this.rivals) {
      this.rivalYearStart.set(rival.id, { projects: 0, reputation: 0 });
    }
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

  /** Owned kit that changes how the machines behave. */
  private applyPerks() {
    const owned = store.getState().ownedMachines;
    const dry = owned.includes('drybox') ? 0.8 : 1;
    for (const machine of this.machines) {
      if (machine.type === 'fdm') machine.failureModifier = dry;
    }
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
      tickRivals(this.rivals);
      this.checkAwards();
      this.openApplicants();
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
    this.shelveAbandoned();
    for (const m of this.members) {
      if (m.present) m.leave();
      m.data.energy = Math.min(100, m.data.energy + 45);
      if (this.plans.get(m.id)?.attending && m.hasTrait('ghost')) {
        m.ghostFactor *= GHOST_DECAY;
      }
    }
  }

  /**
   * The shelf. Nothing stops you starting a dozen projects, but the ones nobody ever
   * picks up quietly die, and the money you spent on their parts dies with them.
   */
  private shelveAbandoned() {
    for (const project of [...this.projects]) {
      // A project with parts on a machine is alive even with nobody standing over it —
      // that is the whole point of jobs running on the clock.
      const onAMachine = this.machines.some(
        (machine) =>
          machine.current?.projectId === project.id ||
          machine.queue.some((job) => job.projectId === project.id),
      );
      const worked = project.team.length > 0 || this.player.project === project.id || onAMachine;
      if (worked) {
        project.idleDays = 0;
        continue;
      }
      project.idleDays += 1;
      if (project.idleDays < SHELVE.afterIdleDays) continue;
      this.projects = this.projects.filter((p) => p.id !== project.id);
      this.seeded.delete(project.id);
      this.log(
        `Nobody touched ${project.name} for ${SHELVE.afterIdleDays} days. It is on the shelf now.`,
        'bad',
      );
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

  /** Projects with a free seat on the team. */
  private joinableProjects(): ProjectData[] {
    return this.projects.filter((p) => !p.shipped && p.team.length < p.teamSize);
  }

  /** Is there hand work available on this project right now? */
  private hasOpenWork(project: ProjectData): boolean {
    if (project.required[project.stage] <= 0) return false;
    if (stageStation(project.category, project.stage) === null) return false;
    // Nobody can assemble a thing whose parts are still in a container somewhere.
    if (project.stage === 'assembly' && partsPending(project, this.totalHours)) return false;
    return true;
  }

  member(id: string): MemberEntity | undefined {
    return this.members.find((m) => m.id === id);
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
      if (!m.present || m.activity !== 'working' || !m.team) continue;
      const project = this.project(m.team);
      if (!project) continue;
      const key = project.id;
      if (!groups.has(key)) groups.set(key, { project, workers: [] });
      groups.get(key)!.workers.push(m);
    }

    // The player counts as a worker on whatever they put themselves on.
    if (this.player.present && this.player.activity === 'working' && this.player.project) {
      const project = this.project(this.player.project);
      if (project) {
        const key = project.id;
        if (!groups.has(key)) groups.set(key, { project, workers: [] });
        // You lead the effort you have chosen to join.
        groups.get(key)!.workers.unshift(this.player);
      }
    }

    for (const { project, workers } of groups.values()) {
      const skill = stageSkill(project.category, project.stage);
      let total = 0;
      let craftSum = 0;
      let rateSum = 0;
      workers.slice(0, MEMBER.maxWorkersPerStage).forEach((m, index) => {
        // Each extra pair of hands helps less than the last — eight people around one
        // bench is not eight times the throughput.
        const factor =
          index === 0 ? 1 : MEMBER.extraWorkerFactor * Math.pow(MEMBER.crowdDecay, index - 1);
        const rate = m.workRate(skill, project.tags) * factor;
        total += rate * dt;
        rateSum += rate;
        const level = skill ? m.data.skills[skill] : 2;
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

    // On a team whose project has gone? Release them.
    if (m.team && !this.project(m.team)) m.team = null;

    // Drift: interest gone, they walk away from the team. The core antagonist.
    if (m.team && m.interest < DRIFT.abandonThreshold) {
      const project = this.project(m.team)!;
      this.log(`${m.name} drifted off ${project.name}.`, 'warn');
      this.dropFromTeam(project, m, DRIFT.cooldownHours);
      m.note = 'lost interest';
    }

    // Volunteers still volunteer: an unallocated member may join something themselves.
    if (!m.team) {
      let best: { project: ProjectData; appetite: number } | null = null;
      for (const project of this.joinableProjects()) {
        if (m.isCoolingOff(project.id)) continue;
        const stage = STAGE_MAP[project.stage];
        const match = m.passionMatch(project.tags);
        const bounty = project.bounties.includes(project.stage);
        const proposer = project.proposerId === m.id ? BACKLOG.proposerInterestBonus : 0;
        const appetite = match * (0.45 + stage.appeal * 0.55) + (bounty ? 0.5 : 0) + proposer;
        if (!best || appetite > best.appetite) best = { project, appetite };
      }
      if (best && best.appetite >= DRIFT.signupThreshold && rng.chance(0.4)) {
        this.addToTeam(best.project, m);
        m.note = `joined ${best.project.name}`;
      }
    }

    // On a team: work the current stage if there is hand work to be done.
    if (m.team) {
      const project = this.project(m.team)!;
      if (this.hasOpenWork(project)) {
        const station = stationOfType(stageStation(project.category, project.stage)!);
        if (station) {
          if (this.atStation(m, station.type)) {
            m.activity = 'working';
            m.note = `${project.name}: ${stageLabel(project.category, project.stage).toLowerCase()}`;
          } else if (!m.walking) {
            m.walkTo(station.stand);
          }
          return;
        }
      } else {
        m.note = `${project.name}: waiting`;
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
        const project = m.team ? this.project(m.team) : null;
        const stage = project ? STAGE_MAP[project.stage] : null;
        m.data.energy = Math.max(0, m.data.energy - MEMBER.energyDrain * dt);
        if (stage) m.interest -= DRIFT.decayPerHour * (1 - stage.appeal) * dt;
        break;
      }
      case 'resting':
        m.data.energy = Math.min(100, m.data.energy + MEMBER.energyRestore * dt);
        break;
      case 'idle': {
        // Hanging about waiting for a machine erodes enthusiasm, just more slowly.
        if (m.team) m.interest -= DRIFT.decayPerHour * 0.35 * dt;
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

    // Only a shipped or cancelled project takes you off it — never a stage change.
    if (p.project && !this.project(p.project)) {
      p.project = null;
      p.note = 'looking for something to do';
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

    if (p.project) {
      const project = this.project(p.project)!;
      if (this.hasOpenWork(project)) {
        const station = stationOfType(stageStation(project.category, project.stage)!);
        if (station) {
          if (this.atStation(p, station.type)) {
            p.activity = 'working';
            p.note = `${project.name}: ${stageLabel(project.category, project.stage).toLowerCase()}`;
            this.spendPlayerTime(dt);
          } else if (!p.walking) {
            p.walkTo(station.stand);
          }
          p.advance(dt);
          return;
        }
      }
      // Nothing to do by hand right now — stay on the project and wait it out.
      if (!p.walking) {
        p.activity = 'idle';
        p.note = `${project.name}: nothing to do by hand`;
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
      // Software has nothing to make. Without this the stage never completes.
      if (project.parts.length === 0) {
        this.setStage(project, 'assembly', '');
        return;
      }
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
        m.team === project.id &&
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
    // The team carries across stages — that is what allocating one means. Drift, not the
    // stage change, is what costs you people now.
    if (message) this.log(message, kind);
  }

  private ship(project: ProjectData) {
    const def = CATALOG_MAP[project.defId];
    project.shipped = true;
    this.projects = this.projects.filter((p) => p.id !== project.id);
    this.seeded.delete(project.id);
    if (this.player.project === project.id) this.player.project = null;
    for (const m of this.members) {
      if (m.team === project.id) {
        m.team = null;
        m.note = `${project.name} is done`;
      }
    }

    if (def.payout > 0) {
      store.getState().earn(def.payout);
      this.log(`${project.name} shipped on day ${this.day} — ₺${def.payout.toLocaleString('tr-TR')}.`, 'good');
    } else {
      this.log(`${project.name} shipped on day ${this.day}.`, 'good');
    }

    if (def.unlocksMachine) this.installMachine(def.unlocksMachine);
    this.recruit(project);

    const before = store.getState().era;
    store.getState().recordShipped(Math.round(def.hype * project.hypeMultiplier));
    const after = store.getState().era;
    if (after > before) {
      this.log(`Word is getting around — ${eraDef(after).name}. New projects are open to you.`, 'good');
    }
  }

  installMachine(type: MachineType) {
    const def = installStation(type, `${type}-${this.machines.length + 1}`);
    if (!def) {
      this.log(`No room left for the new machine. It lives in the corridor.`, 'warn');
      return;
    }
    if (FAB_MACHINES.includes(type)) {
      this.machines.push(new Machine(def, type === 'fdm' ? FILAMENT.spoolGrams : 0));
    }
    store.getState().ownMachine(type);
    this.applyPerks();
    this.log(`${def.label} is up and running. New things are possible.`, 'good');
  }

  // -------------------------------------------------------------------------
  // Teams (CLAUDE.md §3b) — you allocate, but they are still volunteers
  // -------------------------------------------------------------------------

  private addToTeam(project: ProjectData, member: MemberEntity, interest?: number) {
    if (project.team.includes(member.id)) return;
    project.team.push(member.id);
    member.team = project.id;
    member.interest = interest ?? TEAM.joinInterest * (0.5 + member.passionMatch(project.tags));
  }

  private dropFromTeam(project: ProjectData, member: MemberEntity, cooldownHours: number) {
    project.team = project.team.filter((id) => id !== member.id);
    member.team = null;
    member.interest = 0;
    if (cooldownHours > 0) member.setCooldown(project.id, cooldownHours);
  }

  /**
   * Ask somebody to join a project. They are volunteers, so this is a request: a poor
   * passion match is usually declined, and a refusal sticks for a while. A live bounty
   * makes a "yes" much likelier — which is the influence model doing its job.
   */
  inviteMember(projectId: string, memberId: string): boolean {
    const project = this.project(projectId);
    const member = this.member(memberId);
    if (!project || !member) return false;

    if (project.team.length >= project.teamSize) {
      this.log(`${project.name}'s team is full (${project.teamSize}).`, 'warn');
      return false;
    }
    if (member.team) {
      const other = this.project(member.team);
      this.log(`${member.name} is already on ${other ? other.name : 'something else'}.`, 'warn');
      return false;
    }
    if (member.isCoolingOff(projectId)) {
      this.log(`${member.name} has already said no to ${project.name}.`, 'warn');
      return false;
    }

    // Rate against the genre, not a single tag: it is what the crew picker shows.
    const match = Math.max(member.passionMatch(project.tags), categoryAffinity(member.data.passions, project.category));
    const bounty = project.bounties.includes(project.stage) ? TEAM.bountyAcceptBonus : 0;
    const chance = Math.min(0.97, TEAM.acceptBase + match * TEAM.acceptFromPassion + bounty);
    if (!rng.chance(chance)) {
      member.setCooldown(projectId, TEAM.declineCooldownHours);
      this.log(`${member.name} passed on ${project.name}. "Not really my thing."`, 'warn');
      return false;
    }

    this.addToTeam(project, member);
    this.log(`${member.name} joined ${project.name}.`, 'good');
    return true;
  }

  /** Take somebody off a project. They will not come straight back to it. */
  releaseMember(projectId: string, memberId: string) {
    const project = this.project(projectId);
    const member = this.member(memberId);
    if (!project || !member) return;
    this.dropFromTeam(project, member, TEAM.declineCooldownHours / 2);
    this.log(`${member.name} left ${project.name}.`, 'info');
  }

  /** Bring somebody into the space as a member. */
  joinMember(data: MemberData): MemberEntity {
    const entity = new MemberEntity({ ...data }, DOOR);
    this.members.push(entity);
    this.plans.set(data.id, { attending: false, arriveAt: 0, leaveAt: 0 });
    return entity;
  }

  /** Where the current awards year has got to. */
  get season(): { year: number; dayOfYear: number; length: number } {
    const elapsed = this.day - this.yearStart.day;
    return {
      year: Math.floor((this.day - 1) / YEAR_DAYS) + 1,
      dayOfYear: Math.min(YEAR_DAYS, elapsed),
      length: YEAR_DAYS,
    };
  }

  /** Everybody on one leaderboard, the player included. */
  scoreboard(): ScoreRow[] {
    const state = store.getState();
    const rows: ScoreRow[] = this.rivals.map((rival) => {
      const def = RIVAL_MAP[rival.id];
      const since = this.rivalYearStart.get(rival.id) ?? { projects: 0, reputation: 0 };
      return {
        id: rival.id,
        name: def.name,
        icon: def.icon,
        colour: def.colour,
        projects: rival.projects,
        projectsThisYear: rival.projects - since.projects,
        members: rival.members,
        cash: rival.cash,
        reputation: rival.reputation,
        reputationThisYear: rival.reputation - since.reputation,
        isPlayer: false,
      };
    });
    rows.push({
      id: 'player',
      name: state.identity?.name ?? 'Your space',
      icon: state.identity?.icon ?? 'wrench',
      colour: state.identity?.colour ?? '#5ecfc0',
      projects: state.shippedCount,
      projectsThisYear: state.shippedCount - this.yearStart.projects,
      members: this.members.length + 1, // you count
      cash: state.cash,
      reputation: state.reputation,
      reputationThisYear: state.reputation - this.yearStart.reputation,
      isPlayer: true,
    });
    return rows.sort((a, b) => b.reputation - a.reputation);
  }

  /** The awards night, once a year. */
  private checkAwards() {
    if (this.day - this.yearStart.day < YEAR_DAYS) return;
    const ceremony = runCeremony(this.season.year - 1, this.scoreboard());
    if (ceremony.reputationGained > 0) {
      store.getState().recordReputation(ceremony.reputationGained);
    }
    store.getState().setCeremony(ceremony);
    const won = ceremony.awards.filter((a) => a.playerWon).length;
    this.log(
      won
        ? `Awards night: you took ${won} of ${ceremony.awards.length}.`
        : `Awards night: nothing for us this year.`,
      won ? 'good' : 'warn',
    );

    const state = store.getState();
    this.yearStart = { day: this.day, projects: state.shippedCount, reputation: state.reputation };
    for (const rival of this.rivals) {
      this.rivalYearStart.set(rival.id, { projects: rival.projects, reputation: rival.reputation });
    }
  }

  /** Reputation is what makes people consider the place at all (§5). */
  private openApplicants() {
    const { reputation, applicants } = store.getState();
    const known = new Set(this.members.map((m) => m.id));
    for (const data of APPLICANTS) {
      if (known.has(data.id) || applicants.includes(data.id)) continue;
      if ((data.repRequired ?? 0) > reputation) continue;
      store.getState().openApplicant(data.id);
      this.log(`${data.name} has been asking about joining.`, 'good');
    }
  }

  /** §5 — a shipped project pulls in people who care about that kind of thing. */
  private recruit(project: ProjectData) {
    const known = new Set(this.members.map((m) => m.id));
    const open = new Set(store.getState().applicants);
    const pool = APPLICANTS.filter((a) => !known.has(a.id) && !open.has(a.id));
    if (!pool.length) return;

    // Seeing the write-up gets you halfway past somebody's reputation bar, not all the way:
    // otherwise the best person in town turns up on day five because of a lucky tag match.
    const reputation = store.getState().reputation;
    const tempted = pool
      .map((data) => {
        const match = Math.max(0, ...project.tags.map((tag) => data.passions[tag] ?? 0));
        return { data, match };
      })
      .filter(
        (entry) =>
          entry.match >= RECRUIT.matchFloor &&
          (entry.data.repRequired ?? 0) * RECRUIT.shipGateRelief <= reputation,
      )
      .sort((a, b) => b.match - a.match);
    if (!tempted.length) return;

    const [lo, hi] = RECRUIT.perShip;
    const count = Math.min(rng.int(lo, hi), tempted.length);
    for (let i = 0; i < count; i += 1) {
      const { data } = tempted[i];
      store.getState().openApplicant(data.id);
      this.log(`${data.name} got in touch after seeing the ${project.name} write-up.`, 'good');
    }
  }

  /** What it costs to take somebody on: induction, a key, a shelf, a tool briefing. */
  hireCost(id: string): number {
    const data = APPLICANTS.find((a) => a.id === id);
    return data ? Math.round(data.commitment * RECRUIT.hireCostPerCommitmentHour) : 0;
  }

  /** Turn an applicant into a member. The one place the roster grows. */
  hire(id: string): boolean {
    const data = APPLICANTS.find((a) => a.id === id);
    if (!data || this.members.some((m) => m.id === id)) return false;
    if (!store.getState().applicants.includes(id)) return false;
    const cost = this.hireCost(id);
    if (store.getState().cash < cost) {
      this.log(`Not enough cash to take ${data.name} on.`, 'bad');
      return false;
    }
    if (!this.chargeHours('hire')) return false;
    store.getState().spend(cost);
    store.getState().closeApplicant(id);
    this.joinMember(data);
    this.log(`${data.name} joined the space. ${data.commitment}h a week.`, 'good');
    return true;
  }

  // -------------------------------------------------------------------------
  // Player verbs (CLAUDE.md §3) — every one costs hours
  // -------------------------------------------------------------------------

  /** People on a team right now, and the roster they come from — the real constraint. */
  get allocation(): { used: number; total: number } {
    return { used: this.members.filter((m) => m.team).length, total: this.members.length };
  }

  /**
   * Start something. `offerId` is set when taking a backlog offer rather than the catalog;
   * `draftTeam` is the crew picked on the pitch screen — each of them is *asked*, so some
   * may still say no (§3b).
   */
  pitch(defId: string, offerId?: string, draftTeam: string[] = []): boolean {
    const state = store.getState();
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
        const member = this.member(offer.proposerId);
        if (member) {
          this.addToTeam(project, member, 1.2);
          this.log(`${member.name} signed straight up for ${def.name}.`, 'good');
        }
      }
    }
    // The order goes in with the pitch: making the player click Order on every single
    // project was busywork, and forgetting it only ever produced a stall, never a decision.
    if (project.bomCost > 0) {
      if (this.placeOrder(project)) {
        this.log(
          `Pitched ${def.name}. Parts ordered — ${money(def.bomCost)}, ${def.leadDays} days out.`,
          'info',
        );
      } else {
        this.log(
          `Pitched ${def.name}, but there is no cash for the ${money(def.bomCost)} bill of materials. ` +
            `Nothing can be assembled until it is ordered.`,
          'warn',
        );
      }
    } else {
      this.log(`Pitched ${def.name}. ${def.blurb}`, 'info');
    }

    // Ask the crew you picked on the pitch screen. They can still decline.
    for (const memberId of draftTeam) {
      if (project.team.length >= project.teamSize) break;
      this.inviteMember(project.id, memberId);
    }
    return true;
  }

  /** Put yourself on a project. The one place in the game you can give a direct order. */
  workOn(projectId: string) {
    const project = this.project(projectId);
    if (!project) return;
    this.player.calibrating = false;
    this.player.project = projectId;
  }

  stopWork() {
    this.player.project = null;
    this.player.calibrating = false;
  }

  calibratePrinter() {
    this.player.calibrating = true;
  }

  /** Re-pitch: another go at tempting unallocated people onto the team. */
  repitch(projectId: string) {
    const project = this.project(projectId);
    if (!project) return;
    if (!this.chargeHours('repitch')) return;
    const stage = STAGE_MAP[project.stage];
    let took = 0;
    for (const m of this.members) {
      if (m.team || !m.present || project.team.length >= project.teamSize) continue;
      if (m.isCoolingOff(projectId)) continue;
      const match = m.passionMatch(project.tags) + DRIFT.repitchBonus;
      if (match * (0.45 + stage.appeal * 0.55) >= DRIFT.signupThreshold && rng.chance(0.6)) {
        this.addToTeam(project, m);
        took += 1;
      }
    }
    this.log(
      took ? `Re-pitched ${project.name}: ${took} joined.` : `Re-pitched ${project.name}. Nobody bit.`,
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
    this.log(
      `Bounty on ${project.name} · ${stageLabel(project.category, project.stage)}. Pizza is on the way.`,
      'good',
    );
    return true;
  }

  /**
   * Place the order. Split out from the verb below so that pitching can do it without
   * charging your hours twice — the paperwork is part of writing the pitch up.
   */
  private placeOrder(project: ProjectData): boolean {
    if (project.partsOrdered) return true;
    if (store.getState().cash < project.bomCost) return false;
    store.getState().spend(project.bomCost);
    project.partsOrdered = true;
    project.partsArriveAt = this.totalHours + project.leadDays * TIME.hoursPerDay;
    return true;
  }

  /**
   * Order the bought parts by hand. Only reachable when the order could not go in at pitch
   * time — normally the money is not there — so it is a recovery path, not routine work.
   */
  orderParts(projectId: string): boolean {
    const project = this.project(projectId);
    if (!project || project.partsOrdered) return false;
    if (store.getState().cash < project.bomCost) {
      this.log(`Not enough cash for the ${project.name} bill of materials.`, 'bad');
      return false;
    }
    if (!this.chargeHours('order')) return false;
    this.placeOrder(project);
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
      members: this.members.map((m) => {
        const snap = m.snapshot();
        for (const project of this.projects) snap.affinity[project.id] = m.passionMatch(project.tags);
        return snap;
      }),
      machines,
      projects: this.projects.map((p) => structuredClone(p)),
      rivals: this.rivals.map((r) => ({ ...r })),
      season: this.season,
      player: (() => {
        const snap = this.player.playerSnapshot();
        const project = this.player.project ? this.project(this.player.project) : null;
        snap.stage = project ? project.stage : null;
        return snap;
      })(),
    });
  }
}
