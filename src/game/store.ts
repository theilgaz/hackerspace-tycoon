import { createStore } from 'zustand/vanilla';
import type {
  BacklogEntry,
  Identity,
  LogEntry,
  MachineType,
  Post,
  RuntimeSnapshot,
  ShippedRecord,
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
  /** Offers waiting to be pitched (CLAUDE.md §4a). */
  backlog: BacklogEntry[];
  /** The order applicants were dealt onto the reputation ladder this run. */
  ladder: string[];
  /** Seat licences the space owns, by option (§4c). Bought once, kept for good. */
  licences: Licences;
  grantLicences: (grants: { key: string; seats: number }[]) => void;
  /** What each genre is worth right now (§4d). Moves daily; multiplies payouts. */
  market: Market;
  setMarket: (market: Market) => void;
  runtime: RuntimeSnapshot;
  log: LogEntry[];
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

  setBacklog: (backlog: BacklogEntry[]) => void;
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
  disownMachine: (type: MachineType) => void;
  recordShipped: (hype: number, record: ShippedRecord) => void;
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
  reputation: 0,
  ownedMachines: ['fdm', 'bench', 'assembly', 'cad-desk', 'lounge'],
  amenities: [],
  amenityPlacements: {},
  stationPlacements: {},
  amenityRev: 0,
  moving: null,
  backlog: [],
  market: freshMarket(),
  licences: {},
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
      day, simTime, cash, era, shippedCount, shipped, reputation, ownedMachines, applicants,
      passed, upvotes, backlog, log, hype, posts, overdraftSince, amenities, amenityPlacements,
      stationPlacements, market, ladder, ledger, monthOpen, licences,
    } = get();
    // `runtime` is left out on purpose: the sim rebuilds it on the first publish.
    return {
      identity, difficulty, started, ceremony, ceremonies, bill, bills, missedBills, gameOver,
      day, simTime, cash, era, shippedCount, shipped, reputation, ownedMachines, applicants,
      passed, upvotes, backlog, log, hype, posts, overdraftSince, amenities, amenityPlacements,
      stationPlacements, market, ladder, ledger, monthOpen, licences,
    };
  },

  hydrate: (data) =>
    set({ ...(data as Partial<GameState>), paused: true, speed: 1, moving: null, amenityRev: 0 }),

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
