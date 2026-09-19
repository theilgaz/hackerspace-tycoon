import type { BacklogEntry, PartData, ProjectData, ProjectDef, StageKey } from '@/game/types';
import { STAGE_MAP, STAGE_ORDER, SOURCING, TEST } from '@/utils/constants';
import { CATALOG_MAP } from '@/utils/catalog';
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

/** Per-project work requirements: the def's overrides on top of the stage defaults. */
function requirements(def: ProjectDef): Record<StageKey, number> {
  const out = emptyProgress();
  for (const key of STAGE_ORDER) {
    out[key] = def.work[key] ?? STAGE_MAP[key].work;
  }
  return out;
}

export function startProject(entry: BacklogEntry, day: number): ProjectData {
  const def = CATALOG_MAP[entry.defId];
  return {
    id: uid('proj'),
    defId: def.id,
    name: def.name,
    category: def.category,
    tags: [...def.tags],
    stage: 'concept',
    progress: emptyProgress(),
    required: requirements(def),
    quality: 0.5,
    scope: 1,
    parts: [],
    defects: [],
    bounties: [],
    simulationSkipped: false,
    testAttempts: 0,
    shipped: false,
    bomCost: def.bomCost,
    leadDays: def.leadDays,
    partsOrdered: false,
    partsArriveAt: 0,
    sponsorCash: entry.sponsorCash ?? 0,
    hypeMultiplier: entry.hypeMultiplier ?? 1,
    proposerId: entry.proposerId,
    startedOnDay: day,
  };
}

/** Parts appear once CAD is done — you cannot print what nobody has modelled. */
export function generateParts(project: ProjectData) {
  const def = CATALOG_MAP[project.defId];
  project.parts = def.parts.map((part) => ({
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
    project.quality = total > 0 ? (project.quality * before + craft * amount) / total : craft;
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
  if (project.simulationSkipped) fail *= TEST.skippedSimPenalty;
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
