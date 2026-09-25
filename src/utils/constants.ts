import type { LegacySkillKey, MachineType, MemberData, Skills, StageDef, StageKey, Tag, TraitKey, ProjectTier } from '@/game/types';

// ---------------------------------------------------------------------------
// BALANCE CONSTANTS — starting values for the open questions in CLAUDE.md §13.
// Every tuning number in the game lives here. Never inline one at a call site.
// Time unit: sim-hours. 1 sim-hour = 2.5 real seconds at 1x.
// ---------------------------------------------------------------------------

export const TIME = {
  /**
   * The sim's own unit: `tick(dtReal, speed)` advances `dtReal × speed / secondsPerHour`
   * sim-hours. Harnesses drive the sim with it directly and are tuned to it, so it stays;
   * how fast the game runs **on screen** is `playMinutesPerSecond` below.
   */
  secondsPerHour: 2.5,
  /**
   * On screen, the clock is a clock: at 1× one game minute passes each real second, 17:10
   * then 17:11 then 17:12. **2× is five times that and 3× thirty times** — the labels are
   * the gears, not the ratio. 1× is for watching the room, 2× for a working day, and 3× for
   * getting through a night or a quiet week: the crew's nine hours pass in eighteen seconds.
   * It was 1 / 4 / 8, and the top gear still took two minutes a day, so waiting for a print
   * or a delivery meant sitting through it.
   */
  playMinutesPerSecond: { 1: 1, 2: 5, 3: 30 } as Record<number, number>,
  hoursPerDay: 24,
  speeds: [1, 2, 3] as const,
  /** Sim writes its snapshot to the store at this rate (CLAUDE.md §11). */
  snapshotInterval: 0.2,
};

export const START_CASH = 4000;

/**
 * Filament: the only consumable. **It is never a chore** — printers do not run dry and
 * nobody buys spools; what the month's prints drew is billed on the statement at the
 * spool price, like the power. Refilling, a shelf of stock and a keeper to do it were all
 * a job that asked nothing of the player but remembering.
 */
