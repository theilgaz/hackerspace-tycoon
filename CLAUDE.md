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
**Player control model:** **Indirect / influence-based.** Members are **volunteers, not employees.**
The player never drags a person onto a task. The player creates *conditions* (§3) and members
self-assign based on their passions. This is the single most important design decision and it
distinguishes the game from Game Corp DX / Game Dev Tycoon, where staff obey.

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

### Members
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

**Design rule:** there must never be an "assign to task" button. If the player is stuck, the answer
is always one of the five verbs above, not more direct control.

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

### Launch projects (Era 1-3)
FPV Drone · Pizza Oven · CNC Router · E-bike Conversion · 3D-Printed Motorcycle (Era 3 capstone)

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

## 8. Eras (progression)

| Era | Space | Unlocks | Milestone goal |
|---|---|---|---|
| 1 — Garage | 6×8, single-phase power | FDM printer, soldering bench, hand tools | Ship any project + 50 backers |
| 2 — Unit 4B | ~15×12, 3-phase | CNC, laser cutter, welding bay, certifications | 20 members + break even for 3 months |
| 3 — The Warehouse | large, multi-room | Mill/lathe, motorcycle-scale projects, grants | Front page of r/all |

Each era raises rent and unlocks project scale. Eras gate content and pacing; the milestone is a
checkpoint, not an instant transition — the player chooses when to sign the next lease.

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
- **UI:** HTML/CSS overlay panels. The 3D scene is observational.
- **Time:** 1 sim-hour = 2.5 real seconds at 1×. A day = 60 s at 1×. Speeds: pause / 1× / 2× / 4×.
  Machine jobs advance on sim time regardless of member attendance.
- **Architecture rule (inherited from `etliekmek-tycoon`, keep it):**
  management data (cash, roster, machines owned, upgrades, hype, era) lives in the **store**;
  sim-time data (member positions, machine job progress, project stage work) lives in the
  **Simulation**. The sim writes a `runtime` snapshot to the store at 5 Hz; **UI only ever reads the
  store.** Never let a panel reach into the Simulation directly.
- **Sim purity:** the Simulation must not import `three` and must not touch the DOM. It should be
  runnable headless — this is what makes balance testable.
- **Debugging:** `window.__store.getState()` in the console.
- **Saving:** `localStorage`, key `hackerspace-tycoon-save-v1`.

## 12. Core Data Models

```ts
Member    { id, name, skills, passions, energy, mood, commitment, traits, currentActivity }
Project   { id, name, tags, stage, scope, quality, parts[], defects[], signups[], deadline?, hypeEarned }
Part      { id, name, machineType, hours, material, status: 'pending'|'queued'|'done'|'failed' }
Machine   { id, type, tier, calibration, currentJob?, queue[], consumable, running }
Job       { id, projectId, partName, hoursRequired, progress, failureChance, materialCost }
Post      { id, projectId, subreddit, stage, claim, upvotes, comments[], hypeDelta }
Campaign  { id, projectId, goal, raised, backers, deadline, delivered }
Space     { era, tiles[][], rooms[], powerCapacity, rent }
Policy    { id, name, moodDelta, efficiencyDelta, active }
```

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

Two further findings, both now fixed and worth not re-introducing:

- **Walking is a time sink.** At a plausible-looking walk speed, volunteers spent 80% of
  their visit walking and 18% working, which tripled project length. `npm run time-budget`
  exists to catch this class of bug; keep walking under ~20% of present time.
- **Manual re-queue can soft-lock fabrication.** A failed part drops to `pending` and, if
  the player never notices, nothing ever restarts it. A present member now re-queues after
  12 accumulated hours of presence. The timer must accumulate *across visits* — requiring
  continuous presence means it never elapses, because volunteers come in 2-3 hour bursts.

## 14. Development Priority

**Phase 1 — Vertical slice: "One project, end to end." — BUILT.**
Fixed 6×8 garage, 3 volunteers, 1 FDM printer + benches, the FPV Drone run from Concept to
Release. No building, no Reddit, no hiring, no rent. Implemented: the eight-stage pipeline,
the machine job queue with continuous failure rolls and consumables, volunteer attendance,
self-assignment, drift with burnout cooldowns, the Perfectionist / Ghost / Night Owl traits,
and the verbs Re-pitch / Bounty / Skip simulation / queue management / buy filament.
A playthrough runs 20-36 days depending on how hard the player pushes (§13).
**Still open, and only a human can answer it: is the loop fun?**

Phase 2 — Reddit + hype + crowdfunding (the novel layer, on top of a real project).
Phase 3 — Economy: dues, rent, consumables, the monthly bill, eviction.
Phase 4 — Space builder: tile painting, machine placement, rooms, power, adjacency.
Phase 5 — Recruitment: applicant pool, events, policies, mood/commitment loop.
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
  - Harness sources live in `tools/`, built via `vite.headless.config.ts` to `dist-headless/`.
- Debugging in the browser: `window.__store.getState()` and `window.__game.sim`.
- Layout:
  - `src/game/` — `Game.ts` (orchestrator), `types.ts`, `store.ts`
  - `src/entities/` — `MemberEntity.ts` (state machine: idle → walk → work → idle)
  - `src/machines/` — `Machine.ts` (queue + job execution), `layout.ts` (grid placement)
  - `src/systems/` — `Simulation.ts`, `ProjectSystem.ts`, `FabSystem.ts`, later `HypeSystem.ts`
  - `src/render/` — `SceneManager.ts`, `SpaceView.ts`
  - `src/ui/` — panels, modals, `styles.css`
  - `src/utils/` — `constants.ts` (**all balance numbers**), `grid.ts`, `rng.ts`, `format.ts`
- Balance: every coefficient from §13 starts life in `src/utils/constants.ts`. Never inline a
  tuning number at a call site.
