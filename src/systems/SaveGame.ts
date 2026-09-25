import type { CurrencyKey } from '@/utils/format';
import type { DilemmaMod } from '@/utils/dilemmas';
import { uid, uidPast } from '@/utils/format';
import type {
  MachineType,
  ProjectCategory,
  ProjectData,
  RivalState,
  Tag,
  Skills,
  Training,
} from '@/game/types';
import type { Job } from '@/machines/Machine';
import { CATALOG_MAP } from '@/utils/catalog';
import { CATEGORY_ORDER } from '@/utils/categories';
import { APPLICANTS, ROSTER, rolesFrom } from '@/utils/constants';

/** Where each of the ten old genres went when they became four wings (save v16). */
const OLD_GENRE_WING: Record<string, ProjectCategory> = {
  software: 'software',
  electronics: 'electronics',
  retro: 'electronics',
  iot: 'comms',
  radio: 'comms',
  civic: 'comms',
  mechanical: 'mechanical',
  robotics: 'mechanical',
  tooling: 'mechanical',
  home: 'mechanical',
};
import type { Tile } from '@/utils/grid';

export interface MemberSave {
  id: string;
  skills?: Skills;
  training?: Training | null;
  /** Gone since v11 — everybody is full-time — but still in older files. */
  employment?: string;
  shift?: string | null;
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
  present: boolean;
  tile: Tile;
}

export interface MachineSave {
  id: string;
  type: MachineType;
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
export const SAVE_VERSION = 23;
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
    yearStart: { day: number; projects: number; reputation: number };
    rivalYearStart: [string, { projects: number; reputation: number }][];
    machineHoursThisMonth: number;
    /** Added in v22; older files start the month at nothing. */
    filamentThisMonth?: number;
    /** Dilemmas (v23): when the next card is due, what the last ones left on the space, and who is home. */
    nextDilemmaDay?: number;
    mods?: { mod: DilemmaMod; value: number; until: number }[];
    awayUntil?: [string, number][];
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
    /** Starting kit no longer in the room (v23+). Older files have none, and kept all of it. */
    removedKit?: string[];
    installedStations: {
      id: string;
      type: MachineType;
      model?: string;
      label?: string;
      span?: number;
      furniture?: boolean;
    }[];
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
    /** Older files have none, and were in lira. */
    currency?: CurrencyKey;
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
  // v6 — the Shop. An older run never had one, so it owns no comforts; mood settles up
  // from wherever it was saved on its own.
  if (!Array.isArray(store.amenities)) store.amenities = [];

  // v7 — the room can be rearranged. A file from before that has everything standing where
  // the room put it, which is exactly what an empty map means.
  if (!store.amenityPlacements || typeof store.amenityPlacements !== 'object') {
    store.amenityPlacements = {};
  }
  if (!store.stationPlacements || typeof store.stationPlacements !== 'object') {
    store.stationPlacements = {};
  }

  // v8 — an awards night now records where the whole field stood, which is what a space's
  // own screen charts. An older night cannot be reconstructed from anything in the file, so
  // it keeps no table and the chart simply starts at the first one that has one.
  if (Array.isArray(store.ceremonies)) {
    for (const ceremony of store.ceremonies as { standings?: unknown }[]) {
      if (!Array.isArray(ceremony.standings)) ceremony.standings = [];
    }
  }

  // v9 — projects are designed, planned at a table, and priced by a market (§4d). A build
  // already under way was planned under the old rules, so it counts as kicked off: sending
  // a half-finished drone back to a table it never needed would be the save punishing the
  // player for an update. Its quality becomes craft with no bonus — exactly what it was.
  for (const raw of sim.projects ?? []) {
    const project = raw as ProjectData & Record<string, unknown>;
    if (project.kickedOff === undefined) {
      project.kickedOff = true;
      project.tableId = null;
      project.design = {};
      project.craft = project.quality;
      project.bonus = 0;
      project.appeal = 1;
      project.testRisk = project.simulationSkipped ? 1.9 : 1;
      project.contrib = {};
    }
  }
  if (!store.market || typeof store.market !== 'object') {
    store.market = Object.fromEntries(CATEGORY_ORDER.map((category) => [category, 1]));
  }

  // v10 — applicants are dealt onto the ladder in a shuffled order per run. An older run
  // met them in the catalogue's order, which is what an empty order means.
  if (!Array.isArray(store.ladder)) store.ladder = [];

  // v11 — the month keeps a ledger. What was spent before the update is not known, so the
  // month opens where the balance stands; the first statement lists the gap as "other".
  if (!store.ledger || typeof store.ledger !== 'object') store.ledger = {};
  if (typeof store.monthOpen !== 'number') store.monthOpen = store.cash;


  // v15 — print orders arrive in the Machines panel. An older run has none on offer yet.
  if (!Array.isArray(store.printOffers)) store.printOffers = [];

