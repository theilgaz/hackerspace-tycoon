/**
 * Headless balance run. The Simulation imports neither `three` nor the DOM, so a whole
 * campaign replays in Node in milliseconds (CLAUDE.md §11).
 *
 *   npm run sim-check -- [runs] [seed] [days]
 *
 * Three player archetypes, all of which do the unavoidable things (pitch something, order
 * the bill of materials, keep filament in stock) and differ only in how hard they push:
 *
 *  'aggressive' — works every available hour personally, bounties every stage, expedites,
 *                 re-queues instantly. The ceiling on what player effort is worth.
 *  'attentive'  — works personally, re-queues failures, bounties a visible stall.
 *  'hands-off'  — pitches, orders parts, buys filament, and otherwise lets the space run
 *                 itself. The floor, and the mode that catches soft-locks.
 */
import { Simulation } from '@/systems/Simulation';
import { store, emptyRuntime } from '@/game/store';
import { rng } from '@/utils/rng';
import { FILAMENT, START_CASH, STAGE_MAP, VERB_HOURS } from '@/utils/constants';
import { catalogForEra, canBuild } from '@/utils/catalog';
import { STAGE_STATION } from '@/machines/layout';
import { partsPending } from '@/systems/ProjectSystem';

const RUNS = Number(process.argv[2] ?? 6);
const SEED = Number(process.argv[3] ?? 1);
const MAX_DAYS = Number(process.argv[4] ?? 150);
const DT = 0.05;
const SPEED = 4;
const HOURS_PER_TICK = (DT * SPEED) / 2.5;

type Mode = 'aggressive' | 'attentive' | 'hands-off';

interface Result {
  members: number;
  shipped: number;
  firstShipDay: number | null;
  days: number;
  failedPrints: number;
  cash: number;
  bounties: number;
  playerHoursWorked: number;
  stuck: string | null;
}

function runOnce(seed: number, mode: Mode): Result {
  rng.reseed(seed);
  store.setState({
    cash: START_CASH,
    log: [],
    era: 1,
    shippedCount: 0,
    reputation: 0,
    backlog: [],
    ownedMachines: ['fdm', 'bench', 'assembly', 'cad-desk', 'lounge'],
    runtime: emptyRuntime(),
  });

  const sim = new Simulation();
  let bounties = 0;
  let failedPrints = 0;
  let firstShipDay: number | null = null;
  let playerHoursWorked = 0;
  let lastSignature = '';
  let stallHours = 0;

  while (sim.day <= MAX_DAYS) {
    sim.tick(DT, SPEED);
    if (sim.player.activity === 'working' || sim.player.activity === 'babysitting') {
      playerHoursWorked += HOURS_PER_TICK;
    }

    const state = store.getState();
    if (firstShipDay === null && state.shippedCount > 0) firstShipDay = sim.day;

    // --- every archetype does the unavoidable ------------------------------
    if (sim.slotsUsed < sim.slotsTotal && sim.player.hoursLeft >= VERB_HOURS.pitch) {
      const offer = state.backlog[0];
      if (offer) sim.pitch(offer.defId, offer.id);
      else {
        const def = catalogForEra(state.era).find(
          (d) => canBuild(d, state.ownedMachines) && !sim.projects.some((p) => p.defId === d.id),
        );
        if (def) sim.pitch(def.id);
      }
    }
    for (const project of sim.projects) {
      if (!project.partsOrdered && store.getState().cash >= project.bomCost) sim.orderParts(project.id);
    }
    const printer = sim.printer;
    if (printer.consumable < FILAMENT.lowWarning && store.getState().cash >= FILAMENT.spoolCost) {
      sim.buyFilament();
    }

    if (mode === 'hands-off') continue;

    // Allocate people: ask the best-matching unallocated member to join.
    for (const project of sim.projects) {
      if (project.team.length >= project.teamSize) continue;
      const candidates = sim.members
        .filter((m) => !m.team && !m.isCoolingOff(project.id))
        .sort((a, b) => b.passionMatch(project.tags) - a.passionMatch(project.tags));
      if (candidates.length) sim.inviteMember(project.id, candidates[0].id);
    }

    // --- the rest is optional effort ---------------------------------------
    for (const project of sim.projects) {
      if (project.stage === 'fabrication' && project.parts.some((p) => p.status === 'pending')) {
        sim.queueAllPending(project.id);
      }
    }

    // Put yourself on whatever hand-work is open.
    if (!sim.player.task && sim.player.present && sim.player.hoursLeft > 0) {
      const target = sim.projects.find(
        (p) =>
          p.required[p.stage] > 0 &&
          STAGE_STATION[p.stage] !== null &&
          !(p.stage === 'assembly' && partsPending(p, sim.totalHours)),
      );
      if (target) sim.workOn(target.id, target.stage);
    }

    if (mode === 'aggressive') {
      for (const project of sim.projects) {
        if (
          STAGE_MAP[project.stage].work > 0 &&
          project.required[project.stage] > 0 &&
          !project.bounties.includes(project.stage) &&
          store.getState().cash >= sim.bountyCost(project.id) &&
          sim.player.hoursLeft >= VERB_HOURS.bounty
        ) {
          if (sim.postBounty(project.id)) bounties += 1;
        }
        if (project.stage === 'assembly' && partsPending(project, sim.totalHours)) {
          sim.expediteParts(project.id);
        }
      }
    }

    // Throw money at a stage that has visibly stopped moving.
    const signature = sim.projects.map((p) => `${p.id}:${p.stage}:${Math.floor(p.progress[p.stage])}`).join('|');
    if (signature === lastSignature) {
      stallHours += HOURS_PER_TICK;
      if (stallHours > 36) {
        stallHours = 0;
        const stalled = sim.projects.find((p) => p.required[p.stage] > 0);
        if (stalled) {
          if (!stalled.bounties.includes(stalled.stage) && sim.postBounty(stalled.id)) bounties += 1;
          else sim.repitch(stalled.id);
        }
      }
    } else {
      stallHours = 0;
      lastSignature = signature;
    }
  }

  for (const project of sim.projects) {
    failedPrints += project.parts.reduce((sum, p) => sum + p.attempts, 0);
  }

  const waiting = sim.projects.find((p) => p.stage === 'assembly' && partsPending(p, sim.totalHours));
  const starved = sim.printer.starved && store.getState().cash < FILAMENT.spoolCost;
  const stuck = starved ? 'broke, no filament' : waiting ? `${waiting.name} waiting on parts` : null;
  return {
    members: sim.members.length,
    shipped: store.getState().shippedCount,
    firstShipDay,
    days: sim.day,
    failedPrints,
    cash: store.getState().cash,
    bounties,
    playerHoursWorked,
    stuck: stuck ? `${stuck.name} waiting on parts` : null,
  };
}

