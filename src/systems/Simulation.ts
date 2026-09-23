import { store } from '@/game/store';
import { caseLocale, msg, t, type Message, type MessageKey, type Text } from '@/i18n';
import type {
  BacklogEntry,
  MemberData,
  RivalState,
  ScoreRow,
  ShippedRecord,
  MachineSnapshot,
  MachineType,
  ProjectData,
  ProjectDef,
  StageKey,
  Tag,
  ClaimKey,
  Post,
  ProjectPlan,
  SkillKey,
  Seat,
  TableSnapshot,
} from '@/game/types';
import { MemberEntity } from '@/entities/MemberEntity';
import { PlayerEntity } from '@/entities/PlayerEntity';
import { Machine, type Job } from '@/machines/Machine';
import {
  DOOR,
  IDLE_TILES,
  STATIONS,
  freeSlots,
  MACHINE_LABEL,
  applyEraLayout,
  installStation,
  installedStations,
  removeStation,
  STATION_MAP,
  amenityMoveSafe,
  amenityTileFree,
  placeStation,
  setAmenityLayout,
  setStationLayout,
  yawOf,
  type StationDef,
  resetStations,
  stationOfType,
  stationsOfType,
  seatPosition,
  seatsOf,
  isTable,
  installFurniture,
  furnitureFits,
  amenityRoom,
} from '@/machines/layout';
import {
  CATEGORY_AXES,
  defaultPlan,
  optionAvailable,
  planProject,
  qualityHype,
  qualityPay,
  teamFit,
} from '@/utils/design';
import { coolMarket, driftMarket, warmMarket } from '@/utils/market';
import { FURNITURE_MAP } from '@/utils/furniture';
import { manhattan } from '@/utils/grid';
import {
  BACKLOG,
  BOUNTY,
  COMFORT,
  DRIFT,
  FAB,
  FILAMENT,
  GHOST_DECAY,
  MACHINE,
  MEMBER,
  PERFECTIONIST_QUALITY_GATE,
  APPLICANTS,
  shuffleLadder,
  PLAYER,
  HYPE,
  RECRUIT,
  REPEAT,
  SHELVE,
  ROSTER,
  TEAM,
  SOURCING,
  STAGE_MAP,
  TEST,
  TIME,
  KICKOFF,
  TRAIN,
  ROLES,
  RESALE,
  VERB_HOURS,
  WORKDAY,
  ERAS,
  eraDef,
  type EraDef,
  isLunch,
  isWorkingDay,
  WEEKLY_HOURS,
} from '@/utils/constants';
import { CATALOG_MAP, canBuild, catalogForEra } from '@/utils/catalog';
import { ROLE_LABEL, SPACE_SUBJECT, type Role } from '@/game/types';
import { RIVAL_MAP, RISING_FLOOR } from '@/utils/rivals';
import { createRivals, runCeremony, tickRivals } from './RivalSystem';
import { DIFFICULTY_MAP } from '@/utils/difficulty';
import type { SaveFile } from './SaveGame';
import {
  ECONOMY,
  INCOME_KINDS,
  LEDGER_ORDER,
  membershipFor,
  rentFor,
  type Bill,
  type BillLine,
  type Ledger,
  type LedgerKind,
} from '@/utils/economy';
import { amenityDef, comfortsOf, NO_COMFORTS, type Comforts } from '@/utils/amenities';
import {
  decayHype,
  hypePressure,
  novelty,
  projectSubject,
  react,
  spaceSubject,
} from '@/systems/HypeSystem';
import { SUBREDDITS, SUBREDDIT_MAP, tasteMatch } from '@/utils/subreddits';
import { PRINTER_MAP, PRINTERS, STARTING_PRINTER, resaleValue, type PrinterModel } from '@/utils/printers';
import { categoryAffinity, stageLabel, stageSkill, stageStation } from '@/utils/categories';
import { CALENDAR, awardsDay, clock, gameDate, uid } from '@/utils/format';
import { rng } from '@/utils/rng';
import {
  addWork,
  expediteCost,
  generateParts,
  partsOutstanding,
  partsPending,
  refreshQuality,
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
  /** Day plans are recomputed on load rather than saved. */
  private requeueTimers = new Map<string, number>();
  /** The other spaces in town, and where we are in the awards year (§11). */
  rivals: RivalState[] = createRivals();
  private yearStart = { day: 1, projects: 0, reputation: 0, upvotes: 0 };
  private rivalYearStart = new Map<string, { projects: number; reputation: number; upvotes: number }>();
  /** Bumped every day so the host can autosave without polling. */
  dayRolled = false;
  /** Machine-hours run since the last bill, for the utilities line. */
  private machineHoursThisMonth = 0;
  /** What the work actually brought in since the last bill — payouts and sponsor money. */
  private incomeThisMonth = 0;

  /**
   * You pressed Stop today, so the owner does not pick the next build up on their own until
   * tomorrow. Anything else would override a choice you had just made.
   */
  private ownerStopped = false;

  /** Days of word of mouth banked toward the next person getting in touch (§3c). */
  private recruitClock = 0;

  /** The last day the social media manager put something out. One a day, not one a tick. */
  private socialDay = 0;

  /** The last thing you shipped, while it is still what people are talking about. */
  private recentShip: { tags: Tag[]; name: string; day: number } | null = null;

  /**
   * Who is sitting where (§4d). One person to a workstation seat, so a desk is something
   * people queue for. Rebuilt as people come and go rather than saved: a claim only means
   * anything while somebody is in the building.
   */
  private claims = new Map<string, { stationId: string; seat: number }>();
  /** People this tick who wanted a seat of a kind and found every one taken. */
  private wanting = new Map<string, MachineType>();
  /**
   * Today's kickoffs: the most of each crew that was ever in the building at once, and
   * whether any planning actually happened. Read at the end of the day to decide who the
   * crew is going ahead without. Reset every morning, never saved.
   */
  private kickoffWatch = new Map<string, { best: string[]; progressed: boolean }>();

  constructor() {
    resetStations();
    applyEraLayout(store.getState().era);
    for (const def of STATIONS) {
      if (!FAB_MACHINES.includes(def.type)) continue;
      this.machines.push(this.makeMachine(def));
    }
    this.seedRoster();
    this.player = new PlayerEntity(DOOR);
    this.player.arrive(DOOR);
    for (const rival of this.rivals) {
      this.rivalYearStart.set(rival.id, { projects: 0, reputation: 0, upvotes: 0 });
    }
    this.planDay();
    this.player.startDay();
    this.refreshBacklog();
    this.log(msg('log.day1'), 'info');
    this.log(msg('log.pickSomething'), 'info');
    // The game opens paused, and publish() otherwise only runs inside tick(). Without this
    // the UI sees no player, reads your hours as zero, and disables every pitch button.
    this.publish();
  }

  /** Absolute sim-hour since the start; sourcing deadlines are anchored to this. */
  get totalHours(): number {
    return (this.day - 1) * TIME.hoursPerDay + this.time;
  }

  /** The printer worth standing next to: the one running, else the one drifting furthest. */
  get printer(): Machine {
    const all = this.machines.filter((m) => m.type === 'fdm');
    return (
      all.find((m) => m.running && m.calibration < MACHINE.calibrationWarning) ??
      [...all].sort((a, b) => a.calibration - b.calibration)[0] ??
      all[0]
    );
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
    const all = this.machines.filter((m) => m.type === type);
    if (all.length <= 1) return all[0];
    // Shortest queue first, and never a starved machine while a fed one is free — otherwise
    // buying a second printer does nothing but sit there.
    return [...all].sort(
      (a, b) =>
        Number(a.starved) - Number(b.starved) ||
        a.queue.length + (a.running ? 1 : 0) - (b.queue.length + (b.running ? 1 : 0)),
    )[0];
  }

  project(id: string): ProjectData | undefined {
    return this.projects.find((p) => p.id === id);
  }

  private log(text: Message, kind: 'info' | 'good' | 'bad' | 'warn' = 'info') {
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
      this.dayRolled = true;
      // A Stop holds for the rest of the day, not for ever: tomorrow you pick up the work.
      this.ownerStopped = false;
      tickRivals(this.rivals, this.rivalPressure());
      this.runBilling();
      this.checkAwards();
      store.getState().setHype(decayHype(store.getState().hype));
      store.getState().setMarket(driftMarket(store.getState().market));
      this.checkSolvency();
      this.tickRecruiting();
      this.planDay();
      this.player.startDay();
      this.refreshBacklog();
    }

    this.runRoles();
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

  /**
   * What the Shop is currently doing for the place (§7b). Read in the per-member inner
   * loops, so it is folded once and kept until the owned list changes rather than being
   * recomputed a few thousand times a second.
   */
  private comfortCache: Comforts = NO_COMFORTS;
  private comfortKey = '';

  /** Last arrangement the floor was rebuilt for. Starts behind so the first tick syncs. */
  private amenityRev = -1;

  get comforts(): Comforts {
    const state = store.getState();
    const owned = state.amenities;
    const key = owned.join(',');
    if (key !== this.comfortKey) {
      this.comfortKey = key;
      this.comfortCache = comfortsOf(owned);
    }
    // Floor-standing comforts are solid: people walk round them, which is part of what you
    // are paying for when you put a table tennis table in a small room. Keyed off a
    // revision counter rather than the placement map — this getter runs in a per-member
    // inner loop and hashing an object there would be the most expensive thing in the tick.
    if (state.amenityRev !== this.amenityRev) {
      this.amenityRev = state.amenityRev;
      setAmenityLayout(
        owned.filter((id) => amenityDef(id)?.mount === 'floor'),
        state.amenityPlacements,
      );
      setStationLayout(state.stationPlacements);
    }
    return this.comfortCache;
  }

  /**
   * Move or turn a comfort. The room is the only place this can be done from, so it takes a
   * tile rather than a slot index — and it checks legality here rather than trusting the
   * click, because a save from an older room could hand over a tile a bench now stands on.
   */
  /**
   * Move or turn a station. Turning one means choosing **which side somebody stands on**,
   * so the yaw is a request rather than an instruction: the first legal quarter turn from
   * it is taken, and a tile with no legal side at all is simply not a place a bench can go.
   */
  placeStation(id: string, x: number, y: number, yaw: number): boolean {
    if (!STATION_MAP[id]) return false;
    if (!placeStation(id, { x, y }, yaw)) return false;
    store.getState().placeStation(id, { x, y, yaw: yawOf(STATION_MAP[id]) });
    return true;
  }

  placeAmenity(id: string, x: number, y: number, yaw: number): boolean {
    const def = amenityDef(id);
    const state = store.getState();
    if (!def || def.mount !== 'floor' || !state.amenities.includes(id)) return false;
    if (!amenityTileFree({ x, y }, id) || !amenityMoveSafe(id, { x, y })) return false;
    state.placeAmenity(id, { x, y, yaw: ((yaw % 4) + 4) % 4 });
    return true;
  }

  /**
   * Buy a comfort. There is no selling one back: a table tennis table is not an investment
   * decision, and a shop you can churn is a shop that pays for itself.
   */
  buyAmenity(id: string): boolean {
    const def = amenityDef(id);
    const state = store.getState();
    if (!def || state.amenities.includes(id)) return false;
    if (def.era > state.era) {
      this.log(msg('log.amenity.needsEra', { item: def.name, era: eraDef(def.era).name }), 'warn');
      return false;
    }
    // Sync the floor first, then check there is somewhere to stand it: a comfort paid for
    // that never appears in the room is the worst thing this shop could do.
    void this.comforts;
    if (def.mount === 'floor' && !amenityRoom()) {
      this.log(msg('build.log.noFloor', { item: def.name }), 'warn');
      return false;
    }
    if (!state.spend(def.price, 'kit')) {
      this.log(msg('log.amenity.cantAfford', { item: def.name }), 'bad');
      return false;
    }
    state.buyAmenity(id);
    this.log(
      def.upkeep
        ? msg('log.amenity.installedUpkeep', { item: def.name, upkeep: def.upkeep })
        : msg('log.amenity.installed', { item: def.name }),
      'good',
    );
    return true;
  }

  /**
   * Buy a table or a workstation (§4d). It goes on the floor wherever there is room —
   * against a wall for a desk, out in the open for a table — and can be picked up and moved
   * like anything else. **No room is an answer**, not an error: the garage holds so much,
   * and the next lease is what gives you more.
   */
  buyFurniture(id: string): boolean {
    const def = FURNITURE_MAP[id];
    const state = store.getState();
    if (!def) return false;
    if (def.era > state.era) {
      this.log(msg('log.amenity.needsEra', { item: def.name, era: eraDef(def.era).name }), 'warn');
      return false;
    }
    // Sync the floor first: a comfort bought a moment ago has to count as in the way.
    void this.comforts;
    if (!furnitureFits(def.type, def.span)) {
      this.log(msg('build.log.noRoom', { item: def.name }), 'warn');
      return false;
    }
    if (!state.spend(def.price, 'kit')) {
      this.log(msg('log.amenity.cantAfford', { item: def.name }), 'bad');
      return false;
    }
    const station = installFurniture(def.type, `${def.id}-${uid()}`, def.name, def.span);
    if (!station) {
      state.earn(def.price, 'kit');
      this.log(msg('build.log.noRoom', { item: def.name }), 'warn');
      return false;
    }
    state.ownMachine(def.type);
    // Where it landed is recorded as though the player had put it there, so a reload puts
    // it back on the same tile rather than wherever the room would choose today.
    state.placeStation(station.id, { x: station.tile.x, y: station.tile.y, yaw: yawOf(station) });
    this.log(msg('build.log.installed', { item: def.name }), 'good');
    this.publish();
    return true;
  }

  private endOfDay() {
    // A team list names people whose own record says they are on it, and nobody else.
    for (const project of this.projects) {
      project.team = project.team.filter((id) => this.member(id)?.team === project.id);
    }
    this.goAheadWithout();
    this.shelveAbandoned();
    const comfort = this.comforts.mood;
    for (const m of this.members) {
      if (m.present) m.leave();
      m.data.energy = Math.min(100, m.data.energy + 45);
      // **Mood is the shop's channel into the sim**, and it already drives both the show-up
      // roll and the work rate. It eases toward the room rather than snapping to it: nobody's
      // week turns around the afternoon the coffee machine arrives.
      const target = Math.max(0, Math.min(100, m.baseMood + comfort));
      m.data.mood += (target - m.data.mood) * COMFORT.settle;
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
      this.log(msg('log.shelved', { project: project.name, days: SHELVE.afterIdleDays }), 'bad');
    }
  }

  /**
   * The rota. Hours come from a contract now, not a dice roll — the only randomness left
   * is whether somebody actually turns up, which is where mood and the Ghost still live.
   */
  private planDay() {
    this.kickoffWatch.clear();
    const working = isWorkingDay(this.day);
    const bountied = this.projects.filter(
      (p) => p.bounties.includes(p.stage) && p.required[p.stage] > 0,
    );

    for (const m of this.members) {
      if (!working) {
        this.plans.set(m.id, { attending: false, arriveAt: 0, leaveAt: 0 });
        m.leaveAt = 0;
        continue;
      }

      const moodFactor = 0.85 + m.data.mood / 400;
      const base = WORKDAY.attendanceBase;
      const attending = rng.chance(Math.min(0.99, Math.max(0.3, base * m.ghostFactor * moodFactor)));

      // A bounty buys overtime rather than a better roll: they stay past six.
      const tempted = bountied.some((p) => m.passionMatch(p.tags) >= BOUNTY.temptThreshold);
      const span = m.span;
      const overtime = tempted && rng.chance(BOUNTY.overtimeChance);
      const leaveAt = overtime ? WORKDAY.overtimeEnd : span.end;

      this.plans.set(m.id, { attending, arriveAt: span.start, leaveAt });
      m.leaveAt = leaveAt;
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
        this.log(msg('log.offer.expired', { item: def.name }), 'warn');
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
        this.log(msg('log.offer.proposal', { member: member.name, item: def.name }), 'good');
      }
    }

    // A sponsor wants something specific, with money attached and a deadline.
    // Only builds with a bill of materials: sponsor money is sized against the parts, and a
    // sponsor offering ₺0 for a cable tidy is a line in the log that reads as a bug.
    const sponsorable = options.filter((d) => d.bomCost > 0);
    if (sponsorable.length && rng.chance(BACKLOG.sponsorChance * (1 + this.pressure * (HYPE.sponsorSpeedUp - 1)))) {
      const def = rng.pick(sponsorable);
      const [lo, hi] = BACKLOG.sponsorCashRatio;
      const cash = Math.round((def.bomCost * rng.range(lo, hi)) / 100) * 100;
      const [dlo, dhi] = BACKLOG.sponsorDeadlineDays;
      this.addOffer({
        defId: def.id,
        source: 'sponsor',
        sponsorCash: cash,
        expiresOnDay: this.day + rng.int(dlo, dhi),
      });
      this.log(msg('log.offer.sponsor', { item: def.name, cash }), 'good');
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
      store.getState().setMarket(warmMarket(store.getState().market, def.category));
      this.log(msg('log.offer.trending', { item: def.name }), 'info');
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
    this.wanting.clear();
    for (const m of this.members) {
      const plan = this.plans.get(m.id)!;
      m.tickCooldowns(dt);

      if (!m.present) {
        this.releaseSeat(m.id);
        if (plan.attending && this.time >= plan.arriveAt && this.time < plan.leaveAt) {
          m.arrive(DOOR);
          m.note = t('note.justArrived');
        }
        continue;
      }

      if (this.time >= plan.leaveAt) {
        this.releaseSeat(m.id);
        if (m.tile.x === DOOR.x && m.tile.y === DOOR.y && !m.walking) {
          m.leave();
          continue;
        }
        m.note = t('note.headingHome');
        if (!m.walking) m.walkTo(DOOR);
        m.advance(dt);
        continue;
      }

      this.decideActivity(m, dt);
      m.advance(dt);
      this.performActivity(m, dt);
      this.tickTraining(m, dt);
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
        const rate = m.workRate(skill, project.tags) * factor * this.comforts.focus;
        total += rate * dt;
        rateSum += rate;
        // Each person's own share of the stage, for the bar over their head — and of the
        // whole build, for the record of who made it.
        project.contrib[m.id] = (project.contrib[m.id] ?? 0) + rate * dt;
        const effort = (project.effort ??= {});
        effort[m.id] = (effort[m.id] ?? 0) + rate * dt;
        const level = skill ? m.data.skills[skill] : 2;
        craftSum += (level / 5) * rate;
      });
      const craft = rateSum > 0 ? craftSum / rateSum : 0.5;
      addWork(project, total, Math.min(1, Math.max(0.1, craft)));
      if (project.stage === 'concept' && total > 0) {
        const watch = this.kickoffWatch.get(project.id);
        if (watch) watch.progressed = true;
      }
    }
  }

  /** The influence model in one function: nobody is told what to do. */
  private decideActivity(m: MemberEntity, _dt: number) {
    // Twelve to one, nobody works. The lounge exists for exactly this.
    if (isLunch(this.time)) {
      this.releaseSeat(m.id);
      m.note = t('note.lunch');
      if (this.atStation(m, 'lounge')) {
        m.activity = 'resting';
      } else if (!m.walking) {
        m.walkTo(stationOfType('lounge')!.stand);
      }
      return;
    }

    if (m.activity === 'resting') {
      this.releaseSeat(m.id);
      if (m.data.energy >= 65) {
        m.activity = 'idle';
        m.note = t('note.backOnIt');
      } else {
        if (!m.walking && !this.atStation(m, 'lounge')) m.walkTo(stationOfType('lounge')!.stand);
        return;
      }
    }
    if (m.data.energy < MEMBER.tiredThreshold) {
      this.releaseSeat(m.id);
      m.activity = 'resting';
      m.note = t('note.needsSitDown');
      m.walkTo(stationOfType('lounge')!.stand);
      return;
    }

    // On a team whose project has gone? Release them.
    if (m.team && !this.project(m.team)) m.team = null;

    // On a course: the learning station, and nothing else until it is done (§4c).
    if (m.training && !m.team) {
      const claim = this.claimSeat(m, 'learning');
      if (!claim) {
        this.wanting.set(m.id, 'learning');
        m.note = t('build.note.waitingToTrain', { skill: t(`build.skill.${m.training.skill}` as MessageKey) });
      } else {
        const station = STATION_MAP[claim.stationId];
        if (this.atStand(m, station)) {
          m.activity = 'working';
          m.note = t('build.note.training', { skill: t(`build.skill.${m.training.skill}` as MessageKey) });
        } else if (!m.walking) {
          m.walkTo(station.stand);
        }
        return;
      }
    }

    // Drift: interest gone, they walk away from the team. The core antagonist.
    if (m.team && m.interest < DRIFT.abandonThreshold) {
      const project = this.project(m.team)!;
      this.log(msg('log.drifted', { member: m.name, project: project.name }), 'warn');
      this.dropFromTeam(project, m, DRIFT.cooldownHours);
      m.note = t('note.lostInterest');
    }

    // Volunteers still volunteer: an unallocated member may join something themselves.
    if (!m.team && !m.training) {
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
        m.note = t('note.joined', { project: best.project.name });
      }
    }

    // On a team: the kickoff first, round the table, and then whatever the stage needs.
    if (m.team) {
      const project = this.project(m.team)!;
      if (!project.kickedOff && project.required.concept > 0) {
        if (this.attendKickoff(m, project)) return;
      } else if (this.hasOpenWork(project)) {
        if (this.goToWork(m, project)) return;
      } else {
        this.releaseSeat(m.id);
        m.note = t('note.waiting', { project: project.name });
      }
    } else {
      this.releaseSeat(m.id);
    }

    // Nothing to build by hand? Somebody may fuss over the printer instead.
    const printer = this.printer;
    if (printer.calibration < MACHINE.calibrationWarning || printer.running) {
      if (this.atStation(m, 'fdm')) {
        m.activity = 'babysitting';
        m.note = printer.calibration < MACHINE.calibrationWarning ? t('note.levelling') : t('note.watchingPrint');
      } else if (!m.walking) {
        m.walkTo(printer.def.stand);
      }
      return;
    }

    if (!m.walking && m.activity !== 'idle') {
      m.activity = 'idle';
      m.note = t('note.hangingAround');
      m.walkTo(rng.pick(IDLE_TILES));
    } else if (!m.walking) {
      m.activity = 'idle';
    }
  }

  /**
   * Sit down at the project's table for the kickoff (§4d). **Nothing is planned until the
   * whole crew is sitting there at once**, so a kickoff is where attendance bites first: a
   * crew of ten all turning up on the same day is its own small miracle. Returns false when there is no
   * table yet, so the caller lets them do something useful instead of standing about.
   */
  private attendKickoff(who: MemberEntity, project: ProjectData): boolean {
    this.releaseSeat(who.id);
    const table = project.tableId ? STATION_MAP[project.tableId] : null;
    if (!table) {
      const away = project.team
        .map((id) => this.member(id))
        .filter((m): m is MemberEntity => !!m && !m.present)
        .map((m) => m.name);
      who.note = away.length
        ? t('build.note.kickoffOnceIn', { project: project.name, names: away.join(', '), count: away.length })
        : t('build.note.waitingTable', { project: project.name });
      return false;
    }
    if (!this.atStand(who, table)) {
      if (!who.walking) who.walkTo(table.stand);
      who.note = t('build.note.toKickoff', { project: project.name });
      return true;
    }
    if (this.kickoffReady(project)) {
      who.activity = 'working';
      who.note = t('build.note.kickoff', { project: project.name });
    } else {
      who.activity = 'waiting';
      const missing = this.kickoffMissing(project);
      who.note = missing.length
        ? t('build.note.waitingFor', { project: project.name, names: missing.join(', ') })
        : t('note.waiting', { project: project.name });
    }
    return true;
  }

  /** Crew who are not at the table yet — the names the waiting ones are waiting for. */
  private kickoffMissing(project: ProjectData): string[] {
    const table = project.tableId ? STATION_MAP[project.tableId] : null;
    if (!table) return [];
    return project.team
      .map((id) => this.member(id))
      .filter((m): m is MemberEntity => !!m)
      .filter((m) => !m.present || !this.atStand(m, table) || m.activity === 'resting')
      .map((m) => m.name);
  }

  /**
   * Is everybody sitting down? The whole crew, every one of them — and if nobody has been
   * allocated, you on your own will do. You are never *required*: your hours are yours, and
   * a kickoff that stalled because you went to buy filament would be the game punishing the
   * one person it can command.
   */
  private kickoffReady(project: ProjectData): boolean {
    const table = project.tableId ? STATION_MAP[project.tableId] : null;
    if (!table) return false;
    if (!project.team.length) {
      return this.player.project === project.id && this.player.present && this.atStand(this.player, table);
    }
    return this.kickoffMissing(project).length === 0;
  }

  /** Find a seat for this stage's work and go and sit in it. False if every seat is taken. */
  private goToWork(who: MemberEntity, project: ProjectData): boolean {
    const type = stageStation(project.category, project.stage)!;
    const claim = this.claimSeat(who, type);
    if (!claim) {
      this.wanting.set(who.id, type);
      who.note = t('build.note.noFree', { project: project.name, station: MACHINE_LABEL[type] });
      return false;
    }
    const station = STATION_MAP[claim.stationId];
    if (this.atStand(who, station)) {
      who.activity = 'working';
      who.note = this.workingNote(project);
    } else if (!who.walking) {
      who.walkTo(station.stand);
    }
    return true;
  }

  /**
   * Take a seat at the nearest station of a type that has one free, or keep the one you
   * already have. **One person to a workstation** is the rule that makes furniture matter
   * (§4d): a desk is something people queue for, and the queue is visible in the Build panel.
   */
  private claimSeat(who: MemberEntity, type: MachineType): { stationId: string; seat: number } | null {
    const held = this.claims.get(who.id);
    if (held) {
      const def = STATION_MAP[held.stationId];
      if (def && def.type === type) return held;
      this.claims.delete(who.id);
    }
    const taken = new Map<string, Set<number>>();
    for (const claim of this.claims.values()) {
      if (!taken.has(claim.stationId)) taken.set(claim.stationId, new Set());
      taken.get(claim.stationId)!.add(claim.seat);
    }
    let best: { stationId: string; seat: number; distance: number } | null = null;
    for (const def of stationsOfType(type)) {
      const capacity = seatsOf(def) ?? Number.POSITIVE_INFINITY;
      const used = taken.get(def.id) ?? new Set<number>();
      if (used.size >= capacity) continue;
      let seat = 0;
      while (used.has(seat)) seat += 1;
      const distance = manhattan(who.tile, def.stand);
      if (!best || distance < best.distance) best = { stationId: def.id, seat, distance };
    }
    if (!best) return null;
    const claim = { stationId: best.stationId, seat: best.seat };
    this.claims.set(who.id, claim);
    return claim;
  }

  private releaseSeat(id: string) {
    this.claims.delete(id);
  }

  private atStand(who: MemberEntity, def: StationDef): boolean {
    return !who.walking && who.tile.x === def.stand.x && who.tile.y === def.stand.y;
  }

  /** The largest project table the space owns — what a crew size is capped at. */
  maxTableSeats(): number {
    return Math.max(0, ...STATIONS.filter((s) => isTable(s.type)).map((s) => seatsOf(s) ?? 0));
  }

  /**
   * Book tables for kickoffs (§4d). **A table goes only to a crew that is all in the
   * building**, and the booking lapses the moment one of them leaves. The first version
   * held a table from the pitch until the kickoff was over, and one crew that could never
   * meet — a Ghost on the crew — kept the garage's only table for the
   * rest of the run while every project behind it waited. Progress is pooled on the
   * project, so giving the table up costs nothing but the seat.
   */
  private assignTables() {
    for (const project of this.projects) {
      if (!project.tableId) continue;
      if (project.kickedOff || !this.crewInBuilding(project)) project.tableId = null;
    }
    const busy = new Set(this.projects.map((p) => p.tableId).filter(Boolean));
    for (const project of this.projects) {
      if (project.kickedOff || project.tableId) continue;
      if (!this.crewInBuilding(project)) continue;
      // The smallest table that seats them, so a pair does not tie up the big one.
      const table = STATIONS.filter(
        (s) => isTable(s.type) && !busy.has(s.id) && (seatsOf(s) ?? 0) >= this.crewSize(project),
      ).sort((a, b) => (seatsOf(a) ?? 0) - (seatsOf(b) ?? 0))[0];
      if (!table) continue;
      project.tableId = table.id;
      busy.add(table.id);
    }
  }

  /**
   * What the floor is short of right now: seats people queued for this tick, and tables
   * for crews who are all here with nowhere to sit down. The Build panel and the harness
   * autoplayer both read this rather than guessing.
   */
  workspaceNeeds(): Partial<Record<MachineType, number>> {
    const out: Partial<Record<MachineType, number>> = {};
    for (const type of this.wanting.values()) out[type] = (out[type] ?? 0) + 1;
    for (const project of this.projects) {
      if (project.kickedOff || project.tableId || !this.crewInBuilding(project)) continue;
      const type: MachineType = this.crewSize(project) > 4 ? 'table-large' : 'table-small';
      out[type] = (out[type] ?? 0) + 1;
    }
    return out;
  }

  /** Note the most of each waiting crew that has been in the building at once today. */
  private watchKickoffs() {
    for (const project of this.projects) {
      if (project.kickedOff || !project.team.length) continue;
      const here = project.team.filter((id) => this.member(id)?.present);
      const watch = this.kickoffWatch.get(project.id) ?? { best: [], progressed: false };
      if (here.length > watch.best.length) watch.best = here;
      this.kickoffWatch.set(project.id, watch);
    }
  }

  /**
   * **A crew does not wait for ever.** On a working day when a kickoff went nowhere, anybody
   * who was not in while most of the crew was gets a mark against them; two and the crew
   * goes ahead without them. That is the Ghost's answer: somebody who never comes in used to
   * stop a project dead, and a stall the player cannot see the cause of reads as a bug (§13).
   */
  private goAheadWithout() {
    if (!isWorkingDay(this.day)) return;
    for (const project of this.projects) {
      const watch = this.kickoffWatch.get(project.id);
      if (project.kickedOff || !watch || watch.progressed || !watch.best.length) continue;
      const misses = (project.kickoffMisses ??= {});
      for (const id of project.team) {
        if (watch.best.includes(id)) {
          misses[id] = 0;
          continue;
        }
        misses[id] = (misses[id] ?? 0) + 1;
        if (misses[id] < KICKOFF.missLimit) continue;
        const member = this.member(id);
        if (!member) continue;
        delete misses[id];
        this.dropFromTeam(project, member, DRIFT.cooldownHours * 3);
        member.note = t('build.note.wentAhead', { project: project.name });
        this.log(msg('build.log.wentAhead', { project: project.name, member: member.name }), 'warn');
      }
    }
  }

  /**
   * Put somebody on a course at the learning station (§4c): one skill, one level. It is
   * paid for now and takes hours at the station — during which they are on nobody's crew,
   * which is the real price of it.
   */
  train(memberId: string, skill: SkillKey): boolean {
    const member = this.member(memberId);
    if (!member || member.training) return false;
    if (!stationsOfType('learning').length) {
      this.log(msg('build.log.noLearning'), 'warn');
      return false;
    }
    if (member.team) {
      this.log(msg('build.log.busyToTrain', { member: member.name }), 'warn');
      return false;
    }
    const level = member.data.skills[skill];
    if (level >= TRAIN.maxLevel) return false;
    const cost = this.trainCost(memberId, skill);
    if (!store.getState().spend(cost, 'training')) {
      this.log(msg('log.amenity.cantAfford', { item: member.name }), 'bad');
      return false;
    }
    const hours = TRAIN.hoursPerLevel * (level + 1);
    member.training = { skill, hoursLeft: hours, total: hours };
    this.log(msg('build.log.trainStart', { member: member.name, skill: msg(`build.skill.${skill}` as MessageKey), level: level + 1 }), 'info');
    this.publish();
    return true;
  }

  trainCost(memberId: string, skill: SkillKey): number {
    const level = this.member(memberId)?.data.skills[skill] ?? 1;
    return TRAIN.costPerLevel * (level + 1);
  }

  private tickTraining(m: MemberEntity, dt: number) {
    if (!m.training || m.activity !== 'working' || m.team) return;
    m.training.hoursLeft -= dt * this.comforts.focus;
    if (m.training.hoursLeft > 0) return;
    const skill = m.training.skill;
    m.data.skills[skill] = Math.min(TRAIN.maxLevel, m.data.skills[skill] + 1);
    m.training = null;
    this.releaseSeat(m.id);
    this.log(
      msg('build.log.trained', { member: m.name, skill: msg(`build.skill.${skill}` as MessageKey), level: m.data.skills[skill] }),
      'good',
    );
  }

  /**
   * What selling this piece of the room would fetch, and whether it can go at all (§4d). The
   * kit the garage came with and the machines tool projects built stay; so does a table
   * somebody is holding a kickoff at.
   */
  resaleOf(id: string): { value: number; reason: MessageKey | null } {
    const comfort = amenityDef(id);
    if (comfort) {
      if (!store.getState().amenities.includes(id)) return { value: 0, reason: 'build.sell.notOwned' };
      return { value: Math.round(comfort.price * RESALE.share), reason: null };
    }
    const station = STATION_MAP[id];
    if (!station) return { value: 0, reason: 'build.sell.notOwned' };
    if (station.type === 'fdm') {
      return { value: this.resaleFor(id), reason: null };
    }
    if (!station.furniture) return { value: 0, reason: 'build.sell.fixture' };
    if (this.projects.some((p) => p.tableId === id)) return { value: 0, reason: 'build.sell.inUse' };
    const def = Object.values(FURNITURE_MAP).find((f) => f.type === station.type);
    return { value: Math.round((def?.price ?? 0) * RESALE.share), reason: null };
  }

  /** Sell a piece of the room. Whoever was sitting at it gets up and finds somewhere else. */
  sellPiece(id: string): boolean {
    const { value, reason } = this.resaleOf(id);
    if (reason) {
      this.log(msg(reason), 'warn');
      return false;
    }
    const station = STATION_MAP[id];
    if (station?.type === 'fdm') {
      store.getState().setMoving(null);
      return this.sellPrinter(id);
    }
    const name = amenityDef(id)?.name ?? station?.label ?? id;
    if (station) {
      for (const [who, claim] of [...this.claims]) if (claim.stationId === id) this.claims.delete(who);
      removeStation(id);
      store.getState().forgetStation(id);
      const type = station.type;
      if (!STATIONS.some((s) => s.type === type)) store.getState().disownMachine(type);
    } else {
      store.getState().sellAmenity(id);
    }
    store.getState().earn(value, 'sales');
    this.log(msg('build.log.sold', { item: name, value }), 'info');
    this.publish();
    return true;
  }

  /** Crew who need a chair at the kickoff: the team, plus you if you are on it. */
  private crewSize(project: ProjectData): number {
    return Math.max(1, project.team.length + (this.player.project === project.id ? 1 : 0));
  }

  /** Is everybody on it actually here today? You on your own count if nobody else is on it. */
  private crewInBuilding(project: ProjectData): boolean {
    if (!project.team.length) return this.player.project === project.id && this.player.present;
    return project.team.every((id) => this.member(id)?.present);
  }

  /** Where somebody is sitting right now, for the renderer. Null when they are not seated. */
  private seatFor(who: MemberEntity): Seat | null {
    if (who.walking || !who.present) return null;
    if (who.activity !== 'working' && who.activity !== 'waiting') return null;
    const projectId = who === this.player ? this.player.project : who.team;
    const project = projectId ? this.project(projectId) : null;
    if (project && !project.kickedOff && project.tableId) {
      const table = STATION_MAP[project.tableId];
      if (table && this.atStand(who, table)) {
        const order = [...project.team, 'player'];
        return seatPosition(table, Math.max(0, order.indexOf(who.id)));
      }
    }
    const claim = this.claims.get(who.id);
    const station = claim ? STATION_MAP[claim.stationId] : null;
    if (claim && station && this.atStand(who, station)) return seatPosition(station, claim.seat);
    return null;
  }

  /** Their share of the stage so far against an even split — the bar over their head. */
  private shareFor(who: MemberEntity): number | null {
    if (who.activity !== 'working' && who.activity !== 'waiting') return null;
    const projectId = who === this.player ? this.player.project : who.team;
    const project = projectId ? this.project(projectId) : null;
    if (!project) return null;
    const need = project.required[project.stage];
    if (need <= 0) return null;
    const crew = project.team.length + (this.player.project === project.id ? 1 : 0);
    const fair = need / Math.max(1, crew);
    return Math.max(0, Math.min(1, (project.contrib[who.id] ?? 0) / fair));
  }

  private performActivity(m: MemberEntity, dt: number) {
    // Air conditioning, a decent chair and a fish tank all land here.
    const comfort = this.comforts;
    switch (m.activity) {
      case 'working': {
        const project = m.team ? this.project(m.team) : null;
        const stage = project ? STAGE_MAP[project.stage] : null;
        m.data.energy = Math.max(0, m.data.energy - MEMBER.energyDrain * comfort.fatigue * dt);
        if (stage) m.interest -= DRIFT.decayPerHour * (1 - stage.appeal) * comfort.drift * dt;
        break;
      }
      case 'resting':
        m.data.energy = Math.min(100, m.data.energy + MEMBER.energyRestore * comfort.rest * dt);
        break;
      case 'idle':
      case 'waiting': {
        // Hanging about waiting for a machine — or for the rest of the crew to sit down —
        // erodes enthusiasm, just more slowly.
        if (m.team) m.interest -= DRIFT.decayPerHour * 0.35 * comfort.drift * dt;
        break;
      }
      case 'babysitting': {
        const printer = this.printer;
        printer.operatorSkill = Math.max(printer.operatorSkill, m.data.skills.machining);
        if (printer.calibration < 0.98) printer.calibrate(dt);
        m.data.energy = Math.max(
          0,
          m.data.energy - MEMBER.energyDrain * 0.4 * comfort.fatigue * dt,
        );
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

    // Out of hours is either "spent them" or "before you open up" — the day is a span as
    // well as a budget, so midnight does not put you back on the floor with a fresh eighteen.
    if (p.hoursLeft <= 0 || this.time < PLAYER.startHour || this.time >= PLAYER.endHour) {
      if (!p.present) return;
      if (p.tile.x === DOOR.x && p.tile.y === DOOR.y && !p.walking) {
        p.leave();
        p.note = t('note.doneForToday');
        return;
      }
      p.calibrating = false;
      this.releaseSeat(p.id);
      p.note = t('note.outOfHours');
      if (!p.walking) p.walkTo(DOOR);
      p.advance(dt);
      return;
    }

    if (!p.present) {
      if (this.time >= PLAYER.startHour) {
        p.arrive(DOOR);
        p.note = t('note.inTheSpace');
      }
      return;
    }

    // Only a shipped or cancelled project takes you off it — never a stage change.
    if (p.project && !this.project(p.project)) {
      p.project = null;
      p.note = t('note.lookingForWork');
    }

    // **The owner does not stand about** (§3a). With nothing chosen you put yourself on the
    // oldest build still open, and when it ships you move to the next. This replaced the
    // Project Manager, which started projects for you: the space's work is yours to choose,
    // but once it is chosen, your hands going spare is the one waste you can always avoid.
    if (!p.project && !p.calibrating && !this.ownerStopped) {
      // Never into somebody else's kickoff: a crew that has not sat down yet was planned
      // for its own chairs, and one more at a full table is a meeting that never starts.
      const next =
        this.projects.find((x) => !x.shipped && x.kickedOff) ??
        this.projects.find((x) => !x.shipped && !x.team.length);
      if (next) {
        p.project = next.id;
        this.log(msg('build.log.ownerPicksUp', { project: next.name }), 'info');
      }
    }

    if (p.calibrating) {
      const printer = this.printer;
      if (this.atStation(p, 'fdm')) {
        p.activity = 'babysitting';
        p.note = t('note.levelling');
        printer.operatorSkill = Math.max(printer.operatorSkill, p.data.skills.machining);
        printer.calibrate(dt);
        this.spendPlayerTime(dt);
        if (printer.calibration >= 0.99) {
          p.calibrating = false;
          p.note = t('note.bedFlat');
        }
      } else if (!p.walking) {
        p.walkTo(printer.def.stand);
      }
      p.advance(dt);
      return;
    }

    if (p.project) {
      const project = this.project(p.project)!;
      // True when a kickoff or a seat has already said why you are standing about; the
      // generic "nothing to do by hand" line must not paper over it.
      let explained = false;
      if (!project.kickedOff && project.required.concept > 0) {
        // You sit in on your own project's kickoff like anybody else — and only the time
        // actually spent planning comes off your day, not the time spent waiting for Ada.
        if (this.attendKickoff(p, project)) {
          if (p.activity === 'working') this.spendPlayerTime(dt);
          p.advance(dt);
          return;
        }
        explained = true;
      } else if (this.hasOpenWork(project)) {
        if (this.goToWork(p, project)) {
          if (p.activity === 'working') this.spendPlayerTime(dt);
          p.advance(dt);
          return;
        }
        explained = true;
      } else {
        this.releaseSeat(p.id);
      }
      // Nothing to do by hand right now — stay on the project and wait it out.
      if (!p.walking) {
        p.activity = 'idle';
        if (!explained) p.note = t('note.nothingByHand', { project: project.name });
      }
      p.advance(dt);
      return;
    }
    this.releaseSeat(p.id);

    if (!p.walking && p.activity !== 'idle') {
      p.activity = 'idle';
      p.note = t('note.free');
      p.walkTo(rng.pick(IDLE_TILES));
    } else if (!p.walking) {
      p.activity = 'idle';
    }
    p.advance(dt);
  }

  private spendPlayerTime(dt: number) {
    this.player.hoursLeft = Math.max(0, this.player.hoursLeft - dt);
  }

  /** Charge a management verb against today's budget. */
  private chargeHours(verb: keyof typeof VERB_HOURS | string): boolean {
    const cost = VERB_HOURS[verb] ?? 0;
    if (!this.player.canAfford(cost)) {
      this.log(msg('log.noHours'), 'bad');
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
      const who = this.members.find((m) => m.present)?.name;
      this.log(
        who
          ? msg('log.requeued', { member: who, part: pending[0].name, project: project.name })
          : msg('log.requeuedByYou', { part: pending[0].name, project: project.name }),
        'info',
      );
    }
  }

  private tickMachines(dt: number) {
    for (const machine of this.machines) {
      const operated = this.members.some(
        (m) => m.present && m.activity === 'babysitting' && this.atStation(m, machine.type),
      );
      if (!operated && !(this.player.present && this.player.calibrating)) machine.operatorSkill = 0;

      if (machine.running) this.machineHoursThisMonth += dt;
      const result = machine.tick(dt);
      if (!result) continue;

      const project = this.project(result.job.projectId);
      const part = project?.parts.find((p) => p.id === result.job.partId);
      const projectName = project?.name ?? '';
      if (result.kind === 'done') {
        if (part) part.status = 'done';
        this.log(
          msg('log.part.finished', { part: result.job.partName, project: projectName, time: clock(this.time) }),
          'good',
        );
      } else {
        if (part) {
          part.status = 'pending';
          part.attempts += 1;
        }
        const wasted = Math.round(result.job.materialDrawn * MACHINE.wasteOnFailure);
        this.log(
          msg('log.part.failed', {
            part: result.job.partName,
            project: projectName,
            reason: msg(result.reason),
            atHour: result.atHour,
            hours: result.job.hoursRequired,
            wasted,
          }),
          'bad',
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Stage advancement
  // -------------------------------------------------------------------------

  private advanceProjects() {
    this.watchKickoffs();
    this.assignTables();
    for (const project of [...this.projects]) {
      this.advanceProject(project);
    }
  }

  private advanceProject(project: ProjectData) {
    const stage = project.stage;

    if (stage === 'fabrication') {
      // Software has nothing to make. Without this the stage never completes.
      if (project.parts.length === 0) {
        this.setStage(project, 'assembly', null);
        return;
      }
      if (!this.seeded.has(project.id)) {
        this.seeded.add(project.id);
        this.queueAllPending(project.id);
      }
      if (partsOutstanding(project).length === 0 && project.parts.length > 0) {
        this.setStage(project, 'assembly', msg('log.stage.allParts', { project: project.name }), 'good');
      }
      return;
    }

    if (stage === 'test') {
      const outcome = resolveTest(project);
      if (outcome.passed) {
        this.setStage(
          project,
          'release',
          msg('log.stage.passed', { project: project.name, attempt: project.testAttempts }),
          'good',
        );
      } else {
        this.log(msg('log.stage.testFailed', { project: project.name, defect: outcome.defect ?? '' }), 'bad');
        this.setStage(
          project,
          'iterate',
          outcome.brokenPartId ? msg('log.stage.remake') : msg('log.stage.backToCad'),
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
        m.team === project.id &&
        m.hasTrait('perfectionist') &&
        (stage === 'cad' || stage === 'iterate') &&
        project.quality < PERFECTIONIST_QUALITY_GATE,
    );
    if (blocker) {
      blocker.note = t('note.notSigningOff');
      return;
    }

    switch (stage) {
      case 'concept':
        this.finishKickoff(project);
        break;
      case 'cad': {
        generateParts(project);
        // Eyeballing it was decided at the pitch; there is no simulation stage to sit in.
        const next = project.simulationSkipped ? 'fabrication' : 'simulation';
        this.setStage(
          project,
          next,
          msg('log.stage.cadDone', { project: project.name, quality: project.quality, parts: project.parts.length }),
        );
        break;
      }
      case 'simulation':
        this.setStage(project, 'fabrication', msg('log.stage.simClean', { project: project.name }));
        break;
      case 'assembly':
        this.setStage(project, 'test', msg('log.stage.assembled', { project: project.name }));
        break;
      case 'iterate': {
        const outstanding = partsOutstanding(project);
        if (outstanding.length) {
          this.seeded.delete(project.id);
          this.setStage(
            project,
            'fabrication',
            msg('log.stage.backOnMachine', { project: project.name, count: outstanding.length }),
          );
        } else {
          this.setStage(project, 'test', msg('log.stage.fixesIn', { project: project.name }));
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

  /** "Drone: cad" — the status line of somebody working a stage. */
  private workingNote(project: ProjectData): string {
    const stage = stageLabel(project.category, project.stage).toLocaleLowerCase(caseLocale());
    return t('note.working', { project: project.name, stage });
  }

  /**
   * The crew has planned it together. **This is where the crew size lands on quality** —
   * from whoever actually sat down, not from the seats the pitch asked for — and where the
   * table goes back for the next project.
   */
  private finishKickoff(project: ProjectData) {
    const def = CATALOG_MAP[project.defId];
    const crew = project.team.length + (this.player.project === project.id ? 1 : 0);
    const fit = teamFit(crew, def.teamSize);
    project.bonus += fit.quality;
    refreshQuality(project);
    project.kickedOff = true;
    project.tableId = null;
    this.setStage(
      project,
      'cad',
      msg('build.log.kickoffDone', {
        project: project.name,
        crew,
        fit: msg(`build.fit.${fit.key}` as MessageKey),
        quality: project.quality,
      }),
      fit.quality < -0.05 ? 'warn' : 'info',
    );
  }

  private setStage(
    project: ProjectData,
    next: StageKey,
    message: Message | null,
    kind: 'info' | 'good' | 'bad' | 'warn' = 'info',
  ) {
    project.stage = next;
    // Whose bar is full is a question about *this* stage; the last one's work is banked.
    project.contrib = {};
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
        this.releaseSeat(m.id);
        m.note = t('note.projectDone', { project: project.name });
      }
    }

    const built = store.getState().shipped.filter((r) => r.defId === project.defId).length;
    const novelty = Math.max(REPEAT.floor, REPEAT.falloff ** built);
    // What it is worth now (§4d): the brief's price, what the market wants this week, how
    // well it was designed for that market, and how good it actually turned out.
    const demand = store.getState().market[project.category] ?? 1;
    const appeal = project.appeal ?? 1;
    const payout = Math.round(def.payout * novelty * demand * appeal * qualityPay(project.quality));
    if (payout > 0) {
      store.getState().earn(payout, 'work');
      this.incomeThisMonth += payout;
      this.log(
        built
          ? msg('log.shippedAgain', { project: project.name, payout })
          : msg('log.shipped', { project: project.name, day: this.day, payout }),
        'good',
      );
    } else {
      this.log(msg('log.shippedUnpaid', { project: project.name, day: this.day }), 'good');
    }

    if (def.unlocksMachine) this.installMachine(def.unlocksMachine);
    this.recruit(project);

    const before = store.getState().era;
    const hype = Math.round(
      def.hype * project.hypeMultiplier * novelty * Math.sqrt(appeal) * qualityHype(project.quality),
    );
    // The market has one fewer thing to want.
    store.getState().setMarket(coolMarket(store.getState().market, project.category));
    store.getState().recordShipped(hype, {
      id: project.id,
      defId: project.defId,
      name: project.name,
      category: project.category,
      day: this.day,
      quality: project.quality,
      payout,
      hype,
      days: this.day - project.startedOnDay,
      spent: Math.round(project.spent),
      testAttempts: project.testAttempts,
      failedPrints: project.parts.reduce((sum, part) => sum + part.attempts, 0),
      crew: this.crewShares(project),
      design: { ...project.design },
      pay: { base: def.payout, market: demand, appeal, quality: qualityPay(project.quality), novelty },
    });
    const after = store.getState().era;
    if (after > before) {
      this.log(msg('log.eraUp', { era: eraDef(after).name }), 'good');
    }
  }

  /**
   * Who made a build, largest share first. Everybody still on the crew is listed even at
   * nothing — being on the team and not turning up is part of the story too.
   */
  crewShares(project: ProjectData): { id: string; name: string; share: number }[] {
    const effort = { ...(project.effort ?? {}) };
    for (const id of project.team) effort[id] ??= 0;
    const total = Object.values(effort).reduce((sum, v) => sum + v, 0);
    const nameOf = (id: string) =>
      id === this.player.id
        ? (store.getState().identity?.player || t('ui.space.you'))
        : (this.member(id)?.name ?? APPLICANTS.find((a) => a.id === id)?.name ?? ROSTER.find((r) => r.id === id)?.name ?? id);
    return Object.entries(effort)
      .map(([id, work]) => ({ id, name: nameOf(id), share: total > 0 ? work / total : 0 }))
      .sort((a, b) => b.share - a.share);
  }

  /** A printer's physical character — capacity, speed, how often it lets you down. */
  private makeMachine(def: StationDef): Machine {
    if (def.type !== 'fdm') return new Machine(def, 0);
    const model = PRINTER_MAP[def.model ?? STARTING_PRINTER.id] ?? STARTING_PRINTER;
    return new Machine(def, model.capacity, { speed: model.speed, reliability: model.reliability });
  }

  /** Printers you could buy right now: era-gated, and only while there is floor for them. */
  buyablePrinters(): PrinterModel[] {
    if (!freeSlots()) return [];
    // Everything you could ever own, including what the era does not allow yet — a machine
    // you cannot see is a machine you cannot plan for, and the H2S is worth wanting.
    return PRINTERS;
  }

  /**
   * Buy a printer. Two cheap machines print two things at once and one dear machine prints
   * one thing quickly — which of those the space needs is the decision, and the floor space
   * is what stops the answer being "both, forever".
   */
  buyPrinter(modelId: string): boolean {
    const model = PRINTER_MAP[modelId];
    if (!model || model.price <= 0) return false;
    if (model.era > store.getState().era) {
      this.log(msg('log.printer.needsEra', { model: model.name }), 'warn');
      return false;
    }
    if (!store.getState().spend(model.price, 'kit')) {
      this.log(msg('log.printer.cantAfford', { model: model.name }), 'bad');
      return false;
    }
    const def = installStation('fdm', `fdm-${uid()}`, model.id, model.name);
    if (!def) {
      this.log(msg('log.printer.noRoom'), 'warn');
      return false;
    }
    this.machines.push(this.makeMachine(def));
    store.getState().ownMachine('fdm');
    this.applyPerks();
    this.log(msg('log.printer.arrived', { model: model.name }), 'good');
    this.publish();
    return true;
  }

  /** The lease you could sign next, if the name is there and you can carry the cost. */
  nextLease(): { era: number; def: EraDef; ready: boolean; afford: boolean } | null {
    const state = store.getState();
    if (state.era >= ERAS.length) return null;
    const def = eraDef(state.era + 1);
    return {
      era: state.era + 1,
      def,
      ready: state.reputation >= eraDef(state.era).repToAdvance,
      afford: state.cash - def.moveCost >= -ECONOMY.overdraftLimit,
    };
  }

  /** Move up. The reputation opens the door; the removal van still has to be paid for. */
  signLease(): boolean {
    const next = this.nextLease();
    if (!next || !next.ready) return false;
    if (!store.getState().spend(next.def.moveCost, 'lease')) {
      this.log(msg('log.lease.cantAfford', { space: next.def.name }), 'bad');
      return false;
    }
    store.setState({ era: next.era });
    // The floor grows with the lease, and everything goes back against a wall.
    applyEraLayout(next.era);
    // Stations moved, so an arrangement that was legal in the old room may not be in this
    // one. Re-deriving drops anything that now sits under a bench back to a default slot,
    // and the station arrangement goes entirely — every bench is against a new wall.
    store.getState().clearStationPlacements();
    this.amenityRev = -1;
    this.log(msg('log.lease.signed', { space: next.def.name, cost: next.def.moveCost }), 'good');
    this.publish();
    return true;
  }

  /**
   * **Cheats.** Everything the developer console can reach lives behind this one object, so
   * that `sim.dev.*` at a call site is unmistakably not gameplay and the sim's own internals
   * stay private. Nothing in `src/` outside the console may call it.
   */
  readonly dev = {
    /** Run the clock forward, properly — every day rolls, bills land, awards are held. */
    advance: (days: number) => {
      const steps = Math.round(Math.max(0, Math.min(400, days)) * TIME.hoursPerDay * 2);
      for (let i = 0; i < steps; i += 1) {
        if (store.getState().gameOver) break;
        this.tick(TIME.secondsPerHour * 0.5, 1);
      }
      this.publish();
    },

    /**
     * Fill in whatever the current stage is waiting on, and let the normal pipeline pick it
     * up. It fakes the *inputs* — work done, parts printed, the order landed — rather than
     * setting the stage directly, so quality, test failures and the Perfectionist gate all
     * still behave as they would have.
     */
    complete: (projectId: string, untilShipped = false) => {
      const project = this.projects.find((p) => p.id === projectId);
      if (!project) return false;
      const fill = () => {
        project.progress[project.stage] = project.required[project.stage];
        project.partsOrdered = true;
        project.partsArriveAt = 0;
        for (const part of project.parts) part.status = 'done';
      };
      // A run through the whole pipeline is eight stages plus whatever testing sends back.
      for (let guard = 0; guard < 60; guard += 1) {
        fill();
        this.advanceProjects();
        if (!untilShipped || project.shipped) break;
        if (!this.projects.includes(project)) break;
      }
      this.publish();
      return true;
    },

    /** Move house without paying for it. The floor and the walls change as they would. */
    setEra: (era: number) => {
      // `ERAS` is one-based by `era`, not by index — `ERAS.length - 1` clamped era 3 to 2.
      const next = Math.min(ERAS.length, Math.max(1, Math.round(era)));
      store.setState({ era: next });
      applyEraLayout(next);
      this.amenityRev = -1;
      this.publish();
    },
  };

  /** What this machine would fetch if you sold it. Zero for anything you cannot sell. */
  resaleFor(machineId: string): number {
    const machine = this.machines.find((m) => m.id === machineId);
    if (!machine || machine.type !== 'fdm') return 0;
    const model = PRINTER_MAP[machine.def.model ?? STARTING_PRINTER.id] ?? STARTING_PRINTER;
    return resaleValue(model);
  }

  /**
   * Sell a printer. Anything queued on it goes back to pending so another machine can pick
   * it up — or so it sits there waiting, if you have just sold your last one, which the game
   * allows on purpose: trading the A1 in to fund something quicker is a real decision and it
   * should be possible to do it badly.
   */
  sellPrinter(machineId: string): boolean {
    const index = this.machines.findIndex((m) => m.id === machineId);
    if (index < 0) return false;
    const machine = this.machines[index];
    if (machine.type !== 'fdm') return false;
    const value = this.resaleFor(machineId);

    for (const job of [...machine.queue, ...(machine.current ? [machine.current] : [])]) {
      const project = this.project(job.projectId);
      const part = project?.parts.find((p) => p.id === job.partId);
      if (part) part.status = 'pending';
    }
    machine.queue = [];
    machine.current = null;

    this.machines.splice(index, 1);
    removeStation(machine.id);
    if (!this.machines.some((m) => m.type === 'fdm')) store.getState().disownMachine('fdm');
    store.getState().earn(value, 'sales');
    this.log(
      msg(this.machines.some((m) => m.type === 'fdm') ? 'log.machine.sold' : 'log.machine.soldLast', {
        machine: machine.label,
        value,
      }),
      'warn',
    );
    this.publish();
    return true;
  }

  installMachine(type: MachineType) {
    // Building the same tool twice does not get you two of them: the space already owns the
    // capability, and a second one would eat a slot the CNC still needs. Printers are the
    // exception and they are bought, not built.
    if (this.machines.some((m) => m.type === type) || stationOfType(type)) {
      this.log(msg('log.machine.duplicate', { machine: MACHINE_LABEL[type] }), 'info');
      store.getState().ownMachine(type);
      return;
    }
    const def = installStation(type, `${type}-${this.machines.length + 1}`);
    if (!def) {
      this.log(msg('log.machine.noRoom'), 'warn');
      return;
    }
    if (FAB_MACHINES.includes(type)) this.machines.push(this.makeMachine(def));
    store.getState().ownMachine(type);
    this.applyPerks();
    this.log(msg('log.machine.installed', { machine: def.label }), 'good');
  }

  // -------------------------------------------------------------------------
  // Saving and restoring (CLAUDE.md §11a)
  // -------------------------------------------------------------------------

  /** Everything the sim owns that a save needs. Entities hand over runtime state only —
   *  skills and passions come back from the roster data by id. */
  serialise(): SaveFile['sim'] {
    return {
      day: this.day,
      time: this.time,
      yearStart: { ...this.yearStart },
      rivalYearStart: [...this.rivalYearStart],
      machineHoursThisMonth: this.machineHoursThisMonth,
      incomeThisMonth: this.incomeThisMonth,
      recruitClock: this.recruitClock,
      recentShip: this.recentShip ? { ...this.recentShip, tags: [...this.recentShip.tags] } : null,
      seeded: [...this.seeded],
      requeueTimers: [...this.requeueTimers],
      rivals: this.rivals.map((r) => ({ ...r })),
      projects: this.projects.map((p) => structuredClone(p)),
      installedStations: installedStations(),
      members: this.members.map((m) => ({
        id: m.id,
        role: m.role,
        team: m.team,
        interest: m.interest,
        skills: { ...m.data.skills },
        training: m.training ? { ...m.training } : null,
        energy: m.data.energy,
        mood: m.data.mood,
        ghostFactor: m.ghostFactor,
        present: m.present,
        tile: { ...m.tile },
        cooldowns: m.serialiseCooldowns(),
      })),
      player: {
        hoursToday: this.player.hoursToday,
        hoursLeft: this.player.hoursLeft,
        energy: this.player.data.energy,
        project: this.player.project,
        calibrating: this.player.calibrating,
        present: this.player.present,
        tile: { ...this.player.tile },
      },
      machines: this.machines.map((machine) => ({
        id: machine.id,
        type: machine.type,
        calibration: machine.calibration,
        consumable: machine.consumable,
        current: machine.current ? { ...machine.current } : null,
        queue: machine.queue.map((job) => ({ ...job })),
      })),
    };
  }

  /** Put a saved run back together. Called on a fresh Simulation, before the first tick. */
  restore(data: SaveFile['sim']) {
    // Both caches are invalidated by hand: a load reuses this Simulation instance, and a
    // restored run whose revision counter happens to match the one already in memory would
    // otherwise keep the floor plan of the game it replaced.
    this.amenityRev = -1;
    this.comfortKey = '\u0000';
    this.day = data.day;
    this.time = data.time;
    // Upvotes and best builds arrived with the second set of awards; older saves have neither.
    this.yearStart = { upvotes: 0, ...data.yearStart };
    this.rivalYearStart = new Map(
      data.rivalYearStart.map(([id, since]) => [id, { upvotes: 0, ...since }] as const),
    );
    this.machineHoursThisMonth = data.machineHoursThisMonth;
    this.incomeThisMonth = data.incomeThisMonth;
    this.seeded = new Set(data.seeded);
    this.requeueTimers = new Map(data.requeueTimers);
    this.rivals = data.rivals.map((rival) => ({
      ...rival,
      upvotes: rival.upvotes ?? 0,
      bestBuild: rival.bestBuild ?? null,
    }));
    // A save from before a space joined the field: it starts from scratch, as if it just opened.
    for (const fresh of createRivals()) {
      if (!this.rivals.some((rival) => rival.id === fresh.id)) this.rivals.push(fresh);
    }
    this.projects = data.projects;

    // The floor is the lease's size, and tool-built machines live in a module-level list —
    // both have to be back before anything tries to look a tile up.
    resetStations();
    applyEraLayout(store.getState().era);
    for (const station of data.installedStations) {
      // Bought furniture has no slot; it goes wherever there is room and the saved
      // arrangement below puts it back on its own tile.
      const def = station.furniture
        ? installFurniture(station.type, station.id, station.label ?? MACHINE_LABEL[station.type], station.span ?? 1)
        : installStation(station.type, station.id, station.model, station.label);
      if (def && FAB_MACHINES.includes(station.type)) this.machines.push(this.makeMachine(def));
    }
    setStationLayout(store.getState().stationPlacements);
    this.applyPerks();

    // Put the run's own applicant order back before anybody's reputation bar is read.
    shuffleLadder(store.getState().ladder ?? []);
    const everyone = [...ROSTER, ...APPLICANTS];
    this.members = [];
    for (const saved of data.members) {
      const source = everyone.find((person) => person.id === saved.id);
      if (!source) continue;
      const member = this.joinMember(source);
      member.role = saved.role ?? null;
      member.team = saved.team;
      member.interest = saved.interest;
      // Skills can be trained, so a save carries them; an older file keeps the roster's.
      if (saved.skills) member.data.skills = { ...member.data.skills, ...saved.skills };
      member.training = saved.training ?? null;
      member.data.energy = saved.energy;
      member.data.mood = saved.mood;
      member.ghostFactor = saved.ghostFactor;
      member.restoreCooldowns(saved.cooldowns);
      if (saved.present) member.arrive(saved.tile);
    }

    this.claims.clear();
    this.recruitClock = data.recruitClock;
    this.recentShip = data.recentShip ? { ...data.recentShip, tags: [...data.recentShip.tags] } : null;

    const player = data.player;
    this.player.hoursToday = player.hoursToday;
    this.player.hoursLeft = player.hoursLeft;
    this.player.data.energy = player.energy;
    this.player.project = player.project;
    this.player.calibrating = player.calibrating;
    if (player.present) this.player.arrive(player.tile);

    for (const saved of data.machines) {
      const machine = this.machines.find((m) => m.id === saved.id);
      if (!machine) continue;
      machine.calibration = saved.calibration;
      machine.consumable = saved.consumable;
      machine.current = saved.current;
      machine.queue = saved.queue;
    }

    // Day plans are cheap to recompute and cannot drift if they are never saved.
    this.planDay();
    store.getState().setClock(this.day, this.time);
    this.publish();
  }

  // -------------------------------------------------------------------------
  // Teams (CLAUDE.md §3b) — you allocate, but they are still volunteers
  // -------------------------------------------------------------------------

  private addToTeam(project: ProjectData, member: MemberEntity, interest?: number) {
    if (project.team.includes(member.id)) return;
    // One project per person (§3b). A proposer used to be signed straight onto their idea
    // while still listed on whatever they were already doing, and the old team kept a ghost
    // in its list — harmless while it only inflated a count, and a deadlock once a kickoff
    // needed everybody on the list to sit down: the table waited for somebody who was busy
    // at another desk.
    if (member.team && member.team !== project.id) {
      const old = this.project(member.team);
      if (old) old.team = old.team.filter((id) => id !== member.id);
      this.releaseSeat(member.id);
    }
    project.team.push(member.id);
    member.team = project.id;
    member.interest = interest ?? TEAM.joinInterest * (0.5 + member.passionMatch(project.tags));
  }

  private dropFromTeam(project: ProjectData, member: MemberEntity, cooldownHours: number) {
    project.team = project.team.filter((id) => id !== member.id);
    this.releaseSeat(member.id);
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
      this.log(msg('log.team.full', { project: project.name, size: project.teamSize }), 'warn');
      return false;
    }
    if (member.training) {
      this.log(msg('build.log.onCourse', { member: member.name }), 'warn');
      return false;
    }
    if (member.team) {
      const other = this.project(member.team);
      this.log(
        other
          ? msg('log.team.busy', { member: member.name, project: other.name })
          : msg('log.team.busyElsewhere', { member: member.name }),
        'warn',
      );
      return false;
    }
    if (member.isCoolingOff(projectId)) {
      this.log(msg('log.team.saidNo', { member: member.name, project: project.name }), 'warn');
      return false;
    }

    // Rate against the genre, not a single tag: it is what the crew picker shows.
    const match = Math.max(member.passionMatch(project.tags), categoryAffinity(member.data.passions, project.category));
    const bounty = project.bounties.includes(project.stage) ? TEAM.bountyAcceptBonus : 0;
    const chance = Math.min(0.97, TEAM.acceptBase + match * TEAM.acceptFromPassion + bounty);
    if (!rng.chance(chance)) {
      member.setCooldown(projectId, TEAM.declineCooldownHours);
      this.log(msg('log.team.declined', { member: member.name, project: project.name }), 'warn');
      return false;
    }

    this.addToTeam(project, member);
    this.log(msg('log.team.joined', { member: member.name, project: project.name }), 'good');
    return true;
  }

  /** Take somebody off a project. They will not come straight back to it. */
  releaseMember(projectId: string, memberId: string) {
    const project = this.project(projectId);
    const member = this.member(memberId);
    if (!project || !member) return;
    this.dropFromTeam(project, member, TEAM.declineCooldownHours / 2);
    this.log(msg('log.team.left', { member: member.name, project: project.name }), 'info');
  }

  /**
   * Day one's crew: the fixed roster, topped up from the front of the applicant ladder to
   * whatever the difficulty says. Taking them in reputation order means an easy start is
   * simply the people you would have recruited first anyway, not a different cast.
   *
   * This has to be callable *after* construction. The Simulation is built when the page
   * loads, which is before the player has chosen anything, so the constructor can only ever
   * see the default difficulty — picking Hard and starting with four people was exactly that.
   */
  seedRoster() {
    // Who turns up in what order is dealt fresh for every run (and kept for the save).
    store.setState({ ladder: shuffleLadder(undefined, () => rng.range(0, 1)) });
    const wanted = DIFFICULTY_MAP[store.getState().difficulty].startMembers;
    const extra = [...APPLICANTS]
      .sort((a, b) => (a.repRequired ?? 0) - (b.repRequired ?? 0))
      .slice(0, Math.max(0, wanted - ROSTER.length));
    this.members = [...ROSTER, ...extra].map((data) => new MemberEntity({ ...data }, DOOR));
    this.plans.clear();
    for (const m of this.members) {
      this.plans.set(m.id, { attending: false, arriveAt: 0, leaveAt: 0 });
    }
    // A shortlist from day one, so taking somebody on is a choice between people rather than
    // a yes-or-no on whoever happened to call. The next names on the ladder, rep gate waived:
    // the joining fee is what limits how many of them you can actually afford.
    const shortlist = [...APPLICANTS]
      .filter((a) => !this.members.some((m) => m.id === a.id))
      .sort((a, b) => (a.repRequired ?? 0) - (b.repRequired ?? 0))
      .slice(0, RECRUIT.shortlist)
      .map((a) => a.id);
    store.setState({ applicants: shortlist, passed: [] });
    this.planDay();
  }

  /** Bring somebody into the space as a member. */
  joinMember(data: MemberData): MemberEntity {
    const entity = new MemberEntity({ ...data }, DOOR);
    this.members.push(entity);
    this.plans.set(data.id, { attending: false, arriveAt: 0, leaveAt: 0 });
    return entity;
  }

  /**
   * The overdraft clock (§7a). Being under is allowed and is often the right move — the money
   * you owe is usually parts on a project that will pay for them. Staying under is what ends
   * the run, and so is going deeper than the floor, which is the one thing no amount of time
   * recovers from.
   */
  private checkSolvency() {
    const state = store.getState();
    if (state.cash >= 0) {
      if (state.overdraftSince !== null) {
        store.setState({ overdraftSince: null });
        this.log(msg('log.cash.backInBlack'), 'good');
      }
      return;
    }
    if (state.overdraftSince === null) {
      store.setState({ overdraftSince: this.day });
      this.log(msg('log.cash.overdraftStarted', { days: ECONOMY.overdraftDays }), 'warn');
      return;
    }
    if (state.cash < -ECONOMY.overdraftLimit) {
      store.getState().endRun(
        msg('over.bank', { amount: Math.abs(state.cash) }),
        this.day,
      );
      return;
    }
    const daysUnder = this.day - state.overdraftSince;
    if (daysUnder >= ECONOMY.overdraftDays) {
      store.getState().endRun(
        msg('over.landlord'),
        this.day,
      );
      return;
    }
    const left = ECONOMY.overdraftDays - daysUnder;
    if (left === 30 || left === 14 || left <= 7) {
      this.log(msg('log.cash.daysLeft', { days: left }), left <= 7 ? 'bad' : 'warn');
    }
  }

  /** Paying members of the public — the passive income a reputation earns you. */
  get membership(): number {
    // Hype behaves like reputation you have not earned yet: it brings the public in while it
    // lasts and takes them away again when it fades, through the same curve and the same cap.
    const borrowed = this.pressure * HYPE.extraMembers * ECONOMY.reputationPerMember;
    return membershipFor(store.getState().reputation + borrowed, store.getState().era);
  }

  /** How loudly the place is being talked about, 0-1. Everything hype feeds scales off this. */
  get pressure(): number {
    return hypePressure(store.getState().hype);
  }

  /** What the next bill will look like if nothing changes. */
  previewBill(): { income: number; costs: number; net: number; dueInDays: number } {
    // Preview is cash movement only — project money is banked as it arrives.
    const state = store.getState();
    const rent = rentFor(state.era);
    const utilities = Math.round(this.machineHoursThisMonth * ECONOMY.utilityPerMachineHour);
    const upkeep = this.comforts.upkeep;
    const dues = this.members.length * ECONOMY.crewDues + this.membership * ECONOMY.duesPerMember;
    return {
      income: dues,
      costs: rent + utilities + upkeep,
      net: dues - rent - utilities - upkeep,
      dueInDays: ECONOMY.billEvery - ((this.day - 1) % ECONOMY.billEvery),
    };
  }

  /**
   * The monthly bill. The rent does not care whether you shipped anything, which is the
   * point: a quiet month still costs you a month.
   */
  private runBilling() {
    if ((this.day - 1) % ECONOMY.billEvery !== 0 || this.day === 1) return;
    const state = store.getState();

    const crewDues = this.members.length * ECONOMY.crewDues;
    const communityDues = this.membership * ECONOMY.duesPerMember;
    const rent = rentFor(state.era);
    const utilities = Math.round(this.machineHoursThisMonth * ECONOMY.utilityPerMachineHour);
    const upkeep = this.comforts.upkeep;

    // Only dues and the running costs move cash at the bill; everything else was banked or
    // paid as it happened, and the ledger kept count of it.
    const balanceBefore = state.cash;
    const balanceAfter = balanceBefore + crewDues + communityDues - rent - utilities - upkeep;
    const shortfall = Math.max(0, -balanceAfter);
    const opening = state.monthOpen;
    const ledger: Ledger = {
      ...state.ledger,
      crewDues,
      communityDues,
      rent: -rent,
      power: -utilities,
      comforts: -upkeep,
    };
    // **The statement has to add up** (§7a): opening + income − costs = closing, to the lira.
    // Whatever moved cash without naming itself — the dev console, a save from before the
    // ledger — is listed as "other" rather than left as a hole in the sum.
    const named = Object.values(ledger).reduce<number>((sum, v) => sum + (v ?? 0), 0);
    const gap = Math.round(balanceAfter - opening - named);
    if (gap) ledger.other = (ledger.other ?? 0) + gap;

    const detail: Partial<Record<LedgerKind, Text>> = {
      crewDues: msg('bill.crewDuesDetail', { count: this.members.length, each: ECONOMY.crewDues }),
      communityDues: msg('bill.communityDuesDetail', { count: this.membership, each: ECONOMY.duesPerMember }),
      rent: eraDef(state.era).name,
      power: msg('bill.powerDetail', { hours: Math.round(this.machineHoursThisMonth) }),
      comforts: msg('bill.comfortsDetail', { count: state.amenities.length }),
    };
    // Rent and dues are listed even at zero — they are the month's fixed shape. Anything
    // else only when it happened, so a quiet month is a short statement.
    const always: LedgerKind[] = ['crewDues', 'rent'];
    const income: BillLine[] = [];
    const costs: BillLine[] = [];
    for (const kind of LEDGER_ORDER) {
      const amount = Math.round(ledger[kind] ?? 0);
      if (!amount && !always.includes(kind)) continue;
      const line: BillLine = {
        label: msg(`bill.${kind}` as MessageKey),
        detail: detail[kind] ?? msg(`bill.${kind}Detail` as MessageKey),
        amount,
      };
      const isIncome = kind === 'other' ? amount > 0 : INCOME_KINDS.includes(kind);
      (isIncome ? income : costs).push(line);
    }
    const total = balanceAfter - opening;
    const missesInARow = shortfall > 0 ? state.missedBills + 1 : 0;
    // Eviction is the overdraft clock's job now (§7a), not this line's: a bill you cannot
    // cover puts you under, and staying under is what ends the run.
    const evicted = false;

    store.setState({ cash: balanceAfter });
    const bill: Bill = {
      month: Math.floor((this.day - 1) / ECONOMY.billEvery),
      day: this.day,
      income,
      costs,
      total,
      balanceBefore,
      balanceAfter,
      opening,
      shortfall,
      missesInARow,
      evicted,
    };
    store.getState().setBill(bill);
    store.getState().closeMonth();
    this.machineHoursThisMonth = 0;
    this.incomeThisMonth = 0;

    if (shortfall > 0) {
      this.log(msg('log.bill.short', { amount: shortfall }), 'bad');
    } else {
      this.log(
        msg(total >= 0 ? 'log.bill.up' : 'log.bill.down', { amount: Math.abs(total) }),
        total >= 0 ? 'good' : 'warn',
      );
    }
  }

  /** Difficulty and the yearly ramp, folded into the multipliers the rivals tick on. */
  /**
   * Years the run has been going, 1-based. **Not `season.year`**, which is a calendar year:
   * feeding 2026 into a ramp that expects 1 multiplied the rivals' pace by 162 on day one,
   * and since their pace compounds with their own reputation it reached millions of ships a
   * day within a fortnight. The `while (progress >= 1)` loop in `tickRivals` then ran
   * millions of times per day, which is what looked like a hang.
   */
  get yearIndex(): number {
    return store.getState().ceremonies.length + 1;
  }

  private rivalPressure() {
    const difficulty = DIFFICULTY_MAP[store.getState().difficulty];
    return {
      pace: difficulty.rivalPace * (1 + (this.yearIndex - 1) * difficulty.yearRamp),
      reputation: difficulty.rivalRep,
    };
  }

  /** Where the run has got to on the way to the next awards night. */
  get season(): { year: number; dayOfYear: number; length: number } {
    const thisYear = awardsDay(this.day);
    // Once this year's night has been held, the bar counts toward next October.
    const due = thisYear > this.yearStart.day ? thisYear : awardsDay(this.day + CALENDAR.daysPerYear);
    return {
      year: gameDate(this.day).year,
      dayOfYear: this.day - this.yearStart.day,
      length: Math.max(1, due - this.yearStart.day),
    };
  }

  /** Everybody on one leaderboard, the player included. */
  scoreboard(): ScoreRow[] {
    const state = store.getState();
    const growth = (earned: number, startedWith: number) =>
      Math.round((100 * earned) / Math.max(RISING_FLOOR, startedWith));
    const best = state.shipped
      .filter((record) => record.day >= this.yearStart.day)
      .reduce<ShippedRecord | null>((top, record) => (!top || record.hype > top.hype ? record : top), null);
    const rows: ScoreRow[] = this.rivals.map((rival) => {
      const def = RIVAL_MAP[rival.id];
      const since = this.rivalYearStart.get(rival.id) ?? { projects: 0, reputation: 0, upvotes: 0 };
      const reputationThisYear = rival.reputation - since.reputation;
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
        reputationThisYear,
        growthThisYear: growth(reputationThisYear, since.reputation),
        upvotesThisYear: rival.upvotes - since.upvotes,
        bestBuild: rival.bestBuild ? { ...rival.bestBuild } : null,
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
      growthThisYear: growth(state.reputation - this.yearStart.reputation, this.yearStart.reputation),
      upvotesThisYear: state.upvotes - this.yearStart.upvotes,
      bestBuild: best ? { name: best.name, score: best.hype } : null,
      isPlayer: true,
    });
    return rows.sort((a, b) => b.reputation - a.reputation);
  }

  /** The awards night, once a year. */
  private checkAwards() {
    // Awards are held every October, so the award year runs October to October and the
    // first night arrives two months before the calendar year is out — rather than landing
    // on New Year's Eve, which is both odd and a long wait for a first-time player.
    const due = awardsDay(this.day);
    if (this.day < due || due <= this.yearStart.day) return;
    const ceremony = runCeremony(gameDate(this.day).year, this.scoreboard());
    if (ceremony.reputationGained > 0) {
      store.getState().recordReputation(ceremony.reputationGained);
    }
    store.getState().setCeremony(ceremony);
    const won = ceremony.awards.filter((a) => a.playerWon).length;
    this.log(
      won
        ? msg('log.awards.won', { won, total: ceremony.awards.length })
        : msg('log.awards.none'),
      won ? 'good' : 'warn',
    );

    const state = store.getState();
    this.yearStart = {
      day: this.day,
      projects: state.shippedCount,
      reputation: state.reputation,
      upvotes: state.upvotes,
    };
    for (const rival of this.rivals) {
      this.rivalYearStart.set(rival.id, {
        projects: rival.projects,
        reputation: rival.reputation,
        upvotes: rival.upvotes,
      });
      rival.bestBuild = null;
    }
  }

  /**
   * One clock governs how fast word gets around, and difficulty sets its speed (§3c).
   * Reputation still decides *who* is interested; this decides how fast the queue moves.
   *
   * It caps at the threshold rather than banking days, so a quiet stretch cannot pay out
   * three people at once — and if nobody qualifies yet the clock simply sits full, so the
   * next person to clear their reputation bar arrives immediately rather than waiting twice.
   */
  private tickRecruiting() {
    const every = DIFFICULTY_MAP[store.getState().difficulty].recruitEvery;
    // Attention is why people hear about you at all, so it buys days on this clock.
    // Attention brings people to the door; the comforts are what they hear about when
    // they ask around, so the two stack on the same clock.
    const gain = (1 + this.pressure * (HYPE.recruitSpeedUp - 1)) * this.comforts.draw;
    this.recruitClock = Math.min(this.recruitClock + gain, every);
    if (this.recruitClock < every) return;
    const next = this.nextApplicant();
    if (!next) return;
    this.recruitClock -= every;
    store.getState().openApplicant(next.data.id);
    this.log(
      next.via
        ? msg('log.applicant.via', { name: next.data.name, via: next.via })
        : msg('log.applicant.asking', { name: next.data.name }),
      'good',
    );
  }

  /**
   * Who turns up next. Normally the nearest name on the reputation ladder — but a project
   * shipped in the last few days pulls its own enthusiast forward instead, and seeing the
   * write-up gets them halfway past their reputation bar rather than all the way. That is
   * what keeps shipping the thing that shapes your crew, without letting a prolific month
   * outrun the difficulty's pace: it changes *who* arrives, never how many.
   */
  private nextApplicant(): { data: MemberData; via?: string } | null {
    const { reputation, applicants } = store.getState();
    const known = new Set(this.members.map((m) => m.id));
    const open = new Set(applicants);
    const passed = new Set(store.getState().passed);
    const pool = APPLICANTS.filter((a) => !known.has(a.id) && !open.has(a.id) && !passed.has(a.id));
    if (!pool.length) return null;

    const ship = this.recentShip;
    if (ship && this.day - ship.day <= RECRUIT.shipMemoryDays) {
      const tempted = pool
        .map((data) => ({ data, match: Math.max(0, ...ship.tags.map((tag) => data.passions[tag] ?? 0)) }))
        .filter(
          (entry) =>
            entry.match >= RECRUIT.matchFloor &&
            (entry.data.repRequired ?? 0) * RECRUIT.shipGateRelief <= reputation,
        )
        .sort((a, b) => b.match - a.match);
      if (tempted.length) return { data: tempted[0].data, via: ship.name };
    }

    const ready = pool
      .filter((data) => (data.repRequired ?? 0) <= reputation)
      .sort((a, b) => (a.repRequired ?? 0) - (b.repRequired ?? 0));
    return ready.length ? { data: ready[0] } : null;
  }

  /**
   * What the space itself is known for: the tags of everything it has shipped, commonest
   * first. A post about the place lands in the room that recognises the work.
   */
  spaceSubject() {
    const counts = new Map<Tag, number>();
    for (const record of store.getState().shipped) {
      for (const tag of CATALOG_MAP[record.defId]?.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
    return spaceSubject(store.getState().reputation, tags.length ? tags : ['software']);
  }

  /** §5 — what you just shipped is what the next person through the door cared about. */
  private recruit(project: ProjectData) {
    this.recentShip = { tags: [...project.tags], name: project.name, day: this.day };
  }

  /**
   * Put a project in front of a room (§6). The room, the stage you show it at and the claim
   * you make are three separate decisions, and the claim is the one with teeth: it multiplies
   * the reaction and sets a merit bar, and a room's skepticism decides how hard the fall is
   * when the work does not clear it.
   */
  post(projectId: string, subredditId: string, claim: ClaimKey, by?: MemberEntity): boolean {
    const sub = SUBREDDIT_MAP[subredditId];
    if (!sub) return false;
    const project = projectId === SPACE_SUBJECT ? null : this.project(projectId);
    if (projectId !== SPACE_SUBJECT && (!project || project.shipped)) return false;

    // One post per subject per day. Posting the same thing three times before lunch is not
    // a strategy anybody should be rewarded for finding, and the hour cost alone did not
    // stop it once the day grew to eighteen.
    const posts = store.getState().posts;
    if (posts.some((p) => p.projectId === projectId && p.day === this.day)) {
      this.log(
        project ? msg('log.post.alreadyProject', { project: project.name }) : msg('log.post.alreadySpace'),
        'warn',
      );
      return false;
    }
    const already = posts.filter(
      (p) => p.projectId === projectId && p.subreddit === subredditId,
    ).length;
    // A keyholder doing it is the entire point of the job: it is their hour, not yours.
    if (!by && !this.chargeHours('post')) return false;

    const subject = project ? projectSubject(project) : this.spaceSubject();
    const name = project ? project.name : store.getState().identity?.name ?? 'the space';
    void by;
    const reaction = react(subject, sub, claim, already);
    const entry: Post = {
      id: uid(),
      projectId,
      projectName: name,
      subreddit: subredditId,
      stage: project?.stage ?? 'release',
      claim,
      upvotes: reaction.upvotes,
      hype: reaction.hype,
      comment: reaction.comment,
      burned: reaction.burned,
      day: this.day,
    };
    store.getState().recordPost(entry, reaction.reputationHit);
    this.log(
      msg(reaction.burned ? 'log.post.burned' : 'log.post.did', {
        room: sub.name,
        name: project ? project.name : store.getState().identity?.name ?? msg('word.theSpace'),
        upvotes: reaction.upvotes,
      }),
      reaction.burned ? 'bad' : 'good',
    );
    this.publish();
    return true;
  }

  /** Give somebody a standing job, or take it away. One role each, one holder each. */
  setRole(memberId: string, role: Role | null) {
    const member = this.member(memberId);
    if (!member) return;
    if (role) {
      for (const other of this.members) if (other.role === role) other.role = null;
    }
    member.role = role;
    this.log(
      role
        ? msg('log.role.set', { member: member.name, role: ROLE_LABEL[role].toLowerCase() })
        : msg('log.role.cleared', { member: member.name }),
      'info',
    );
    this.publish();
  }

  /**
   * Roles act at their holder's **next availability**, which is the whole idea: the chore
   * gets done because a person who is in the building does it, not because a rule fired.
   * Somebody who is away, or deep in a build, is not watching the filament.
   */
  private runRoles() {
    for (const member of this.members) {
      if (!member.role || !member.present) continue;
      if (member.activity === 'walking') continue;
      switch (member.role) {
        case 'printer': {
          const dry = this.machines.find(
            (m) => m.consumableMax > 0 && m.consumable < FILAMENT.lowWarning,
          );
          if (dry && store.getState().spend(this.refillCost(dry.id), 'filament')) {
            dry.refill(dry.consumableMax);
            this.log(msg('log.role.loaded', { member: member.name, machine: dry.label }), 'good');
          }
          break;
        }
        case 'quartermaster': {
          const unordered = this.projects.find((p) => !p.partsOrdered && p.bomCost > 0);
          if (unordered && this.placeOrder(unordered)) {
            this.log(msg('log.role.ordered', { member: member.name, project: unordered.name }), 'good');
          }
          break;
        }
        case 'social': {
          // One safe post a day, and never a bold one: keeping the feeds warm is a chore,
          // but claiming more than the work backs is a judgement call and that stays yours.
          // Left alone, hype decays to nothing between the posts you remember to make.
          if (this.socialDay === this.day) break;
          const state = store.getState();
          const subjects: { id: string; subject: ReturnType<typeof projectSubject> }[] = [
            ...this.projects
              .filter((p) => !p.shipped)
              .map((p) => ({ id: p.id, subject: projectSubject(p) })),
            { id: SPACE_SUBJECT, subject: this.spaceSubject() },
          ].filter((x) => !state.posts.some((p) => p.projectId === x.id && p.day === this.day));
          const best = subjects.sort((a, b) => b.subject.merit - a.subject.merit)[0];
          if (!best) break;
          // Best *unused* pairing, not simply the biggest room: novelty decays per outlet
          // per build, so posting the same thing to the same feed every day is the one
          // mistake a social media manager should never make.
          const seen = (roomId: string) =>
            state.posts.filter((p) => p.projectId === best.id && p.subreddit === roomId).length;
          const room = [...SUBREDDITS].sort(
            (a, b) =>
              tasteMatch(best.subject.tags, b) * b.audience * novelty(seen(b.id)) -
              tasteMatch(best.subject.tags, a) * a.audience * novelty(seen(a.id)),
          )[0];
          if (this.post(best.id, room.id, 'wip', member)) this.socialDay = this.day;
          break;
        }
        case 'technician': {
          // **What replaced the Project Manager** (§3b). A role that started projects took
          // the one decision the player should always make — what the space builds — and
          // made it for them. Levelling beds is the opposite: a chore nobody volunteers for
          // (§5), done between prints so a job is never interrupted.
          const drifting = this.machines.find(
            (m) => !m.running && m.calibration < ROLES.technicianLevelsBelow,
          );
          if (drifting) {
            drifting.calibration = 1;
            this.log(msg('log.role.levelled', { member: member.name, machine: drifting.label }), 'good');
          }
          break;
        }
      }
    }
  }

  /** Ask somebody to leave. It costs you their dues, so this is a last resort now. */
  letGo(id: string) {
    const member = this.member(id);
    if (!member) return;
    if (member.team) {
      const project = this.project(member.team);
      if (project) project.team = project.team.filter((x) => x !== id);
    }
    this.members = this.members.filter((m) => m.id !== id);
    this.plans.delete(id);
    this.releaseSeat(id);
    this.log(msg('log.member.offBooks', { member: member.name }), 'warn');
  }

  /** What a contract costs to set up: induction, a key, a shelf, a tool briefing. */
  hireCost(id: string): number {
    if (!APPLICANTS.some((a) => a.id === id)) return 0;
    return Math.round(WEEKLY_HOURS * RECRUIT.hireCostPerWeeklyHour);
  }

  /** Turn an applicant down. Free, and final: they do not come back round. */
  passApplicant(id: string): boolean {
    if (!store.getState().applicants.includes(id)) return false;
    const data = APPLICANTS.find((a) => a.id === id);
    store.getState().passApplicant(id);
    this.log(
      data ? msg('log.applicant.passed', { name: data.name }) : msg('log.applicant.passedAnon'),
      'info',
    );
    return true;
  }

  /** Turn an applicant into a member on a contract. The one place the roster grows. */
  hire(id: string): boolean {
    const data = APPLICANTS.find((a) => a.id === id);
    if (!data || this.members.some((m) => m.id === id)) return false;
    if (!store.getState().applicants.includes(id)) return false;
    const cost = this.hireCost(id);
    if (!this.chargeHours('hire')) return false;
    if (!store.getState().spend(cost, 'hiring')) {
      this.log(msg('log.applicant.cantAfford', { name: data.name }), 'bad');
      return false;
    }
    store.getState().closeApplicant(id);
    this.joinMember(data);
    this.log(msg('log.hired.full', { name: data.name, hours: WEEKLY_HOURS }), 'good');
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
  pitch(defId: string, offerId?: string, draftTeam: string[] = [], plan?: ProjectPlan): boolean {
    const state = store.getState();
    const def = CATALOG_MAP[defId];
    if (!def || !canBuild(def, state.ownedMachines)) {
      this.log(msg('log.pitch.cantBuild'), 'bad');
      return false;
    }
    // Every project is planned round a table (§4d), so the crew it is planned for has to
    // fit at one the space owns. The wizard never offers a size that does not; the
    // harnesses take the brief's size, capped to what there is.
    const maxSeats = this.maxTableSeats();
    if (maxSeats <= 0) {
      this.log(msg('build.log.noTable'), 'bad');
      return false;
    }
    // What the crew can actually do decides what the design may ask of them (§4c). The
    // wizard never offers a locked option; a plan that arrives with one — the crew changed,
    // or a harness — drops that axis to the best the crew can manage.
    const crewSkills = draftTeam
      .map((id) => this.member(id))
      .filter((m): m is MemberEntity => !!m)
      .map((m) => ({ skills: m.data.skills }));
    const chosen = plan ? { ...plan, design: { ...plan.design } } : defaultPlan(def, maxSeats, crewSkills);
    for (const axis of CATEGORY_AXES[def.category]) {
      let index = Math.round(chosen.design[axis] ?? 1);
      while (index > 0 && !optionAvailable(axis, index, crewSkills)) index -= 1;
      chosen.design[axis] = index;
    }
    if (chosen.seats > maxSeats) {
      this.log(msg('build.log.crewTooBig', { count: chosen.seats }), 'warn');
      return false;
    }
    const summary = planProject(def, chosen, state.ownedMachines);
    if (summary.missing.length) {
      this.log(
        msg('build.log.designNeeds', { machines: summary.missing.map((type) => MACHINE_LABEL[type]).join(' + ') }),
        'warn',
      );
      return false;
    }
    if (!this.chargeHours('pitch')) return false;
    // Licences and tools are paid there and then, like the parts.
    if (summary.tooling > 0 && !state.spend(summary.tooling, 'design')) {
      this.log(msg('build.log.licencesOut', { item: def.name }), 'bad');
      return false;
    }

    const offer = offerId ? state.backlog.find((e) => e.id === offerId) : undefined;
    const entry: BacklogEntry = offer ?? { id: uid('offer'), defId, source: 'catalog' };
    const project = startProject(entry, this.day, chosen, state.ownedMachines);
    project.spent += summary.tooling;

    // Owning a reflow oven takes the misery out of electronics assembly.
    if (state.ownedMachines.includes('reflow') && def.category === 'electronics') {
      project.required.assembly = Math.round(project.required.assembly * 0.75);
    }

    this.projects.push(project);
    this.seeded.delete(project.id);
    if (offer) {
      store.getState().removeOffer(offer.id);
      if (offer.sponsorCash) {
        store.getState().earn(offer.sponsorCash, 'sponsor');
        this.incomeThisMonth += offer.sponsorCash;
        this.log(msg('log.pitch.sponsorPaid', { item: def.name, cash: offer.sponsorCash }), 'good');
      }
      if (offer.proposerId) {
        const member = this.member(offer.proposerId);
        if (member) {
          this.addToTeam(project, member, 1.2);
          this.log(msg('log.pitch.proposerSigned', { member: member.name, item: def.name }), 'good');
        }
      }
    }
    // The order goes in with the pitch: making the player click Order on every single
    // project was busywork, and forgetting it only ever produced a stall, never a decision.
    if (project.bomCost > 0) {
      if (this.placeOrder(project)) {
        this.log(msg('log.pitch.ordered', { item: def.name, cost: def.bomCost, days: def.leadDays }), 'info');
      } else {
        this.log(msg('log.pitch.noCash', { item: def.name, cost: def.bomCost }), 'warn');
      }
    } else {
      this.log(msg('log.pitch.plain', { item: def.name, blurb: def.blurb }), 'info');
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
    this.ownerStopped = false;
    this.player.calibrating = false;
    this.player.project = projectId;
  }

  stopWork() {
    this.ownerStopped = true;
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
      took
        ? msg('log.repitch.took', { project: project.name, count: took })
        : msg('log.repitch.none', { project: project.name }),
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
    if (!this.chargeHours('bounty')) return false;
    if (!store.getState().spend(cost, 'bounties')) {
      this.log(msg('log.bounty.cantAfford'), 'bad');
      return false;
    }
    project.spent += cost;
    project.bounties.push(project.stage);
    for (const m of this.members) {
      m.interest = Math.min(1.4, m.interest + DRIFT.bountyInterest);
      m.clearCooldowns();
    }
    this.log(
      msg('log.bounty.posted', { project: project.name, stage: stageLabel(project.category, project.stage) }),
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
    // No separate affordability test: `spend` refuses only below the overdraft floor, and
    // a project whose parts were never ordered is a project that can never be assembled.
    if (!store.getState().spend(project.bomCost, 'parts')) return false;
    project.spent += project.bomCost;
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
    if (!this.chargeHours('order')) return false;
    if (!this.placeOrder(project)) {
      this.log(msg('log.parts.cantAfford', { project: project.name }), 'bad');
      return false;
    }
    this.log(msg('log.parts.ordered', { project: project.name, days: project.leadDays }), 'info');
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
    if (!this.chargeHours('expedite')) return false;
    if (!store.getState().spend(cost, 'parts')) {
      this.log(msg('log.parts.expediteCantAfford'), 'bad');
      return false;
    }
    project.spent += cost;
    project.partsArriveAt = this.totalHours + remaining * SOURCING.expediteFactor;
    this.log(msg('log.parts.expedited', { project: project.name }), 'good');
    return true;
  }

  skipSimulation(projectId: string) {
    const project = this.project(projectId);
    if (!project || project.stage !== 'simulation') return;
    project.simulationSkipped = true;
    // The risk lives in one multiplier (see `resolveTest`), so skipping multiplies it in.
    project.testRisk = (project.testRisk ?? 1) * TEST.skippedSimPenalty;
    this.setStage(project, 'fabrication', msg('log.stage.simSkipped', { project: project.name }), 'warn');
  }

  queuePart(projectId: string, partId: string) {
    const project = this.project(projectId);
    const part = project?.parts.find((p) => p.id === partId);
    if (!project || !part || part.status === 'done' || part.status === 'queued') return;
    const machine = this.machineFor(part.machineType);
    if (!machine) {
      this.log(msg('log.parts.noMachine', { machine: part.machineType, part: part.name }), 'bad');
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
    if (pending.length) this.log(msg('log.parts.queued', { count: pending.length, project: project.name }));
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

  /** What filling this machine from where it is would cost. */
  refillCost(machineId?: string): number {
    const machine = machineId ? this.machines.find((m) => m.id === machineId) : this.printer;
    if (!machine || machine.consumableMax <= 0) return 0;
    const short = machine.consumableMax - machine.consumable;
    return Math.ceil(short / FILAMENT.spoolGrams) * FILAMENT.spoolCost;
  }

  /**
   * Fill a printer up rather than adding one fixed spool: the larger models hold a stack of
   * them, and topping a four-kilo machine up 1000g at a time is busywork, not a decision.
   */
  buyFilament(machineId?: string): boolean {
    const machine = machineId ? this.machines.find((m) => m.id === machineId) : this.printer;
    if (!machine || machine.consumableMax <= 0) return false;
    const cost = this.refillCost(machine.id);
    if (cost <= 0) return false;
    if (!this.chargeHours('filament')) return false;
    if (!store.getState().spend(cost, 'filament')) {
      this.log(msg('log.filament.cantAfford', { machine: machine.label }), 'bad');
      return false;
    }
    machine.refill(machine.consumableMax);
    this.log(msg('log.filament.loaded', { machine: machine.label }), 'good');
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
        snap.seat = this.seatFor(m);
        snap.share = this.shareFor(m);
        return snap;
      }),
      tables: STATIONS.filter((s) => isTable(s.type)).map(
        (s): TableSnapshot => ({
          id: s.id,
          type: s.type,
          label: s.label,
          seats: seatsOf(s) ?? 0,
          projectId: this.projects.find((p) => p.tableId === s.id)?.id ?? null,
        }),
      ),
      waitingFor: [...this.wanting.values()].reduce<Partial<Record<MachineType, number>>>(
        (out, type) => ({ ...out, [type]: (out[type] ?? 0) + 1 }),
        {},
      ),
      seats: STATIONS.reduce<Partial<Record<MachineType, number>>>(
        (out, s) => ({ ...out, [s.type]: (out[s.type] ?? 0) + (seatsOf(s) ?? 0) }),
        {},
      ),
      machines,
      projects: this.projects.map((p) => structuredClone(p)),
      rivals: this.rivals.map((r) => ({ ...r })),
      season: this.season,
      recruitIn: Math.max(
        0,
        Math.ceil(DIFFICULTY_MAP[store.getState().difficulty].recruitEvery - this.recruitClock),
      ),
      player: (() => {
        const snap = this.player.playerSnapshot();
        const project = this.player.project ? this.project(this.player.project) : null;
        snap.stage = project ? project.stage : null;
        snap.seat = this.seatFor(this.player);
        snap.share = this.shareFor(this.player);
        return snap;
      })(),
    });
  }
}
