import type { CurrencyKey } from '@/utils/format';
import type { Text } from '@/i18n';
import type { Tile } from '@/utils/grid';

// ---------------------------------------------------------------------------
// People (CLAUDE.md §3)
// ---------------------------------------------------------------------------

/**
 * The four roles (docs/design/roller-ve-kanatlar.md §3), one per wing, each 0-5 — Stajyer
 * to Uzman. They replaced six skills; `SkillKey` keeps its name so every `skills[...]` read
 * now reads a role.
 */
export type SkillKey = ProjectCategory;
/** The six skills the roster is still written in, turned into roles when it loads. */
export type LegacySkillKey = 'cad' | 'electronics' | 'machining' | 'welding' | 'software' | 'docs';
export type Skills = Record<SkillKey, number>;

/** Passion tags — the currency of the influence model. */
export type Tag =
  | 'fpv'
  | 'electronics'
  | 'machining'
  | 'cad'
  | 'woodworking'
  | 'food'
  | 'software'
  | 'design'
  | 'iot'
  | 'radio'
  | 'robotics'
  | 'retro'
  | 'civic';

export type TraitKey =
  | 'perfectionist'
  | 'scopeCreeper'
  | 'mentor'
  | 'ghost'
  | 'gatekeeper'
  | 'nightOwl'
  | 'documenter';

export interface MemberData {
  id: string;
  name: string;
  skills: Skills;
  passions: Partial<Record<Tag, number>>;
  /** 0-100, depleted by work, restored off-site and in the lounge. */
  energy: number;
  /** 0-100, driven by policies, tools, events, project outcomes. */
  mood: number;
  /**
   * Hours a week they would *like* to give. Kept as character rather than capacity — the
   * contract decides the hours now — and it is what gates full-time availability.
   */
  commitment: number;
  traits: TraitKey[];
  /** Hour-of-day window they tend to appear in. */
  window: [number, number];
  /** Reputation before they will even consider the place (applicants only). */
  repRequired?: number;
}

/** A course at the learning station: one skill, one level up. */
export interface Training {
  skill: SkillKey;
  /** Hours at the station still to go, and how many the course took in all. */
  hoursLeft: number;
  total: number;
}

/** A specific job: one stage of one project. Used for the player's chosen task. */
export interface Assignment {
  projectId: string;
  stage: StageKey;
}

/** What the sim knows about a member right now; mirrored to the store for the UI. */
export interface MemberSnapshot {
  id: string;
  name: string;
  /** Their primary role's wing (design §3.1) — the badge beside their name. */
  primary: ProjectCategory;
  /** Sent for a drink already today (§7b) — once a person a day. */
  treated?: string[];
  present: boolean;
  activity: MemberActivity;
  /** Project they are on the team of, if any. One project at a time. */
  team: string | null;
  /** Contracted hours a week. */
  weeklyHours: number;
  interest: number;
  /** Best passion overlap with each active project, for the allocation UI. */
  affinity: Record<string, number>;
  energy: number;
  mood: number;
  tile: Tile;
  /** Smooth world position for rendering. */
  pos: { x: number; y: number };
  /** Where they are sitting, when they are sitting somewhere. Drawn instead of `pos`. */
  seat: Seat | null;
  /** Where they are drawn standing when somebody else already has their tile. */
  spot: { x: number; y: number } | null;
  /** The comfort they are using right now, once they are at it (drawn: a pad, a bottle). */
  using?: string | null;
  /** Their skills as they stand today — training changes them, so the roster data will not do. */
  skills: Skills;
  /** A course they are on at the learning station, if any. */
  training: Training | null;
  /**
   * Their own share of the stage they are working, 0-1 — the bar over their head. The
   * stage is pooled work, so this is what they have put in against an even split.
   */
  share: number | null;
  note: string;
}

export type MemberActivity =
  | 'away'
  | 'idle'
  | 'walking'
  | 'working'
  | 'resting'
  | 'babysitting'
  /** At the project table for a kickoff, waiting for the rest of the crew to sit down. */
  | 'waiting';

