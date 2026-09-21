# Hackerspace Tycoon — Project Guide

Three.js-based management/tycoon game. This document is the output of a design session; the
decisions here are settled. Items under §13 "Open Questions" are to be resolved during
development, and all balance numbers live in `src/utils/constants.ts`.

> **Thesis:** A hackerspace is a machine for *starting* projects. Your job is to make it *finish* one.

Every system below exists to serve that sentence. When a design question comes up, the tiebreaker
is: does this increase the tension between "starting is fun" and "finishing is the win condition"?

## 1. Project Summary

**Genre:** Simulation / Tycoon
**Theme:** Run a hackerspace. Attract makers, acquire machines, push physical projects from a sketch
to a shipped, working object — an FPV drone, a pizza oven, a 3D-printed motorcycle.
**Tone:** Warm, nerdy comedy-of-errors with real stakes. Prints fail at hour 19. The one person who
knows CAD just discovered resin printing and stopped answering.
**Perspective:** Isometric (orthographic) camera, grid-based space. No character control.
**Player control model:** **Indirect / influence-based, with one exception: yourself.** Members
are **volunteers, not employees** — the player never drags one onto a task, but creates
*conditions* (§3) and they self-assign by passion. This is the single most important design
decision and it distinguishes the game from Game Corp DX / Game Dev Tycoon, where staff obey.
The exception is the player character (§3a): you are a member of your own hackerspace and you
*can* be told what to do. Your hours are strictly budgeted, and managing spends the same hours
as building — which is what stops the game collapsing into "tycoon where you are simply the
best employee".

Architectural consequence: the 3D scene is largely an observed diorama. Real interaction happens in
HTML/CSS overlay panels (projects, members, machines, Reddit, funding).

## 2. Core Gameplay Loop

1. **Build space** — paint rooms, place machines and furniture on an isometric grid.
2. **Attract people** — tools are magnets; events recruit; reputation opens the applicant pool.
3. **Pitch a project** — tag it; members whose passions match sign themselves up.
4. **Push it through the pipeline** — Concept → CAD → Simulation → Fabrication → Assembly → Test →
   Iterate → Release (§4). Fabrication is not a progress bar; it is jobs queued on real machines (§5).
5. **Post publicly** — WIP updates to subreddits convert work into hype (§6).
6. **Convert attention into money** — crowdfunding, sponsors, dues, workshops, grants (§7).
7. **Pay rent, buy better machines, move to a bigger space** — or get evicted (§8, §9).

**The core failure mode is drift.** Members chase novelty. The motorcycle sits at 80% because the
interesting part is done. Crowdfunding deadlines and Reddit's attention span are the forces that
push back against drift — they are the game's clock, not decoration.

## 3. The Influence Model (§1 consequence)

### The working day (§3d)

Nine to six, Monday to Friday, with **lunch from twelve to one** when the lounge finally earns
its floor space. Two contracts:

| | Hours | Span |
|---|---|---|
| **Full-time** | 8h/day, 40h/week | 09:00-18:00 |
| **Part-time** | 4h/day, 20h/week | mornings 09:00-14:00 or afternoons 14:00-18:00 |

You choose the contract when you hire, and it is the decision: more hours from fewer people, or
more people on fewer hours. Some applicants have a day job and can only take a part-time shift.

Hours come from the contract now, not a dice roll. The only randomness left is whether somebody
turns up at all, which is where mood and the Ghost still live. **A bounty therefore buys overtime
rather than a better roll** — a part-timer stays on for the rest of the day, a full-timer stays
past six. Keep that: §13's rule is that every verb has to move hours in the building, and with a
rota the only hours left to move are the ones past the end of a shift.

You are the exception. The owner is there at any hour, weekends included; the daily budget, not
the clock, is what limits you.

### Members (the space starts with two; the rest are hired — see §5)
```
Member {
  id, name,
  skills:     { cad, electronics, machining, welding, software, docs }  // 0-5
  passions:   Record<Tag, number>   // weighted, e.g. { fpv: 0.9, woodworking: 0.2 }
  energy:     0-100   // depleted by work, restored by rest/lounge/off-days
  mood:       0-100   // driven by policies, tools, events, project success
  commitment: number  // hours/week they actually show up — the real capacity number
  traits:     Trait[] // 1-2
}
```
`commitment` is the honest constraint: a member with high skill and 4 hours/week is nearly useless
for a deadline. The player raises commitment with mood, not money.

### Traits (design intent: each one is a *story*, not a stat tweak)
| Trait | Effect |
|---|---|
| Perfectionist | Quality bonus, but refuses to advance a stage below a quality threshold |
| Scope Creeper | Periodically adds a requirement to an in-progress project (more work, higher ceiling) |
| Mentor | Raises effective skill of members working in the same room |
| Ghost | Signs up for projects, then attendance decays to near zero |
| Gatekeeper | Blocks uncertified members from a machine; raises safety, lowers throughput |
| Night Owl | Works the hours nobody else does — great for long machine babysitting |
| Documenter | Rare. Actually does the docs stage without a bounty |

### The player's five verbs
| Verb | Effect | Cost |
|---|---|---|
| **Pitch a project** | Tagged write-up; members with matching passion self-assign. A pitch with no skill match sits dead in the backlog. | Time + reputation |
| **Post a bounty** | Cash / pizza / "you keep the print" on one stage or task. The only reliable way to get boring work (docs, sanding, wiring) done. | Money or goodwill |
| **Buy a tool** | A machine is a magnet: it pulls matching-passion members *and* applicants. | Money |
| **Run an event** | Drone race night, soldering workshop, open house. Mood up, recruitment, dues, attendee→member conversion. | Money + member hours |
| **Set policy** | Tool certification, clean-up rota, members-only hours, quiet hours. Every rule trades vibe for efficiency. | Mood |

**Design rule:** there is no "assign to task" button. You allocate people to a *project team*
(§3b) and they may refuse; you never put a named person on a named stage. If the player is stuck,
the answer is one of the verbs above, not more direct control.

## 3b. Teams — allocation without obedience

Every project has a **team size** (1 for a weekend build, 8 for the motorcycle) and you allocate
members to it. This is the player's most direct lever, and it is deliberately not command:

