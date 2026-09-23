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
its floor space. **Everybody is full-time** — 8h a day, 40h a week (`WEEKLY_HOURS`).

There used to be a part-time contract (mornings or afternoons, half the hours, half the
induction fee), and thirteen applicants had a day job that allowed nothing else. It was taken
out because it made the kickoff (§4d) a scheduling puzzle rather than a decision: a morning
crew never met its afternoon half, so the wizard had to warn about shift clashes, the Project
Manager had to avoid them, and a whole rule (`canMeet`) existed to stop volunteers joining a
crew they could never sit down with. None of that was fun, and all of it is gone.

Hours come from the working day, not a dice roll. The only randomness left is whether somebody
turns up at all, which is where mood and the Ghost still live. **A bounty therefore buys overtime
rather than a better roll** — they stay past six. Keep that: §13's rule is that every verb has
to move hours in the building, and the only hours left to move are the ones past the end of
the day.

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

## 4c. + New Project — designing a build (`src/utils/design.ts`)

**The Jobs board is gone, and why is the whole section.** It handed the player a finished
recipe: every number behind a project — work, parts, money, risk, crew size — had already
been decided, so the only choice left was which name to click. The game had thought about
the project so the player did not have to. **+ New Project** replaces it at the head of the
build menu, and three of its five steps are decisions:

  **Genre → Brief → Crew → Design → Review**

**The crew comes before the design**, because the crew decides what the design may be. Every
axis leans on a skill (Tool, UI and Architecture on software; Circuit on electronics; Design
tool, Enclosure and Validation on CAD; Material on machining; Documentation on docs), and an
option needs somebody on the crew good enough to use it: ★ needs nobody, ★★★ a 2, ★★★★★ a
4 (`DESIGN.starSkill`). A locked option says what is missing — "needs software 4 on the crew
— train someone" — rather than simply greying out. Changing the crew drops any choice it can
no longer back to the best it can, and the sim checks the same thing at the pitch.

**Seat licences belong to the space, not to the project** (`Licences`, `licenceCost`). A
per-seat option — Full IDE, Fusion Pro — is bought once per seat and kept, so the next build
pays only for chairs nobody holds a licence for; the card says `licensed ×N` and the log
records each purchase. Licences used to be charged afresh on every project, which made the
five-star tool a tax on shipping rather than an investment. **Infrastructure is kept the same
way** (`DesignOption.keeps`), in every genre that has any:

| Kept | Genres | Once |
|---|---|---|
| Services + CI | software | ₺500 |
| Design system (a component library) | software | ₺600 |
| RTOS + OTA (the update server) | electronics, IoT, radio, retro, robotics, civic | ₺450 |
| Full simulation (a solver licence) | robotics, mechanical | ₺600 |

Every later build finds them "already in place". The rule for what is kept: **is it still
there after the project ships?** A component library, a CI pipeline, an update server and a
solver are; a workshop kit's Saturday workshop, a custom PCB run and an aluminium frame are
that build's own, and stay per project. RTOS + OTA and Full simulation had no one-off cost
before; giving them a kept one makes the first five-star build dearer and every one after
it cheaper, which is what an investment is.

**A design the space cannot pay for is not offered.** The design budget is paid at the pitch
and refused past the overdraft, and the wizard used to find that out only afterwards — a Start
button that looked like it worked, then a red log line about licences. An option whose budget
would take the space past −₺30,000 is now locked on its card with the reason, changing the
crew or the size drops choices to what can be afforded, and the review disables Start and says
why when even one star is out of reach. Same rule as the skill gate: the wizard only ever
offers what the pitch will accept.

**Every option has a price, and it moves with the stars** (`optionCost`): a design budget per
axis of `budgetBase + budgetShare × payout`, times 0.3 for ★, 1 for ★★★, 2.4 for ★★★★★,
plus a small multiplier on the bill of materials. One star is cheap, rough and pays less;
five stars is dear, good and pays more. Cost, quality and return all go the same way.

