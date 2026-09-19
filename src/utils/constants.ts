import type { MemberData, SkillKey, Skills, StageDef, StageKey, TraitKey } from '@/game/types';

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
  /** Second worker contributes this much; each further one decays by `crowdDecay`. */
  extraWorkerFactor: 0.6,
  crowdDecay: 0.85,
  /** Hard ceiling regardless of team size — a bench only fits so many elbows. */
  maxWorkersPerStage: 8,
  /** Energy drained per sim-hour of work; restored per sim-hour in the lounge. */
  energyDrain: 5.5,
  energyRestore: 14,
  /** Below this energy a member goes to the lounge instead of working. */
  tiredThreshold: 25,
  /** Mood nudges rate by ±this at the extremes. */
  moodRateSwing: 0.3,
};

/** Allocating people to project teams (§3b). */
export const TEAM = {
  /**
   * You can ask anyone to join, but they are volunteers: a poor passion match is likely
   * to be turned down, and being asked again immediately is not welcome.
   */
  acceptBase: 0.42,
  acceptFromPassion: 0.75,
  /** A live bounty on the project makes a "no" much less likely. */
  bountyAcceptBonus: 0.3,
  /** Hours before you can ask the same person about the same project again. */
  declineCooldownHours: 14,
  /** Interest they start with when they accept, scaled by passion match. */
  joinInterest: 1.0,
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

// --- The player (§3a) -------------------------------------------------------

/**
 * You are a member too, but a bounded one. Hours are the currency shared between
 * *making* and *managing*: every hour spent doing the CAD yourself is an hour not spent
 * recruiting the person who would do it faster. This is the only thing standing between
 * the influence model and "tycoon where you are simply the best employee".
 */
export const PLAYER = {
  name: 'You',
  /** Hours available on a full-energy day. */
  baseHours: 7,
  minHours: 3,
  /** Energy per hour of work; restored overnight. Working flat out shrinks tomorrow. */
  energyDrain: 7,
  energyRestore: 42,
  /** Below this you are burnt out: shorter days until you back off. */
  burnoutEnergy: 30,
  /** Hour of day you can start; you leave when the budget is gone. */
  startHour: 9,
  walkSpeed: 22,
};

/** What each management verb costs you in hours (§3). */
export const VERB_HOURS: Record<string, number> = {
  pitch: 2,
  repitch: 1,
  bounty: 1,
  order: 1,
  expedite: 1,
  filament: 0.5,
};

// --- Eras (§8) --------------------------------------------------------------

export interface EraDef {
  era: number;
  name: string;
  /** Concurrent projects. Era 1 is deliberately one: learn the pipeline first. */
  slots: number;
  /**
   * Cumulative reputation before the next era opens. Deliberately *not* a project count:
   * three weekend builds would otherwise unlock Era 2 by day six. Reputation is a
   * project's hype, so ambition advances you and volume barely does.
   */
  repToAdvance: number;
}

/**
 * Minimal era progression: slots and catalog only. The space itself grows in Phase 4 and
 * the real milestones (member count, break-even, front page) arrive with Phases 3/5.
 */
/**
 * Slots are deliberately generous: the honest limit on how much you can run at once is
 * *people*, since a member can only be on one team and every project has a team size.
 * A hard slot cap of 1 made the whole backlog inert while anything was in progress.
 */
export const ERAS: EraDef[] = [
  { era: 1, name: 'The Garage', slots: 2, repToAdvance: 550 },
  { era: 2, name: 'Unit 4B', slots: 4, repToAdvance: 2600 },
  { era: 3, name: 'The Warehouse', slots: 6, repToAdvance: Number.POSITIVE_INFINITY },
];

export function eraDef(era: number): EraDef {
  return ERAS[Math.min(ERAS.length, Math.max(1, era)) - 1];
}

// --- Backlog (§4a) ----------------------------------------------------------

export const BACKLOG = {
  /** Chance per day that somebody proposes something they are excited about. */
  memberProposalChance: 0.16,
  /** Chance per day of a sponsor offer with cash attached. */
  sponsorChance: 0.07,
  /** Chance per day that a subreddit gets obsessed with something. */
  trendingChance: 0.1,
  /** Sponsor cash as a fraction of the project's bill of materials. */
  sponsorCashRatio: [0.5, 1.1] as [number, number],
  sponsorDeadlineDays: [7, 14] as [number, number],
  trendingDeadlineDays: [5, 12] as [number, number],
  trendingHypeMultiplier: [1.4, 2.2] as [number, number],
  /** A proposer arrives already committed to the project. */
  proposerInterestBonus: 0.5,
  maxOffers: 5,
};

/** Waiting on parts is its own bottleneck, and it is what makes IoT builds feel different. */
export const SOURCING = {
  /** Expediting costs this multiple of the remaining order value... */
  expediteCostRatio: 0.8,
  /** ...and cuts the remaining wait by this much. */
  expediteFactor: 0.45,
};

// --- Content: the roster ----------------------------------------------------

/**
 * Print times are deliberately chunky (~43 machine-hours for a full set). At the original
 * ~21h, fabrication was 3% of a playthrough and the machine queue — the game's signature
 * system — never mattered. The frame plate is the one that hurts to lose.
 */

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
    passions: { fpv: 0.9, electronics: 0.6, iot: 0.45, software: 0.35, retro: 0.35, radio: 0.3 },
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
    passions: { cad: 0.75, design: 0.65, robotics: 0.45, fpv: 0.35, machining: 0.3 },
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
    passions: { machining: 0.65, civic: 0.55, woodworking: 0.45, fpv: 0.4, food: 0.35 },
    energy: 80,
    mood: 60,
    commitment: 8,
    traits: ['ghost'],
    window: [13, 21],
  },
  {
    id: 'mehmet',
    name: 'Mehmet',
    skills: skills({ electronics: 3, machining: 3, docs: 2 }),
    passions: { iot: 0.7, electronics: 0.6, fpv: 0.45 },
    energy: 88,
    mood: 72,
    commitment: 15,
    traits: [],
    window: [9, 18],
  },
  {
    id: 'bektas',
    name: 'Bektaş',
    skills: skills({ machining: 3, welding: 4, electronics: 2 }),
    passions: { fpv: 0.7, machining: 0.6, robotics: 0.45 },
    energy: 90,
    mood: 66,
    commitment: 14,
    traits: [],
    window: [12, 20],
  },
  {
    id: 'safa',
    name: 'Safa',
    skills: skills({ software: 4, electronics: 3, docs: 3 }),
    passions: { iot: 0.8, software: 0.7, civic: 0.4 },
    energy: 85,
    mood: 72,
    commitment: 12,
    traits: ['documenter'],
    window: [18, 24],
  },
];