- **Asking is free, but they can say no.** Acceptance is `0.42 + 0.75 × passion match`, plus 0.3
  if the project carries a live bounty. A refusal sticks for 14 hours — you cannot badger anyone.
- **One project per person, and no cap on projects.** You may start as many as you like; the
  limit is bodies, plus the two hours a pitch costs you. An artificial slot count only ever made
  the job list inert while something was in progress — see §13.
- **The team persists across stages.** Only drift removes someone, which makes interest decay the
  thing that actually costs you a team member.
- **Volunteers still volunteer.** An unallocated member may join something themselves if it
  excites them, and a proposer joins the moment you pitch their idea.
- Extra hands help less each time: the second contributes 0.6, and each further one decays by
  0.85. Eight people are ~3.7× one person, not 8×.

**Weekend builds exist for this.** A one-person, two-to-four-day project (phone stand, cable tidy,
LED badge, fume extractor) runs alongside a long build without consuming the space, and teaches
the whole pipeline in a couple of days. First ship lands around day 4.

## 4c. The Jobs menu

The backlog is not a tab. It lives behind **Jobs** in the build menu along the bottom of the
screen — the bar that will also hold Shop, Events and the space builder in later phases. Jobs
opens a three-step wizard:

1. **Kind of work** — the ten genres as tiles, each showing how many projects it currently
   offers, plus an **Offers** tile at the top for proposals, sponsors and trends.
2. **Project** — the shortlist, with size handled *in place*.
3. **Crew** — pick who to ask, then pitch.

**Size is not a step.** It briefly was, and it was redundant: every project already states its
team size, so the list simply had to say it properly. It now appears three ways at once, which
is what a step could never do:

- a **segmented filter** above the list (All / 1-2 / 3-4 / 5+) with a count on each;
- **group headings** when nothing is filtered, so the whole range is visible at a glance, with
  a `short-handed` badge when the roster cannot fill the smallest job in that band;
- a **tinted crew badge** leading each row's meta line — "1 person", "3 people".

Filtering collapses the group headings, since they would then be saying the same thing twice.
The general rule: a wizard step should ask something the list cannot answer.

**The breadcrumb navigates.** A completed step is a button back to itself — the check-marked
crumbs take a pill background on hover so they read as clickable. The current step and the ones
ahead are plain text: you are already on one and the others do not exist yet. Back still walks
one step at a time; the breadcrumb is for jumping past it.

**The wizard is built from the design-system primitives (§11), not bespoke markup.** The first
version used ten saturated left borders, emoji at mixed sizes and cards of different heights —
which is what "assembled rather than designed" looks like.

**The wizard is a fixed box — 680×660, never content-sized.** A dialog that resizes between
steps is unpleasant to use and makes the Back button move under the cursor. The body scrolls; the
header, footer and the Pitch button stay put. The crew step would otherwise be mostly empty, so
it carries the commitment breakdown: every stage with its work (under the genre's own stage
names) and every part with its machine hours — or, for software, the line that says it never
touches the machine queue at all. `npm run click-check` asserts the box is identical on every
step; without the fix it measures 529 → 326 → 238 → 474.

**Crews are picked on the pitch screen.** Each backlog and catalog card carries a crew selector
listing unallocated members ranked by passion match, capped at the project's team size. Pitching
asks each of them — so a crew you picked can still turn up short, which is the volunteer model
surviving contact with a convenience feature. Mid-project changes still happen on the project
card.

## 3a. You (the player character)

You are on the grid, you are always in the building, and you can work. That matters because
§13 established that **attendance is the binding constraint** — and you are the one person
whose attendance is guaranteed.

The counterweight is the hour budget:

- You get **twelve hours on a rested day**, scaled by energy. Working flat out drains energy,
  which shrinks *tomorrow's* budget — overwork is a decision with a delayed bill, not an
  immediate one.
- `baseHours`, `energyDrain` and `energyRestore` are one setting, not three. A day settles at
  `energyRestore / energyDrain` hours, so the twelve-hour owner sustains about eleven and only
  reaches twelve after backing off. Move one number and the other two have to follow, or the
  budget stops being what it says — and `burnoutEnergy` has to stay below the evening trough of
  a normal long day, otherwise "burnt out" fires every afternoon and means nothing.
- **Every management verb spends the same pool**: a bounty 1h, ordering parts 1h, expediting 1h,
  re-pitching 1h, going out for filament 0.5h. Pitching is free — waiting on your own hours to
  *start* something was pure friction, and the money it commits is the real cost.
- So each hour spent doing the CAD yourself is an hour not spent recruiting the person who
  would have done it faster. That trade is the daily decision the game is built around.
- You never drift, and you take no passion penalty — it is your space, you work on what needs
  working on.
- **You put yourself on a *project*, not a stage** — exactly like a team member. You carry
  through every stage change and work whatever currently needs hands, idling when a stage is
  machine-driven. Only shipping releases you. Clearing the player at each stage boundary made
  the player re-enlist seven times per project, which read as the game forgetting what you
  were doing.

**The intended arc across the eras:** in Era 1 you are the best maker in the room and your hands
carry the project. By Era 3 your personal output is a rounding error and you are the person who
buys filament and keeps the lease. Do not balance later eras so the player can out-build the
space — the point is that they stop being able to.

## 4. Projects & the Fab Pipeline

### Stages
| Stage | Primary skill | Produces | Notes |
|---|---|---|---|
| Concept | — | requirement list | Scope Creeper strikes here and during Iterate |
| CAD | cad | part list (geometry) | Output quality gates everything downstream |
| Simulation | software / cad | risk reduction | **Optional.** Skipping it raises Test failure odds |
| Fabrication | machining | physical parts | **Not worker-driven — machine jobs (§5)** |
| Assembly | electronics / welding | assembled unit | Blocked until all parts exist |
| Test | — | pass / fail + defect list | Failure sends the project back to CAD or Fabrication |
| Iterate | varies | fixes | The loop that eats schedules |
| Release | docs | shipped project | Docs quality drives long-tail reputation |

A project carries `quality`, `scope`, `hypeEarned`, and a `defects[]` list. **Test is the teeth**:
skipping Simulation to save time is a real, tempting, punishable decision.

