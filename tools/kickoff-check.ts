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
import { answerDilemma } from './dilemma';
import { store, emptyRuntime } from '@/game/store';
import { rng } from '@/utils/rng';
import { freshMarket } from '@/utils/market';
import { DIFFICULTY_MAP } from '@/utils/difficulty';
import { STATION_MAP } from '@/machines/layout';
import { APPLICANTS } from '@/utils/constants';

rng.reseed(3);
store.setState({
  difficulty: 'normal',
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
// The run opens with two people now; the check needs four, so take two applicants on.
for (const a of APPLICANTS) {
  if (sim.members.length >= 4) break;
  store.setState({ applicants: [a.id] });
  sim.hire(a.id);
}
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
// Somebody taken on today is not on today's rota; the three who are meant to be in are in.
for (const m of crew.slice(0, 3)) plans.set(m.id, { attending: true, arriveAt: 9, leaveAt: 18 });
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
    answerDilemma(sim);
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

// **A big crew kicks off with a quorum** (`KICKOFF.quorum`, five). Six on the crew, a
// Meeting Corner (six chairs) to meet at: two kept home and nothing moves, one kept home and
// the five who are in hold the meeting without them.
store.getState().earn(200000);
sim.player.hoursLeft = 17;
for (const a of APPLICANTS) {
  if (sim.members.filter((m) => !m.team).length >= 6) break;
  if (sim.members.some((m) => m.id === a.id)) continue;
  store.setState({ applicants: [a.id] });
  sim.player.hoursLeft = 17;
  sim.hire(a.id);
}
const bought = sim.buyFurniture('meeting-corner');
const big = sim.members.filter((m) => !m.team).slice(0, 6);
const pitched = sim.pitch('fpv-drone', undefined, [], { design: { cadtool: 0, material: 0, validation: 0 }, seats: 6 });
const six = sim.projects[sim.projects.length - 1];
for (const m of big) {
  m.interest = 5; // drift is not what is under test
  six.team.push(m.id);
  m.team = six.id;
}
check('a crew of six can be pitched once a table seats five', bought && pitched && big.length === 6 && six.teamSize >= 6,
  `bought ${bought}, pitched ${pitched}, crew ${big.length}`);
let home = big.slice(4);
const stepBig = (hours: number) => {
  for (let i = 0; i < hours * 20; i += 1) {
    for (const m of home) {
      plans.set(m.id, { attending: false, arriveAt: 0, leaveAt: 0 });
      if (m.present) m.leave();
    }
    sim.tick(0.125, 1);
    if (store.getState().bill) store.getState().setBill(null);
    answerDilemma(sim);
  }
};
// Into tomorrow's working day with everybody but the two rostered in.
while (sim.time > 8) stepBig(0.5);
for (const m of big.slice(0, 4)) plans.set(m.id, { attending: true, arriveAt: 9, leaveAt: 18 });
while (sim.time < 11) stepBig(0.5);
stepBig(3);
check('four of six at the table is not a meeting', six.progress.concept === 0, `progress ${six.progress.concept.toFixed(2)}`);
home = big.slice(5);
plans.set(big[4].id, { attending: true, arriveAt: 9, leaveAt: 18 });
if (!big[4].present) big[4].arrive({ x: 0, y: 7 });
stepBig(2);
check('five of six is — the kickoff moves without the sixth', six.progress.concept > 0, `progress ${six.progress.concept.toFixed(2)}`);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n  ${failed ? `${failed}/${results.length} checks failed` : `all ${results.length} checks passed`}\n`);
process.exit(failed ? 1 : 0);
