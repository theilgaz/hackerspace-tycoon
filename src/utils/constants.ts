import type { MemberData, PartData, SkillKey, StageDef, StageKey, Tag, TraitKey } from '@/game/types';

// ---------------------------------------------------------------------------
// BALANCE CONSTANTS — starting values for the open questions in CLAUDE.md §13.
// Every tuning number in the game lives here. Never inline one at a call site.
// Time unit: sim-hours. 1 sim-hour = 2.5 real seconds at 1x.
// ---------------------------------------------------------------------------

export const TIME = {
  /** Real seconds per sim-hour at 1x speed. */
  secondsPerHour: 2.5,
  hoursPerDay: 24,
  speeds: [1, 2, 4] as const,
  /** Sim writes its snapshot to the store at this rate (CLAUDE.md §11). */
  snapshotInterval: 0.2,
};

export const START_CASH = 4000;

/** Filament: the slice's only consumable. Phase 3 expands this into a real economy. */
export const FILAMENT = {
  spoolGrams: 1000,
  spoolCost: 450,
  lowWarning: 200,
};

// --- People -----------------------------------------------------------------

export const MEMBER = {
  /** Tiles per sim-hour. Tuned so a cross-garage walk reads on screen (~1s at 1x)
   * without eating the visit: at 2.6 it consumed 80% of every volunteer's day. */
  walkSpeed: 22,
  /** §13.2 commitment (h/week) → chance of showing up on a given day. */
  showUpPerCommitmentHour: 0.055,
  /** Work units produced per sim-hour at skill 1, mood 50, full energy. */
  baseWorkRate: 1.0,
  /** Each skill level above 1 adds this much rate. */
  skillRateBonus: 0.35,
  /** Working a stage outside your passion costs this much rate. */
  offPassionPenalty: 0.7,
  /** Additional members on the same stage contribute at this factor. */
  extraWorkerFactor: 0.6,
  maxWorkersPerStage: 3,
  /** Energy drained per sim-hour of work; restored per sim-hour in the lounge. */
  energyDrain: 5.5,
  energyRestore: 14,
  /** Below this energy a member goes to the lounge instead of working. */
  tiredThreshold: 25,
  /** Mood nudges rate by ±this at the extremes. */
  moodRateSwing: 0.3,
};

/** §13.1 — passion match → willingness to sign up for a stage. */
export const DRIFT = {
  /** Interest a member starts with when they sign up (scaled by passion match). */
  startInterest: 1.0,
  /** Interest lost per sim-hour worked, scaled by (1 - stage appeal). */
  decayPerHour: 0.055,
  /** Below this, the member unsigns and drifts off the project. */
  abandonThreshold: 0.25,
  /** A bounty restores this much interest on its stage. */
  bountyInterest: 0.75,
  /** Passion match below this and they will not sign up at all — a dead pitch. */
  signupThreshold: 0.25,
  /** Re-pitching costs nothing but only re-rolls members not already signed up. */
  repitchBonus: 0.15,
  /** After drifting off a stage they will not touch it again for this long. Without
   * this, drift is cosmetic: they abandon and re-sign on the very next tick. */
  cooldownHours: 16,
};

export const BOUNTY = {
  /** Cost scales with remaining work on the stage. */
  costPerWorkUnit: 14,
  minCost: 150,
  /**
   * A bounty must move the binding constraint, and the binding constraint is attendance —
   * not interest. Interest only matters for somebody already in the building. Cash and
   * pizza are exactly what makes a volunteer turn up on a Tuesday evening.
   * Posted today, felt tomorrow: planDay() runs at the day rollover.
   */
  attendanceBoost: 1.75,
  stayBoost: 1.45,
  /** Passion match needed before the bounty tempts them in at all. */
  temptThreshold: 0.3,
};

// --- Machines (§5, §13.3) ---------------------------------------------------

export const MACHINE = {
  /** Base chance a job fails *at some point* over its full duration. */
  baseJobFailure: 0.14,
  /** Calibration 1.0 → no penalty; 0.0 → this multiplier on failure chance. */
  calibrationPenalty: 2.6,
  /** Each operator skill level above 1 multiplies failure chance by this. */
  operatorSkillFactor: 0.82,
  /** Calibration lost per sim-hour of running. */
  calibrationDrift: 0.011,
  /** Calibration restored per sim-hour of a member calibrating. */
  calibrationRestore: 0.35,
  /** Below this the UI nags and failure odds bite. */
  calibrationWarning: 0.55,
  /** A failed job wastes this fraction of the part's material. */
  wasteOnFailure: 0.85,
};

export const FAB = {
  /**
   * A failed part drops back to `pending` and waits for the player to re-queue it —
   * that decision costs filament, so it should be the player's. But if nobody is
   * watching, someone in the building eventually just hits print again. Without this
   * the game soft-locks in fabrication forever after the first failure.
   */
  memberRequeueHours: 12,
};

// --- Project pipeline (§4) --------------------------------------------------