### Length tiers — a promise the catalog has to keep

| Tier | Length | Team | Typical work | Lead time |
|---|---|---|---|---|
| **small** | 1-5 days | 1-2 | 27-76 units | 0-3 days |
| **medium** | 5-10 days | 2-3 | 102-188 units | 4-6 days |
| **large** | 10-30 days | 4-8 | 208-500 units | 7-12 days |

Every `ProjectDef` declares its `tier`, and **`npm run project-times` measures every entry
against it** — best case, with a full team, every machine and parts ordered on day one. Treat a
`TOO LONG` row as a build failure, not a matter of taste.

The measurement earned its keep immediately: it showed that a project's length was essentially
its **lead time plus two days**, not its work content. Nixie Clock had a 21-day lead and took
24.8 days; LoRaWAN had 24 and took 28.6. Sourcing was designed as *a* bottleneck and had quietly
become *the* bottleneck. Lead times were cut by roughly three-quarters and 24/24 projects now
land inside their tier. **Before tuning work numbers, check lead times.**

### Bought parts and lead times

Printed parts are only half of a build; the other half arrives in a box. Every project carries a
**bill of materials** with a cost and a lead time, and **Assembly cannot start until the order
lands**.

**The order goes in with the pitch**, automatically. It used to be a separate button on every
project, which was busywork: forgetting it never produced an interesting decision, only a stall
at Assembly that had to be unpicked. Pitching now spends the money there and then, so the pitch
screen states the cost and what it leaves you with — a pitch is a cash commitment, and the player
has to see that before committing. The manual Order button survives as a recovery path for the
one case that still matters: pitching something you cannot yet afford the parts for. Expediting
a slow delivery is unchanged and still a real decision.

This is what makes the catalog's electronics projects play differently from its mechanical ones:
a cyberdeck is print-light and spends three weeks waiting on an order, while a drone is
print-heavy and arrives in twelve days. The bottleneck moves.

## 3c. Starting, and the other spaces (§11)

**Difficulty is chosen at the start, and only ever changes the competition** — rival pace,
rival reputation, and how much cash you open with. Your own pipeline, hours and costs are
identical at every setting, so intuition and advice carry across. On top of it the rivals gain
a yearly ramp, so a long game keeps tightening instead of settling once you are ahead.

**The run starts with a name and a badge.** A start screen asks what the place is called and
which of eight badges it wears; nothing ticks until the doors open. The name and badge follow
you into the top bar and onto the leaderboard. Both arrive pre-filled with a suggestion — an
empty field under a dead **Open the doors** button is a poor first frame, and the field is
selected so typing replaces it. The title and the button update as you type, without a
re-render that would replace the input under the caret.

**A setting has to state its terms.** The three difficulty cards used to be stacked boxes of
different heights carrying flavour text only, so the one thing the choice actually changes for
the player — the opening cash — was invisible. They are now `.ui-option` cards in a three-column
grid (§11 primitives, uniform height, clamped blurb), each showing a three-bar pressure meter,
a tick when chosen so the selection is not carried by colour alone, and `₺x to start`. A
footnote says the rest out loud: difficulty moves the other spaces and nothing else.

**Five other hackerspaces are simulated** in `src/systems/RivalSystem.ts`, defined in
`src/utils/rivals.ts`. They are not running the real pipeline — they are a pace-setter — but
their shapes differ on purpose, so the leaderboard is not one ladder:

The five are **real hackerspaces**, used as a nod rather than a portrait. The numbers are pure
balance; the tone is affectionate on purpose. Blurbs should say what a space is actually known
for — these are living communities, and the earlier invented rivals carried jokes at their
expense that would not be fair aimed at a real one.

| Space | Shape |
|---|---|
| c-base | Famous and slow. Enormous reputation per build. |
| Noisebridge | Famous, radically open, permanently broke. |
| NYC Resistor | Small, influential, electronics-meets-craft. |
| Metalab | One of the originals. Steady and well regarded. |
| London Hackspace | Big crew, strong dues income. |
| Dallas Makerspace | The biggest crew of all, and the deepest pockets. |
| Xinchejian | Hardware, fast iteration, close to the supply chain. |
| HacDC | Radio, a ground station, and a class every week. |
| Konya Hackerspace | The peer down the road. Steady on every axis. |
| Tokyo HackerSpace | Community work. Good reputation, thin margins. |
| Garaj | Ships constantly, each one small. |

Their pace **compounds with their reputation**, as the player's does. Without that they grow
linearly while the player's roster snowballs, and by day 200 the table is a formality.

**A year is 90 days, and it ends with an awards night.** Four categories, judged on the year
just gone rather than all time, so a bad year costs you even when you are ahead overall:

- **Most Projects** · **Biggest Crew** · **Deepest Pockets** · **Space of the Year** (reputation
  earned that year, worth the most).

Winning pays reputation. Two tuning notes worth keeping:

- **Every category must be winnable.** Açık Atölye's crew is capped at 15 because a complete
  roster is you plus fourteen — so Biggest Crew is reachable, but only if you have hired
  everybody. It was capped at 40 first, which made one of the four awards decoration.
- `npm run era-pace [seeds]` prints the first awards night, the day each era arrives, and the
  final standings. Targets: an engaged player takes **one or two of four** on the first night
  (currently 15 of 32 across eight runs), finishes **first overall** by day 220 without
  finishing at twice the field (currently 1.50×, ranging 1.33-1.65), and no single rival wins
  two categories every time.
- **A category nobody else can win is as dead as one you cannot.** Space of the Year goes to
  the player in eight runs out of eight, and Biggest Crew does too once the roster fills, since
  it caps at you plus fifteen against Dallas's fifteen. The *count* is on target and year one
  is a real contest on the other two, but those two categories are currently decoration.
  Unresolved, and it predates the twelve-hour day rather than being caused by it.
