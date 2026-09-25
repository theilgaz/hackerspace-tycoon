import { createStore } from 'zustand/vanilla';
import type {
  BacklogEntry,
  BuyItem,
  PrintOffer,
  Identity,
  LogEntry,
  MachineType,
  Post,
  RuntimeSnapshot,
  ShippedRecord,
  FailedRecord,
  TraitKey,
} from './types';
import type { Ceremony } from '@/systems/RivalSystem';
import type { Placement, StationPlacement } from '@/machines/layout';
import type { Bill, Ledger, LedgerKind } from '@/utils/economy';
import { START_CASH } from '@/utils/constants';
import { ECONOMY } from '@/utils/economy';
import { DIFFICULTY_MAP, type DifficultyKey } from '@/utils/difficulty';
import { uid } from '@/utils/format';
import { sameText, setLocale as setI18nLocale, type Locale, type Text } from '@/i18n';
import { freshMarket, type Market } from '@/utils/market';
import type { Licences } from '@/utils/design';

const MAX_LOG = 140;

/**
 * Management data lives here; sim-time data lives in the Simulation and arrives via
 * `runtime` snapshots at 5 Hz. The UI reads this store and nothing else (CLAUDE.md §11).
 */
export interface GameState {
  /** Null until the player has named and badged the place. */
  identity: Identity | null;
  difficulty: DifficultyKey;
  started: boolean;
  /** Set when an awards night resolves; cleared when the player dismisses it. */
  ceremony: Ceremony | null;
  ceremonies: Ceremony[];
  /** Set when the monthly bill lands; cleared when the player dismisses it. */
  bill: Bill | null;
  bills: Bill[];
  /** Consecutive bills you could not cover. Kept for the statement; it no longer evicts. */
  missedBills: number;
  /** The day the balance first went under, or null while it is in the black. */
  overdraftSince: number | null;
  /** Why the run ended, if it has. */
  gameOver: { reason: Text; day: number } | null;
  /** Day 1, 2, 3 ... */
  day: number;
  /** Hour within the day, 0-24. */
  simTime: number;
  speed: number;
  paused: boolean;
  cash: number;
  /** This month's money by where it went (§7a). Reset when the bill lands. */
  ledger: Ledger;
  /** The balance the month opened on, so the statement can add up. */
  monthOpen: number;
  era: number;
  shippedCount: number;
  /** Everything that made it out of the door, newest last. */
  shipped: ShippedRecord[];
  /** Builds that never shipped: missed print orders and shelved projects. */
  failed: FailedRecord[];
  /** Cumulative hype from everything shipped; drives era progression and Phase 2. */
  reputation: number;
  /** Applicant ids who would consider joining; hiring is a decision, not automatic. */
  applicants: string[];
  /** Upvotes from every post that landed, all time. The award year reads its share. */
  upvotes: number;
  /** Applicants you turned down. They do not ask again. */
  passed: string[];
  /**
   * Attention right now (§6). Unlike reputation this goes **down** on its own, which is what
   * makes it a clock rather than a score.
   */
  hype: number;
  /** Everything you have put in front of Reddit, newest last. */
  posts: Post[];
  /** Machine types the space owns; gates what can be attempted. */
  ownedMachines: MachineType[];
  /** Comforts bought from the Shop (§7b). Ids from `AMENITIES`, in the order bought. */
  amenities: string[];
  /** Where the player has dragged each one, and which way it faces. Anything missing here
   *  takes the next slot the room derives for it. */
  amenityPlacements: Record<string, Placement>;
  /** Stations the player has dragged somewhere. Reset by a lease — see `applyEraLayout`. */
  stationPlacements: Record<string, StationPlacement>;
  /**
   * Bumped whenever the arrangement changes. The sim re-derives the floor from it, which is
   * far cheaper than hashing the placement map inside a per-member inner loop. Deliberately
   * not saved: a fresh Simulation starts behind and syncs on its first tick.
   */
  amenityRev: number;
  /** The comfort currently being moved around the room, if any. Never saved. */
  moving: string | null;
  /**
   * Build mode (§7b): the catalogue along the bottom, and the only time things in the room
   * can be picked up. Never saved — a reload opens on the room, not on a half-placed sofa.
   */
  buildMode: boolean;
  /** Build mode stopped a running clock, so leaving it starts the clock again. Never saved. */
  buildPaused: boolean;
  /** What is being placed from the catalogue, before anything is paid for. */
  placingBuy: BuyItem | null;
  /** A tile has been chosen: the question "buy it?" is on screen. */
  buyConfirm: (BuyItem & { x: number; y: number; yaw: number }) | null;
  /** Offers waiting to be pitched (CLAUDE.md §4a). */
  backlog: BacklogEntry[];
  /** Print orders on offer in the Machines panel (§5). */
  printOffers: PrintOffer[];
  /** Filament on the shelf, in grams — bought ahead, drawn on before buying more (§5). */
  filamentStock: number;
  /** Traits the player has been told about this run — the first sighting is a notification. */
  traitsSeen: TraitKey[];
  /**
   * The ship report on screen: which shipped build, and whether the clock was running when
   * it opened (so closing it starts it again). Not saved — a report is a moment, and the
   * same numbers are on the build's page in Projects.
   */
  shipReport: { id: string; resume: boolean } | null;
  /** The order applicants were dealt onto the reputation ladder this run. */
  ladder: string[];
  /** Seat licences the space owns, by option (§4c). Bought once, kept for good. */
  licences: Licences;
  /**
   * Where every space stood when the last month closed, by id — what the Ranking panel's
   * arrows measure against. Taken on the bill day, and on the first day of a run.
   */
  rankPrev: Record<string, number>;
  setRankPrev: (ranks: Record<string, number>) => void;
  grantLicences: (grants: { key: string; seats: number }[]) => void;
  /** What each genre is worth right now (§4d). Moves daily; multiplies payouts. */
  market: Market;
  setMarket: (market: Market) => void;
  runtime: RuntimeSnapshot;
  log: LogEntry[];
  /** Notifications on screen, not yet in the log. */
  notices: LogEntry[];
  /**
   * The language on screen (CLAUDE.md §11). A preference, not run state: never saved with
   * the run — `i18n/preference.ts` keeps it — and it lives here only so that switching
   * re-renders every panel.
   */
  locale: Locale;
  setLocale: (locale: Locale) => void;

