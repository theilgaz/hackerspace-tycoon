import { store } from '@/game/store';
import { caseLocale, msg, t, type Message, type MessageKey, type Text } from '@/i18n';
import type {
  BacklogEntry,
  BuyItem,
  MemberData,
  RivalState,
  ScoreRow,
  ShippedRecord,
  MachineSnapshot,
  MachineType,
  ProjectData,
  ProjectDef,
  StageKey,
  TraitKey,
  Tag,
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
  growAmenityPlacements,
  installStation,
  installedStations,
  removedStartingStations,
  removeStation,
  STATION_MAP,
  amenityMoveSafe,
  amenityTileFree,
  propYaw,
  GRID,
  isBlocked,
  leisureSpots,
  wallColumnFree,
  wallColumn,
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
  newAmenityFitsAt,
  newStationFitsAt,
} from '@/machines/layout';
import {
  defaultPlan,
  clampDesign,
  crewLevels,
  forecastBuild,
  planProject,
  qualityHype,
  qualityPay,
  teamFit,
} from '@/utils/design';
import { coolMarket, driftMarket } from '@/utils/market';
import { DILEMMA, DILEMMAS, DILEMMA_MAP, effectCash, effectRep, type DilemmaEffect, type DilemmaMod } from '@/utils/dilemmas';
import { FURNITURE_MAP, UPGRADES, furnitureOf } from '@/utils/furniture';
import { manhattan, sameTile, type Tile } from '@/utils/grid';
import {
  BACKLOG,
  COMFORT,
  DRIFT,
  FAB,
  FILAMENT,
  GHOST_DECAY,
  MACHINE,
  MEMBER,
  LEISURE,
  HOURS_OFF,
  STAGE_ORDER,
  ORDERS,
  PERFECTIONIST_QUALITY_GATE,
  TRAITS,
  APPLICANTS,
  shuffleLadder,
  PLAYER,
  RECRUIT,
  REPEAT,
  SHELVE,
  ROSTER,
  TEAM,
  STAGE_MAP,
  TEST,
  TIME,
  KICKOFF,
  kickoffSeats,
  crewCap,
  TRAIN,
  RESALE,
  AWARDS_COUNTDOWN,
  VERB_HOURS,
  WORKDAY,
  ERAS,
  eraDef,
  type EraDef,
  isLunch,
  isWorkingDay,
  WEEKLY_HOURS,
  PROMO,
} from '@/utils/constants';
import { CATALOG_MAP, canBuild, catalogForEra } from '@/utils/catalog';
import { PRINT_JOBS } from '@/utils/printjobs';
import { AWARDS, RIVAL_MAP, RISING_FLOOR } from '@/utils/rivals';
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
import {
  amenityDef,
  comfortsOf,
  NO_COMFORTS,
  wallPrefer,
  wallWidth,
  type AmenityUse,
  type Comforts,
} from '@/utils/amenities';
import { PRINTER_MAP, PRINTERS, STARTING_PRINTER, resaleValue, type PrinterModel } from '@/utils/printers';
import { categoryAffinity, stageLabel, stageSkill, stageStation } from '@/utils/categories';
import { CALENDAR, awardsDay, clock, gameDate, uid } from '@/utils/format';
import { rng } from '@/utils/rng';
import {
  addWork,
  generateParts,
  partsOutstanding,
  partsPending,
  projectProgress,
  refreshQuality,
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
/** A break at a comfort (§7b). `until` is in total sim-hours, so a break cannot wrap midnight. */
interface Leisure {
  amenityId: string | null;
  kind: AmenityUse['kind'];
  slot: number;
  until: number;
  tile: Tile;
  seat: Seat | null;
  /** The coffee on the way in, which comes before work. */
  arrival: boolean;
  pair: boolean;
  /** Taken because they were worn out, so it lasts until they are not. */
  rest?: boolean;
  /** Sent by the owner for a drink: they drop what they are doing, and it lifts their mood. */
  treat?: boolean;
  /** They got there — a treat only counts once the cup is in hand. */
  served?: boolean;
}
/** The genres a soldering and measurement bench's scope has anything to say about. */
const ELECTRONIC_GENRES: ProjectData['category'][] = ['electronics', 'comms'];
const LEISURE_ALL: AmenityUse['kind'][] = ['drink', 'sit', 'play', 'watch'];
const LEISURE_REST: AmenityUse['kind'][] = ['sit', 'drink', 'watch'];

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
  private yearStart = { day: 1, projects: 0, reputation: 0 };
  private rivalYearStart = new Map<string, { projects: number; reputation: number }>();
  /** Bumped every day so the host can autosave without polling. */
  dayRolled = false;
  /** Machine-hours run since the last bill, for the utilities line. */
  private machineHoursThisMonth = 0;
  /** The last whole hour print orders were staffed (§5): once an hour is plenty. */
  private staffedAt = -1;
  /** The next day a dilemma card is dealt (§7c). */
  private nextDilemmaDay = DILEMMA.every[0];
  /** Multipliers a dilemma left on the space, each until the end of a day. */
  private mods: { mod: DilemmaMod; value: number; until: number }[] = [];
  /** People a dilemma sent home, until the end of a day. */
  private awayUntil = new Map<string, number>();
  /** Grams of filament the printers drew this month; billed on the statement (§5). */
  private filamentThisMonth = 0;
  /** What the work actually brought in since the last bill — payouts and sponsor money. */
  private incomeThisMonth = 0;

  /**
   * You pressed Stop today, so the owner does not pick the next build up on their own until
   * tomorrow. Anything else would override a choice you had just made.
   */
  private ownerStopped = false;

  /** Days of word of mouth banked toward the next person getting in touch (§3c). */
  private recruitClock = 0;

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
  /**
   * Breaks people are taking at the comforts (§7b) — a coffee on the way in, a game of
   * table tennis, a sit on the sofa. `amenityId` null is the kettle by the old sofa, which
   * every space has. Never saved: a break only means anything while somebody is in.
   */
  private leisure = new Map<string, Leisure>();
  /** Who carried on with their break this tick; anybody else has gone and done something. */
  private leisureKept = new Set<string>();
  /** The last comfort each person used, so the next break is somewhere else. */
  private leisureLast = new Map<string, string | null>();
  /**
   * When each person's last break ended. Free time between breaks is spent wandering, so
   * whoever is on the sofa does not simply sit back down on it and the others get a go.
   */
  private leisureEnded = new Map<string, number>();

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
      this.rivalYearStart.set(rival.id, { projects: 0, reputation: 0 });
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

  /** The printer worth standing next to: the one running, else the first on the wall. */
  get printer(): Machine {
    const all = this.machines.filter((m) => m.type === 'fdm');
    return all.find((m) => m.running) ?? all[0];
  }

  /** Owned kit that changes how the machines behave. */
  private applyPerks() {
    const owned = store.getState().ownedMachines;
    const dry = owned.includes('drybox') ? 0.8 : 1;
    for (const machine of this.machines) {
      if (machine.type === 'fdm') machine.failureModifier = dry;
    }
  }

  /**
   * Which machine a part goes to: **the one that would finish it first** — what it has on
   * already plus this part, over its speed — and the more reliable of two that would finish
   * together. An idle H2S takes the job before an idle A1; a small part goes to the A1 only
   * when the H2S is busy enough that it would still be first. It used to be the shortest queue, which sent a two-day print to the
   * slowest printer on the floor because it happened to be empty.
   */
  machineFor(type: MachineType, hours = 0): Machine | undefined {
    const all = this.machines.filter((m) => m.type === type);
    if (all.length <= 1) return all[0];
    const finish = (m: Machine) => {
      const now = m.current ? m.current.hoursRequired - m.current.progress : 0;
      const queued = m.queue.reduce((sum, job) => sum + job.hoursRequired, 0);
      return (now + queued + hours) / Math.max(0.1, m.speed);
    };
    return [...all].sort((a, b) => finish(a) - finish(b) || a.reliability - b.reliability)[0];
  }

  project(id: string): ProjectData | undefined {
    return this.projects.find((p) => p.id === id);
  }

  private log(text: Message, kind: 'info' | 'good' | 'bad' | 'warn' = 'info') {
    store.getState().pushLog(text, kind);
  }

  /** A notification rather than a log line: a toast first, the log once it has gone. */
  private notice(text: Message, kind: 'info' | 'good' | 'bad' | 'warn' = 'info') {
    store.getState().pushNotice(text, kind);
  }

  /**
   * A trait showing itself (§3). **A trait nobody is told about does not exist**: the
   * Perfectionist's gate ran for months as a silent stall on the bench. The first time a
   * trait acts in a run it is a notification; after that it is a log line — unless it
   * changed a build's plan (`always`), which the player needs to hear every time.
   */
  private traitSays(trait: TraitKey, text: Message, always = false) {
    if (store.getState().markTraitSeen(trait) || always) store.getState().pushNotice(text, 'info', 'sparkles');
    else this.log(text, 'info');
  }

  /** Has this build already had this trait moment? Marks it if not. */
  private firstFor(project: ProjectData, note: string): boolean {
    const notes = (project.traitNotes ??= []);
    if (notes.includes(note)) return false;
    notes.push(note);
    return true;
  }

  /**
   * A Scope Creeper on the crew may add a requirement (§3): more work on the stage it lands
   * on, and a better build at the end of it. Once at the kickoff and once
   * on going into Iterate, per build.
   */
  private maybeCreep(project: ProjectData, moment: 'kickoff' | 'iterate', stage: StageKey) {
    // A weekend build has no room for an idea: two days, one person, ship it.
    if (CATALOG_MAP[project.defId]?.tier === 'small') return;
    const creeper = this.members.find((m) => m.team === project.id && m.hasTrait('scopeCreeper'));
    if (!creeper || !this.firstFor(project, `scope:${moment}`)) return;
    if (!rng.chance(TRAITS.scopeCreeper.chance)) return;
    project.required[stage] = Math.round(project.required[stage] * (1 + TRAITS.scopeCreeper.work));
    project.bonus += TRAITS.scopeCreeper.quality;
    refreshQuality(project);
    this.traitSays(
      'scopeCreeper',
      msg('trait.scope.added', {
        member: creeper.name,
        project: project.name,
        idea: msg(`trait.scope.idea.${project.category}.${rng.int(0, 2)}` as MessageKey),
        stage: stageLabel(project.category, stage),
      }),
      true,
    );
  }

  // -------------------------------------------------------------------------
  // Clock
  // -------------------------------------------------------------------------

  /** `dtReal` is real seconds; `speed` is in the sim's own unit (see `TIME.secondsPerHour`). */
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
      this.dripPromos();
      this.checkAwards();
      this.tickStandings();
      this.awardsCountdown();
      store.getState().setMarket(driftMarket(store.getState().market));
      this.checkSolvency();
      this.tickRecruiting();
      this.planDay();
      this.player.startDay();
      this.refreshBacklog();
      this.refreshPrintOffers();
      this.checkOrderDeadlines();
    }

    this.tickMembers(dt);
    this.tickPlayer(dt);
    this.tickRequeue(dt);
    this.tickMachines(dt);
    this.advanceProjects();
    this.maybeDilemma();
    if (Math.floor(this.totalHours) !== this.staffedAt) {
      this.staffedAt = Math.floor(this.totalHours);
      this.staffOrders();
    }

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
  /** The day a Night Owl last said they were staying on — once a night is plenty. */
  private owlNight = -1;

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
        owned
          .map((id) => amenityDef(id))
          .filter((def): def is NonNullable<typeof def> => def?.mount === 'wall')
          .map((def) => ({ id: def.id, width: wallWidth(def), prefer: wallPrefer(def, GRID.width) })),
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

  // -------------------------------------------------------------------------
  // Build mode (§7b): choose a tile first, then pay
  // -------------------------------------------------------------------------

  /** What an item on the Build shelves costs, and its name, for the "buy it?" question. */
  buyQuote(item: BuyItem): { name: string; price: number; upkeep: number } | null {
    if (item.kind === 'furniture') {
      const def = FURNITURE_MAP[item.id];
      return def ? { name: def.name, price: def.price, upkeep: 0 } : null;
    }
    if (item.kind === 'printer') {
      const model = PRINTER_MAP[item.id];
      return model ? { name: model.name, price: model.price, upkeep: 0 } : null;
    }
    const def = amenityDef(item.id);
    return def ? { name: def.name, price: def.price, upkeep: def.upkeep } : null;
  }

  /**
   * Could this be put down on this tile? Asked before anything is paid for, for every tile
   * while an item from the shelves is held, so the legal ones can be lit.
   */
  canPlaceNew(item: BuyItem, x: number, y: number): boolean {
    void this.comforts; // the floor has to know about the comfort bought a moment ago
    const tile = { x, y };
    if (item.kind === 'furniture') {
      const def = FURNITURE_MAP[item.id];
      return !!def && newStationFitsAt(def.type, def.span ?? 1, tile);
    }
    if (item.kind === 'printer') {
      return this.buyablePrinters().length > 0 && newStationFitsAt('fdm', 1, tile);
    }
    const def = amenityDef(item.id);
    if (!def || store.getState().amenities.includes(item.id)) return false;
    // A hung thing goes on the back wall above whatever tile was chosen.
    if (def.mount === 'wall') return x >= 0 && x < GRID.width && y >= 0 && y < GRID.height;
    return newAmenityFitsAt(tile, item.id);
  }

  /**
   * Pay for it and put it where the player chose. The buy itself lands it wherever the room
   * would have; the move to the chosen tile is the same one Build mode's rearranging uses,
   * so a bought desk and a moved desk obey exactly the same rules.
   */
  buyAt(item: BuyItem, x: number, y: number, yaw: number): boolean {
    if (!this.canPlaceNew(item, x, y)) return false;
    const before = new Set(STATIONS.map((s) => s.id));
    let bought = false;
    if (item.kind === 'furniture') bought = this.buyFurniture(item.id);
    else if (item.kind === 'printer') bought = this.buyPrinter(item.id);
    else bought = this.buyAmenity(item.id);
    if (!bought) return false;
    if (item.kind === 'amenity') {
      this.placeAmenity(item.id, x, amenityDef(item.id)?.mount === 'wall' ? 0 : y, yaw);
    } else {
      const station = STATIONS.find((s) => !before.has(s.id));
      if (station) this.placeStation(station.id, x, y, yaw);
    }
    this.publish();
    return true;
  }

  placeAmenity(id: string, x: number, y: number, yaw: number): boolean {
    const def = amenityDef(id);
    const state = store.getState();
    if (!def || !state.amenities.includes(id)) return false;
    // Hung things move along the back wall: the column is what the click chose.
    if (def.mount === 'wall') {
      if (!wallColumnFree(x, id)) return false;
      // Pin everything else where it hangs now. Unpinned items take the next default spot
      // in order, so moving one used to shuffle the rest into the gap it left.
      for (const other of state.amenities) {
        if (other === id || amenityDef(other)?.mount !== 'wall' || state.amenityPlacements[other]) continue;
        const at = wallColumn(other);
        if (at !== undefined) state.placeAmenity(other, { x: at, y: -1, yaw: 0 });
      }
      state.placeAmenity(id, { x, y: -1, yaw: 0 });
      return true;
    }
    if (!amenityTileFree({ x, y }, id) || !amenityMoveSafe(id, { x, y })) return false;
    // A comfort turns to whichever way leaves what it is used from on open floor.
    const turn = propYaw(id, { x, y }, yaw) ?? yaw;
    state.placeAmenity(id, { x, y, yaw: ((turn % 4) + 4) % 4 });
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
    if (def.mount === 'floor' && !amenityRoom(id)) {
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
    // A machine is a capability, and one is all a space needs — the same rule as building
    // the tool twice (`installMachine`). The shelf already shows it as in the space.
    if (FAB_MACHINES.includes(def.type) && stationOfType(def.type)) return false;
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
    const station = installFurniture(def.type, `${def.id}-${uid()}`, def.name, def.span, def.id);
    if (!station) {
      state.earn(def.price, 'kit');
      this.log(msg('build.log.noRoom', { item: def.name }), 'warn');
      return false;
    }
    state.ownMachine(def.type);
    // A bought CNC cuts parts on the clock like a printer, so it needs a queue behind it.
    if (FAB_MACHINES.includes(def.type)) {
      this.machines.push(this.makeMachine(station));
      this.applyPerks();
    }
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
        const before = m.ghostFactor;
        m.ghostFactor *= GHOST_DECAY;
        if (before >= TRAITS.ghost.noticeBelow && m.ghostFactor < TRAITS.ghost.noticeBelow) {
          this.traitSays('ghost', msg('trait.ghost', { member: m.name }), true);
        }
      }
    }
  }

  /**
   * The shelf. Nothing stops you starting a dozen projects, but the ones nobody ever
   * picks up quietly die, and the money you spent on their parts dies with them.
   */
  /** A build that will never ship goes on the record (the Projects panel's Failed tab). */
  private recordFailure(project: ProjectData, reason: 'missed' | 'shelved', rep: number) {
    store.getState().recordFailed({
      id: project.id,
      defId: project.defId,
      name: project.name,
      category: project.category,
      day: this.day,
      startedOnDay: project.startedOnDay,
      reason,
      rep,
      spent: Math.round(project.spent),
      progress: projectProgress(project).ratio,
    });
  }

  private shelveAbandoned() {
    for (const project of [...this.projects]) {
      // A print order is never shelved: it has a due date, and missing that is its failure.
      if (project.order) {
        project.idleDays = 0;
        continue;
      }
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
      for (const machine of this.machines) machine.dropProject(project.id);
      this.projects = this.projects.filter((p) => p.id !== project.id);
      this.seeded.delete(project.id);
      this.recordFailure(project, 'shelved', 0);
      this.log(msg('log.shelved', { project: project.name, days: SHELVE.afterIdleDays }), 'bad');
    }
  }

  /**
   * The rota. Hours come from a contract now, not a dice roll — the only randomness left
   * is whether somebody actually turns up, which is where mood and the Ghost still live.
   */
  private planDay() {
    this.kickoffWatch.clear();
    this.treatedToday.clear();
    const working = isWorkingDay(this.day);
    for (const m of this.members) {
      // Nobody sleeps here: a late one still in at midnight has gone home.
      if (m.present) {
        this.releaseSeat(m.id);
        m.leave();
      }
      if (!working) {
        this.plans.set(m.id, { attending: false, arriveAt: 0, leaveAt: 0 });
        m.leaveAt = 0;
        continue;
      }

      // Sent home by a dilemma (§7c): not in, whatever their mood.
      if ((this.awayUntil.get(m.id) ?? 0) >= this.day) {
        this.plans.set(m.id, { attending: false, arriveAt: 0, leaveAt: 0 });
        m.leaveAt = 0;
        continue;
      }
      const moodFactor = 0.85 + m.data.mood / 400;
      const base = WORKDAY.attendanceBase;
      const attending = rng.chance(Math.min(0.99, Math.max(0.3, base * m.ghostFactor * moodFactor)));

      // **In at nine, out at six, everybody** (§3d) — the owner is the only one who stays late.
      const span = m.span;
      let arriveAt = span.start;
      let leaveAt = span.end;
      // **Now and then somebody stays on**, or opens up at six (§3d) — only with a build
      // to get on with, and a Night Owl far more often. The owner is in from six anyway.
      if (m.team) {
        const owl = m.hasTrait('nightOwl');
        if (rng.chance(owl ? HOURS_OFF.lateOwl : HOURS_OFF.late)) {
          leaveAt = rng.range(HOURS_OFF.lateFrom, HOURS_OFF.lateUntil);
        }
        if (!owl && rng.chance(HOURS_OFF.early)) arriveAt = HOURS_OFF.earlyAt;
      }
      this.plans.set(m.id, { attending, arriveAt, leaveAt });
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
    if (sponsorable.length && rng.chance(BACKLOG.sponsorChance)) {
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
          // Sometimes a coffee — or a tea — before anything else. Never for a crew with a
          // kickoff to hold: they are wanted at the table.
          const kickoff = m.team ? this.project(m.team) : null;
          const meeting = !!kickoff && !kickoff.kickedOff && kickoff.required.concept > 0;
          if (!meeting && rng.chance(LEISURE.arrivalChance) && this.startLeisure(m, ['drink'], true)) {
            this.leisureKept.add(m.id);
          }
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
    // A break nobody carried on with this tick is over: they went to work, to lunch
    // somewhere else, or home.
    for (const id of [...this.leisure.keys()]) if (!this.leisureKept.has(id)) this.endLeisure(id);
    this.leisureKept.clear();

    this.applyWork(dt);
  }

  /**
   * What the furniture adds (§4d variants): the desk somebody is sitting at, or the table a
   * kickoff is being held round. A plain station is 1.
   */
  private deskRate(who: MemberEntity, project: ProjectData): number {
    if (!project.kickedOff && project.tableId) {
      const table = STATION_MAP[project.tableId];
      return (table && furnitureOf(table)?.kickoff) ?? 1;
    }
    const claim = this.claims.get(who.id);
    const station = claim ? STATION_MAP[claim.stationId] : undefined;
    return (station && furnitureOf(station)?.rate) ?? 1;
  }

  /** Energy burned at somebody's desk, against a plain one — the pro chair's one real perk. */
  private deskFatigue(who: MemberEntity): number {
    const claim = this.claims.get(who.id);
    const station = claim ? STATION_MAP[claim.stationId] : undefined;
    return (station && furnitureOf(station)?.fatigue) ?? 1;
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
      // Karma projects hand their assembly to the secondary wing (design §4.1): the drone's
      // boards are put together by whoever knows electronics.
      const secondary = CATALOG_MAP[project.defId]?.secondary;
      const skill = project.stage === 'assembly' && secondary ? secondary : stageSkill(project.category, project.stage);
      let total = 0;
      let craftSum = 0;
      let rateSum = 0;
      const crew = workers.slice(0, MEMBER.maxWorkersPerStage);
      // A Mentor working the build lends everybody else a level, never past their own (§3).
      const mentor = crew.find((m) => m.hasTrait('mentor'));
      const mentorLevel = mentor && skill ? mentor.data.skills[skill] : 0;
      const gatekeeper = this.members.some((m) => m.present && m.hasTrait('gatekeeper'));
      crew.forEach((m, index) => {
        // Each extra pair of hands helps less than the last — eight people around one
        // bench is not eight times the throughput.
        const factor =
          index === 0 ? 1 : MEMBER.extraWorkerFactor * Math.pow(MEMBER.crowdDecay, index - 1);
        const own = skill ? m.data.skills[skill] : 2;
        const boost = mentor && m !== mentor ? Math.max(0, Math.min(TRAITS.mentor.levels, mentorLevel - own)) : 0;
        if (boost && this.firstFor(project, 'mentor')) {
          this.traitSays('mentor', msg('trait.mentor', { member: mentor!.name, project: project.name }));
        }
        // Under a Gatekeeper a novice's work is checked at every step.
        const checked = gatekeeper && own + boost < TRAITS.gatekeeper.noviceBelow ? TRAITS.gatekeeper.noviceRate : 1;
        // A Documenter does the docs — the release stage — without being asked.
        const docs = project.stage === 'release' && m.hasTrait('documenter') ? TRAITS.documenter.releaseRate : 1;
        const rate =
          m.workRate(skill, project.tags, boost) * factor * this.comforts.focus * this.deskRate(m, project) * checked * docs * this.mod('work');
        if (docs > 1 && this.firstFor(project, 'documenter')) {
          project.documented = true;
          this.traitSays('documenter', msg('trait.documenter', { member: m.name, project: project.name }));
        }
        total += rate * dt;
        rateSum += rate;
        // Each person's own share of the stage, for the bar over their head — and of the
        // whole build, for the record of who made it.
        project.contrib[m.id] = (project.contrib[m.id] ?? 0) + rate * dt;
        const effort = (project.effort ??= {});
        effort[m.id] = (effort[m.id] ?? 0) + rate * dt;
        const level = Math.min(5, own + boost);
        const fussy = m.hasTrait('perfectionist') ? TRAITS.perfectionist.craft : 0;
        craftSum += Math.min(1, level / 5 + fussy) * rate;
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
      // Lunch is the hour the comforts earn their floor space: a game, the sofa, a coffee.
      if (this.relax(m, LEISURE_ALL, 'resting')) return;
      m.note = t('note.lunch');
      if (this.atStation(m, 'lounge')) {
        m.activity = 'resting';
      } else if (!m.walking) {
        m.walkTo(stationOfType('lounge')!.stand);
      }
      return;
    }

    // The coffee on the way in is finished before anything else is started.
    if (this.leisure.get(m.id)?.arrival && this.relax(m, ['drink'], 'idle', false)) return;

    if (m.activity === 'resting' || this.leisure.get(m.id)?.rest) {
      this.releaseSeat(m.id);
      if (m.data.energy >= 65) {
        m.activity = 'idle';
        m.note = t('note.backOnIt');
      } else {
        if (this.relax(m, LEISURE_REST, 'resting', true, true)) return;
        if (!m.walking && !this.atStation(m, 'lounge')) m.walkTo(stationOfType('lounge')!.stand);
        return;
      }
    }
    if (m.data.energy < MEMBER.tiredThreshold) {
      this.releaseSeat(m.id);
      m.note = t('note.needsSitDown');
      // A sofa, a bean bag or the nap pod if the space has one; the old sofa if not.
      if (this.relax(m, LEISURE_REST, 'resting', true, true)) return;
      m.activity = 'resting';
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

    // Volunteers still volunteer: an unallocated member may join something themselves —
    // once the game in hand is over. Signing up mid-rally cut every break to a moment.
    const playing = this.leisure.get(m.id);
    const midGame = !!playing && !playing.arrival && this.totalHours < playing.until;
    if (!m.team && !m.training && !midGame) {
      let best: { project: ProjectData; appetite: number } | null = null;
      for (const project of this.joinableProjects()) {
        if (m.isCoolingOff(project.id)) continue;
        const stage = STAGE_MAP[project.stage];
        const match = m.passionMatch(project.tags);
        const proposer = project.proposerId === m.id ? BACKLOG.proposerInterestBonus : 0;
        const appetite = match * (0.45 + stage.appeal * 0.55) + proposer;
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
        // No table yet — the rest of the crew is not in, or every table is taken. They
        // stay put for the meeting rather than wander off or start a game (§4d).
        this.holdOn(m);
        return;
      } else if (this.hasOpenWork(project)) {
        if (this.goToWork(m, project)) return;
      } else {
        this.releaseSeat(m.id);
        m.note = t('note.waiting', { project: project.name });
      }
    } else {
      this.releaseSeat(m.id);
    }

    // A game or a sit-down already going is finished first — fussing over a running printer
    // used to pull people off the table-tennis table the moment they got there.
    if (!m.team && this.leisure.has(m.id) && this.relax(m, LEISURE_ALL, 'idle', false)) return;

    // Nothing to build by hand? Somebody may fuss over the printer instead.
    const printer = this.printer;
    // One person watches a print; a crowd round the printer is the whole crew doing nothing.
    const watched = this.members.some((o) => o !== m && o.present && o.activity === 'babysitting');
    if (printer?.running && !watched) {
      if (this.atStation(m, 'fdm')) {
        m.activity = 'babysitting';
        m.note = t('note.watchingPrint');
      } else if (!m.walking) {
        m.walkTo(printer.def.stand);
      }
      return;
    }

    // **Free time is for people with nothing on.** Somebody on a crew waits for their
    // build — the print, the parts — rather than start a game with a deadline coming.
    if (m.team) {
      this.holdOn(m);
      return;
    }
    if (this.relax(m, LEISURE_ALL, 'idle')) return;

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
    // A big crew kicks off with a quorum (`KICKOFF.quorum`): once the table's chairs are all
    // taken, whoever else turns up gets on with something else rather than standing round it.
    const seated = this.kickoffSeated(project, table);
    if (!seated.includes(who.id) && seated.length >= (seatsOf(table) ?? 0)) return false;
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

  /** Crew sat at the kickoff table right now, in team order. */
  private kickoffSeated(project: ProjectData, table: StationDef): string[] {
    return project.team.filter((id) => {
      const m = this.member(id);
      return !!m && m.present && this.atStand(m, table) && m.activity !== 'resting';
    });
  }

  /**
   * Crew who are not at the table yet — the names the waiting ones are waiting for. Empty
   * once a quorum is sat down: nobody is being waited for any more.
   */
  private kickoffMissing(project: ProjectData): string[] {
    const table = project.tableId ? STATION_MAP[project.tableId] : null;
    if (!table) return [];
    if (this.kickoffSeated(project, table).length >= kickoffSeats(project.team.length)) return [];
    return project.team
      .map((id) => this.member(id))
      .filter((m): m is MemberEntity => !!m)
      .filter((m) => !m.present || !this.atStand(m, table) || m.activity === 'resting')
      .map((m) => m.name);
  }

  /**
   * Is everybody sitting down? The whole crew — or, for a crew bigger than
   * `KICKOFF.quorum`, any five of them — and if nobody has been allocated, you on your own will do. You are never *required*: your hours are yours, and
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
        (s) => isTable(s.type) && !busy.has(s.id) && (seatsOf(s) ?? 0) >= this.tableNeed(project),
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
      const type: MachineType = this.tableNeed(project) > 4 ? 'table-large' : 'table-small';
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
    // By piece, not by kind: a Long Maker Bench is not a Maker Station at half the price.
    const def = furnitureOf(station);
    return { value: Math.round((def?.price ?? 0) * RESALE.share), reason: null };
  }

  /**
   * What a piece of the room can become, and what it costs (§4d): the new piece's price less
   * half the old one's — the garage's kit included, which cannot be sold but can be traded in.
   */
  upgradeOptions(id: string): { to: string; name: string; cost: number; reason: MessageKey | null }[] {
    const station = STATION_MAP[id];
    if (!station || station.type === 'fdm') return [];
    const from = furnitureOf(station);
    if (!from) return [];
    const inUse = this.projects.some((p) => p.tableId === id);
    return (UPGRADES[from.id] ?? []).map((toId) => {
      const to = FURNITURE_MAP[toId];
      const cost = Math.max(0, to.price - Math.round(from.price * RESALE.share));
      const reason: MessageKey | null = inUse ? 'build.sell.inUse' : to.era > store.getState().era ? 'build.upgrade.later' : null;
      return { to: toId, name: to.name, cost, reason };
    });
  }

  /** Trade a piece in for a bigger one, on the same spot when there is room for it. */
  upgradePiece(id: string, toId: string): boolean {
    const option = this.upgradeOptions(id).find((o) => o.to === toId);
    const old = STATION_MAP[id];
    const to = FURNITURE_MAP[toId];
    if (!option || !old || !to) return false;
    if (option.reason) {
      this.log(msg(option.reason), 'warn');
      return false;
    }
    const state = store.getState();
    if (!state.spend(option.cost, 'kit')) {
      this.log(msg('log.amenity.cantAfford', { item: to.name }), 'bad');
      return false;
    }
    const from = { type: old.type, label: old.label, span: old.span, model: old.model, tile: { ...old.tile }, yaw: yawOf(old) };
    for (const [who, claim] of [...this.claims]) if (claim.stationId === id) this.claims.delete(who);
    removeStation(id);
    state.forgetStation(id);
    const station = installFurniture(to.type, `${to.id}-${uid()}`, to.name, to.span, to.id);
    if (!station) {
      // No room anywhere for the bigger one: the old piece goes back where it was.
      const back = installFurniture(from.type, id, from.label, from.span, from.model);
      if (back) this.placeStation(back.id, from.tile.x, from.tile.y, from.yaw);
      state.earn(option.cost, 'kit');
      this.log(msg('build.log.noRoom', { item: to.name }), 'warn');
      this.publish();
      return false;
    }
    // On the old spot when the bigger piece fits there; otherwise where the room found for it.
    if (!this.placeStation(station.id, from.tile.x, from.tile.y, from.yaw)) {
      state.placeStation(station.id, { x: station.tile.x, y: station.tile.y, yaw: yawOf(station) });
    }
    state.setMoving(null);
    this.log(msg('build.log.upgraded', { from: from.label, to: to.name, cost: option.cost }), 'good');
    this.publish();
    return true;
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
    // A machine takes its queue with it: whatever was on it goes back to waiting for one.
    const machine = this.machines.find((m) => m.id === id);
    if (machine) {
      for (const job of [...machine.queue, ...(machine.current ? [machine.current] : [])]) {
        const part = this.project(job.projectId)?.parts.find((p) => p.id === job.partId);
        if (part) part.status = 'pending';
      }
      this.machines.splice(this.machines.indexOf(machine), 1);
    }
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
  /**
   * Chairs a kickoff books: the crew, and you only when you *are* the crew. Counting you
   * on top broke every full table — four on a crew plus you is five, the garage's table
   * seats four, no table ever qualified and the meeting simply never happened. You are
   * never required at a kickoff (see `kickoffReady`), so you are never what sizes it.
   */
  private tableNeed(project: ProjectData): number {
    return kickoffSeats(project.team.length);
  }

  /** Is there a chair for you at this kickoff, if you are on it? */
  ownerFits(project: ProjectData): boolean {
    if (!project.team.length) return true;
    const table = project.tableId ? STATION_MAP[project.tableId] : null;
    const seats = table ? (seatsOf(table) ?? 0) : this.maxTableSeats();
    return seats > project.team.length;
  }

  /** Is everybody on it actually here today? You on your own count if nobody else is on it. */
  private crewInBuilding(project: ProjectData): boolean {
    if (!project.team.length) return this.player.project === project.id && this.player.present;
    const here = project.team.filter((id) => this.member(id)?.present).length;
    return here >= kickoffSeats(project.team.length);
  }

  /** Where somebody is sitting right now, for the renderer. Null when they are not seated. */
  private seatFor(who: MemberEntity): Seat | null {
    if (who.walking || !who.present) return null;
    const spell = this.leisure.get(who.id);
    if (spell) return spell.seat && sameTile(who.tile, spell.tile) ? spell.seat : null;
    if (who.activity !== 'working' && who.activity !== 'waiting') return null;
    const projectId = who === this.player ? this.player.project : who.team;
    const project = projectId ? this.project(projectId) : null;
    if (project && !project.kickedOff && project.tableId) {
      const table = STATION_MAP[project.tableId];
      if (table && this.atStand(who, table)) {
        // Chairs go to whoever is at the table, so a quorum of a big crew fills the first ones.
        const order = [...this.kickoffSeated(project, table), 'player'];
        return seatPosition(table, Math.max(0, order.indexOf(who.id)));
      }
    }
    const claim = this.claims.get(who.id);
    const station = claim ? STATION_MAP[claim.stationId] : null;
    if (claim && station && this.atStand(who, station)) return seatPosition(station, claim.seat);
    return null;
  }

  /**
   * Waiting on your own build: stay where you are, or step off the floor's working tiles
   * once, and do nothing else. The note has already said what they are waiting for.
   */
  private holdOn(m: MemberEntity) {
    if (m.walking) return;
    m.activity = 'idle';
    const onStand = STATIONS.some((s) => sameTile(s.stand, m.tile) && !this.claims.has(m.id));
    if (onStand || sameTile(m.tile, DOOR)) m.walkTo(rng.pick(IDLE_TILES));
  }

  // -------------------------------------------------------------------------
  // Breaks (§7b): the comforts are used, not just owned
  // -------------------------------------------------------------------------

  /**
   * Go and take a break somewhere, or carry on with the one already going. Returns false
   * when there is nowhere to go, so the caller falls back to what it did before comforts
   * were usable. `fresh` false only finishes a break — the coffee on the way in must not
   * turn into a second one.
   */
  private relax(
    m: MemberEntity,
    kinds: AmenityUse['kind'][],
    activity: 'idle' | 'resting',
    fresh = true,
    rest = false,
  ): boolean {
    let spell = this.leisure.get(m.id);
    if (spell && (this.totalHours >= spell.until || !kinds.includes(spell.kind))) {
      this.endLeisure(m.id);
      spell = undefined;
    }
    if (!spell) {
      if (!fresh) return false;
      // Worn out or at lunch, straight to a seat; otherwise a wander first.
      if (activity === 'idle' && this.totalHours - (this.leisureEnded.get(m.id) ?? -Infinity) < LEISURE.between) {
        return false;
      }
      spell = this.startLeisure(m, kinds) ?? undefined;
      if (!spell) return false;
    }
    spell.rest = rest;
    this.leisureKept.add(m.id);
    m.note = this.leisureNote(m.id, spell);
    if (!sameTile(m.tile, spell.tile)) {
      const heading = m.destination;
      if (!heading || !sameTile(heading, spell.tile)) m.walkTo(spell.tile);
      if (!m.walking) {
        // Nobody can get next to it from here; try somewhere else next tick.
        this.leisureKept.delete(m.id);
        this.endLeisure(m.id);
        return false;
      }
      return true;
    }
    m.activity = activity;
    spell.served = true;
    return true;
  }

  /**
   * Who has been sent to which comfort today, cleared every morning. **Once a comfort, not
   * once a day**: a single daily treat meant a Club-Mate at ten used up the table tennis at
   * four, and the picker said "had a break today" to a question about a different thing.
   */
  private treatedToday = new Map<string, Set<string>>();

  /**
   * Send somebody for a tea (§7b): they put down what they are doing, go to this comfort,
   * and come back in a better mood. The owner's gesture, not a policy — once a person a
   * comfort a day.
   */
  /**
   * Send people to a comfort (§7b): a drink, the sofa, the console, a game of table tennis.
   * Table tennis takes exactly two — nobody plays on their own — the console one or two, and
   * anything else as many as it has room for. They drop what they are doing, and come back
   * in a better mood with a bit more in the tank. Once a person a day.
   */
  treat(memberIds: string[], amenityId: string): boolean {
    const def = amenityDef(amenityId);
    const use = def?.use;
    if (!def || !use || !store.getState().amenities.includes(amenityId)) return false;
    const people = [...new Set(memberIds)].map((id) => this.member(id)).filter((m): m is MemberEntity => !!m && m.present);
    const spots = leisureSpots(amenityId);
    const busy = new Set([...this.leisure.values()].filter((o) => o.amenityId === amenityId).map((o) => o.slot));
    const free = spots.map((_, i) => i).filter((i) => !busy.has(i));
    const need = use.pair ? use.spots.length : 1;
    if (people.length < need || people.length > use.spots.length) return false;
    // A place to stand at each end — against a wall, one end of the table is nobody's.
    if (spots.length < people.length) {
      this.log(msg('build.log.treatNoRoom', { item: def.name }), 'warn');
      return false;
    }
    if (free.length < people.length) {
      this.log(msg('build.log.treatBusy', { item: def.name }), 'warn');
      return false;
    }
    const again = people.find((m) => this.treatedToday.get(m.id)?.has(amenityId));
    if (again) {
      this.log(msg('build.log.treatAgain', { member: again.name }), 'warn');
      return false;
    }
    const until = this.totalHours + rng.range(...(use.kind === 'drink' ? LEISURE.arrivalHours : use.hours));
    people.forEach((m, i) => {
      this.releaseSeat(m.id);
      this.endLeisure(m.id);
      const slot = free[i];
      this.leisure.set(m.id, {
        amenityId,
        kind: use.kind,
        slot,
        until,
        tile: spots[slot].tile,
        seat: spots[slot].seat,
        // A treat takes priority the way the coffee on the way in does.
        arrival: true,
        pair: !!use.pair,
        treat: true,
      });
      this.leisureKept.add(m.id);
      this.treatedToday.set(m.id, (this.treatedToday.get(m.id) ?? new Set()).add(amenityId));
    });
    this.log(
      msg('build.log.treatSent', { member: people.map((m) => m.name).join(' & '), item: def.name }),
      'info',
    );
    this.publish();
    return true;
  }

  /** Pick a comfort with a free spot and claim it. Somebody waiting for a partner wins. */
  private startLeisure(m: MemberEntity, kinds: AmenityUse['kind'][], arrival = false): Leisure | null {
    this.endLeisure(m.id);
    const now = this.totalHours;
    const taken = new Map<string, Set<number>>();
    for (const spell of this.leisure.values()) {
      if (!spell.amenityId) continue;
      if (!taken.has(spell.amenityId)) taken.set(spell.amenityId, new Set());
      taken.get(spell.amenityId)!.add(spell.slot);
    }
    const last = this.leisureLast.get(m.id);
    const options: { id: string; slot: number; weight: number; use: AmenityUse }[] = [];
    for (const id of store.getState().amenities) {
      const use = amenityDef(id)?.use;
      if (!use || !kinds.includes(use.kind)) continue;
      const spots = leisureSpots(id);
      if (!spots.length) continue;
      const busy = taken.get(id) ?? new Set<number>();
      const slot = spots.findIndex((_, i) => !busy.has(i));
      if (slot < 0) continue;
      // A partner already waiting at the table is the best offer in the room.
      let weight = use.pair ? (busy.size ? LEISURE.partnerPull : LEISURE.emptyTable) : 1;
      if (id === last) weight *= LEISURE.sameAgain;
      options.push({ id, slot, weight, use });
    }
    let spell: Leisure | null = null;
    if (options.length) {
      let roll = rng.float() * options.reduce((n, o) => n + o.weight, 0);
      const pick = options.find((o) => (roll -= o.weight) < 0) ?? options[options.length - 1];
      const spot = leisureSpots(pick.id)[pick.slot];
      const [low, high] = arrival ? LEISURE.arrivalHours : pick.use.hours;
      const partners = [...this.leisure.values()].filter((o) => o.amenityId === pick.id);
      let until = now + rng.range(low, high);
      if (pick.use.pair) {
        if (!partners.length) {
          until = now + LEISURE.partnerWait; // nobody comes, they go and do something else
        } else {
          for (const other of partners) other.until = until; // the game starts, and ends together
        }
      }
      spell = { amenityId: pick.id, kind: pick.use.kind, slot: pick.slot, until, tile: spot.tile, seat: spot.seat, arrival, pair: !!pick.use.pair };
    } else if (arrival) {
      // No coffee machine yet, or somebody is at it: the kettle by the old sofa. Standing
      // about on its tile is what the crowd spots are for.
      const lounge = stationOfType('lounge');
      if (!lounge) return null;
      spell = { amenityId: null, kind: 'drink', slot: 0, until: now + rng.range(...LEISURE.arrivalHours), tile: lounge.stand, seat: null, arrival, pair: false };
    }
    if (!spell) return null;
    this.leisure.set(m.id, spell);
    this.leisureLast.set(m.id, spell.amenityId);
    return spell;
  }

  private endLeisure(id: string) {
    const spell = this.leisure.get(id);
    if (!spell) return;
    this.leisure.delete(id);
    if (!spell.arrival) this.leisureEnded.set(id, this.totalHours);
    if (spell.treat && spell.served) {
      const who = this.member(id);
      if (who) {
        who.data.mood = Math.min(100, who.data.mood + LEISURE.treatMood);
        who.data.energy = Math.min(100, who.data.energy + LEISURE.treatEnergy);
        this.log(msg(spell.kind === 'drink' ? 'build.log.treatDone' : 'build.log.treatDoneBreak', { member: who.name }), 'good');
      }
    }
    // Finished with nothing else to go to: up and about, rather than standing at the fridge
    // under a line that says they are still at it.
    const who = this.member(id);
    if (who?.present && who.activity === 'idle' && !who.walking) {
      who.note = t('note.hangingAround');
      who.walkTo(rng.pick(IDLE_TILES));
    }
    // Table tennis on your own is not a game: whoever is left goes and does something else.
    if (spell.pair) {
      for (const other of this.leisure.values()) {
        if (other.amenityId === spell.amenityId) other.until = Math.min(other.until, this.totalHours);
      }
    }
  }

  /** The line under their name while they are on a break. */
  private leisureNote(id: string, spell: Leisure): string {
    if (!spell.amenityId) return t('build.note.makingTea');
    const def = amenityDef(spell.amenityId)!;
    const partner = [...this.leisure.entries()].find(
      ([other, o]) => other !== id && o.amenityId === spell.amenityId,
    )?.[0];
    const name = partner ? (this.member(partner)?.name ?? '') : '';
    if (spell.kind === 'drink') {
      if (def.shape === 'teamaker') return t('build.note.pouringTea');
      return def.shape === 'coffee' || def.shape === 'espresso'
        ? t('build.note.makingCoffee')
        : t('build.note.grabbingDrink', { thing: def.name });
    }
    if (spell.pair) return name ? t('build.note.playingWith', { thing: def.name, partner: name }) : t('build.note.lookingForPartner', { thing: def.name });
    if (name && spell.kind === 'play') return t('build.note.playingWith', { thing: def.name, partner: name });
    return t('build.note.onBreak', { thing: def.name });
  }

  /**
   * Where people standing on somebody else's tile are drawn instead. The lounge, the printer
   * and the idle tiles are single tiles the whole crew walks to, and a crowd on one tile
   * renders as one person. **This is a drawing position, like a seat** — the first to
   * arrive keeps the tile, the rest are shown on the nearest free floor, and the sim
   * never moves them, so no path, timing or balance number changes.
   */
  private crowdSpots(): Map<string, { x: number; y: number }> {
    const out = new Map<string, { x: number; y: number }>();
    const standing: { id: string; tile: { x: number; y: number } }[] = [];
    const taken = new Set<string>();
    const key = (x: number, y: number) => `${x},${y}`;
    const everyone: [string, MemberEntity][] = [
      ...this.members.map((m): [string, MemberEntity] => [m.id, m]),
      ['player', this.player],
    ];
    for (const [id, who] of everyone) {
      if (!who.present) continue;
      taken.add(key(who.tile.x, who.tile.y));
      if (who.walking || this.seatFor(who)) continue;
      standing.push({ id, tile: who.tile });
    }
    const stands = new Set(STATIONS.map((s) => key(s.stand.x, s.stand.y)));
    const holder = new Set<string>();
    // Stable order, so nobody swaps places from one frame to the next.
    standing.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const { id, tile } of standing) {
      const here = key(tile.x, tile.y);
      if (!holder.has(here)) {
        holder.add(here);
        continue;
      }
      let best: { x: number; y: number; score: number } | null = null;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = tile.x + dx;
          const y = tile.y + dy;
          if (x < 0 || y < 0 || x >= GRID.width || y >= GRID.height) continue;
          if (taken.has(key(x, y)) || isBlocked({ x, y })) continue;
          if (x === DOOR.x && y === DOOR.y) continue;
          // Nearest first, and off somebody's workstation stand where there is a choice.
          const score = Math.hypot(dx, dy) + (stands.has(key(x, y)) ? 1.5 : 0);
          if (!best || score < best.score) best = { x, y, score };
        }
      }
      if (!best) continue;
      taken.add(key(best.x, best.y));
      out.set(id, { x: best.x, y: best.y });
    }
    return out;
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
        m.data.energy = Math.max(0, m.data.energy - MEMBER.energyDrain * comfort.fatigue * this.deskFatigue(m) * dt);
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
        printer.operatorSkill = Math.max(printer.operatorSkill, m.data.skills.mechanical);
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
    if (!p.project && !this.ownerStopped) {
      // Never into somebody else's kickoff: a crew that has not sat down yet was planned
      // for its own chairs, and one more at a full table is a meeting that never starts.
      // Never a build with no hand work left in it — a series print is the printer's job.
      const handsWanted = (x: ProjectData) => STAGE_ORDER.some((k) => x.required[k] > (x.progress[k] ?? 0));
      const next =
        this.projects.find((x) => !x.shipped && x.kickedOff && handsWanted(x)) ??
        this.projects.find((x) => !x.shipped && !x.team.length && handsWanted(x));
      if (next) {
        p.project = next.id;
        this.log(msg('build.log.ownerPicksUp', { project: next.name }), 'info');
      }
    }

    if (p.project) {
      const project = this.project(p.project)!;
      // True when a kickoff or a seat has already said why you are standing about; the
      // generic "nothing to do by hand" line must not paper over it.
      let explained = false;
      if (!project.kickedOff && project.required.concept > 0 && !this.ownerFits(project)) {
        // No chair for you: the crew plans without you rather than not at all, and the
        // bench says so. Blocking the meeting on the one person who is never required
        // would be the game punishing you for joining in.
        this.releaseSeat(p.id);
        p.note = t('build.note.noChair', { project: project.name });
        explained = true;
      } else if (!project.kickedOff && project.required.concept > 0) {
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
      // Nothing to do by hand right now — stay on the project and wait it out, off the
      // tile in front of somebody's desk rather than standing inside its chair.
      if (!p.walking) {
        p.activity = 'idle';
        if (!explained) p.note = t('note.nothingByHand', { project: project.name });
        if (!this.claims.has(p.id) && STATIONS.some((st) => sameTile(st.stand, p.tile))) p.walkTo(rng.pick(IDLE_TILES));
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
      // No point queueing when there is no machine to print it on.
      if (pending.every((p) => !this.machineFor(p.machineType))) continue;
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
    // Who is keeping an eye on the printers (§3): a Gatekeeper in the building, a Night Owl
    // in after hours.
    const gatekeeper = this.members.find((m) => m.present && m.hasTrait('gatekeeper'));
    const afterHours = this.time < WORKDAY.start || this.time >= WORKDAY.end;
    const owl = afterHours ? this.members.find((m) => m.present && m.hasTrait('nightOwl')) : undefined;
    const watch = (gatekeeper ? TRAITS.gatekeeper.printFail : 1) * (owl ? TRAITS.nightOwl.printFail : 1);
    const printing = this.machines.some((m) => m.running);
    if (printing && gatekeeper && !store.getState().traitsSeen?.includes('gatekeeper')) {
      this.traitSays('gatekeeper', msg('trait.gatekeeper', { member: gatekeeper.name }));
    }
    // Once a night, and only with something on the bed to watch.
    if (printing && owl && this.owlNight !== this.day) {
      this.owlNight = this.day;
      this.traitSays('nightOwl', msg('trait.nightOwl', { member: owl.name }));
    }
    for (const machine of this.machines) {
      machine.watch = watch;
      const operated = this.members.some(
        (m) => m.present && m.activity === 'babysitting' && this.atStation(m, machine.type),
      );
      if (!operated) machine.operatorSkill = 0;

      // A dilemma may have stopped the printers for a few days (§7c): the job waits on the bed.
      if (machine.type === 'fdm' && this.mod('printers') === 0) continue;
      if (machine.running) this.machineHoursThisMonth += dt * this.mod('power');
      const result = machine.tick(dt);
      this.filamentThisMonth += machine.filamentUsed * this.mod('filament');
      machine.filamentUsed = 0;
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
      // A measurement bench in the space catches the electronics faults before the test does.
      const scope = ELECTRONIC_GENRES.includes(project.category)
        ? Math.min(1, ...STATIONS.map((s) => furnitureOf(s)?.testRisk ?? 1))
        : 1;
      const outcome = resolveTest(project, scope);
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
        this.maybeCreep(project, 'iterate', 'iterate');
      }
      return;
    }

    // A hand stage with no hand work in it is done the moment it starts — a series print
    // (STL supplied) goes straight from the files to the printer and out of the door.
    const nothingToDo = project.required[stage] === 0 && STAGE_MAP[stage].skill !== null;
    if (!nothingToDo && !stageComplete(project)) return;

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
      const stageName = stageLabel(project.category, stage);
      // **Not for ever.** A crew that cannot reach the bar would otherwise stall the build
      // for good; once the stage has had half as much work again, they give in.
      if (project.progress[stage] < project.required[stage] * TRAITS.perfectionist.relentAfter) {
        blocker.note = t('note.notSigningOff');
        if (this.firstFor(project, `perfectionist:${stage}`)) {
          this.traitSays(
            'perfectionist',
            msg('trait.perfectionist.hold', {
              member: blocker.name,
              project: project.name,
              stage: stageName,
              quality: project.quality,
              gate: PERFECTIONIST_QUALITY_GATE,
            }),
            // A weekend build held up for an hour is a log line; a real build held is news.
            CATALOG_MAP[project.defId]?.tier !== 'small',
          );
        }
        return;
      }
      if (this.firstFor(project, `relent:${stage}`)) {
        this.log(msg('trait.perfectionist.relent', { member: blocker.name, project: project.name, stage: stageName }), 'warn');
      }
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
    if (project.order) {
      // Nothing to plan on a print order: straight to the files.
      project.kickedOff = true;
      this.setStage(project, 'cad', null);
      return;
    }
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
    this.maybeCreep(project, 'kickoff', 'cad');
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
    // Whatever of it is still on a printer goes too — a shipped build printing on for ever
    // was what `ship all` in the console showed.
    for (const machine of this.machines) machine.dropProject(project.id);
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

    // An own project is new every time it has a new name; a brief is the same brief again.
    const built = store.getState().shipped.filter(
      (r) => r.defId === project.defId && (!def.custom || r.name === project.name),
    ).length;
    const novelty = Math.max(REPEAT.floor, REPEAT.falloff ** built);
    // What it is worth now (§4d): the brief's price, what the market wants this week, how
    // well it was designed for that market, and how good it actually turned out.
    const demand = store.getState().market[project.category] ?? 1;
    const appeal = project.appeal ?? 1;
    // A print order pays what was agreed — no market, no novelty, no design appeal.
    const payout = project.order
      ? project.order.pay
      : Math.round(def.payout * novelty * demand * appeal * qualityPay(project.quality));
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
    const hype = project.order
      ? def.hype
      : Math.round(
          def.hype * novelty * Math.sqrt(appeal) * qualityHype(project.quality) *
            (project.documented ? 1 + TRAITS.documenter.hype : 1),
        );
    // The market has one fewer thing to want. Somebody else's print order is not ours.
    if (!project.order) store.getState().setMarket(coolMarket(store.getState().market, project.category));
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
      forecast: project.forecast,
      order: !!project.order,
    });
    // **The report is a moment, so it is not every moment.** A bigger build opens it over the
    // room, and so does the very first ship of the run, so the player meets it; a weekend
    // build is a log line, with the same report on its page in Projects. The autoplayer ships
    // one and a half small builds a day — a popup for each would be the whole game.
    const shipped = store.getState().shipped;
    if (!project.order && (def.tier !== 'small' || shipped.filter((r) => !r.order).length === 1)) {
      store.getState().setShipReport(project.id);
    }
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

  /** A printer's physical character — speed, and how often it lets you down. */
  private makeMachine(def: StationDef): Machine {
    if (def.type !== 'fdm') return new Machine(def);
    const model = PRINTER_MAP[def.model ?? STARTING_PRINTER.id] ?? STARTING_PRINTER;
    return new Machine(def, { speed: model.speed, reliability: model.reliability });
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

  /**
   * The floor grows with the lease, **and the room you arranged comes with it** (§8): what
   * was against the right-hand or bottom edge stays against it, the rest keeps its tile
   * (`grownOffset`), and the result is saved as the arrangement for the player to change.
   * Comforts placed by hand follow the same rule; the rest are re-derived on the new edges.
   */
  private growInto(era: number) {
    const from = { width: GRID.width, height: GRID.height };
    const placements = applyEraLayout(era, true);
    const state = store.getState();
    store.setState({
      stationPlacements: placements,
      amenityPlacements: growAmenityPlacements(state.amenityPlacements, from),
      amenityRev: state.amenityRev + 1,
    });
    this.amenityRev = -1;
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
    this.growInto(next.era);
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
      this.growInto(next);
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
      filamentThisMonth: this.filamentThisMonth,
      nextDilemmaDay: this.nextDilemmaDay,
      mods: this.mods.map((m) => ({ ...m })),
      awayUntil: [...this.awayUntil.entries()],
      incomeThisMonth: this.incomeThisMonth,
      recruitClock: this.recruitClock,
      recentShip: this.recentShip ? { ...this.recentShip, tags: [...this.recentShip.tags] } : null,
      seeded: [...this.seeded],
      requeueTimers: [...this.requeueTimers],
      rivals: this.rivals.map((r) => ({ ...r })),
      projects: this.projects.map((p) => structuredClone(p)),
      installedStations: installedStations(),
      removedKit: removedStartingStations(),
      members: this.members.map((m) => ({
        id: m.id,
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
        present: this.player.present,
        tile: { ...this.player.tile },
      },
      machines: this.machines.map((machine) => ({
        id: machine.id,
        type: machine.type,
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
    this.yearStart = { day: data.yearStart.day, projects: data.yearStart.projects, reputation: data.yearStart.reputation };
    this.rivalYearStart = new Map(
      data.rivalYearStart.map(([id, since]) => [id, { projects: since.projects, reputation: since.reputation }] as const),
    );
    this.machineHoursThisMonth = data.machineHoursThisMonth;
    this.filamentThisMonth = data.filamentThisMonth ?? 0;
    // Older files had no dilemmas: the first one is a fortnight from the day they load.
    this.nextDilemmaDay = data.nextDilemmaDay ?? this.day + DILEMMA.every[0];
    this.mods = (data.mods ?? []).map((m) => ({ ...m }));
    this.awayUntil = new Map(data.awayUntil ?? []);
    this.incomeThisMonth = data.incomeThisMonth;
    this.seeded = new Set(data.seeded);
    this.requeueTimers = new Map(data.requeueTimers);
    this.rivals = data.rivals.map((rival) => ({
      ...rival,
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
        ? installFurniture(station.type, station.id, station.label ?? MACHINE_LABEL[station.type], station.span ?? 1, station.model)
        : installStation(station.type, station.id, station.model, station.label);
      if (def && FAB_MACHINES.includes(station.type)) this.machines.push(this.makeMachine(def));
    }
    // The kit that was traded in or sold stays gone: the layout above put all of it back.
    for (const id of data.removedKit ?? []) {
      removeStation(id);
      this.machines = this.machines.filter((m) => m.id !== id);
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
    if (player.present) this.player.arrive(player.tile);

    for (const saved of data.machines) {
      const machine = this.machines.find((m) => m.id === saved.id);
      if (!machine) continue;
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
   * passion match is usually declined, and a refusal sticks for a while.
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
    const chance = Math.min(0.97, TEAM.acceptBase + match * TEAM.acceptFromPassion);
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
    // A new run's first card is a couple of weeks in, and nothing from a last run lingers.
    this.nextDilemmaDay = this.day + rng.int(DILEMMA.every[0], DILEMMA.every[1]);
    this.mods = [];
    this.awayUntil.clear();
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

  /** The month's filament at the spool price: bought as it is used, never stocked (§5). */
  private filamentCost(): number {
    return Math.round((this.filamentThisMonth / FILAMENT.spoolGrams) * FILAMENT.spoolCost);
  }

  /** Paying members of the public — the passive income a reputation earns you. */
  get membership(): number {
    return membershipFor(store.getState().reputation, store.getState().era);
  }

  /** What the next bill will look like if nothing changes. */
  previewBill(): { income: number; costs: number; net: number; dueInDays: number } {
    // Preview is cash movement only — project money is banked as it arrives.
    const state = store.getState();
    const rent = rentFor(state.era);
    const utilities = Math.round(this.machineHoursThisMonth * ECONOMY.utilityPerMachineHour);
    const upkeep = this.comforts.upkeep;
    const filament = this.filamentCost();
    const dues = this.members.length * ECONOMY.crewDues + this.membership * ECONOMY.duesPerMember;
    return {
      income: dues,
      costs: rent + utilities + upkeep + filament,
      net: dues - rent - utilities - upkeep - filament,
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
    const filament = this.filamentCost();

    // Only dues and the running costs move cash at the bill; everything else was banked or
    // paid as it happened, and the ledger kept count of it.
    const balanceBefore = state.cash;
    const balanceAfter = balanceBefore + crewDues + communityDues - rent - utilities - upkeep - filament;
    const shortfall = Math.max(0, -balanceAfter);
    const opening = state.monthOpen;
    const ledger: Ledger = {
      ...state.ledger,
      crewDues,
      communityDues,
      rent: -rent,
      power: -utilities,
      comforts: -upkeep,
      filament: (state.ledger.filament ?? 0) - filament,
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
      filament: msg('bill.filamentDetail', { kilos: Math.round(this.filamentThisMonth / 100) / 10 }),
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
      const isIncome = kind === 'other' || kind === 'events' ? amount > 0 : INCOME_KINDS.includes(kind);
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
    this.filamentThisMonth = 0;
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
      player: store.getState().reputation,
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

  /**
   * Builds shipped, **print orders not counted** — they are a client's file on the printer,
   * and counted in they handed the player Most Projects on volume alone.
   */
  private projectsShipped(): number {
    return store.getState().shipped.filter((r) => !r.order).length;
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
      const since = this.rivalYearStart.get(rival.id) ?? { projects: 0, reputation: 0 };
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
        bestBuild: rival.bestBuild ? { ...rival.bestBuild } : null,
        isPlayer: false,
      };
    });
    rows.push({
      id: 'player',
      name: state.identity?.name ?? 'Your space',
      icon: state.identity?.icon ?? 'wrench',
      colour: state.identity?.colour ?? '#5ecfc0',
      projects: this.projectsShipped(),
      projectsThisYear: Math.max(0, this.projectsShipped() - this.yearStart.projects),
      members: this.members.length + 1, // you count
      cash: state.cash,
      reputation: state.reputation,
      reputationThisYear: state.reputation - this.yearStart.reputation,
      growthThisYear: growth(state.reputation - this.yearStart.reputation, this.yearStart.reputation),
      bestBuild: best ? { name: best.name, score: best.hype } : null,
      isPlayer: true,
    });
    return rows.sort((a, b) => b.reputation - a.reputation);
  }

  /** Everybody's place on the table, by reputation — the order the standings are read in. */
  private ranks(): Record<string, number> {
    return Object.fromEntries(this.scoreboard().map((row, index) => [row.id, index + 1]));
  }

  /**
   * The month's standings, for the arrows (§3c). On the bill day the table is photographed,
   * and the Ranking panel's arrows measure everybody against that photograph, so they move
   * as the month does. Where you went is said in the log once a month — every overtaking as
   * it happened would be a line a day.
   */
  private tickStandings() {
    const state = store.getState();
    const now = this.ranks();
    if (!Object.keys(state.rankPrev).length) {
      state.setRankPrev(now);
      return;
    }
    if ((this.day - 1) % ECONOMY.billEvery !== 0 || this.day === 1) return;
    const was = state.rankPrev.player;
    const is = now.player;
    if (was && is && was !== is) {
      // Who you passed, or who passed you: whoever stands where you used to.
      const other = Object.entries(now).find(([id, rank]) => id !== 'player' && rank === was)?.[0];
      this.log(
        msg(is < was ? 'log.rank.up' : 'log.rank.down', {
          from: was,
          to: is,
          space: other ? (RIVAL_MAP[other]?.name ?? other) : '',
        }),
        is < was ? 'good' : 'warn',
      );
    }
    state.setRankPrev(now);
  }

  /**
   * The run-up to awards night, a line at a time (`AWARDS_COUNTDOWN`). It says how the race
   * stands rather than only the date: what you lead, and the category you are closest to
   * taking off somebody — the one worth the next few weeks.
   */
  private awardsCountdown() {
    const { length, dayOfYear } = this.season;
    const days = length - dayOfYear;
    if (!AWARDS_COUNTDOWN.includes(days)) return;
    const rows = this.scoreboard();
    const me = rows.find((row) => row.isPlayer);
    const rivals = rows.filter((row) => !row.isPlayer);
    if (!me || !rivals.length) return;
    const leading: string[] = [];
    let race: { label: string; rival: string; ratio: number } | null = null;
    for (const award of AWARDS) {
      const mine = award.value(me);
      const best = rivals.reduce((top, row) => (award.value(row) > award.value(top) ? row : top));
      const theirs = award.value(best);
      if (mine > 0 && mine >= theirs) leading.push(award.label);
      else if (theirs > 0) {
        const ratio = Math.max(0, mine) / theirs;
        if (!race || ratio > race.ratio) race = { label: award.label, rival: best.name, ratio };
      }
    }
    this.notice(
      msg('log.awards.countdown', {
        days,
        leading: leading.join(', '),
        race: race?.label ?? '',
        rival: race?.rival ?? '',
      }),
      days <= 5 ? 'warn' : 'info',
    );
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
      projects: this.projectsShipped(),
      reputation: state.reputation,
    };
    for (const rival of this.rivals) {
      this.rivalYearStart.set(rival.id, {
        projects: rival.projects,
        reputation: rival.reputation,
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
    // The comforts are what people hear about when they ask around: they buy days here.
    const gain = this.comforts.draw;
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

  /** §5 — what you just shipped is what the next person through the door cared about. */
  private recruit(project: ProjectData) {
    this.recentShip = { tags: [...project.tags], name: project.name, day: this.day };
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
  pitch(defId: string, offerId?: string, draftTeam: string[] = [], plan?: ProjectPlan, name?: string): boolean {
    const state = store.getState();
    const def = CATALOG_MAP[defId];
    if (!def || !canBuild(def, state.ownedMachines)) {
      this.log(msg('log.pitch.cantBuild'), 'bad');
      return false;
    }
    // Every project is planned round a table (§4d), so the crew it is planned for has to
    // fit at one the space owns. The wizard never offers a size that does not; the
    // harnesses take the brief's size, capped to what there is.
    const maxSeats = crewCap(this.maxTableSeats());
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
    // A harness pitching with no crew keeps the brief's numbers and the middle technology.
    const chosen = plan ? { ...plan, design: { ...plan.design } } : defaultPlan(def, maxSeats);
    chosen.levels = crewSkills.length ? crewLevels(crewSkills) : chosen.levels;
    chosen.design = clampDesign(def.category, chosen.design, chosen.levels);
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
    // The design budget is paid there and then, like the parts.
    if (summary.tooling > 0 && !state.spend(summary.tooling, 'design')) {
      this.log(msg('build.log.licencesOut', { item: def.name }), 'bad');
      return false;
    }
    const offer = offerId ? state.backlog.find((e) => e.id === offerId) : undefined;
    const entry: BacklogEntry = offer ?? { id: uid('offer'), defId, source: 'catalog' };
    const project = startProject(entry, this.day, chosen, state.ownedMachines);
    project.spent += summary.tooling;
    // What the review promised, kept for the report at release — the same sum the wizard ran.
    if (!def.order) {
      const promised = forecastBuild(
        def,
        chosen,
        summary,
        crewSkills.map((c) => c.skills[def.category] ?? 2),
        {
          demand: state.market[def.category] ?? 1,
          built: state.shipped.filter((r) => r.defId === def.id).length,
        },
      );
      project.forecast = {
        quality: promised.quality,
        days: promised.days,
        payout: promised.payout,
        hype: promised.hype,
      };
    }
    // Every build carries the name it was given (design §6.2) — the one the projects table
    // ranks it by. The harnesses pass none and keep the brief's.
    if (name?.trim()) project.name = name.trim().slice(0, 40);

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
        this.log(msg('log.pitch.ordered', { item: def.name, cost: project.bomCost, days: project.leadDays }), 'info');
      } else {
        this.log(msg('log.pitch.noCash', { item: def.name, cost: def.bomCost }), 'warn');
      }
    } else {
      this.log(msg('log.pitch.plain', { item: def.name, blurb: def.blurb }), 'info');
    }

    // **The crew picked in the wizard is the crew** — no asking, no refusing. Asking used to
    // let a pick decline, and the empty chair went to whoever volunteered, which was often
    // the person the player had just unticked: the wizard said one crew and the build ran
    // with another.
    for (const memberId of draftTeam) {
      if (project.team.length >= project.teamSize) break;
      const member = this.member(memberId);
      if (member && !member.team) this.addToTeam(project, member);
    }
    return true;
  }

  /** What promoting a shipped build would cost and bring (§4c), or null when it cannot be. */
  promoQuote(recordId: string): { cost: number; gain: number } | null {
    const record = store.getState().shipped.find((r) => r.id === recordId);
    if (!record || record.order || record.promo) return null;
    if (this.day - record.day > PROMO.window) return null;
    const gain = Math.round(record.hype * PROMO.gainShare);
    if (gain <= 0) return null;
    const cost = Math.max(PROMO.min, Math.round((gain * PROMO.costPerRep) / 100) * 100);
    return { cost, gain };
  }

  /** Promote a shipped build: pay now, and the name it makes grows over the week. */
  promote(recordId: string): boolean {
    const quote = this.promoQuote(recordId);
    const state = store.getState();
    const record = state.shipped.find((r) => r.id === recordId);
    if (!quote || !record) return false;
    if (!state.spend(quote.cost, 'marketing')) {
      this.log(msg('log.amenity.cantAfford', { item: record.name }), 'bad');
      return false;
    }
    state.updateShipped(recordId, { promo: { cost: quote.cost, gain: quote.gain, paid: 0 } });
    this.log(msg('promo.log.started', { project: record.name, gain: quote.gain, days: PROMO.days }), 'good');
    this.publish();
    return true;
  }

  /** A day's share of every promotion still running: reputation, and the build's own record. */
  private dripPromos() {
    const state = store.getState();
    for (const record of state.shipped) {
      const promo = record.promo;
      if (!promo || promo.paid >= promo.gain) continue;
      const share = Math.min(promo.gain - promo.paid, Math.ceil(promo.gain / PROMO.days));
      state.recordReputation(share);
      state.updateShipped(record.id, { hype: record.hype + share, promo: { ...promo, paid: promo.paid + share } });
    }
  }

  /** Put yourself on a project. The one place in the game you can give a direct order. */
  workOn(projectId: string) {
    const project = this.project(projectId);
    if (!project) return;
    this.ownerStopped = false;
    this.player.project = projectId;
  }

  // -------------------------------------------------------------------------
  // Dilemmas (§7c) — every fifteen to twenty days, a card with no free answer
  // -------------------------------------------------------------------------

  /** The product of every multiplier a dilemma left on this kind of thing, today. */
  mod(kind: DilemmaMod): number {
    return this.mods.reduce((v, m) => (m.mod === kind && m.until >= this.day ? v * m.value : v), 1);
  }

  /** Deal a card now (the dev console): a named one, or whatever would come up next. */
  forceDilemma(id?: string): boolean {
    if (store.getState().dilemma) return false;
    this.nextDilemmaDay = this.day;
    if (id) {
      const seen = store.getState().dilemmasSeen.filter((x) => x !== id);
      store.setState({ dilemmasSeen: seen });
      const def = DILEMMA_MAP[id];
      if (!def) return false;
      const people = this.members.filter((m) => !m.training);
      const target = def.target === 'crew' ? people.find((m) => m.team) ?? people[0] : def.target === 'best' ? people[0] : undefined;
      store.getState().setDilemma({ id, day: this.day, target: target?.id ?? null });
      this.publish();
      return true;
    }
    const hour = this.time;
    this.time = Math.max(this.time, DILEMMA.atHour);
    this.maybeDilemma();
    this.time = hour;
    return !!store.getState().dilemma;
  }

  /** Deal a card, once it is due and everybody is in. One at a time, never over another modal. */
  private maybeDilemma() {
    const state = store.getState();
    if (state.dilemma || state.bill || state.ceremony || state.shipReport || state.gameOver) return;
    if (this.day < this.nextDilemmaDay || this.time < DILEMMA.atHour) return;
    const recent = state.dilemmasSeen.slice(-DILEMMA.memory);
    const people = this.members.filter((m) => !m.training);
    const eligible = DILEMMAS.filter((d) => {
      if (recent.includes(d.id)) return false;
      if (d.needs === 'printer' && !this.machines.some((m) => m.type === 'fdm')) return false;
      if (d.needs === 'project' && !this.projects.some((p) => !p.shipped && !p.order)) return false;
      if (d.needs === 'three' && this.members.length < 3) return false;
      if (d.target === 'crew' && !people.some((m) => m.team)) return false;
      if (d.target && !people.length) return false;
      return true;
    });
    if (!eligible.length) {
      this.nextDilemmaDay = this.day + 1;
      return;
    }
    const def = rng.pick(eligible);
    let target: MemberEntity | undefined;
    if (def.target === 'crew') target = rng.pick(people.filter((m) => m.team));
    if (def.target === 'best') {
      target = [...people].sort(
        (a, b) => Math.max(...Object.values(b.data.skills)) - Math.max(...Object.values(a.data.skills)),
      )[0];
    }
    store.getState().setDilemma({ id: def.id, day: this.day, target: target?.id ?? null });
    this.publish();
  }

  /** The money and reputation an option comes to right now — what the card shows and what it does. */
  dilemmaFigures(): { rent: number; reputation: number } {
    return { rent: rentFor(store.getState().era), reputation: store.getState().reputation };
  }

  /** Answer the card on the table with one of its options. */
  resolveDilemma(index: number) {
    const state = store.getState();
    const card = state.dilemma;
    const def = card ? DILEMMA_MAP[card.id] : undefined;
    const option = def?.options[index];
    if (!card || !def || !option) return;
    const target = card.target ? this.member(card.target) : undefined;
    // Every title takes the same `name` param; the burnout key stands in for the type.
    const title = msg(`dilemma.${def.id}.title` as 'dilemma.burnout.title', { name: target?.name ?? state.identity?.name ?? '' });
    this.log(msg('dilemma.log.chose', { title, option: msg(`dilemma.${def.id}.${option.key}` as MessageKey) }), 'info');
    this.applyDilemma(option.effects, target, title);
    store.getState().setDilemma(null);
    this.nextDilemmaDay = this.day + rng.int(DILEMMA.every[0], DILEMMA.every[1]);
    this.publish();
  }

  private applyDilemma(effects: DilemmaEffect[], target: MemberEntity | undefined, title: Text) {
    const { rent, reputation } = this.dilemmaFigures();
    for (const effect of effects) {
      switch (effect.kind) {
        case 'cash': {
          const amount = effectCash(effect, rent);
          // A dilemma's bill is paid whatever the balance says: it is not a purchase.
          if (amount < 0) store.setState((s) => ({ cash: s.cash + amount, ledger: { ...s.ledger, events: (s.ledger.events ?? 0) + amount } }));
          else store.getState().earn(amount, 'events');
          if (amount > 0) this.incomeThisMonth += amount;
          break;
        }
        case 'rep':
          store.getState().recordReputation(effectRep(effect, reputation));
          break;
        case 'mood':
          for (const m of effect.who === 'all' ? this.members : target ? [target] : []) {
            m.data.mood = Math.max(0, Math.min(100, m.data.mood + effect.delta));
          }
          break;
        case 'away':
          if (target) {
            this.awayUntil.set(target.id, this.day + effect.days);
            if (target.present) {
              this.releaseSeat(target.id);
              target.leave();
            }
          }
          break;
        case 'leave':
          if (target) this.letGo(target.id);
          break;
        case 'mod':
          this.mods = [...this.mods.filter((m) => m.until >= this.day), { mod: effect.mod, value: effect.value, until: this.day + effect.days - 1 }];
          break;
        case 'dayOff':
          this.player.spendHours(this.player.hoursLeft);
          break;
        case 'chance':
          if (rng.chance(effect.p)) {
            this.log(msg('dilemma.log.lucky', { title }), 'info');
            this.applyDilemma(effect.then, target, title);
          } else {
            this.log(msg('dilemma.log.unlucky', { title }), 'info');
          }
          break;
      }
    }
  }

  stopWork() {
    this.ownerStopped = true;
    this.player.project = null;
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
    const machine = this.machineFor(part.machineType, part.hours);
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

  // -------------------------------------------------------------------------
  // Print orders (§5)
  // -------------------------------------------------------------------------

  /** Offers go stale, and a morning may bring a new one while there is room on the board. */
  private refreshPrintOffers() {
    const state = store.getState();
    if (!this.machines.some((m) => m.type === 'fdm')) return;
    let offers = state.printOffers.filter((o) => o.expiresOnDay >= this.day);
    if (offers.length < ORDERS.maxOffers && rng.chance(ORDERS.newPerDay)) {
      const taken = new Set([...offers.map((o) => o.defId), ...this.projects.map((p) => p.defId)]);
      const options = PRINT_JOBS.filter((def) => def.era <= state.era && !taken.has(def.id));
      // Seven in ten come with the STL ready; the rest need drawing first (and pay for it).
      const series = options.filter((def) => def.order?.series);
      const drawn = options.filter((def) => !def.order?.series);
      const wantSeries = rng.chance(ORDERS.seriesShare);
      const pool = wantSeries ? (series.length ? series : drawn) : drawn.length ? drawn : series;
      if (pool.length) {
        const def = rng.pick(pool);
        offers = [...offers, { id: uid('order'), defId: def.id, days: def.order!.days, expiresOnDay: this.day + ORDERS.offerDays }];
        this.log(msg('build.log.orderIn', { item: def.name, client: def.order!.client }), 'info');
      }
    }
    if (offers.length !== state.printOffers.length || offers.some((o, i) => o !== state.printOffers[i])) {
      store.getState().setPrintOffers(offers);
    }
  }

  /**
   * Say yes to a print order. It goes on the bench like any build: anybody free may pick
   * it up, and so may you. The price is fixed and paid on delivery; the date is counted
   * from today.
   */
  acceptOrder(offerId: string): boolean {
    const state = store.getState();
    const offer = state.printOffers.find((o) => o.id === offerId);
    const def = offer ? CATALOG_MAP[offer.defId] : null;
    if (!offer || !def?.order) return false;
    if (!canBuild(def, state.ownedMachines)) {
      this.log(msg('log.pitch.cantBuild'), 'bad');
      return false;
    }
    const project = startProject({ id: offer.id, defId: def.id, source: 'catalog' }, this.day, defaultPlan(def, 1), state.ownedMachines);
    project.order = { pay: def.payout, client: def.order.client, dueDay: this.day + offer.days };
    // A series print needs no hands: nobody volunteers for it and it holds no chair.
    if (def.order.series) project.teamSize = 0;
    this.projects.push(project);
    store.getState().setPrintOffers(state.printOffers.filter((o) => o.id !== offerId));
    this.log(msg('build.log.orderAccepted', { item: def.name, pay: def.payout, day: project.order.dueDay }), 'good');
    this.staffOrders();
    return true;
  }

  /**
   * **A print order gets a pair of hands on its own** (§5). Whoever is free goes to it — the
   * first choice somebody in the building, then whoever is strongest in the Mechanical wing
   * (printing is its work) or keenest on what the client wants, and if nobody like that is
   * free, anybody who is. A series print with the STL supplied needs nobody and is left to
   * the printer. It runs every hour, so somebody who drifts off is replaced.
   */
  private staffOrders() {
    for (const project of this.projects) {
      if (!project.order || project.shipped || project.team.length >= project.teamSize) continue;
      const handsLeft = STAGE_ORDER.some((k) => project.required[k] > (project.progress[k] ?? 0));
      if (!handsLeft) continue;
      const free = this.members.filter(
        (m) => !m.team && !m.training && (this.awayUntil.get(m.id) ?? 0) < this.day && !m.isCoolingOff(project.id),
      );
      if (!free.length) continue;
      const score = (m: MemberEntity) =>
        (m.present ? 10 : 0) + (m.data.skills.mechanical ?? 0) + m.passionMatch(project.tags) * 3;
      const pick = [...free].sort((a, b) => score(b) - score(a))[0];
      this.addToTeam(project, pick);
      this.log(msg('build.log.orderStaffed', { member: pick.name, item: project.name }), 'info');
    }
  }

  /** Turn an offer down. It simply goes. */
  declineOrder(offerId: string) {
    const state = store.getState();
    store.getState().setPrintOffers(state.printOffers.filter((o) => o.id !== offerId));
  }

  /**
   * A print order past its date is gone: the client has found somebody else, whatever is on
   * the printer is scrap, and it costs a little name. A due date that meant nothing would
   * make every order free money.
   */
  private checkOrderDeadlines() {
    for (const project of [...this.projects]) {
      if (!project.order || this.day <= project.order.dueDay) continue;
      for (const machine of this.machines) machine.dropProject(project.id);
      this.projects = this.projects.filter((p) => p.id !== project.id);
      this.seeded.delete(project.id);
      if (this.player.project === project.id) this.player.project = null;
      for (const m of this.members) {
        if (m.team === project.id) {
          m.team = null;
          this.releaseSeat(m.id);
        }
      }
      store.getState().recordReputation(-ORDERS.missedRep);
      this.recordFailure(project, 'missed', ORDERS.missedRep);
      this.log(msg('build.log.orderMissed', { item: project.name, client: project.order.client, rep: ORDERS.missedRep }), 'bad');
    }
  }

  // -------------------------------------------------------------------------

  /**
   * Public because every player action must push a snapshot immediately: the game can be
   * paused, and otherwise a pitch, an order or a queue change would not reach the UI until
   * the clock next moved. Game wraps each UI handler in this.
   */
  publish() {
    const spots = this.crowdSpots();
    const machines: MachineSnapshot[] = this.machines.map((m) => m.snapshot());
    store.getState().setRuntime({
      members: this.members.map((m) => {
        const snap = m.snapshot();
        for (const project of this.projects) snap.affinity[project.id] = m.passionMatch(project.tags);
        snap.seat = this.seatFor(m);
        snap.spot = spots.get(m.id) ?? null;
        snap.treated = [...(this.treatedToday.get(m.id) ?? [])];
        // The comfort they are at, once they have got there — the room puts a pad or a
        // bottle in their hands and a game on the console's screen.
        const spell = this.leisure.get(m.id);
        snap.using = spell?.served && spell.amenityId && sameTile(m.tile, spell.tile) ? spell.amenityId : null;
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
      // A game is on when both ends of a pair comfort are in their places (§7b).
      games: (() => {
        const at = new Map<string, string[]>();
        for (const [id, spell] of this.leisure) {
          if (!spell.pair || !spell.served || !spell.amenityId) continue;
          const who = this.member(id);
          if (!who || !sameTile(who.tile, spell.tile)) continue;
          at.set(spell.amenityId, [...(at.get(spell.amenityId) ?? []), id]);
        }
        return [...at].filter(([, ids]) => ids.length === 2).map(([amenityId, ids]) => ({
          amenityId,
          players: [ids[0], ids[1]] as [string, string],
        }));
      })(),
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
        snap.spot = spots.get('player') ?? null;
        snap.share = this.shareFor(this.player);
        return snap;
      })(),
    });
  }
}
