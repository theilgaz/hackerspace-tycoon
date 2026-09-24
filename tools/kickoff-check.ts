/**
 * The kickoff rule, checked (CLAUDE.md §4d):
 *
 *   npm run kickoff-check
 *
 * A crew of four. While one of them is not in the building the meeting must not move at all;
 * once all four are sitting at the table it must; and once it is done every one of them must
 * get up and go to their own work. Each claim is asserted, and the script exits non-zero if
 * any of them fails.
 */
import { Simulation } from '@/systems/Simulation';
import { store, emptyRuntime } from '@/game/store';
import { rng } from '@/utils/rng';
import { freshMarket } from '@/utils/market';
import { DIFFICULTY_MAP } from '@/utils/difficulty';
import { STATION_MAP } from '@/machines/layout';

rng.reseed(3);
store.setState({
  difficulty: 'easy',
  cash: DIFFICULTY_MAP.normal.startCash,
  log: [],
  era: 1,
  backlog: [],
  applicants: [],
  runtime: emptyRuntime(),
  market: freshMarket(),
  started: true,
});
const sim = new Simulation();
const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// Four of them — everybody works the same day now, so only absence can make anybody wait.
const crew = sim.members.slice(0, 4);
for (const m of crew) m.interest = 5;
const plans = (sim as unknown as { plans: Map<string, { attending: boolean; arriveAt: number; leaveAt: number }> }).plans;
sim.pitch('fpv-drone', undefined, [], { design: { cadtool: 0, material: 0, validation: 0 }, seats: 4 });
const project = sim.projects[0];
// Put all four on it directly; the refusal roll is not what is under test.
for (const m of crew) {
  project.team.push(m.id);
  m.team = project.id;
}
const absent = crew[3];
// And you on it too: four crew plus the owner is five at a four-seat table. That used to
// mean no table ever qualified and the kickoff never started (§4d); you are never required,
// so the crew must meet without you.
sim.workOn(project.id);

const step = (hours: number) => {
  for (let i = 0; i < hours * 20; i += 1) {
    // Keep the absentee away however the day was rolled.
    if (keepAway) {
      plans.set(absent.id, { attending: false, arriveAt: 0, leaveAt: 0 });
      if (absent.present) absent.leave();
    }
    sim.tick(0.125, 1);
    if (store.getState().bill) store.getState().setBill(null);
  }
};
let keepAway = true;

// Into the working day, with one of the four kept at home.
while (sim.time < 11) step(0.5);
step(3);
check(
  'no progress while one of four is missing',
  project.progress.concept === 0,
  `progress ${project.progress.concept.toFixed(2)}, missing ${absent.name}`,
);
check(
  'nobody is marked as meeting without the whole crew',
  crew.slice(0, 3).every((m) => m.activity !== 'working'),
  crew.slice(0, 3).map((m) => `${m.name}:${m.activity}`).join(' '),
);

// The fourth comes in.
keepAway = false;
plans.set(absent.id, { attending: true, arriveAt: 9, leaveAt: 18 });
absent.arrive({ x: 0, y: 7 });
const before = project.progress.concept;
step(1.5);
check('the meeting moves once all four are seated, owner on it or not', project.progress.concept > before, `progress ${project.progress.concept.toFixed(2)}`);

// Run it to the end, then watch them leave the table.
let guard = 0;
while (!project.kickedOff && guard < 400) {
  step(0.5);
  guard += 1;
}
check('the kickoff finishes', project.kickedOff, `stage ${project.stage}`);
step(1.5);
const table = STATION_MAP['table-1'];
const stillThere = crew.filter((m) => m.present && m.tile.x === table.stand.x && m.tile.y === table.stand.y && !m.walking);
check(
  'everybody gets up and goes to their own work',
  stillThere.length === 0,
  crew.map((m) => `${m.name}:${m.activity}`).join(' '),
);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n  ${failed ? `${failed}/${results.length} checks failed` : `all ${results.length} checks passed`}\n`);
process.exit(failed ? 1 : 0);
