import { createStore } from 'zustand/vanilla';
import type { BacklogEntry, LogEntry, MachineType, RuntimeSnapshot } from './types';
import { START_CASH, eraDef } from '@/utils/constants';
import { uid } from '@/utils/format';

const MAX_LOG = 140;

/**
 * Management data lives here; sim-time data lives in the Simulation and arrives via
 * `runtime` snapshots at 5 Hz. The UI reads this store and nothing else (CLAUDE.md §11).
 */
export interface GameState {
  /** Day 1, 2, 3 ... */
  day: number;
  /** Hour within the day, 0-24. */
  simTime: number;
  speed: number;
  paused: boolean;
  cash: number;
  era: number;
  shippedCount: number;
  /** Machine types the space owns; gates what can be attempted. */
  ownedMachines: MachineType[];
  /** Offers waiting to be pitched (CLAUDE.md §4a). */
  backlog: BacklogEntry[];
  runtime: RuntimeSnapshot;
  log: LogEntry[];
  /** UI: which panel tab is open. */
  view: 'projects' | 'backlog';

  setSpeed: (speed: number) => void;
  togglePause: () => void;
  setPaused: (paused: boolean) => void;
  setClock: (day: number, simTime: number) => void;
  setRuntime: (runtime: RuntimeSnapshot) => void;
  setView: (view: GameState['view']) => void;
  spend: (amount: number) => boolean;
  earn: (amount: number) => void;
  pushLog: (text: string, kind?: LogEntry['kind']) => void;

  setBacklog: (backlog: BacklogEntry[]) => void;
  addOffer: (entry: BacklogEntry) => void;
  removeOffer: (id: string) => void;
  ownMachine: (type: MachineType) => void;
  recordShipped: () => void;
}

export const emptyRuntime = (): RuntimeSnapshot => ({
  members: [],
  machines: [],
  projects: [],
  player: null,
});

export const store = createStore<GameState>((set, get) => ({
  day: 1,
  simTime: 9,
  speed: 1,
  paused: true,
  cash: START_CASH,
  era: 1,
  shippedCount: 0,
  ownedMachines: ['fdm', 'bench', 'assembly', 'cad-desk', 'lounge'],
  backlog: [],
  runtime: emptyRuntime(),
  log: [],
  view: 'projects',

  setSpeed: (speed) => set({ speed, paused: false }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
  setPaused: (paused) => set({ paused }),
  setClock: (day, simTime) => set({ day, simTime }),
  setRuntime: (runtime) => set({ runtime }),
  setView: (view) => set({ view }),

  spend: (amount) => {
    if (get().cash < amount) return false;
    set((s) => ({ cash: s.cash - amount }));
    return true;
  },
  earn: (amount) => set((s) => ({ cash: s.cash + amount })),

  pushLog: (text, kind = 'info') => {
    const { day, simTime, log } = get();
    const entry: LogEntry = { id: uid('log'), day, time: simTime, text, kind };
    set({ log: [entry, ...log].slice(0, MAX_LOG) });
  },

  setBacklog: (backlog) => set({ backlog }),
  addOffer: (entry) => set((s) => ({ backlog: [entry, ...s.backlog] })),
  removeOffer: (id) => set((s) => ({ backlog: s.backlog.filter((e) => e.id !== id) })),
  ownMachine: (type) =>
    set((s) => (s.ownedMachines.includes(type) ? s : { ownedMachines: [...s.ownedMachines, type] })),

  recordShipped: () =>
    set((s) => {
      const shippedCount = s.shippedCount + 1;
      // Minimal era progression: slots and catalog only (CLAUDE.md §8, Phase 6 completes it).
      const era = shippedCount >= eraDef(s.era).shipToAdvance ? Math.min(3, s.era + 1) : s.era;
      return { shippedCount, era };
    }),
}));