/**
 * People who turn up as the space builds a reputation (§5). They are not members yet —
 * shipping a project attracts one or two whose passions match what you just built, which
 * is the "projects and tools are magnets" idea made concrete.
 */
export const APPLICANTS: MemberData[] = [
  {
    id: 'zahid',
    name: 'Zahid',
    skills: skills({ machining: 4, welding: 3, cad: 2 }),
    passions: { machining: 0.85, woodworking: 0.5, robotics: 0.4 },
    energy: 88, mood: 65, commitment: 10, traits: ['gatekeeper'], window: [12, 20],
  },
  {
    id: 'ibrahim',
    name: 'İbrahim',
    skills: skills({ cad: 4, machining: 2, docs: 2 }),
    passions: { cad: 0.8, design: 0.75, fpv: 0.3 },
    energy: 82, mood: 78, commitment: 9, traits: ['mentor'], window: [10, 17],
  },
  {
    id: 'omer',
    name: 'Ömer',
    skills: skills({ electronics: 4, software: 3 }),
    passions: { radio: 0.85, electronics: 0.6, iot: 0.5 },
    energy: 80, mood: 68, commitment: 16, traits: ['nightOwl'], window: [19, 24],
  },
  {
    id: 'furkan',
    name: 'Furkan',
    skills: skills({ software: 4, cad: 3, electronics: 2 }),
    passions: { robotics: 0.8, software: 0.65, design: 0.35 },
    energy: 86, mood: 74, commitment: 11, traits: ['scopeCreeper'], window: [13, 21],
  },
  {
    id: 'yakup',
    name: 'Yakup',
    skills: skills({ machining: 3, welding: 2, cad: 2 }),
    passions: { woodworking: 0.8, food: 0.6, machining: 0.45 },
    energy: 78, mood: 62, commitment: 7, traits: ['ghost'], window: [14, 21],
  },
  {
    id: 'fatih',
    name: 'Fatih',
    skills: skills({ electronics: 4, docs: 2, cad: 2 }),
    passions: { retro: 0.85, electronics: 0.65, design: 0.4 },
    energy: 84, mood: 70, commitment: 13, traits: ['perfectionist'], window: [11, 19],
  },
  {
    id: 'arif',
    name: 'Arif',
    skills: skills({ docs: 4, software: 2, electronics: 2 }),
    passions: { civic: 0.85, iot: 0.5, software: 0.35 },
    energy: 80, mood: 76, commitment: 8, traits: ['documenter'], window: [10, 18],
  },
  {
    id: 'safa-kemal',
    name: 'Safa Kemal',
    skills: skills({ cad: 5, software: 4 }),
    passions: { cad: 0.8, design: 0.7, robotics: 0.5 },
    energy: 76, mood: 80, commitment: 6, traits: ['mentor'], window: [20, 24],
  },
  {
    id: 'abdullah',
    name: 'Abdullah',
    skills: skills({ software: 3, electronics: 3, docs: 3 }),
    passions: { radio: 0.7, software: 0.6, civic: 0.5 },
    energy: 82, mood: 70, commitment: 9, traits: ['nightOwl'], window: [17, 24],
  },
];

/** §5 — shipping something attracts people who care about that kind of thing. */
export const RECRUIT = {
  /** Applicants drawn in by a shipped project. */
  perShip: [1, 2] as [number, number],
  /** Passion match below this and the project does not tempt them at all. */
  matchFloor: 0.25,
};

/** A capable generalist — good enough to unblock anything, not good enough to do it all. */
export const PLAYER_SKILLS: Skills = {
  cad: 3,
  electronics: 3,
  machining: 2,
  welding: 1,
  software: 3,
  docs: 2,
};

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
