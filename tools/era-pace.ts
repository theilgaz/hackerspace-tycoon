/** When does each era actually arrive? */
import { Simulation } from '@/systems/Simulation';
import { store, emptyRuntime } from '@/game/store';
import { rng } from '@/utils/rng';
import { FILAMENT, START_CASH, VERB_HOURS } from '@/utils/constants';
import { catalogForEra, canBuild, CATALOG_MAP } from '@/utils/catalog';
import { partsPending } from '@/systems/ProjectSystem';
import { STAGE_STATION } from '@/machines/layout';

const rows: string[] = [];
const standings: string[] = [];
const firstNight: string[] = [];
const SEEDS = Number(process.argv[2] ?? 4);
for (let seed = 1; seed <= SEEDS; seed += 1) {
  rng.reseed(seed);
  store.setState({ cash: START_CASH, log: [], era: 1, shippedCount: 0, reputation: 0, ceremony: null, ceremonies: [],
    ceremony: null,
    ceremonies: [], backlog: [], applicants: [], runtime: emptyRuntime() });
  const sim = new Simulation();
  const arrived: Record<number, number> = {};
  let night: string | null = null;
  while (sim.day <= 220) {
    sim.tick(0.05, 4);
    const state = store.getState();
    if (!arrived[state.era]) arrived[state.era] = sim.day;
    // The first awards night is the one nearly every player will actually reach.
    if (!night && state.ceremony) {
      const board = sim.scoreboard().sort((a, b) => b.members - a.members);
      night =
        state.ceremony.awards
          .map((a) => `${a.category}: ${a.playerWon ? 'US' : a.winnerName}`)
          .join('  ·  ') +
        `\n           [captured day ${sim.day}, rival rep ${sim.rivals.map((r) => r.reputation).join('/')}]` +
        `\n           crews: ` +
        board
          .slice(0, 4)
          .map((r) => `${r.isPlayer ? '*' : ''}${r.name} ${r.members}`)
          .join(', ') +
        `  |  cash: ` +
        [...board]
          .sort((a, b) => b.cash - a.cash)
          .slice(0, 3)
          .map((r) => `${r.isPlayer ? '*' : ''}${r.name} ${Math.round(r.cash / 1000)}k`)
          .join(', ');
      store.getState().setCeremony(null);
      store.setState({ paused: false });
    }
    // Only start something there are actually free hands for.
    if (sim.player.hoursLeft >= VERB_HOURS.pitch && sim.members.filter((m) => !m.team).length >= 1) {
      const offer = state.backlog[0];
      const pick = (id: string) =>
        sim.members.filter((m) => !m.team).sort((a, b) => b.passionMatch(CATALOG_MAP[id].tags) - a.passionMatch(CATALOG_MAP[id].tags)).slice(0, CATALOG_MAP[id].teamSize).map((m) => m.id);
      if (offer) sim.pitch(offer.defId, offer.id, pick(offer.defId));
      else {
        const def = catalogForEra(state.era).find((d) => canBuild(d, state.ownedMachines) && !sim.projects.some((p) => p.defId === d.id));
        if (def) sim.pitch(def.id, undefined, pick(def.id));
      }
    }
    for (const p of sim.projects) {
      if (!p.partsOrdered && store.getState().cash >= p.bomCost) sim.orderParts(p.id);
      if (p.stage === 'fabrication' && p.parts.some((x) => x.status === 'pending')) sim.queueAllPending(p.id);
      if (p.team.length < p.teamSize) {
        const c = sim.members.filter((m) => !m.team && !m.isCoolingOff(p.id)).sort((a, b) => b.passionMatch(p.tags) - a.passionMatch(p.tags))[0];
        if (c) sim.inviteMember(p.id, c.id);
      }
    }
    if (sim.printer.consumable < FILAMENT.lowWarning) sim.buyFilament();
    // Take on anybody who is interested and affordable — the roster is the constraint.
    for (const id of [...store.getState().applicants]) {
      // Take the biggest contract that is comfortably affordable.
      const full = sim.canHireFullTime(id);
      if (full && store.getState().cash >= sim.hireCost(id, 'full-time') * 3) sim.hire(id, 'full-time');
      else if (store.getState().cash >= sim.hireCost(id, 'part-time') * 3) sim.hire(id, 'part-time');
    }
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
      const t = sim.projects.find((p) => p.required[p.stage] > 0 && !(p.stage === 'assembly' && partsPending(p, sim.totalHours)));
      if (t) sim.workOn(t.id);
    }
  }
  // Where does an engaged player actually sit at the first awards night?
  const board = sim.scoreboard();
  const me = board.findIndex((r) => r.isPlayer) + 1;
  standings.push(
    `  seed ${seed}: you placed ${me}/${board.length} — ` +
      board
        .map((r) => `${r.isPlayer ? '*' : ''}${r.name} ${r.reputation}r/${r.projects}p/${r.members}m`)
        .join('  ·  '),
  );

  firstNight.push(`  seed ${seed}: ${night ?? 'no ceremony reached'}`);

  const stuck = sim.projects.map((p) => {
    const why =
      p.stage === 'assembly' && partsPending(p, sim.totalHours)
        ? p.partsOrdered
          ? 'parts in transit'
          : `UNORDERED (₺${p.bomCost}, cash ₺${Math.round(store.getState().cash)})`
        : p.team.length === 0
          ? 'no crew'
          : p.stage;
    return `${p.name}[${why}]`;
  });
  rows.push(
    `  seed ${seed}: era2 day ${arrived[2] ?? '—'}, era3 day ${arrived[3] ?? '—'}, ` +
      `shipped ${store.getState().shippedCount}, rep ${store.getState().reputation}, ` +
      `cash ₺${Math.round(store.getState().cash)}, filament ${Math.round(sim.printer.consumable)}g\n` +
      `           open: ${stuck.join(', ') || 'none'}`,
  );
}
console.log('\n  ERA PACING (220 days, engaged player)\n' + rows.join('\n'));
const wins = firstNight.reduce((n, line) => n + (line.match(/: US/g) ?? []).length, 0);
console.log(
  `\n  FIRST AWARDS NIGHT (day 90) — you took ${wins} of ${firstNight.length * 4} across ${firstNight.length} runs\n` +
    firstNight.join('\n'),
);
console.log('\n  STANDINGS AT THE END\n' + standings.join('\n') + '\n');
