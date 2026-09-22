import type {
  BacklogEntry,
  MachineType,
  PartData,
  ProjectData,
  ProjectPlan,
  StageKey,
} from '@/game/types';
import { STAGE_ORDER, SOURCING, TEST } from '@/utils/constants';
import { CATALOG_MAP } from '@/utils/catalog';
import { defaultPlan, planProject } from '@/utils/design';
import { uid } from '@/utils/format';
import { rng } from '@/utils/rng';

function emptyProgress(): Record<StageKey, number> {
  return {
    concept: 0,
    cad: 0,
    simulation: 0,
    fabrication: 0,
    assembly: 0,
    test: 0,
    iterate: 0,
    release: 0,
  };
}

/**
 * A live project from a brief and a plan (§4d). Every number the design changes — work,
 * parts, money, risk — is worked out once here by `planProject`, the same function the
 * wizard previews with, so what the review screen promised is what the build carries.
 */
export function startProject(
  entry: BacklogEntry,
  day: number,
  plan?: ProjectPlan,
  owned: MachineType[] = [],
): ProjectData {
  const def = CATALOG_MAP[entry.defId];
  const chosen = plan ?? defaultPlan(def);
  const summary = planProject(def, chosen, owned);
  const required = emptyProgress();
  for (const key of STAGE_ORDER) required[key] = summary.work[key];
  return {
    id: uid('proj'),
    defId: def.id,
    name: def.name,
    category: def.category,
    tags: [...def.tags],
    stage: 'concept',
    progress: emptyProgress(),
    required,
    quality: 0.5,
    scope: 1,
    team: [],
    teamSize: Math.max(1, chosen.seats),
    parts: [],
    defects: [],
    bounties: [],
    simulationSkipped: summary.skipSim,
    testAttempts: 0,
    shipped: false,
    bomCost: summary.bomCost,
    leadDays: summary.leadDays,
    // A weekend build has nothing to order, so it must not sit waiting on a delivery.
    partsOrdered: summary.bomCost === 0,
    partsArriveAt: 0,
    sponsorCash: entry.sponsorCash ?? 0,
    hypeMultiplier: entry.hypeMultiplier ?? 1,
    spent: 0,
    proposerId: entry.proposerId,
    startedOnDay: day,
    idleDays: 0,
    design: { ...chosen.design },
    craft: 0.5,
    // The design's share of quality is known at the pitch; the crew's is added at the end
    // of the kickoff, from whoever actually sat down (see `Simulation.finishKickoff`).
    bonus: summary.designQuality,
    appeal: summary.appeal,
    testRisk: summary.testRisk,
    tableId: null,
    kickedOff: false,
    contrib: {},
  };
}

/** Quality is craft plus what the design and the crew added, and never quite zero. */
export function refreshQuality(project: ProjectData) {
  project.quality = Math.max(0.05, Math.min(1, project.craft + project.bonus));
}

/** Parts appear once CAD is done — you cannot print what nobody has modelled. */
export function generateParts(project: ProjectData) {
  const def = CATALOG_MAP[project.defId];
  // The design scales the print list (a bare board prints almost nothing, a paper sketch
  // wastes filament) — the same numbers the wizard showed.
  const parts = planProject(def, { design: project.design ?? {}, seats: project.teamSize }).parts;
  project.parts = parts.map((part) => ({
    ...part,
    id: uid('part'),
    status: 'pending' as const,
    attempts: 0,
  }));
}

/**
 * Add work to the current stage, blending in the contributor's quality for stages
 * where craft matters. `craft` is 0-1.
 */
export function addWork(project: ProjectData, amount: number, craft: number) {
  const stage = project.stage;
  const before = project.progress[stage];
  project.progress[stage] = before + amount;

  if (stage === 'cad' || stage === 'iterate') {
    const total = before + amount;
    project.craft = total > 0 ? (project.craft * before + craft * amount) / total : craft;
    refreshQuality(project);
  }
}

