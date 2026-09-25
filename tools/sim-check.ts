/**
 * Headless balance run. The Simulation imports neither `three` nor the DOM, so a whole
 * campaign replays in Node in milliseconds (CLAUDE.md §11).
 *
 *   npm run sim-check -- [runs] [seed] [days]
 *
 * Three player archetypes, all of which do the unavoidable things (pitch something, order
 * the bill of materials) and differ only in how hard they push:
 *
 *  'aggressive' — works every available hour personally, re-queues instantly, fills every
 *                 short crew with whoever is free. The ceiling on what player effort is worth.
 *  'attentive'  — works personally, re-queues failures, steps in on a visible stall.
 *  'hands-off'  — pitches, orders parts, and otherwise lets the space run itself. The
 *                 floor, and the mode that catches soft-locks.
 */
import { Simulation } from '@/systems/Simulation';
import { store, emptyRuntime } from '@/game/store';
import { rng } from '@/utils/rng';
import { START_CASH, STAGE_MAP, VERB_HOURS } from '@/utils/constants';
import { catalogForEra, canBuild, CATALOG_MAP } from '@/utils/catalog';

/** Pick a crew on the pitch screen the way a player would: best passion match first. */
function draftCrew(sim: Simulation, defId: string): string[] {
  const def = CATALOG_MAP[defId];
  return sim.members
    .filter((m) => !m.team)
    .sort((a, b) => b.passionMatch(def.tags) - a.passionMatch(def.tags))
    .slice(0, def.teamSize)
    .map((m) => m.id);
}
import { STAGE_STATION } from '@/machines/layout';
import { partsPending } from '@/systems/ProjectSystem';
import { ECONOMY } from '@/utils/economy';
import { furnish } from './furnish';
import { answerDilemma } from './dilemma';
import { freshMarket } from '@/utils/market';

const RUNS = Number(process.argv[2] ?? 6);
const SEED = Number(process.argv[3] ?? 1);
const MAX_DAYS = Number(process.argv[4] ?? 150);
const DT = 0.05;
const SPEED = 4;
const HOURS_PER_TICK = (DT * SPEED) / 2.5;

type Mode = 'aggressive' | 'attentive' | 'hands-off';

