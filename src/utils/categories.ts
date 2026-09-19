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
  stageSkills?: Partial<Record<StageKey, SkillKey>>;
  stageStations?: Partial<Record<StageKey, MachineType>>;
}

/** Stage renames shared by everything that is written rather than built. */
const SOFTWARE_STAGES: Partial<Record<StageKey, string>> = {
  concept: 'Spec',
  cad: 'Architecture',
  simulation: 'Prototype',
  fabrication: 'Build Pipeline',
  assembly: 'Implementation',
  test: 'QA',
  iterate: 'Bugfix',
  release: 'Launch',
};

export const CATEGORY_PROFILES: Record<ProjectCategory, CategoryProfile> = {
  electronics: {
    label: 'Electronics',
    icon: '🔌',
    accent: '#f0b429',
    blurb: 'Boards, power and solder.',
    tags: ['electronics', 'design'],
  },
  software: {
    label: 'Software',
    icon: '💻',
    accent: '#5aa9f0',
    blurb: 'No parts to print, no queue to wait on — and it is what actually pays.',
    tags: ['software', 'iot'],
    stageLabels: SOFTWARE_STAGES,
    stageSkills: { cad: 'software', simulation: 'software', assembly: 'software' },
    stageStations: { cad: 'cad-desk', assembly: 'cad-desk' },
  },
  mechanical: {
    label: 'Mechanical',
    icon: '⚙️',
    accent: '#e2725b',
    blurb: 'Frames, motion and things that take a load.',
    tags: ['machining', 'fpv', 'cad'],
  },
  robotics: {
    label: 'Robotics',
    icon: '🦾',
    accent: '#c58ef0',
    blurb: 'Motion, control and a healthy respect for the emergency stop.',
    tags: ['robotics', 'software', 'machining'],
    stageSkills: { simulation: 'software' },
  },
  iot: {
    label: 'IoT',
    icon: '🌐',
    accent: '#6fd0e0',
    blurb: 'Small connected things that must never need rebooting.',
    tags: ['iot', 'electronics', 'software'],
    stageSkills: { simulation: 'software' },
  },
  radio: {
    label: 'Radio',
    icon: '📡',
    accent: '#8fd88f',
    blurb: 'Antennas, range tests, and arguing about SWR.',
    tags: ['radio', 'electronics'],
    stageLabels: { simulation: 'RF Sim', test: 'Range Test' },
  },
  tooling: {
    label: 'Tooling',
    icon: '🛠️',
    accent: '#cbd3de',
    blurb: 'Build the machine that builds the machines.',
    tags: ['machining', 'electronics'],
    stageLabels: { release: 'Commission' },
  },
  civic: {
    label: 'Civic',
    icon: '🤝',
    accent: '#7fb2f0',
    blurb: 'Low pay, heavy documentation, and the neighbourhood remembers.',
    tags: ['civic', 'iot'],
    stageLabels: { release: 'Publish' },
    stageSkills: { release: 'docs' },
  },
  retro: {
    label: 'Retro',
    icon: '🕹️',
    accent: '#f08fa4',
    blurb: 'Old silicon, warm glow, unreasonable effort.',
    tags: ['retro', 'electronics', 'design'],
  },
  home: {
    label: 'Home',
    icon: '🍕',
    accent: '#e0c36a',
    blurb: 'Things for the space itself, and for the people in it.',
    tags: ['food', 'woodworking', 'design'],
  },
};

export const CATEGORY_ORDER: ProjectCategory[] = [
  'software',
  'electronics',
  'iot',
  'radio',
  'robotics',
  'mechanical',
  'retro',
  'home',
  'tooling',
  'civic',
];

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

export function stageSkill(category: ProjectCategory, stage: StageKey): SkillKey | null {
  const override = CATEGORY_PROFILES[category].stageSkills?.[stage];
  return override ?? STAGE_MAP[stage].skill;
}

export function stageStation(category: ProjectCategory, stage: StageKey): MachineType | null {
  const override = CATEGORY_PROFILES[category].stageStations?.[stage];
  return override ?? STAGE_STATION[stage];
}