export function stageRequirement(project: ProjectData, stage: StageKey = project.stage): number {
  return project.required[stage];
}

export function stageComplete(project: ProjectData): boolean {
  const required = stageRequirement(project);
  if (required === 0) return false; // machine- or sim-resolved stages advance elsewhere
  return project.progress[project.stage] >= required;
}

export function remainingWork(project: ProjectData): number {
  return Math.max(0, stageRequirement(project) - project.progress[project.stage]);
}

/**
 * One number for the whole build, so a card can show a single bar instead of eight rows.
 * Fabrication is weighted by machine hours rather than work units, because that is what it
 * actually costs; Test resolves instantly and carries no weight.
 */
export function projectProgress(project: ProjectData): { ratio: number; done: number; total: number } {
  let total = 0;
  let done = 0;
  for (const key of STAGE_ORDER) {
    if (key === 'test') continue;
    if (key === 'fabrication') {
      const hours = project.parts.reduce((sum, part) => sum + part.hours, 0);
      total += hours;
      done += project.parts
        .filter((part) => part.status === 'done')
        .reduce((sum, part) => sum + part.hours, 0);
      continue;
    }
    const need = project.required[key];
    total += need;
    done += Math.min(need, project.progress[key]);
  }
  return { ratio: total > 0 ? done / total : 0, done, total };
}

export function partsOutstanding(project: ProjectData): PartData[] {
  return project.parts.filter((p) => p.status !== 'done');
}

// --- Sourcing ---------------------------------------------------------------

/** Assembly cannot start until the bought parts land (CLAUDE.md §4). */
export function partsPending(project: ProjectData, nowHours: number): boolean {
  return !project.partsOrdered || nowHours < project.partsArriveAt;
}

export function partsEta(project: ProjectData, nowHours: number): number {
  if (!project.partsOrdered) return project.leadDays * 24;
  return Math.max(0, project.partsArriveAt - nowHours);
}

export function expediteCost(project: ProjectData, nowHours: number): number {
  const remaining = partsEta(project, nowHours);
  if (remaining <= 0) return 0;
  const fraction = remaining / (project.leadDays * 24);
  return Math.round(project.bomCost * SOURCING.expediteCostRatio * fraction);
}

// --- Test -------------------------------------------------------------------

const DEFECTS = [
  'a joint let go under the first real load',
  'vibration shook a connector loose',
  'the enclosure cracked around a mounting boss',
  'a brownout reset it every time the motor spun up',
  'thermals went out of spec after ten minutes',
  'layer adhesion failed exactly where the stress is',
  'the firmware locked up and would not come back',
];

export interface TestOutcome {
  passed: boolean;
  defect?: string;
  /** Part that needs remaking, if the failure was structural. */
  brokenPartId?: string;
  chance: number;
}

/** §13.6 — does it work, or does it become a lesson? */
export function resolveTest(project: ProjectData): TestOutcome {
  const pass = TEST.basePass + (project.quality - 0.5) * 2 * TEST.qualityWeight;
  let fail = Math.max(0.02, 1 - pass);
  // Every risk the build carries lives in one multiplier: the design's (eyeballing it
  // instead of simulating is one of them) and the Skip button's, which multiplies itself in
  // when pressed. Two places deciding the same penalty is how it gets applied twice.
  fail *= project.testRisk ?? 1;
  fail = Math.max(0.02, fail - project.testAttempts * TEST.attemptBonus);
  fail = Math.min(0.95, fail);

  project.testAttempts += 1;
  if (!rng.chance(fail)) {
    return { passed: true, chance: 1 - fail };
  }

  const defect = rng.pick(DEFECTS);
  project.defects.push(defect);

  // Most structural failures cost you a part — back to the machine queue.
  const structural = rng.chance(0.65) && project.parts.length > 0;
  const broken = structural ? rng.pick(project.parts) : undefined;
  if (broken) broken.status = 'pending';

  return { passed: false, defect, brokenPartId: broken?.id, chance: 1 - fail };
}
