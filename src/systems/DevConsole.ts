import { DILEMMAS } from '@/utils/dilemmas';
import { store } from '@/game/store';
import type { Simulation } from './Simulation';
import { AMENITIES, amenityDef } from '@/utils/amenities';
import { PRINTERS } from '@/utils/printers';
import { eraDef } from '@/utils/constants';
import { money } from '@/utils/format';
import type { MachineType } from '@/game/types';
import { getLocale, isLocale, LOCALES } from '@/i18n';
import { applyLocale } from '@/i18n/preference';

/**
 * The developer console (CLAUDE.md §15). A line of text in, a few lines of text out.
 *
 * It exists because **the interesting states are the late ones** and reaching them honestly
 * takes an hour of play: a full warehouse, a project one stage from shipping, an awards
 * night. Testing a panel that only appears in Era 3 should not mean playing to Era 3.
 *
 * Two rules keep it from becoming a liability:
 *
 * - **It only ever calls public API** — `sim.dev.*` and the store's own actions. It is not
 *   a back door into the sim's internals, so it cannot get the game into a state the game
 *   could not get itself into, and it cannot rot silently when the sim is refactored.
 * - **Every command that changes something writes to the log**, in the player's own log,
 *   marked. A run you doctored should say so; finding out later that a measurement came
 *   from a cheated save is worse than not having the console at all.
 */
export interface DevResult {
  lines: string[];
  /** True when the command changed the game, so the caller knows to re-render. */
  changed: boolean;
}

interface Command {
  name: string;
  args: string;
  help: string;
  /** Easter eggs: they work, they log like anything else, and `help` keeps quiet about them. */
  hidden?: boolean;
  run: (sim: Simulation, args: string[]) => string[] | string;
}

/** `500`, `+500`, `-500` — absolute unless it carries a sign. */
function amount(current: number, raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(/[_,]/g, ''));
  if (!Number.isFinite(value)) return null;
  return /^[+-]/.test(raw.trim()) ? current + value : value;
}

/** Match a project by id, by a word from its name, or by "all". */
function projectsMatching(sim: Simulation, term: string | undefined) {
  const open = sim.projects.filter((p) => !p.shipped);
  if (!term || term === 'all') return open;
  const needle = term.toLowerCase();
  return open.filter((p) => p.id === term || p.name.toLowerCase().includes(needle));
}

