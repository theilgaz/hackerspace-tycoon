import type {
  SkillKey,
  DesignAxisId,
  DesignChoice,
  MachineType,
  PartData,
  ProjectCategory,
  ProjectDef,
  ProjectPlan,
  StageKey,
} from '@/game/types';
import { DESIGN, MEMBER, REPEAT, STAGE_MAP, STAGE_ORDER, TEST, TIER_PACE } from './constants';

/**
 * Designing a project (CLAUDE.md §4d).
 *
 * The Jobs board handed the player a finished recipe: pick a name, and every number behind
 * it had already been decided. **The decisions are the game**, so a project is now a brief
 * from the catalogue plus three choices about how to build it and how many people to plan it
 * with — and every one of those choices costs something the player can see.
 *
 * Each option is one, three or five stars. The three-star option is the catalogue's own
 * numbers — work, parts, money and risk all at ×1 — so a player who takes every default is
 * playing the game as it was balanced, and every star either side of it is a trade:
 *
 * - **One star** is quicker and cheaper and it shows: lower quality, a riskier test, a
 *   product the market likes less.
 * - **Five stars** is slower or dearer and it shows the other way.
 *
 * Nothing here is a free upgrade. §13's rule for the claim system applies: a reward with no
 * matching punishment is not a choice, and a player who always takes five stars must not
 * simply win.
 */
export interface DesignOption {
  label: string;
  stars: 1 | 3 | 5;
  blurb: string;
  /** Added to the project's quality. */
  quality?: number;
  /** Multiplies market appeal — payout and hype at release. */
  appeal?: number;
  /** Multiplies the work on the stages this axis touches. */
  work?: number;
  /** Multiplies the bill of materials. */
  bom?: number;
  /** Extra days on the order. */
  lead?: number;
  /** Multiplies machine hours and material on every printed part. */
  print?: number;
  /** Multiplies the chance the build fails its test. */
  testRisk?: number;
  /** Machines the space has to own before this option is on the table. */
  requires?: MachineType[];
  /** Skip the simulation stage entirely. */
  skipSim?: boolean;
  /**
   * The level somebody on the crew needs in the project's wing before this is on the table
   * (§4c). Absent, the stars say it: none for one, Junior for three, Senior for five.
   */
  need?: number;
}

export interface DesignAxis {
  id: DesignAxisId;
  label: string;
  /** What the decision is about, in one line. */
  question: string;
  /** Stages whose work this axis scales. */
  stages: StageKey[];
  /**
   * The skill the crew needs to reach the better options (§4c). A five-star IDE is no use
   * to a crew nobody on which can drive one.
   */
  skill: SkillKey;
  options: [DesignOption, DesignOption, DesignOption];
}