/**
 * Where somebody is sitting, in fractional tile coordinates. A table seats ten people on
 * two tiles, so a seat is a drawing position rather than a grid tile — the path finder
 * only ever walks them to the table's stand tile.
 */
export interface Seat {
  x: number;
  y: number;
  /** The point they face — the middle of the table, or the bench in front of them. */
  look: { x: number; y: number };
  /** On their feet rather than in a chair: the end of a table-tennis table, a fridge. */
  stand?: boolean;
  /** How high the seat is, so they sit on it rather than in it. A task chair when absent. */
  height?: number;
}

// ---------------------------------------------------------------------------
// The player (CLAUDE.md §3a) — a member you *can* command, with scarce hours
// ---------------------------------------------------------------------------

export interface PlayerSnapshot {
  primary: ProjectCategory;
  present: boolean;
  activity: MemberActivity;
  /** Hours in today's budget, and how many are left. */
  hoursToday: number;
  hoursLeft: number;
  energy: number;
  /** Consecutive days of overwork; drives the budget down. */
  /** Project you have put yourself on, and the stage it is currently at. */
  project: string | null;
  stage: StageKey | null;
  tile: Tile;
  pos: { x: number; y: number };
  seat: Seat | null;
  spot: { x: number; y: number } | null;
  share: number | null;
  note: string;
  skills: Skills;
}

// ---------------------------------------------------------------------------
// Projects (CLAUDE.md §4)
// ---------------------------------------------------------------------------

export type StageKey =
  | 'concept'
  | 'cad'
  | 'simulation'
  | 'fabrication'
  | 'assembly'
  | 'test'
  | 'iterate'
  | 'release';

export interface StageDef {
  key: StageKey;
  label: string;
  /** Skill that drives work rate. `null` for stages resolved by the sim, not by hands. */
  skill: SkillKey | null;
  /** Default work units. A ProjectDef scales or overrides this per stage. */
  work: number;
  optional: boolean;
  /** How interesting this stage is to a volunteer — drives drift (CLAUDE.md §2). */
  appeal: number;
  blurb: string;
}

export type PartStatus = 'pending' | 'queued' | 'running' | 'done' | 'failed';

export interface PartData {
  id: string;
  name: string;
  machineType: MachineType;
  /** Sim hours of machine time. */
  hours: number;
  /** Grams of consumable. */
  material: number;
  status: PartStatus;
  attempts: number;
}

/** The genre of a build. Drives look, stage names, and which skill each stage uses. */
/**
 * The four wings (docs/design/roller-ve-kanatlar.md §1). There were ten genres; Tooling,
 * Civic, Home and Retro folded into these by what the work actually is, and Radio, IoT and
 * Robotics joined the wing that shares their hands.
 */
export type ProjectCategory = 'software' | 'electronics' | 'comms' | 'mechanical';

/**
 * Declared size, and a promise about length (CLAUDE.md §4):
 *   small 1-5 days · medium 5-10 days · large 10-30 days
 * `npm run project-times` checks every entry against its declared tier.
 */
export type ProjectTier = 'small' | 'medium' | 'large';

/** A buildable thing. Content, not state — see ProjectData for a live one. */
export interface ProjectDef {
  id: string;
  name: string;
  category: ProjectCategory;
  tags: Tag[];
  era: number;
  tier: ProjectTier;
  blurb: string;
  /** How many people can work it at once. The real constraint on running projects. */
  teamSize: number;
  /** Work units per stage; anything omitted falls back to the stage default. */
  work: Partial<Record<StageKey, number>>;
  parts: Omit<PartData, 'id' | 'status' | 'attempts'>[];
  /** Bill of materials: what the bought parts cost and how long they take to arrive. */
  bomCost: number;
  leadDays: number;
  /** Machine types the space must already own. */
  requires: MachineType[];
  /** Tool projects hand you a machine when they ship. */
  unlocksMachine?: MachineType;
  /** Reputation/attention on release; the Phase 2 hype system will consume this. */
  hype: number;
  /** Money on release. Placeholder until the Phase 3 economy lands. */
  payout: number;
  /**
   * A second wing the build leans on — the drone's boards, the kiosk's screen. Karma
   * projects (design §5.3): some design options will want somebody from it on the crew.
   */
  secondary?: ProjectCategory;
  /** A player's own idea (design §6.2): a template of a wing and a size, named by them. */
  custom?: boolean;
  /**
   * A print order (§5): somebody else's job for a fixed price and a due date. Never in the
   * New Project wizard — these arrive in the Machines panel.
   */
  order?: { client: string; days: number; series?: boolean };
}