const COMMANDS: Command[] = [
  {
    name: 'help',
    args: '',
    help: 'this list',
    run: () => COMMANDS.filter((c) => !c.hidden).map((c) => `  ${c.name}${c.args ? ' ' + c.args : ''} — ${c.help}`),
  },
  {
    // Say it three times and the fridge turns up.
    name: 'matematemate',
    args: '',
    help: 'a Club-Mate fridge, on the house',
    hidden: true,
    run: (sim) => {
      if (store.getState().amenities.includes('mate-fridge')) return 'the Mate fridge is already humming';
      store.getState().buyAmenity('mate-fridge');
      sim.publish();
      return 'a Club-Mate fridge appears. Nobody saw who brought it.';
    },
  },
  {
    name: 'moneymoneymoney',
    args: '',
    help: '₺50,000 on top of what is there',
    hidden: true,
    run: () => {
      const next = Math.round(store.getState().cash + 50000);
      store.setState({ cash: next });
      return `+${money(50000)} — cash → ${money(next)}`;
    },
  },
  {
    name: 'cash',
    args: '<n|+n|-n>',
    help: 'set or move the balance',
    run: (_sim, [raw]) => {
      const next = amount(store.getState().cash, raw);
      if (next === null) return `cash is ${money(store.getState().cash)}`;
      store.setState({ cash: Math.round(next) });
      return `cash → ${money(Math.round(next))}`;
    },
  },
  {
    name: 'rep',
    args: '<n|+n>',
    help: 'set or move reputation (this is what gates the eras)',
    run: (_sim, [raw]) => {
      const next = amount(store.getState().reputation, raw);
      if (next === null) return `reputation is ${Math.round(store.getState().reputation)}`;
      store.setState({ reputation: Math.max(0, Math.round(next)) });
      return `reputation → ${Math.max(0, Math.round(next))}`;
    },
  },
  {
    name: 'dilemma',
    args: '[id]',
    help: `deal a dilemma card now: ${DILEMMAS.map((d) => d.id).join(', ')}`,
    run: (sim, [id]) => (sim.forceDilemma(id) ? `dilemma → ${store.getState().dilemma?.id}` : 'no card: one is open, or that id does not exist'),
  },
  {
    name: 'skip',
    args: '<days>',
    help: 'run the clock forward — bills land and awards are held on the way',
    run: (sim, [raw]) => {
      const days = Number(raw ?? 1);
      if (!Number.isFinite(days) || days <= 0) return 'skip <days>';
      const from = sim.day;
      sim.dev.advance(days);
      return `day ${from} → ${sim.day}`;
    },
  },
  {
    name: 'era',
    args: '<1-3>',
    help: 'move house for free; the floor grows and the walls repaint',
    run: (sim, [raw]) => {
      const era = Number(raw);
      if (!Number.isFinite(era)) return `you are in ${eraDef(store.getState().era).name}`;
      sim.dev.setEra(era);
      return `moved to ${eraDef(store.getState().era).name}`;
    },
  },
  {
    name: 'stage',
    args: '[project|all]',
    help: 'finish the stage a project is on and let it advance',
    run: (sim, [term]) => {
      const targets = projectsMatching(sim, term);
      if (!targets.length) return 'nothing open matches that';
      return targets.map((p) => {
        const was = p.stage;
        sim.dev.complete(p.id, false);
        return `  ${p.name}: ${was} → ${p.shipped ? 'shipped' : p.stage}`;
      });
    },
  },
  {
    name: 'ship',
    args: '[project|all]',
    help: 'run a project all the way out of the door',
    run: (sim, [term]) => {
      const targets = projectsMatching(sim, term);
      if (!targets.length) return 'nothing open matches that';
      return targets.map((p) => {
        sim.dev.complete(p.id, true);
        return `  ${p.name}: ${p.shipped ? 'shipped' : `stuck at ${p.stage}`}`;
      });
    },
  },
  {
    name: 'shop',
    args: '[id|all]',
    help: 'install a comfort for free — "shop" on its own lists them',
    run: (sim, [id]) => {
      const state = store.getState();
      if (!id) {
        return AMENITIES.map(
          (a) => `  ${a.id.padEnd(10)} era ${a.era}  ${state.amenities.includes(a.id) ? '· in' : ''}`,
        );
      }
      const wanted = id === 'all' ? AMENITIES.map((a) => a.id) : [id];
      const done: string[] = [];
      for (const one of wanted) {
        const def = amenityDef(one);
        if (!def) continue;
        if (store.getState().amenities.includes(one)) continue;
        store.getState().buyAmenity(one);
        done.push(def.name);
      }
      sim.publish();
      return done.length ? `installed ${done.join(', ')}` : 'nothing to install';
    },
  },
  {
    name: 'printer',
    args: '[model]',
    help: 'drop a printer on the floor for free',
    run: (sim, [model]) => {
      if (!model) return PRINTERS.map((m) => `  ${m.id.padEnd(9)} era ${m.era}  ${money(m.price)}`);
      const def = PRINTERS.find((m) => m.id === model);
      if (!def) return `no printer called "${model}"`;
      const before = store.getState().cash;
      store.setState({ cash: before + def.price });
      const ok = sim.buyPrinter(def.id);
      if (!ok) store.setState({ cash: before });
      return ok ? `${def.name} installed` : 'no room on the wall for it';
    },
  },
  {
    name: 'people',
    args: '[n]',
    help: 'take on the next n applicants, free',
    run: (sim, [raw]) => {
      const want = Math.max(1, Number(raw ?? 1) || 1);
      const taken: string[] = [];
      for (const id of [...store.getState().applicants].slice(0, want)) {
        const before = store.getState().cash;
        store.setState({ cash: before + sim.hireCost(id) });
        if (sim.hire(id)) taken.push(id);
        else store.setState({ cash: before });
      }
      sim.publish();
      return taken.length ? `hired ${taken.length}` : 'nobody is waiting — try "skip 10"';
    },
  },
  {
    name: 'lang',
    args: '<en|tr|xx>',
    help: 'switch language; xx brackets every translated string, so bare ones stand out',
    run: (_sim, [raw]) => {
      if (!raw) return `language is ${getLocale()} (${LOCALES.join(' / ')})`;
      if (!isLocale(raw)) return `? ${raw} — one of ${LOCALES.join(', ')}`;
      applyLocale(raw);
      return `language → ${raw}`;
    },
  },
  {
    name: 'unlock',
    args: '',
    help: 'own every machine type, so the whole catalogue is pitchable',
    run: (sim) => {
      const every: MachineType[] = ['fdm', 'bench', 'assembly', 'cad-desk', 'lounge', 'cnc', 'reflow', 'drybox'];
      for (const type of every) store.getState().ownMachine(type);
      sim.publish();
      return 'every machine type marked as owned';
    },
  },
];

export function runDevCommand(sim: Simulation, line: string): DevResult {
  const [name, ...args] = line.trim().split(/\s+/);
  if (!name) return { lines: [], changed: false };
  const command = COMMANDS.find((c) => c.name === name.toLowerCase());
  if (!command) {
    return { lines: [`? ${name} — try "help"`], changed: false };
  }
  const out = command.run(sim, args);
  const lines = Array.isArray(out) ? out : [out];
  // Neither reading the help nor switching language doctors the run.
  const changed = command.name !== 'help' && command.name !== 'lang';
  if (changed) {
    // In the player's own log, marked. A doctored run has to say it was doctored.
    store.getState().pushLog(`dev: ${line.trim()}`, 'warn');
    sim.publish();
  }
  return { lines, changed };
}

export const DEV_COMMAND_NAMES = COMMANDS.map((c) => c.name);