export const AXES: Record<DesignAxisId, DesignAxis> = {
  editor: {
    id: 'editor',
    label: 'Tool',
    question: 'What does the crew write it in?',
    stages: ['cad', 'assembly', 'iterate'],
    skill: 'software',
    options: [
      {
        label: 'Notepad',
        stars: 1,
        blurb: 'No autocomplete, no debugger, no mercy. Costs nothing and it shows.',
        quality: -0.07,
        work: 1.22,
        testRisk: 1.2,
      },
      {
        label: 'VS Code',
        stars: 3,
        blurb: 'Free, fast, and forty extensions nobody remembers installing.',
      },
      {
        label: 'Full IDE',
        stars: 5,
        blurb: 'Refactoring that works and a debugger that finds things.',
        quality: 0.06,
        work: 0.86,
        testRisk: 0.85,
      },
    ],
  },
  ui: {
    id: 'ui',
    label: 'UI Design',
    question: 'What will people actually see?',
    stages: ['cad', 'assembly'],
    skill: 'software',
    options: [
      {
        label: 'Template',
        stars: 1,
        blurb: 'A theme off the shelf. Nobody will remember it, including the client.',
        appeal: 0.78,
        work: 0.85,
      },
      {
        label: 'Custom design',
        stars: 3,
        blurb: 'Drawn for this, by somebody in the room.',
      },
      {
        label: 'Design system',
        stars: 5,
        blurb: 'A component library built once and reused on every job. People notice.',
        appeal: 1.3,
        quality: 0.03,
        work: 1.25,
        // The library is the space's: the next client gets the same components for free.
      },
    ],
  },
  architecture: {
    id: 'architecture',
    label: 'Architecture',
    question: 'How is it put together underneath?',
    stages: ['cad', 'simulation', 'assembly', 'iterate'],
    skill: 'software',
    options: [
      {
        label: 'One big script',
        stars: 1,
        blurb: 'Works on the laptop it was written on. The test is where it finds out.',
        quality: -0.06,
        work: 0.8,
        testRisk: 1.55,
      },
      {
        label: 'Framework',
        stars: 3,
        blurb: 'Somebody else already solved routing, auth and the database.',
      },
      {
        label: 'Services + CI',
        stars: 5,
        blurb: 'Tests on every push and a pipeline that says no. Slower to build, hard to break.',
        quality: 0.07,
        work: 1.25,
        testRisk: 0.6,
      },
    ],
  },
  board: {
    id: 'board',
    label: 'Circuit',
    question: 'What is the electronics built on?',
    stages: ['assembly', 'iterate'],
    skill: 'electronics',
    options: [
      {
        label: 'Breadboard',
        stars: 1,
        blurb: 'Jumper wires and hope. Quick to wire, first thing to shake loose.',
        quality: -0.08,
        work: 0.8,
        bom: 0.7,
        testRisk: 1.5,
        appeal: 0.85,
      },
      {
        label: 'Perfboard',
        stars: 3,
        blurb: 'Soldered by hand, point to point. Honest work.',
      },
      {
        label: 'Custom PCB',
        stars: 5,
        blurb: 'A board with your name on it. It has to be ordered from a fab and it takes days.',
        quality: 0.08,
        work: 0.78,
        bom: 1.35,
        lead: 2,
        testRisk: 0.7,
        appeal: 1.12,
      },
    ],
  },
  firmware: {
    id: 'firmware',
    label: 'Firmware',
    question: 'What runs on it?',
    stages: ['simulation', 'assembly', 'iterate'],
    skill: 'software',
    options: [
      {
        label: 'Arduino sketch',
        stars: 1,
        blurb: 'One loop(), a delay() in the middle and a lot of global variables.',
        quality: -0.05,
        work: 0.82,
        testRisk: 1.35,
      },
      {
        label: 'PlatformIO',
        stars: 3,
        blurb: 'Proper builds, proper libraries, a serial monitor that works.',
      },
      {
        label: 'RTOS + OTA',
        stars: 5,
        blurb: 'Tasks, watchdogs and an update server that stays up. Nobody climbs a ladder to reflash it.',
        quality: 0.06,
        work: 1.22,
        testRisk: 0.72,
        appeal: 1.08,
        // The OTA server is set up once and every device after it reports home to the same one.
      },
    ],
  },
  enclosure: {
    id: 'enclosure',
    label: 'Enclosure',
    question: 'What does it live in?',
    stages: ['assembly'],
    skill: 'mechanical',
    options: [
      {
        label: 'Bare board',
        stars: 1,
        blurb: 'Hot glue and a cable tie. Prints almost nothing; photographs badly.',
        print: 0.45,
        appeal: 0.7,
        quality: -0.03,
      },
      {
        label: 'Printed case',
        stars: 3,
        blurb: 'Off the printer, sanded where it shows.',
      },
      {
        label: 'Machined',
        stars: 5,
        blurb: 'Milled aluminium on the CNC. The printer barely gets involved.',
        requires: ['cnc'],
        print: 0.6,
        bom: 1.2,
        appeal: 1.35,
        quality: 0.04,
        work: 1.1,
      },
    ],
  },
  cadtool: {
    id: 'cadtool',
    label: 'Design tool',
    question: 'Where is it drawn?',
    stages: ['cad', 'iterate'],
    skill: 'mechanical',
    options: [
      {
        label: 'Paper sketch',
        stars: 1,
        blurb: 'Dimensions on the back of an envelope. Fast until the first part does not fit.',
        quality: -0.08,
        work: 0.78,
        testRisk: 1.3,
        print: 1.15,
      },
      {
        label: 'FreeCAD',
        stars: 3,
        blurb: 'Parametric, free, and a personality.',
      },
      {
        label: 'Fusion Pro',
        stars: 5,
        blurb: 'Assemblies, CAM and simulation in one place.',
        quality: 0.06,
        work: 0.85,
        print: 0.9,
      },
    ],
  },
  material: {
    id: 'material',
    label: 'Material',
    question: 'What takes the load?',
    stages: ['assembly'],
    skill: 'mechanical',
    options: [
      {
        label: 'PLA',
        stars: 1,
        blurb: 'Cheap, easy, and soft the moment it gets warm.',
        quality: -0.06,
        bom: 0.75,
        testRisk: 1.4,
        print: 0.9,
      },
      {
        label: 'PETG + carbon',
        stars: 3,
        blurb: 'Tougher filament and a few carbon rods where it matters.',
      },
      {
        label: 'Aluminium frame',
        stars: 5,
        blurb: 'Extrusion and machined brackets. It will outlive the space.',
        quality: 0.08,
        bom: 1.5,
        lead: 1,
        testRisk: 0.65,
        appeal: 1.15,
        work: 1.12,
      },
    ],
  },
  validation: {
    id: 'validation',
    label: 'Validation',
    question: 'How sure are you it works before you build it?',
    stages: ['simulation'],
    skill: 'mechanical',
    options: [
      {
        label: 'Eyeball it',
        stars: 1,
        blurb: 'Skip the simulation stage entirely. The test finds out instead.',
        skipSim: true,
        testRisk: 1.9,
      },
      {
        label: 'Hand calcs',
        stars: 3,
        blurb: 'A spreadsheet, a free-body diagram and a coffee.',
      },
      {
        label: 'Full simulation',
        stars: 5,
        blurb: 'Stress, thermal and motion on a proper solver. The test rarely surprises anyone.',
        work: 1.6,
        quality: 0.05,
        testRisk: 0.55,
      },
    ],
  },
  docs: {
    id: 'docs',
    label: 'Documentation',
    question: 'What does the neighbourhood get with it?',
    stages: ['release'],
    skill: 'software',
    options: [
      {
        label: 'README',
        stars: 1,
        blurb: 'Three lines and a photo. Nobody else will ever build one.',
        work: 0.5,
        appeal: 0.8,
      },
      {
        label: 'Build guide',
        stars: 3,
        blurb: 'Steps, a parts list, the wiring diagram.',
      },
      {
        label: 'Workshop kit',
        stars: 5,
        blurb: 'A translated build book and a Saturday workshop. The neighbourhood remembers.',
        work: 1.6,
        appeal: 1.35,
        quality: 0.03,
      },
    ],
  },
  // --- The design step as three questions (design §5.4) ------------------------------
  approach: {
    id: 'approach',
    label: 'Approach',
    question: 'Quick, or good?',
    stages: ['concept', 'cad', 'simulation', 'assembly', 'iterate', 'release'],
    skill: 'software',
    options: [
      {
        label: 'Fast',
        stars: 1,
        blurb: 'Get it out of the door. Rougher, riskier, and sooner.',
        work: 0.78,
        quality: -0.07,
        appeal: 0.95,
        testRisk: 1.3,
      },
      { label: 'Balanced', stars: 3, blurb: 'The brief as written.', need: 0 },
      {
        label: 'Ambitious',
        stars: 5,
        blurb: 'Do it properly. Slower, dearer, and it shows at release.',
        work: 1.3,
        quality: 0.1,
        appeal: 1.12,
        testRisk: 0.85,
        need: 3,
      },
    ],
  },
  distribution: {
    id: 'distribution',
    label: 'Distribution',
    question: 'Where does it run?',
    stages: ['cad', 'assembly', 'release'],
    skill: 'software',
    options: [
      { label: 'On-Prem', stars: 1, blurb: 'On the client’s own server. Small market, little work.', work: 0.9, appeal: 0.88 },
      {
        label: 'Cloud',
        stars: 3,
        blurb: 'Hosted and scaled. The brief as written.',
      },
      {
        label: 'Hybrid',
        stars: 5,
        blurb: 'Both, in sync. Enterprise clients pay for exactly this.',
        work: 1.25,
        appeal: 1.22,
        quality: 0.04,
      },
    ],
  },
  platforms: {
    id: 'platforms',
    label: 'Platforms',
    question: 'The web, and what else?',
    stages: ['cad', 'assembly', 'iterate'],
    skill: 'software',
    // Not one of three: each is switched on or off on top of the web (`design.platforms`
    // is a bit per option). Every platform is more work and a bigger market.
    options: [
      { label: 'Android', stars: 3, blurb: 'Most phones on the planet.', work: 1.35, appeal: 1.25, need: 2 },
      {
        label: 'iOS',
        stars: 3,
        blurb: 'The phones that pay.',
        work: 1.35,
        appeal: 1.3,
        need: 3,
      },
      { label: 'Desktop', stars: 3, blurb: 'Windows, macOS, Linux — offices still live here.', work: 1.25, appeal: 1.15, need: 2 },
    ],
  },
  power: {
    id: 'power',
    label: 'Power',
    question: 'What does it run on?',
    stages: ['cad', 'assembly'],
    skill: 'electronics',
    options: [
      { label: 'USB', stars: 1, blurb: 'A cable to a laptop. Simple, and it stays on the desk.', work: 0.9, appeal: 0.88, bom: 0.9 },
      { label: 'Battery + charging', stars: 3, blurb: 'The brief as written: it goes where you take it.' },
      {
        label: 'Mains + isolation',
        stars: 5,
        blurb: 'Plugged into the wall, safely. A bigger market and a harder test.',
        work: 1.2,
        appeal: 1.2,
        testRisk: 1.1,
        bom: 1.15,
      },
    ],
  },
  range: {
    id: 'range',
    label: 'Range',
    question: 'How far does it reach?',
    stages: ['cad', 'assembly'],
    skill: 'comms',
    options: [
      { label: 'Whip antenna', stars: 1, blurb: 'What came in the box. Across the room, on a good day.', work: 0.9, appeal: 0.88 },
      { label: 'Directional (Yagi)', stars: 3, blurb: 'Pointed where it matters. The brief as written.' },
      {
        label: 'Mast + field test',
        stars: 5,
        blurb: 'Up on a mast, tested in the field for a day. It reaches, and it is proven.',
        work: 1.2,
        quality: 0.05,
        appeal: 1.15,
        testRisk: 0.85,
        lead: 1,
      },
    ],
  },
  drive: {
    id: 'drive',
    label: 'Drive',
    question: 'What makes it move?',
    stages: ['cad', 'assembly'],
    skill: 'mechanical',
    options: [
      { label: 'Manual', stars: 1, blurb: 'A handle, a crank, somebody pushing.', work: 0.85, appeal: 0.85 },
      { label: 'DC motor', stars: 3, blurb: 'A motor and a switch. The brief as written.' },
      {
        label: 'Brushless + servo',
        stars: 5,
        blurb: 'Smooth, precise and controlled.',
        work: 1.2,
        appeal: 1.22,
        quality: 0.03,
      },
    ],
  },
};