  begin: (identity: Identity, difficulty: DifficultyKey) => void;
  setCeremony: (ceremony: Ceremony | null) => void;
  setBill: (bill: Bill | null) => void;
  endRun: (reason: Text, day: number) => void;
  /** Everything worth saving, minus the functions and the rebuildable runtime snapshot. */
  snapshot: () => Record<string, unknown>;
  hydrate: (data: Record<string, unknown>) => void;
  setSpeed: (speed: number) => void;
  togglePause: () => void;
  setPaused: (paused: boolean) => void;
  setClock: (day: number, simTime: number) => void;
  setRuntime: (runtime: RuntimeSnapshot) => void;
  spend: (amount: number, kind?: LedgerKind) => boolean;
  earn: (amount: number, kind?: LedgerKind) => void;
  /** Close the month: the statement has been drawn up and a new page starts here. */
  closeMonth: () => void;
  pushLog: (text: Text, kind?: LogEntry['kind']) => void;
  /** A notification: shown as a toast first, and written to the log when it goes (§11). */
  pushNotice: (text: Text, kind?: LogEntry['kind'], icon?: string) => void;
  /** First sighting of a trait this run; false if the player has already been told. */
  markTraitSeen: (trait: TraitKey) => boolean;
  /** Open the ship report for a build, pausing the clock; null closes it and gives the clock back. */
  setShipReport: (id: string | null) => void;
  /** Change a shipped record after the fact — a campaign run on it. */
  updateShipped: (id: string, patch: Partial<ShippedRecord>) => void;
  /** The toast has gone: into the log with it. */
  retireNotice: (id: string) => void;

