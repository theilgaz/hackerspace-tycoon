import type { MachineType, ProjectCategory, SkillKey, StageKey, Tag } from '@/game/types';

/**
 * A category is a genre, and genres here are mechanical as well as cosmetic: they rename
 * stages, decide which skill each stage leans on, and decide where in the space the work
 * happens. A software build has an Architecture stage at a desk, not a CAD stage at a
 * workbench (CLAUDE.md §4b).
 */
export interface CategoryProfile {
  label: string;
  icon: string;
  accent: string;
  blurb: string;
  /**
   * Passion tags that define this kind of work, most defining first. Later tags count for
   * less — categories share tags, so an unweighted match made every machinist read as a
   * roboticist just because Robotics also touches `machining`.
   */
  tags: Tag[];
  stageLabels?: Partial<Record<StageKey, string>>;
  stageStations?: Partial<Record<StageKey, MachineType>>;
}

/** Stage renames shared by everything that is written rather than built. */
const SOFTWARE_STAGES: Partial<Record<StageKey, string>> = {
  concept: 'Kickoff',
  cad: 'Architecture',
  simulation: 'Prototype',
  fabrication: 'Build Pipeline',
  assembly: 'Implementation',
  test: 'QA',
  iterate: 'Bugfix',
  release: 'Launch',
};

export const CATEGORY_PROFILES: Record<ProjectCategory, CategoryProfile> = {
  software: {
    label: 'Software',
    icon: '💻',
    accent: '#5aa9f0',
    blurb: 'No parts to print, no queue to wait on — and it is what actually pays.',
    tags: ['software', 'design'],
    stageLabels: SOFTWARE_STAGES,
    stageStations: { cad: 'cad-desk', assembly: 'cad-desk' },
  },
  electronics: {
    label: 'Electronics',
    icon: '🔌',
    accent: '#f0b429',
    blurb: 'Boards, power and solder — retro silicon and the gadgets people keep at home.',
    tags: ['electronics', 'retro', 'design'],
    stageStations: { assembly: 'bench' },
  },
  comms: {
    label: 'Communications',
    icon: '📡',
    accent: '#8fd88f',
    blurb: 'Radios, connected sensors and the smart city: things that talk to each other.',
    tags: ['radio', 'iot', 'civic'],
    stageLabels: { simulation: 'RF Sim', test: 'Field Test', release: 'Commission' },
    stageStations: { assembly: 'bench' },
  },
  mechanical: {
    label: 'Mechanical',
    icon: '⚙️',
    accent: '#e2725b',
    blurb: 'Frames, motion, robots and the machines that build machines.',
    tags: ['machining', 'fpv', 'robotics', 'cad'],
  },
};

/** The wings, in the order the New Project wizard lays them out. */
export const CATEGORY_ORDER: ProjectCategory[] = ['software', 'electronics', 'comms', 'mechanical'];

export function profileOf(category: ProjectCategory): CategoryProfile {
  return CATEGORY_PROFILES[category];
}

/** Weight of the 1st, 2nd, 3rd defining tag of a category. */
const TAG_WEIGHTS = [1, 0.75, 0.6];

/** How well somebody's passions fit a whole genre of work. 0-1. */
export function categoryAffinity(
  passions: Partial<Record<Tag, number>>,
  category: ProjectCategory,
): number {
  const tags = CATEGORY_PROFILES[category].tags;
  return Math.max(
    0,
    ...tags.map((tag, index) => (passions[tag] ?? 0) * (TAG_WEIGHTS[index] ?? 0.5)),
  );
}

/**
 * Somebody's **primary role** (design §3.1): the wing they are best at, their badge. On a
 * tie, the wing they love more — a person as good at software as at electronics who lives
 * for radios wears the radio.
 */
export function primaryWing(skills: Record<ProjectCategory, number>, passions: Partial<Record<Tag, number>>): ProjectCategory {
  return [...CATEGORY_ORDER].sort(
    (a, b) => (skills[b] ?? 0) - (skills[a] ?? 0) || categoryAffinity(passions, b) - categoryAffinity(passions, a),
  )[0];
}

/** The two genres somebody is most drawn to — their visible specialism. */
export function topCategories(
  passions: Partial<Record<Tag, number>>,
  count = 2,
): { category: ProjectCategory; score: number }[] {
  return CATEGORY_ORDER.map((category) => ({ category, score: categoryAffinity(passions, category) }))
    .filter((entry) => entry.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

// ---------------------------------------------------------------------------
// Category-aware stage lookups. Always go through these rather than reading
// STAGE_MAP / STAGE_STATION directly — a software build has no "CAD" stage.
// ---------------------------------------------------------------------------

import { STAGE_MAP } from './constants';
import { STAGE_STATION } from '@/machines/layout';

export function stageLabel(category: ProjectCategory, stage: StageKey): string {
  return CATEGORY_PROFILES[category].stageLabels?.[stage] ?? STAGE_MAP[stage].label;
}

/**
 * The role a stage leans on: **the wing's own** (design §4.1) — a software build's
 * architecture wants a Yazılımcı, a drone's CAD a Makineci. Machine-driven stages (printing,
 * the test) lean on nobody. Karma projects hand their assembly to the secondary wing; the
 * sim applies that, since it needs the brief.
 */
export function stageSkill(category: ProjectCategory, stage: StageKey): SkillKey | null {
  return STAGE_MAP[stage].skill === null ? null : category;
}

export function stageStation(category: ProjectCategory, stage: StageKey): MachineType | null {
  const override = CATEGORY_PROFILES[category].stageStations?.[stage];
  return override ?? STAGE_STATION[stage];
}