/**
 * The decisions each wing asks (design §5.4): one approach for every wing, then the scope
 * in the wing's own words. The technology is not asked — the crew brings it (`techTier`).
 */
export const CATEGORY_AXES: Record<ProjectCategory, DesignAxisId[]> = {
  software: ['approach', 'platforms', 'distribution'],
  electronics: ['approach', 'power'],
  comms: ['approach', 'range'],
  mechanical: ['approach', 'drive'],
};

/** A multi-select axis: its value is a bit per option, not an index. */
export const isMulti = (axis: DesignAxisId): boolean => axis === 'platforms';

/** The options switched on for a multi-select axis. */
export function picked(axis: DesignAxisId, choice: DesignChoice): number[] {
  const bits = Math.round(choice[axis] ?? 0);
  return AXES[axis].options.map((_, i) => i).filter((i) => bits & (1 << i));
}

/** The level an option asks of the crew in the project's wing. */
export function optionLevel(option: DesignOption): number {
  return option.need ?? DESIGN.starSkill[option.stars];
}

/**
 * **Is this option out of the crew's reach?** (§4c) An option needs somebody on the crew at
 * its level in the project's wing; short of that it is locked, and the card says which
 * level would open it. It was a price for a while — pick it anyway and pay in work and test
 * risk — which was one more sum to hold in your head for a choice the crew already made.
 * The crew's levels unknown (a harness), nothing is locked.
 */
