/** When does each era actually arrive? */
import { Simulation } from '@/systems/Simulation';
import { store, emptyRuntime } from '@/game/store';
import { rng } from '@/utils/rng';
import { FILAMENT, VERB_HOURS } from '@/utils/constants';
import { catalogForEra, canBuild, CATALOG_MAP } from '@/utils/catalog';
import { partsPending } from '@/systems/ProjectSystem';
import { ECONOMY } from '@/utils/economy';
import { DIFFICULTY_MAP, type DifficultyKey } from '@/utils/difficulty';
import { CLAIMS, SUBREDDITS, tasteMatch } from '@/utils/subreddits';
import { merit } from '@/systems/HypeSystem';
import { STAGE_STATION } from '@/machines/layout';

const rows: string[] = [];
const standings: string[] = [];
const firstNight: string[] = [];
const outcomes: string[] = [];
const SEEDS = Number(process.argv[2] ?? 4);
// Difficulty now sets the crew you start with and how fast more arrive, so it has to be
// measurable here rather than assumed to be 'normal'.
const LEVEL = (process.argv[3] ?? 'normal') as DifficultyKey;
for (let seed = 1; seed <= SEEDS; seed += 1) {
  rng.reseed(seed);
  store.setState({ difficulty: LEVEL, cash: DIFFICULTY_MAP[LEVEL].startCash, log: [], era: 1, shippedCount: 0, reputation: 0, ceremony: null, ceremonies: [], bill: null, bills: [], missedBills: 0, gameOver: null,
    ceremony: null,
    ceremonies: [],
    bill: null,
    bills: [],
    missedBills: 0,
    gameOver: null, backlog: [], applicants: [], runtime: emptyRuntime() });
  const sim = new Simulation();
  const arrived: Record<number, number> = {};
  let lastPostDay = 0;
  let night: string | null = null;
  let stuckTicks = 0;
  let lastDay = sim.day;
  while (sim.day <= 220) {
    sim.tick(0.05, 4);
    if (sim.day === lastDay) {
      stuckTicks += 1;
      if (stuckTicks > 5000) {
        console.log(`    STUCK on day ${sim.day}: time=${(sim as any).time} ` +
          `projects=${sim.projects.length} gameOver=${!!store.getState().gameOver} ` +
          `cash=${store.getState().cash}`);
        break;
      }
    } else {
      stuckTicks = 0;
      lastDay = sim.day;
    }
    if (store.getState().bill) store.getState().setBill(null);
    if (store.getState().gameOver) break;
    // Keep the next bill covered — the *net* of it, since dues arrive at the same moment.
    const reserve = Math.max(0, -sim.previewBill().net);
    const spendable = () => store.getState().cash - reserve;
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
    // Signing the lease is a decision now, so an engaged player makes it: take the next one
    // as soon as the name is there and the move is comfortably affordable.
    const lease = sim.nextLease();
    if (lease?.ready && spendable() >= lease.def.moveCost * 1.15) sim.signLease();

    // Only start something there are free hands *and* parts money for. Pitching buys the bill
    // of materials there and then, so an unfunded pitch is cash poured into a project that
    // then sits at assembly — and the cash it burns is the cash that would have hired somebody.
    const funded = (id: string) => spendable() >= CATALOG_MAP[id].bomCost;
    if (sim.player.hoursLeft >= VERB_HOURS.pitch && sim.members.filter((m) => !m.team).length >= 1) {
      const offer = state.backlog[0];
      const pick = (id: string) =>
        sim.members.filter((m) => !m.team).sort((a, b) => b.passionMatch(CATALOG_MAP[id].tags) - a.passionMatch(CATALOG_MAP[id].tags)).slice(0, CATALOG_MAP[id].teamSize).map((m) => m.id);
      // An offer we cannot fund must not block the catalog behind it, or a single expensive
      // offer sitting at the head of the backlog idles the whole space until it expires.
      if (offer && funded(offer.defId)) sim.pitch(offer.defId, offer.id, pick(offer.defId));
      else {
        const def = catalogForEra(state.era).find((d) => canBuild(d, state.ownedMachines) && !sim.projects.some((p) => p.defId === d.id) && funded(d.id));
        if (def) sim.pitch(def.id, undefined, pick(def.id));
      }
    }
    for (const p of sim.projects) {
      if (!p.partsOrdered && spendable() >= p.bomCost) sim.orderParts(p.id);
      if (p.stage === 'fabrication' && p.parts.some((x) => x.status === 'pending')) sim.queueAllPending(p.id);
      if (p.team.length < p.teamSize) {
        const c = sim.members.filter((m) => !m.team && !m.isCoolingOff(p.id)).sort((a, b) => b.passionMatch(p.tags) - a.passionMatch(p.tags))[0];
        if (c) sim.inviteMember(p.id, c.id);
      }
    }
    for (const machine of sim.machines) {
      if (machine.consumableMax > 0 && machine.consumable < FILAMENT.lowWarning) {
        if (spendable() >= sim.refillCost(machine.id)) sim.buyFilament(machine.id);
      }
    }
    // An engaged player buys a printer once one is clearly affordable — the best they can
    // get, since a better printer is simply better and the floor space is the real limit.
    // Only when printing is actually the hold-up. People are the binding constraint (§13),
    // so a player who buys a printer every time they can afford one is measuring their own
    // bad habit rather than the machine — and that is exactly what happened when the
    // warehouse opened up six more slots.
    const waiting = sim.machines.reduce((n, m) => n + m.queue.length, 0);
    if (waiting >= sim.machines.filter((m) => m.type === 'fdm').length * 2) {
      const shop = sim.buyablePrinters().filter((m) => m.era <= store.getState().era);
      const pick = [...shop].sort((a, b) => b.price - a.price).find((m) => spendable() >= m.price * 3);
      if (pick) sim.buyPrinter(pick.id);
    }
    // Take on anybody who is interested and affordable — the roster is the constraint.
    for (const id of [...store.getState().applicants]) {
      // Take the biggest contract that is comfortably affordable.
      const full = sim.canHireFullTime(id);
      // Nobody is paid and every member pays dues, so taking somebody on *improves* the
      // month from here on. All that is left to ask is whether the induction fee is
      // affordable today — hence no wage check, which is the point of the volunteer model.
      if (full && spendable() >= sim.hireCost(id, 'full-time')) {
        sim.hire(id, 'full-time');
      } else if (spendable() >= sim.hireCost(id, 'part-time')) {
        sim.hire(id, 'part-time');
      }
    }
    if (sim.day > lastPostDay && sim.player.hoursLeft >= VERB_HOURS.post + 2) {
      const target = [...sim.projects].filter((p) => !p.shipped).sort((a, b) => merit(b) - merit(a))[0];
      if (target) {
        const room = [...SUBREDDITS].sort(
          (a, b) => tasteMatch(target.tags, b) * b.audience - tasteMatch(target.tags, a) * a.audience,
        )[0];
        const earned = merit(target);
        const claim = ([...CLAIMS].reverse().find((c) => c.ask <= earned) ?? CLAIMS[0]).key;
        if (sim.post(target.id, room.id, claim)) lastPostDay = sim.day;
      }
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
  const over = store.getState().gameOver;
  const bills = store.getState().bills;
  const sum = (pick: (b: (typeof bills)[number]) => number) =>
    bills.length ? Math.round(bills.reduce((n, b) => n + pick(b), 0) / bills.length) : 0;
  const work = sum((b) => b.income.find((l) => l.label === 'Work shipped')?.amount ?? 0);
  const dues = sum((b) => b.income.filter((l) => l.label.endsWith('dues')).reduce((n, l) => n + l.amount, 0));
  const costs = sum((b) => -b.costs.reduce((n, l) => n + l.amount, 0));
  outcomes.push(
    `  seed ${seed}: ${over ? `EVICTED day ${over.day}` : `survived ${sim.day}d`}`.padEnd(34) +
      `staff ${String(sim.members.length).padStart(2)} · bills ${String(bills.length).padStart(2)} · ` +
      `per month: work ${String(work).padStart(6)} + dues ${String(dues).padStart(5)} − costs ${String(costs).padStart(6)} = ${String(work + dues - costs).padStart(6)}`,
  );

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
      `printers ${sim.machines.filter((m) => m.type === 'fdm').map((m) => m.label).join('+') || 'none'}, ` +
      `cash ₺${Math.round(store.getState().cash)}, filament ${Math.round(sim.printer.consumable)}g\n` +
      `           open: ${stuck.join(', ') || 'none'}`,
  );
}
console.log(`\n  ERA PACING (220 days, engaged player, ${LEVEL})\n` + rows.join('\n'));
const wins = firstNight.reduce((n, line) => n + (line.match(/: US/g) ?? []).length, 0);
console.log(
  `\n  FIRST AWARDS NIGHT (October) — you took ${wins} of ${firstNight.length * 4} across ${firstNight.length} runs\n` +
    firstNight.join('\n'),
);
console.log('\n  THE BOOKS\n' + outcomes.join('\n'));
console.log('\n  STANDINGS AT THE END\n' + standings.join('\n') + '\n');
