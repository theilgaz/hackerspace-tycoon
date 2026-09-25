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
  'build.skill.comms': 'communications',
  'build.skill.mechanical': 'mechanical',
  // --- Roles (design §3): what somebody is, and how good at it ---------------------
  'build.role.software': 'Software developer',
  'build.role.electronics': 'Electronics tech',
  'build.role.comms': 'Comms engineer',
  'build.role.mechanical': 'Machinist',
  'build.rank.1': 'Intern',
  'build.rank.2': 'Junior',
  'build.rank.3': 'Mid',
  'build.rank.4': 'Senior',
  'build.rank.5': 'Expert',
  'build.note.makingCoffee': 'making a coffee',
  'build.note.pouringTea': 'pouring a tea',
  'build.note.makingTea': 'putting the kettle on',
  'build.note.grabbingDrink': (p: { thing: string }) => `grabbing a drink from the ${p.thing}`,
  'build.note.onBreak': (p: { thing: string }) => `on a break: ${p.thing}`,
  'build.note.playingWith': (p: { thing: string; partner: string }) => `${p.thing} with ${p.partner}`,
  'build.note.lookingForPartner': (p: { thing: string }) => `${p.thing}: looking for somebody to play`,
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
  'build.np.foot.crew': 'The kickoff needs every one of them at the table at once — any five, for a bigger crew.',
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
  'build.np.seatBlocked': (p: { count: number; table: string; other: string }) =>
    `A crew of ${num(p.count)} kicks off once five of them sit down — that needs a ${p.table} or a ${p.other}. Build one`,
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
  'build.np.largeHint': (p: { table: string; other: string; build: string }) =>
    `A crew bigger than four kicks off once five of them sit down, round a ${p.table} or a ${p.other}. Both are in ${p.build}.`,

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
  'build.seats.hardware': (p: { count: number }) => `Maker ${num(p.count)}`,
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
  'build.people.trainCell': (p: { skill: string; from: number; to: number; cost: number; span: string }) =>
    `Train ${p.skill} ${num(p.from)} → ${num(p.to)} · ${money(p.cost)} · ${p.span} at the learning station`,
  'build.people.trainHow': 'Press a skill to send them on a course for the next level. They are off crews until it is done.',
  'build.people.trainNeedsStation': (p: { build: string }) => `Training needs a Learning Station — it is in ${p.build}.`,
  'build.skillShort.software': 'SW',
  'build.skillShort.electronics': 'EL',
  'build.skillShort.cad': 'CAD',
  'build.skillShort.machining': 'MC',
  'build.skillShort.welding': 'WLD',
  'build.skillShort.docs': 'DOC',
  'build.skillShort.comms': 'COM',
  'build.skillShort.mechanical': 'MEC',
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
  // --- Build mode (§7b) --------------------------------------------------------
  // --- The Learning Station's panel (§4c) -------------------------------------
  'build.train.title': 'Learning Station',
  'build.train.seats': (p: { free: number; total: number }) => `${num(p.free)} of ${num(p.total)} chairs free`,
  'build.train.noStation': 'There is no Learning Station yet. Buy one in Build, on the Work shelf.',
  'build.train.pickSkill': 'Pick a skill. Everybody who could take the course is listed under it, with what the next level costs.',
  'build.train.start': (p: { count: number; cost: number }) => `Start ${num(p.count)} ${p.count === 1 ? 'course' : 'courses'} · ${money(p.cost)}`,
  'build.train.startNone': 'Pick who goes',
  'build.train.foot': 'Two chairs a station. Somebody on a course is on nobody\'s crew until it is done.',
  'build.train.level': (p: { from: number; to: number }) => `Level ${p.from} → ${p.to}`,
  'build.train.each': 'each',
  'build.train.thisCourse': 'this course',
  'build.train.full': 'chairs full',
  'build.train.switch': 'Pick to switch the course to this level',
  'build.train.notFree': 'Not free',
  'build.train.onCrewOf': (p: { project: string }) => `on ${p.project}`,
  'build.train.onCourse': 'already on a course',
  'build.train.onCrew': 'on a crew',
  'build.train.now': 'On a course now',
  'build.train.maxed': 'already at 5',
  'build.train.nobody': 'Nobody is free to take this course.',
  'build.train.startCourse': (p: { cost: number }) => `Start course · ${money(p.cost)}`,
  'build.log.treatSent': (p: { member: string; item: string }) => `${p.member} is off to the ${p.item}.`,
  'build.log.treatDone': (p: { member: string }) => `${p.member} is back with a cup, and in a better mood.`,
  'build.log.treatDoneBreak': (p: { member: string }) => `${p.member} is back from a break, rested and in a better mood.`,
  'build.log.treatAgain': (p: { member: string }) => `${p.member} has already had one today.`,
  'build.log.treatBusy': (p: { item: string }) => `Somebody is already at the ${p.item}.`,
  'build.log.treatNoRoom': (p: { item: string }) => `There is nowhere to stand at one end of the ${p.item} — turn it, or move it clear.`,
  'build.treat.title.drink': (p: { item: string; n: number }) => `Who is having one? · ${p.item}`,
  'build.treat.title.one': (p: { item: string; n: number }) => `Who is taking a break? · ${p.item}`,
  'build.treat.title.many': (p: { item: string; n: number }) => `Who is taking a break? (up to ${p.n}) · ${p.item}`,
  'build.treat.title.pair': (p: { item: string; n: number }) => `Who is playing? (pick ${p.n}) · ${p.item}`,
  'build.treat.send': (p: { picked: number; need: number; max: number }) =>
    p.picked < p.need ? `Pick ${p.need - p.picked} more` : `Send ${p.picked}`,
  'build.treat.hint': 'They put down what they are doing and come back rested and in a better mood. Once a person a day.',
  'build.treat.had': 'had a break today',
  'build.toast.needSeat': (p: { count: number; station: string }) =>
    `${num(p.count)} waiting for a free ${p.station} — add one in Build`,
  'build.np.wingBriefs': (p: { count: number }) => `${num(p.count)} ${p.count === 1 ? 'brief' : 'briefs'}`,
  'build.np.wingNobody': 'nobody trained yet',
  'build.np.wingBestHint': 'The best in the space at this role — the ceiling on how good a build can be.',
  'build.np.nameLabel': 'Name the build',
  'build.np.namePlaceholder': 'What is it called?',
  'build.np.nameSuggest': 'Suggest',
  'build.np.nameSuggestHint': 'A codename, the way makers name things',
  'build.np.ownTitle': 'My own project',
  'build.np.ownHint': 'An idea of yours rather than a brief. Pick how big it is; you name it at the end.',
  'build.np.ownLocked': 'Not at this lease, or the space is missing a machine for it',
  // --- The design step, as three questions (design §5.4) -----------------------
  'build.np.fDays': 'Takes',
  'build.np.fDaysHint': 'About how long, for this crew: hand work on working days, parts in the post, prints on the clock — and the chance a test fails.',
  'build.np.fDaysRisk': (p: { clean: string; retry: string; pct: number }) =>
    `${p.clean} if the first test passes; a failed one (${p.pct}%) adds about ${p.retry}.`,
  'build.np.fDaysFail': (p: { pct: number; retry: string }) => `${p.pct}% test fails · +${p.retry}`,
  'build.np.fQuality': 'Quality',
  'build.np.fQualityHint': 'What this plan should reach — never above the ceiling the crew\'s best sets.',
  'build.np.fCeiling': (p: { stars: number }) => `ceiling ${num(p.stars)}★`,
  'build.np.fPays': 'Pays',
  'build.np.fHype': 'Hype',
  'build.np.wishes': 'The client wants',
  'build.np.preset.fast': 'Fastest',
  'build.np.preset.best': 'Best',
  'build.np.preset.profit': 'Most profitable',
  'build.np.preset.fastHint': 'The plan that ships soonest.',
  'build.np.preset.bestHint': 'The best build this crew can make.',
  'build.np.preset.profitHint': 'The most money for the days it takes.',
  'build.np.qApproach': 'Approach',
  'build.np.qTech': 'Technology',
  'build.np.techHint': 'Not a choice — the crew brings it. Train them and it gets better on its own.',
  'build.np.techFrom': (p: { name: string; rank: string }) => `from ${p.name} · ${p.rank}`,
  'build.np.techNobody': 'nobody on the crew yet',
  'build.np.rankNone': 'untrained',
  'build.np.webAlways': 'Web — always',
  'build.np.reach': (p: { have: string; need: string; work: number; risk: string }) =>
    `The crew is ${p.have}, this is ${p.need} work: time +${p.work}%, test risk ×${p.risk}`,
  'build.wish.stars': (p: { min: number }) => `at least ${num(p.min)}★`,
  'build.wish.platform': (p: { name: string }) => `${p.name} too`,
  'build.wish.scope': (p: { name: string }) => p.name,
  'build.wish.days': (p: { days: number }) => `within ${num(p.days)} days`,
  'build.wish.hint': 'Met at release, each wish adds to the pay and the hype. Missed, it costs nothing.',
  'build.np.pickCrew': (p: { count: number }) => `Pick ${num(p.count)} more ${p.count === 1 ? 'person' : 'people'} for the crew`,
  'build.np.seatNoPeople': (p: { count: number; free: number }) => `${num(p.count)} people — only ${num(p.free)} are free to pick`,
  'build.mode.shelf.work': 'Work',
  'build.mode.shelf.printers': 'Printers',
  'build.mode.shelf.drinks': 'Drinks',
  'build.mode.shelf.rest': 'Rest',
  'build.mode.shelf.fun': 'Fun',
  'build.mode.shelf.comfort': 'Comfort',
  'build.mode.shelf.decor': 'Decor',
  'build.mode.about.work': 'Tables to kick a build off at, and a seat for every pair of hands. People queue for a desk when there is none.',
  'build.mode.about.printers': 'Two cheap printers print two things at once; one dear one prints one thing quickly.',
  'build.mode.about.drinks': 'Coffee, tea, something cold. Where the day starts, and where half the decisions get made.',
  'build.mode.about.rest': 'Somewhere to sit down that is not a desk. Tired people get back on their feet faster.',
  'build.mode.about.fun': 'Mood and word of mouth, for a slice of the afternoon. Nobody works through a rally.',
  'build.mode.about.comfort': 'The room itself: cooler, quieter, calmer. Mostly focus, some of it mood.',
  'build.mode.about.decor': 'Cheap, mostly free to run, and all of it through the same mood curve.',
  'build.mode.placeHint': 'Click a lit tile to put it there — you are asked before anything is paid. R turns it, right-click or Esc puts it back.',
  'build.mode.exit': 'Exit Build',
  'build.mode.scrollLeft': 'Back along the shelf',
  'build.mode.scrollRight': 'Further along the shelf',
  'build.mode.endBlocked': 'one end is blocked — turn it or move it',
  'build.mode.exitHint': 'Back to the room — the clock starts again',
  'build.mode.pickHint': 'Click it to pick it up, then choose a tile — nothing is paid until you say yes.',
  'build.mode.moveHint': 'Pick something from the shelves, or click anything in the room to move it.',
  'build.mode.corner.hacker': 'Hacker corner',
  'build.mode.corner.maker': 'Maker corner',
  'build.mode.corner.meeting': 'Meeting corner',
  'build.mode.confirm': (p: { name: string }) => `Buy the ${p.name} and put it here?`,
  'build.mode.leaves': (p: { cash: number }) => `leaves ${money(p.cash)}`,
  'build.mode.yes': (p: { price: number }) => `Buy · ${money(p.price)}`,
  'build.mode.no': 'Not now',
  // --- Print orders and the filament run (§5) ---------------------------------
  'build.orders.title': 'Print orders',
  'build.orders.count': (p: { n: number }) => `${num(p.n)} on offer`,
  'build.orders.blurb':
    'Paid jobs for the printers. Say yes and it goes on the bench: anybody free can pick it up, and so can you. Paid on delivery — miss the date and the client walks.',
  'build.orders.none': 'Nobody has asked for anything yet. Orders come in most mornings.',
  'build.orders.col.order': 'Order',
  'build.orders.col.bed': 'Longest print',
  'build.orders.col.due': 'Due',
  'build.orders.col.pays': 'Pays',
  'build.orders.accept': 'Accept',
  'build.orders.acceptHint': (p: { days: number }) => `Due ${num(p.days)} days from today. Paid on delivery.`,
  'build.orders.declineHint': (p: { days: number }) => `Turn it down. It would wait ${num(p.days)} more days.`,
  'build.orders.dueIn': (p: { days: number }) => `${num(p.days)}d left`,
  'build.orders.dueToday': 'due today',
  'build.orders.fillAll': (p: { cost: number }) => `Fill all · ${money(p.cost)}`,
  'build.orders.fillFromShelf': 'Fill all from the shelf',
  'build.orders.series': 'STL supplied',
  'build.orders.seriesHint': 'A series print: the client sends the file, the printers do the job. Nobody needs to work on it.',
  'build.orders.maintain': (p: { count: number }) => (p.count ? `Level all (${num(p.count)})` : 'All level'),
  'build.orders.maintainHint': 'A maintenance round: every bed levelled, every nozzle wiped — an hour of your day, however many there are.',
  'build.shelf.title': 'Filament shelf',
  'build.shelf.count': (p: { count: number; max: number }) => `${num(p.count)}/${num(p.max)} spools`,
  'build.shelf.fill': (p: { cost: number }) => `Fill the shelf · ${money(p.cost)}`,
  'build.shelf.none': (p: { build: string }) => `No shelf for spare filament — a Filament Shelf in ${p.build} lets you buy ahead.`,
  'build.orders.allFull': 'Every printer is full',
  'build.orders.fillAllHint': 'Tops up every printer in one trip — half an hour of your day, however many there are.',
  'build.log.maintained': (p: { count: number }) => `Levelled and wiped ${num(p.count)} ${p.count === 1 ? 'printer' : 'printers'}.`,
  'build.log.spoolsStocked': (p: { count: number; cost: number }) => `${num(p.count)} ${p.count === 1 ? 'spool' : 'spools'} on the shelf — ${money(p.cost)}.`,
  'build.log.wishes': (p: { project: string; met: number; total: number }) =>
    `${p.project}: ${num(p.met)} of ${num(p.total)} of the client's wishes met${p.met ? ' — and paid for' : ''}.`,
  'build.log.filamentAll': (p: { count: number; cost: number }) => `Filament for ${num(p.count)} printers — ${money(p.cost)}.`,
  'build.log.filamentAllCantAfford': (p: { cost: number }) => `Filling every printer costs ${money(p.cost)}, and even the overdraft will not stretch.`,
  'build.log.orderIn': (p: { item: string; client: string }) => `A print order came in: ${p.item}, for ${p.client}.`,
  'build.log.orderAccepted': (p: { item: string; pay: number; day: number }) =>
    `Said yes to ${p.item}: ${money(p.pay)} on delivery, due by day ${num(p.day)}.`,
  'build.log.orderMissed': (p: { item: string; client: string; rep?: number }) =>
    `${p.item} missed its date. ${p.client} went elsewhere, and what was on the printer is scrap.${p.rep ? ` −${p.rep} reputation.` : ''}`,
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
  'tour.welcome.title': (_p: { name: string }) => 'Welcome to Hackerspace Tycoon',
  'tour.welcome.body': (p: { name: string }) =>
    `<b>${p.name}</b> is yours: a small hackerspace in a garage. Design builds, get your volunteers to ` +
    '<b>finish</b> them, pay the rent, and grow into a bigger space. Once a year there is an awards ' +
    'night against the other hackerspaces — aim for the top. The clock is stopped for the tour.',
  'tour.top.title': (_p: { name: string }) => 'The space at a glance',
  'tour.top.body': (_p: { name: string }) =>
    'Your cash, your reputation and what is on. Reputation is what opens the next, bigger lease — ' +
    'when it does, a button to move appears here, and the move is yours to make.',
  'tour.new.title': (_p: { name: string }) => 'Start something',
  'tour.new.body': (_p: { name: string }) =>
    'Everything begins with <b>+ New Project</b>. Press it now — the tour will wait.',
  'tour.wizard.title': (_p: { name: string }) => 'Crew it, then design it',
  'tour.wizard.body': (_p: { name: string }) =>
    'Pick a genre and a brief, then the crew: the build arrives with its brief\'s name, which you can ' +
    'change, and the people you tick are the crew. They decide what the design can be — better tools ' +
    'need people who can use them. A small first build is the right first build. Start it at the end.',
  'tour.bench.title': (_p: { name: string }) => 'On the bench',
  'tour.bench.body': (_p: { name: string }) =>
    'Your builds live here. Each one starts with a <b>kickoff</b> at a project table, and only moves ' +
    'while the whole crew is sitting down together — then everybody goes to their own station. ' +
    'Anything blocking a build is said here, in red or amber.',
  'tour.you.title': (_p: { name: string }) => 'Your day',
  'tour.you.body': (_p: { name: string }) =>
    'The thin bar under the clock is what is left of your day. You are the one person who always turns ' +
    'up: when your hands are empty you pick up the oldest build yourself. Every other verb — a bounty, ' +
    'an order, a hire — spends the same hours.',
  'tour.calendar.title': (_p: { name: string }) => 'What is coming',
  'tour.calendar.body': (_p: { name: string }) =>
    'Today\'s date, the year up to its <b>awards night</b> — the gold dot at the end — and a dot for ' +
    'everything with a date: the monthly bill, a client\'s deadline, parts arriving, somebody new. ' +
    'The next one is named. Press it for the list.',
  'tour.log.title': (_p: { name: string }) => 'Everybody is somebody',
  'tour.log.body': (_p: { name: string }) =>
    'Your people have <b>traits</b> — a Perfectionist who will not sign off shoddy work, a Scope Creeper ' +
    'with one more idea, a Mentor, a Night Owl. When one of them does something, it pops up beside the ' +
    'bench, and everything that happens ends up in this log.',
  'tour.menu.title': (_p: { name: string }) => 'Everything else',
  'tour.menu.body': (_p: { name: string }) =>
    '<b>Build</b> buys tables, stations, printers and comforts — <b>Exit Build</b> takes you back. ' +
    '<b>People</b> is where you take members on, see their traits and train them. <b>Machines</b> runs ' +
    'the printers and paid print orders. <b>Socials</b> turns work into attention — and attention fades ' +
    'a little every day.',
  'tour.money.title': (_p: { name: string }) => 'The books',
  'tour.money.body': (_p: { name: string }) =>
    'Every 30 days the books close: members pay dues, the landlord takes the rent. You may go under, ' +
    'down to −₺30,000 — but get back above zero within 60 days, or the lease is gone.',
  'tour.done.title': (_p: { name: string }) => 'That is the lot',
  'tour.done.body': (_p: { name: string }) =>
    'Ship something small, post about it, take people on, and move to a bigger space. The lightbulb in ' +
    'the top bar shows you round again.',
  'build.fx.licensed': (p: { cost: number; seats: number }) => `${money(p.cost)} · licensed ×${num(p.seats)}`,
  'build.log.licenceBought': (p: { item: string; seats: number; cost: number }) =>
    `${p.item}: ${num(p.seats)} ${plural(p.seats, 'seat', 'seats')} licensed for ${money(p.cost)} — the space keeps them.`,
  'build.fx.setUp': (p: { cost: number }) => `${money(p.cost)} · set up once`,
  'build.fx.inPlace': (p: { cost: number }) => `${money(p.cost)} · already in place`,
  'build.log.infraBuilt': (p: { item: string; cost: number }) =>
    `${p.item} set up for ${money(p.cost)} — it stays for every project after this one.`,
  'build.moving.howWall': 'Click a lit spot under the back wall to hang it there. Escape puts it back.',

  // --- The ship report, and advertising a build -----------------------------------
  'report.title': (p: { project: string }) => `${p.project} has shipped`,
  'report.verdict.above': 'Beat the plan',
  'report.verdict.asPlanned': 'As planned',
  'report.verdict.below': 'Short of the plan',
  'report.verdict.none': 'Shipped',
  'report.planned': (p: { value: string }) => `planned ${p.value}`,
  'report.quality': 'Quality',
  'report.pay': 'Paid',
  'report.reputation': 'Reputation',
  'report.took': 'Took',
  'report.profit': (p: { amount: string }) => `profit ${p.amount}`,
  'report.wishes': (p: { met: number; total: number }) => `The client's wishes · ${p.met} of ${p.total} met`,
  'report.noWishes': 'Nobody asked for anything: it was yours to build.',
  'report.madeBy': 'Made by',
  'report.campaign.title': 'Advertise it',
  'report.campaign.hint': (p: { days: number; week: number }) =>
    `A campaign multiplies this build's own reputation, and the attention sells: it comes back as sales over ` +
    `${p.week} days. A good new build pays for its campaign; a weak or repeated one does not. Once per build, ` +
    `an hour of your day, within ${p.days} days of release.`,
  'report.campaign.expect': (p: { gain: number }) => (p.gain >= 0 ? `+${num(p.gain)} reputation` : `−${num(-p.gain)} reputation`),
  'report.campaign.judged': 'rides on quality',
  'report.campaign.range': (p: { min: number; max: number }) =>
    `${p.min >= 0 ? '+' : '−'}${num(Math.abs(p.min))} … ${p.max >= 0 ? '+' : '−'}${num(Math.abs(p.max))}`,
  'report.campaign.back': (p: { sales: number }) => (p.sales > 0 ? `≈ ${money(p.sales)} back in sales` : 'nothing back'),
  'report.campaign.backRange': (p: { min: number; max: number }) =>
    p.max > 0 ? `up to ${money(p.max)} back in sales` : 'nothing back',
  'report.campaign.sales': (p: { paid: number; total: number }) => `${money(p.paid)} of ${money(p.total)} in sales so far`,
  'report.campaign.launch': (p: { campaign: string; cost: number }) => `Run ${p.campaign} · ${money(p.cost)}`,
  'report.campaign.pick': 'Pick a campaign',
  'report.campaign.done': (p: { campaign: string; gain: number }) =>
    p.gain >= 0 ? `${p.campaign} ran: +${num(p.gain)} reputation.` : `${p.campaign} backfired: −${num(-p.gain)} reputation.`,
  'report.campaign.closed': 'Too late to advertise — it is old news now.',
  'report.campaign.order': 'A print order: the client paid, and there is nothing to advertise.',
  'report.campaign.noHours': 'Not enough of your day left for this.',
  'report.campaign.flyers.name': 'Flyers and a meetup talk',
  'report.campaign.flyers.blurb': 'A stack of flyers and ten minutes at the next meetup. Cheap and safe.',
  'report.campaign.social.name': 'Sponsored posts',
  'report.campaign.social.blurb': 'Paid reach on the feeds. More people see it; nobody judges it.',
  'report.campaign.review.name': 'A YouTube review',
  'report.campaign.review.blurb': 'A maker reviews it — honestly. A good build is made; a weak one is torn apart, in public.',
  'report.campaign.launch.name': 'Launch night',
  'report.campaign.launch.blurb': 'Press, a demo table and drinks. The biggest splash there is, at a price.',
  'report.close': 'Back to work',
  'report.log.ran': (p: { project: string; campaign: string; gain: number }) =>
    `${p.campaign} for ${p.project}: +${num(p.gain)} reputation.`,
  'report.log.backfired': (p: { project: string; campaign: string; gain: number }) =>
    `${p.campaign} for ${p.project} backfired: −${num(p.gain)} reputation.`,
  'report.log.tooLate': (p: { project: string }) => `${p.project} is old news — too late to advertise it.`,
  'report.log.cantAfford': (p: { project: string; cost: number }) =>
    `Not even the overdraft covers ${money(p.cost)} of advertising for ${p.project}.`,
};