export function isLocked(option: DesignOption, wing: ProjectCategory, levels?: Partial<Record<ProjectCategory, number>>): boolean {
  if (!levels) return false;
  return (levels[wing] ?? 0) < optionLevel(option);
}

/**
 * The design, with every choice the crew cannot back taken down to the best it can (§4c):
 * a single choice steps down a star at a time, a platform the crew cannot build is switched
 * off. One star needs nobody, so every axis always has an answer.
 */
export function clampDesign(
  category: ProjectCategory,
  design: DesignChoice,
  levels?: Partial<Record<ProjectCategory, number>>,
): DesignChoice {
  const out: DesignChoice = { ...design };
  for (const axis of CATEGORY_AXES[category]) {
    const options = AXES[axis].options;
    if (isMulti(axis)) {
      const bits = Math.round(out[axis] ?? 0);
      out[axis] = options.reduce((acc, option, i) => ((bits & (1 << i)) && !isLocked(option, category, levels) ? acc | (1 << i) : acc), 0);
      continue;
    }
    let index = Math.max(0, Math.min(2, Math.round(out[axis] ?? 1)));
    while (index > 0 && isLocked(options[index], category, levels)) index -= 1;
    out[axis] = index;
  }
  return out;
}

/**
 * The technology a crew brings to its wing (design §5.4), by its best level — chosen by
 * nobody, raised by training: 0 up to Intern, 1 for Junior and Mid, 2 for Senior and up.
 */
