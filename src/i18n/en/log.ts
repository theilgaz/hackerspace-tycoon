import { money } from '@/utils/format';
import { num } from '../locale';

/**
 * English is the source of truth. Every other language is typed against this object, so a
 * missing or misspelt key fails `npm run typecheck` rather than showing up on screen.
 *
 * A message is a string, or a function of its parameters when it has any. Money and other
 * numbers arrive as numbers and are formatted *here*, so a log line written in one language
 * reads correctly after switching to another.
 *
 * Names of things the catalogue defines (projects, machines, stages, eras) still arrive
 * as English strings; they move to their own content files in step 4.
 */
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);


/** 1st, 2nd, 3rd, 11th — for the standings. */
function ordinal(n: number): string {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${tail}`;
}
export const log = {
  // --- The log ---------------------------------------------------------------
  'log.day1': 'Day 1. The garage smells of PLA and instant coffee.',
  'log.pickSomething': 'Pick something to build — open + New Project.',
  'log.noHours': 'No hours left today for that.',

  'log.amenity.needsEra': (p: { item: string; era: string }) => `The ${p.item} needs ${p.era}.`,
  'log.amenity.cantAfford': (p: { item: string }) => `Not enough left for the ${p.item}.`,
  'log.amenity.installed': (p: { item: string }) => `${p.item} installed.`,
  'log.amenity.installedUpkeep': (p: { item: string; upkeep: number }) =>
    `${p.item} installed. ${money(p.upkeep)} a month to run.`,

  'log.shelved': (p: { project: string; days: number }) =>
    `Nobody touched ${p.project} for ${p.days} days. It is on the shelf now.`,
  'log.offer.expired': (p: { item: string }) => `The ${p.item} offer expired.`,
  'log.offer.proposal': (p: { member: string; item: string }) =>
    `${p.member}: "we should build a ${p.item}. I'll take a stage myself."`,
  'log.offer.sponsor': (p: { item: string; cash: number }) =>
    `A sponsor will pay ${money(p.cash)} for a ${p.item}.`,
  'log.offer.trending': (p: { item: string }) => `r/DIY is full of ${p.item} builds this week.`,

  'log.drifted': (p: { member: string; project: string }) => `${p.member} drifted off ${p.project}.`,
  'log.requeued': (p: { member: string; part: string; project: string }) =>
    `${p.member} re-queued ${p.part} (${p.project}).`,
  'log.requeuedByYou': (p: { part: string; project: string }) => `You re-queued ${p.part} (${p.project}).`,

  'log.part.finished': (p: { part: string; project: string; time: string }) =>
    `${p.part} finished${p.project ? ` (${p.project})` : ''}. ${p.time}`,
  'log.part.failed': (p: {
    part: string;
    project: string;
    reason: string;
    atHour: number;
    hours: number;
    wasted: number;
  }) =>
    `${p.part}${p.project ? ` (${p.project})` : ''} ${p.reason} at hour ${num(p.atHour, 1)} of ${p.hours}.` +
    (p.wasted > 0 ? ` ${p.wasted}g wasted.` : ''),
  'fail.noFilament': 'ran out of filament',
  'fail.adhesion': 'bed adhesion let go',
  'fail.firstLayer': 'first layer lifted',
  'fail.nozzle': 'nozzle jammed',
  'fail.spaghetti': 'turned into spaghetti',
  'fail.layerShift': 'layer shift',
  'fail.thermal': 'thermal runaway trip',
  'fail.gantry': 'part knocked loose by the gantry',

  'log.stage.cadDone': (p: { project: string; quality: number; parts: number }) =>
    `${p.project}: CAD done at ${Math.round(p.quality * 100)}% quality, ${p.parts} parts to make.`,
  'log.stage.simClean': (p: { project: string }) => `${p.project}: simulation clean.`,
  'log.stage.simSkipped': (p: { project: string }) =>
    `${p.project}: simulation skipped. Hope the maths was right.`,
  'log.stage.allParts': (p: { project: string }) => `${p.project}: all parts made.`,
  'log.stage.assembled': (p: { project: string }) => `${p.project} assembled. Time to find out.`,
  'log.stage.passed': (p: { project: string; attempt: number }) =>
    `${p.project} works. Passed on attempt ${p.attempt}.`,
  'log.stage.testFailed': (p: { project: string; defect: string }) =>
    `${p.project} failed testing: ${p.defect}`,
  'log.stage.remake': 'A part needs remaking.',
  'log.stage.backToCad': 'Back to CAD.',
  'log.stage.backOnMachine': (p: { project: string; count: number }) =>
    `${p.project}: ${p.count} ${plural(p.count, 'part', 'parts')} back on the machine.`,
  'log.stage.fixesIn': (p: { project: string }) => `${p.project}: fixes in, testing again.`,

  'log.shipped': (p: { project: string; day: number; payout: number }) =>
    `${p.project} shipped on day ${p.day} — ${money(p.payout)}.`,
  'log.shippedAgain': (p: { project: string; payout: number }) =>
    `${p.project} shipped again — ${money(p.payout)}, and the room has seen it before.`,
  'log.shippedUnpaid': (p: { project: string; day: number }) => `${p.project} shipped on day ${p.day}.`,
  'log.eraUp': (p: { era: string }) => `Word is getting around — ${p.era}. New projects are open to you.`,

  'log.printer.needsEra': (p: { model: string }) => `Nobody will ship a ${p.model} to a garage.`,
  'log.printer.cantAfford': (p: { model: string }) => `Even on the overdraft, a ${p.model} is out of reach.`,
  'log.printer.noRoom': 'No room on the floor for another printer.',
  'log.printer.arrived': (p: { model: string }) => `${p.model} is on the bench and levelled. It arrived full.`,
  'log.lease.cantAfford': (p: { space: string }) => `Even on the overdraft, moving to ${p.space} is out of reach.`,
  'log.lease.signed': (p: { space: string; cost: number }) =>
    `You signed for ${p.space}. ${money(p.cost)} to move, and the rent goes up.`,
  'log.machine.sold': (p: { machine: string; value: number }) => `Sold the ${p.machine} for ${money(p.value)}.`,
  'log.machine.soldLast': (p: { machine: string; value: number }) =>
    `Sold the ${p.machine} for ${money(p.value)}. Nothing left to print with.`,
  'log.machine.duplicate': (p: { machine: string }) =>
    `A second ${p.machine} — the first one still works. It goes in the store.`,
  'log.machine.noRoom': 'No room left for the new machine. It lives in the corridor.',
  'log.machine.installed': (p: { machine: string }) => `${p.machine} is up and running. New things are possible.`,

  'log.team.full': (p: { project: string; size: number }) => `${p.project}'s team is full (${p.size}).`,
  'log.team.busy': (p: { member: string; project: string }) => `${p.member} is already on ${p.project}.`,
  'log.team.busyElsewhere': (p: { member: string }) => `${p.member} is already on something else.`,
  'log.team.saidNo': (p: { member: string; project: string }) =>
    `${p.member} has already said no to ${p.project}.`,
  'log.team.declined': (p: { member: string; project: string }) =>
    `${p.member} passed on ${p.project}. "Not really my thing."`,
  'log.team.joined': (p: { member: string; project: string }) => `${p.member} joined ${p.project}.`,
  'log.team.left': (p: { member: string; project: string }) => `${p.member} left ${p.project}.`,

  'log.cash.backInBlack': 'Back in the black.',
  'log.cash.overdraftStarted': (p: { days: number }) =>
    `The balance is under. You have ${p.days} days to get it back above zero.`,
  'log.cash.daysLeft': (p: { days: number }) => `${p.days} days to get the balance back above zero.`,
  'log.bill.short': (p: { amount: number }) =>
    `Could not cover the bill — ${money(p.amount)} short. It goes on the overdraft.`,
  'log.bill.up': (p: { amount: number }) => `Bill settled. Up ${money(p.amount)} on the month.`,
  'log.bill.down': (p: { amount: number }) => `Bill settled. Down ${money(p.amount)} on the month.`,
  'over.bank': (p: { amount: number }) =>
    `The overdraft ran out at ${money(p.amount)} down. The bank pulled the lease.`,
  'over.landlord': 'Two months in the red and no way back. The landlord changed the locks.',

  'log.awards.won': (p: { won: number; total: number }) => `Awards night: you took ${p.won} of ${p.total}.`,
  'log.awards.none': 'Awards night: nothing for us this year.',
  'log.awards.countdown': (p: { days: number; leading: string; race: string; rival: string }) =>
    (p.days === 1 ? 'Awards night is tomorrow.' : `${p.days} days to awards night.`) +
    (p.leading ? ` You lead ${p.leading}.` : ' You do not lead anything yet.') +
    (p.race ? ` Closest race: ${p.race}, where ${p.rival} is ahead.` : ''),
  'log.rank.up': (p: { from: number; to: number; space: string }) =>
    `The month closes with you ${ordinal(p.to)} in the standings, up from ${ordinal(p.from)}` +
    (p.space ? ` — past ${p.space}.` : '.'),
  'log.rank.down': (p: { from: number; to: number; space: string }) =>
    `The month closes with you ${ordinal(p.to)} in the standings, down from ${ordinal(p.from)}` +
    (p.space ? ` — ${p.space} got past you.` : '.'),

  'log.applicant.via': (p: { name: string; via: string }) =>
    `${p.name} got in touch after seeing the ${p.via} write-up.`,
  'log.applicant.asking': (p: { name: string }) => `${p.name} has been asking about joining.`,
  'log.applicant.passed': (p: { name: string }) => `You told ${p.name} it is not the right time.`,
  'log.applicant.passedAnon': 'You told them it is not the right time.',
  'log.applicant.cantAfford': (p: { name: string }) =>
    `Even on the overdraft, taking ${p.name} on is out of reach.`,
  'log.hired.full': (p: { name: string; hours: number }) => `${p.name} joined full-time — ${p.hours}h a week.`,
  'log.member.offBooks': (p: { member: string }) => `${p.member} is off the books.`,

  'log.post.alreadyProject': (p: { project: string }) => `${p.project} has already been posted today.`,
  'log.post.alreadySpace': 'The space was posted today.',
  'log.post.burned': (p: { room: string; name: string; upvotes: number }) =>
    `${p.room} turned on the ${p.name} post — ${p.upvotes} and a pile-on.`,
  'log.post.did': (p: { room: string; name: string; upvotes: number }) =>
    `${p.name} did ${p.upvotes} on ${p.room}.`,
  'word.theSpace': 'the space',

  'log.role.set': (p: { member: string; role: string }) => `${p.member} is looking after ${p.role} now.`,
  'log.role.cleared': (p: { member: string }) => `${p.member} has handed the job back.`,
  'log.role.loaded': (p: { member: string; machine: string }) => `${p.member} loaded the ${p.machine} back up.`,
  'log.role.ordered': (p: { member: string; project: string }) =>
    `${p.member} got the ${p.project} parts on order.`,
  'log.pitch.cantBuild': "The space can't build that yet.",
  'log.pitch.sponsorPaid': (p: { item: string; cash: number }) =>
    `Sponsor paid ${money(p.cash)} up front for ${p.item}.`,
  'log.pitch.proposerSigned': (p: { member: string; item: string }) => `${p.member} signed straight up for ${p.item}.`,
  'log.pitch.ordered': (p: { item: string; cost: number; days: number }) =>
    `Pitched ${p.item}. Parts ordered — ${money(p.cost)}, ${p.days} days out.`,
  'log.pitch.noCash': (p: { item: string; cost: number }) =>
    `Pitched ${p.item}, but there is no cash for the ${money(p.cost)} bill of materials. ` +
    `Nothing can be assembled until it is ordered.`,
  'log.pitch.plain': (p: { item: string; blurb: string }) => `Pitched ${p.item}. ${p.blurb}`,
  'log.repitch.took': (p: { project: string; count: number }) => `Re-pitched ${p.project}: ${p.count} joined.`,
  'log.repitch.none': (p: { project: string }) => `Re-pitched ${p.project}. Nobody bit.`,

  'log.bounty.cantAfford': 'Even on the overdraft, that bounty is out of reach.',
  'log.bounty.posted': (p: { project: string; stage: string }) =>
    `Bounty on ${p.project} · ${p.stage}. Pizza is on the way.`,
  'log.parts.cantAfford': (p: { project: string }) => `Even on the overdraft, the ${p.project} parts are out of reach.`,
  'log.parts.ordered': (p: { project: string; days: number }) => `Ordered parts for ${p.project}. ${p.days} days out.`,
  'log.parts.expediteCantAfford': 'Even on the overdraft, expediting is out of reach.',
  'log.parts.expedited': (p: { project: string }) => `Paid to expedite the ${p.project} order.`,
  'log.parts.noMachine': (p: { machine: string; part: string }) => `No ${p.machine} in the space for ${p.part}.`,
  'log.parts.queued': (p: { count: number; project: string }) =>
    `${p.count} ${plural(p.count, 'part', 'parts')} queued (${p.project}).`,
  'log.filament.cantAfford': (p: { machine: string }) =>
    `Even on the overdraft, filament for the ${p.machine} is out of reach.`,
  'log.filament.loaded': (p: { machine: string }) => `${p.machine} loaded up.`,

  // --- What somebody is doing (the roster's italic line) ----------------------
  'note.atHome': 'at home',
  'note.justArrived': 'just arrived',
  'note.headingHome': 'heading home',
  'note.lunch': 'lunch',
  'note.backOnIt': 'back on it',
  'note.needsSitDown': 'needs a sit-down',
  'note.lostInterest': 'lost interest',
  'note.joined': (p: { project: string }) => `joined ${p.project}`,
  'note.working': (p: { project: string; stage: string }) => `${p.project}: ${p.stage}`,
  'note.waiting': (p: { project: string }) => `${p.project}: waiting`,
  'note.levelling': 'levelling the bed',
  'note.watchingPrint': 'watching the print',
  'note.hangingAround': 'hanging around',
  'note.notSigningOff': 'not signing off on this',
  'note.projectDone': (p: { project: string }) => `${p.project} is done`,
  'note.doneForToday': 'done for today',
  'note.outOfHours': 'out of hours',
  'note.inTheSpace': 'in the space',
  'note.lookingForWork': 'looking for something to do',
  'note.bedFlat': 'bed is flat again',
  'note.nothingByHand': (p: { project: string }) => `${p.project}: nothing to do by hand`,
  'note.free': 'free — pick something',
  // --- The monthly statement (saved with the run, so messages) ------------------
  'bill.work': 'Work shipped',
  'bill.workDetail': 'payouts for builds that shipped',
  'bill.sponsor': 'Sponsors',
  'bill.sponsorDetail': 'paid up front on a pitch',
  'bill.sales': 'Sold',
  'bill.salesDetail': 'kit and furniture sold back',
  'bill.parts': 'Parts',
  'bill.partsDetail': 'bills of materials and expediting',
  'bill.design': 'Design budgets',
  'bill.designDetail': 'tools and technology chosen at the pitch',
  'bill.kit': 'Kit and furniture',
  'bill.kitDetail': 'printers, tables, stations, comforts',
  'bill.filament': 'Filament',
  'bill.filamentDetail': 'spools loaded into the printers',
  'bill.hiring': 'Joining fees',
  'bill.hiringDetail': 'one-off, for everybody taken on',
  'bill.training': 'Training',
  'bill.trainingDetail': 'courses at the learning station',
  'bill.bounties': 'Bounties',
  'bill.bountiesDetail': 'pizza, cash and prints for the boring jobs',
  'bill.lease': 'Moving',
  'bill.leaseDetail': 'the van, and signing the new lease',
  'bill.other': 'Other',
  'bill.otherDetail': 'not itemised',
  'bill.crewDues': 'Crew dues',
  'bill.crewDuesDetail': (p: { count: number; each: number }) => `${p.count} on the books · ${p.each} each`,
  'bill.communityDues': 'Community dues',
  'bill.communityDuesDetail': (p: { count: number; each: number }) =>
    `${p.count} using the space · ${p.each} each`,
  'bill.rent': 'Rent',
  'bill.power': 'Power and consumables',
  'bill.powerDetail': (p: { hours: number }) => `${p.hours} machine-hours`,
  'bill.comforts': 'Comforts',
  'bill.comfortsDetail': (p: { count: number }) => `${p.count} in the space · running costs`,
  'log.role.levelled': (p: { member: string; machine: string }) => `${p.member} levelled the bed on the ${p.machine} between prints.`,
};

