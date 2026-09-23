import type { MachineType, MemberData, SkillKey, Skills, StageDef, StageKey, TraitKey } from '@/game/types';

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

/**
 * The working day. Nine to six with an hour for lunch, Monday to Friday — the space is a
 * workplace now, not a rota of whoever happens to drop in. **Everybody is full-time** (§3d):
 * a part-time shift existed, and a morning crew that never met its afternoon half was a
 * scheduling puzzle nobody enjoyed.
 *
 * You are the exception: the owner is there whenever they like, weekends included.
 */
export const WORKDAY = {
  start: 9,
  end: 18,
  lunchStart: 12,
  lunchEnd: 13,
  /** Monday is day 1; days 6 and 7 of each week are the weekend. */
  daysPerWeek: 7,
  workingDays: 5,
  /** Hours a day, net of lunch. */
  hours: 8,
  /** They are employed, so they turn up — barring mood, and whatever a Ghost is doing. */
  attendanceBase: 0.97,
};

/** Contracted hours a week — the same for everybody. */
export const WEEKLY_HOURS = WORKDAY.hours * WORKDAY.workingDays;

export function isWorkingDay(day: number): boolean {
  return (day - 1) % WORKDAY.daysPerWeek < WORKDAY.workingDays;
}

export function isLunch(hour: number): boolean {
  return hour >= WORKDAY.lunchStart && hour < WORKDAY.lunchEnd;
}

