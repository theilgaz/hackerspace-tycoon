/**
 * How long does each project actually take?
 *
 *   npm run project-times
 *
 * Runs every catalog entry in isolation with a full space: all machines, a full roster, a
 * full team, parts ordered on day one, and a player who works every available hour. That
 * is the *best case* — the floor on a project's length. Targets (CLAUDE.md §4):
 *
 *   small  1-5 days   ·   medium  5-10 days   ·   large  10-30 days
 *
 * Tune `catalog.ts` against this table rather than by guessing.
 */
import { Simulation } from '@/systems/Simulation';
import { store, emptyRuntime } from '@/game/store';
import { rng } from '@/utils/rng';
import { APPLICANTS, FILAMENT, STAGE_MAP, STAGE_ORDER } from '@/utils/constants';
import { CATALOG } from '@/utils/catalog';
import { STAGE_STATION } from '@/machines/layout';
import { partsPending } from '@/systems/ProjectSystem';
import type { MachineType, ProjectDef } from '@/game/types';
import { freshMarket } from '@/utils/market';

const SEEDS = Number(process.argv[2] ?? 5);
const DT = 0.05;
const SPEED = 4;
const MAX_DAYS = 200;

const ALL_MACHINES: MachineType[] = [
  'fdm', 'bench', 'assembly', 'cad-desk', 'lounge', 'cnc', 'reflow', 'drybox',
];

const TARGETS = { small: [1, 5], medium: [5, 10], large: [10, 30] } as const;

function runProject(def: ProjectDef, seed: number): number | null {
  rng.reseed(seed);
  store.setState({
    cash: 500000,
    log: [],
    era: 3,
    shippedCount: 0,
    reputation: 0,
    ceremony: null,
    ceremonies: [],
    bill: null,
    bills: [],
    missedBills: 0,
    gameOver: null,
    backlog: [],
    applicants: [], upvotes: 0,
    ownedMachines: [...ALL_MACHINES],
    runtime: emptyRuntime(),
    // Rolled after the reseed, or every process starts from a different market (§13).
    market: freshMarket(),
  });

  const sim = new Simulation();
  sim.installMachine('cnc');
  // Best case means a furnished room too (§4d): a table that seats the whole crew and a
  // seat for every pair of hands, so what is measured is the work and not the queue.
  sim.buyFurniture('table-large');
  for (let i = 0; i < 6; i += 1) sim.buyFurniture('software-station');
  for (let i = 0; i < 4; i += 1) sim.buyFurniture('hardware-station');
  for (let i = 0; i < 3; i += 1) sim.buyFurniture('assembly-table');
  // Best case means everyone on a full contract.
  for (const data of APPLICANTS) sim.joinMember(data);
  if (!sim.pitch(def.id)) return null;

  const project = sim.projects[0];
  const startDay = sim.day;

  while (sim.day - startDay <= MAX_DAYS) {
    sim.tick(DT, SPEED);
    // Best-case measurement: the books are not what is under test here.
    if (store.getState().bill) store.getState().setBill(null);
    if (!sim.projects.length) return sim.day - startDay;

    if (!project.partsOrdered) sim.orderParts(project.id);
    if (project.stage === 'fabrication' && project.parts.some((p) => p.status === 'pending')) {
      sim.queueAllPending(project.id);
    }
    if (project.team.length < project.teamSize) {
      const candidate = sim.members
        .filter((m) => !m.team && !m.isCoolingOff(project.id))
        .sort((a, b) => b.passionMatch(project.tags) - a.passionMatch(project.tags))[0];
      if (candidate) sim.inviteMember(project.id, candidate.id);
    }
    if (!sim.player.project && sim.player.present && sim.player.hoursLeft > 0) {
      if (
        project.required[project.stage] > 0 &&
        STAGE_STATION[project.stage] !== null &&
        !(project.stage === 'assembly' && partsPending(project, sim.totalHours))
      ) {
        sim.workOn(project.id);
      }
    }
    for (const machine of sim.machines) {
      if (machine.consumableMax > 0 && machine.consumable < FILAMENT.lowWarning) sim.buyFilament();
    }
  }
  return null;
}

const rows = CATALOG.map((def) => {
  const days: number[] = [];
  for (let i = 0; i < SEEDS; i += 1) {
    const result = runProject(def, 1000 + i * 7);
    if (result !== null) days.push(result);
  }
  const tier = def.tier;
  const avg = days.length ? days.reduce((a, b) => a + b, 0) / days.length : NaN;
  const work = STAGE_ORDER.reduce((sum, key) => sum + (def.work[key] ?? STAGE_MAP[key].work), 0);
  const machineHours = def.parts.reduce((sum, p) => sum + p.hours, 0);
  return { def, tier, avg, min: Math.min(...days), max: Math.max(...days), work, machineHours };
});

console.log(`\n  BEST-CASE PROJECT LENGTH — ${SEEDS} seeds, full team, all machines, parts ordered day 1\n`);
console.log('  project                 tier     days (min-max)   target    work  machine  lead   verdict');
console.log('  ' + '-'.repeat(92));

let offTarget = 0;
for (const row of rows.sort((a, b) => a.avg - b.avg)) {
  const [lo, hi] = TARGETS[row.tier];
  const ok = row.avg >= lo && row.avg <= hi;
  if (!ok) offTarget += 1;
  const verdict = Number.isNaN(row.avg) ? 'NEVER SHIPPED' : ok ? 'ok' : row.avg > hi ? 'TOO LONG' : 'too short';
  console.log(
    `  ${row.def.name.padEnd(23)} ${row.tier.padEnd(8)} ` +
      `${row.avg.toFixed(1).padStart(5)} (${String(row.min).padStart(2)}-${String(row.max).padStart(3)})   ` +
      `${`${lo}-${hi}d`.padEnd(8)} ${String(row.work).padStart(5)} ${String(row.machineHours).padStart(7)}h ` +
      `${String(row.def.leadDays).padStart(4)}d   ${verdict}`,
  );
}

console.log('  ' + '-'.repeat(92));
console.log(`  ${rows.length - offTarget}/${rows.length} within their tier's target window\n`);