**Training is how a crew gets better** (`Simulation.train`, `TRAIN`). Buy a **Learning
Station** in Build, then press **Train** on somebody in People and pick a skill: one level
up, paid now (`500 × next level`), and hours at the station (`12 × next level`) during which
they are on nobody's crew. That absence is the real price, and it is what makes a five-star
IDE an investment rather than a checkbox. Skills live on the member now (saved, copied per
run — the roster data is a module constant, and sharing its `skills` object would carry one
run's training into the next).

- **Genre** — the ten genres as tiles, each with how many briefs it offers and **what the
  market is paying for it this week** (§4d), plus an **Offers** row for proposals, sponsors
  and trends.
- **Brief** — the catalogue entry: what somebody wants built, the crew size it was
  *scoped for*, and its price before quality and the market. The catalogue is still the
  content (§4b); it is no longer the plan.
- **Design** — three decisions per genre, each a ★ / ★★★ / ★★★★★ option. Software asks
  *Tool* (Notepad / VS Code / Full IDE), *UI Design* (Template / Custom / Design system) and
  *Architecture* (One big script / Framework / Services + CI); hardware genres draw from
  Circuit, Firmware, Enclosure, Design tool, Material, Validation and Documentation
  (`CATEGORY_AXES`). Every card spells out what it changes — quality, market appeal, work,
  test risk, parts, printing, delivery, licence cost — and turns red where it costs you.
- **Crew** — the size, from **1 / 2 / 3 / 4 / 5 / 10**, and who is asked. Size is capped by
  the biggest table the space owns: five and ten need the Large Project Table.
- **Review** — the plan worked out: forecast quality in stars, market demand, likely pay
  and reputation, hand work, machine time, parts, licences, test risk, and which table it
  will kick off at. The Start button states the cost and what it leaves you with.

**Three stars is the brief as written.** Every three-star option is ×1 on everything, so a
player who takes the defaults is playing the game as it was balanced, and every harness and
the Project Manager do exactly that (`defaultPlan`). One star is quicker or cheaper and it
shows; five stars is dearer or slower and it shows the other way. **No option is a free
upgrade** — §13's rule for the claim system: a reward with no matching punishment is not a
choice.

**Crew size is the biggest single lever on quality** (`teamFit`). Under the size a brief was
scoped for, the plan is thin; up to twice it, more eyes make it better; past that it is too
many cooks. It is applied at the end of the kickoff *from whoever actually sat down*, not
from the seats the pitch asked for. Speed is left to the existing crowd curve (§3b), and the
other cost of a big crew is physical: **the whole crew has to be at the table at once**
(§4d), which gets less likely with every chair.

**`planProject` is the single source of truth.** The wizard previews with it and
`startProject` builds from it, so what the review screen promised is what the build carries.
Never compute a plan's numbers anywhere else.

Carried over from the Jobs wizard, because they were right: **it is a fixed box** (780×700
now — three option cards a row with their effects do not fit in 680), `npm run click-check`
asserts the size is identical on every step; **completed breadcrumbs navigate**; the crew
step **arrives already picked** with the best matches, a proposer is locked in, and **a crew
the player has touched is never re-suggested over**.

**The size meter is the size picker.** Crew size used to be a segmented control in the
corner with a coloured meter under it saying how each size would go — and the meter looked
like the thing to press, so people pressed it and nothing happened. The meter's six cells
are now the buttons, coloured by what each size does to quality, with the verdict ("3
people · crowded") under them. One control, where the eye already was.

**Each person shows the stars they unlock** (`genreStars`). The design step gates its better
options on the crew's skills, so the crew step says, per person, what they would open up on
each of the genre's three decisions — three small tiles (1 / 3 / 5) and their average as a
star row, with the axis-by-axis breakdown in the tooltip. Somebody just back from a course
shows it here first.

## 4d. Tables, workstations and the kickoff (`src/utils/furniture.ts`, `machines/layout.ts`)

**Every project starts at a project table.** The first stage — Concept, now **Kickoff** in
every genre — only progresses while **every crew member is sitting at the table at the same
time**; each person's share of the meeting shows as a gold bar over their head. Once it is
done the table goes back and the crew works *individually* at workstations, each with a
teal bar showing their share of the stage against an even split.

**One person to a workstation.** Software Station (code, CAD, simulation, docs), Hardware
Station (electronics assembly), Assembly Table (mechanical assembly, seats two). Anybody
who wants a seat of a kind and finds every one taken stands about saying so, the Build bar
button counts them, and the Build panel says which kind. Before this, eight people did the
CAD at one desk. **The room is now a constraint**, and the floor — which grows with the
lease — is what limits how much of it you can buy.

| | Seats | Price |
|---|---|---|
| Small Project Table | 4 | 900 |
| Large Project Table (two tiles) | 10 | 4,800 |
| Software Station | 1 | 1,800 |
| Hardware Station | 1 | 2,400 |
| Assembly Table | 2 | 1,500 |

The garage opens with one small table, two software stations, one hardware station and an
assembly table.

**Five things that were wrong first, each worth not repeating:**

- **A table held from the pitch deadlocked the garage.** One crew that could never meet —
  a morning part-timer and an afternoon one, back when there were part-timers — kept the only table for the rest of the run
  while every project behind it waited. **A table is now booked only by a crew who are all
  in the building**, and the booking lapses the moment one leaves. Progress is pooled on
  the project, so giving the table up costs nothing.
- **A crew does not wait for ever** (`KICKOFF.missLimit`). On a working day when a kickoff
  went nowhere, anybody who was not in while most of the crew was gets a mark; two, and the
  log says *the crew went ahead without them*. It is the Ghost's answer, and it tells a
  story instead of stalling silently (§13's invisible-gate rule).
- **A ghost entry in a team list became a deadlock.** A member who proposed a project was
  signed onto it while still listed on their old team. Harmless while it only inflated a
  count; fatal once a kickoff needed everybody on the list to sit down. `addToTeam` now
  removes them from the old team, and a nightly sweep drops anybody a team lists who does
  not list it back.
- **The kickoff is a meeting, not a stage.** At the old Concept stage's size it took a day
  and a half, which was invisible when every project could hold its concept at once and was
  the bottleneck of the whole garage once they queued for one table. `DESIGN.kickoffScale`
  is 0.4, and a bigger crew adds `kickoffPerSeat` — more people, more to agree.
- **The derived comfort slots walled in the door.** Only a move by hand checked that every
  station stayed reachable, so the bottom row filled one comfort at a time until the door
  was sealed and every station in the room went quiet at once. Every prop is now laid down
  with the room still walkable, nothing is placed beside the door, tables keep a clear ring
  round them (their chairs are drawn there), and a floor item with no safe tile left is
  refused at the till rather than paid for and never shown. Reachability is one flood fill
  from the door, not a path search per station — it runs for every candidate tile.

**You never size a kickoff.** The owner is never *required* at a kickoff, so a table is booked
for the crew alone (`tableNeed`), and if you are on the project and there is no chair left you
stand aside and the crew plans without you — with a line on the bench, the moment it happens,
naming the table that would seat you. Counting you on top broke every full table: four crew
and you is five, the garage table seats four, no table ever qualified and the meeting simply
never started; ten and you at the large table, the same. `kickoff-check` now puts the owner
on a full crew and was seen to fail with the old sizing.

**A seat is a drawing position, not a tile.** Ten people round a table would need a room the
garage does not have; the path finder walks everybody to the stand tile and the renderer
puts them in their chair (`seatPosition`), facing the table.

### The market (`src/utils/market.ts`)

One number per genre, around 1.0, that multiplies what a release pays. It wanders daily and
is pulled back toward normal, a trending offer warms its genre, and **every ship cools its
own genre** — the counterpart of `REPEAT` at the scale of a whole genre, and the reason
"more software" is not the answer to every month.

**What a release is worth is now four things**: the brief's price, the market, the design's
appeal, and the quality it actually reached (`qualityPay` / `qualityHype`). Payout used to
ignore quality entirely, which made every quality decision in the game cosmetic. The curve
is **centred on the build a default design produces** (about 0.45 in `era-pace`): centred on
0.5 at first, it paid the typical build 5% under the catalogue and quietly cost the campaign
a fifth of its reputation.

**A new random draw has to be reset by every harness.** The market is rolled when the store
module loads, from an RNG seeded by the clock. Harnesses reseed the RNG but did not reset the
market, so the same seed produced 46 ships in one process and 100 in the next. `begin()` and
every harness now roll it after the reseed. Before trusting a measurement, run the same seed
twice.

## 3a. You (the player character)

You are on the grid, you are always in the building, and you can work. That matters because
§13 established that **attendance is the binding constraint** — and you are the one person
whose attendance is guaranteed.

**The Project Manager went, and so did the Technician that briefly replaced it.** Levelling
beds and filling them are one job — the printers — so the Printer Keeper does both, and the
fourth slot is the **Host**, who brings people to the door without choosing who comes in.
Every role has to take a chore off the player without taking a decision.

**The owner never stands about.** With nothing chosen you put yourself on the oldest build
that has already kicked off — or, failing that, one with nobody on it — and when it ships you
move to the next, with a line in the log each time. **Stop** holds for the rest of the day and
no longer. This replaced the Project Manager, a keyholder who *started* projects when hands
were spare: what the space builds is the one decision that must always be the player's, and a
role that made it for them took away the game. Idle hands are different — nobody chooses
those. Never auto-join a kickoff that already has a crew: it was planned for its own chairs,
and one more at a full table is a meeting that never starts (`kickoff-check` caught exactly
that).

The counterweight is the hour budget, and **it is the only number you have**:

- **Your day is one resource.** Seventeen hours, flat, every day, spent on building and on
  managing alike. You are on the floor **06:00 to 23:00** — three hours before the crew's
  shift starts and five after it ends — and the span and the budget are deliberately the same
  seventeen hours. They were not: an eighteen-hour budget inside a seventeen-hour window
  could never be spent, so the bar never emptied and the remainder was thrown away at
  midnight. Nothing carries over and there is no hangover.
- **The bar draws the binding constraint, not the budget.** What you can still get done is
  the *lesser* of what is left in you and what is left of the day — drawing only the first
  gave a bar that sat nearly full at half ten at night with one usable hour in it.
- **Energy used to be a second resource pointed at the same thing**: you spent hours, which
  drained energy, which shrank tomorrow's hours. Two bars to answer one question, and the
  burnout threshold had been tuned so low that it almost never fired. It is gone. The bar
  under the clock *is* the day, and the hours are in its tooltip for anyone sizing up a job.
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

**Difficulty is chosen at the start, and what it changes is your crew** — how many people are
on the books on day one, how fast more get in touch, how hard the other spaces push, and how
much cash you open with. The *rules* never change: a stage costs the same work, a print takes
the same hours, a bill charges the same rent, so intuition and advice still carry across. On
top of it the rivals gain a yearly ramp, so a long game keeps tightening instead of settling.

| | Crew on day one | Somebody new | Rivals | Opening cash |
|---|---|---|---|---|
| **Easy** | 10 | every 10 days | x0.95 | 100,000 |
| **Normal** | 4 | every 30 days | x1.00 | 50,000 |
| **Hard** | 2 | every 40 days | x1.00 | 10,000 |

**Opening cash went up tenfold on easy and sevenfold on normal** (from 10,000 / 7,000 /
5,000). Measured, 8 seeds: normal first 8/8 at about 1.6× the field and 17 of 40 first-night
awards; hard first 5/8, worst sixth, 13 of 40; easy first 8/8 with 26 of 40 and nearly twice
the field — easy is now plainly easy, which is what it is for.

**People are the honest difficulty knob**, because §13 established that hands in the building
are the binding constraint. Measured over eight seeds each: easy ends with fifteen on the books
and finishes at 2.3x the field, normal eleven and 1.4x, hard seven and 1.12x — winning six
seeds in eight and never falling below third. That last line is the target shape for hard: you
usually win, you sometimes do not, and you are never buried.

**The rival multipliers flattened when the crew took over.** They used to run 0.7 / 1.0 / 1.3,
which was tuned when every setting handed you the same fifteen people. Stacked on top of a crew
handicap it made hard unwinnable — last place in every seed, three runs in eight evicted.
Hard's own multiplier is now the same as normal's, and the setting is carried by the crew, the
opening cash and the steeper yearly ramp. **Two handicaps on the same axis multiply; check the
shape of a run, not just its headline number.**

**A start-of-run headcount needs the ladder behind it.** The day-one crew is taken from the
*top* of the applicant ladder in reputation order, so an easy start is simply the people you
would have recruited first — not a different cast, and the remaining rungs still read in order.

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

**Seventeen other hackerspaces are simulated** in `src/systems/RivalSystem.ts`, defined in
`src/utils/rivals.ts`. They are not running the real pipeline — they are a pace-setter — but
their shapes differ on purpose, so the leaderboard is not one ladder. They come in three tiers.

Fourteen are **real hackerspaces**, used as a nod rather than a portrait. The numbers are pure
balance; the tone is affectionate on purpose. Blurbs should say what a space is actually known
for — these are living communities, and the earlier invented rivals carried jokes at their
expense that would not be fair aimed at a real one. **The three underdogs are invented**, and
are the only spaces allowed to look bad for exactly that reason.

| Tier | Space | Shape |
|---|---|---|
| Top five | **Konya Hackerspace** | The peer down the road and **the most productive rival**: most ships, most reputation. Takes Rising Star most years. |
| Top five | c-base | Famous and slow. Enormous reputation per build; the usual Best Project. |
| Top five | London Hackspace | Big crew, strong dues income. |
| Top five | Xinchejian | Hardware, fast iteration, close to the supply chain. |
| Top five | Tokyo HackerSpace | Community work. Good reputation, thin margins. |
| Pack | Noisebridge | Famous, radically open, permanently broke. Loud online. |
| Pack | NYC Resistor | Small, influential, electronics-meets-craft. |
| Pack | Metalab | One of the originals. Steady and well regarded. |
| Pack | Dallas Makerspace | The biggest crew of all. |
| Pack | HacDC | Radio, a ground station, and a class every week. |
| Pack | Garaj | Ships constantly, each one small. The usual Deepest Pockets. |
| Pack | İstanbul / Ankara Hackerspace, Makerspace İzmir | The rest of Turkey: mid-table, close enough to Konya that the rivalry reads. |
| Underdog | Ctrl+Alt+Defeat | Barely ships, posts everything. A Best Project outsider on a rare, enormous `standout`. |
| Underdog | Almost Works Labs | One moonshot a season, all-or-nothing (`standout` override). A Best Project outsider. |
| Underdog | Perpetual Beta | Sponsor money, nothing shipped. A Deepest Pockets outsider. |

**An underdog gets one award it can sneak, never a pace.** Each runs at about a third of
anybody else's reputation a day with a crew capped at five or six, so it sits at the foot of
the table in every seed (~2,000 reputation at day 220 against the pack's 7,000-10,000). What
makes it an underdog rather than filler is a single lever pointed at one category: loudness,
build variance, or a sponsor. Measured over eight seeds on normal / hard / easy, they take one
or two of the fifty-six first-night awards on normal and hard, and a few more on easy, where
Perpetual Beta takes Deepest Pockets five times in eight because the 0.95 rival pace slows
Garaj's project income down. **The per-rival `standout` spreads impact without raising its
average**, so it cannot leak into reputation.

**Which is exactly why a bigger `chance` lowers the ceiling it was meant to raise.**
`standoutNorm` divides by the *expected* multiplier to hold the average flat, so raising
`chance` and `boost` together cancels out and then some. Re-pointing Ctrl+Alt+Defeat at Best
Project with `0.3 / [3.5, 6]` capped their best build at 624 — **below the 765 they had with
no override at all**, and nowhere near the 1,200 the field reaches. What an underdog's one
award needs is the opposite shape: rare and enormous, `0.08 / [8, 12]`, which clears 1,500
about once a year. Work the ceiling out (`rep × 1.3 × boostHigh × norm`) before tuning it;
the seeds will not tell you, because a shot this rare barely shows up in eight of them.

**Konya was trimmed a touch** (ship pace 0.40 → 0.38, reputation per build 68 → 65; about
9% less reputation over a run). It is still the busiest space and still takes Most Projects;
it is no longer the wall at the top of the standings.

**Konya's pace carries its cash with it, so watch Deepest Pockets.** Raising Konya's ship rate
by 3.4x at its old ₺1,700 a project made it the richest space as well as the busiest, and it
took Deepest Pockets *and* Rising Star nearly every night. Per-project cash was cut to ₺350 to
keep its money where it was. Final standings after the tier pass: the player is first in 8 of 8 seeds on
every difficulty, at about 1.5x the top rival on normal and about 1.3x on hard, with Konya
usually second.

Their pace **compounds with their reputation**, as the player's does. Without that they grow
linearly while the player's roster snowballs, and by day 200 the table is a formality.

**The run keeps a date.** The space opens on **1 January 2026**; **a year is 100 days**,
spread over twelve months, and the **awards are held on day 90 of every year** — the first on
day 90 of the run, then day 190, 290. It was briefly 365 days with the night on 1 December,
which put the first awards night on day 335: a set piece almost nobody would ever play to.

**What the calendar changes left behind** (measured at 220 days, 8 seeds):

- **Rival compounding needed a knee.** Their pace grows with reputation, which was tuned over
  a 220-day horizon; run on to day 400 it overtook the player, whose own growth flattens once
  the roster is full, and a normal run finished 5th-6th. Past `RIVAL_GROWTH_KNEE` (14,000
  reputation, roughly where the field stood on day 220) a rival keeps its pace but stops
  accelerating. Everything before the knee is exactly as it was.
- **Biggest Crew is set against the crew a player has on awards night**, not against the
  full cast of twenty-five. Dallas caps at 17: an easy crew (18 by day 90) takes the first
  night, a normal one contests it from the second year once the roster has grown.
- Measured: normal first in 8/8 (about 1.05-1.4× the field), easy 8/8, hard 5/8 and at
  worst sixth; the player takes 15 of 40 first-night awards on normal and hard, 23 on easy.
  Deepest Pockets still always goes to Garaj on the first night — its identity, and the lock
  worth watching.
- **The rival knee stays** even at 100-day years: it only bites past 14,000 reputation and
  keeps a long run from being decided by compounding alone.

**A year ends with an awards night.** Five categories, judged on the year
just gone rather than all time, so a bad year costs you even when you are ahead overall:

- **Most Projects** (200) · **Biggest Crew** (140) · **Deepest Pockets** (100) · **Space of the
  Year** (320, reputation earned that year, worth the most) · **Best Project** (80, the single
  build that made the most noise).

**It was seven, and the two that went were the two that were not their own axis.** Each award
should measure something the others do not — volume, people, money, name, one great build —
and on that test *Rising Star* and *People's Choice* both failed. Rising Star was defined in
terms of another award (`notWinnerOf: 'Space of the Year'`): reputation growth, awarded to
whoever did not already win on reputation, which is a runner-up rosette rather than a category,
and it went to Konya in seven seeds of eight. People's Choice measured attention, which the
game already pays for downstream — hype becomes reputation, which is what Space of the Year
judges. Both were worth 80, the lowest purse on the night; **the original four carry
320/200/140/100 between them, and the three added later were all 80s.** Best Project is the
only 80 kept, because it is the one award that says what you actually *made* ("Nixie Clock ·
460 hype") rather than how much of it there was.

Measured after the cut, first night, `era-pace`: hard 1.5 awards a night, normal 2.0, easy
3.25, with the player first in every seed at about 1.6x the field. Two consequences worth
knowing:

- **A shorter night makes a lock louder.** The player takes Most Projects and Space of the Year
  in eight seeds of eight — true before the cut too, but it was two of seven and it is now two
  of five, so 40% of the night is decided before it starts. Those are early-game locks rather
  than permanent ones (rivals compound, and by year three Konya takes Most Projects), but if
  the first night is ever tuned again, that is the thing to aim at.
- **Cutting a category can strand an underdog**, because each invented one exists to sneak
  exactly one award. People's Choice was Ctrl+Alt+Defeat's, so they were re-pointed at Best
  Project — which is in character, since they post everything they build.

**The ceremony is a stage, and the wins go on a shelf.** Awards night is the only screen in
the run that exists purely to be enjoyed, so it is drawn as one: curtains, a lit floor, and a
trophy per category with the winner under it — yours picked out in gold, everybody else's in
the dark beside them. The **Trophy room** is a second view on the Ranking panel, and it keeps
the losses too. A trophy room with only wins in it is a brag; with the whole night in it, "we
came second to Dallas three years running" is part of the story.

**The ceremony is the celebration; the trophy room is the record — so it is a table.** That is
§11's comparison rule deciding its fourth screen. It was seven cards per year, and the shape was
the argument against itself: the same seven labels repeated down the panel, a hole where the
fourth card of the second row should have been (the ceremony's stage centres its wrapped row;
the shelf did not), and by the fourth year a wall of scrolling.

**Four screens off two switches, on one rule: by year organises by year, all time organises by
space.** The switch therefore means the same thing at either scope, which is what stops four
views being four screens to learn:

| | **By year** | **All time** |
|---|---|---|
| **All categories** | one night: every category, with a strip of years to page between | the league: one row per space, a column per category, sorted by trophies |
| **One category** | that category year by year, newest first | who owns it — each space, how many, and which years |

**A year is a page, not a column.** Every year on screen at once was a sideways scroll by the
fourth one, and it made the newest night — the one you opened the panel to see — no more
prominent than a night four years ago. The strip above the table is the whole run instead:
every year, how many of the seven you took in it, and one click to any of them. It opens on
the most recent, it runs oldest-to-newest because a timeline reads that way, and **it sits in
the control bar rather than on a row of its own** — four stacked rows of chrome above a
seven-row table did not fit the panel, and the strip *is* the scope when every category is on
screen.

**The league is the half a year-by-year view cannot do** — "who is the most decorated space in
the city" is not answerable by paging through nights. **The single category is the other half**:
one category's whole history is a handful of rows however long the run goes. You reach it by
clicking a category — its row label in the night, or its column head in the league, which is
also how an abbreviated head says what it means. The crumb is the way back.

Five details worth keeping:

- **You are on the league table with nothing on it.** A player who has never won anything is
  the one who most needs to see where they stand, so the row is added at zero rather than
  omitted.
- **`AwardDef` carries a `short`** because seven award names have to sit side by side as
  column heads — and the left-hand head is *Hackerspace*, not *Space*, since Space of the Year
  abbreviates to `SPACE` and two columns of that name is a table you have to decode.
- **Gold means yours, so no column may be all gold.** Every total was picked out at first,
  which is the §11 rule about a wall of green: the colour stops being a signal.

- **The category column is sticky, and it is one cell.** It holds the label *and* your tally,
  because two sticky columns need the first one's width hardcoded into the second one's
  `left`, and the moment those two disagree the years scroll through the gap between them.
- **A tab gets its own footer.** The Ranking footer explains that the standings are all-time
  and the awards are not — true, and nothing to do with the room you are looking at.
- **Gold is the signal and it is a token** (`--gold`, brighter than `--warning`, which is a
  state rather than a prize). A loss stays neutral, per §11: a wall of gold says as much as
  a wall of grey.

**Any space is a drill-in, from any row of any of those tables.** The tables answer "who is
ahead"; a space's own screen answers "who *are* they" — rank, reputation and shipped both all
time and this year, crew, cash, upvotes, growth, the build that made their year, and every
trophy they have ever taken off you. Everything on it was already in the store; the standings
simply had no column for most of it.

It is a drill-in rather than a fifth tab: **you arrive from a row and the crumb goes back to
the table you arrived from**, and Escape pops it before it closes the panel, per §11's rule
about unwinding one layer at a time. Two things it got right only on the second go: the
cabinet is **one line per trophy**, because nine two-line rows scrolled a panel that should
show a whole career at a glance; and switching tab or closing the panel clears the drill-in,
so the Ranking button never reopens onto somebody else's space.

**Where they finished, as a line — and the run had to start keeping the record first.** A
space's screen charts its finishing place per awards night, one point a year. The catch was
that **the standings are a live snapshot**: they only ever say where everybody is *now*, so
the day after a ceremony the year it judged is gone. A ceremony therefore stores `standings`
— the whole field in order, with each space's rank and reputation — because the awards night
is the one moment a year that is already a checkpoint. Four things worth keeping:

- **The axis runs the whole field, never just the range the line occupies.** Zoomed to its
  own range, a wobble between 11th and 12th becomes a cliff. The question is "are they
  pulling away from me", which is only honest against the size of the table.
- **First place is at the top**, the line wears the space's own colour, and **only the ends
  are labelled** — a number on every point is noise by the fifth year. The rest is on hover,
  along with the reputation behind each place.
- **One series, so there is no legend**; the heading above it names the space. Every figure
  on the chart is a text token — the colour is carried by the mark, not by the words.
- **A nested field a migration has to reach into is the one that arrives missing.** A
  ceremony without `standings` threw inside the chart and took *the whole panel* down — not
  the chart, the panel, because one render builds all of it. Save v8 fills it in for old
  nights (which cannot be reconstructed, so they keep none and the chart starts where the
  record does), and the chart reads `?? []` anyway.

Winning pays reputation. Two tuning notes worth keeping:

- **Every category must be winnable.** Biggest Crew is the one that keeps moving: capped at 15
  when the roster was you plus fourteen, now at 22 against a cast of twenty-five (see above).
  It was capped at 40 once, which made one of the awards decoration.
- `npm run era-pace [seeds]` prints the first awards night, the day each era arrives, and the
  final standings. Targets: an engaged player takes **one or two of five** on the first night
  (currently 2.0 on normal, 1.5 on hard, 3.25 on easy), finishes **first overall** by day 220
  without finishing at twice the field (currently ~1.6× on normal), and no single rival wins
  two categories every time. Measured with a player who uses every verb, Reddit included.
- **Reddit softened hard, and that is left standing on purpose.** Before Phase 2 a hard run
  came first in six seeds of eight; with posting it comes first in all eight, though by as
  little as 1.02×. A new verb making the game easier is expected, and the honest fix is to see
  whether a human posts as relentlessly as the harness does before tightening anything. Twelve seeds also finish with **no evictions** — the autoplayer
  is competent, so a death there means the economy is unfair rather than hard.
- **A category nobody else can win is as dead as one you cannot.** Space of the Year goes to
  the player in eight runs out of eight. Most Projects, Biggest Crew and Deepest Pockets are
  genuine contests on the first night (the player takes 3, 3 and 0 of eight), so it is the one
  remaining lock — and it predates the twelve-hour day rather than being caused by it.
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

- **Over-hiring was what the wage bill was for — now the induction fee is.** Wages are gone
  and every member pays ₺2,000 a month instead, which inverts the decision: taking somebody on
  is permanently profitable, so the roster filled by day sixty and the player took 24 of 32
  awards with cash over ₺200,000. Three things put it back, in descending order of how much
  they mattered: the **induction fee** from ₺880 to ₺7,600 (roughly four months of that
  person's dues), **rent** re-sized against dues rather than against cash, and Garaj's pace
  raised so the prolific space stays the prolific one. **When a cost is removed, find what it
  was really limiting** — it was never survival, it was the speed the roster filled.

- **When two things share a pool, one of them eventually starves the other.** Bought printers
  and machines built by tool projects took slots from the same list. Nothing was wrong until a
  player could buy four printers, at which point the CNC from a three-week build arrived to a
  full floor, logged one warning line and vanished. The harness found it because the autoplayer
  buys as much as it can afford — **give an autoplayer the new verb and let it overuse it.**

- **Reverting a sabotage with `git checkout <file>` throws away everything else uncommitted in
  that file.** Temporarily breaking a feature to watch its assertion fail is the right habit;
  undoing it with a checkout cost a whole finished feature that had not been committed yet.
  Copy the file aside first, or edit the sabotage back out the same way it went in.

- **A project that keeps landing on its tier boundary wants margin, not another nudge.** The
  FPV Drone has crossed the 10-day line three times in two sessions, each time because an
  unrelated change shifted the RNG stream, and each time it got a small bump. A build whose
  length is mostly machine hours and lead time will wobble; give it a decisive margin once
  rather than treating it as a new finding every time.

- **A keyboard shortcut must stand down while somebody is typing.** Space paused the game
  and called `preventDefault` on a global listener, so a hackerspace could not be given a
  name with a space in it — and 1/2/3 setting the speed meant it could not have a number
  either. Guard every global key handler on the focused element.

- **Replacing a method by slicing between two anchors deletes whatever sits between them.**
  Rewriting `renderCeremony` by cutting from it to `renderModal` took `rankingBody`,
  `trophyRoom` and `renderBill` with it, and the only reason it was caught is that the
  compiler noticed two now-unused imports. Slice to the *end of the method you mean*, not to
  the start of some later one.

- **A screenshot is the only way to check a screen.** Two things survived a clean typecheck
  and a passing click suite: every unblocked progress bar was rendering bright green because
  the "nothing is wrong" case had been given a colour class, and the panel's blocker badges
  never appeared at all. **The second one was a real logic error** — the check asked whether
  any *printed* part was outstanding, when what gates assembly is the bought bill of materials
  (§4), so the blocker was invisible on every build whose parts arrive in a box. Driving the UI
  to a state with one of each blocker and photographing it is what found both; neither would
  have shown up in a test that only asks whether an element exists.

- **A duplicated helper is a bug with a delay on it.** `partsWait` in `ui.ts` was a verbatim
  copy of `partsEta` in `ProjectSystem`. Nothing was wrong with it yet, and nothing would have
  been until either changed. It is gone; the panel imports the real one.

- **A reward with no matching punishment is not a choice.** The claim system shipped its first
  measurement with `backfire: 3`, which read as reasonable and was not: the claim multipliers
  (0.7 / 1.0 / 1.55) simply outran the penalty, so the biggest claim was right almost
  everywhere and the hype-man was punished 0.8 times in 181 posts. The test that caught it was
  not the numbers but the **archetype race** — a deliberately reckless player finishing *ahead*
  of a careful one. Whenever a mechanic offers a risky option, race a player who always takes
  it against one who never does; if the reckless one wins, there is no decision there.

- **A tuning script that rebuilds from HEAD stops being idempotent the moment you commit.** The
  difficulty sweep regenerated `difficulty.ts` from `git show HEAD:` plus its own insertions.
  That was fine until the fields it inserts were themselves committed, after which every run
  duplicated them. It stayed silent because duplicate object keys are legal JavaScript and the
  *last* one wins, which happened to be the committed value — so the measurements were right
  and the file was broken. Prefer scripts that edit in place and assert the pattern exists.

- **A modal you did not expect makes a click suite intermittent.** The Reddit check passed and
  failed on alternate runs: a bill lands on a schedule, it is modal, and it has no `jobs-close`,
  so the bar button underneath was covered and the click did nothing at all. Dismissing bills
  and ceremonies now lives in the `openPanel` helper, so no future check has to remember.

- **When a fix has no effect, look for the second copy of the thing you fixed.** Making the
  lease a decision meant stopping reputation from promoting the player automatically. Done —
  and the campaign output came back *byte-identical*, cash included, even with the move cost
  temporarily set to ₺500,000. There were two places that advanced the era: `recordReputation`
  and `recordShipped`. Shipping had been doing the promotion all along. Identical output after
  a real change is never luck; chase it.

- **A metric that cannot move is a broken metric.** `era-pace` at three difficulties produced
  identical output three runs running, because the sweep script rebuilt `difficulty.ts` from
  its own defaults each time and the values under test were never written. The numbers were
  plausible — they were last run's. Before trusting a sweep, change one input to something
  absurd and check the output moves.

- **Building the same thing twice is worth less** (`REPEAT`). Reputation and payout fall away
  per previous ship of a design, down to a fifth. The cheap fast entries in the catalogue are
  there to teach the pipeline, and without this the answer to every question is "ship another
  Space Website" — the work is the same, the novelty is not.

- **The shipped ledger shows the profit, not the takings.** Every outgoing on a build — parts,
  bounties, expediting — lands on `ProjectData.spent`, so the Projects table can show what the
  thing actually made, green or red. A payout column on its own flattered every project that
  had a large bill of materials.

- **Rent has to be payable by the roster you will actually have when the lease lands.** Era
  advance is automatic — it fires on reputation — so the player cannot choose to stay small a
  while longer. Pricing Era 2's rent at ₺18,000 against dues evicted a run on day 61 that had
  reached Era 2 on day 30 with two people: punished for doing well, with no move available.
  ₺11,000 leaves it a real squeeze and zero runs in twelve die of it. Until §8's "you choose
  when to sign the next lease" is actually built, **every rent step must clear on the crew
  that era arrives with, not the crew it is meant to hold.**

- **Scaling the whole field is not a substitute for the right lever, and compounding makes it
  brutal.** Pushing every rival's pace and reputation together looked like the obvious answer
  to a player who had got stronger twice. It is not: ×1.06 left the player first in every seed,
  ×1.12 dropped them to first in two of eight, and ×1.5 buried them in last place with rivals
  at 82,000 reputation — while *still* handing them Most Projects seven nights out of eight.
  The first awards night barely moved, because the problem was day-90 throughput and rival
  compounding only bites afterwards. Diagnose which half of the run is wrong before reaching
  for a multiplier.

- **A reporting script is a harness too.** The sweep above read the first reputation in each
  standings line as the player's. The standings are sorted by rank, so the moment the player
  stopped winning, the script started reporting a rival's score as theirs — three rows of
  "final 1.08×, first in 8 of 8" that actually meant *last of twelve*. It looked plausible
  enough to nearly act on. Parse by the `*` marker, and distrust a metric that does not move
  when the input does.

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

### Who is on the books (`ROSTER`, `APPLICANTS`, `LADDER`)

Safa and Abdullah are there on day one; the rest of the cast — twenty-three of them — are
applicants. **Who turns up in what order is shuffled every run**: the reputation ladder's
rungs are fixed (`LADDER`), and `shuffleLadder` deals the applicants onto them when the run
starts, keeping the order in the save. The pace stays the difficulty's to set; the faces do
not repeat from run to run. People can be taken on one at a time or all at once — **Take all
on** hires everybody waiting, each still paying their induction fee.

You are named too: the start screen asks for your name as well as the space's, and it is
what the room labels you with (`Identity.player`; left empty, you are "You").

### How fast people turn up (`Simulation.tickRecruiting`)

One clock governs recruitment and **difficulty sets its speed** (§3c). Reputation still decides
*who* is interested — the applicant ladder is unchanged — and the clock decides how fast the
queue moves. Three details, each of which was a bug waiting to happen:

- **It caps rather than banks.** A quiet stretch cannot pay out three people at once.
- **A full clock waits.** If nobody has cleared their reputation bar yet the clock sits full, so
  the next person to qualify arrives immediately instead of serving a second full wait.
- **Shipping changes who, never how many.** A project shipped in the last few days pulls its own
  enthusiast forward (past half their reputation bar, as before) instead of adding arrivals. The
  old version opened one or two people per ship, which at ninety-odd ships a run would have
  flattened the difficulty setting entirely.

**Say the pace out loud.** The People panel prints "somebody gets in touch in N days", or
"word is out — waiting on reputation" when the clock is full and nobody qualifies. A pace the
player cannot see reads as the applicant list being broken — §13's rule about invisible gates.

### Selling a printer

You can sell one back at 55% of list. Anything queued on it goes to `pending` so another
machine picks it up — or so it waits, if you have just sold your last one, **which is
allowed**: trading the A1 in to fund something quicker is a real decision and it has to be
possible to do it badly. With no printer, projects that need one stay in the Jobs list rather
than vanishing from it, disabled and saying *needs FDM Printer — buy one first*. A catalogue
that silently shrinks looks broken; "go and buy one" is a perfectly good thing for a job board
to say.

### Standing jobs (`Role`)

Three jobs a member can hold on top of their build work, one holder each:

| | What they watch |
|---|---|
| **Host** | Shows visitors round: on a day they are in, the recruitment clock runs `ROLES.hostDraw` faster. Who joins stays your call |
| **Printer Keeper** | Fills the printers before they run dry, and levels a drifting bed between prints (`ROLES.levelBelow`) |
| **Quartermaster** | Gets bills of materials on order so assembly is never waiting |
| **Social Media Manager** | Keeps the feeds ticking over so attention never quite dies |

Each one gets a row in the People panel that says **what it does**, with the holder picked
from a list of everybody. The first version was one button that cycled through the roles,
which meant "Quartermaster" had to be decoded by trial — a role you have to discover by
cycling is a role nobody uses.

**A role acts at its holder's next availability, not as a background rule.** Somebody who is
away, or walking across the room, is not watching the filament — which is the whole point:
the chore gets done because a person who is in the building does it. It is also the answer to
the question the game asks from Era 2 onward, which is what fifteen people are *for* if you
are still the one buying spools.

### Rating people against a genre

`categoryAffinity()` scores a member against a whole genre rather than a single tag, and this is
what the crew picker ranks by and what the People panel shows as each person's specialism.

Category tags are **ordered and weighted** (1.0 / 0.75 / 0.6). Categories share tags, and an
unweighted max made every machinist read as a roboticist purely because Robotics also touches
`machining`. If you add a category, put its most defining tag first.

### The catalog (`src/utils/catalog.ts`)

**Fifty-two projects** across ten genres, gated by era and by what the space owns. The second
half of the list is the one that matters most: `REPEAT` punishes rebuilding the same design,
but a punishment only works if there is somewhere else to go. These are the jobs that turn up
because somebody heard you can make things — a marina wanting chart plotting, a council with
a car park, a hospital with a queue, a district that would like forty accelerometers and a
map. They are also what makes an **Offer** worth reading, because the surprising ones live
there: drone grocery delivery, a prosthetic hand, a 1979 pinball cabinet in a bag of parts.

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

### Buying printers (`src/utils/printers.ts`)

The space starts on the smallest printer in the catalogue on purpose, so the first thing the
shop floor asks is whether a second one is worth more than the project you would spend the
money on instead. Four models, era-gated, each better on all three axes at once — capacity,
speed, reliability — because buying kit is an investment decision, not a puzzle:

| | Price | Holds | Speed | Fails | From |
|---|---|---|---|---|---|
| A1 Mini Combo | 4,500 | 4kg | 100% | ×1.00 | you start with one |
| P2S | 9,000 | 4kg | 135% | ×0.85 | Era 1 |
| X1C | 19,000 | 4kg | 160% | ×0.62 | Era 2 |
| H2S | 33,000 | 8kg | 185% | ×0.55 | Era 3 |

**Every printer holds a four-spool load** except the H2S's eight — a *Combo* is the A1 Mini
with the four-spool AMS Lite, and giving it one kilo was a number no owner would recognise.
Capacity is now only the H2S's advantage; speed and reliability are the ladder.

**The starting printer is on the shelf too.** A second A1 is the cheapest way to print two
things at once, and leaving it out made "buy a slow one" a choice the game had quietly made
for you. Past the A1 they are cabinets that grow with the price — P2S in black, X1C in
silver, and the H2S in space grey, a clear size up from the X1C rather than a slightly taller
one: nearly the whole tile, and a head over everything else on the wall.

**The Machines panel is a table, one row per printer**: what it is printing (with the fail
risk on the bar's colour), calibration, filament, and three icon buttons — fill, level, sell
— with the price in the tooltip. It was a 700-pixel card per printer with three labelled
boxes, two of them usually empty. A queue hangs under its printer only when there is one.

The shop lists **every** model including the ones the era does not allow yet, greyed with the
era they need. A machine you cannot see is a machine you cannot plan for, and the H2S is worth
wanting.

**What makes it a decision is the floor, not the spec sheet.** Two cheap machines print two
things at once and one dear machine prints one thing quickly, and the back wall holds four
printers in total. A part goes to whichever printer has the shortest queue and never to a
starved one while a fed one is free — without that, a second printer just stands there.

**Filament fills the machine rather than adding a spool.** Topping a four-kilo printer up a
kilo at a time is busywork, not a decision, so the button says what filling it costs from
where it is.

**Printers and tools get separate walls**, and this was a real bug before it was a rule: they
shared one pool of slots, so a player who bought four printers filled the floor and the CNC
they had spent three weeks building had nowhere to go — it logged a warning and was gone.
Three slots each. Building the same tool twice no longer takes a second slot either; the space
already owns the capability.

## 6. Reddit & Hype — BUILT (`src/utils/subreddits.ts`, `src/systems/HypeSystem.ts`)

Eight outlets are the publisher, each with `audience`, `tasteTags` and `skepticism`. Six are
subreddits; two are the space's own feeds and behave differently enough to be worth the
entries — **Instagram** asks nothing except that the thing photograph well, and **X** is
quick, generalist and merciless. Posting
costs you an hour and asks three questions at once — **which build, which room, what you are
claiming** — on one screen, because the interesting part is how they interact.

**The claim is the verb.** Three of them: *Work in progress* (safe, modest), *It works*, and
*Nobody has built this*. Each multiplies the room's reaction **and sets a merit bar**, where
merit is mostly build quality plus how far down the pipeline you are. Claim more than the work
backs and the overreach is punished by the room's skepticism, so the same boast is cheap in
r/homeassistant and a reputation event in r/programming.

**The punishment has to outweigh the reward, or the answer is always "claim the most".** It
did not, at first: a hype-man who picked the biggest claim every single time was punished 0.8
times in 181 posts and finished with *more* reputation than a careful player. Tripling
`HYPE.backfire` to 7 is what turned it into a decision. The shape it produces, for a
quality-0.7 electronics build in r/electronics:

| Stage | Work in progress | It works | Nobody has built this |
|---|---|---|---|
| concept | **113** | 37 | −97 burned |
| cad | **208** | 168 | −178 burned |
| fabrication | 302 | **432** | 5 |
| assembly | 321 | **459** | 161 |
| release | 378 | 540 | **741** |

That is the whole design in one table: the claim you can afford tracks how finished the thing
is, and a boast is something you earn by finishing rather than something you spend to skip it.

**Attention is a shelf life, not a stock.** Hype decays 5% a day — about a fortnight to half —
whether you touch it or not, and everything it feeds sags with it: word of mouth (the
recruitment clock, §5), how many of the public pay to be here, and how often a sponsor calls.
A project parked at eighty per cent therefore costs you something continuously, which nothing
else in the game does. **That is the anti-drift clock, and it is the reason the layer exists.**

Three details that keep the verb honest:

- **Novelty decays per room, not globally**, so the counter-play to a stale build is to take it
  somewhere new rather than to stop posting.
- **The generalist room needs a taste floor.** r/somethingimade is "everything is welcome" and
  was scoring a flat zero for anything outside its four tags, which is the opposite of its
  character. It now grants 0.45 to anything: always somewhere to post, never a big win.
- **The panel previews the reaction before you commit.** Each claim card shows the upvotes it
  would actually get, and turns destructive when the room would turn on you. A claim you cannot
  evaluate before making it is a dice roll, not a decision.

**The Social Media Manager keeps the floor under attention.** Hype decays 5% a day, so a
space that only posts when the player remembers to spends most of its time at nothing. A
keyholder puts out **one safe post a day** — always the modest claim, never a bold one,
because claiming more than the work backs is a judgement call and that stays the player's.
They pick the best *unused* outlet rather than the biggest one, since novelty decays per
outlet per build and posting the same thing to the same feed daily is the one mistake the
job should never make. Measured over twenty days: fifteen posts across five outlets and hype
settling near 1,150, against the ~4,000 a careful player reaches by choosing their moments.
A floor, not a replacement.

**Does it pay for the hour?** `npm run hype-check` answers §13's rule directly, against an
identical player who never posts. Over six seeds at 180 days: reputation +19%, crew +13%, cash
+42%, and about three fewer projects shipped — the hours are real. A reckless poster earns
slightly more cash and a visibly worse name. Still unbuilt from this section: **crowdfunding**
(`Campaign` in §12) and the Era-3 front-page goal.

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
machine maintenance. There are no wages — people pay *you* (§7a), which is the volunteer
model's one gift to the player and the reason rent has to be the thing with teeth.

## 7a. The books — BUILT (`src/utils/economy.ts`)

A bill lands every **30 days**, and it is a real statement of the month rather than a demand.
**It adds up: opening balance + income − costs = where you are now, to the lira.** It opens on
that sum as one line — `Income − Costs = On the month` — and then lists each side as its own
group with its own total, then the balance: opened on, the month, now.

That needs every lira to say where it went, so **`spend(amount, kind)` and `earn(amount,
kind)` name a `LedgerKind`** and the store keeps the month's running totals (`ledger`,
`monthOpen`). Income is crew dues, community dues, work shipped, sponsors and anything sold;
costs are rent, power, comforts' upkeep, parts, design budgets, filament, kit and furniture,
joining fees, training, bounties and moving. A refund books against its own kind, so a
purchase that bounced cancels out rather than showing twice. Anything that moved cash
without a kind — the dev console, a save from before the ledger — is listed as **Other**
rather than left as a hole in the sum; when Other shows up in a normal run, a call site has
lost its kind.

The previous statement listed only dues, rent and power, plus the shipped work "already
banked" — so its bottom line never matched the change in the balance, because everything
bought during the month was missing. That is exactly the confusion it was meant to prevent.

**The top bar shows the balance and nothing else**, green in the black, red under it, plain
at exactly nothing. It carried a projection of the next bill
under it, which read as a second balance; nobody could say which of the two they had.

**Nobody is paid.** The people on your books are members, not staff, and a flat ₺2,000 a
month each is the space's backbone — which is how a real hackerspace is funded and what §1's
volunteer model always implied. Wages existed briefly and contradicted it.

**The induction fee was cut from 190 to 140 a contracted hour when part-time went.** Thirteen
applicants used to join on half the fee; charging them the full one cost a run about
₺45,000 — the Warehouse move, to the lira — and Era 3 stopped arriving on normal at all.
140 puts the average fee back where it was. **When a cheaper variant of a cost is removed,
the average cost went up; check what that average was paying for.**

**Dues are meant to carry the rent** — so rent is sized against them rather than against
cash in hand: at Era 3 a full roster plus a full community brings in roughly ₺55,000 against
₺40,000 of rent, which leaves the space paying for itself and project money as the actual
profit. That makes the loop **ship → reputation → membership → the rent looks after itself**,
and it is why the first two months are thin: no name yet, and two people paying dues.

**The induction fee is now the only brake on the roster.** With wages gone, admitting somebody
is permanently profitable, so nothing stops you taking the whole town on but the one-off cost
of doing it — about four months of their dues. Get this wrong and the space is full by day
sixty and wins every award; see §13.

**You are allowed to go under, and that is the mechanic.** A hackerspace runs on an overdraft
and a promise, so *nothing* is refused while the balance is above **−₺30,000** — order the
parts, take the person on, buy the printer. What ends a run is staying under: get back above
zero within **60 days**, or go past the floor, and the lease is gone with a post-mortem of what
you shipped and who was on the books.

This replaced "miss two bills in a row". That rule refused actions at exactly the moment a
player needed to spend their way out of trouble, which is backwards — the money you owe is
usually parts on a project that will pay for them. **Every spend goes through
`store.spend()`**, which is the only place the floor is enforced; a local `cash < cost` test
re-imposes the old rule quietly and fills the log with "not enough cash" while the balance is
a few thousand under. There were five of them.

**Asking somebody to leave** used to be the lever that answered a bill you could not pay.
It now makes the bill *worse* — you lose their dues — so it is a way to free a seat, not a way
to save money. The button stays, its meaning is inverted, and the People panel says so.

## 7b. The Shop — BUILT (`src/utils/amenities.ts`), now the Comforts shelf of **Build**

**Build replaced the Shop on the menu** (§4d). It has four shelves: **Workspace** (tables,
workstations and the Learning Station), **Printers** (moved here from the Machines panel,
which is now only for watching what is on the floor), **Comforts** (everything below), and
**Decor** — twelve smaller things, a
Monstera, an olive tree, a lava lamp, a giant rubber duck, a Tux statue, a shelf of manuals,
bean bags, a server rack, a neon `</>`, a whiteboard wall, a circuit-art print and, from Unit
4B, a retro terminal. Decor runs through the same mood curve as the comforts, so a room full
of it is nicer rather than faster, and the harnesses do not buy it.

**Every card carries a picture of the thing**, rendered once from the same model that stands
in the room (`render/Thumbnails.ts`) and cached as a data URL — a card with a name is a
spreadsheet row, a card with the thing on it is a shop, and the picture cannot drift from
what turns up.

**What the space already has looks the same on every shelf**: a green edge and a "✓ in the
space" pill. The first version gave owned cards the item's own colour as a border, so a
shelf of owned things was a row of unrelated colours that said nothing about which ones
were bought.

**Printers past the A1 are cabinets, and they grow with the price**: the P2S a little larger
than the A1's open frame, the X1C larger and darker, the H2S the biggest box on the floor, in
white. The toolhead's travel is per model, so a cabinet never prints through its own lid.


**Machines make parts; the Shop makes the place worth turning up to.** Nine comforts, gated
by the lease, bought once and never sold back — a coffee machine and a water cooler in the
garage, a drinks fridge, air conditioning, a table tennis table and an aquarium in Unit 4B,
an arcade cabinet and acoustic panels in the warehouse.

| | Buys | Costs |
|---|---|---|
| **Coffee Machine** · **Water Cooler** · **A Proper Couch** | rest, and a little mood | ₺700/mo between them |
| **Drinks Fridge** · **Aquarium** | mood, word of mouth, slower drift | ₺1,300/mo |
| **Air Conditioning** | the biggest focus gain in the game | ₺1,900/mo |
| **Table Tennis** · **Arcade Cabinet** | the biggest mood and recruitment gains | 5-8% of everybody's work rate |
| **Acoustic Panels** | focus and drift, no mood at all | ₺17,000 once |

**Mood is the channel, and that is the whole design.** §13's oldest rule is that the binding
constraint is whether anybody is in the building, so a comfort that only made present people
faster would be worth nothing. Mood already drove the show-up roll in `planDay` *and* the
work rate in `MemberEntity.workRate` — it was the one stat the doc described at length that
**nothing in the game ever wrote to**. The Shop writes to it. Four details:

- **It eases, it does not snap.** Mood moves 34% of the way to its new level each day, so a
  coffee machine takes about three days to be felt. Nobody's week turns around the afternoon
  it arrives.
- **It is added to a temperament, not set.** Each member keeps their roster mood as
  `baseMood`; comforts are added on top. The sunniest person in the room stays the sunniest
  however good the coffee gets.
- **Mood saturates; the multipliers do not.** Comforts are the one thing a player can simply
  keep buying, so the sum runs through `COMFORT.moodCap` — the fourth nice thing in a room is
  worth much less than the first. A fully kitted warehouse is +18 mood, not +32.
- **Two of them cost you work.** Nobody finishes a stage through a rally. Table tennis is
  −5% work rate and the arcade −8%, and both are still worth buying. Per §13, a reward with
  no matching punishment is not a choice — the upkeep is the punishment for the rest.

**What it is worth, measured** (`NO_SHOP=1 npm run era-pace` plays the identical run without
buying a thing — the A/B switch, like `hype-check`'s archetypes). Eight seeds, an autoplayer
that buys every comfort the lease allows as soon as it is comfortably affordable:

| | normal | hard |
|---|---|---|
| Projects shipped | 93 → 112 (+21%) | 79 → 91 (+15%) |
| Final reputation | 20,600 → 22,100 (+7%) | 18,600 → 19,900 (+7%) |
| **Era 3 arrives** | **day 110 → day 140** | **day 120 → day 156** |
| First awards night | 22 of 56 either way | 18 of 56 either way |

**The cost is the next lease, and that is the decision.** The shop does not compete with
printers or with hiring; it competes with the ₺52,000 move to the warehouse, which is why a
maximal shopper gets there a month later while shipping a fifth more. The first awards night
is untouched because it falls on day 69, before there is money for any of this. **Era 3's
documented day 102-118 is the no-shop pace**; a player who furnishes the place should expect
the warehouse later and a better-run garage meanwhile.

**The Old Factory has its own four** — the dearest comforts in the game: a **PlayStation
Corner** (the biggest draw there is, and the biggest drain on the afternoon: mood +8, work
−10%), a **Big-Screen TV** on the back wall, an **Espresso Bar** and a **Nap Pod**. They are
the lease's answer to "what do sixty members of the public and a full crew do between
builds", and the console is the table-tennis trade at factory scale.

**They stand in the room, and you arrange them.** A comfort you cannot see is a number in a
panel, and ₺22,000 of arcade cabinet should be in the building the moment it is paid for.
**Click one in the room to pick it up**: it lifts, every tile it could stand on lights up,
and a click sets it down or a second click on the item turns it a quarter. `R` turns it too,
`Escape` puts it down. The strip that appears sits *above* the build menu rather than being
a dialog, because the thing you are deciding about is the room and a modal would cover the
tiles you are choosing between.

**While something is held, clicking another piece picks that one up instead.** Moving five
things used to be pick up, drop, press Done, and start again — five times. Done is now only
for when you have finished rearranging.

**Selling happens from the same strip** (`Simulation.sellPiece`): it names what the piece
fetches — half what it cost for furniture and decor, the resale value for a printer — or why
it cannot go: the kit the garage came with and machines built by tool projects stay, and so
does a table a crew is holding its kickoff at. A room that can only fill up eventually
becomes unplayable, and the room is the only place you can see how full it has got.

**Hung things move too, along the back wall** (`WallItem`, `wallColumn`, `wallColumnFree`).
Air conditioning, the TV, the whiteboard, the neon, the print and the acoustic panels used to
hang on fixed nails and could not be picked up. Holding one lights the free columns under the
back wall; a click hangs it there. Each takes its width of wall (the TV and whiteboard two
columns, the rest one) and nothing overlaps — except the acoustic panels, a backdrop that runs
behind everything and clashes with nothing. **Moving one pins the rest**: unpinned items took
the next default spot in order, so the first version shuffled the whiteboard into the gap the
TV had just left. A placement on the wall is stored like a floor one, with `y: -1`.

**The Club-Mate Fridge** is on the garage's shelf from day one (₺2,400, ₺350/mo, a little
mood, less fatigue and drift): half the drinks fridge, bottles behind the glass, and MATE
across the top — the game's second canvas texture after the wall sign, for the same reason.

Where they start is derived — the open edges, the bottom row and the odd rows of the
right-hand column, spaced a tile apart for the same reason the printer wall is — and a tile
the player picks simply overrides it. They block their tile either way, so people walk round
them. Air conditioning and the acoustic panels hang on the back wall, take no floor and do
not move.

**The stations move too, and a station carries its stand tile with it.** That is the one
thing that makes a bench harder than a sofa: the tile in front of it is not decoration, it
is the only place a person can stand to use it. So **turning a station means choosing which
side they stand on** — the yaw is a request, the first legal quarter turn from it is what
actually happens, and a tile with no legal side at all is not a place a bench can go. The
painted bay and the model's facing both follow, because they are derived from the stand
rather than stored. A lease wipes the arrangement: `applyEraLayout` has just carried every
bench to a new wall in a bigger unit, and re-applying yesterday's tiles on top of that is
the exact thing it exists to prevent.

Five things that were wrong first, or nearly were:

- **Nothing may be walled off from the door.** A bench dropped into a pinch can cut another
  bench off entirely, and the symptom is not an error — it is a station that quietly stops
  being used, because the path finder returns nothing and the member just stands there.
  Every placement, comfort or station, tentatively applies itself and checks that a path
  still exists from the door to every stand tile, then reverts if not. One BFS per click,
  and it removes a whole class of bug that would only ever have been reported as "my space
  broke".

- **A comfort must not stand on a stand tile.** Blocking the tile somebody has to occupy to
  use the solder bench does not block the bench, it *strands* it: the path finder never
  arrives and the station goes quiet with nothing on screen to explain why. The legal-tile
  test excludes every station's tile *and* its stand, the door, and the idle tiles.
- **A placement has to survive a lease, or be dropped.** Signing for the warehouse moves
  every bench, so a tile that was fine can end up under one. Placements are re-derived on
  every layout change and an illegal one falls back to a default slot rather than leaving
  the aquarium inside a table.
- **Dots, not plates.** Filling every legal tile with a translucent square washed the whole
  floor teal, which says "the room is highlighted" rather than "these are the tiles". A
  small marker per tile reads as a placement grid and leaves the floor alone.
- **The selection lives in the store, not in the renderer.** §11 says the UI reads the store
  and nothing else, and the strip naming what you are holding is UI. `moving` is a store
  field that is never saved.
- **Lifting a node must add to its height, not set it.** Writing `position.y` outright
  dropped the air conditioning off the wall and half into the floor: a wall-mounted node's
  height *is* its mounting. It was invisible until a screenshot showed the unit lying in
  the concrete.
- **Moving a station repositions its node; it does not rebuild it.** Rebuilding to shift a
  bench one tile would throw away the machine's readout handles — the status light and the
  progress bar the sim writes to — and the hover state with them.

Two more, from getting the props on screen at all:

- **A prop faces the camera, not the room.** An isometric camera only ever sees the +x and
  +z faces, so a fridge turned to look up the room — which is what a station's stand tile
  asks for — presents its back and is a dark box. These have no stand tile and nobody
  operates them, so the only thing their facing decides is whether you can see what you
  bought.
- **Their tiles are derived from the grid and rebuilt on a lease**, not cleared. The first
  version folded them into `BLOCKED`, which `applyEraLayout` wipes and refills from the
  stations — so the aquarium would have quietly stopped being solid the moment you moved.

## 8. Eras (progression)

| Era | Space | Unlocks | Milestone goal |
|---|---|---|---|
| 1 — Garage | 6×8, single-phase power | FDM printer, soldering bench, hand tools | Ship any project + 50 backers |
| 2 — Unit 4B | ~15×12, 3-phase | CNC, laser cutter, welding bay, certifications | 20 members + break even for 3 months |
| 3 — The Warehouse | 12×12 | Mill/lathe, motorcycle-scale projects, grants | Front page of r/all |
| 4 — The Old Factory | 15×14, brick | room for the public at scale (community cap ×1.6) | — |

**The Old Factory is the lease after the warehouse**: 22,000 reputation opens it, ₺120,000
moves you in, ₺65,000 a month to rent. What it buys is floor — more printer slots, more room
for furniture — and room for the public, whose dues are what carry that rent.

**There is a front door** on the left wall at the door tile: a frame, a leaf that swings open
for whoever is on the threshold, a lamp and a mat. Everybody arrives and leaves through it; a
room people simply appear in reads as a stage, one they walk into reads as a building.

Each era raises rent and unlocks project scale. **The player signs the lease; reputation only
unlocks it.** Moving costs ₺18,000 to Unit 4B and ₺52,000 to the Warehouse, and the rent goes
up with the space — so staying in the garage one more month to bank the cash is a real option.
It used to happen *to* you on a day you had no say in.

**Each lease is a bigger room.** The floor grows with it — 6x8 in the garage, 9x10 in Unit 4B,
12x12 in the Warehouse — and `applyEraLayout` puts every bench back against a wall, because a
station left on the tile it had in the garage would be standing in the middle of the
warehouse. Station ids and types are preserved; only their tiles move. The floor and walls
repaint too: cold concrete, then warmer paint, then a pale poured floor. A move you paid
₺52,000 for should be visible the moment it happens, and the camera reframes to fit the new
room unless the player has already set their own zoom.

**The slot pools are derived from the grid, not hardcoded.** A bigger lease is simply more
room for kit. They are spaced rather than shoulder to shoulder: a warehouse holds more
printers than a garage, but a wall of nine of them is neither a decision nor a room you want
to look at — and with people as the binding constraint (§13) the ninth printer is money that
should have gone somewhere else.

**Implemented so far:** eras gate the catalog and advance on **cumulative reputation** (1800,
then 6000) — the sum of the hype of everything shipped.
Reputation rather than a project count, because three weekend builds otherwise unlocked Era 2 by
day six; ambition should advance you and volume should barely move the needle. The thresholds
were rescaled when the slot cap came off — throughput roughly quadrupled. `npm run era-pace`
measures it: Era 2 lands around day 30-53 and Era 3 around day 102-118. The space itself grows in Phase 4, and the real milestones — member count,
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
- **The badge and the name are painted on the left wall.** The back wall is where the kit
  lives; the left wall is the one big blank face the camera looks straight at, and it is
  still blank in the warehouse. The mark is the badge, the name beside it and a rule under
  both — the rule is what ties them together rather than leaving a logo standing next to a
  word — all in the badge's own colour, so naming the place and choosing its badge show up
  in the room rather than only in the top bar. **This is the one texture in the game** and a
  deliberate exception to the rule below: letterforms are the single thing flat-shaded boxes
  cannot do. Three things it got wrong first, each worth not repeating:
  - **Size it by the wall, not by a fixed cap height.** A fixed height turned a long name
    into a thin strip across a fifth of the wall. The letters now grow or shrink until any
    name takes up about half of it, with a cap so a three-letter name is not a billboard.
  - **Size a line icon against the cap height, not the line.** A lucide glyph carries
    padding inside its own 24px box, so a badge set to the height of the letters reads
    smaller than them.
  - **The badge is an `<img>`, so it arrives after the text.** Its box is measured and
    reserved up front and the texture is simply marked dirty when it lands; otherwise the
    whole sign re-lays-out a frame later. A repaint token stops a late badge drawing onto
    a sign that has since been replaced.
- **Stations face whoever uses them.** Everything is modelled facing +y and the node is turned
  toward its stand tile, with the painted bay running the same way. The bay used to always
  point along −y, so a bench against the left wall faced away from its own user and its bay lay
  across its neighbour's — six stations in a row read as a pile. Tools line the open right-hand
  side rather than squeezing in between the benches.
- **UI:** HTML/CSS overlay panels. The 3D scene is observational, but it is pickable: a
  raycast per frame lights the floor bay under whichever station the cursor is over and shows
  its name and what it is for. Stations sit in two working walls with a clear aisle — furniture
  scattered over an open floor reads as clutter, a room reads as a workshop when the benches
  line up.
- **Projects and People are tables**, like the leaderboard — the third and fourth screens that
  rule has decided (§3c). You read *down* the Needs column to find what is blocked and down
  Paid to see what the work was worth; a stack of cards with wrapping badges cannot be compared
  between two rows that are nowhere near each other. Filter chips narrow one list rather than
  tabs swapping between several, and All is the default.
- **The bench is where you act; Projects is where you survey.** Once the Projects panel took
  over the overview job, "On the bench" was still drawing everything for every build at once
  — and each card carried *three* renderings of the same progress (a bar, a stage counter and
  the full pipeline strip) on top of a team box, a parts list and four buttons. Five projects
  open was several screens of scrolling. It now opens **one** build and folds the rest to a
  line each: name, bar, current stage, and what is blocking it. The open one is whichever you
  are working on, so the panel is already showing the thing you came to do something about.
- **On the bench, dimming is the hierarchy.** A folded build that is ticking over sits at
  62% opacity; one that is waiting on you does not. The stage counter (`cad 21/24`) is detail
  and lives on the open card only — a folded row answers "does this need me", not "how far
  through the stage is it".
- **A button that has finished its job should say so, not grey out.** "Queue pending" sat
  there disabled once every part had printed. It now reads `Queue 3`, `on the printer`, or
  `all printed`, which is the same information without the dead end.
- **The Projects panel is triage, not an inventory.** The question it answers is "what needs
  me now?", so a row that is blocked says *why* in the row itself — about to be shelved, parts
  not ordered, order in transit, prints outstanding, nobody on it — and **the progress bar
  takes its colour from that**: red to act on, amber to wait on, the plain accent when nothing
  is wrong. Colour is the signal, which is why an unblocked bar must stay neutral; a wall of
  green says exactly as much as a wall of grey. Rows sort worst-first, then nearest to
  shipping, so the top of the list is always the thing to look at.
- **The three groups are tabs, not stacked sections.** With the shelf letting a player keep
  twenty projects open, three sections in one column is a scroll, and an empty group used to
  spend a heading, a sentence and two rules to say nothing. A tab with no rows is disabled and
  shows its zero, and the panel falls through to a group with something in it rather than
  stranding you on an empty one. The panel is `modal--fit` for the same reason — one tab of
  three rows left half a fixed box empty — with a `min-height` floor so a short tab still
  reads as a panel.
- **Shipped work is a ledger, so it is a table** — the second time that rule has decided a
  screen, after the leaderboard (§3c). You read *down* the payout column to see what paid, and
  the footer totals what the space has earned and made its name on. Wrapping badges (`Q 60%`,
  `2 tests`) could not be compared between two rows at all.
- **Escape closes one layer, not the lot.** A bill sits over a ceremony sits over a panel
  sits over a picker inside it, and each press unwinds exactly one — closing the whole stack
  on a single keypress loses the two screens you had not read yet.
- **Keyholders, not a list of roles.** The three standing jobs are three slots on one row
  rather than three full-width rows: it is a small decision made rarely and it was taking a
  third of the panel to say so. The picker **ranks candidates** by what the job actually
  leans on — docs and breadth for the manager, machining for the printer keeper, docs for the
  quartermaster, with Mentor, Night Owl and Documenter counting for and Ghost counting
  heavily against. Somebody who signs up and stops turning up is nobody's keyholder.
- **A verb belongs next to the thing it is about.** "You" carried two buttons under the
  energy bar: Stop, which the bench card already offered on the build you were on, and
  Calibrate, which had no other home — but the calibration meter it is about lives on the
  machine card in Machines, and with four printers on the floor a lone Calibrate button was
  not even clear about which one it meant. Levelling the bed moved there; Stop went; and
  **You is a readout again** — hours, energy, and what you are on, where the task line is
  itself the way back to that build on the bench. A panel with no buttons is not a panel
  missing something.
- **The right column is the log, alone.** It used to share it with "The People", a roster
  that duplicated the People panel in the build menu and took most of the column to do it.
  The roster went; the log opens unfolded and takes the room.
- **"You" is three pixels under the clock.** It was a panel in the right column, then a
  panel in the bottom-left corner, and both were a box, a heading and a stack of rows spent
  on one number. Your day is now a slim bar tucked under the clock — which is where it
  belongs, because it *is* a clock: what is left of today. No hours figure, no shift start
  and end; the tooltip carries the hours and what you are on for anyone sizing up a job.
  **The panel was the wrong unit.** A readout that changes every minute and is never acted
  on directly wants to sit inside the thing it qualifies, not beside it.
  One trap worth the line: the clock panel is a flex *row*, so a bar dropped into it with
  `flex: none` and no width rendered at zero pixels and simply was not there. It takes a
  wrapped row of its own.
- **The build menu is the spine of the UI.** + New Project, Projects, Ranking, Machines,
  People, Build, Socials. A panel belongs here rather than in a permanent sidebar whenever you
  only touch it a few times a day. The clock sits alone in the top-left because it is the one
  thing glanced at constantly and it changes every frame.
- **The top bar is four groups, not eight boxes**: who you are (badge, name, lease), money,
  reputation, and what is on. **Money is the balance and only the balance** (§7a) — the bill
  preview under it read as a second balance, and the statement is where a month is explained.
- **A project has its own screen** (Projects → any row). The table is for comparing builds;
  the detail is for reading one: who made it and what share of the whole build each of them
  put in (`ProjectData.effort`, kept on `ShippedRecord.crew` so it survives people leaving),
  the three design choices, and for a shipped build how the payout was reached — the brief ×
  market × design appeal × quality × novelty, then what it cost. The Crew column is gone from
  the table: on a shipped row it had been printing how many days the build took, under a
  heading that said Crew.
- **People is a skill matrix, and a cell is the training button.** A column per skill with the
  level and five pips, so "who is our best welder" is one column read down. Pressing a level
  sends that person on the course for the next one (tooltip: cost and hours); a cell that
  cannot be pressed says why. It replaced a Train button that unfolded six chips under the row
  — two clicks and a second copy of numbers the row already showed. The contract column went
  with part-time, and the four keyholder slots sit on one line.
- **Whoever is on a course shows on the bench**, under the builds, with a bar like a project's —
  and over their head in the room once they are sat at the station, in the `--learning` violet rather than the work teal or the
  kickoff gold, so a trainee's bar is never read as a share of somebody's build.
  **The block does not exist when nobody is training** — a heading over nothing is a permanent
  advert for a feature, not information.
- **The bench shows one rating per build, and only the stages it goes through.** The design's
  three choices average to one star row (`designStars`); quality lives in its tooltip and on
  the project's screen. The stage strip drops stages a build never visits: Fabrication for
  anything with no printed parts (software's "Build Pipeline" never ran), Simulation when it
  was skipped at the pitch, and Iterate until a test has actually failed.
- **The trophy room is open before the first night.** It lists what is given out, what each
  pays in reputation and the date of the first ceremony. Locked until day 90, the awards
  arrived as a surprise, and the categories are the reason to care about the other columns.
  It has its own `tb-*` classes on purpose: the generic `.stat` picked up a bordered card
  style for the space screen, and every top-bar figure turned into a box overnight.
- **A panel is a shell that stays, with insides that change.** Every panel used to be rebuilt
  whole at 5 Hz, which replaced the scrolling element each time: with a printer running the
  Machines panel snapped back to the top the moment you scrolled it, and a purchase in Build
  jumped the list under the cursor. `renderModal` builds the shell once per panel and only
  rewrites the header, body and footer inside it; the body keeps its scroll until the view
  inside it (a tab, a wizard step) actually changes.
- **The Socials panel is two panes**: what you are posting about on the left, with each
  subject's readiness as a thin bar, and where on the right — the claim as one full-width
  switch, then every room as a row sorted by the upvotes it would give, the best one marked
  and its Post button primary, the rooms that would turn on you in red. The grid of eight
  cards it replaced had to be compared by eye.
- **A space's own screen shows where it finished as a strip of chips**, one per awards night
  — place and year, gold for a win. It said "night 1 · 2026" once; with one night a year the
  year already is the night. The line chart it replaced spent the panel's width
  on two or three points and repeated year labels whenever two nights fell in one year.
- **First-run tour** (`src/ui/tour.ts`). A card and a pulsing ring round the real screen —
  never a modal of its own, because the point is to show the thing itself, still pressable.
  *Look* steps explain a part of the screen and wait for Next; *Do* steps ask for one real
  action (open + New Project, start a build) and advance by themselves when the game sees it,
  stepping back if the wizard is closed unused. It stops the clock while it runs and gives it
  back after, runs once per browser (`hackerspace-tycoon-toured`, a preference beside the
  language, never in the save), and the lightbulb in the top bar replays it. `click-check`
  walks it on its fresh profile and was seen to fail with auto-advance broken.
- **Scrollbars are styled once, globally** — thin and dark. Left to the platform, macOS with
  "always show scrollbars" drew a white gutter down every panel, and the bench's verb row
  (a fixed three-column grid) pushed a button past the edge and added a sideways one.
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
- **An old save is migrated, never discarded.** It used to be thrown away on any version
  change, on the reasoning that a half-loaded save is worse than none. That is true of a
  *broken* load and false of a missing field, and since every bump only ever *added*
  something, four releases in a row silently deleted the player's run — they never once
  reached an awards night. `migrate()` gives each field added since `MIN_LOADABLE` the value
  a fresh run would have had. **Only raise `MIN_LOADABLE` when a field genuinely changed
  meaning and no default can stand in for it.** Losing somebody's save is the worst thing
  this file can do.
- **Saving (`src/systems/SaveGame.ts`)** — one `localStorage` slot, autosaved on every day
  rollover and again on `beforeunload`. The store hands over a `snapshot()` of its own fields
  (never `runtime`, which the sim rebuilds on the next publish); the Simulation hands over
  runtime state only, and entities are rebuilt from the roster data by id so skills and
  passions are never duplicated into the file. Two things are easy to forget and both break a
  load: **stations installed by tool projects** live in a module-level list and have to be put
  back before anything looks one up, and **day plans** are recomputed rather than saved so they
  cannot drift. Bump `SAVE_VERSION` on any shape change — an old file is discarded rather than
  half-loaded, because a save that loads into a broken game is worse than no save.
- **Language (`src/i18n/`)** — English and Turkish, typed. `en/` is the source of truth and
  `tr/` is typed against it area by area, so a missing Turkish key fails `npm run typecheck`.
  Five rules, each from something that broke:
  - **`t()` for what is rebuilt, `msg()` for what is saved.** A log line, the reason a run
    ended and a bill line are stored as `{ key, params }` and rendered with `say()` at display
    time, so a save written in English reads in Turkish after switching. Old saves hold plain
    strings, which `say()` passes through — no migration needed.
  - **Numbers go in as numbers.** A message formats its own money and decimals (`money`,
    `num`), so ₺7,000 and ₺7.000 both come out of one stored line.
  - **Never glue a Turkish suffix onto a name.** Harmony depends on the name: `ek(name, 'dat')`
    gives CNC'ye, Unit 4B'ye, Konya'dan, 10'da.
  - **`lang` drives CSS casing, and that cuts both ways.** Under `lang="tr"`, `uppercase` turns
    i into İ — right for Turkish, and it turned English labels into İNTEREST and RANKİNG. Text
    that is still English carries its own `lang="en"`. JS casing goes through `caseLocale()`.
  - **A key in a template literal typechecks.** Tables that moved from text to keys
    (`ACTIVITY_LABEL`, `SIZE_FILTERS`) compiled fine and would have printed `ui.size.any` on
    screen. `?lang=xx` (or `lang xx` in the dev console) brackets everything that went
    through `t()`, so anything unbracketed is text that did not.
  Harnesses match bill lines by message key, never by English label — a label filter that
  stops matching reads as ₺0 instead of failing. Still English on purpose: catalogue content
  (projects, genres, traits, roles, rivals, subreddits, amenities, awards — step 4, translated
  at display time because award labels are map keys in saved ceremonies) and the Jobs wizard,
  Shop and build menu, which are being rebuilt.
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
Post       { id, projectId, projectName, subreddit, stage, claim, upvotes, hype,
             comment, burned, day }                                                     // BUILT
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

### Declared but not wired up (audited, and still true)

The doc has described a richer game than the code plays in three places. Kept here so the gap
is visible rather than rediscovered:

- ~~**`mood` is written nowhere**~~ — **fixed by the Shop (§7b).** It was read in two hot
  places (the show-up roll and the work rate) and written in none, which is the most
  expensive kind of dead stat: it looks live. The comforts are what write to it.
- **`commitment` drives nothing.** It is shown in the People panel and on the member card, but
  contracted hours (§3d) replaced it as the capacity number.
- **Five of the seven traits are type declarations only** — `scopeCreeper`, `mentor`,
  `gatekeeper`, `nightOwl` and `documenter` are never read. Only Perfectionist and Ghost do
  anything. Each is a Phase 5 job, and §13's rule applies: measure it against attendance.

## 14. Development Priority

**Phase 1.17 — A first-run tour, fuller printers, and a kickoff you cannot break — BUILT.**
A nine-step tour for first-time players (§11). The owner no longer sizes a kickoff table, so
joining a full crew no longer stops its meeting, and the bench says so at once (§4d). The
Printer Keeper fills *and* levels; the Host is the fourth keyholder. The A1 Mini Combo holds
four kilos. Opening cash is 100,000 / 50,000 / 10,000. Finish chips drop "night N".

**Phase 1.16 — The owner works, the wizard is honest, the factory is furnished — BUILT.**
The Project Manager is gone — it chose projects for the player — and the Technician, who
levels drifting printer beds between prints, took its slot. The owner picks up the oldest
running build when their hands are empty (§3a). The wizard locks design options the overdraft
cannot pay for and will not offer a Start it would refuse (§4c). Cash is green, red or plain.
The Old Factory gets four comforts: PlayStation Corner, Big-Screen TV, Espresso Bar, Nap Pod.

Measured (`era-pace`, 220 days, 8 seeds): normal first 7/8 (worst 2nd), hard 6/8 (worst
3rd), easy 8/8; first night 15 / 14 / 21 of 40. `sim-check`'s hands-off player now ships 22
rather than 6 in 150 days, because the owner works on their own — which is the feature.

**Phase 1.15 — Books that add up, and a project you can read — BUILT.**
A ledger behind every spend, so the monthly statement is income − costs = the month and the
balance agrees with it (§7a); the top bar shows cash only. Projects open to their own screen
(who made it, the design, how it was paid). People is a skill matrix you train from, with
courses shown on the bench. The crew step's size meter is the picker and shows each person's
stars. One design rating per build, and only the stages it visits. Printers: the A1 is
buyable, the H2S a size up, and Machines is a table. Part-time is gone. The trophy room is
open before the first ceremony. Sponsors no longer offer ₺0 for builds with no parts.

**Phase 1.14 — Crews that can, a room you can shape, a shorter year — BUILT.**
The wizard asks for the crew before the design, and the design's better options need crew who
can use them; a Learning Station trains people up one level at a time (§4c). Every design
option carries a cost that rises with its stars. Printers are bought in Build and past the
A1 they are cabinets that grow with the price; owned things read the same on every shelf;
pieces of the room sell from the move strip. The year is 100 days with awards on day 90. The
Old Factory is a fourth lease, the room has a front door, Socials is two panes, and a
space's finishes are a strip of chips. Panels keep their scroll while the sim redraws them.
`npm run kickoff-check` guards the rule that a kickoff needs the whole crew at once.

Measured (`era-pace`, 220 days, 8 seeds): normal first 8/8, hard 5/8, easy 8/8;
`project-times` 52/52. `sim-check`'s attentive player now ships about 42 in 150 days rather
than 64 — its crews are small, so its designs fall to one star where nobody has the skill,
which is the rule working; the campaign balance is where it was.

**Phase 1.13 — Designing projects and building the room — BUILT.**
The Jobs board is replaced by **+ New Project** (§4c): a brief, three star-rated design
decisions and a crew size, previewed by the same `planProject` the sim builds from. Projects
kick off round a **project table** with the whole crew seated at once, then work at
**one-person workstations** (§4d); a daily **market** per genre and the build's quality now
set what a release pays. **Build** replaces the Shop, with Workspace, Comforts and Decor
shelves and a rendered picture on every card.

Measured (`era-pace`, 8 seeds, against the same base without it): normal first in 8/8
either way, the first awards night unchanged at 16 of 40, final reputation about 17,000
against 23,000; hard first in 5/8 and never below third (8/8 before) — which is §3c's stated
shape for hard, "you usually win, you sometimes do not, and you are never buried"; easy
first in 8/8. `project-times` 52/52 with a furnished room. **Era pacing moved later** — Era 2
lands on day 61 in nearly every seed and Era 3 around day 120-215 — because the autoplayer
spends on desks and tables the cash it used to bank for the lease. That is the §7b shape
again: the room competes with the next lease, which is the decision.

Every string it added lives in its own i18n area, `src/i18n/{en,tr}/build.ts`, so the
feature's copy travels together. Design options, furniture and decor are *content*, and
stay English with the catalogue until the content files move.

**Phase 1.12 — The scene: identity, rivals and awards — BUILT.**
A start screen that names and badges the space (§3c), simulated rival hackerspaces whose
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
self-assignment, drift with burnout cooldowns, the Perfectionist and Ghost traits,
and the verbs Re-pitch / Bounty / Skip simulation / queue management / buy filament.
A playthrough runs 20-36 days depending on how hard the player pushes (§13).
**Still open, and only a human can answer it: is the loop fun?**

**Phase 2 — Reddit and hype — BUILT** (§6). Six rooms, the claim you make, hype that decays
every day and feeds recruitment, dues and sponsors. `npm run hype-check` measures whether the
hour it costs is worth spending. **Crowdfunding is still open** — it is the piece that turns
hype into a deadline you can miss, which is the sharpest version of the anti-drift clock.
**Phase 3 — Economy — BUILT.** Dues, rent, wages, metered consumables, the monthly statement
and eviction (§7a). **Phase 3.1 — the Shop — BUILT** (§7b): nine era-gated comforts that
raise mood, which was the one stat the doc described and nothing ever wrote to. They stand
in the room, they carry monthly upkeep, and what they really cost you is the next lease.
Phase 4 — Space builder: tile painting, machine placement, rooms, power, adjacency.
Phase 5 — Recruitment: events, policies, mood/commitment loop. *(The applicant pool is built:
twenty-three named applicants, dealt onto the reputation ladder in a new order every run — see §4b.)*
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
  - `npm run hype-check [seeds] [easy|normal|hard]` — prints the claim/room reaction table,
    then plays three players against each other: one who never posts, one who claims only what
    the work backs, and one who always claims the most. Run it after touching `HYPE`,
    `subreddits.ts` or `HypeSystem.ts`. **The careful player must beat both others**; when the
    reckless one wins, the claim is not a decision.
  - `npm run era-pace [seeds] [easy|normal|hard]` — what day each era arrives for a committed
    player, plus the final standings against the rival spaces. Plays 400 days by default
    (`DAYS=n` to change it) so a run reaches the first 1 December awards night. Run it after changing
    throughput, team sizes, the catalog, or anything in `rivals.ts` — **and run all three
    difficulties**, since they now hand the player different crews and a change that suits one
    can break another.
  - `NO_SHOP=1 npm run era-pace [seeds] [level]` — the same run with the Shop never opened.
    Run both after touching `amenities.ts` or `COMFORT`: a comfort is only worth its upkeep
    if the pair disagree, and §7b records what the gap currently is.
  - `TRACE=1 TRACE_SEED=n TRACE_FROM=d TRACE_DAYS=d [TRACE_LAYOUT=1] npm run era-pace` —
    prints one seed's day at half past ten: what everybody is doing and why, projects by
    stage, what the floor is short of, and with `TRACE_LAYOUT` every station's path from the
    door. Every stall in §4d was found with this, not by tuning.
  - `tools/furnish.ts` — the one furnishing rule every harness shares: buy the seat or table
    people are queueing for (`Simulation.workspaceNeeds`), when comfortably affordable.
  - `npm run kickoff-check` — a crew of four, one kept at home: the kickoff must not move
    without them, must move once all four sit down, and everybody must leave the table when
    it is done. Seen to fail with the rule broken; run it after touching the kickoff.
  - `npm run click-check` — needs `npm run dev` running. Drives the real UI with real mouse
    press/release pairs while the sim runs, and counts DOM rebuilds. Run it after touching
    anything in `src/ui/`.
  - Harness sources live in `tools/`, built via `vite.headless.config.ts` to `dist-headless/`.
- Debugging in the browser: `window.__store.getState()` and `window.__game.sim`.
- **The developer console** (`src/systems/DevConsole.ts`). Type `debug` anywhere in the
  game, or press the backtick key, and a console opens along the bottom. `help` lists what
  it can do: `cash +250000`, `rep 9000`, `hype`, `era 3`, `skip 20` (the clock really runs —
  bills land and awards are held on the way), `stage`/`ship` to push a project through,
  `shop all`, `printer x1c`, `people 5`, `unlock`.

  It exists because **the interesting states are the late ones** and reaching them honestly
  takes an hour of play. Testing a panel that only appears in Era 3 should not mean playing
  to Era 3. Two rules keep it from becoming a liability:

  - **It only calls public API** — `sim.dev.*` and the store's own actions — so it cannot
    put the game into a state the game could not reach by itself, and it cannot rot
    silently when the sim is refactored.
  - **Every command that changes something writes to the player's own log, marked `dev:`.**
    A run you doctored has to say so. Finding out later that a measurement came from a
    cheated save is worse than not having the console at all.

  One trap worth the line: the `g` that finished the magic word was being inserted into the
  input the word had just focused, so the first command every time was `ghelp`. A shortcut
  that opens a text field has to swallow its own last keystroke.
- Layout:
  - `src/game/` — `Game.ts` (orchestrator), `types.ts`, `store.ts`
  - `src/entities/` — `MemberEntity.ts` (state machine: idle → walk → work → idle),
    `PlayerEntity.ts` (you, plus the hour budget)
  - `src/machines/` — `Machine.ts` (queue + job execution), `layout.ts` (grid placement)
  - `src/systems/` — `Simulation.ts`, `ProjectSystem.ts`, `HypeSystem.ts`, `RivalSystem.ts`
  - `src/render/` — `SceneManager.ts`, `SpaceView.ts`
  - `src/ui/` — panels, modals, `styles.css`
  - `src/utils/` — `constants.ts` (**all balance numbers**), `catalog.ts` (**all project
    content**), `amenities.ts` (**the Shop**), `grid.ts`, `rng.ts`, `format.ts`
- Balance: every coefficient from §13 starts life in `src/utils/constants.ts`. Never inline a
  tuning number at a call site.