export function techTier(level: number | undefined): 0 | 1 | 2 {
  if (level === undefined) return 1;
  return level >= 4 ? 2 : level >= 2 ? 1 : 0;
}

export const TECH_LABELS: Record<ProjectCategory, [string, string, string]> = {
  software: ['No-code / CMS', 'Framework', 'Service architecture'],
  electronics: ['Perfboard', '2-layer PCB', '4-layer + SMD'],
  comms: ['WiFi / BLE', 'LoRa', 'SDR'],
  mechanical: ['PLA prints', 'PETG / carbon', 'CNC aluminium'],
};

/** Crew sizes the wizard offers. Ten is the large table, full. */
export const SEAT_OPTIONS = [1, 2, 4, 6, 8, 10];

/** Every axis on its three-star option: the catalogue's own numbers. */
export function defaultDesign(category: ProjectCategory): DesignChoice {
  // The middle option everywhere, and the web on its own: the brief as written.
  return Object.fromEntries(CATEGORY_AXES[category].map((axis) => [axis, isMulti(axis) ? 0 : 1]));
}

export function optionOf(axis: DesignAxisId, choice: DesignChoice): DesignOption {
  const index = Math.max(0, Math.min(2, Math.round(choice[axis] ?? 1)));
  return AXES[axis].options[index];
}

/**
 * **Crew size is a quality decision, not just a speed one** — the biggest single lever on
 * how good the thing is. Every brief has a size it was scoped for (`ProjectDef.teamSize`).
 *
 * - Under it, the plan is thin: nobody is checking anybody, and quality pays for it.
 * - Up to twice it, more eyes make a better plan.
 * - Past that it is too many cooks, and the plan gets worse again.
 *
 * Speed is left to the existing crowd curve (§3b), and the other cost of a big crew is
 * physical: **everyone has to sit at the table at once** for the kickoff (§4d), and the
 * more people there are, the less likely that is on any given day.
 */
export type FitKey = 'short' | 'thin' | 'right' | 'well' | 'crowded' | 'cooks';

export function teamFit(seats: number, ideal: number): { quality: number; key: FitKey } {
  const ratio = Math.max(1, seats) / Math.max(1, ideal);
  let quality: number;
  if (ratio < 1) quality = DESIGN.teamUnder * Math.log2(ratio);
  else if (ratio <= 2) quality = DESIGN.teamOver * Math.log2(ratio);
  else quality = DESIGN.teamOver - DESIGN.teamCrowd * Math.log2(ratio / 2);
  // A key, not a phrase: the log stores it and the UI says it, each in the player's
  // language (§11), so the sim never hands over English.
  const key: FitKey =
    ratio < 0.75
      ? 'short'
      : ratio < 1
        ? 'thin'
        : ratio <= 1.25
          ? 'right'
          : ratio <= 2
            ? 'well'
            : ratio <= 3
              ? 'crowded'
              : 'cooks';
  return { quality, key };
}

type Part = Omit<PartData, 'id' | 'status' | 'attempts'>;

/** Everything a plan works out to, for the sim to build from and the wizard to preview. */
export interface PlanSummary {
  /** Work per stage, design and crew applied. */
  work: Record<StageKey, number>;
  parts: Part[];
  bomCost: number;
  leadDays: number;
  /** The design budget, paid at the pitch on top of the parts. */
  tooling: number;
  /** Quality from the design choices alone. */
  designQuality: number;
  /** Quality from the crew size, if every seat is filled. */
  teamQuality: number;
  teamKey: FitKey;
  appeal: number;
  testRisk: number;
  skipSim: boolean;
  /** Machines the design needs that the space does not own. */
  missing: MachineType[];
  /** 0-5, for the stars on the review screen. */
  stars: number;
  /** The technology tier the crew brings (0-2), from its best level in the wing. */
  tech: 0 | 1 | 2;
}

