import { money } from '@/utils/format';
import { num } from '../locale';

/**
 * + New Project, Build and the kickoff (CLAUDE.md §4c, §4d): the wizard, the Build panel,
 * the build menu along the bottom, and what the Simulation says about tables and seats.
 *
 * Kept in its own area file so the feature's strings travel together. The design options,
 * furniture and decor are *content* — like catalogue names they stay English until the
 * content files move (step 4).
 */
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

export const build = {
  // --- The build menu --------------------------------------------------------
  'build.bar.new': 'New Project',
  'build.bar.newHint': 'Design a new project and pick its crew',
  'build.bar.projects': 'Projects',
  'build.bar.projectsHint': 'Everything on, waiting and done',
  'build.bar.ranking': 'Ranking',
  'build.bar.rankingHint': 'How the other spaces are doing',
  'build.bar.machines': 'Machines',
  'build.bar.machinesHint': 'The shop floor and its queues',
  'build.bar.machinesAlert': 'A machine wants calibrating or feeding',
  'build.bar.people': 'People',
  'build.bar.peopleHint': 'Who is here, and who you could take on',
  'build.bar.peopleWaiting': (p: { count: number }) => `${num(p.count)} waiting on an answer`,
  'build.bar.build': 'Build',
  'build.bar.buildHint': 'Tables, workstations, comforts and decor',
  'build.bar.buildQueue': (p: { count: number }) => `${num(p.count)} standing about for want of a seat`,
  'build.bar.socials': 'Socials',
  'build.bar.socialsHint': 'Put something in front of an audience — attention falls on its own',

  'build.people': (p: { count: number }) => `${num(p.count)} ${plural(p.count, 'person', 'people')}`,
  'build.days': (p: { days: number }) => `${num(p.days)}d`,
  'build.stars': (p: { value: number }) => `${num(p.value)} of 5`,

  'build.top.cashHint': (p: { days: number }) =>
    `Cash in hand. The books close in ${num(p.days)} days — dues in, rent out.`,
  'build.bill.income': 'Income',
  'build.bill.costs': 'Costs',
  'build.bill.opened': 'Opened on',
  'build.bill.now': 'Now',
  'build.top.projects': (p: { count: number }) => `${num(p.count)} ${plural(p.count, 'project', 'projects')}`,
  'build.top.busy': (p: { used: number; total: number }) => `${num(p.used)}/${num(p.total)} busy`,
  'build.top.shipped': (p: { count: number }) => `${num(p.count)} shipped`,

  'build.people.hireAll': (p: { count: number; cost: number }) => `Take all ${num(p.count)} on · ${money(p.cost)}`,
  'build.skill.cad': 'CAD',
  'build.skill.electronics': 'electronics',
  'build.skill.machining': 'machining',
  'build.skill.welding': 'welding',
  'build.skill.software': 'software',
  'build.skill.docs': 'documentation',
  'build.note.waitingToTrain': (p: { skill: string }) => `waiting for a learning station (${p.skill})`,
  'build.note.training': (p: { skill: string }) => `training: ${p.skill}`,
  'build.log.onCourse': (p: { member: string }) => `${p.member} is on a course and cannot join a crew until it is done.`,
  'build.log.noLearning': 'There is no Learning Station to train at. Build one first.',
  'build.log.busyToTrain': (p: { member: string }) => `${p.member} is on a crew. Take them off it before sending them on a course.`,
  'build.log.trainStart': (p: { member: string; skill: string; level: number }) =>
    `${p.member} is off to the learning station — ${p.skill} ${num(p.level)} next.`,
  'build.log.trained': (p: { member: string; skill: string; level: number }) =>
    `${p.member} finished the course: ${p.skill} is ${num(p.level)} now.`,

  'build.np.needsSkill': (p: { skill: string; level: number }) => `needs ${p.skill} ${num(p.level)} on the crew — train someone`,
  'build.np.crewBest': (p: { skill: string; level: number }) => `crew ${p.skill}: ${num(p.level)}`,
  'build.np.crewBestHint': 'The best level on the crew you picked. Three stars needs 2, five stars needs 4.',

  'build.people.onCourse': (p: { skill: string; pct: string }) => `training ${p.skill} · ${p.pct}`,
  'build.people.noStation': 'Build a Learning Station first.',
  'build.people.onCrew': 'On a crew — take them off it first.',
  'build.people.alreadyOnCourse': 'Already on a course.',

  'build.panel.printers': 'Printers',
  'build.machines.buyInBuild': (p: { build: string }) => `New printers are in ${p.build}.`,
  'build.printer.intro':
    'Two cheap printers print two things at once; one dear one prints one thing quickly. Past the A1 they are all enclosed, and they grow with the price.',
  'build.printer.fails': (p: { pct: string }) => `failures ${p.pct}`,
  'build.card.ownedN': (p: { count: number }) => `${num(p.count)} in the space`,
  'build.card.owned': 'In the space',

  'build.sell.notOwned': 'That is not something the space can sell.',
  'build.sell.fixture': 'Part of the building — it stays.',
  'build.sell.inUse': 'A crew is planning at this table. Sell it when the kickoff is done.',
  'build.sell.button': (p: { value: number }) => `Sell · ${money(p.value)}`,
  'build.log.sold': (p: { item: string; value: number }) => `Sold the ${p.item} for ${money(p.value)}.`,

  'build.social.best': 'best',
  'build.social.post': 'Post',

  // --- The wizard ------------------------------------------------------------
  'build.np.step.genre': 'Genre',
  'build.np.step.brief': 'Brief',
  'build.np.step.design': 'Design',
  'build.np.step.crew': 'Crew',
  'build.np.step.review': 'Review',
  'build.np.backTo': (p: { step: string }) => `Back to ${p.step}`,
  'build.np.back': 'Back',
  'build.np.foot.design':
    'Three stars is the brief as written. One is quicker and it shows; five is dearer and it shows.',
  'build.np.foot.crew': 'The kickoff needs every one of them at the table at once.',
  'build.np.foot.other': 'The parts are ordered the moment it starts. People are the limit, not slots.',
  'build.np.pickBrief': 'Pick a brief first.',

  'build.np.offers': 'Offers',
  'build.np.offersHint': 'Proposals, sponsors, and whatever Reddit is excited about',
  'build.np.offersWaiting': (p: { count: number }) => `${num(p.count)} waiting`,
  'build.np.asking': 'What the market is asking for',
  'build.np.nothingInGenre': 'Nothing in this genre right now.',
  'build.np.scopedFor': (p: { count: number }) => `scoped for ${num(p.count)}`,
  'build.np.scopedForHint': 'the crew size it was scoped for',
  'build.np.payoutHint': "the brief's price, before quality and the market",
  'build.np.keepIt': 'you keep it',
  'build.np.hypeHint': 'reputation, before quality',
  'build.np.machineTimeHint': 'machine time',
  'build.np.bomHint': 'bill of materials and lead time',
  'build.np.none': 'none',
  'build.np.needs': (p: { machines: string }) => `needs ${p.machines} — buy one first`,
  'build.np.needsHint': 'Buy or build one and this opens up',
  'build.np.needsMachine': (p: { machines: string }) => `Needs a ${p.machines}`,

  // What a design option changes, one badge each.
  'build.fx.quality': (p: { value: string }) => `quality ${p.value}`,
  'build.fx.appeal': (p: { value: string }) => `appeal ${p.value}`,
  'build.fx.appealHint': 'what the market pays for it',
  'build.fx.work': (p: { value: string }) => `work ${p.value}`,
  'build.fx.testRisk': (p: { value: string }) => `test risk ${p.value}`,
  'build.fx.parts': (p: { value: string }) => `parts ${p.value}`,
  'build.fx.printing': (p: { value: string }) => `printing ${p.value}`,
  'build.fx.delivery': (p: { days: number }) => `+${num(p.days)}d delivery`,
  'build.fx.perSeat': (p: { cost: number; each: number }) => `${money(p.cost)} · ${money(p.each)}/seat`,
  'build.fx.cost': (p: { cost: number }) => money(p.cost),
  'build.fx.costHint': 'paid when it starts',
  'build.fx.noSim': 'no simulation stage',
  'build.fx.needs': (p: { machines: string }) => `needs ${p.machines}`,
  'build.fx.asBrief': 'as the brief says',

  'build.np.crewSize': 'Crew size',
  'build.np.seatBlocked': (p: { count: number; table: string }) =>
    `A crew of ${num(p.count)} needs a ${p.table} — Build one`,
  'build.np.fitQuality': (p: { value: string }) => `quality ${p.value}`,
  'build.np.fitQualityHint': 'quality from the size of the crew that plans it',
  'build.np.fitExplain': (p: { count: number }) =>
    `Scoped for ${num(p.count)}. Fewer and nobody checks anybody's work; up to twice that and ` +
    `the plan gets better; past it, too many cooks. More people also means more to agree at ` +
    `the kickoff, and a harder day to get them all in the room.`,
  'build.fit.short': 'short-handed',
  'build.fit.thin': 'a little thin',
  'build.fit.right': 'right-sized',
  'build.fit.well': 'well staffed',
  'build.fit.crowded': 'crowded',
  'build.fit.cooks': 'too many cooks',
  'build.np.ask': (p: { picked: number; seats: number }) => `Ask ${num(p.picked)} of ${num(p.seats)}`,
  'build.np.canSayNo': 'they can still say no',
  'build.np.proposerLocked': 'Proposed it — signs up the moment it starts',
  'build.np.notIn': 'not in today',
  'build.np.everyoneBusy':
    'Everybody is already on something. You can still start it and crew it later from the ' +
    'bench — or put yourself on it.',
  'build.np.largeHint': (p: { table: string; build: string }) =>
    `Crews of five and ten need a ${p.table}. It is in ${p.build}.`,

  'build.review.quality': 'Quality',
  'build.review.qualityHint': 'crew craft + design + crew size',
  'build.review.market': 'Market',
  'build.review.marketHint': 'what this genre is paying this week',
  'build.review.pays': 'Pays',
  'build.review.paysHint': 'at release, if the quality holds',
  'build.review.reputation': 'Reputation',
  'build.review.reputationHint': 'what shipping it does for the name',
  'build.review.design': 'Design',
  'build.review.commitment': 'Commitment',
  'build.review.crew': 'Crew',
  'build.review.kickoff': 'Kickoff',
  'build.review.handWork': 'Hand work',
  'build.review.machineTime': 'Machine time',
  'build.review.parts': 'Parts',
  'build.review.licences': 'Licences',
  'build.review.testRisk': 'Test risk',
  'build.review.noSim': 'no sim',
  'build.review.tableFree': (p: { table: string }) => `${p.table} — free`,
  'build.review.tableBusy': (p: { table: string }) => `${p.table} — busy; it waits its turn`,
  'build.review.noTable': 'no table seats this many',
  'build.review.asking': (p: { names: string }) => `Asking ${p.names}.`,
  'build.review.nobodyAsked': 'Nobody asked yet — volunteers may still sign up.',
  'build.review.proposerSigns': 'The proposer signs up on the spot.',
  'build.review.start': (p: { project: string }) => `Start ${p.project}`,
  'build.review.leaves': (p: { cash: number }) => `Leaves you ${money(p.cash)}`,
  'build.review.pastOverdraft': 'past the overdraft',

  'build.offer.proposer': (p: { member: string }) => `${p.member} will sign up`,
  'build.offer.upFront': (p: { cash: number }) => `${money(p.cash)} up front`,
  'build.offer.hype': (p: { multiplier: number }) => `×${num(p.multiplier)} hype`,
  'build.offer.daysLeft': (p: { days: number }) => `${num(p.days)}d left`,

  'build.demand.hot': 'hot',
  'build.demand.warm': 'rising',
  'build.demand.flat': 'steady',
  'build.demand.cold': 'cooling',
  'build.demand.hint': 'what this genre is paying this week, against normal',

  // --- The bench -------------------------------------------------------------
  'build.bench.design': 'design',
  'build.kick.notIn': (p: { names: string }) => `kickoff: ${p.names} not in`,
  'build.kick.noTable': 'kickoff: no free table',
  'build.kick.at': (p: { table: string }) => `kickoff at ${p.table}`,
  'build.kick.theTable': 'the table',
  'build.kick.hintBounty': 'a bounty keeps a part-timer on all day',
  'build.kick.hintEveryone': 'everyone at once',

  // --- The Build panel -------------------------------------------------------
  'build.panel.title': 'Build',
  'build.panel.queue': (p: { count: number }) => `${num(p.count)} waiting for a seat`,
  'build.panel.workspace': 'Workspace',
  'build.panel.comfort': 'Comforts',
  'build.panel.decor': 'Decor',
  'build.panel.foot':
    'Everything lands wherever there is room. <b>Click it in the room</b> to move it, and ' +
    'click again to turn it. Printers and tools are in <b>Machines</b>.',
  'build.seats.title': 'Seats in the space',
  'build.seats.software': (p: { count: number }) => `Software ${num(p.count)}`,
  'build.seats.hardware': (p: { count: number }) => `Hardware ${num(p.count)}`,
  'build.seats.assembly': (p: { count: number }) => `Assembly ${num(p.count)}`,
  'build.seats.waiting': (p: { count: number }) => `${num(p.count)} waiting`,
  'build.seats.waitingHint': (p: { count: number }) => `${num(p.count)} standing about for want of one`,
  'build.seats.hint': 'seats in the space',
  'build.seats.tables': (p: { count: number; used: number }) =>
    `${num(p.count)} ${plural(p.count, 'table', 'tables')} · ${num(p.used)} in use`,
  'build.seats.tablesHint': 'kickoffs happen here — one crew per table at a time',
  'build.card.seats': (p: { count: number }) => `${num(p.count)} ${plural(p.count, 'seat', 'seats')}`,
  'build.card.noRoom': 'no room',
  'build.card.noRoomHint': 'No room left on the floor',
  'build.card.notEnough': 'Not enough left',
  'build.card.comesWith': (p: { era: string }) => `Comes with ${p.era}`,
  'build.card.in': 'in',
  'build.card.alreadyIn': 'Already in the space',
  'build.card.price': (p: { price: number }) => money(p.price),
  'build.card.priceUpkeep': (p: { price: number; upkeep: number }) =>
    `${money(p.price)} now, ${money(p.upkeep)} a month`,
  'build.card.perMonth': (p: { upkeep: number }) => `${money(p.upkeep)}/mo`,
  'build.card.perMonthHint': 'charged on every monthly statement',
  'build.card.era': (p: { era: number }) => `era ${num(p.era)}`,
  'build.card.notYours': 'not yours yet',
  'build.comfort.title': 'What the place is like to be in',
  'build.comfort.moodHint': 'everybody turns up more, and works better',
  'build.decor.intro':
    'Plants, art and nerd things. None of it makes a part; a little of it makes people want ' +
    'to be here — and the fifth nice thing in a room counts for less than the first.',
  'build.effect.mood': (p: { value: string }) => `mood +${p.value}`,
  'build.effect.focus': (p: { value: string }) => `work rate ${p.value}`,
  'build.effect.rest': (p: { value: string }) => `rest ${p.value}`,
  'build.effect.fatigue': (p: { value: string }) => `tiring ${p.value}`,
  'build.effect.drift': (p: { value: string }) => `drift ${p.value}`,
  'build.effect.draw': (p: { value: string }) => `word of mouth ${p.value}`,

  // --- What the Simulation says ---------------------------------------------
  'build.log.noRoom': (p: { item: string }) => `There is no room left on the floor for a ${p.item}.`,
  'build.log.installed': (p: { item: string }) => `${p.item} is in. Click it in the room to move it.`,
  'build.log.noFloor': (p: { item: string }) =>
    `There is no floor left for the ${p.item}. A bigger lease would have some.`,
  'build.log.wentAhead': (p: { project: string; member: string }) =>
    `The ${p.project} crew stopped waiting for ${p.member} and went ahead without them.`,
  'build.log.noTable': 'There is no project table to plan it at. Build one first.',
  'build.log.crewTooBig': (p: { count: number }) =>
    `A crew of ${num(p.count)} needs a bigger project table than the space has.`,
  'build.log.designNeeds': (p: { machines: string }) => `That design needs a ${p.machines}.`,
  'build.log.licencesOut': (p: { item: string }) =>
    `Even on the overdraft, the licences for ${p.item} are out of reach.`,
  'build.log.kickoffDone': (p: { project: string; crew: number; fit: string; quality: number }) =>
    `${p.project}: kickoff done — ${num(p.crew)} round the table, ${p.fit}. ` +
    `Planned at ${Math.round(p.quality * 100)}% quality.`,

  'build.note.wentAhead': (p: { project: string }) => `the ${p.project} crew went ahead without them`,
  'build.note.kickoffOnceIn': (p: { project: string; names: string; count: number }) =>
    `${p.project}: kickoff once ${p.names} ${plural(p.count, 'is', 'are')} in`,
  'build.note.waitingTable': (p: { project: string }) => `${p.project}: waiting for a free table`,
  'build.note.toKickoff': (p: { project: string }) => `${p.project}: to the kickoff`,
  'build.note.kickoff': (p: { project: string }) => `${p.project}: kickoff`,
  'build.note.waitingFor': (p: { project: string; names: string }) => `${p.project}: waiting for ${p.names}`,
  'build.note.noFree': (p: { project: string; station: string }) => `${p.project}: no free ${p.station}`,

  // --- Crew stars, people and training (round 4) -----------------------------
  'build.np.match': (p: { genre: string; match: string }) => `${p.genre} match ${p.match}`,
  'build.np.starsLegend': (p: { axes: string }) => `stars they unlock: ${p.axes}`,
  'build.people.hireAllHint': 'Everybody full-time. Each one costs their joining fee and an hour of yours.',
  'build.people.takeOn': 'Take on',
  'build.people.maxed': 'as good as a course gets them',
  'build.people.col.loves': 'Loves',
  'build.people.trainCell': (p: { skill: string; from: number; to: number; cost: number; hours: number }) =>
    `Train ${p.skill} ${num(p.from)} → ${num(p.to)} · ${money(p.cost)} · ${num(p.hours)}h at the learning station`,
  'build.people.trainHow': 'Press a skill to send them on a course for the next level. They are off crews until it is done.',
  'build.people.trainNeedsStation': (p: { build: string }) => `Training needs a Learning Station — it is in ${p.build}.`,
  'build.skillShort.software': 'SW',
  'build.skillShort.electronics': 'EL',
  'build.skillShort.cad': 'CAD',
  'build.skillShort.machining': 'MC',
  'build.skillShort.welding': 'WLD',
  'build.skillShort.docs': 'DOC',
  'build.bench.training': 'At the learning station',
  'build.bench.trainingLine': (p: { skill: string; from: number; to: number }) => `${p.skill} ${num(p.from)} → ${num(p.to)}`,
  'build.bench.trainingHint': (p: { hours: string }) => `${p.hours} to go`,
  'build.bench.rating': 'Design rating — the three choices made at the pitch, averaged',

  // --- A project's own screen (§4e) --------------------------------------------
  'build.detail.foot': 'Shares are of the whole build — every stage, from the kickoff to the release.',
  'build.detail.whoMadeIt': 'Who made it',
  'build.detail.noCrew': 'Nobody has put any work in yet.',
  'build.detail.left': 'off the crew',
  'build.detail.leftHint': 'Worked on it, and has since left the crew.',
  'build.detail.design': 'Design',
  'build.detail.pay': 'What it paid',
  'build.detail.pay.base': 'The brief',
  'build.detail.pay.market': 'Market that week',
  'build.detail.pay.appeal': 'Design appeal',
  'build.detail.pay.quality': 'Quality',
  'build.detail.pay.novelty': 'Built before',
  'build.detail.pay.paid': 'Paid',
  'build.detail.spent': 'Spent',
  'build.detail.net': 'Net',
  'build.detail.took': 'Took',
  'build.detail.tests': (p: { count: number }) => `${num(p.count)} ${plural(p.count, 'test', 'tests')}`,
  'build.detail.failedPrints': (p: { count: number }) => `${num(p.count)} failed ${plural(p.count, 'print', 'prints')}`,
  'build.machines.col.printer': 'Printer',
  'build.trophy.firstNight': (p: { date: string; days: string; count: number }) =>
    `The first awards night is on ${p.date} — ${p.days} days away. ${num(p.count)} trophies, judged on the year.`,
  'build.trophy.repHint': 'Reputation the winner takes home',
  'build.np.cantAfford': (p: { cost: number }) => `${money(p.cost)} in design budget — past the overdraft`,
  'build.review.cantStart': (p: { cost: number; floor: number }) =>
    `The design budget is ${money(p.cost)}, and the space cannot go past −${money(p.floor)}. Earn first, or pick cheaper options.`,
  'build.log.ownerPicksUp': (p: { project: string }) => `Nothing on your hands — you pick up ${p.project}.`,
  'build.note.noChair': (p: { project: string }) => `no chair at the ${p.project} kickoff — the crew plans it`,
  'build.kick.noChairForYou': (p: { seats: number; table: string }) =>
    `the table seats ${num(p.seats)}` + ` — the crew kicks off without you. A ${p.table} would seat you.`,

  // --- The first-run tour (§11) -------------------------------------------------
  'tour.skip': 'Skip the tour',
  'tour.next': 'Next',
  'tour.finish': 'Open the doors',
  'tour.yourMove': 'your move',
  'tour.replayHint': 'Show me round again',
  'tour.welcome.title': (p: { name: string }) => `Welcome to ${p.name}`,
  'tour.welcome.body': (_p: { name: string }) =>
    'A hackerspace is a machine for <b>starting</b> projects. Your job is to make it <b>finish</b> one — ' +
    'then another. The clock is stopped while I show you round.',
  'tour.top.title': (_p: { name: string }) => 'The space at a glance',
  'tour.top.body': (_p: { name: string }) =>
    'Your cash, your reputation and what is on. Reputation is what signs the next, bigger lease — ' +
    'and the bar on the right counts down to the yearly awards night against the other spaces.',
  'tour.new.title': (_p: { name: string }) => 'Start something',
  'tour.new.body': (_p: { name: string }) =>
    'Everything begins with <b>+ New Project</b>. Press it now — the tour will wait.',
  'tour.wizard.title': (_p: { name: string }) => 'Design it, then crew it',
  'tour.wizard.body': (_p: { name: string }) =>
    'Pick a genre and a brief, then who you will <b>ask</b> — they are volunteers and can say no. ' +
    'The crew decides what the design can be: better tools need people who can use them. ' +
    'A small first build is the right first build. Start it at the end.',
  'tour.bench.title': (_p: { name: string }) => 'On the bench',
  'tour.bench.body': (_p: { name: string }) =>
    'Your builds live here. Each one starts with a <b>kickoff</b> at a project table, and only moves ' +
    'while the whole crew is sitting down together — then everybody goes to their own station. ' +
    'Anything blocking a build is said here, in red or amber.',
  'tour.you.title': (_p: { name: string }) => 'Your day',
  'tour.you.body': (_p: { name: string }) =>
    'The bar under the clock is what is left of your day. You are the one person who always turns up: ' +
    'when your hands are empty you pick up the oldest build yourself. Every other verb — a bounty, an ' +
    'order, a hire — spends the same hours.',
  'tour.menu.title': (_p: { name: string }) => 'Everything else',
  'tour.menu.body': (_p: { name: string }) =>
    '<b>Build</b> buys tables, stations, printers and comforts. <b>People</b> is where you take members on ' +
    'and train them. <b>Machines</b> runs the print queue. <b>Socials</b> turns work into attention — ' +
    'and attention fades a little every day.',
  'tour.money.title': (_p: { name: string }) => 'The books',
  'tour.money.body': (_p: { name: string }) =>
    'Every 30 days the books close: members pay dues, the landlord takes the rent. You may go under, ' +
    'down to −₺30,000 — but get back above zero within 60 days, or the lease is gone.',
  'tour.done.title': (_p: { name: string }) => 'That is the lot',
  'tour.done.body': (_p: { name: string }) =>
    'Ship something small, post about it, take people on, and move to a bigger space. The lightbulb in ' +
    'the top bar shows you round again.',
};