  // v16 — ten genres became four wings (design §1). A build or a shipped record takes the
  // wing its catalogue entry is in now; anything the catalogue no longer knows falls back
  // on what its old genre became. The market keeps each wing's average of its old genres.
  const wingOf = (category: string, defId?: string): ProjectCategory =>
    (defId ? CATALOG_MAP[defId]?.category : undefined) ?? OLD_GENRE_WING[category] ?? 'mechanical';
  for (const raw of sim.projects ?? []) {
    const project = raw as ProjectData;
    project.category = wingOf(project.category, project.defId);
  }
  for (const record of (store.shipped as { category: string; defId: string }[] | undefined) ?? []) {
    record.category = wingOf(record.category, record.defId);
  }
  // v17 — six skills became four roles (design §3.2), by the same rule the roster uses:
  // Mechanical the best of CAD, machining and welding; Communications from a love of radio
  // or IoT. A course under way in an old skill carries on in the role it belongs to.
  const byId = new Map([...ROSTER, ...APPLICANTS].map((m) => [m.id, m]));
  const OLD_SKILL_ROLE: Record<string, string> = {
    software: 'software', electronics: 'electronics', docs: 'software',
    cad: 'mechanical', machining: 'mechanical', welding: 'mechanical',
  };
  for (const saved of (sim.members ?? []) as { id: string; skills?: Record<string, number>; training?: { skill: string } | null }[]) {
    if (saved.skills && 'cad' in saved.skills) {
      saved.skills = rolesFrom(saved.skills, byId.get(saved.id)?.passions ?? {});
    }
    if (saved.training && OLD_SKILL_ROLE[saved.training.skill]) saved.training.skill = OLD_SKILL_ROLE[saved.training.skill];
  }
  const player = sim.player as { skills?: Record<string, number> } | undefined;
  if (player?.skills && 'cad' in player.skills) player.skills = rolesFrom(player.skills, {});


  // v19 — the standings remember last month, for the Ranking arrows. An older run has no
  // month on record, so the first day after loading takes one and the arrows start there.
  if (!store.rankPrev || typeof store.rankPrev !== 'object') store.rankPrev = {};

  // Builds that never shipped are kept now; an older run has none on record.
  if (!Array.isArray(store.failed)) store.failed = [];

  // v20 — there is one setting now (difficulty.ts). A run started on easy or hard keeps the
  // crew and cash it already has; from here on it recruits and faces rivals like everybody.
  store.difficulty = 'normal';

  const market = store.market as Record<string, number>;
  if (!CATEGORY_ORDER.every((wing) => typeof market[wing] === 'number')) {
    const sums: Record<string, number[]> = {};
    for (const [old, value] of Object.entries(market)) (sums[wingOf(old)] ??= []).push(value);
    store.market = Object.fromEntries(
      CATEGORY_ORDER.map((wing) => [wing, sums[wing]?.length ? sums[wing].reduce((a, b) => a + b, 0) / sums[wing].length : 1]),
    );
  }

  // v21 — traits the player has been told about. An old run has seen none, so each one's
  // first appearance is news, which is exactly what it would have been.
  if (!Array.isArray(store.traitsSeen)) store.traitsSeen = [];

  // v22 — the currency and the founders' names, chosen at the start. An old run was in lira
  // with Safa and Abdullah, which is what an identity without them already reads as.
  const identity = store.identity as { currency?: string } | null | undefined;
  if (identity && !identity.currency) identity.currency = 'TRY';

  // v22 — the simplification pass. Socials, standing jobs, bounties, expediting, licences,
  // wishes and printer upkeep are gone; what an old file kept of them is dropped here, so a
  // loaded run holds only what the game still reads. Nothing is lost that could be played.
  delete store.hype;
  delete store.posts;
  delete store.upvotes;
  delete store.filamentStock;
  delete store.licences;
  // The Filament Shelf went with the stock it held.
  if (Array.isArray(store.amenities)) {
    store.amenities = (store.amenities as string[]).filter((id) => id !== 'filament-shelf');
  }
  const placed = store.amenityPlacements as Record<string, unknown> | undefined;
  if (placed) delete placed['filament-shelf'];
  if (Array.isArray(store.backlog)) {
    store.backlog = (store.backlog as { source?: string }[]).filter((entry) => entry.source !== 'trending');
  }
  // What the month spent on the verbs that went is folded into "other", so it still adds up.
  const ledger = store.ledger as Record<string, number> | undefined;
  if (ledger) {
    for (const gone of ['adSales', 'marketing', 'bounties']) {
      if (ledger[gone]) ledger.other = (ledger.other ?? 0) + ledger[gone];
      delete ledger[gone];
    }
  }

  // v23 — dilemma cards. An older run has had none and has none open; the sim deals the
  // first a fortnight after the load (see `restore`).
  if (!Array.isArray(store.dilemmasSeen)) store.dilemmasSeen = [];
  if (store.dilemma === undefined) store.dilemma = null;

  file.version = SAVE_VERSION;
  return file;
}

/**
 * Saves written before `uidPast` can hold two open builds with one id (see `format.ts`).
 * The later one gets a fresh id, and everything that pointed at it by id follows: the
 * people its own team lists, and the print jobs for its own parts. You stay on the first.
 */
function repairIds(file: SaveFile): SaveFile {
  const seen = new Set<string>();
  for (const project of file.sim.projects ?? []) {
    if (!seen.has(project.id)) {
      seen.add(project.id);
      continue;
    }
    const old = project.id;
    project.id = uid('proj');
    seen.add(project.id);
    const crew = new Set(project.team ?? []);
    for (const m of file.sim.members ?? []) if (m.team === old && crew.has(m.id)) m.team = project.id;
    const parts = new Set((project.parts ?? []).map((part) => part.id));
    for (const machine of file.sim.machines ?? []) {
      for (const job of [machine.current, ...(machine.queue ?? [])]) {
        if (job && job.projectId === old && parts.has(job.partId)) job.projectId = project.id;
      }
    }
  }
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
    uidPast(raw);
    return repairIds(file.version === SAVE_VERSION ? file : migrate(file));
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
