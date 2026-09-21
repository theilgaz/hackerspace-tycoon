/**
 * Does attention pay for the hour it costs? (§6, and §13's rule that every player verb must
 * move something real.) Two parts: the reaction table, so the claim decision can be seen to
 * have teeth, and an A/B campaign against a player who never posts.
 */
import { Simulation } from '@/systems/Simulation';
import { store, emptyRuntime } from '@/game/store';
import { rng } from '@/utils/rng';
import { FILAMENT, VERB_HOURS, STAGE_ORDER } from '@/utils/constants';
import { catalogForEra, canBuild, CATALOG_MAP } from '@/utils/catalog';
import { partsPending } from '@/systems/ProjectSystem';
import { ECONOMY } from '@/utils/economy';
import { STAGE_STATION } from '@/machines/layout';
import { DIFFICULTY_MAP, type DifficultyKey } from '@/utils/difficulty';
import { CLAIMS, SUBREDDITS, tasteMatch, type ClaimKey } from '@/utils/subreddits';
import { merit, react } from '@/systems/HypeSystem';
import type { ProjectData, StageKey } from '@/game/types';

const LEVEL = (process.argv[3] ?? 'normal') as DifficultyKey;
const SEEDS = Number(process.argv[2] ?? 6);

// ---------------------------------------------------------------- the table
function fakeProject(stage: StageKey, quality: number): ProjectData {
  return { tags: ['electronics', 'iot'], stage, quality, name: 'x' } as unknown as ProjectData;
}

console.log('\n  THE ROOM AND THE CLAIM — upvotes for an electronics build, quality 0.7\n');
console.log(
  '  stage'.padEnd(16) +
    CLAIMS.map((c) => `${c.label} (r/electronics)`.padStart(30)).join('') +
    '   merit',
);
const sub = SUBREDDITS.find((s) => s.id === 'electronics')!;
for (const stage of STAGE_ORDER) {
  const project = fakeProject(stage, 0.7);
  const cells = CLAIMS.map((c) => {
    const r = react(project, sub, c.key, 0);
    return `${r.upvotes}${r.burned ? ' BURNED' : ''}`.padStart(30);
  });
  console.log('  ' + stage.padEnd(14) + cells.join('') + `   ${merit(project).toFixed(2)}`);
}

console.log('\n  THE SAME POST IN EVERY ROOM — an IoT build at assembly, "Nobody has built this"\n');
for (const room of SUBREDDITS) {
  const project = fakeProject('assembly', 0.7);
  const r = react(project, room, 'bold', 0);
  console.log(
    `  ${room.name.padEnd(20)} taste ${tasteMatch(project.tags, room).toFixed(2)} · ` +
      `skepticism ${room.skepticism.toFixed(2)} · ${String(r.upvotes).padStart(6)} upvotes` +
      `${r.burned ? '  BURNED' : ''}  ${r.comment}`,
  );
}

// ------------------------------------------------------------- the campaign
type Style = 'silent' | 'careful' | 'hypeman';

/** The boldest claim the work actually backs, or always-bold for the fool. */
function pickClaim(project: ProjectData, style: Style): ClaimKey {
  if (style === 'hypeman') return 'bold';
  const earned = merit(project);
  const affordable = [...CLAIMS].reverse().find((c) => c.ask <= earned);
  return (affordable?.key ?? 'wip') as ClaimKey;
}