  setBacklog: (backlog: BacklogEntry[]) => void;
  setPrintOffers: (offers: PrintOffer[]) => void;
  setFilamentStock: (grams: number) => void;
  addOffer: (entry: BacklogEntry) => void;
  removeOffer: (id: string) => void;
  openApplicant: (id: string) => void;
  closeApplicant: (id: string) => void;
  passApplicant: (id: string) => void;
  ownMachine: (type: MachineType) => void;
  buyAmenity: (id: string) => void;
  sellAmenity: (id: string) => void;
  forgetStation: (id: string) => void;
  placeAmenity: (id: string, placement: Placement) => void;
  placeStation: (id: string, placement: StationPlacement) => void;
  clearStationPlacements: () => void;
  setMoving: (id: string | null) => void;
  setBuildMode: (on: boolean) => void;
  setPlacingBuy: (item: BuyItem | null) => void;
  setBuyConfirm: (confirm: GameState['buyConfirm']) => void;
  disownMachine: (type: MachineType) => void;
  recordShipped: (hype: number, record: ShippedRecord) => void;
  recordFailed: (record: FailedRecord) => void;
  recordReputation: (amount: number) => void;
  /** Bank a post's reaction: the post itself, the hype it moved, the reputation it cost. */
  recordPost: (post: Post, reputationDelta: number) => void;
  setHype: (hype: number) => void;
}

export const emptyRuntime = (): RuntimeSnapshot => ({
  members: [],
  machines: [],
  projects: [],
  player: null,
  rivals: [],
  season: { year: 1, dayOfYear: 0, length: 1 },
  recruitIn: 0,
  tables: [],
  waitingFor: {},
  seats: {},
  games: [],
});