export const MEMBER = {
  /** Tiles per sim-hour. Tuned so a cross-garage walk reads on screen (~1s at 1x)
   * without eating the visit: at 2.6 it consumed 80% of every volunteer's day. */
  walkSpeed: 22,
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
/**
 * How the shop's comforts land on people (§7b). Mood is the channel: it already drives the
 * show-up roll and the work rate, and until the shop existed nothing in the game wrote to it.
 */
export const COMFORT = {
  /**
   * The ceiling on the mood a fully kitted space can add. Comforts are the one thing a
   * player can simply keep buying, so the sum runs through a saturation curve and the
   * fourth nice thing in a room is worth much less than the first.
   */
  moodCap: 26,
  /**
   * How much of the gap to the new mood a day closes. A coffee machine takes about three
   * days to be felt, which is right: nobody's week turns around the afternoon it arrives.
   */
  settle: 0.34,
};

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

/**
 * Building the same thing again is worth less every time. Without this the answer to every
 * question is "ship another Space Website" — the catalogue has cheap, fast entries on purpose
 * and they are meant to teach the pipeline, not to be farmed. Reputation and payout both fall
 * away; the work is the same, the novelty is not.
 */
export const REPEAT = {
  /** Multiplier applied per previous ship of the same design. */
  falloff: 0.75,
  /** However many times you have built it, it is never worth quite nothing. */
  floor: 0.4,
};

export const BOUNTY = {
  /** Cost scales with remaining work on the stage. */
  costPerWorkUnit: 14,
  minCost: 150,
  /**
   * What a live bounty does to the crew working that stage. It used to buy overtime — in
   * past six — but the crew's day is nine to six without exception now (§3d), so a bounty
   * buys effort instead: the stage nobody wanted, worked harder by whoever is on it. It
   * still pulls volunteers and eases an ask (`TEAM.bountyAcceptBonus`).
   */
  rateBonus: 1.3,
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
    label: 'Kickoff',
    skill: null,
    work: 18,
    optional: false,
    appeal: 0.95,
    blurb: 'The whole crew round the project table, agreeing what they are building.',
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
/**
 * You (§3a). **Your day is one number.** Energy and an hour budget used to be two resources
 * pointed at the same thing — you spent hours, which drained energy, which shrank tomorrow's
 * hours — and carrying both meant reading two bars to answer one question. There is now a
 * single span: you are in the building from `dayStart` and you have `dayHours` of work in
 * you, and when they are gone the day is over whatever the clock says.
 *
 * You start before the crew and finish long after them. That is the whole of your advantage,
 * and §3a's arc is that it stops mattering: eighteen hours is most of a garage's output and
 * a rounding error on a warehouse's.
 */
export const PLAYER = {
  name: 'You',
  /**
   * Your day, 06:00 to 23:00. **The span and the budget are the same seventeen hours** on
   * purpose: an eighteen-hour budget inside a seventeen-hour window could never be spent, so
   * the bar never emptied and the remainder was quietly thrown away at midnight. Work solidly
   * and you run out exactly as you lock up.
   */
  startHour: 6,
  endHour: 23,
  dayHours: 17,
  walkSpeed: 22,
};

/**
 * What each management verb costs you in hours (§3). Pitching is free: starting something
 * is a decision, not labour, and gating it on having hours left only meant a project you
 * had already chosen had to wait for tomorrow for no reason. The bill of materials, which
 * a pitch now pays up front, is the real brake on starting too much.
 */
export const VERB_HOURS: Record<string, number> = {
  pitch: 0,
  post: 1,
  repitch: 1,
  bounty: 1,
  order: 1,
  expedite: 1,
  filament: 0.5,
  hire: 1,
};

// --- Eras (§8) --------------------------------------------------------------

export interface EraDef {
  era: number;
  name: string;
  /**
   * Cumulative reputation before the next era opens. Deliberately *not* a project count:
   * three weekend builds would otherwise unlock Era 2 by day six. Reputation is a
   * project's hype, so ambition advances you and volume barely does.
   */
  repToAdvance: number;
  /**
   * What moving costs. **Signing the lease is the player's decision, not an automatic
   * promotion**: a bigger space raises the rent and the reputation that unlocked it does not
   * pay the removal van. Staying in the garage one more month to bank the cash is a real
   * option, and it used to happen *to* you on a day you had no say in.
   */
  moveCost: number;
}

/**
 * Minimal era progression: slots and catalog only. The space itself grows in Phase 4 and
 * the real milestones (member count, break-even, front page) arrive with Phases 3/5.
 */
/**
 * There is no cap on concurrent projects. The honest limit is *people*: somebody can only
 * be on one team at a time, and pitching costs two of your own hours. An artificial slot
 * count only ever made the job list inert while something was in progress.
 */
export const ERAS: EraDef[] = [
  // Rescaled when the slot cap came off: throughput roughly quadrupled, and the old
  // 550/2600 put a committed player in Era 3 by about day 40.
  { era: 1, name: 'The Garage', repToAdvance: 1800, moveCost: 0 },
  { era: 2, name: 'Unit 4B', repToAdvance: 6000, moveCost: 18000 },
  { era: 3, name: 'The Warehouse', repToAdvance: 22000, moveCost: 52000 },
  // After the warehouse: an old factory floor, brick walls and room for the public at scale.
  { era: 4, name: 'The Old Factory', repToAdvance: Number.POSITIVE_INFINITY, moveCost: 120000 },
];

export function eraDef(era: number): EraDef {
  return ERAS[Math.min(ERAS.length, Math.max(1, era)) - 1];
}

// --- Reddit and hype (§6) ---------------------------------------------------

/**
 * Attention, as numbers. The layer exists to be the **anti-drift clock**: hype decays every
 * day whether you touch it or not, and everything it feeds — who applies, how many of the
 * public pay to be here, whether a sponsor calls — sags with it. A project left at eighty
 * per cent therefore costs you something continuously, which nothing else in the game does.
 */
export const HYPE = {
  /** Upvotes a perfect post could reach before the room's own numbers scale it. */
  perPost: 900,
  hypePerUpvote: 0.55,
  /**
   * How much of a post's merit comes from build quality rather than how far through the
   * pipeline it is. Quality dominates, but a render is not a photograph.
   */
  meritFromQuality: 0.6,
  /**
   * Overreach × skepticism × this = how far the verdict falls. The teeth of the claim, and
   * they have to outweigh the claim's own multiplier or the answer is always "claim the most"
   * — which is exactly what the first measurement said: 181 bold posts, 0.8 of them punished.
   */
  backfire: 7,
  /** A post cannot do worse than this, so one bad call is a setback and not a run-ender. */
  worstVerdict: 0.6,
  /** Reputation lost per downvote when the room turns. Negative by construction. */
  reputationPerBurn: 0.12,
  /** Each repeat of the same build in the same room is worth this much less. */
  repeatPenalty: 0.8,
  /** Daily decay. About a fortnight to half — attention is a shelf life, not a stock. */
  decayPerDay: 0.05,
  /** Below this it is rounded away rather than left as a rounding tail. */
  floor: 1,
  /** Hype at which its effects are at half strength; the curve never saturates hard. */
  halfEffect: 700,
  /** At full pressure, word of mouth moves this many times faster. */
  recruitSpeedUp: 1.35,
  /** At full pressure, this many extra of the public are paying to use the place. */
  extraMembers: 30,
  /** Reputation at which a post about the space itself can back any claim. */
  spaceMeritAt: 4000,
  /** A photo of the place is always worth a look, but it is never the finished thing. */
  spaceInterest: 0.7,
  /** At full pressure, sponsors call this many times as often. */
  sponsorSpeedUp: 2.5,
};

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

/**
 * Every hackerspace has a shelf of projects nobody ever finished. With no cap on how many
 * you can start, this is what pushes back: a project nobody has touched for a fortnight is
 * quietly shelved, and whatever you already spent on its parts is gone. It punishes
 * over-pitching without ever refusing a pitch.
 */
export const SHELVE = {
  afterIdleDays: 14,
  /** Warn on the project card once it has been idle this long. */
  warnAfterIdleDays: 7,
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

/**
 * Day one: Safa and Abdullah are there from the start. Everybody else is hired (§5), and
 * which of them gets in touch first is shuffled per run (`LADDER`), so no two runs meet the
 * same people in the same order.
 */
export const ROSTER: MemberData[] = [
  {
    id: 'safa',
    name: 'Safa',
    skills: skills({ software: 4, electronics: 3, docs: 3 }),
    passions: { iot: 0.8, software: 0.7, civic: 0.4 },
    energy: 85,
    mood: 72,
    commitment: 12,
    traits: ['documenter'],
    // Routine working hours — unlike you, Safa has a day job to get back to.
    window: [9, 18],
  },
  {
    id: 'abdullah',
    name: 'Abdullah',
    skills: skills({ software: 3, electronics: 3, docs: 3 }),
    passions: { radio: 0.7, software: 0.6, civic: 0.5 },
    energy: 82,
    mood: 70,
    commitment: 12,
    traits: ['nightOwl'],
    window: [9, 18],
  },
];

/**
 * The reputation each rung of the applicant ladder asks for, lowest first. **The rungs are
 * fixed and the people on them are not**: `shuffleLadder` deals the applicants onto them at
 * the start of every run, so the pace of recruitment stays the difficulty's to set while who
 * turns up first is different each time.
 */
export const LADDER: number[] = [
  0, 40, 90, 150, 220, 300, 400, 510, 640, 790, 950, 1130, 1330, 1550, 1790, 2050, 2330, 2640,
  2970, 3330, 3710, 4120, 4550,
];

/**
 * People who turn up as the space builds a reputation (§5). They are not members yet —
 * shipping a project attracts one or two whose passions match what you just built, which
 * is the "projects and tools are magnets" idea made concrete.
 */
export const APPLICANTS: MemberData[] = [
  // `repRequired` below is only the default order. `shuffleLadder` re-deals it every run.
  {
    id: 'mehmet', name: 'Mehmet Taha', repRequired: 0,
    skills: skills({ electronics: 3, machining: 3, docs: 2 }),
    passions: { iot: 0.7, electronics: 0.6, fpv: 0.45 },
    energy: 88, mood: 72, commitment: 15, traits: [], window: [9, 18],
  },
  {
    id: 'deniz', name: 'Deniz', repRequired: 40,
    skills: skills({ cad: 3, electronics: 4, software: 2 }),
    passions: { fpv: 0.9, electronics: 0.6, iot: 0.45, software: 0.35, retro: 0.35, radio: 0.3 },
    energy: 85, mood: 70, commitment: 14, traits: ['nightOwl'], window: [17, 24],
  },
  {
    id: 'bektas', name: 'Bektaş', repRequired: 90,
    skills: skills({ machining: 3, welding: 4, electronics: 2 }),
    passions: { fpv: 0.7, machining: 0.6, robotics: 0.45 },
    energy: 90, mood: 66, commitment: 14, traits: [], window: [12, 20],
  },
  {
    id: 'faruk', name: 'Faruk', repRequired: 150,
    skills: skills({ cad: 3, machining: 3, welding: 2 }),
    passions: { machining: 0.7, robotics: 0.55, fpv: 0.35 },
    energy: 86, mood: 70, commitment: 14, traits: [], window: [9, 18],
  },
  {
    id: 'kerem', name: 'Kerem', repRequired: 220,
    skills: skills({ machining: 3, welding: 2, electronics: 2, docs: 2 }),
    passions: { machining: 0.65, civic: 0.55, woodworking: 0.45, fpv: 0.4, food: 0.35 },
    energy: 80, mood: 60, commitment: 8, traits: ['ghost'], window: [13, 21],
  },
  {
    id: 'ferit', name: 'Ferit', repRequired: 300,
    skills: skills({ software: 4, electronics: 2, docs: 2 }),
    passions: { software: 0.8, iot: 0.5, civic: 0.3 },
    energy: 84, mood: 72, commitment: 13, traits: ['perfectionist'], window: [9, 18],
  },
  {
    id: 'ibrahim', name: 'İbrahim', repRequired: 400,
    skills: skills({ cad: 4, machining: 2, docs: 2 }),
    passions: { cad: 0.8, design: 0.75, fpv: 0.3 },
    energy: 82, mood: 78, commitment: 9, traits: ['mentor'], window: [10, 17],
  },
  {
    id: 'halil', name: 'Halil', repRequired: 510,
    skills: skills({ electronics: 4, software: 2 }),
    passions: { radio: 0.7, electronics: 0.6, retro: 0.4 },
    energy: 83, mood: 68, commitment: 10, traits: [], window: [9, 14],
  },
  {
    id: 'fatih', name: 'Fatih', repRequired: 640,
    skills: skills({ electronics: 4, docs: 2, cad: 2 }),
    passions: { retro: 0.85, electronics: 0.65, design: 0.4 },
    energy: 84, mood: 70, commitment: 13, traits: ['perfectionist'], window: [11, 19],
  },
  {
    id: 'cagri', name: 'Çağrı', repRequired: 790,
    skills: skills({ cad: 4, software: 3 }),
    passions: { design: 0.8, cad: 0.6, robotics: 0.4 },
    energy: 85, mood: 74, commitment: 10, traits: ['scopeCreeper'], window: [14, 18],
  },
  {
    id: 'zahid', name: 'Zahid', repRequired: 950,
    skills: skills({ machining: 4, welding: 3, cad: 2 }),
    passions: { machining: 0.85, woodworking: 0.5, robotics: 0.4 },
    energy: 88, mood: 65, commitment: 10, traits: ['gatekeeper'], window: [12, 20],
  },
  {
    id: 'burak', name: 'Burak', repRequired: 1130,
    skills: skills({ electronics: 3, machining: 2, cad: 2 }),
    passions: { fpv: 0.85, electronics: 0.5, robotics: 0.45 },
    energy: 90, mood: 71, commitment: 15, traits: ['nightOwl'], window: [9, 18],
  },
  {
    id: 'omer', name: 'Ömer', repRequired: 1330,
    skills: skills({ electronics: 4, software: 3 }),
    passions: { radio: 0.85, electronics: 0.6, iot: 0.5 },
    energy: 80, mood: 68, commitment: 16, traits: ['nightOwl'], window: [19, 24],
  },
  {
    id: 'huseyin', name: 'Hüseyin', repRequired: 1550,
    skills: skills({ welding: 4, machining: 3 }),
    passions: { machining: 0.75, woodworking: 0.55, food: 0.4 },
    energy: 87, mood: 66, commitment: 9, traits: [], window: [9, 14],
  },
  {
    id: 'arif', name: 'Arif', repRequired: 1790,
    skills: skills({ docs: 4, software: 2, electronics: 2 }),
    passions: { civic: 0.85, iot: 0.5, software: 0.35 },
    energy: 80, mood: 76, commitment: 8, traits: ['documenter'], window: [10, 18],
  },
  {
    id: 'hasan', name: 'Hasan', repRequired: 2050,
    skills: skills({ docs: 3, electronics: 2, software: 2 }),
    passions: { civic: 0.8, iot: 0.45, food: 0.3 },
    energy: 81, mood: 73, commitment: 9, traits: ['documenter'], window: [14, 18],
  },
  {
    id: 'furkan', name: 'Furkan', repRequired: 2330,
    skills: skills({ software: 4, cad: 3, electronics: 2 }),
    passions: { robotics: 0.8, software: 0.65, design: 0.35 },
    energy: 86, mood: 74, commitment: 11, traits: ['scopeCreeper'], window: [13, 21],
  },
  {
    id: 'vedat', name: 'Vedat', repRequired: 2640,
    skills: skills({ machining: 3, electronics: 3 }),
    passions: { robotics: 0.75, machining: 0.5, software: 0.35 },
    energy: 84, mood: 75, commitment: 14, traits: ['mentor'], window: [9, 18],
  },
  {
    id: 'yakup', name: 'Yakup', repRequired: 2970,
    skills: skills({ machining: 3, welding: 2, cad: 2 }),
    passions: { woodworking: 0.8, food: 0.6, machining: 0.45 },
    energy: 78, mood: 62, commitment: 7, traits: ['ghost'], window: [14, 21],
  },
  {
    id: 'enes', name: 'Enes', repRequired: 3330,
    skills: skills({ software: 3, cad: 2, docs: 2 }),
    passions: { retro: 0.7, software: 0.6, design: 0.45 },
    energy: 83, mood: 69, commitment: 8, traits: ['ghost'], window: [14, 18],
  },
  {
    id: 'bilal', name: 'Bilal', repRequired: 3710,
    skills: skills({ cad: 3, welding: 2, machining: 2 }),
    passions: { woodworking: 0.75, design: 0.5, food: 0.45 },
    energy: 85, mood: 70, commitment: 9, traits: [], window: [9, 14],
  },
  {
    id: 'muhammed', name: 'Muhammed', repRequired: 4120,
    skills: skills({ software: 4, electronics: 3 }),
    passions: { iot: 0.75, software: 0.6, radio: 0.4 },
    energy: 86, mood: 72, commitment: 15, traits: [], window: [9, 18],
  },
  {
    id: 'muhammed-safa', name: 'Muhammed Safa', repRequired: 4550,
    skills: skills({ cad: 5, software: 4 }),
    passions: { cad: 0.8, design: 0.7, robotics: 0.5 },
    energy: 76, mood: 80, commitment: 6, traits: ['mentor'], window: [14, 18],
  },
];

/**
 * Deal the applicants onto the ladder's rungs in a given order — or a fresh shuffle when no
 * order is given — and return the order so a save can put it back. Mutates `repRequired`
 * in place: every reader of an applicant's bar (the recruitment clock, the People panel,
 * the day-one crew) reads it from there.
 */
export function shuffleLadder(order?: string[], random: () => number = Math.random): string[] {
  const known = new Set(APPLICANTS.map((a) => a.id));
  let ids = (order ?? []).filter((id) => known.has(id));
  // Anybody the saved order does not know about (added since) joins at the back.
  for (const a of APPLICANTS) if (!ids.includes(a.id)) ids.push(a.id);
  if (!order) {
    ids = [...ids];
    for (let i = ids.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
  }
  ids.forEach((id, index) => {
    const person = APPLICANTS.find((a) => a.id === id)!;
    person.repRequired = LADDER[Math.min(index, LADDER.length - 1)];
  });
  return ids;
}

/**
 * §5 — you do not get members, you get *applicants*. Reputation opens the pool, and a
 * shipped project pulls in whoever cared about that kind of thing regardless of it. Turning
 * an applicant into a member is a decision you make in the People menu, and it costs.
 */
export const RECRUIT = {
  /**
   * How long a shipped project stays the thing people are talking about. Inside this window
   * it decides *who* gets in touch next; it never changes how many do, which is the
   * difficulty's job — otherwise a month of weekend builds outruns the setting entirely.
   */
  shipMemoryDays: 6,
  /** Passion match below this and the project does not tempt them at all. */
  matchFloor: 0.25,
  /** A matching write-up gets them past this fraction of their reputation bar. */
  shipGateRelief: 0.5,
  /**
   * Induction, a key, a shelf, a tool briefing: scales with the contracted hours. Since
   * nobody is paid and every member pays dues, this one-off is the *only* thing standing
   * between you and the whole roster — so it is priced as an investment, not a formality:
   * about four months of that person's dues. It is what stops the space filling up by day
   * sixty, and it is the number to reach for if roster growth ever needs slowing again.
   *
   * 190 → 140 when part-time went: thirteen of the applicants used to join on a half fee,
   * and charging all of them the full one cost a run ~₺45,000 — the Warehouse move, to the
   * lira, and Era 3 stopped arriving at all. 140 keeps the average fee where it was.
   */
  hireCostPerWeeklyHour: 140,
  /** Your own time, showing them round and doing the paperwork. */
  hireHours: 1,
  /** Candidates waiting on day one, so the first hire is a pick rather than a yes or no. */
  shortlist: 3,
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

// --- Designing a project (§4d) ----------------------------------------------

/**
 * How the New Project wizard's decisions land. The three-star option on every axis is the
 * catalogue's own numbers, so these only describe the *difference* a choice makes.
 */
export const DESIGN = {
  /** Quality per halving of the crew below the size the brief was scoped for. */
  teamUnder: 0.2,
  /** Quality per doubling above it, up to twice the size. */
  teamOver: 0.14,
  /** Quality lost per doubling past twice the size — too many cooks. */
  teamCrowd: 0.2,
  /**
   * What each star costs (§4c). `starBudget` multiplies the design budget
   * (`budgetBase + budgetShare × payout`) per axis; `starBom` multiplies the bill of
   * materials per axis. One star is cheap and it shows, five stars is dear and it shows.
   */
  starBudget: { 1: 0.3, 3: 1, 5: 2.4 } as Record<1 | 3 | 5, number>,
  budgetBase: 100,
  budgetShare: 0.02,
  starBom: { 1: 0.9, 3: 1, 5: 1.12 } as Record<1 | 3 | 5, number>,
  /** Skill level somebody on the crew needs for each star rating. One star needs nobody. */
  starSkill: { 1: 0, 3: 2, 5: 4 } as Record<1 | 3 | 5, number>,
  /**
   * The kickoff is a meeting, not a stage of work: an afternoon round the table, not the
   * day and a half the old Concept stage took. That mattered less when every project could
   * hold its concept at once; with one table per kickoff it was the bottleneck of the whole
   * garage.
   */
  kickoffScale: 0.4,
  /** Kickoff work added per seat beyond the first: a bigger crew has more to agree on. */
  kickoffPerSeat: 0.18,
  /**
   * What quality is worth at release: `payBase + payPerQuality × q`. **Centred on the build
   * a default design actually produces** (about 0.45, measured by `era-pace`), so taking
   * every three-star option earns exactly what the catalogue says, a 0.7 build about a
   * quarter more and a 0.2 build about a quarter less. Centred on 0.5 at first, it quietly
   * paid the typical build 5% under the catalogue and cost the campaign a fifth of its
   * reputation. Payout used to ignore quality entirely, which made every quality decision
   * in the game cosmetic.
   */
  payBase: 0.6,
  payPerQuality: 0.9,
  hypeBase: 0.75,
  hypePerQuality: 0.6,
};

/**
 * What the market wants (§4d). One number per genre, drifting a little every day and
 * pulled back toward normal, so a genre that is hot this week is not hot forever. Shipping
 * into a genre cools it — the counterpart of `REPEAT` at the scale of a whole genre, and
 * the reason the answer to every month is not "more software".
 */
export const MARKET = {
  start: [0.85, 1.15] as [number, number],
  min: 0.55,
  max: 1.6,
  /** Fraction of the gap back to 1.0 closed each day. */
  revert: 0.07,
  /** Daily wander, as a spread either side. */
  noise: 0.07,
  /** A ship multiplies its genre's demand by this. */
  shipDip: 0.92,
  /** A trending offer lifts its genre by this much. */
  trendBump: 0.14,
};

/**
 * A kickoff needs the whole crew at the table at once (§4d), which is exactly where a
 * Ghost, or a morning part-timer on a crew of afternoon ones, stops a project dead. A real
 * crew does not wait for ever: after this many working days of being the one missing,
 * they go ahead without you.
 */
export const KICKOFF = {
  missLimit: 2,
};

/**
 * Seats per station (§4d). **One person to a workstation** is the rule that makes the space
 * itself a constraint: eight people cannot all do the CAD at one desk, so a crew of eight
 * needs somewhere to sit. Anything not listed here — the sofa, the printers — has no seat
 * limit, because nobody works at them.
 */
export const SEATS: Partial<Record<MachineType, number>> = {
  'cad-desk': 1,
  bench: 1,
  assembly: 2,
  'table-small': 4,
  'table-large': 10,
  learning: 2,
};

/**
 * Training at the learning station (§4c): one level of one skill at a time. Each level up
 * costs more money and more hours at the station than the last — from 2 to 3 is a week of
 * a full-timer's shifts, from 4 to 5 nearly two.
 */
/** What something bought for the room fetches when it is sold again. */
export const RESALE = { share: 0.5 };

/** Standing jobs (§3b). */
export const ROLES = {
  /** The Printer Keeper levels a bed that has drifted below this, between prints. */
  levelBelow: 0.7,
  /** How much faster word gets round on a day the Host is in. */
  hostDraw: 1.25,
};

export const TRAIN = {
  costPerLevel: 500,
  hoursPerLevel: 12,
  maxLevel: 5,
};