function run(style: Style, seed: number) {
  rng.reseed(seed);
  store.setState({
    difficulty: LEVEL, cash: DIFFICULTY_MAP[LEVEL].startCash, log: [], era: 1, shippedCount: 0,
    reputation: 0, hype: 0, posts: [], ceremony: null, ceremonies: [], bill: null, bills: [],
    missedBills: 0, gameOver: null, backlog: [], applicants: [], upvotes: 0, runtime: emptyRuntime(),
  });
  const sim = new Simulation();
  let posts = 0;
  let burned = 0;
  let lastPostDay = 0;
  while (sim.day <= 180) {
    sim.tick(0.05, 4);
    if (store.getState().bill) store.getState().setBill(null);
    if (store.getState().gameOver) break;
    const reserve = Math.max(0, -sim.previewBill().net);
    const spendable = () => store.getState().cash - reserve;
    const state = store.getState();
    if (state.ceremony) {
      store.getState().setCeremony(null);
      store.setState({ paused: false });
    }
    const funded = (id: string) => spendable() >= CATALOG_MAP[id].bomCost;
    if (sim.player.hoursLeft >= VERB_HOURS.pitch && sim.members.filter((m) => !m.team).length >= 1) {
      const offer = state.backlog[0];
      if (offer && funded(offer.defId)) sim.pitch(offer.defId, offer.id, pick(offer.defId));
      else {
        const def = catalogForEra(state.era).find(
          (d) => canBuild(d, state.ownedMachines) && !sim.projects.some((p) => p.defId === d.id) && funded(d.id),
        );
        if (def) sim.pitch(def.id, undefined, pick(def.id));
      }
    }
    function pick(id: string) {
      return sim.members
        .filter((m) => !m.team)
        .sort((a, b) => b.passionMatch(CATALOG_MAP[id].tags) - a.passionMatch(CATALOG_MAP[id].tags))
        .slice(0, CATALOG_MAP[id].teamSize)
        .map((m) => m.id);
    }
    for (const p of sim.projects) {
      if (!p.partsOrdered && spendable() >= p.bomCost) sim.orderParts(p.id);
      if (p.stage === 'fabrication' && p.parts.some((x) => x.status === 'pending')) sim.queueAllPending(p.id);
      if (p.team.length < p.teamSize) {
        const c = sim.members
          .filter((m) => !m.team && !m.isCoolingOff(p.id))
          .sort((a, b) => b.passionMatch(p.tags) - a.passionMatch(p.tags))[0];
        if (c) sim.inviteMember(p.id, c.id);
      }
    }
    if (sim.printer.consumable < FILAMENT.lowWarning && spendable() >= FILAMENT.spoolCost) sim.buyFilament();
    for (const id of [...store.getState().applicants]) {
      const full = sim.canHireFullTime(id);
      if (full && spendable() >= sim.hireCost(id, 'full-time')) sim.hire(id, 'full-time');
      else if (spendable() >= sim.hireCost(id, 'part-time')) sim.hire(id, 'part-time');
    }

    // Post at most once a day, to the room that cares most about the best build going.
    if (style !== 'silent' && sim.day > lastPostDay && sim.player.hoursLeft >= VERB_HOURS.post + 2) {
      const target = [...sim.projects]
        .filter((p) => !p.shipped)
        .sort((a, b) => merit(b) - merit(a))[0];
      if (target) {
        const room = [...SUBREDDITS].sort(
          (a, b) => tasteMatch(target.tags, b) * b.audience - tasteMatch(target.tags, a) * a.audience,
        )[0];
        const before = store.getState().posts.length;
        if (sim.post(target.id, room.id, pickClaim(target, style))) {
          lastPostDay = sim.day;
          posts += 1;
          const made = store.getState().posts[before];
          if (made?.burned) burned += 1;
        }
      }
    }

    if (sim.player.project) {
      const current = sim.projects.find((p) => p.id === sim.player.project);
      const busy =
        current && current.required[current.stage] > 0 && STAGE_STATION[current.stage] !== null &&
        !(current.stage === 'assembly' && partsPending(current, sim.totalHours));
      if (!busy) sim.stopWork();
    }
    if (!sim.player.project && sim.player.present && sim.player.hoursLeft > 0) {
      const t = sim.projects.find(
        (p) => p.required[p.stage] > 0 && !(p.stage === 'assembly' && partsPending(p, sim.totalHours)),
      );
      if (t) sim.workOn(t.id);
    }
  }
  const st = store.getState();
  return {
    shipped: st.shippedCount, rep: st.reputation, hype: Math.round(st.hype),
    members: sim.members.length, cash: Math.round(st.cash), posts, burned,
    evicted: Boolean(st.gameOver),
  };
}

console.log(`\n  DOES POSTING PAY? — ${SEEDS} seeds, 180 days, ${LEVEL}\n`);
console.log(
  '  style'.padEnd(12) + 'shipped'.padStart(9) + 'reputation'.padStart(12) +
    'hype'.padStart(7) + 'crew'.padStart(6) + 'cash'.padStart(9) +
    'posts'.padStart(7) + 'burned'.padStart(8) + 'evicted'.padStart(9),
);
for (const style of ['silent', 'careful', 'hypeman'] as Style[]) {
  const runs = Array.from({ length: SEEDS }, (_, i) => run(style, i + 1));
  const avg = (pick: (r: ReturnType<typeof run>) => number) =>
    runs.reduce((n, r) => n + pick(r), 0) / runs.length;
  console.log(
    '  ' + style.padEnd(10) + avg((r) => r.shipped).toFixed(1).padStart(9) +
      avg((r) => r.rep).toFixed(0).padStart(12) + avg((r) => r.hype).toFixed(0).padStart(7) +
      avg((r) => r.members).toFixed(1).padStart(6) + avg((r) => r.cash).toFixed(0).padStart(9) +
      avg((r) => r.posts).toFixed(1).padStart(7) + avg((r) => r.burned).toFixed(1).padStart(8) +
      runs.filter((r) => r.evicted).length + '/' + SEEDS,
  );
}
console.log();