export function planProject(def: ProjectDef, plan: ProjectPlan, owned: MachineType[] = []): PlanSummary {
  const axes = CATEGORY_AXES[def.category];
  const work = {} as Record<StageKey, number>;
  // The size of the build sets its scale (§4): the catalogue gives the proportions.
  // A print order is the client's hours, not ours to scale.
  const pace = def.order ? { work: 1, print: 1, lead: 1 } : TIER_PACE[def.tier];
  for (const key of STAGE_ORDER) work[key] = (def.work[key] ?? STAGE_MAP[key].work) * pace.work;

  let bom = 1;
  let print = 1;
  let lead = 0;
  let tooling = 0;
  let designQuality = 0;
  let appeal = 1;
  let testRisk = 1;
  let skipSim = false;
  let stars = 0;
  const needs = new Set<MachineType>();

  // Every option chosen, the multi-select axis contributing one per platform switched on.
  const chosen: { axis: DesignAxisId; option: DesignOption }[] = axes.flatMap((axis) =>
    isMulti(axis)
      ? picked(axis, plan.design).map((index) => ({ axis, option: AXES[axis].options[index] }))
      : [{ axis, option: optionOf(axis, plan.design) }],
  );
  for (const { axis, option } of chosen) {
    stars += isMulti(axis) ? 0 : option.stars;
    designQuality += option.quality ?? 0;
    appeal *= option.appeal ?? 1;
    testRisk *= option.testRisk ?? 1;
    bom *= option.bom ?? 1;
    print *= option.print ?? 1;
    lead += option.lead ?? 0;
    tooling += optionCost(def, option);
    bom *= DESIGN.starBom[option.stars];
    if (option.skipSim) skipSim = true;
    for (const machine of option.requires ?? []) needs.add(machine);
    for (const stage of AXES[axis].stages) work[stage] = work[stage] * (option.work ?? 1);
  }

  // The technology the crew brings, by its best in the wing: nobody picks it (§5.4).
  const level = plan.levels?.[def.category];
  const tier = techTier(level);
  designQuality += DESIGN.techQuality[tier];
  testRisk *= DESIGN.techRisk[tier];
  for (const stage of ['cad', 'simulation', 'assembly', 'iterate'] as StageKey[]) {
    work[stage] = work[stage] * DESIGN.techWork[tier];
  }

  // A bigger crew has more to agree on before anybody starts: the kickoff grows with it.
  // Without this ten people would plan a phone stand in twenty minutes, which is the
  // opposite of every meeting anybody has ever sat through.
  work.concept =
    work.concept * DESIGN.kickoffScale * (1 + DESIGN.kickoffPerSeat * (Math.max(1, plan.seats) - 1));
  if (skipSim) work.simulation = 0;
  // A stage the build goes through keeps at least one unit: scaled small enough to round
  // to nothing, it would read as a stage the build skips.
  for (const key of STAGE_ORDER) work[key] = work[key] > 0 ? Math.max(1, Math.round(work[key])) : 0;

  // A print order has nothing to design: no budget, and nothing to simulate.
  if (def.order) {
    tooling = 0;
    skipSim = true;
  }
  const team = teamFit(plan.seats, def.teamSize);
  return {
    work,
    parts: def.parts.map((part) => ({
      ...part,
      hours: Math.max(1, Math.round(part.hours * print * pace.print * 2) / 2),
      material: Math.round(part.material * print),
    })),
    bomCost: Math.round((def.bomCost * bom) / 10) * 10,
    leadDays: def.bomCost > 0 ? Math.max(0, Math.round((def.leadDays + lead) * pace.lead)) : 0,
    tooling: Math.round(tooling),
    designQuality,
    teamQuality: team.quality,
    teamKey: team.key,
    appeal,
    testRisk,
    skipSim,
    missing: [...needs].filter((machine) => !owned.includes(machine)),
    stars: stars / Math.max(1, axes.filter((axis) => !isMulti(axis)).length),
    tech: tier,
  };
}

/**
 * Roughly how many working hours a crew of this size takes over this much hand work — for
 * saying it in days (design §2), never for deciding anything. Everybody at a mid skill, the
 * crowd curve applied (§3b): the second pair of hands adds 0.6, each after that a little less.
 */
export function crewHours(work: number, crew: number): number {
  const people = Math.max(1, Math.min(crew, MEMBER.maxWorkersPerStage));
  let hands = 1;
  for (let i = 1; i < people; i += 1) hands += MEMBER.extraWorkerFactor * Math.pow(MEMBER.crowdDecay, i - 1);
  const rate = MEMBER.baseWorkRate * (1 + 2 * MEMBER.skillRateBonus);
  return work / (rate * hands);
}

/** The same plan every harness uses: defaults, at the brief's size. */
/**
 * The design budget an option carries, scaled by its stars (§4c): a one-star shortcut is
 * nearly free, the three-star default costs a little, five stars costs real money. It is a
 * share of what the brief pays plus a floor, so a big client job is dearer to do properly
 * than a phone stand — and cost, quality and return all move the same way.
 */
export function optionCost(def: ProjectDef, option: DesignOption): number {
  return Math.round(DESIGN.starBudget[option.stars] * (DESIGN.budgetBase + DESIGN.budgetShare * def.payout));
}

/** The best level anybody on the crew has in a skill; 0 for an empty crew. */
export function crewBest(crew: { skills: Record<SkillKey, number> }[], skill: SkillKey): number {
  return Math.max(0, ...crew.map((m) => m.skills[skill] ?? 0));
}

