import type {
  Employment,
  MachineType,
  ProjectData,
  RivalState,
  Shift,
  Tag,
} from '@/game/types';
import type { Job } from '@/machines/Machine';
import type { Tile } from '@/utils/grid';

export interface MemberSave {
  id: string;
  employment: Employment;
  shift: Shift | null;
  team: string | null;
  interest: number;
  energy: number;
  mood: number;
  ghostFactor: number;
  present: boolean;
  tile: Tile;
  cooldowns: [string, number][];
}

export interface PlayerSave {
  hoursToday: number;
  hoursLeft: number;
  energy: number;
  project: string | null;
  calibrating: boolean;
  present: boolean;
  tile: Tile;
}

export interface MachineSave {
  id: string;
  type: MachineType;
  calibration: number;
  consumable: number;
  current: Job | null;
  queue: Job[];
}

/**
 * One save slot in localStorage. Bump `VERSION` whenever the shape changes — an old file is
 * discarded rather than half-loaded, because a save that loads into a broken game is worse
 * than no save at all.
 */
export const SAVE_KEY = 'hackerspace-tycoon-save-v1';
export const SAVE_VERSION = 3;

export interface SaveFile {
  version: number;
  savedAt: number;
  /** Everything the store owns, minus its functions. */
  store: Record<string, unknown>;
  sim: {
    day: number;
    time: number;
    yearStart: { day: number; projects: number; reputation: number };
    rivalYearStart: [string, { projects: number; reputation: number }][];
    machineHoursThisMonth: number;
    incomeThisMonth: number;
    recruitClock: number;
    recentShip: { tags: Tag[]; name: string; day: number } | null;
    seeded: string[];
    requeueTimers: [string, number][];
    rivals: RivalState[];
    projects: ProjectData[];
    members: MemberSave[];
    player: PlayerSave;
    machines: MachineSave[];
    installedStations: { id: string; type: MachineType }[];
  };
  /** Shown on the start screen so you know what you are returning to. */
  summary: {
    name: string;
    icon: string;
    colour: string;
    day: number;
    shipped: number;
    reputation: number;
    cash: number;
    era: string;
  };
}

export function readSave(): SaveFile | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const file = JSON.parse(raw) as SaveFile;
    if (file.version !== SAVE_VERSION) {
      localStorage.removeItem(SAVE_KEY);
      return null;
    }
    return file;
  } catch {
    // A corrupt or unreadable file is the same as no file.
    return null;
  }
}

export function writeSave(file: SaveFile): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(file));
    return true;
  } catch {
    // Private windows and full quotas both land here; the game carries on unsaved.
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* nothing to do */
  }
}
