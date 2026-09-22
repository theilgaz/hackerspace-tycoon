/**
 * How an engaged autoplayer furnishes the space (§4d). Shared by every harness so they all
 * measure the same player: when people queue for a kind of seat, or a crew is all here
 * with no free table, buy one — as long as it is comfortably affordable and there is room.
 *
 * It buys what the queue says, not what might be nice. Like the printer rule in era-pace,
 * a harness that bought every desk it could afford would be measuring its own habit.
 */
import type { Simulation } from '@/systems/Simulation';
import type { MachineType } from '@/game/types';
import { furnitureFor, FURNITURE_MAP } from '@/utils/furniture';
import { furnitureFits } from '@/machines/layout';

export function furnish(sim: Simulation, spendable: () => number, margin = 1.5): number {
  let bought = 0;
  const needs = sim.workspaceNeeds();
  for (const [type, count] of Object.entries(needs) as [MachineType, number][]) {
    if (!count) continue;
    const def = type === 'table-large' ? FURNITURE_MAP['table-large'] : furnitureFor(type);
    if (!def) continue;
    if (spendable() < def.price * margin) continue;
    if (!furnitureFits(def.type, def.span)) continue;
    if (sim.buyFurniture(def.id)) bought += 1;
  }
  return bought;
}
