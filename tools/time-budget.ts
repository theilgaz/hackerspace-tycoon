/** Diagnostic: where do a volunteer's hours — and yours — actually go? */
import { Simulation } from '@/systems/Simulation';
import { store, emptyRuntime } from '@/game/store';
import { rng } from '@/utils/rng';
import { FILAMENT, START_CASH, VERB_HOURS } from '@/utils/constants';
import { catalogForEra, canBuild } from '@/utils/catalog';
import { STAGE_STATION } from '@/machines/layout';
import { partsPending } from '@/systems/ProjectSystem';

const DT = 0.05;
const SPEED = 4;
const H = (DT * SPEED) / 2.5;
const DAYS = Number(process.argv[2] ?? 120);

rng.reseed(Number(process.argv[3] ?? 7));
store.setState({ cash: START_CASH, log: [], era: 1, shippedCount: 0, reputation: 0, backlog: [], runtime: emptyRuntime() });
const sim = new Simulation();

const budget: Record<string, number> = {};
const playerBudget: Record<string, number> = {};
const stageHours: Record<string, number> = {};

while (sim.day <= DAYS) {
  sim.tick(DT, SPEED);

  for (const m of sim.members) {
    const key = m.present ? m.activity : 'away';
    budget[key] = (budget[key] ?? 0) + H;
  }
  playerBudget[sim.player.present ? sim.player.activity : 'away'] =
    (playerBudget[sim.player.present ? sim.player.activity : 'away'] ?? 0) + H;
  for (const p of sim.projects) stageHours[p.stage] = (stageHours[p.stage] ?? 0) + H;

  const state = store.getState();
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
    if (project.stage === 'fabrication' && project.parts.some((p) => p.status === 'pending')) {
      sim.queueAllPending(project.id);
    }
  }
  if (sim.printer.consumable < FILAMENT.lowWarning) sim.buyFilament();
  if (!sim.player.task && sim.player.present && sim.player.hoursLeft > 0) {
    const target = sim.projects.find(
      (p) =>
        p.required[p.stage] > 0 &&
        STAGE_STATION[p.stage] !== null &&
        !(p.stage === 'assembly' && partsPending(p, sim.totalHours)),
    );
    if (target) sim.workOn(target.id, target.stage);
  }
}

function report(title: string, data: Record<string, number>) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  const present = total - (data.away ?? 0);
  console.log(`\n  ${title}`);
  for (const [key, value] of Object.entries(data).sort((a, b) => b[1] - a[1])) {
    const share = key === 'away' ? '' : ` (${((value / present) * 100).toFixed(1)}% of present)`;
    console.log(`    ${key.padEnd(13)} ${value.toFixed(0).padStart(6)}h${share}`);
  }
  console.log(`    ${'present'.padEnd(13)} ${present.toFixed(0).padStart(6)}h of ${total.toFixed(0)}h`);
}

console.log(`\n  ${DAYS} days · shipped ${store.getState().shippedCount} · era ${store.getState().era}`);
report('VOLUNTEER HOURS', budget);
report('YOUR HOURS', playerBudget);

console.log('\n  PROJECT-HOURS PER STAGE');
for (const [key, value] of Object.entries(stageHours).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${key.padEnd(13)} ${value.toFixed(0).padStart(6)}h  (${(value / 24).toFixed(1)} days)`);
}
console.log('');
