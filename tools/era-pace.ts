/** When does each era actually arrive? */
import { Simulation } from '@/systems/Simulation';
import { store, emptyRuntime } from '@/game/store';
import { rng } from '@/utils/rng';
import { FILAMENT, VERB_HOURS, WORKDAY, isWorkingDay } from '@/utils/constants';
import { catalogForEra, canBuild, CATALOG_MAP } from '@/utils/catalog';
import { partsPending } from '@/systems/ProjectSystem';
import { ECONOMY } from '@/utils/economy';
import { DIFFICULTY_MAP, type DifficultyKey } from '@/utils/difficulty';
import { ROLE_LABEL, type Role, type ScoreRow } from '@/game/types';
import { AWARDS } from '@/utils/rivals';

const ROLES = Object.keys(ROLE_LABEL) as Role[];
import { CLAIMS, SUBREDDITS, tasteMatch } from '@/utils/subreddits';
import { merit } from '@/systems/HypeSystem';
import { AMENITIES } from '@/utils/amenities';
import { STAGE_STATION, STATIONS, GRID, DOOR, IDLE_TILES, isBlocked } from '@/machines/layout';
import { findPath } from '@/utils/grid';
import { furnish } from './furnish';
import { freshMarket } from '@/utils/market';
import { CALENDAR } from '@/utils/format';
import { CAMPAIGNS, campaignGain, campaignRange, campaignSales } from '@/utils/campaigns';
import type { CampaignId } from '@/game/types';

const rows: string[] = [];
const standings: string[] = [];
const firstNight: string[] = [];
const outcomes: string[] = [];
/** Days from pitch to ship of every build, by tier — what a real run takes, not the best case. */
const lengths: Record<string, number[]> = { small: [], medium: [], large: [] };
/** Where a shipped build's hours went, by tier: summed hours per bucket, and how many builds. */
const where: Record<string, { n: number; hours: Record<string, number> }> = {};
const SEEDS = Number(process.argv[2] ?? 4);
/** How long a run is played for. Long enough to reach the first 1 December awards night. */
const DAYS = Number(process.env.DAYS ?? 220);
// Difficulty now sets the crew you start with and how fast more arrive, so it has to be
// measurable here rather than assumed to be 'normal'.
// One setting since the start screen stopped offering three (difficulty.ts).
const LEVEL: DifficultyKey = 'normal';
/** `NO_SHOP=1` plays the same run without buying a single comfort — the A/B that says
 *  whether the shop is worth its money, the way `hype-check` does for posting. */
const SHOPS = process.env.NO_SHOP !== '1';
/**
 * `CAMPAIGN=flyers|social|review|launch|best` advertises every build that ships with that
 * campaign (`best`: whichever would add the most) — the reckless end of the A/B for the ship
 * report's campaigns. `CAMPAIGN=smart` is the careful end: the biggest campaign that cannot
 * lose reputation, whose price net of the sales it brings back is under `SMART_PRICE` a
 * point, and that leaves `SMART_FLOOR` in the bank. Unset, the player never advertises.
 */