const summary: string[] = [];
let problems = 0;

for (const mode of ['aggressive', 'attentive', 'hands-off'] as Mode[]) {
  const results: Result[] = [];
  for (let i = 0; i < RUNS; i += 1) results.push(runOnce(SEED + i, mode));

  const avg = (pick: (r: Result) => number) => results.reduce((s, r) => s + pick(r), 0) / results.length;
  const firstShips = results.filter((r) => r.firstShipDay !== null);

  console.log(`\n  ${MAX_DAYS} days — ${RUNS} runs, ${mode} player (seed ${SEED})\n`);
  console.log('  run   shipped  first ship  people  failed  bounties  your hours   cash');
  console.log('  ' + '-'.repeat(72));
  results.forEach((r, i) => {
    console.log(
      `  ${String(i + 1).padStart(3)}   ${String(r.shipped).padStart(7)}  ` +
        `${String(r.firstShipDay ?? '—').padStart(10)}  ${String(r.members).padStart(6)}  ` +
        `${String(r.failedPrints).padStart(6)}  ` +
        `${String(r.bounties).padStart(8)}  ${r.playerHoursWorked.toFixed(0).padStart(10)}  ` +
        `${String(Math.round(r.cash)).padStart(5)}`,
    );
  });
  console.log('  ' + '-'.repeat(72));
  console.log(
    `  avg ${avg((r) => r.shipped).toFixed(1)} shipped · ${avg((r) => r.members).toFixed(1)} people · first ship day ` +
      `${firstShips.length ? (firstShips.reduce((s, r) => s + r.firstShipDay!, 0) / firstShips.length).toFixed(1) : '—'} · ` +
      `${avg((r) => r.playerHoursWorked).toFixed(0)}h of your time · ${Math.round(avg((r) => r.cash))} cash`,
  );

  summary.push(
    `  ${mode.padEnd(11)} ${avg((r) => r.shipped).toFixed(1)} shipped   first ship ` +
      `${firstShips.length ? (firstShips.reduce((s, r) => s + r.firstShipDay!, 0) / firstShips.length).toFixed(1) : '—'}   ` +
      `${avg((r) => r.playerHoursWorked).toFixed(0)}h you   ${avg((r) => r.members).toFixed(1)} people`,
  );
  if (!firstShips.length) problems += 1;
}

console.log('\n  PLAYER AGENCY — what your hours are worth');
console.log('  ' + '-'.repeat(56));
summary.forEach((line) => console.log(line));
console.log('');

if (problems) {
  console.error(`  ${problems} archetype(s) never shipped anything — the pipeline can stall.\n`);
  process.exit(1);
}
