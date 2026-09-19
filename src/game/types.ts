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
  /** Hours per week they actually show up. The honest capacity constraint. */
  commitment: number;
  traits: TraitKey[];
  /** Hour-of-day window they tend to appear in. */
  window: [number, number];
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
  present: boolean;
  activity: MemberActivity;
  /** Project they are on the team of, if any. One project at a time. */
  team: string | null;
  interest: number;
  /** Best passion overlap with each active project, for the allocation UI. */
  affinity: Record<string, number>;
  energy: number;
  mood: number;
  tile: Tile;
  /** Smooth world position for rendering. */
  pos: { x: number; y: number };
  note: string;
}

export type MemberActivity = 'away' | 'idle' | 'walking' | 'working' | 'resting' | 'babysitting';

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
  strain: number;
  burntOut: boolean;
  task: Assignment | null;
  tile: Tile;
  pos: { x: number; y: number };
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

export type ProjectCategory = 'electronics' | 'mechanical' | 'tool' | 'civic';

/** A buildable thing. Content, not state — see ProjectData for a live one. */
export interface ProjectDef {
  id: string;
  name: string;
  category: ProjectCategory;
  tags: Tag[];
  era: number;
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
  proposerId?: string;
  startedOnDay: number;
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
  | 'drybox';

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
}

export interface LogEntry {
  id: string;
  day: number;
  time: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'warn';
}