/**
 * The plan the harnesses take: three stars where the crew can do
 * three stars, one star where it cannot, at the brief's own size.
 */
export function defaultPlan(
  def: ProjectDef,
  maxSeats = 10,
  crew?: { skills: Record<SkillKey, number> }[],
): ProjectPlan {
  // The brief as written, stepped down wherever the crew cannot back it.
  const levels = crew ? crewLevels(crew) : undefined;
  const design = clampDesign(def.category, defaultDesign(def.category), levels);
  return { design, seats: Math.max(1, Math.min(def.teamSize, maxSeats)), levels };
}

/** The crew's best level in each wing — what a plan reads its technology and prices from. */
export function crewLevels(crew: { skills: Record<SkillKey, number> }[]): Partial<Record<ProjectCategory, number>> {
  const out: Partial<Record<ProjectCategory, number>> = {};
  for (const wing of ['software', 'electronics', 'comms', 'mechanical'] as ProjectCategory[]) out[wing] = crewBest(crew, wing);
  return out;
}

/**
 * About how many days a plan takes, for the forecast (design §5.4) — the hand work spread
 * over the crew on working days, the parts in their box, the prints on the clock. Never
 * decides anything; the sim does the real thing.
 */
export function forecastDays(summary: PlanSummary, seats: number): number {
  const hand = STAGE_ORDER.reduce((sum, key) => sum + summary.work[key], 0);
  const handDays = (crewHours(hand, seats) / 8) * (7 / 5);
  const printDays = summary.parts.reduce((sum, part) => sum + part.hours, 0) / 24;
  return Math.max(1, Math.round((Math.max(handDays, summary.leadDays) + printDays * 0.6) * 2) / 2);
}

/**
 * The chance a build fails a test — the one formula, read by the sim's test and by the
 * forecast alike. `testRisk` carries every risk the design took on (skipping simulation is
 * one of them); `kit` is what the space owns that finds faults first; each earlier attempt
 * makes it likelier to pass.
 */
export function testFailChance(quality: number, testRisk = 1, attempts = 0, kit = 1): number {
  const pass = TEST.basePass + (quality - 0.5) * 2 * TEST.qualityWeight;
  let fail = Math.max(0.02, 1 - pass) * testRisk * kit;
  fail = Math.max(0.02, fail - attempts * TEST.attemptBonus);
  return Math.min(0.95, fail);
}

/**
 * About how long one failed test costs: the Iterate stage's hand work, one part printed
 * again (most failures break one), and a day to test it again. **The forecast used to leave
 * this out**, and measured in `era-pace` it was nearly the whole miss: a medium build that
 * passed first time shipped on the forecast to the day, and one that failed ran about nine
 * days over.
 */
export function retryDays(summary: PlanSummary, seats: number): number {
  const iterate = (crewHours(summary.work.iterate, seats) / 8) * (7 / 5);
  const reprint = summary.parts.length ? Math.max(...summary.parts.map((part) => part.hours)) / 24 : 0;
  return Math.max(1, Math.round((iterate + reprint + 1) * 2) / 2);
}

export type Preset = 'fast' | 'best' | 'profit';

/**
 * The three ready plans (design §5.4): the quickest, the best, the most money for the
 * time. Every combination of the wing's choices is tried through `planProject` — a
 * handful, since each axis has three options and the platforms four switches — and the one
 * that wins on the preset's measure is kept. The crew's levels are in, so a plan that
 * reaches too far loses on its own numbers.
 */
export function presetDesign(def: ProjectDef, preset: Preset, plan: ProjectPlan, owned: MachineType[] = []): DesignChoice {
  const axes = CATEGORY_AXES[def.category];
  let designs: DesignChoice[] = [{}];
  for (const axis of axes) {
    const values = isMulti(axis) ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 2];
    designs = designs.flatMap((d) => values.map((v) => ({ ...d, [axis]: v })));
  }
  const score = (design: DesignChoice): number => {
    const summary = planProject(def, { ...plan, design }, owned);
    if (summary.missing.length) return -Infinity;
    const quality = 0.45 + summary.designQuality;
    const days = forecastDays(summary, plan.seats);
    const pay = def.payout * summary.appeal * qualityPay(quality) - summary.tooling;
    if (preset === 'fast') return -days * 1000 + quality;
    if (preset === 'best') return quality * 1000 + summary.appeal;
    return pay / days;
  };
  // Only what the crew can back: a preset never picks a locked card.
  const open = designs.filter((d) => {
    const clamped = clampDesign(def.category, d, plan.levels);
    return axes.every((axis) => Math.round(clamped[axis] ?? 0) === Math.round(d[axis] ?? 0));
  });
  return open.reduce((best, d) => (score(d) > score(best) ? d : best), open[0] ?? defaultDesign(def.category));
}