/** Something on the Build panel's shelves: a workstation or table, a printer, or a comfort. */
export interface BuyItem {
  kind: 'furniture' | 'printer' | 'amenity';
  id: string;
}

/** A print order on offer in the Machines panel, before anybody has said yes to it. */
export interface PrintOffer {
  id: string;
  defId: string;
  /** Days the client gives you from the day you accept. */
  days: number;
  /** The last day it can be accepted. */
  expiresOnDay: number;
}

export type BacklogSource = 'catalog' | 'member' | 'sponsor';

/**
 * The decisions a project is designed with (CLAUDE.md §4d). Each genre asks three of these,
 * and every answer is one of three options — a one-star shortcut, the three-star default and
 * a five-star version that costs something real.
 */
export type DesignAxisId =
  | 'editor'
  | 'ui'
  | 'architecture'
  | 'board'
  | 'firmware'
  | 'enclosure'
  | 'cadtool'
  | 'material'
  | 'validation'
  | 'docs'
  // The design step as three questions (design §5.4): one approach for every wing, and the
  // scope in each wing's own words. The axes above are kept for builds shipped before it.
  | 'approach'
  | 'distribution'
  | 'platforms'
  | 'power'
  | 'range'
  | 'drive';

/** Option index per axis: 0 is the one-star choice, 2 the five-star one. */
export type DesignChoice = Partial<Record<DesignAxisId, number>>;

/** What the New Project wizard hands the sim: the design, and how many seats. */
export interface ProjectPlan {
  design: DesignChoice;
  /** Seats at the table — the crew size the project is planned for. */
  seats: number;
  /**
   * The crew's best level in each wing (design §5.4). It picks the technology and locks any
   * option above it. Absent, nothing is locked — the harnesses' default.
   */
  levels?: Partial<Record<ProjectCategory, number>>;
}

/** An offer sitting in the backlog waiting to be pitched. */
export interface BacklogEntry {
  id: string;
  defId: string;
  source: BacklogSource;
  /** Member who proposed it — they arrive pre-committed. */
  proposerId?: string;
  /** Sponsor money paid up front, with strings. */
  sponsorCash?: number;
  /** Day the offer disappears. */
  expiresOnDay?: number;
}

