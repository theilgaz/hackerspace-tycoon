import type {
  Employment,
  MachineType,
  ProjectData,
  RivalState,
  Role,
  Shift,
  Tag,
} from '@/game/types';
import type { Job } from '@/machines/Machine';
import type { Tile } from '@/utils/grid';

export interface MemberSave {
  id: string;
  employment: Employment;
  shift: Shift | null;
  role: Role | null;
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
 * One save slot in localStorage.
 *
 * **An old file is migrated, not thrown away.** It used to be discarded on any version
 * change, on the reasoning that a half-loaded save is worse than none — which is true of a
 * *broken* load and not true of a missing field. In practice every bump since has only ever
 * *added* something, so four releases in a row silently deleted the player's run and they
 * never once reached an awards night. Losing a save is the worst thing this file can do;
 * filling in a default is the cheapest.
 *
 * `migrate` below is the whole contract: give every field added since `MIN_LOADABLE` a
 * sensible value. Only bump `MIN_LOADABLE` when a field genuinely *changed meaning* and no
 * default can stand in for it — and say so in the log when you do.
 */
export const SAVE_KEY = 'hackerspace-tycoon-save-v1';
export const SAVE_VERSION = 7;
/** Files older than this cannot be repaired by filling in defaults. */
export const MIN_LOADABLE = 1;

export interface SaveFile {
  version: number;
  savedAt: number;
  /** Everything the store owns, minus its functions. */
  store: Record<string, unknown>;
  sim: {
    day: number;
    time: number;
    yearStart: { day: number; projects: number; reputation: number; upvotes?: number };
    rivalYearStart: [string, { projects: number; reputation: number; upvotes?: number }][];
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
    installedStations: { id: string; type: MachineType; model?: string; label?: string }[];
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

/**
 * Bring an older file up to the current shape. Every branch here is a field that was added
 * after the file was written, and the value it gets is what a fresh run would have had.
 */
function migrate(file: SaveFile): SaveFile {
  const sim = file.sim as Partial<SaveFile['sim']> & Record<string, unknown>;
  const store = file.store as Record<string, unknown>;

  // v2 — the recruitment clock and what the space had just shipped.
  if (typeof sim.recruitClock !== 'number') sim.recruitClock = 0;
  if (sim.recentShip === undefined) sim.recentShip = null;

  // v3 — Reddit.
  if (typeof store.hype !== 'number') store.hype = 0;
  if (!Array.isArray(store.posts)) store.posts = [];

  // v4 — printers carry a model; anything already on the floor is the one you started with.
  sim.installedStations = (sim.installedStations ?? []).map((station) => ({
    ...station,
    model: station.model ?? (station.type === 'fdm' ? 'a1-mini' : undefined),
  }));

  // v5 — the overdraft clock. An old file was never allowed to go under, so it is not under.
  if (store.overdraftSince === undefined) store.overdraftSince = null;
  // v5 — per-project spend. Unknown for older builds, so it reads as nothing spent rather
  // than as a loss that never happened.
  for (const project of sim.projects ?? []) {
    if (typeof (project as { spent?: number }).spent !== 'number') {
      (project as { spent: number }).spent = 0;
    }
  }
  for (const record of (store.shipped as { spent?: number }[] | undefined) ?? []) {
    if (typeof record.spent !== 'number') record.spent = 0;
  }
  // v5 — standing jobs. Nobody held one before, so nobody holds one now.
  for (const member of sim.members ?? []) {
    if ((member as { role?: unknown }).role === undefined) {
      (member as { role: null }).role = null;
    }
  }

  // v6 — the Shop. An older run never had one, so it owns no comforts; mood settles up
  // from wherever it was saved on its own.
  if (!Array.isArray(store.amenities)) store.amenities = [];

  // v7 — comforts can be moved and turned. A file from before that has everybody standing
  // where the room put them, which is exactly what an empty map means.
  if (!store.amenityPlacements || typeof store.amenityPlacements !== 'object') {
    store.amenityPlacements = {};
  }

  file.version = SAVE_VERSION;
  return file;
}

export function readSave(): SaveFile | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const file = JSON.parse(raw) as SaveFile;
    if (typeof file?.version !== 'number' || file.version < MIN_LOADABLE) {
      localStorage.removeItem(SAVE_KEY);
      return null;
    }
    return file.version === SAVE_VERSION ? file : migrate(file);
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
