/** Diagnostic: where does a volunteer's day actually go? */
import { Simulation } from '@/systems/Simulation';
import { store } from '@/game/store';
import { rng } from '@/utils/rng';
import { FILAMENT, START_CASH } from '@/utils/constants';

const DT = 0.05;
const SPEED = 4;
const H = (DT * SPEED) / 2.5; // sim-hours per tick

rng.reseed(7);
store.setState({ cash: START_CASH, log: [] });
const sim = new Simulation();

const budget: Record<string, number> = {};
const stageHours: Record<string, number> = {};
let dayHours = 0;

while (sim.day <= 160 && !sim.project.shipped) {
  sim.tick(DT, SPEED);
  dayHours += H;
  stageHours[sim.project.stage] = (stageHours[sim.project.stage] ?? 0) + H;
  for (const m of sim.members) {
    const key = m.present ? m.activity : 'away';
    budget[key] = (budget[key] ?? 0) + H;
  }
  if (sim.project.parts.some((p) => p.status === 'pending') && sim.project.stage === 'fabrication') {
    sim.queueAllPending();
  }
  if (sim.printer.consumable < FILAMENT.lowWarning) sim.buyFilament();
}

const totalPerson = Object.values(budget).reduce((a, b) => a + b, 0);
const present = totalPerson - (budget.away ?? 0);

console.log(`\n  shipped=${sim.project.shipped} days=${sim.day}  elapsed=${dayHours.toFixed(0)} sim-hours\n`);
console.log('  PERSON-HOURS');
for (const [key, value] of Object.entries(budget).sort((a, b) => b[1] - a[1])) {
  const ofPresent = key === 'away' ? '' : ` (${((value / present) * 100).toFixed(1)}% of present)`;
  console.log(`    ${key.padEnd(13)} ${value.toFixed(0).padStart(6)}h${ofPresent}`);
}
console.log(`\n    present total ${present.toFixed(0)}h of ${totalPerson.toFixed(0)}h roster-hours`);

console.log('\n  ELAPSED PER STAGE');
for (const [key, value] of Object.entries(stageHours).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${key.padEnd(13)} ${value.toFixed(0).padStart(6)}h  (${(value / 24).toFixed(1)} days)`);
}
console.log('');