export interface ProjectData {
  id: string;
  defId: string;
  name: string;
  category: ProjectCategory;
  tags: Tag[];
  stage: StageKey;
  /** Accumulated work per stage. */
  progress: Record<StageKey, number>;
  /** Work required per stage for this specific project. */
  required: Record<StageKey, number>;
  /** 0-1, set by CAD quality and damaged by rushed stages. */
  quality: number;
  scope: number;
  /** Member ids allocated to this project. */
  team: string[];
  teamSize: number;
  parts: PartData[];
  defects: string[];
  simulationSkipped: boolean;
  testAttempts: number;
  shipped: boolean;
  /** Bill of materials. Assembly blocks until the order lands. */
  bomCost: number;
  leadDays: number;
  partsOrdered: boolean;
  /** Absolute sim-hour the order arrives. */
  partsArriveAt: number;
  sponsorCash: number;
  /** Everything this build has cost: design budget and parts. */
  spent: number;
  proposerId?: string;
  startedOnDay: number;
  /** Consecutive days with nobody — crew or player — working on it. */
  idleDays: number;
  /**
   * Trait moments this build has already had (§3): 'scope:kickoff', 'perfectionist:cad',
   * 'mentor', … — so each is told once per build rather than on every tick.
   */
  traitNotes?: string[];
  /** A Documenter wrote this build's docs: louder at release. */
  documented?: boolean;
  /** What the review promised at the pitch (`forecastBuild`), for the ship report. */
  forecast?: { quality: number; days: number; payout: number; hype: number };
  /** A print order: the agreed price, whose it is, and the last day it can be handed over. */
  order?: { pay: number; client: string; dueDay: number };
  /** How it was designed (§4d). */
  design: DesignChoice;
  /**
   * Quality that comes from the work itself: craft blended in over CAD and Iterate. The
   * `quality` field above is this plus `bonus`, kept in step so every reader stays simple.
   */
  craft: number;
  /** Quality from the design and from the size of the crew that planned it. */
  bonus: number;
  /** Market appeal from the design — multiplies payout and hype at release. */
  appeal: number;
  /** Multiplier on the chance the build fails its test. */
  testRisk: number;
  /** The project table it holds for its kickoff, if it has one. */
  tableId: string | null;
  /** True once the whole crew has sat down together and planned it. */
  kickedOff: boolean;
  /** Work each person has put into the current stage, for the bar over their head. */
  contrib: Record<string, number>;
  /**
   * Work each person has put into the whole build, every stage — who actually made it, for
   * the project's detail screen. `player` is you. Older saves have none.
   */
  effort?: Record<string, number>;
  /**
   * Working days each crew member was missing while the rest of the crew waited to kick
   * off. At `KICKOFF.missLimit` the crew goes ahead without them.
   */
  kickoffMisses?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Machines (CLAUDE.md §5)
// ---------------------------------------------------------------------------

export type MachineType =
  | 'fdm'
  | 'bench'
  | 'assembly'
  | 'cad-desk'
  | 'lounge'
  | 'cnc'
  | 'reflow'
  | 'drybox'
  /** Project tables (§4d). Nothing is built on them — they are where a crew plans. */
  | 'table-small'
  | 'table-large'
  /** Where somebody goes to get better at a skill (§4c). */
  | 'learning';

export interface JobSnapshot {
  id: string;
  projectId: string;
  partName: string;
  hoursRequired: number;
  progress: number;
  material: number;
}

export interface MachineSnapshot {
  id: string;
  type: MachineType;
  label: string;
  tile: Tile;
  running: boolean;
  /** 0-1 — drifts down with use, raises failure odds (CLAUDE.md §5). */
  current: JobSnapshot | null;
  queue: JobSnapshot[];
  /** Estimated failure chance for the current job, for the UI. */
  risk: number;
}

// ---------------------------------------------------------------------------
// Store-side runtime snapshot — the sim's only channel to the UI (CLAUDE.md §11)
// ---------------------------------------------------------------------------

export interface RuntimeSnapshot {
  /** Games being played at the comforts right now — two players at one table (§7b). */
  games?: { amenityId: string; players: [string, string] }[];
  members: MemberSnapshot[];
  machines: MachineSnapshot[];
  projects: ProjectData[];
  player: PlayerSnapshot | null;
  rivals: RivalState[];
  /** Where we are in the run-up to the next awards night. */
  season: { year: number; dayOfYear: number; length: number };
  /**
   * Days until somebody new is likely to get in touch. Difficulty sets the pace (§3c), and a
   * pace the player cannot see reads as the applicant list being broken — see §13.
   */
  recruitIn: number;
  /** Every project table, and whose kickoff it is hosting. */
  tables: TableSnapshot[];
  /**
   * People standing about because every seat of a kind is taken, by station type. A queue
   * the player cannot see reads as people being lazy; this is what the Build panel shows.
   */
  waitingFor: Partial<Record<MachineType, number>>;
  /** Seats per station type the space owns — its working capacity, for the Build panel. */
  seats: Partial<Record<MachineType, number>>;
}

export interface TableSnapshot {
  id: string;
  type: MachineType;
  label: string;
  seats: number;
  projectId: string | null;
}

// ---------------------------------------------------------------------------
// The scene: other spaces, and the yearly awards (CLAUDE.md §11)
// ---------------------------------------------------------------------------

export interface RivalState {
  id: string;
  projects: number;
  members: number;
  cash: number;
  reputation: number;
  /** Fraction of their current build that is done. */
  progress: number;
  /** Their best single build since the last awards night, by hype. Cleared on the night. */
  bestBuild: { name: string; score: number } | null;
  /**
   * Their loudest builds of all time, a handful, for the projects table (design §6.2):
   * spaces are ranked against each other, and so are the things they made.
   */
  hits?: { name: string; score: number }[];
}

/** One line of the leaderboard — the player and every rival share this shape. */
export interface ScoreRow {
  id: string;
  name: string;
  icon: string;
  colour: string;
  projects: number;
  projectsThisYear: number;
  members: number;
  cash: number;
  reputation: number;
  reputationThisYear: number;
  /** Reputation earned this year as a share of what they walked in with. */
  growthThisYear: number;
  /** The best single build this year, by the hype it made — Best Project. */
  bestBuild: { name: string; score: number } | null;
  isPlayer: boolean;
}

/** A project that made it out of the door. */
export interface ShippedRecord {
  id: string;
  defId: string;
  name: string;
  category: ProjectCategory;
  day: number;
  quality: number;
  payout: number;
  hype: number;
  /** How long it took, start to ship. */
  days: number;
  /** What it cost to make, so the record can show a profit rather than a takings. */
  spent: number;
  testAttempts: number;
  failedPrints: number;
  /**
   * Who made it and how much of it each of them made (§4e) — shares of the whole build's
   * work, `player` being you. Absent on records from before the detail screen.
   */
  crew?: { id: string; name: string; share: number }[];
  /** The three design choices, for the rating and the detail. */
  design?: DesignChoice;
  /** How the payout was reached: the brief's price and each multiplier on it. */
  pay?: { base: number; market: number; appeal: number; quality: number; novelty: number };
  /** What the review promised at the pitch — the ship report's yardstick. */
  forecast?: { quality: number; days: number; payout: number; hype: number };
  /** A print order: what the client paid is the whole story. */
  order?: boolean;
  /**
   * A promotion bought from the report (§4c): what it cost, the reputation it adds in all,
   * and how much of that has arrived — it drips in over `PROMO.days`.
   */
  promo?: { cost: number; gain: number; paid: number };
}

/**
 * A build that never shipped (§13's shelf, §5's print orders): what it was, how far it got,
 * what it cost and what it took off the space's name. Kept so the Projects panel can show
 * the misses beside the ships — a ledger with only the wins in it flatters.
 */
export interface FailedRecord {
  id: string;
  defId: string;
  name: string;
  category: ProjectCategory;
  day: number;
  startedOnDay: number;
  reason: 'missed' | 'shelved';
  /** Reputation it cost. */
  rep: number;
  spent: number;
  /** How far it got, 0-1. */
  progress: number;
}

/** What the player named and badged their space. */
export interface Identity {
  name: string;
  icon: string;
  colour: string;
  /** What the player is called in the room. Older saves have none and read as "You". */
  player?: string;
  /** The money's symbol (never a rate). Older saves have none and are in lira. */
  currency?: CurrencyKey;
  /** The two on day one, renamed at the start. Missing or blank: Safa and Abdullah. */
  founders?: string[];
}

export interface LogEntry {
  id: string;
  day: number;
  time: number;
  /** A message rendered at display time, so the log follows a language switch. Older saves
   *  and the dev console carry a plain string, which is shown as it is. */
  text: Text;
  kind: 'info' | 'good' | 'bad' | 'warn';
  /** Consecutive repeats, collapsed into one line rather than flooding the log. */
  repeats?: number;
  /** A notification's glyph on its toast (an `IconName`); the kind picks one otherwise. */
  icon?: string;
}
