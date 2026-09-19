import type { PartData, ProjectData, StageKey } from '@/game/types';
import { DRONE_PARTS, PROJECT_TAGS, STAGE_MAP, TEST } from '@/utils/constants';
import { uid } from '@/utils/format';
import { rng } from '@/utils/rng';

const EMPTY_PROGRESS: Record<StageKey, number> = {
  concept: 0,
  cad: 0,
  simulation: 0,
  fabrication: 0,
  assembly: 0,
  test: 0,
  iterate: 0,
  release: 0,
};

export function createDroneProject(): ProjectData {
  return {
    id: uid('proj'),
    name: 'FPV Drone',
    tags: [...PROJECT_TAGS],
    stage: 'concept',
    progress: { ...EMPTY_PROGRESS },
    quality: 0.5,
    scope: 1,
    parts: [],
    defects: [],
    bounties: [],
    simulationSkipped: false,
    testAttempts: 0,
    shipped: false,
  };
}

/** Parts appear once CAD is done — you cannot print what nobody has modelled. */
export function generateParts(project: ProjectData) {
  project.parts = DRONE_PARTS.map((p) => ({
    ...p,
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

export function stageComplete(project: ProjectData): boolean {
  const def = STAGE_MAP[project.stage];
  if (def.work === 0) return false; // machine- or sim-resolved stages advance elsewhere
  return project.progress[project.stage] >= def.work;
}

export function remainingWork(project: ProjectData): number {
  const def = STAGE_MAP[project.stage];
  return Math.max(0, def.work - project.progress[project.stage]);
}

export function partsOutstanding(project: ProjectData): PartData[] {
  return project.parts.filter((p) => p.status !== 'done');
}

const DEFECTS = [
  'arm snapped on the first hard yaw',
  'vibration shook the camera mount loose',
  'battery tray cracked under the strap',
  'frame flexed enough to desync the motors',
  'canopy popped off mid-flight',
  'layer adhesion failed at the arm root',
];

export interface TestOutcome {
  passed: boolean;
  defect?: string;
  /** Part that needs reprinting, if the failure was structural. */
  brokenPartId?: string;
  chance: number;
}

/** §13.6 — does it fly, or does it become a lesson? */
export function resolveTest(project: ProjectData): TestOutcome {
  let pass = TEST.basePass + (project.quality - 0.5) * 2 * TEST.qualityWeight;
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

  // Most structural failures cost you a part — back to the printer queue.
  const structural = rng.chance(0.65) && project.parts.length > 0;
  const broken = structural ? rng.pick(project.parts) : undefined;
  if (broken) broken.status = 'pending';

  return { passed: false, defect, brokenPartId: broken?.id, chance: 1 - fail };
}
