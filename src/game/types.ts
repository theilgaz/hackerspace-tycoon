import type { Tile } from '@/utils/grid';

// ---------------------------------------------------------------------------
// People (CLAUDE.md §3)
// ---------------------------------------------------------------------------

export type SkillKey = 'cad' | 'electronics' | 'machining' | 'welding' | 'software' | 'docs';
export type Skills = Record<SkillKey, number>;

/** Passion tags — the currency of the influence model. */
export type Tag = 'fpv' | 'electronics' | 'machining' | 'cad' | 'woodworking' | 'food' | 'software' | 'design';

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

/** What the sim knows about a member right now; mirrored to the store for the UI. */
export interface MemberSnapshot {
  id: string;
  name: string;
  present: boolean;
  activity: MemberActivity;
  /** Stage they have signed themselves up for, if any. */
  signedUp: StageKey | null;
  interest: number;
  energy: number;
  mood: number;
  tile: Tile;
  /** Smooth world position for rendering. */
  pos: { x: number; y: number };
  note: string;
}

export type MemberActivity = 'away' | 'idle' | 'walking' | 'working' | 'resting' | 'babysitting';

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
  /** Work units required. Fabrication is machine-driven and carries 0. */
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

export interface ProjectData {
  id: string;
  name: string;
  tags: Tag[];
  stage: StageKey;
  /** Accumulated work per stage. */
  progress: Record<StageKey, number>;
  /** 0-1, set by CAD quality and damaged by rushed stages. */
  quality: number;
  scope: number;
  parts: PartData[];
  defects: string[];
  /** Stages that have an active bounty on them. */
  bounties: StageKey[];
  simulationSkipped: boolean;
  testAttempts: number;
  shipped: boolean;
}

// ---------------------------------------------------------------------------
// Machines (CLAUDE.md §5)
// ---------------------------------------------------------------------------

export type MachineType = 'fdm' | 'bench' | 'assembly' | 'cad-desk' | 'lounge';

export interface JobSnapshot {
  id: string;
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
  project: ProjectData | null;
}

export interface LogEntry {
  id: string;
  day: number;
  time: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'warn';
}
