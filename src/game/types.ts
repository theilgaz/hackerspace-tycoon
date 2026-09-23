import type { Text } from '@/i18n';
import type { Tile } from '@/utils/grid';

// ---------------------------------------------------------------------------
// People (CLAUDE.md §3)
// ---------------------------------------------------------------------------

export type SkillKey = 'cad' | 'electronics' | 'machining' | 'welding' | 'software' | 'docs';
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
/**
 * A standing job somebody holds on top of their build work (§3b). Roles exist to take the
 * chores off the player: the whole point of having fifteen people is that you should not
 * still be the one buying filament. A role is acted on at the holder's **next availability**
 * — it is a person doing it, not a background rule, so it waits until they are in.
 */
export type Role = 'manager' | 'printer' | 'quartermaster' | 'social';

export const ROLE_LABEL: Record<Role, string> = {
  manager: 'Project Manager',
  printer: 'Printer Keeper',
  quartermaster: 'Quartermaster',
  social: 'Social Media Manager',
};

export const ROLE_BLURB: Record<Role, string> = {
  manager: 'Starts something new when there are hands going spare.',
  printer: 'Loads the printers back up before they run dry.',
  quartermaster: 'Gets the parts on order so assembly is never waiting.',
  social: 'Keeps the feeds ticking over so attention never quite dies.',
};

export interface MemberSnapshot {
  id: string;
  name: string;
  role: Role | null;
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
}

// ---------------------------------------------------------------------------
// The player (CLAUDE.md §3a) — a member you *can* command, with scarce hours
// ---------------------------------------------------------------------------

export interface PlayerSnapshot {
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
export type ProjectCategory =
  | 'electronics'
  | 'software'
  | 'mechanical'
  | 'robotics'
  | 'iot'
  | 'radio'
  | 'tooling'
  | 'civic'
  | 'retro'
  | 'home';

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
}

export type BacklogSource = 'catalog' | 'member' | 'sponsor' | 'trending';

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
  | 'docs';

/** Option index per axis: 0 is the one-star choice, 2 the five-star one. */
export type DesignChoice = Partial<Record<DesignAxisId, number>>;

/** What the New Project wizard hands the sim: the design, and how many seats. */
export interface ProjectPlan {
  design: DesignChoice;
  /** Seats at the table — the crew size the project is planned for. */
  seats: number;
}

/** How loudly you said it (§6). The claim is the decision; the room judges it. */
export type ClaimKey = 'wip' | 'works' | 'bold';

/** The projectId a post carries when it is about the space rather than a build. */
export const SPACE_SUBJECT = '__space__';

/** One thing you put in front of Reddit, and what came back. */
export interface Post {
  id: string;
  projectId: string;
  projectName: string;
  subreddit: string;
  stage: StageKey;
  claim: ClaimKey;
  upvotes: number;
  hype: number;
  /** The top comment — it exists to explain the number, not to decorate it. */
  comment: string;
  burned: boolean;
  day: number;
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
  /** Trending topics pay out more hype if you ship while the wave lasts. */
  hypeMultiplier?: number;
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
  /** Stages that have an active bounty on them. */
  bounties: StageKey[];
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
  hypeMultiplier: number;
  /** Everything this build has cost: parts, bounties, expediting. */
  spent: number;
  proposerId?: string;
  startedOnDay: number;
  /** Consecutive days with nobody — crew or player — working on it. */
  idleDays: number;
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
  calibration: number;
  consumable: number;
  consumableMax: number;
  current: JobSnapshot | null;
  queue: JobSnapshot[];
  /** Estimated failure chance for the current job, for the UI. */
  risk: number;
}

// ---------------------------------------------------------------------------
// Store-side runtime snapshot — the sim's only channel to the UI (CLAUDE.md §11)
// ---------------------------------------------------------------------------

export interface RuntimeSnapshot {
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
  /** Upvotes their builds have drawn, all time. Shown on a space's own screen. */
  upvotes: number;
  /** Their best single build since the last awards night, by hype. Cleared on the night. */
  bestBuild: { name: string; score: number } | null;
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
  /** Upvotes this year. */
  upvotesThisYear: number;
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
}

/** What the player named and badged their space. */
export interface Identity {
  name: string;
  icon: string;
  colour: string;
  /** What the player is called in the room. Older saves have none and read as "You". */
  player?: string;
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
}
