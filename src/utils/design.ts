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
import { DESIGN, STAGE_MAP, STAGE_ORDER } from './constants';

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
  /** One-off cost at the pitch: a licence, a tool, a subscription. */
  cost?: number;
  /** One-off cost per seat — licences are bought per person. */
  perSeat?: number;
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
        blurb: 'Refactoring that works and a debugger that finds things. A licence per seat.',
        quality: 0.06,
        work: 0.86,
        perSeat: 450,
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
        blurb: 'Components, tokens and a round of user testing. People notice.',
        appeal: 1.3,
        quality: 0.03,
        work: 1.25,
        cost: 600,
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
        cost: 500,
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
        blurb: 'Tasks, watchdogs and updates over the air. Nobody climbs a ladder to reflash it.',
        quality: 0.06,
        work: 1.22,
        testRisk: 0.72,
        appeal: 1.08,
      },
    ],
  },
  enclosure: {
    id: 'enclosure',
    label: 'Enclosure',
    question: 'What does it live in?',
    stages: ['assembly'],
    skill: 'cad',
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
    skill: 'cad',
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
        blurb: 'Assemblies, CAM and simulation in one place. A seat each, every month.',
        quality: 0.06,
        work: 0.85,
        perSeat: 520,
        print: 0.9,
      },
    ],
  },
  material: {
    id: 'material',
    label: 'Material',
    question: 'What takes the load?',
    stages: ['assembly'],
    skill: 'machining',
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
    skill: 'cad',
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
        blurb: 'Stress, thermal and motion, run properly. The test rarely surprises anyone.',
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
    skill: 'docs',
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
        cost: 400,
        quality: 0.03,
      },
    ],
  },
};

/** The three decisions each genre asks, in the order the wizard asks them. */
export const CATEGORY_AXES: Record<ProjectCategory, [DesignAxisId, DesignAxisId, DesignAxisId]> = {
  software: ['editor', 'ui', 'architecture'],
  electronics: ['board', 'firmware', 'enclosure'],
  iot: ['board', 'firmware', 'architecture'],
  radio: ['board', 'firmware', 'validation'],
  retro: ['board', 'enclosure', 'firmware'],
  robotics: ['cadtool', 'firmware', 'validation'],
  mechanical: ['cadtool', 'material', 'validation'],
  home: ['cadtool', 'material', 'enclosure'],
  tooling: ['cadtool', 'material', 'board'],
  civic: ['board', 'firmware', 'docs'],
};

/** Crew sizes the wizard offers. Ten is the large table, full. */
export const SEAT_OPTIONS = [1, 2, 3, 4, 5, 10];

/** Every axis on its three-star option: the catalogue's own numbers. */
export function defaultDesign(category: ProjectCategory): DesignChoice {
  return Object.fromEntries(CATEGORY_AXES[category].map((axis) => [axis, 1]));
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
  /** Licences and tools, paid at the pitch on top of the parts. */
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
}

export function planProject(
  def: ProjectDef,
  plan: ProjectPlan,
  owned: MachineType[] = [],
): PlanSummary {
  const axes = CATEGORY_AXES[def.category];
  const work = {} as Record<StageKey, number>;
  for (const key of STAGE_ORDER) work[key] = def.work[key] ?? STAGE_MAP[key].work;

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

  for (const axis of axes) {
    const option = optionOf(axis, plan.design);
    stars += option.stars;
    designQuality += option.quality ?? 0;
    appeal *= option.appeal ?? 1;
    testRisk *= option.testRisk ?? 1;
    bom *= option.bom ?? 1;
    print *= option.print ?? 1;
    lead += option.lead ?? 0;
    tooling +=
      optionCost(def, option) + (option.cost ?? 0) + (option.perSeat ?? 0) * Math.max(1, plan.seats);
    bom *= DESIGN.starBom[option.stars];
    if (option.skipSim) skipSim = true;
    for (const machine of option.requires ?? []) needs.add(machine);
    for (const stage of AXES[axis].stages) work[stage] = work[stage] * (option.work ?? 1);
  }

  // A bigger crew has more to agree on before anybody starts: the kickoff grows with it.
  // Without this ten people would plan a phone stand in twenty minutes, which is the
  // opposite of every meeting anybody has ever sat through.
  work.concept =
    work.concept * DESIGN.kickoffScale * (1 + DESIGN.kickoffPerSeat * (Math.max(1, plan.seats) - 1));
  if (skipSim) work.simulation = 0;
  for (const key of STAGE_ORDER) work[key] = Math.round(work[key]);

  const team = teamFit(plan.seats, def.teamSize);
  return {
    work,
    parts: def.parts.map((part) => ({
      ...part,
      hours: Math.max(1, Math.round(part.hours * print * 2) / 2),
      material: Math.round(part.material * print),
    })),
    bomCost: Math.round((def.bomCost * bom) / 10) * 10,
    leadDays: def.bomCost > 0 ? def.leadDays + lead : 0,
    tooling: Math.round(tooling),
    designQuality,
    teamQuality: team.quality,
    teamKey: team.key,
    appeal,
    testRisk,
    skipSim,
    missing: [...needs].filter((machine) => !owned.includes(machine)),
    stars: stars / axes.length,
  };
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

/** The skill level an option asks of somebody on the crew. */
export function optionNeeds(option: DesignOption): number {
  return DESIGN.starSkill[option.stars];
}

/** The best level anybody on the crew has in a skill; 0 for an empty crew. */
export function crewBest(crew: { skills: Record<SkillKey, number> }[], skill: SkillKey): number {
  return Math.max(0, ...crew.map((m) => m.skills[skill] ?? 0));
}

/** Can this crew use this option? One star is always on the table. */
export function optionAvailable(
  axis: DesignAxisId,
  index: number,
  crew: { skills: Record<SkillKey, number> }[],
): boolean {
  const option = AXES[axis].options[index];
  return crewBest(crew, AXES[axis].skill) >= optionNeeds(option);
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
  const design = defaultDesign(def.category);
  if (crew) {
    for (const axis of CATEGORY_AXES[def.category]) {
      if (!optionAvailable(axis, 1, crew)) design[axis] = 0;
    }
  }
  return { design, seats: Math.max(1, Math.min(def.teamSize, maxSeats)) };
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
    const skill = AXES[axis].skill;
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
  const axes = CATEGORY_AXES[category];
  const total = axes.reduce((sum, axis) => sum + optionOf(axis, design).stars, 0);
  return Math.round((total / axes.length) * 2) / 2;
}