export const STAGES: StageDef[] = [
  {
    key: 'concept',
    label: 'Concept',
    skill: null,
    work: 18,
    optional: false,
    appeal: 0.95,
    blurb: 'Arguing about it on a whiteboard. Everyone loves this part.',
  },
  {
    key: 'cad',
    label: 'CAD',
    skill: 'cad',
    work: 70,
    optional: false,
    appeal: 0.7,
    blurb: 'Modelling the parts. Output quality gates everything downstream.',
  },
  {
    key: 'simulation',
    label: 'Simulation',
    skill: 'software',
    work: 34,
    optional: true,
    appeal: 0.35,
    blurb: 'Stress and flight sim. Optional — skipping it raises test failure odds.',
  },
  {
    key: 'fabrication',
    label: 'Fabrication',
    skill: null,
    work: 0,
    optional: false,
    appeal: 0.5,
    blurb: 'Machine jobs. Runs on the clock, not on attendance.',
  },
  {
    key: 'assembly',
    label: 'Assembly',
    skill: 'electronics',
    work: 55,
    optional: false,
    appeal: 0.45,
    blurb: 'Wiring, soldering, swearing at heat-shrink.',
  },
  {
    key: 'test',
    label: 'Test',
    skill: null,
    work: 0,
    optional: false,
    appeal: 0.9,
    blurb: 'Does it fly, or does it become a lesson?',
  },
  {
    key: 'iterate',
    label: 'Iterate',
    skill: 'cad',
    work: 40,
    optional: false,
    appeal: 0.25,
    blurb: 'Fixing what the test broke. Nobody signs up for this.',
  },
  {
    key: 'release',
    label: 'Release',
    skill: 'docs',
    work: 30,
    optional: false,
    appeal: 0.1,
    blurb: 'Documentation. It will need a bounty. It always needs a bounty.',
  },
];

export const STAGE_MAP: Record<StageKey, StageDef> = Object.fromEntries(
  STAGES.map((s) => [s.key, s]),
) as Record<StageKey, StageDef>;

export const STAGE_ORDER: StageKey[] = STAGES.map((s) => s.key);

/** §13.6 — test failure odds. */
export const TEST = {
  /** Base pass chance at quality 1.0 with simulation done. */
  basePass: 0.55,
  qualityWeight: 0.4,
  /** Multiplier on failure chance when simulation was skipped. */
  skippedSimPenalty: 1.9,
  /** Each previous attempt makes it likelier to pass — you learned something. */
  attemptBonus: 0.12,
};

// --- Content: the slice's project and roster --------------------------------

/**
 * Print times are deliberately chunky (~43 machine-hours for a full set). At the original
 * ~21h, fabrication was 3% of a playthrough and the machine queue — the game's signature
 * system — never mattered. The frame plate is the one that hurts to lose.
 */
export const DRONE_PARTS: Omit<PartData, 'id' | 'status' | 'attempts'>[] = [
  { name: 'Frame Plate', machineType: 'fdm', hours: 11, material: 180 },
  { name: 'Arm (FL)', machineType: 'fdm', hours: 5, material: 75 },
  { name: 'Arm (FR)', machineType: 'fdm', hours: 5, material: 75 },
  { name: 'Arm (RL)', machineType: 'fdm', hours: 5, material: 75 },
  { name: 'Arm (RR)', machineType: 'fdm', hours: 5, material: 75 },
  { name: 'Canopy', machineType: 'fdm', hours: 6, material: 95 },
  { name: 'Camera Mount', machineType: 'fdm', hours: 2.5, material: 30 },
  { name: 'Battery Tray', machineType: 'fdm', hours: 4, material: 55 },
];

export const PROJECT_TAGS: Tag[] = ['fpv', 'electronics', 'cad'];

function skills(partial: Partial<Record<SkillKey, number>>): Record<SkillKey, number> {
  return {
    cad: 1,
    electronics: 1,
    machining: 1,
    welding: 1,
    software: 1,
    docs: 1,
    ...partial,
  };
}

export const ROSTER: MemberData[] = [
  {
    id: 'deniz',
    name: 'Deniz',
    skills: skills({ cad: 3, electronics: 4, software: 2 }),
    passions: { fpv: 0.9, electronics: 0.55, software: 0.3 },
    energy: 85,
    mood: 70,
    commitment: 14,
    traits: ['nightOwl'],
    window: [17, 24],
  },
  {
    id: 'ada',
    name: 'Ada',
    skills: skills({ cad: 4, machining: 2, docs: 2 }),
    passions: { cad: 0.75, design: 0.6, fpv: 0.35 },
    energy: 90,
    mood: 75,
    commitment: 10,
    traits: ['perfectionist'],
    window: [10, 18],
  },
  {
    id: 'kerem',
    name: 'Kerem',
    skills: skills({ machining: 3, welding: 2, electronics: 2, docs: 2 }),
    passions: { machining: 0.65, fpv: 0.4 },
    energy: 80,
    mood: 60,
    commitment: 8,
    traits: ['ghost'],
    window: [13, 21],
  },
];

export const TRAIT_LABEL: Record<TraitKey, string> = {
  perfectionist: 'Perfectionist',
  scopeCreeper: 'Scope Creeper',
  mentor: 'Mentor',
  ghost: 'Ghost',
  gatekeeper: 'Gatekeeper',
  nightOwl: 'Night Owl',
  documenter: 'Documenter',
};

export const TRAIT_BLURB: Record<TraitKey, string> = {
  perfectionist: 'Will not advance a stage below quality threshold.',
  scopeCreeper: 'Adds requirements mid-project.',
  mentor: 'Raises effective skill of members in the same room.',
  ghost: 'Signs up, then attendance quietly decays.',
  gatekeeper: 'Blocks uncertified members from machines.',
  nightOwl: 'Works the hours nobody else will.',
  documenter: 'Actually does the docs. Without a bounty.',
};

/** §13.1 Perfectionist refuses to advance below this project quality. */
export const PERFECTIONIST_QUALITY_GATE = 0.55;
/** Ghost: attendance chance multiplier decays by this each day they attend. */
export const GHOST_DECAY = 0.82;