- **Tune the awards from computed values, not by nudging.** Lowering whichever space happened
  to be winning Deepest Pockets simply handed it to the next one along, four times in a row.
  Work out every rival's day-90 balance from `startCash + 90 × cashPerDay + projects ×
  cashPerProject` and set the whole distribution at once.
- **The leaderboard is a table, not cards.** Cards with wrapping badges give you nothing to
  read down a column, and comparison is the entire purpose of that panel. It is a sortable
  table with tabular figures: one row per space, the four award-deciding columns marked with
  a ◆, and the current leader of every column picked out — so "who beats me to Deepest
  Pockets" is answerable at a glance. **Use a table whenever the job is comparison; use cards
  only when each item is read on its own.**

- **`project-times` alone cannot tune the campaign.** It measures best case — a full roster —
  where the eight-worker cap binds, so it hides anything that changes how many *people* are
  available. Moving to contracted hours took ~30% off best-case durations but made the campaign
  *slower*, because weekends cost members two days in seven and a partial roster never reaches
  the cap. Tuning work up 25% on the best-case reading pushed the campaign further backwards.
  Always check `era-pace` as well before trusting a change to labour supply.

- **The economy fixed the plateau, which no coefficient could.** The player's output used to
  flatten (roster caps at fifteen, one printer, eight per stage) while linear rivals kept
  accumulating, so a long run ended mid-table however the numbers were pushed. Membership dues
  scaling with reputation gave the player a compounding line the rivals do not have, and the
  standings went from 9th-12th to **1st in every seed** without touching a rival multiplier.
  Worth remembering: when both ends of a balance fight each other, the answer is usually a
  missing system rather than a better multiplier.

- **Rivals carry no overheads, so adding costs to the player moves the whole balance.** Rent and
  wages landed on the player alone, and the first awards night fell from 10 of 32 to 0. The rival
  curve had to come down about 30% to compensate. Any future cost added to the player needs the
  same check.

- **Doubling the owner's day fixed the pacing and broke the table.** Going from seven hours to
  twelve nearly doubled the player's personal output, and era pacing — which had quietly drifted
  to Era 3 around day 135 — landed back on its documented day 80-110. The cost was at the far
  end: the player finished at three times the field. The fix was *not* a blanket rival buff,
  which would have made the first awards night a walkover; it was giving the rivals the
  compounding the design doc already claimed they had (`paceGrowth` was 100000, i.e. linear).
  Compounding bites late, so it closed the day-220 gap from 2.97× to 1.50× and left the opening
  alone. **A change to labour supply moves the back half hardest; look there first.**

- **A harness bug looks exactly like a balance problem.** Two of them in one session, both
  found only because a single seed disagreed with the other seven. First, the autoplayer sank
  its opening cash into bills of materials for projects it had nobody to crew and then could
  never afford to hire — one member for 116 days. Second, once pitching was gated on being able
  to fund the parts, an unaffordable offer at the head of the backlog stopped the autoplayer
  falling through to the catalog at all: ten idle people and ₺7,000 in the bank for forty-five
  days. Both read as the economy being brutal. **When one seed is half the others, suspect the
  autoplayer before the balance** — and trace the day-by-day state rather than tuning.

- **Over-hiring is what the wage bill is for.** Six of six harness runs were evicted while the
  autoplayer hired whenever it could afford the induction fee. Teaching it to hire only when the
  month still clears afterwards took survival to six of six with a full roster of fifteen — the
  economy was fair, the player was not. Check which it is before softening a cost.

- **Reset every field between harness runs.** `era-pace` left `ceremony` set from the previous
  seed, so runs 2 onward captured the leftover ceremony on day 1 and reported a leaderboard of
  starting values. Three rounds of "tuning" were done against that before the `[captured day N]`
  line exposed it. If a harness resets the store, it resets *all* of it.

## 4b. Genres (`src/utils/categories.ts`)

Projects have a **category**, the way games have genres — and here the genre is mechanical as
well as cosmetic. A `CategoryProfile` carries the icon and accent colour, *and* renames stages,
overrides which skill each stage leans on, and moves where in the space the work happens.

| Genre | Character |
|---|---|
| 💻 **Software** | No parts, no print queue — and it is what actually pays |
| 🔌 **Electronics** | Boards, power and solder |
| 🌐 **IoT** | Small connected things that must never need rebooting |
| 📡 **Radio** | Antennas, range tests, arguing about SWR |
| 🦾 **Robotics** | Motion, control, and respect for the emergency stop |
| ⚙️ **Mechanical** | Frames, motion, things that take a load |
| 🕹️ **Retro** | Old silicon, warm glow, unreasonable effort |
| 🍕 **Home** | Things for the space itself and the people in it |
| 🛠️ **Tooling** | Build the machine that builds the machines |
| 🤝 **Civic** | Low pay, heavy documentation, the neighbourhood remembers |

**Software is the load-bearing genre.** It has no bill of materials, no printed parts and no
machine queue, so it runs beside a print-heavy build without contending for anything. It pays far
better than hardware (a B2B Portal is ₺28,000 against an FPV drone's ₺3,000) and earns far less
hype (140 against 430). Since eras advance on reputation, **software pays the bills and hardware
builds the name** — you cannot grind client work to Era 3. That tension is the point, and it also
softened a real failure mode: a player who over-spent on bounties used to die because they could
not afford the next bill of materials, and software work is now the way out.

Stage renaming is what makes a genre feel like itself: a software build runs
`Spec → Architecture → Prototype → Build Pipeline → Implementation → QA → Bugfix → Launch`,
at a desk, on the `software` skill. **Always resolve stages through `stageLabel` / `stageSkill` /
`stageStation`,** never by reading `STAGE_MAP` or `STAGE_STATION` directly.

### Rating people against a genre

`categoryAffinity()` scores a member against a whole genre rather than a single tag, and this is
what the crew picker ranks by and what the People panel shows as each person's specialism.

Category tags are **ordered and weighted** (1.0 / 0.75 / 0.6). Categories share tags, and an
unweighted max made every machinist read as a roboticist purely because Robotics also touches
`machining`. If you add a category, put its most defining tag first.

### The catalog (`src/utils/catalog.ts`)

Thirty projects across ten genres, gated by era and by what the space owns:

- **software** — Space Website, Tool Booking System, Basic CMS, Member Portal & Door Access,
  B2B Portal, Social Media System
- **electronics / IoT / radio / retro** — Macropad, LED Badge, Bench PSU, E-ink Dashboard,
  Nixie Clock, Cyberdeck, LoRaWAN Gateway, Home Assistant Hub, SDR Ground Station
- **mechanical** — FPV Drone, Pizza Oven, Robot Arm, E-bike Conversion, and the
  **3D-Printed Motorcycle** as the Era 3 capstone
- **tools that upgrade the space** — Reflow Oven (unlocks SMD, cutting electronics assembly work
  by a quarter) and CNC Router (unlocks the CNC, which in turn unlocks the e-bike and the
  motorcycle). Building a tool is cheaper than buying one and ties up the space for weeks.
- **civic** — Air Quality Node, Repair Café Rig, Neighbourhood Mesh, City Air Quality Network.
  Low payout, heavy documentation stages, high reputation. These are what grants will key off in
  Phase 3.

A project's `work` map overrides the default per-stage effort, so a civic project can have a
punishing Release stage and a cyberdeck a punishing Assembly stage without new machinery.

## 4a. Where projects come from (the backlog)

The player chooses what to build. Offers arrive from four sources and the choice between a safe
catalog pick and a timed opportunity is the decision:

| Source | What it carries |
|---|---|
| **Catalog** | Anything the era and the machines allow. Always available, no bonus. |
| **Member proposal** | Somebody suggests a thing they are already excited about and signs up the moment you pitch it. Solves the attendance problem for free. |
| **Sponsor** | Cash up front, a deadline on the offer, and you are building *their* thing. |
| **Trending** | Reddit is briefly obsessed; ship inside the window for a hype multiplier. Phase 2 will consume this. |

Offers expire. Concurrent project slots come from the era (§8): **one** in Era 1, three in Era 2.
Era 1 being a single slot is deliberate — learn the pipeline before juggling.

## 5. Machines & the Job Queue — the signature system

Fabrication does not consume "worker hours". It emits **jobs** onto **machines**:

```
Job { id, projectId, partName, machineType, hoursRequired, material, materialCost,
      progress, failureChance, operatorId? }
