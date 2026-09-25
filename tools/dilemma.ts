import type { Simulation } from '@/systems/Simulation';
import { store } from '@/game/store';
import { rng } from '@/utils/rng';
import { DILEMMA_MAP } from '@/utils/dilemmas';

/**
 * How a harness answers a dilemma card (§7c), so a card never sits open and blocks the next.
 * `DILEMMA=a` or `b` always takes that answer — the A/B for the cards' balance — and the
 * default picks one at random off the seeded RNG, which is how a player who reads them
 * would spread over a run.
 */
export function answerDilemma(sim: Simulation) {
  const card = store.getState().dilemma;
  if (!card) return;
  const def = DILEMMA_MAP[card.id];
  const mode = process.env.DILEMMA;
  const index = mode === 'a' ? 0 : mode === 'b' ? def.options.length - 1 : rng.int(0, def.options.length - 1);
  sim.resolveDilemma(index);
}
