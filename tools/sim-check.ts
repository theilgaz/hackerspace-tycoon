/**
 * Headless balance run. The Simulation imports neither `three` nor the DOM, so a whole
 * playthrough can be replayed in Node in milliseconds (CLAUDE.md §11).
 *
 *   npm run sim-check -- [runs] [seed]
 *
 * It plays the game with a naive autoplayer: queue parts when they appear, buy filament
 * when low, and post a bounty when a stage stalls with nobody signed up. If a stage can
 * deadlock, or the economy can't sustain a single drone, this run finds it.
 */
import { Simulation } from '@/systems/Simulation';
import { store } from '@/game/store';
import { rng } from '@/utils/rng';
import { FILAMENT, START_CASH } from '@/utils/constants';

const RUNS = Number(process.argv[2] ?? 8);
const SEED = Number(process.argv[3] ?? 1);
const MAX_DAYS = 160;
const DT = 0.05; // real seconds per tick
const SPEED = 4;

interface Result {
  shipped: boolean;
  days: number;
  failedPrints: number;
  quality: number;
  cash: number;
  bounties: number;
  spools: number;
  stalledAt: string | null;
}

/**
 * 'aggressive' = spends everything: a standing bounty on every stage, instant re-queue,
 * constant re-pitching. The ceiling on what player agency is worth.
 * 'attentive'  = watches the queue, re-queues failures, bounties a visible stall.
 * 'hands-off'  = only keeps filament stocked. This is the mode that catches fabrication
 *                soft-locks, which an over-helpful autoplayer hides completely.
 */
type Mode = 'aggressive' | 'attentive' | 'hands-off';

function runOnce(seed: number, mode: Mode): Result {
  rng.reseed(seed);
  store.setState({ cash: START_CASH, log: [], runtime: { members: [], machines: [], project: null } });

  const sim = new Simulation();
  let bounties = 0;
  let spools = 0;
  let stallHours = 0;
  let repitchTimer = 0;
  let lastSignature = '';

  while (sim.day <= MAX_DAYS && !sim.project.shipped) {
    sim.tick(DT, SPEED);

    // --- autoplayer ---------------------------------------------------------
    const project = sim.project;
    const printer = sim.printer;

    if (
      mode !== 'hands-off' &&
      project.parts.some((p) => p.status === 'pending') &&
      project.stage === 'fabrication'
    ) {
      sim.queueAllPending();
    }
    if (printer.consumable < FILAMENT.lowWarning && store.getState().cash >= FILAMENT.spoolCost) {
      if (sim.buyFilament()) spools += 1;
    }

    if (mode === 'aggressive') {
      const stage = project.stage;
      if (!project.bounties.includes(stage) && store.getState().cash >= sim.bountyCost()) {
        if (sim.postBounty()) bounties += 1;
      }
      // Re-pitch at most once a sim-hour when somebody present is on nothing.
      repitchTimer += (DT * SPEED) / 2.5;
      if (repitchTimer >= 1) {
        repitchTimer = 0;
        if (sim.members.some((m) => m.present && !m.signedUp)) sim.repitch();
      }
    }

    // Detect a stage sitting still with nobody on it, and throw money at it.
    const signature = `${project.stage}:${Math.floor(project.progress[project.stage])}:${
      project.parts.filter((p) => p.status === 'done').length
    }`;
    if (signature === lastSignature && mode !== 'hands-off') {
      stallHours += (DT * SPEED) / 2.5;
      if (stallHours > 36) {
        if (!project.bounties.includes(project.stage) && sim.postBounty()) bounties += 1;
        else sim.repitch();
        stallHours = 0;
      }
    } else {
      stallHours = 0;
      lastSignature = signature;
    }
  }

  return {
    shipped: sim.project.shipped,
    days: sim.day,
    failedPrints: sim.project.parts.reduce((sum, p) => sum + p.attempts, 0),
    quality: sim.project.quality,
    cash: store.getState().cash,
    bounties,
    spools,
    stalledAt: sim.project.shipped ? null : sim.project.stage,
  };
}

let failures = 0;

const summary: string[] = [];

for (const mode of ['aggressive', 'attentive', 'hands-off'] as Mode[]) {
  const results: Result[] = [];
  for (let i = 0; i < RUNS; i += 1) results.push(runOnce(SEED + i, mode));

  const shipped = results.filter((r) => r.shipped);
  const avg = (pick: (r: Result) => number) =>
    shipped.length ? shipped.reduce((s, r) => s + pick(r), 0) / shipped.length : NaN;

  console.log(`\n  FPV Drone — ${RUNS} runs, ${mode} player (seed ${SEED})\n`);
  console.log('  run   result              days  failed  quality  bounties  spools   cash');
  console.log('  ' + '-'.repeat(70));
  results.forEach((r, i) => {
    const outcome = r.shipped ? 'shipped' : `STALLED @ ${r.stalledAt}`;
    console.log(
      `  ${String(i + 1).padStart(3)}   ${outcome.padEnd(19)} ${String(r.days).padStart(4)}  ` +
        `${String(r.failedPrints).padStart(6)}  ${(r.quality * 100).toFixed(0).padStart(6)}%  ` +
        `${String(r.bounties).padStart(8)}  ${String(r.spools).padStart(6)}  ${String(Math.round(r.cash)).padStart(5)}`,
    );
  });
  console.log('  ' + '-'.repeat(70));
  summary.push(
    `  ${mode.padEnd(11)} ${shipped.length}/${RUNS} shipped   ` +
      (shipped.length
        ? `${avg((r) => r.days).toFixed(1)} days   ${Math.round(avg((r) => r.cash))} cash left`
        : '—'),
  );
  console.log(
    `  shipped ${shipped.length}/${RUNS}` +
      (shipped.length
        ? `   avg ${avg((r) => r.days).toFixed(1)} days · ${avg((r) => r.failedPrints).toFixed(1)} failed prints · ` +
          `Q${(avg((r) => r.quality) * 100).toFixed(0)}% · ${avg((r) => r.bounties).toFixed(1)} bounties · ` +
          `${Math.round(avg((r) => r.cash))} cash left`
        : ''),
  );
  if (shipped.length < RUNS) failures += RUNS - shipped.length;
}

console.log('  PLAYER AGENCY — what paying attention is worth');
console.log('  ' + '-'.repeat(52));
summary.forEach((line) => console.log(line));
console.log('');

if (failures) {
  console.error(`  ${failures} run(s) failed to ship — the pipeline can stall.\n`);
  process.exit(1);
}