const CAMPAIGN_MODE = process.env.CAMPAIGN as CampaignId | 'best' | 'smart' | undefined;
const SMART_PRICE = Number(process.env.SMART_PRICE ?? 25);
const SMART_FLOOR = 40000;
for (let seed = 1; seed <= SEEDS; seed += 1) {
  rng.reseed(seed);
  // Every field, every seed (§13): a leftover ceremony once made three rounds of tuning
  // read a leaderboard of starting values. The duplicate keys this used to carry were the
  // other half of that lesson — legal JavaScript, and the last one silently wins.
  store.setState({
    difficulty: LEVEL,
    cash: DIFFICULTY_MAP[LEVEL].startCash,
    log: [],
    era: 1,
    shippedCount: 0,
    shipped: [],
    failed: [],
    notices: [],
    traitsSeen: [],
    shipReport: null,
    reputation: 0,
    ceremony: null,
    ceremonies: [],
    bill: null,
    bills: [],
    missedBills: 0,
    overdraftSince: null,
    gameOver: null,
    backlog: [],
    applicants: [],
    passed: [],
    upvotes: 0,
    hype: 0,
    posts: [],
    amenities: [],
    amenityPlacements: {},
    moving: null,
    runtime: emptyRuntime(),
    // Rolled after the reseed, or every process starts from a different market (§13).
    market: freshMarket(),
  });
  const sim = new Simulation();
  const arrived: Record<number, number> = {};
  let lastPostDay = 0;
  let furnishedAt = -1;
  let traceDay = 0;
  let night: string | null = null;
  let stuckTicks = 0;
  let lastDay = sim.day;
  // The board as it stood on the morning of the awards, read before the night resets the year.
  let eve: ScoreRow[] = [];
  let eveDay = 0;
  // What each open build is doing, sampled once a sim-hour and banked when it ships.
  const spent = new Map<string, Record<string, number>>();
  let sampledHour = -1;
  const banked = new Set<string>();
  const advertised = new Set<string>();
  const ads = { runs: 0, spent: 0, gain: 0 };
  // Past the first awards night and well into the third year.
  while (sim.day <= DAYS) {
    if (sim.day !== eveDay) {
      eve = sim.scoreboard();
      eveDay = sim.day;
    }
    sim.tick(0.05, 4);
    if (CAMPAIGN_MODE) {
      for (const record of store.getState().shipped) {
        if (record.order || advertised.has(record.id)) continue;
        advertised.add(record.id);
        let id: CampaignId | null;
        if (CAMPAIGN_MODE === 'smart') {
          const worth = CAMPAIGNS.filter((c) => {
            const gain = campaignGain(c.id, record.hype, record.quality);
            const [low] = campaignRange(c.id, record.hype, record.quality);
            const net = c.cost - campaignSales(gain);
            return low > 0 && net <= SMART_PRICE * gain && store.getState().cash - c.cost >= SMART_FLOOR;
          });
          id = worth.length
            ? worth.reduce((a, b) => (campaignGain(b.id, record.hype, record.quality) > campaignGain(a.id, record.hype, record.quality) ? b : a)).id
            : null;
        } else if (CAMPAIGN_MODE === 'best') {
          id = CAMPAIGNS.reduce((a, b) => (campaignGain(b.id, record.hype, record.quality) > campaignGain(a.id, record.hype, record.quality) ? b : a)).id;
        } else id = CAMPAIGN_MODE;
        if (id && sim.launchCampaign(record.id, id)) {
          const ran = store.getState().shipped.find((r) => r.id === record.id)?.campaign;
          ads.runs += 1;
          ads.spent += ran?.cost ?? 0;
          ads.gain += ran?.hype ?? 0;
        }
      }
    }
    if (Math.floor(sim.totalHours) !== sampledHour) {
      sampledHour = Math.floor(sim.totalHours);
      const open = isWorkingDay(sim.day) && sim.time >= WORKDAY.start && sim.time < WORKDAY.end;
      // A build leaves the list when it ships; bank it from the shipped records.
      const live = new Set(sim.projects.map((p) => p.id));
      for (const r of store.getState().shipped) {
        if (banked.has(r.id) || live.has(r.id) || !spent.has(r.id)) continue;
        banked.add(r.id);
        const tier = CATALOG_MAP[r.defId]?.tier ?? 'small';
        where[tier] ??= { n: 0, hours: {} };
        where[tier].n += 1;
        for (const [k, v] of Object.entries(spent.get(r.id)!)) where[tier].hours[k] = (where[tier].hours[k] ?? 0) + v;
        spent.delete(r.id);
      }
      for (const p of sim.projects) {
        if (p.shipped) continue;
        const onIt = p.team.length > 0 || sim.player.project === p.id;
        const bucket =
          p.stage === 'fabrication' ? 'printing'
          : p.stage === 'assembly' && partsPending(p, sim.totalHours) ? 'parts'
          : !open ? 'closed'
          : !onIt ? 'no crew'
          : !p.kickedOff && p.required.concept > 0 ? 'kickoff'
          : [...sim.members, sim.player].some((m) => m.present && m.activity === 'working' && (m.team === p.id || (m === sim.player && sim.player.project === p.id)))
            ? 'hand work'
            : [...sim.members].some((m) => m.team === p.id && m.present) ? 'crew in, not at it' : 'crew away';
        const row = spent.get(p.id) ?? {};
        row[bucket] = (row[bucket] ?? 0) + 1;
        spent.set(p.id, row);
      }
    }
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
    // `TRACE=1` prints the first seed day by day — §13: when a run looks wrong, trace the
    // state rather than tune the numbers.
    if (process.env.TRACE === '1' && seed === Number(process.env.TRACE_SEED ?? 1) && sim.day !== traceDay && sim.day >= Number(process.env.TRACE_FROM ?? 1) && sim.time >= 10.5 && sim.day <= Number(process.env.TRACE_DAYS ?? 40)) {
      traceDay = sim.day;
      if (process.env.TRACE_LAYOUT === '1') {
        console.log('     grid ' + GRID.width + 'x' + GRID.height + ' door ' + JSON.stringify(DOOR) + ' idle ' + JSON.stringify(IDLE_TILES));
        for (const st of STATIONS) {
          const path = findPath(DOOR, st.stand, GRID.width, GRID.height, isBlocked);
          console.log(`     ${st.id} ${st.type} tile ${st.tile.x},${st.tile.y} stand ${st.stand.x},${st.stand.y} span ${st.span ?? 1} path ${path.length} standBlocked ${isBlocked(st.stand)}`);
        }
        const custom = store.getState().stationPlacements;
        console.log('     placements ' + JSON.stringify(custom));
      }
      const doing = [...sim.members, sim.player].map((m) => `${m.name}:${m.present ? m.activity : 'away'}${m.note ? `(${m.note})` : ''}`);
      console.log('     ' + doing.join(' · '));
      const st = store.getState();
      const kick = sim.projects.filter((p) => !p.kickedOff);
      const inB = kick.filter((p) => p.team.length && p.team.every((id) => sim.members.find((m) => m.id === id)?.present === false) === false);
      console.log(
        `  d${sim.day} cash ${Math.round(st.cash)} crew ${sim.members.length} free ${sim.members.filter((m) => !m.team).length}` +
          ` | open ${sim.projects.length} kickoff ${kick.length} (crewed ${kick.filter((p) => p.team.length).length}, tabled ${kick.filter((p) => p.tableId).length})` +
          ` | stages ${Object.entries(sim.projects.reduce<Record<string, number>>((o, p) => ({ ...o, [p.stage]: (o[p.stage] ?? 0) + 1 }), {})).map(([k, v]) => `${k}:${v}`).join(' ')}` +
          ` | needs ${JSON.stringify(sim.workspaceNeeds())} | stations ${STATIONS.map((x) => x.type).join(',')}` +
          ` | ${inB.length}`,
      );
    }
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
        // The three awards the rivals only approximate: is the player on the field's scale?
        (() => {
          const field = eve.filter((r) => !r.isPlayer);
          const me = eve.find((r) => r.isPlayer)!;
          const spread = (pick: (r: ScoreRow) => number) => {
            const v = field.map(pick).sort((x, y) => x - y);
            return `you ${pick(me)} / field ${v[0]}-${v[Math.floor(v.length / 2)]}-${v[v.length - 1]}`;
          };
          return `\n           votes ${spread((r) => r.upvotesThisYear)}  ·  best ${spread((r) => r.bestBuild?.score ?? 0)}` +
            `  ·  rise% ${spread((r) => r.growthThisYear)}` +
            `\n           ships ${spread((r) => r.projectsThisYear)}  ·  space ${spread((r) => r.reputationThisYear)}`;
        })() +
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
    // An engaged player hands out the standing jobs as soon as there is somebody to hand
    // them to — that is what they are for.
    for (const role of ROLES) {
      if (sim.members.some((m) => m.role === role)) continue;
      const free = sim.members.find((m) => !m.role);
      if (free) sim.setRole(free.id, role);
    }

    // Signing the lease is a decision now, so an engaged player makes it: take the next one
    // as soon as the name is there and the move is comfortably affordable.
    const lease = sim.nextLease();
    if (lease?.ready && spendable() >= lease.def.moveCost * 1.15) sim.signLease();

    // The floor is a constraint now (§4d): buy the seat or the table people are queueing
    // for, once an hour at most so a queue that clears next tick is not bought twice.
    if (Math.floor(sim.totalHours) !== furnishedAt) {
      furnishedAt = Math.floor(sim.totalHours);
      furnish(sim, spendable);
    }
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
    // **The new verb, overused on purpose** (§13). An engaged player buys every comfort the
    // lease allows as soon as it is comfortably affordable — which is the worst case for the
    // balance, because the shop has no ceiling and its upkeep lands on the player alone.
    for (const amenity of SHOPS ? AMENITIES.filter((a) => a.group !== 'decor') : []) {
      if (amenity.era > store.getState().era) continue;
      if (store.getState().amenities.includes(amenity.id)) continue;
      if (spendable() >= amenity.price * 2.5) sim.buyAmenity(amenity.id);
    }
    // Take on anybody who is interested and affordable — the roster is the constraint.
    for (const id of [...store.getState().applicants]) {
      // Nobody is paid and every member pays dues, so taking somebody on *improves* the
      // month from here on. All that is left to ask is whether the induction fee is
      // affordable today — hence no wage check, which is the point of the volunteer model.
      if (spendable() >= sim.hireCost(id)) sim.hire(id);
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
  if (CAMPAIGN_MODE) console.log(`  campaigns seed ${seed}: ${ads.runs} run · ₺${ads.spent} spent · ${ads.gain >= 0 ? '+' : ''}${ads.gain} reputation`);
  // Where does an engaged player actually sit at the first awards night?
  const board = sim.scoreboard();
  const me = board.findIndex((r) => r.isPlayer) + 1;
  standings.push(
    `  seed ${seed}: you placed ${me}/${board.length} — ` +
      board
        .map((r) => `${r.isPlayer ? '*' : ''}${r.name} ${r.reputation}r/${r.projects}p/${r.members}m`)
        .join('  ·  '),
  );

  for (const r of store.getState().shipped) lengths[CATALOG_MAP[r.defId]?.tier ?? 'small']?.push(r.days);
  firstNight.push(`  seed ${seed}: ${night ?? 'no ceremony reached'}`);
  const over = store.getState().gameOver;
  const bills = store.getState().bills;
  const sum = (pick: (b: (typeof bills)[number]) => number) =>
    bills.length ? Math.round(bills.reduce((n, b) => n + pick(b), 0) / bills.length) : 0;
  // Bill lines are messages now (§11), so match on the key: an English label would stop
  // matching the moment somebody plays in Turkish, and a filter that matches nothing reads
  // as ₺0 rather than failing.
  const key = (l: (typeof bills)[number]['income'][number]) => (typeof l.label === 'string' ? l.label : l.label.key);
  const work = sum((b) => b.income.find((l) => key(l) === 'bill.work')?.amount ?? 0);
  const dues = sum((b) => b.income.filter((l) => key(l).endsWith('Dues')).reduce((n, l) => n + l.amount, 0));
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
      // What the designing and the crew sizes add up to, and what the floor ended up holding.
      `           quality ${(store.getState().shipped.reduce((n, r) => n + r.quality, 0) / Math.max(1, store.getState().shippedCount)).toFixed(2)} avg · ` +
      `hype/ship ${Math.round(store.getState().shipped.reduce((n, r) => n + r.hype, 0) / Math.max(1, store.getState().shippedCount))} · ` +
      `pay/ship ${Math.round(store.getState().shipped.reduce((n, r) => n + r.payout, 0) / Math.max(1, store.getState().shippedCount))} · ` +
      `floor ${Object.entries(STATIONS.reduce<Record<string, number>>((o, x) => ({ ...o, [x.type]: (o[x.type] ?? 0) + 1 }), {})).map(([k, v]) => `${k}×${v}`).join(' ')}\n` +
      `           open: ${stuck.join(', ') || 'none'}`,
  );
}
console.log(`\n  ERA PACING (${DAYS} days, engaged player, ${LEVEL})\n` + rows.join('\n'));
const wins = firstNight.reduce((n, line) => n + (line.match(/: US/g) ?? []).length, 0);
// Which awards the player takes on the first night, and how many nights they take none —
// the shape to tune the first night by, not only the total.
const perNight = firstNight.map((line) => (line.match(/: US/g) ?? []).length);
const byAward = AWARDS.map((a) => `${a.short} ${firstNight.filter((line) => line.includes(`${a.label}: US`)).length}`).join(' · ');
console.log(
  `\n  FIRST AWARDS NIGHT (day ${CALENDAR.awardsOnDay}) — you took ${wins} of ${firstNight.length * AWARDS.length} across ${firstNight.length} runs\n` +
    `  per night ${perNight.join(' ')} · nights with none ${perNight.filter((n) => n === 0).length} · by award: ${byAward}\n` +
    firstNight.join('\n'),
);
const pct = (a: number[], q: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * q)] : 0);
console.log(
  '\n  BUILD LENGTH IN PLAY (days, pitch to ship)\n' +
    Object.entries(lengths)
      .map(([tier, a]) => `  ${tier.padEnd(7)} ${String(a.length).padStart(4)} ships · median ${pct(a, 0.5).toFixed(1)} · p10 ${pct(a, 0.1).toFixed(1)} · p90 ${pct(a, 0.9).toFixed(1)}`)
      .join('\n'),
);
console.log(
  '\n  WHERE A BUILD\'S DAYS GO (average days per shipped build)\n' +
    Object.entries(where)
      .map(([tier, w]) => `  ${tier.padEnd(7)} ` + Object.entries(w.hours).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / w.n / 24).toFixed(1)}`).join(' · '))
      .join('\n'),
);
console.log('\n  THE BOOKS\n' + outcomes.join('\n'));
console.log('\n  STANDINGS AT THE END\n' + standings.join('\n') + '\n');
