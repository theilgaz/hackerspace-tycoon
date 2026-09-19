import { createStore } from 'zustand/vanilla';
import type { LogEntry, RuntimeSnapshot } from './types';
import { START_CASH } from '@/utils/constants';
import { uid } from '@/utils/format';

const MAX_LOG = 120;

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
  runtime: RuntimeSnapshot;
  log: LogEntry[];
  /** UI: which member's card is expanded. */
  selectedMember: string | null;

  setSpeed: (speed: number) => void;
  togglePause: () => void;
  setPaused: (paused: boolean) => void;
  setClock: (day: number, simTime: number) => void;
  setRuntime: (runtime: RuntimeSnapshot) => void;
  spend: (amount: number) => boolean;
  earn: (amount: number) => void;
  pushLog: (text: string, kind?: LogEntry['kind']) => void;
  selectMember: (id: string | null) => void;
}

export const store = createStore<GameState>((set, get) => ({
  day: 1,
  simTime: 9,
  speed: 1,
  paused: true,
  cash: START_CASH,
  runtime: { members: [], machines: [], project: null },
  log: [],
  selectedMember: null,

  setSpeed: (speed) => set({ speed, paused: false }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
  setPaused: (paused) => set({ paused }),
  setClock: (day, simTime) => set({ day, simTime }),
  setRuntime: (runtime) => set({ runtime }),

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

  selectMember: (id) => set({ selectedMember: id }),
}));