```

- A machine processes one job at a time. Queues are FIFO with player reordering.
- Jobs run on the **sim clock, not attendance** — a 22-hour print runs overnight while the space is
  empty. This is what makes the hackerspace feel physical.
- **Failure:** rolled continuously, not at the end. A print that fails at hour 19 of 22 loses the
  material and all the time. Failure chance drops with machine tier, operator skill, calibration
  state, and material quality.
- **Consumables:** filament/resin/stock material deplete. Running out mid-job fails the job.
- **Maintenance:** machines drift out of calibration with use; an uncalibrated printer's failure
  chance climbs. Nobody volunteers to calibrate (that's a bounty).

Machine types: FDM printer · resin printer · laser cutter · CNC router · mill/lathe · soldering
bench · welding bay · electronics bench · assembly table.

## 6. Reddit & Hype

Subreddits are the publisher. Each has `audience`, `tasteTags`, and `skepticism`.

- The player **posts a WIP update** at a chosen stage. Reaction = f(project quality, stage
  interestingness, taste match, novelty, honesty of the claim).
- Good post → upvotes → **hype**. Hype is a spendable, decaying resource.
- Overclaiming or posting something derivative → the top comment is "this is just a remix of a
  Thingiverse model" → **negative hype and a reputation hit.**
- Hype converts into: crowdfunding backers, sponsor offers, membership applications, and the Era-3
  "front page of r/all" goal.
- Hype decays daily. Attention is a resource with a shelf life — this is the anti-drift clock.

## 7. Economy & Funding

Income is patchwork by design; there is no salary and no reliable single source.

| Source | Character |
|---|---|
| Member dues | Small, steady, scales with member count and mood |
| Workshops / events | Active income; costs member hours |
| Crowdfunding | Big, lumpy, and **creates a delivery obligation** — fail it and reputation burns |
| Sponsors | Filament/materials or cash for visible branding; needs hype |
| Grants | Application with a lead time; needs documentation quality |

Fixed costs: **rent** (monthly, by era), utilities (scales with machine runtime), consumables,
machine maintenance. Note there are no wages — that is the volunteer model's one gift to the player.

## 7a. The books — BUILT (`src/utils/economy.ts`)

A bill lands every **30 days**, three to an awards year, and it is a real profit and loss
rather than a demand:

| Income | |
|---|---|
| Work shipped | payouts and sponsor money, already banked as it arrived |
| Membership dues | the public paying to use the place |

| Costs | |
|---|---|
| Rent | monthly, by era |
| Wages | per contract, full-time or part-time |
| Power and consumables | metered on machine-hours actually run |

**Show the shipped work on the statement even though it is already banked.** Without it the
month reads as "dues against rent" and looks like a disaster every single time, which is both
wrong and demoralising. Only dues minus costs moves cash at the bill; the bottom line is the
true month.

**Dues are meant to carry the rent.** That makes the loop **ship → reputation → membership →
the rent looks after itself**, and it is why the first two months are thin: no name yet, so
nobody is paying to be there. It also turned out to fix something else — see §13.

Miss a bill and you get a warning; miss two in a row and you are evicted and the run is over,
with a post-mortem of what you shipped, who was on the books and the one people remember.

**Letting somebody go** is the lever that answers a bill you cannot pay, and it is in the
People panel next to the contract they are on.

## 8. Eras (progression)

| Era | Space | Unlocks | Milestone goal |
|---|---|---|---|
| 1 — Garage | 6×8, single-phase power | FDM printer, soldering bench, hand tools | Ship any project + 50 backers |
| 2 — Unit 4B | ~15×12, 3-phase | CNC, laser cutter, welding bay, certifications | 20 members + break even for 3 months |
| 3 — The Warehouse | large, multi-room | Mill/lathe, motorcycle-scale projects, grants | Front page of r/all |

Each era raises rent and unlocks project scale. Eras gate content and pacing; the milestone is a
checkpoint, not an instant transition — the player chooses when to sign the next lease.

**Implemented so far:** eras gate the catalog and advance on **cumulative reputation** (1800,
then 6000) — the sum of the hype of everything shipped.
Reputation rather than a project count, because three weekend builds otherwise unlocked Era 2 by
day six; ambition should advance you and volume should barely move the needle. The thresholds
were rescaled when the slot cap came off — throughput roughly quadrupled. `npm run era-pace`
measures it: Era 2 lands around day 33-59 and Era 3 around day 87-121. The space itself grows in Phase 4, and the real milestones — member count,
break-even, front page — arrive with Phases 3 and 5.

## 9. Failure (selected: real, hard failure)

- **Rent** is due monthly. Miss it twice → **eviction → run over.**
- A **failed crowdfunding delivery** permanently burns reputation (applicant pool shrinks, sub
  skepticism rises, sponsors walk).
- A **serious safety incident** (uncertified member + dangerous machine) can force a shutdown period.
- Death spiral is possible and intended. The run-over screen should read as a post-mortem: projects
  shipped, members who passed through, what killed you.

## 10. Space & Building

Isometric grid, tile-based. The player paints rooms, places machines and furniture, and routes
members between them. Adjacency matters: a Mentor's room bonus, noise from the CNC lowering
concentration in the CAD corner, the lounge/coffee restoring energy, extraction/ventilation required
for resin and welding. Power capacity is an era-gated constraint — running the CNC and the kiln at
once trips the breaker.

Movement: grid pathfinding (BFS is sufficient at these sizes; A* only if profiling demands it).

## 11. Technical Approach

- **Engine:** Three.js. Orthographic isometric camera with pan/zoom; no character control.
- **Stack:** TypeScript, Vite, Zustand (vanilla store). Matches the sibling project
  `etliekmek-tycoon` deliberately.
- **Art:** clean low-poly, flat-shaded, no textures. Procedural geometry first; glTF assets later
  only where silhouette demands it. Readability over fidelity — a machine's state (idle / running /
  failed / needs calibration) must be legible at a glance from the iso camera.
- **UI:** HTML/CSS overlay panels. The 3D scene is observational, but it is pickable: a
  raycast per frame lights the floor bay under whichever station the cursor is over and shows
  its name and what it is for. Stations sit in two working walls with a clear aisle — furniture
  scattered over an open floor reads as clutter, a room reads as a workshop when the benches
  line up.
- **The build menu is the spine of the UI.** Jobs, Projects, Ranking, Machines, People. A panel
  belongs here rather than in a permanent sidebar whenever you only touch it a few times a day.
  The clock sits alone in the top-left because it is the one thing glanced at constantly and it
  changes every frame; cash is coloured by state, not merely printed.
- **Design system (`styles.css` + `src/ui/icons.ts`)** — shadcn-shaped, and not optional:
  - **Tokens first.** `--background / --card / --muted / --muted-foreground / --border /
    --primary / --destructive / --radius` and friends live in `:root`. **Never write a raw hex
    at a call site.** A genre's accent colour is the one exception and it arrives as an inline
    `--tone` / `--cat` custom property.
  - **Primitives before markup.** `.ui-btn` (primary / outline / ghost, sm / lg / block),
    `.ui-badge` (outline / accent / tone), `.ui-card`, `.ui-option`, `.ui-row`, `.ui-toggle`,
    `.ui-label`, `.ui-title`, `.ui-desc`, `.ui-sep`, `.icon-chip`. Compose these rather than
    styling a new element; two panels written weeks apart should still look like one product.
  - **Surfaces are neutral, colour is rare.** Genre colour appears on a 32px icon chip and a
    badge tint — never as a fat coloured border or a saturated background.
  - **Line icons, never emoji.** `icon(name)` returns a 24×24 lucide-style SVG on
    `currentColor`. Emoji render at whatever size and weight the platform feels like, which is
    precisely why a set of them never looks designed. Check any new glyph at 11px — the first
    hand icon was an unreadable smudge at badge size and had to go.
  - **Uniform rows and cards.** Fixed icon-chip size, a two-line clamp on descriptions, counts
    as inline badges on the title row. Cards that vary in height are the single loudest sign
    that a screen was assembled rather than designed.
- **Time:** 1 sim-hour = 2.5 real seconds at 1×. A day = 60 s at 1×. Speeds: pause / 1× / 2× / 4×.
  Machine jobs advance on sim time regardless of member attendance.
- **Architecture rule (inherited from `etliekmek-tycoon`, keep it):**
  management data (cash, roster, machines owned, upgrades, hype, era) lives in the **store**;
  sim-time data (member positions, machine job progress, project stage work) lives in the
  **Simulation**. The sim writes a `runtime` snapshot to the store at 5 Hz; **UI only ever reads the
  store.** Never let a panel reach into the Simulation directly.
- **Saving (`src/systems/SaveGame.ts`)** — one `localStorage` slot, autosaved on every day
  rollover and again on `beforeunload`. The store hands over a `snapshot()` of its own fields
  (never `runtime`, which the sim rebuilds on the next publish); the Simulation hands over
  runtime state only, and entities are rebuilt from the roster data by id so skills and
  passions are never duplicated into the file. Two things are easy to forget and both break a
  load: **stations installed by tool projects** live in a module-level list and have to be put
  back before anything looks one up, and **day plans** are recomputed rather than saved so they
  cannot drift. Bump `SAVE_VERSION` on any shape change — an old file is discarded rather than
  half-loaded, because a save that loads into a broken game is worse than no save.
- **Sim purity:** the Simulation must not import `three` and must not touch the DOM. It should be
  runnable headless — this is what makes balance testable.
- **Debugging:** `window.__store.getState()` in the console.
- **Saving:** `localStorage`, key `hackerspace-tycoon-save-v1`.

## 12. Core Data Models

```ts
Member     { id, name, skills, passions, energy, mood, commitment, traits }
Assignment { projectId, stage }              // a member's claim on one stage of one project
Player     { hoursToday, hoursLeft, energy, task: Assignment|null, skills }
ProjectDef { id, name, category, tags, era, work{}, parts[], bomCost, leadDays,
             requires[], unlocksMachine?, hype, payout }      // content
