/**
 * Printers you can buy (CLAUDE.md §5). The starting machine is deliberately the smallest one
 * in the catalogue: the first real decision the shop floor offers is whether a second printer
 * is worth more than the project you would spend the money on instead.
 *
 * The three axes are **capacity, speed and reliability**, and they are priced together rather
 * than traded against each other — a better printer is simply better, because a hackerspace
 * buying kit is an investment decision, not a puzzle. What makes it a decision is the money
 * and the fact that a second cheap machine prints two things at once while one expensive
 * machine prints one thing quickly.
 */
export interface PrinterModel {
  id: string;
  name: string;
  blurb: string;
  /** Zero for the one you start with. */
  price: number;
  /** Grams it holds. The bigger ones take a stack of spools rather than one. */
  capacity: number;
  /** Multiplier on how fast a job advances. */
  speed: number;
  /** Multiplier on failure odds — below one is better. */
  reliability: number;
  /** Era it becomes available; the space has to have grown into it. */
  era: number;
}

export const PRINTERS: PrinterModel[] = [
  {
    id: 'a1-mini',
    name: 'A1 Mini Combo',
    blurb: 'Small bed, four colours, endlessly patient. It got the space started.',
    price: 0,
    capacity: 1000,
    speed: 1,
    reliability: 1,
    era: 1,
  },
  {
    id: 'p2s',
    name: 'P2S',
    blurb: 'The workhorse. Nothing clever, nothing temperamental, prints all night.',
    price: 9000,
    capacity: 4000,
    speed: 1.35,
    reliability: 0.85,
    era: 1,
  },
  {
    id: 'x1c',
    name: 'X1C',
    blurb: 'Carbon frame, a lidar that actually spots a failed first layer. Quick and sure.',
    price: 19000,
    capacity: 4000,
    speed: 1.6,
    reliability: 0.62,
    era: 2,
  },
  {
    id: 'h2s',
    name: 'H2S',
    blurb: 'Big bed, heated chamber, a stack of spools. Prints the parts nothing else can.',
    price: 33000,
    capacity: 8000,
    speed: 1.85,
    reliability: 0.55,
    era: 3,
  },
];

export const PRINTER_MAP: Record<string, PrinterModel> = Object.fromEntries(
  PRINTERS.map((p) => [p.id, p]),
);

export const STARTING_PRINTER = PRINTERS[0];

/** What a model costs to fill from empty, at the going rate for a spool. */
export function fillCost(model: PrinterModel, spoolCost: number, spoolGrams: number): number {
  return Math.round((model.capacity / spoolGrams) * spoolCost);
}