interface Result {
  era: number;
  reputation: number;
  members: number;
  shipped: number;
  firstShipDay: number | null;
  days: number;
  failedPrints: number;
  cash: number;
  invites: number;
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
    ceremony: null,
    ceremonies: [],
    bill: null,
    bills: [],
    missedBills: 0,
    gameOver: null,
    backlog: [],
    applicants: [], dilemma: null, dilemmasSeen: [],
    ownedMachines: ['fdm', 'bench', 'assembly', 'cad-desk', 'lounge'],
    runtime: emptyRuntime(),
    // Rolled after the reseed, or every process starts from a different market (§13).
    market: freshMarket(),
  });

  const sim = new Simulation();
  let invites = 0;
  let failedPrints = 0;
  let firstShipDay: number | null = null;
  let playerHoursWorked = 0;
  let lastSignature = '';
  let stallHours = 0;
  let furnishedAt = -1;

  while (sim.day <= MAX_DAYS) {
    sim.tick(DT, SPEED);
    if (store.getState().bill) store.getState().setBill(null);
    answerDilemma(sim);
    if (store.getState().gameOver) break;
    // Keep the next bill covered — the *net* of it, since dues arrive at the same moment.
    const reserve = Math.max(0, -sim.previewBill().net);
    const spendable = () => store.getState().cash - reserve;
    if (sim.player.activity === 'working' || sim.player.activity === 'babysitting') {
      playerHoursWorked += HOURS_PER_TICK;
    }

    const state = store.getState();
    if (firstShipDay === null && state.shippedCount > 0) firstShipDay = sim.day;

    // The floor is a constraint now (§4d): buy the seat or the table people are queueing
    // for, once an hour at most so a queue that clears next tick is not bought twice.
    if (Math.floor(sim.totalHours) !== furnishedAt) {
      furnishedAt = Math.floor(sim.totalHours);
      furnish(sim, spendable);
    }
    // --- every archetype does the unavoidable ------------------------------
    // Only start something there are actually free hands for.
    if (sim.player.hoursLeft >= VERB_HOURS.pitch && sim.members.filter((m) => !m.team).length >= 1) {
      const offer = state.backlog[0];
      if (offer) sim.pitch(offer.defId, offer.id, draftCrew(sim, offer.defId));
      else {
        const def = catalogForEra(state.era).find(
          (d) => canBuild(d, state.ownedMachines) && !sim.projects.some((p) => p.defId === d.id),
        );
        if (def) sim.pitch(def.id, undefined, draftCrew(sim, def.id));
      }
    }
    for (const project of sim.projects) {
      if (!project.partsOrdered && spendable() >= project.bomCost) sim.orderParts(project.id);
    }
    // Take on anybody who is interested and affordable — the roster is the constraint.
    for (const id of [...store.getState().applicants]) {
      // Nobody is paid and every member pays dues, so taking somebody on *improves* the
      // month from here on. All that is left to ask is whether the induction fee is
      // affordable today — hence no wage check, which is the point of the volunteer model.
      if (spendable() >= sim.hireCost(id)) sim.hire(id);
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
    // Step off a project that has nothing to do by hand — the sim keeps you on it
    // deliberately, but a player watching would move rather than idle for days.
    if (sim.player.project) {
      const current = sim.projects.find((p) => p.id === sim.player.project);
      const busy =
        current &&
        current.required[current.stage] > 0 &&
        STAGE_STATION[current.stage] !== null &&
        !(current.stage === 'assembly' && partsPending(current, sim.totalHours));
      if (!busy) sim.stopWork();
    }
    if (!sim.player.project && sim.player.present && sim.player.hoursLeft > 0) {
      const target = sim.projects.find(
        (p) =>
          p.required[p.stage] > 0 &&
          STAGE_STATION[p.stage] !== null &&
          !(p.stage === 'assembly' && partsPending(p, sim.totalHours)),
      );
      if (target) sim.workOn(target.id);
    }

    if (mode === 'aggressive') {
      // Fill every short crew on a hand stage with whoever is free.
      for (const project of sim.projects) {
        if (STAGE_MAP[project.stage].work <= 0 || project.required[project.stage] <= 0) continue;
        for (const m of sim.members.filter((x) => !x.team && !x.isCoolingOff(project.id))) {
          if (project.team.length >= project.teamSize) break;
          if (sim.inviteMember(project.id, m.id)) invites += 1;
        }
      }
    }

    // Step in on a stage that has visibly stopped moving.
    const signature = sim.projects.map((p) => `${p.id}:${p.stage}:${Math.floor(p.progress[p.stage])}`).join('|');
    if (signature === lastSignature) {
      stallHours += HOURS_PER_TICK;
      if (stallHours > 36) {
        stallHours = 0;
        const stalled = sim.projects.find((p) => p.required[p.stage] > 0);
        if (stalled) sim.workOn(stalled.id);
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
  return {
    era: store.getState().era,
    reputation: store.getState().reputation,
    members: sim.members.length,
    shipped: store.getState().shippedCount,
    firstShipDay,
    days: sim.day,
    failedPrints,
    cash: store.getState().cash,
    invites,
    playerHoursWorked,
    stuck: waiting ? `${waiting.name} waiting on parts` : null,
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
  console.log('  run   shipped  first ship  people  failed   invites  your hours   cash');
  console.log('  ' + '-'.repeat(72));
  results.forEach((r, i) => {
    console.log(
      `  ${String(i + 1).padStart(3)}   ${String(r.shipped).padStart(7)}  ` +
        `${String(r.firstShipDay ?? '—').padStart(10)}  ${String(r.members).padStart(6)}  ` +
        `${String(r.failedPrints).padStart(6)}  ` +
        `${String(r.invites).padStart(8)}  ${r.playerHoursWorked.toFixed(0).padStart(10)}  ` +
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
      `${avg((r) => r.playerHoursWorked).toFixed(0)}h you   era ${avg((r) => r.era).toFixed(1)}   ` +
      `rep ${Math.round(avg((r) => r.reputation))}`,
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