export const store = createStore<GameState>((set, get) => ({
  identity: null,
  difficulty: 'normal',
  started: false,
  ceremony: null,
  ceremonies: [],
  bill: null,
  bills: [],
  missedBills: 0,
  overdraftSince: null,
  gameOver: null,
  day: 1,
  simTime: 9,
  speed: 1,
  paused: true,
  cash: START_CASH,
  ledger: {},
  monthOpen: START_CASH,
  era: 1,
  shippedCount: 0,
  shipped: [],
  failed: [],
  reputation: 0,
  ownedMachines: ['fdm', 'bench', 'assembly', 'cad-desk', 'lounge'],
  amenities: [],
  amenityPlacements: {},
  stationPlacements: {},
  amenityRev: 0,
  moving: null,
  buildMode: false,
  buildPaused: false,
  placingBuy: null,
  buyConfirm: null,
  backlog: [],
  printOffers: [],
  filamentStock: 0,
  traitsSeen: [],
  shipReport: null,
  market: freshMarket(),
  licences: {},
  rankPrev: {},
  setRankPrev: (rankPrev) => set({ rankPrev }),
  grantLicences: (grants) =>
    set((s) => {
      const licences = { ...s.licences };
      for (const g of grants) licences[g.key] = Math.max(licences[g.key] ?? 0, g.seats);
      return { licences };
    }),
  ladder: [],
  applicants: [],
  passed: [],
  upvotes: 0,
  hype: 0,
  posts: [],
  runtime: emptyRuntime(),
  log: [],
  notices: [],
  locale: 'en',
  setLocale: (locale) => {
    setI18nLocale(locale);
    set({ locale });
  },

  begin: (identity, difficulty) =>
    set({
      identity,
      difficulty,
      cash: DIFFICULTY_MAP[difficulty].startCash,
      ledger: {},
      monthOpen: DIFFICULTY_MAP[difficulty].startCash,
      // A new run gets a new market, not whatever was rolled when the page loaded.
      market: freshMarket(),
      licences: {},
      rankPrev: {},
      traitsSeen: [],
      started: true,
      paused: false,
      speed: 1,
    }),
  setCeremony: (ceremony) =>
    set((s) => ({
      ceremony,
      ceremonies: ceremony ? [...s.ceremonies, ceremony] : s.ceremonies,
      paused: ceremony ? true : s.paused,
    })),
  setBill: (bill) =>
    set((s) => ({
      bill,
      bills: bill ? [...s.bills, bill] : s.bills,
      missedBills: bill ? bill.missesInARow : s.missedBills,
      paused: bill ? true : s.paused,
    })),
  endRun: (reason, day) => set({ gameOver: { reason, day }, paused: true }),
  snapshot: () => {
    const {
      identity, difficulty, started, ceremony, ceremonies, bill, bills, missedBills, gameOver,
      day, simTime, cash, era, shippedCount, shipped, failed, reputation, ownedMachines, applicants,
      passed, upvotes, backlog, log, notices, hype, posts, overdraftSince, amenities, amenityPlacements,
      stationPlacements, market, ladder, ledger, monthOpen, licences, printOffers, filamentStock, rankPrev, traitsSeen,
    } = get();
    // `runtime` is left out on purpose: the sim rebuilds it on the first publish.
    return {
      identity, difficulty, started, ceremony, ceremonies, bill, bills, missedBills, gameOver,
      day, simTime, cash, era, shippedCount, shipped, failed, reputation, ownedMachines, applicants,
      passed, upvotes, backlog, log, notices, hype, posts, overdraftSince, amenities, amenityPlacements,
      stationPlacements, market, ladder, ledger, monthOpen, licences, printOffers, filamentStock, rankPrev, traitsSeen,
    };
  },

  hydrate: (data) =>
    set({
      ...(data as Partial<GameState>),
      paused: true,
      speed: 1,
      moving: null,
      amenityRev: 0,
      buildMode: false,
      buildPaused: false,
      placingBuy: null,
      buyConfirm: null,
    }),

  setSpeed: (speed) => set({ speed, paused: false }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
  setPaused: (paused) => set({ paused }),
  setClock: (day, simTime) => set({ day, simTime }),
  setRuntime: (runtime) => set({ runtime }),

  spend: (amount, kind = 'other') => {
    // The overdraft is the point: an action is refused only when it would take the space
    // past the floor, not merely because the balance is thin.
    if (get().cash - amount < -ECONOMY.overdraftLimit) return false;
    set((s) => ({ cash: s.cash - amount, ledger: { ...s.ledger, [kind]: (s.ledger[kind] ?? 0) - amount } }));
    return true;
  },
  earn: (amount, kind = 'other') =>
    set((s) => ({ cash: s.cash + amount, ledger: { ...s.ledger, [kind]: (s.ledger[kind] ?? 0) + amount } })),
  closeMonth: () => set((s) => ({ ledger: {}, monthOpen: s.cash })),

  pushNotice: (text, kind = 'info', icon) => {
    const { day, simTime, notices } = get();
    set({ notices: [...notices, { id: uid('note'), day, time: simTime, text, kind, ...(icon ? { icon } : {}) }] });
  },
  setShipReport: (id) =>
    set((s) =>
      id
        ? { shipReport: { id, resume: s.shipReport?.resume ?? !s.paused }, paused: true }
        : { shipReport: null, paused: s.shipReport?.resume && !s.bill && !s.ceremony ? false : s.paused },
    ),
  updateShipped: (id, patch) =>
    set((s) => ({ shipped: s.shipped.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
  markTraitSeen: (trait) => {
    const seen = get().traitsSeen ?? [];
    if (seen.includes(trait)) return false;
    set({ traitsSeen: [...seen, trait] });
    return true;
  },
  retireNotice: (id) => {
    const notice = get().notices.find((n) => n.id === id);
    if (!notice) return;
    set({ notices: get().notices.filter((n) => n.id !== id) });
    get().pushLog(notice.text, notice.kind);
  },
  pushLog: (text, kind = 'info') => {
    const { day, simTime, log } = get();
    const head = log[0];
    // A repeated message means a condition persists, not that something happened again.
    // Collapse it instead of flooding — "parts haven't arrived" once fired every tick.
    if (head && sameText(head.text, text)) {
      const merged: LogEntry = { ...head, repeats: (head.repeats ?? 1) + 1, day, time: simTime };
      set({ log: [merged, ...log.slice(1)] });
      return;
    }
    const entry: LogEntry = { id: uid('log'), day, time: simTime, text, kind };
    set({ log: [entry, ...log].slice(0, MAX_LOG) });
  },

  setBacklog: (backlog) => set({ backlog }),
  setPrintOffers: (printOffers) => set({ printOffers }),
  setFilamentStock: (filamentStock) => set({ filamentStock: Math.max(0, Math.round(filamentStock)) }),
  setMarket: (market) => set({ market }),
  addOffer: (entry) => set((s) => ({ backlog: [entry, ...s.backlog] })),
  removeOffer: (id) => set((s) => ({ backlog: s.backlog.filter((e) => e.id !== id) })),
  openApplicant: (id) =>
    set((s) => (s.applicants.includes(id) ? s : { applicants: [...s.applicants, id] })),
  closeApplicant: (id) => set((s) => ({ applicants: s.applicants.filter((a) => a !== id) })),
  passApplicant: (id) =>
    set((s) => ({
      applicants: s.applicants.filter((a) => a !== id),
      passed: s.passed.includes(id) ? s.passed : [...s.passed, id],
    })),
  ownMachine: (type) =>
    set((s) => (s.ownedMachines.includes(type) ? s : { ownedMachines: [...s.ownedMachines, type] })),
  disownMachine: (type) =>
    set((s) => ({ ownedMachines: s.ownedMachines.filter((m) => m !== type) })),
  // Comforts are never sold back: a table tennis table is not an investment decision, and
  // a shop you can churn is a shop that pays for itself.
  buyAmenity: (id) =>
    set((s) => (s.amenities.includes(id) ? s : { amenities: [...s.amenities, id], amenityRev: s.amenityRev + 1 })),
  sellAmenity: (id) =>
    set((s) => {
      const placements = { ...s.amenityPlacements };
      delete placements[id];
      return {
        amenities: s.amenities.filter((a) => a !== id),
        amenityPlacements: placements,
        amenityRev: s.amenityRev + 1,
        moving: s.moving === id ? null : s.moving,
      };
    }),
  forgetStation: (id) =>
    set((s) => {
      const placements = { ...s.stationPlacements };
      delete placements[id];
      return { stationPlacements: placements, amenityRev: s.amenityRev + 1, moving: s.moving === id ? null : s.moving };
    }),
  placeAmenity: (id, placement) =>
    set((s) => ({
      amenityPlacements: { ...s.amenityPlacements, [id]: placement },
      amenityRev: s.amenityRev + 1,
    })),
  placeStation: (id, placement) =>
    set((s) => ({
      stationPlacements: { ...s.stationPlacements, [id]: placement },
      amenityRev: s.amenityRev + 1,
    })),
  // A lease carries everything to a new wall, so what you had arranged is no longer a fact
  // about the room. `applyEraLayout` drops it on its side; this drops it on ours.
  clearStationPlacements: () => set((s) => ({ stationPlacements: {}, amenityRev: s.amenityRev + 1 })),
  setMoving: (id) => set({ moving: id }),
  // Build mode stops the clock: arranging the room is not something to do while a print fails
  // behind you. Leaving it puts down whatever was held, forgets what was being placed, and
  // starts the clock again only if it was Build mode that stopped it — and nothing modal,
  // a bill or a ceremony, is still waiting to be read.
  setBuildMode: (on) =>
    set((s) =>
      on
        ? { buildMode: true, buildPaused: s.buildMode ? s.buildPaused : !s.paused, paused: true }
        : {
            buildMode: false,
            buildPaused: false,
            paused: s.buildPaused && !s.bill && !s.ceremony ? false : s.paused,
            moving: null,
            placingBuy: null,
            buyConfirm: null,
          },
    ),
  setPlacingBuy: (item) => set({ placingBuy: item, buyConfirm: null, moving: item ? null : get().moving }),
  setBuyConfirm: (confirm) => set({ buyConfirm: confirm }),

  recordPost: (post, reputationDelta) =>
    set((s) => ({
      posts: [...s.posts, post].slice(-40),
      // Kept as a running total because the post list is trimmed to the last forty.
      upvotes: s.upvotes + (post.burned ? 0 : Math.max(0, post.upvotes)),
      hype: Math.max(0, s.hype + post.hype),
      // A burned post takes reputation with it, and reputation gates the era — so a claim
      // the work cannot back up genuinely sets the run back rather than merely not helping.
      reputation: Math.max(0, s.reputation + reputationDelta),
    })),
  setHype: (hype) => set({ hype }),
  // Reputation unlocks the next lease; it no longer signs it. See `Simulation.signLease`.
  recordReputation: (amount) => set((s) => ({ reputation: s.reputation + amount })),

  recordFailed: (record) => set((s) => ({ failed: [...s.failed, record] })),
  recordShipped: (hype, record) =>
    set((s) => {
      const shippedCount = s.shippedCount + 1;
      const reputation = s.reputation + hype;
      // Shipping builds the name; it does not sign the lease. `Simulation.signLease` does,
      // and only when the player says so — this was the *second* place that promoted you
      // automatically, and the first fix looked like it had no effect at all because of it.
      return { shippedCount, reputation, shipped: [...s.shipped, record] };
    }),
}));