ProjectData{ id, defId, stage, progress{}, required{}, quality, parts[], defects[],
             bounties[], partsOrdered, partsArriveAt, sponsorCash, hypeMultiplier }  // state
BacklogEntry { id, defId, source: 'catalog'|'member'|'sponsor'|'trending',
               proposerId?, sponsorCash?, hypeMultiplier?, expiresOnDay? }
Part       { id, name, machineType, hours, material, status: 'pending'|'queued'|'done'|'failed' }
Machine    { id, type, calibration, currentJob?, queue[], consumable, starved }
Job        { id, projectId, partId, partName, hoursRequired, progress, material }
Post       { id, projectId, subreddit, stage, claim, upvotes, comments[], hypeDelta }   // Phase 2
Campaign   { id, projectId, goal, raised, backers, deadline, delivered }                // Phase 2
Space      { era, tiles[][], rooms[], powerCapacity, rent }                             // Phase 4
Policy     { id, name, moodDelta, efficiencyDelta, active }                             // Phase 5
```

Note the ProjectDef / ProjectData split: definitions are content in `catalog.ts`, instances are
state in the Simulation. Never put balance numbers in ProjectData.

## 13. Open Questions (resolve during development, numbers in `constants.ts`)

1. Passion-match → self-assign probability curve. How dead is a "dead" pitch?
2. Commitment (hours/week) → effective work rate conversion.
3. Failure-chance formula weights: machine tier vs operator skill vs calibration vs material.
4. Hype decay rate and the hype → backers conversion curve.
5. Reddit reaction formula, especially the honesty/overclaim penalty.
6. Test-stage failure probability as a function of skipped Simulation.
7. Dues / workshop / sponsor income magnitudes relative to rent per era.
8. Bounty pricing — what does it cost to make someone do the documentation?
9. Does the player character exist on the grid at all, or is the player purely disembodied?
10. Mood → commitment feedback loop stability (risk: runaway death spiral or runaway utopia).

### Settled by the Phase 1 balance runs (`npm run sim-check`)

**Every player verb must move attendance, or it does nothing.** The binding constraint on
a volunteer hackerspace is not interest, skill, or money — it is *whether anyone is in the
building*. Members are present for roughly 11% of their roster hours. A verb that only
affects somebody already present is worth almost nothing.

Measured: before bounties affected attendance, an aggressive player who spent the entire
budget finished 1 day faster than a player who did nothing at all (35 vs 36 days, ~3%).
The game played itself. Once a live bounty raised both show-up chance (×1.75) and length
of stay (×1.45), the same spread became:

| Player | Days | Cash left |
|---|---|---|
| Aggressive (bounty every stage, instant re-queue, constant re-pitch) | 20.0 | 536 |
| Attentive (re-queues failures, bounties a visible stall) | 33.0 | 3370 |
| Hands-off (only buys filament) | 35.9 | 4000 |

Apply this test to every verb added in later phases: **events, policies and tool purchases
must be checked against attendance, not against interest.**

**Never rebuild a panel that has not changed — it kills clicks outright.** `setClock` runs
every frame, so `store.subscribe` fired at 60 Hz and every panel's `innerHTML` was reassigned
sixty times a second. A browser only fires `click` when press *and* release land on the same
element, so the element under the cursor was destroyed mid-click and **every button in the game
went dead the moment you unpaused**. Two defences, both kept:

1. `UI.setHTML(el, key, html)` writes only when the markup actually differs, and the clock is a
   `textContent` update so it never touches the speed buttons' DOM.
2. The delegated handler listens on `pointerdown`, not `click`, so it acts on press and cannot
   be cancelled by a re-render at all.

**This bug shipped twice because `element.click()` cannot catch it.** That dispatches a click
event directly and skips the press/release pairing entirely — the exact thing that was broken.
`npm run click-check` now drives the real UI with `Input.dispatchMouseEvent` press/release pairs
and counts DOM rebuilds; with the caching removed it reports 48 rebuilds in 1.2s and fails.
**Any UI check must use real pointer events, and any new assertion must be seen to fail.**

**A repeated log line means a condition, not an event.** "The parts for Cyberdeck haven't
arrived yet" fired on every rejected action and buried the log. `pushLog` now collapses
consecutive identical messages into one line with a `×N` counter. Any new log call that can fire
from a persistent state needs this, and it is now free.

**The shelf, not a cap.** With no limit on concurrent projects, the balance runs showed a player
could pitch the entire catalog: twenty-seven projects open, every one of them crewless, all the
cash sunk into bills of materials, and the printer starved. The answer was not to put the cap
back. A project nobody has touched for fourteen days is **quietly shelved**, and whatever you
already spent on its parts is gone. It punishes over-pitching without ever refusing a pitch, and
it is exactly what a real hackerspace's shelf looks like. A project counts as alive if it has
crew, has you, *or* has parts on a machine — jobs running on the clock are the whole point of §5.

**A gate the player cannot act on reads as a bug, not as pacing.** Era 1 originally allowed one
concurrent project, so the whole backlog sat there with every Pitch button greyed out for the
length of a build. It rendered correctly and was still, in effect, broken. Two fixes, both of
which improved the design: slots became generous so that *people* are the constraint (§3b), and
weekend builds gave the player something that fits in the gaps. Before gating anything behind a
cap, check there is something the player can still do.

**Snapshots must be pushed on every action, not only on the clock.** The sim publishes its
runtime snapshot at 5 Hz from inside `tick()`. Three separate bugs came from that single
assumption: the shipped state never reached the UI (tick returns early once shipped), every
pitch button was disabled at game start (no snapshot had been published yet, so the UI read the
player's hours as zero), and actions taken while paused did not appear until the clock moved.
`Simulation.publish()` is public and `Game` wraps every UI handler in it. Keep that.

Two further findings, both now fixed and worth not re-introducing:

- **Walking is a time sink.** At a plausible-looking walk speed, volunteers spent 80% of
  their visit walking and 18% working, which tripled project length. `npm run time-budget`
  exists to catch this class of bug; keep walking under ~20% of present time.
- **Manual re-queue can soft-lock fabrication.** A failed part drops to `pending` and, if
  the player never notices, nothing ever restarts it. A present member now re-queues after
  12 accumulated hours of presence. The timer must accumulate *across visits* — requiring
  continuous presence means it never elapses, because volunteers come in 2-3 hour bursts.
- **A starved machine must idle, not churn.** With an empty spool, every job failed instantly
  and was re-queued, producing 361 failed prints in one run instead of one idle printer.
  `Machine.starved` blocks job *start*; running out mid-job still fails the print, as it should.

## 14. Development Priority

**Phase 1.12 — The scene: identity, rivals and awards — BUILT.**
A start screen that names and badges the space (§3c), five simulated rival hackerspaces whose
pace compounds like yours, a season timeline in the top bar, a Ranking panel, and a yearly awards
night across four categories. `npm run era-pace` now reports the final standings too.

**Phase 1.11 — Design system — BUILT.**
A shadcn-shaped token layer and component primitives (§11), a lucide-style line-icon set, and the
Jobs wizard rebuilt on top of both. Genre colour is now a tint on an icon chip rather than ten
competing borders.

**Phase 1.10 — The Jobs menu, and no cap on projects — BUILT.**
Concurrent projects are unlimited; people are the constraint, one project each. The backlog moved
out of a tab and into a **Jobs** wizard on a bottom build menu: genre → size → project → crew
(§4c). Unattended projects get shelved after a fortnight instead of piling up. Era thresholds
rescaled for the higher throughput.

**Phase 1.9 — Input reliability — BUILT.**
Every button in the game was dead while the clock ran; see §13. Panels keep their DOM unless the
markup changed, input is handled on press, and `npm run click-check` guards it. The player now
stays on a project across stage changes.

**Phase 1.8 — Genres and software projects — BUILT.**
Ten categories that drive look *and* mechanics: stage names, stage skills, stage stations (§4b).
Six software projects with no parts and no print queue, paying well and hyping badly. The catalog
is grouped by genre on the pitch screen, and people are rated by genre rather than by raw tag.

**Phase 1.7 — Length tiers and crew-at-pitch — BUILT.**
Every project declares a length tier and `npm run project-times` enforces it; lead times were the
real driver of project length and were cut hard. Crews are picked on the pitch screen. Six starting
members instead of three.

**Phase 1.6 — Teams, weekend builds and a growing roster — BUILT.**
Projects have team sizes and you allocate members to them, with the right to refuse (§3b). Six
one-to-two person weekend builds sit under the big projects so the backlog is never inert. Twelve
named applicants join as shipped projects match their passions. Eras advance on reputation.

**Phase 1.5 — The player, and projects as a choice — BUILT.**
You exist on the grid with a daily hour budget shared between building and managing (§3a).
Projects come from an 18-entry catalog rather than being hardcoded, arriving through a backlog of
catalog picks, member proposals, sponsor offers and trends (§4a). Bills of materials and lead
times gate Assembly. The Simulation runs several projects at once, contending for the same
machines; eras grant the slots. Tool projects install real machines into the space.

**Phase 1 — Vertical slice: "One project, end to end." — BUILT.**
Fixed 6×8 garage, 3 volunteers, 1 FDM printer + benches, the FPV Drone run from Concept to
Release. No building, no Reddit, no hiring, no rent. Implemented: the eight-stage pipeline,
the machine job queue with continuous failure rolls and consumables, volunteer attendance,
self-assignment, drift with burnout cooldowns, the Perfectionist / Ghost / Night Owl traits,
and the verbs Re-pitch / Bounty / Skip simulation / queue management / buy filament.
A playthrough runs 20-36 days depending on how hard the player pushes (§13).
**Still open, and only a human can answer it: is the loop fun?**

Phase 2 — Reddit + hype + crowdfunding (the novel layer, on top of a real project).
**Phase 3 — Economy — BUILT.** Dues, rent, wages, metered consumables, the monthly statement
and eviction (§7a).
Phase 4 — Space builder: tile painting, machine placement, rooms, power, adjacency.
Phase 5 — Recruitment: events, policies, mood/commitment loop. *(The applicant pool is built:
twelve named people join when a shipped project matches their passions — see §5.)*
Phase 6 — Eras 1→3, milestones, lease decisions.
Phase 7 — Project variety through the motorcycle capstone; certifications, safety, maintenance.
Phase 8 — Save/load, run-over post-mortem, balance pass, audio, polish.

## 15. Repo & Code Layout

- This directory is the git root. Working branch: `development`.
- Commands: `npm run dev` (http://localhost:5174), `npm run build` (tsc + vite build),
  `npm run typecheck`.
- **Balance harnesses** (these are the reason the sim stays free of `three` and the DOM):
  - `npm run sim-check` — replays full playthroughs under three player archetypes and fails
    if any run cannot ship. Run it after touching anything in `constants.ts` or the sim.
  - `npm run time-budget` — person-hour breakdown (working / walking / idle / resting) and
    elapsed days per stage. Use it whenever a stage feels the wrong length.
  - `npm run project-times` — best-case length of every catalog entry against its declared
    tier. Run it after any change to `catalog.ts`; `TOO LONG` is a failure, not an opinion.
  - `npm run era-pace` — what day each era arrives for a committed player, plus the final
    standings against the five rival spaces. Run it after changing throughput, team sizes,
    the catalog, or anything in `rivals.ts`.
  - `npm run click-check` — needs `npm run dev` running. Drives the real UI with real mouse
    press/release pairs while the sim runs, and counts DOM rebuilds. Run it after touching
    anything in `src/ui/`.
  - Harness sources live in `tools/`, built via `vite.headless.config.ts` to `dist-headless/`.
- Debugging in the browser: `window.__store.getState()` and `window.__game.sim`.
- Layout:
  - `src/game/` — `Game.ts` (orchestrator), `types.ts`, `store.ts`
  - `src/entities/` — `MemberEntity.ts` (state machine: idle → walk → work → idle),
    `PlayerEntity.ts` (you, plus the hour budget)
  - `src/machines/` — `Machine.ts` (queue + job execution), `layout.ts` (grid placement)
  - `src/systems/` — `Simulation.ts`, `ProjectSystem.ts`, later `HypeSystem.ts`
  - `src/render/` — `SceneManager.ts`, `SpaceView.ts`
  - `src/ui/` — panels, modals, `styles.css`
  - `src/utils/` — `constants.ts` (**all balance numbers**), `catalog.ts` (**all project
    content**), `grid.ts`, `rng.ts`, `format.ts`
- Balance: every coefficient from §13 starts life in `src/utils/constants.ts`. Never inline a
  tuning number at a call site.