export const FILAMENT = {
  spoolGrams: 1000,
  spoolCost: 450,
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

/**
 * Breaks at the comforts (§7b). People use what the space owns in their own time — a
 * coffee on the way in, table tennis, the sofa at lunch. How long a go lasts is the
 * comfort's own (`AmenityUse.hours`); these are the rules about choosing one.
 */
export const LEISURE = {
  /** How often somebody stops for a coffee or tea on the way in. */
  arrivalChance: 0.4,
  /**
   * Sending somebody for a tea (§7b): mood gained once they have it. Once a person a day —
   * a free mood button pressed on everybody every morning is not a decision.
   */
  treatMood: 14,
  /** …and this much energy back: a break you were sent on is a proper one. */
  treatEnergy: 18,
  /** The coffee or tea on the way in, in sim-hours. */
  arrivalHours: [0.2, 0.3] as [number, number],
  /** How long somebody waits at an empty table-tennis table for a partner. */
  partnerWait: 0.5,
  /** Weight of joining somebody already waiting for a game, against 1 for anything else. */
  partnerPull: 6,
  /** Weight of starting at an empty table and hoping. */
  emptyTable: 0.8,
  /** The comfort they used last time, so the next break is usually somewhere else. */
  sameAgain: 0.25,
  /**
   * Free time between two breaks, in sim-hours, spent wandering. Long on purpose: breaks
   * are for people with nothing on, and even they should mostly be looking for something.
   */
  between: 2.5,
};

/**
 * Print orders (§5): paid jobs that arrive in the Machines panel. A few at a time, a
 * couple of days to say yes, and the due date is counted from the day you accept.
 */
export const ORDERS = {
  /** Most offers on the board at once. */
  maxOffers: 3,
  /** Chance a morning brings a new one, while there is room on the board. */
  newPerDay: 0.55,
  /** Days an offer waits for an answer. */
  offerDays: 3,
  /** Reputation lost when an order misses its date and the client walks. */
  missedRep: 50,
  /**
   * Most orders arrive with the STL ready — print it and get paid, nobody at a desk. The
   * rest need their files drawn first, and pay for it.
   */
  seriesShare: 0.7,
  /** What an order that needs CAD pays over the same print hours with the file supplied. */
  cadPremium: 2.5,
};

/**
 * Hours outside nine to six (§3d). The day is still nine to six for everybody; these are
 * the exceptions — somebody on a build staying on into the evening, or opening up at six.
 */
export const HOURS_OFF = {
  /** Chance a day that somebody on a crew stays on late. */
  late: 0.05,
  /** The same for a Night Owl — the one trait this was waiting for. */
  lateOwl: 0.45,
  /** When they finally go home: somewhere between these hours. Midnight at the latest. */
  lateFrom: 20,
  lateUntil: 23.9,
  /** Chance somebody on a crew is in at six. Rare. */
  early: 0.02,
  earlyAt: 6,
};

export const MEMBER = {
  /** Tiles per sim-hour. At 2.6 it consumed 80% of every volunteer's day. Since the clock
   * runs a game minute a second at 1× (`TIME.playMinutesPerSecond`), 60 is a tile a second
   * on screen — a walk — and a small share of the day in the sim (`npm run time-budget`). */
  walkSpeed: 60,
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
  /** Passion match below this and they will not sign up at all — a dead pitch. */
  signupThreshold: 0.25,
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

// --- Machines (§5, §13.3) ---------------------------------------------------

export const MACHINE = {
  /**
   * Base chance a job fails *at some point* over its full duration. It was 0.14 with a bed
   * that drifted out of level and a keeper who levelled it; with calibration gone it carries
   * the average drift itself.
   */
  baseJobFailure: 0.17,
  /** Each operator skill level above 1 multiplies failure chance by this. */
  operatorSkillFactor: 0.82,
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
    skill: 'mechanical',
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
    skill: 'mechanical',
    work: 40,
    optional: false,
    appeal: 0.25,
    blurb: 'Fixing what the test broke. Nobody signs up for this.',
  },
  {
    key: 'release',
    label: 'Release',
    skill: 'software',
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
  walkSpeed: 11,
};

/**
 * What each management verb costs you in hours (§3). Pitching is free: starting something
 * is a decision, not labour, and gating it on having hours left only meant a project you
 * had already chosen had to wait for tomorrow for no reason. The bill of materials, which
 * a pitch now pays up front, is the real brake on starting too much.
 */
export const VERB_HOURS: Record<string, number> = {
  pitch: 0,
  order: 1,
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

// --- Backlog (§4a) ----------------------------------------------------------

export const BACKLOG = {
  /** Chance per day that somebody proposes something they are excited about. */
  memberProposalChance: 0.16,
  /** Chance per day of a sponsor offer with cash attached. */
  sponsorChance: 0.07,
  /** Sponsor cash as a fraction of the project's bill of materials. */
  sponsorCashRatio: [0.5, 1.1] as [number, number],
  sponsorDeadlineDays: [7, 14] as [number, number],
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

// --- Content: the roster ----------------------------------------------------

/**
 * Print times are deliberately chunky (~43 machine-hours for a full set). At the original
 * ~21h, fabrication was 3% of a playthrough and the machine queue — the game's signature
 * system — never mattered. The frame plate is the one that hurts to lose.
 */

/**
 * The roster is written in the six old skills, which read naturally for a person ("CAD 4,
 * welding 2"); `rolesFrom` turns them into the four roles once, when this module loads.
 */
function skills(partial: Partial<Record<LegacySkillKey, number>>): Skills {
  return {
    cad: 1,
    electronics: 1,
    machining: 1,
    welding: 1,
    software: 1,
    docs: 1,
    ...partial,
  } as unknown as Skills;
}

/**
 * Six skills into four roles (design §3.2). Software and Electronics carry over; Mechanical
 * is the best of CAD, machining and welding. **Communications is derived from passion**: it
 * was never a skill, only something people loved, so whoever loves radio or IoT counts as a
 * communications hand one level under their best of electronics and software — and
 * everybody else starts at nothing.
 */
export function rolesFrom(old: Partial<Record<LegacySkillKey, number>>, passions: Partial<Record<Tag, number>>): Skills {
  const software = old.software ?? 0;
  const electronics = old.electronics ?? 0;
  const talks = Math.max(passions.radio ?? 0, passions.iot ?? 0) >= 0.5;
  return {
    software,
    electronics,
    mechanical: Math.max(old.cad ?? 0, old.machining ?? 0, old.welding ?? 0),
    comms: talks ? Math.max(1, Math.max(electronics, software) - 1) : 0,
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
    skills: skills({ software: 5, electronics: 5, machining: 3, docs: 3 }),
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
    skills: skills({ software: 5, cad: 5, electronics: 3, docs: 3 }),
    passions: { radio: 0.7, software: 0.6, civic: 0.5 },
    energy: 82,
    mood: 70,
    commitment: 12,
    traits: ['nightOwl'],
    window: [9, 18],
  },
];

/** The two on day one, by the names the roster was written with. */
export const FOUNDER_NAMES: readonly string[] = ROSTER.map((m) => m.name);

/**
 * The player may rename the two founders on the start screen. Their names are written into
 * the roster itself rather than into each entity, because every lookup of a member's name —
 * a shipped build's crew, a proposal, the People panel — goes through the roster by id. Set
 * on every new run and every load, so one run's names never carry into the next; a blank
 * falls back to the roster's own.
 */
export function setFounders(names: readonly (string | undefined)[] | undefined) {
  ROSTER.forEach((member, i) => {
    member.name = names?.[i]?.trim() || FOUNDER_NAMES[i];
  });
}

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

// The roster is written in skills; the game plays in roles (design §3.2).
for (const member of [...ROSTER, ...APPLICANTS]) {
  member.skills = rolesFrom(member.skills as unknown as Record<LegacySkillKey, number>, member.passions);
}

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
  software: 3,
  electronics: 3,
  comms: 2,
  mechanical: 3,
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
  perfectionist: 'Better work, but will not sign off the design below 55% quality — not until it has had half as much again.',
  scopeCreeper: 'Now and then adds a requirement to a bigger build: more work, a better result.',
  mentor: 'Everyone on the same build works a level up, to the Mentor\'s own.',
  ghost: 'Signs up, then turns up less and less.',
  gatekeeper: 'While in, prints fail less — and novices work slower, checked at every step.',
  nightOwl: 'Stays late far more often, and prints fail less with somebody watching them.',
  documenter: 'Writes the docs without being asked: a faster launch and a louder one.',
};

/**
 * What each trait does (CLAUDE.md §3). **Each one is a story, not a stat tweak** — so every
 * one of them also tells the player when it happens: a notification the first time a trait
 * shows itself in a run, and every time for the two that change a build's plan (a
 * Perfectionist holding a stage, a Scope Creeper adding to it).
 */
export const TRAITS = {
  perfectionist: {
    /** Their craft counts this much more toward the design's quality. */
    craft: 0.12,
    /** A holdout ends once the stage has had this much of its work again: signed off under protest. */
    relentAfter: 1.5,
  },
  scopeCreeper: {
    /** Chance at the end of the kickoff, and again on going into Iterate, once each per build — never a small one. */
    chance: 0.45,
    /** Extra work on the stage after it, as a share of what that stage needed. */
    work: 0.25,
    /** Quality the idea adds. */
    quality: 0.05,
  },
  mentor: {
    /** Levels added to everybody else on the build, never past the Mentor's own. */
    levels: 1,
  },
  gatekeeper: {
    /** Print failure odds while a Gatekeeper is in the building. */
    printFail: 0.7,
    /** A novice — below this level in the stage's skill — works at this rate under them. */
    noviceBelow: 2,
    noviceRate: 0.85,
  },
  nightOwl: {
    /** Print failure odds while a Night Owl is in after hours, watching the bed. */
    printFail: 0.7,
  },
  documenter: {
    /** Their pace on the release stage — the docs — against anybody else's. */
    releaseRate: 1.6,
    /** Extra hype at release for a build whose docs they wrote. */
    hype: 0.12,
  },
  ghost: {
    /** Attendance multiplier under which the space notices somebody has stopped coming. */
    noticeBelow: 0.5,
  },
};

/** §13.1 Perfectionist refuses to advance below this project quality. */
export const PERFECTIONIST_QUALITY_GATE = 0.55;
/** Ghost: attendance chance multiplier decays by this each day they attend. */
export const GHOST_DECAY = 0.82;

// --- Designing a project (§4d) ----------------------------------------------

/**
 * How long a build of each size takes (§4) — multipliers on the catalogue's hand work,
 * print hours and delivery wait, applied once in `planProject`. **A week of a build is
 * mostly nights and weekends**: the crew works nine to six on weekdays, so measured in
 * play a small build spent seven of its days closed and only one and a half being worked
 * on. The catalogue keeps its proportions — a cyberdeck is still assembly-heavy and a
 * drone still print-heavy — and these set the scale: small in a day or two, bigger builds
 * in four to ten. `npm run project-times` holds every entry to it.
 */
export const TIER_PACE: Record<ProjectTier, { work: number; print: number; lead: number }> = {
  small: { work: 0.26, print: 0.42, lead: 0.15 },
  medium: { work: 0.9, print: 0.8, lead: 0.55 },
  large: { work: 0.7, print: 0.44, lead: 0.45 },
};

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
  /** Skill level somebody on the crew needs for each star rating — below it the card is locked. One star needs nobody. */
  starSkill: { 1: 0, 3: 2, 5: 4 } as Record<1 | 3 | 5, number>,
  /**
   * The technology a crew brings (design §5.4), by its best level — chosen by nobody. Tier 0
   * up to level 1, tier 1 at 2-3, tier 2 at 4-5.
   */
  techQuality: [-0.06, 0, 0.06],
  techRisk: [1.15, 1, 0.85],
  techWork: [1.1, 1, 0.92],
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
};

/**
 * A kickoff needs the whole crew at the table at once (§4d), which is exactly where a
 * Ghost, or a morning part-timer on a crew of afternoon ones, stops a project dead. A real
 * crew does not wait for ever: after this many working days of being the one missing,
 * they go ahead without you.
 */
export const KICKOFF = {
  missLimit: 2,
  /**
   * **Five is a meeting.** A crew bigger than this kicks off once any five of them are sat
   * down; a smaller one still needs everybody. Getting eight or ten volunteers into one room
   * on one day was a miracle the big builds waited on, and it made a table for ten the only
   * way to start one.
   */
  quorum: 5,
};

/** How many of a crew have to sit down for its kickoff to move — and so the table it needs. */
export function kickoffSeats(crew: number): number {
  return Math.max(1, Math.min(crew, KICKOFF.quorum));
}

/** The biggest crew the space's tables can kick off: any size, once one seats a quorum. */
export function crewCap(biggestTable: number): number {
  return biggestTable >= KICKOFF.quorum ? 10 : biggestTable;
}

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
 * costs more money and more hours at the station than the last, up to a working day for
 * the top course (see `TRAIN.hoursPerLevel`).
 */
/** What something bought for the room fetches when it is sold again. */
export const RESALE = { share: 0.5 };

/**
 * Days before an awards night on which the log says how the race stands. Close together at
 * the end on purpose: fifty days out is a reminder, five days out is a deadline.
 */
export const AWARDS_COUNTDOWN = [30, 10, 3, 1];

export const TRAIN = {
  costPerLevel: 500,
  /**
   * Station hours per level of the course: 1.1 × the level being reached, so the longest
   * course (4 → 5) is 5½ hours — **one working day at most**, started at nine and done by
   * six. Not 8: a day at the station is about 6 hours once the coffee, lunch and the walk
   * over are out of it, and at 1.6 and at 1.25 the top course spilled into the next morning. It was 12,
   * which made the top course a week and a half; the absence is still the price, but a day
   * off the crew is one the player can plan round.
   */
  hoursPerLevel: 1.1,
  maxLevel: 5,
};

/**
 * The ship report's verdict against the pitch's forecast. Measured in `era-pace` (2 seeds,
 * 150 days): with +0.03 as the bar, three bigger builds in four "beat the plan", which made
 * it a label rather than news.
 */
export const REPORT = {
  aboveQuality: 0.1,
  abovePay: 1.12,
  belowQuality: 0.05,
  /**
   * Late is past `lateFactor` × the forecast plus `lateSlack` days. The forecast counts a
   * failed test's cost (`retryDays`); measured over the first 90 days of `era-pace`, one
   * medium or large build in twelve runs that late — a real miss, not the calendar.
   */
  lateFactor: 1.5,
  lateSlack: 2,
};

/**
 * **Promoting a build** (§4c): one press on the ship report, within `window` days of release.
 * The reputation arrives a share a day over `days`, and adds up to `gainShare` of what the
 * build made; it costs `costPerRep` a point of that, never under `min`. A loud new build is
 * worth it, a fourth copy of the same one mostly is not — the gain follows the build.
 */
export const PROMO = {
  window: 3,
  days: 7,
  gainShare: 1,
  costPerRep: 5,
  min: 500,
};