/** What a plan promises at the pitch: the review screen's numbers, and the ship report's yardstick. */
export interface BuildForecast {
  quality: number;
  /** Expected days: the clean run, plus a failed test's cost weighted by its chance. */
  days: number;
  /** Days if the first test passes. */
  clean: number;
  /** Chance the first test fails, and what that adds. */
  fail: number;
  retry: number;
  payout: number;
  hype: number;
}

/**
 * **The forecast, worked out once** (design §5.4). The wizard's review shows it and the pitch
 * stores it on the build, so the report at release compares the build against exactly what
 * the player was promised — two copies of this sum would drift, and the report would then
 * be judging the build against a number nobody saw.
 *
 * `crew` is each crew member's level in the build's wing; `built` how many of this brief
 * have shipped before.
 */
export function forecastBuild(
  def: ProjectDef,
  plan: ProjectPlan,
  summary: PlanSummary,
  crew: number[],
  market: { demand: number; built: number },
): BuildForecast {
  const craft = crew.length ? crew.reduce((sum, level) => sum + level, 0) / crew.length / 5 : 0.5;
  const team = teamFit(Math.max(1, crew.length || plan.seats), def.teamSize);
  const quality = Math.max(0.05, Math.min(1, craft + summary.designQuality + team.quality));
  const clean = forecastDays(summary, plan.seats);
  const fail = testFailChance(quality, summary.testRisk);
  const retry = retryDays(summary, plan.seats);
  // Each failure is likelier to be the last: the attempt bonus makes a second one rarer.
  const second = fail * testFailChance(quality, summary.testRisk, 1);
  const days = Math.round((clean + (fail + second) * retry) * 2) / 2;
  const novelty = Math.max(REPEAT.floor, REPEAT.falloff ** market.built);
  const payout = Math.round(def.payout * novelty * market.demand * summary.appeal * qualityPay(quality));
  const hype = Math.round(def.hype * novelty * Math.sqrt(summary.appeal) * qualityHype(quality));
  return { quality, days, clean, fail, retry, payout, hype };
}

/**
 * What quality is worth at release. A middling build earns the catalogue's number; a
 * great one earns about half as much again and a poor one about three quarters.
 */
export function qualityPay(quality: number): number {
  return DESIGN.payBase + DESIGN.payPerQuality * quality;
}

export function qualityHype(quality: number): number {
  return DESIGN.hypeBase + DESIGN.hypePerQuality * quality;
}

/** Stars to draw for a 0-1 quality. Half stars are real: 0.63 is three and a half. */
export function qualityStars(quality: number): number {
  return Math.max(0.5, Math.min(5, Math.round(quality * 10) / 2));
}

/** The best option somebody with this level unlocks on their own: five, three or one star. */
export function starsFor(level: number): 1 | 3 | 5 {
  return level >= DESIGN.starSkill[5] ? 5 : level >= DESIGN.starSkill[3] ? 3 : 1;
}

/**
 * One person against a genre's three decisions (§4c): what they would unlock on each, and
 * the average as the one figure a crew chip has room for. Training moves it.
 */
export function genreStars(
  skills: Record<SkillKey, number>,
  category: ProjectCategory,
): { stars: number; axes: { axis: DesignAxisId; skill: SkillKey; level: number; stars: 1 | 3 | 5 }[] } {
  const axes = CATEGORY_AXES[category].map((axis) => {
    // Every decision in a wing leans on the wing's own role (design §5).
    const skill: SkillKey = category;
    const level = skills[skill] ?? 0;
    return { axis, skill, level, stars: starsFor(level) };
  });
  const mean = axes.reduce((sum, a) => sum + a.stars, 0) / axes.length;
  return { stars: Math.round(mean * 2) / 2, axes };
}

/**
 * A plan's design as one rating (§4c): the three choices' stars averaged, to the half star.
 * One, three and five on three axes give 1 to 5 in half steps.
 */
export function designStars(category: ProjectCategory, design: DesignChoice): number {
  // The platforms are scope, not a star rating; the one-of-three choices carry the stars.
  const axes = CATEGORY_AXES[category].filter((axis) => !isMulti(axis));
  const total = axes.reduce((sum, axis) => sum + optionOf(axis, design).stars, 0);
  return Math.round((total / Math.max(1, axes.length)) * 2) / 2;
}
