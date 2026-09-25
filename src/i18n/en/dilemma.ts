import { money } from '@/utils/format';
import { num } from '../locale';

/**
 * The dilemma cards (CLAUDE.md §7c): a title, the situation, and each option's label. What
 * the options *do* is in `utils/dilemmas.ts` and is said by the `dilemma.fx.*` lines, so a
 * card never promises anything the numbers do not do. `name` is the person the card is
 * about, or the space's own name when it is about nobody.
 */
type P = { name: string };

export const dilemma = {
  'promo.log.started': (p: { project: string; gain: number; days: number }) =>
    `${p.project} is being promoted: about ${p.gain} reputation over the next ${p.days} days.`,
  'promo.title': 'Promote it',
  'promo.button': (p: { cost: number; gain: number }) => `Promote · ${money(p.cost)} → +${p.gain} reputation`,
  'promo.hint': (p: { days: number; window: number }) =>
    `The reputation arrives a share a day over ${p.days} days. Only within ${p.window} days of release, once a build.`,
  'promo.running': (p: { paid: number; gain: number }) => `Promoted · +${p.paid} of ${p.gain} reputation so far`,
  'dilemma.kicker': 'A decision',
  'dilemma.chance': (p: { pct: number }) => `${p.pct}% chance:`,
  'dilemma.nothing': 'Nothing — and nothing gained',
  'dilemma.fx.cash': (p: { amount: number }) => `${p.amount < 0 ? '−' : '+'}${money(Math.abs(p.amount))}`,
  'dilemma.fx.rep': (p: { amount: number }) => `${p.amount < 0 ? '−' : '+'}${num(Math.abs(p.amount))} reputation`,
  'dilemma.fx.moodAll': (p: { delta: number }) => `everybody's mood ${p.delta < 0 ? '−' : '+'}${Math.abs(p.delta)}`,
  'dilemma.fx.moodOne': (p: { delta: number; name: string }) => `${p.name}'s mood ${p.delta < 0 ? '−' : '+'}${Math.abs(p.delta)}`,
  'dilemma.fx.away': (p: { days: number; name: string }) => `${p.name} away ${p.days} days`,
  'dilemma.fx.leave': (p: { name: string }) => `${p.name} leaves`,
  'dilemma.fx.work': (p: { pct: number; days: number }) =>
    `work ${p.pct < 0 ? '−' : '+'}${Math.abs(p.pct)}% for ${p.days === 1 ? 'today' : `${p.days} days`}`,
  'dilemma.fx.printers': (p: { days: number }) => `printers stopped ${p.days} days`,
  'dilemma.fx.power': (p: { times: number; days: number }) => `power ×${num(p.times, 1)} for ${p.days} days`,
  'dilemma.fx.filament': (p: { times: number; days: number }) => `filament ×${num(p.times, 1)} for ${p.days} days`,
  'dilemma.fx.dayOff': 'the rest of your day',
  'dilemma.log.chose': (p: { title: string; option: string }) => `${p.title}: ${p.option}.`,
  'dilemma.log.lucky': (p: { title: string }) => `${p.title} — it came off.`,
  'dilemma.log.unlucky': (p: { title: string }) => `${p.title} — it did not come off.`,

  'dilemma.inspection.title': (_p: P) => 'The fire inspector',
  'dilemma.inspection.body': (_p: P) =>
    'The wiring behind the benches is older than anybody in the room. Rewire it properly now, or tape ' +
    'it up, run everything through extension leads, and hope the inspector does not come back.',
  'dilemma.inspection.a': 'Rewire it now',
  'dilemma.inspection.b': 'Tape it up',

  'dilemma.rush.title': (_p: P) => 'A client wants it sooner',
  'dilemma.rush.body': (_p: P) =>
    'A client has moved their launch forward and wants everything faster. The crew can crunch for a ' +
    'week — or you can say no and let them tell people about it.',
  'dilemma.rush.a': 'Crunch for a week',
  'dilemma.rush.b': 'Say no',

  'dilemma.burnout.title': (p: P) => `${p.name} is running on empty`,
  'dilemma.burnout.body': (p: P) =>
    `${p.name} has been in every day and it shows: short answers, cold coffee, the same bug three times. ` +
    'Send them home for a few days, or keep them on and hope it passes.',
  'dilemma.burnout.a': 'Send them home',
  'dilemma.burnout.b': 'Keep them on',

  'dilemma.printer.title': (_p: P) => 'The printer board has fried',
  'dilemma.printer.body': (_p: P) =>
    'A smell of burnt electronics and the printers stop mid-layer. An express repair gets them going ' +
    'today; the part by post takes four days.',
  'dilemma.printer.a': 'Express repair',
  'dilemma.printer.b': 'Wait for the part',

  'dilemma.neighbours.title': (_p: P) => 'The neighbours have had enough',
  'dilemma.neighbours.body': (_p: P) =>
    'A letter under the door about the noise, signed by everybody on the street. Keep quiet hours for a ' +
    'while, or pay for a proper door and some acoustic foam.',
  'dilemma.neighbours.a': 'Keep quiet hours',
  'dilemma.neighbours.b': 'Soundproof it',

  'dilemma.poach.title': (p: P) => `Somebody wants ${p.name}`,
  'dilemma.poach.body': (p: P) =>
    `Another space has offered ${p.name} a key, a desk and their own printer. You can match it with ` +
    'perks you cannot really afford, or wish them well.',
  'dilemma.poach.a': 'Match it',
  'dilemma.poach.b': 'Wish them well',

  'dilemma.press.title': (_p: P) => 'A journalist at the door',
  'dilemma.press.body': (_p: P) =>
    'Somebody from the local paper wants the tour, today, with photos. It is good for the name — and ' +
    'it is your whole day, and half of everybody else\'s.',
  'dilemma.press.a': 'Show them round',
  'dilemma.press.b': 'Not today',

  'dilemma.supplier.title': (_p: P) => 'Filament is going up',
  'dilemma.supplier.body': (_p: P) =>
    'The supplier is putting prices up next week. Lock in a year at the old price now, or pay as you go ' +
    'at the new one.',
  'dilemma.supplier.a': 'Lock in the price',
  'dilemma.supplier.b': 'Pay as you go',

  'dilemma.grant.title': (_p: P) => 'A grant, due tomorrow',
  'dilemma.grant.body': (_p: P) =>
    'A maker grant with a deadline you only just heard about. Writing it takes the rest of your day, ' +
    'and half of these go to somebody else.',
  'dilemma.grant.a': 'Write it tonight',
  'dilemma.grant.b': 'Let it go',

  'dilemma.hackathon.title': (_p: P) => 'The crew wants a hackathon',
  'dilemma.hackathon.body': (_p: P) =>
    'Pizza, a theme nobody agrees on and forty-eight hours of building something silly. It would do ' +
    'everybody good — and it is not free.',
  'dilemma.hackathon.a': 'Fund it',
  'dilemma.hackathon.b': 'Not this month',
};
