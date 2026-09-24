import type { ProjectDef, StageKey } from '@/game/types';
import { ORDERS } from '@/utils/constants';

/**
 * Print orders (CLAUDE.md §5) — paid jobs that come in because the space has printers.
 *
 * They are ordinary builds as far as the pipeline is concerned, so they sit on the bench,
 * anybody free may pick one up and so may you. What is different is the shape: almost no
 * hand work, **long unbroken prints** — a museum bust is fifty-odd hours on one bed — a
 * fixed price agreed up front, and a due date. They are how a printer earns its keep
 * between the space's own builds, and why a second printer is worth more than it looks.
 *
 * No kickoff (there is nothing to agree), no design budget, no parts to order, and the
 * build-size pace (`TIER_PACE`) does not touch them: the client asked for fifty hours of
 * print, and fifty hours of print is what it takes.
 */

/** Only the stages a print order goes through: prep the files, print, clean up, hand over. */
function stages(prep: number, finish: number, packing: number): Record<StageKey, number> {
  return {
    concept: 0,
    cad: prep,
    simulation: 0,
    fabrication: 0,
    assembly: finish,
    test: 0,
    iterate: 2,
    release: packing,
  };
}

function order(
  id: string,
  name: string,
  client: string,
  blurb: string,
  parts: [string, number, number][],
  work: [number, number, number],
  pay: number,
  days: number,
  era = 1,
): ProjectDef {
  return {
    id: `order-${id}`,
    name,
    category: 'mechanical',
    tags: ['design', 'cad'],
    era,
    tier: 'small',
    blurb,
    teamSize: 1,
    work: stages(...work),
    parts: parts.map(([part, hours, material]) => ({ name: part, machineType: 'fdm', hours, material })),
    bomCost: 0,
    leadDays: 0,
    requires: ['fdm'],
    hype: 15,
    // Somebody draws the files first, and that is what the client is paying for (§5).
    payout: Math.round((pay * ORDERS.cadPremium) / 50) * 50,
    order: { client, days },
  };
}

/**
 * A series print (design follow-up): the client sends the STL, the space burns filament. No
 * files to prepare, nothing to clean up, nobody on it — the printer is the whole job, and
 * the money is for machine time. The long batches are what a second printer is for.
 */
function series(
  id: string,
  name: string,
  client: string,
  blurb: string,
  parts: [string, number, number][],
  pay: number,
  days: number,
  era = 1,
): ProjectDef {
  const def = order(id, name, client, blurb, parts, [0, 0, 0], pay, days, era);
  def.work = { ...def.work, iterate: 0 };
  // The file is theirs: the price is machine time and filament, nothing else.
  def.payout = pay;
  def.order = { ...def.order!, series: true };
  return def;
}

export const PRINT_JOBS: ProjectDef[] = [
  order('knobs', 'Replacement Oven Knobs', 'a bakery on the corner',
    'Six knobs for a 1980s deck oven. The originals are brittle and nobody makes them any more.',
    [['Knob set', 6, 90]], [3, 2, 1], 900, 2),
  order('toppers', 'Wedding Cake Toppers', 'a couple in a hurry',
    'Two little figures and a bicycle, in white, by Saturday.',
    [['Figures', 9, 70], ['Bicycle', 4, 30]], [4, 4, 1], 1300, 3),
  order('clips', 'Cable Clips ×200', 'the café that rewired',
    'Two hundred clips, all the same, printed by the plateful.',
    [['Clip plate 1', 10, 160], ['Clip plate 2', 10, 160]], [2, 3, 2], 1600, 3),
  order('lithophane', 'Lithophane Lamp', 'a retirement present',
    'A photograph printed in thin white plastic, lit from inside. It has to be perfect.',
    [['Lithophane shade', 16, 140], ['Lamp base', 5, 80]], [4, 4, 1], 1900, 3),
  order('enclosures', 'Prototype Enclosures ×20', 'a hardware start-up',
    'Twenty cases for a sensor that will be injection-moulded next year if investors like the demo.',
    [['Enclosure batch A', 18, 330], ['Enclosure batch B', 18, 330]], [4, 6, 2], 4200, 5),
  order('helmet', 'Cosplay Helmet', 'a convention regular',
    'A full-head helmet in four pieces, sanded smooth enough to paint.',
    [['Helmet crown', 22, 380], ['Visor frame', 8, 120]], [3, 8, 1], 3400, 4),
  order('drone-frames', 'Drone Frame Batch ×10', 'a racing club',
    'Ten frames in tough filament. They will all be crashed by the end of the season.',
    [['Frame batch', 40, 700]], [3, 5, 2], 4800, 5),
  order('architecture', 'Architectural Model', 'an architects\' practice',
    'A 1:200 model of a library, one unbroken print so the facade has no seams.',
    [['Library model', 52, 900]], [5, 6, 2], 6800, 6),
  order('bust', 'Museum Replica Bust', 'the city museum',
    'A life-size replica of a marble bust for the touch gallery. Fifty-eight hours on one bed.',
    [['Bust', 58, 1200], ['Plinth', 8, 180]], [5, 8, 2], 8600, 7, 2),
  order('armour', 'Cosplay Armour Set', 'a film society',
    'Chest plate, pauldrons and gauntlets for a stage production. The chest alone is two days.',
    [['Chest plate', 50, 950], ['Pauldrons', 20, 340], ['Gauntlets', 14, 220]], [6, 12, 2], 11500, 8, 2),
  order('set-pieces', 'Theatre Set Pieces', 'the state theatre',
    'Ornate cornices for a period drama, printed in sections and joined on site.',
    [['Cornice A', 36, 700], ['Cornice B', 36, 700], ['Corbels', 24, 420]], [6, 10, 3], 14500, 9, 3),
  series('keychains', 'Series · Keychains ×60', 'a festival stall',
    'Sixty logo keychains from the client\'s STL. Print, bag, done.',
    [['Keychain plate 1', 9, 180], ['Keychain plate 2', 9, 180]], 1500, 3),
  series('clips-500', 'Series · Cable Clips ×500', 'an office fit-out',
    'Five hundred clips, their file, four full beds.',
    [['Clip bed 1', 12, 260], ['Clip bed 2', 12, 260], ['Clip bed 3', 12, 260], ['Clip bed 4', 12, 260]], 3600, 5),
  series('gears', 'Series · Replacement Gears ×40', 'a bakery chain',
    'Forty mixer gears in tough filament, straight from their CAD.',
    [['Gear batch', 30, 620]], 3900, 4),
  series('stands', 'Series · Phone Stands ×30', 'a phone shop',
    'Thirty branded stands for the counter. The STL is theirs, the filament is yours.',
    [['Stand batch A', 16, 340], ['Stand batch B', 16, 340]], 3200, 4),
  series('organisers', 'Series · Desk Organisers ×20', 'a co-working space',
    'Twenty organisers, one per desk. Long prints, no fuss.',
    [['Organiser batch', 48, 980]], 5400, 6, 2),
];
