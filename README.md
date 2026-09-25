# Hackerspace Tycoon

An isometric management sim about running a hackerspace.

> A hackerspace is a machine for *starting* projects. Your job is to make it *finish* one.

You don't have employees. You have **volunteers** — people with their own passions, their own
quirks, and nine-to-six lives. You can't put anyone on a task. You design builds and pick who
crews them, post bounties, buy the kit and the comforts that make people want to be there, and
decide when to sign for a bigger space.

You can also just do the work yourself. You're in the building from six in the morning to
eleven at night, with seventeen hours in the day — and every bounty, every parts order, every
hire comes out of the same hours. An hour at the CAD desk is an hour you didn't spend making the
place better at doing CAD without you.

Meanwhile the work is physical. Fabrication isn't a progress bar — it's jobs queued on printers
that run overnight, burn through filament and fail at hour 19 of 22. Half of any build arrives in
a box, and assembly waits for it. Build a CNC router, and now you own a CNC.

Runs in the browser, in English and Turkish. The version you are playing is on the start
screen; the latest is **v0.3.0** ([devlog](./docs/itch/devlog/v0.3.0.md)).

## What a run looks like

- **Name the place, pick a badge, open the doors.** You start in a garage with two people, Safa
  and Abdullah, and ₺50,000. Twenty-three more are out there; your reputation brings them to the
  door, in a different order every run.
- **+ New Project** is a five-step wizard: genre → brief → crew → design → review. The build
  arrives with its brief's name, which you can change. The crew comes before the design,
  because the crew decides what the design can be: a five-star toolchain needs somebody who can
  use it.
- **Four wings** — 💻 Software, 🔌 Electronics, 📡 Communications, ⚙️ Mechanical — and
  fifty-two briefs, from a phone stand to a 3D-printed motorcycle. Software pays the bills;
  hardware builds the name.
- **Every build starts round a table.** The kickoff only moves while the whole crew is sitting
  down together; then everybody goes to their own workstation, and the room is a constraint.
- **Everybody is somebody.** A Perfectionist won't sign off shoddy work, a Scope Creeper always
  has one more idea, a Mentor lifts the whole crew, a Night Owl watches the prints, a Ghost
  quietly stops turning up. When one of them does something, you hear about it.
- **Build mode** is where the room happens: desks, benches, printers, a coffee machine, a table
  tennis table. Comforts raise mood, which is what gets people through the door. Screens
  are on only while somebody works at them.
- **Every bigger build ships with a report**: quality, pay, reputation and days against what
  the design promised, and whether the client got what they asked for. Advertise it from
  there — a great new build pays back its campaign in sales, a weak one gets torn apart by
  an honest YouTube reviewer.
- **Socials** turns work into attention — and what you claim has to be backed by the work, or
  the room turns on you. Attention fades a little every day.
- **The calendar under the clock** shows today, the monthly bill, a client's deadline, parts
  arriving, and the awards night at the end of the year.
- **Seventeen other hackerspaces** — fourteen real ones, three invented underdogs — are getting
  on with it. A year is 60 days, and on day 55 there is an awards night: most projects, biggest
  crew, deepest pockets, space of the year and best project.
- **Four leases**: the Garage, Unit 4B, the Warehouse, the Old Factory. Reputation unlocks the
  next one; signing it is your call, and the room you arranged comes with you. You may run an overdraft down to −₺30,000 — get back above
  zero within 60 days, or the lease is gone.

## Development

**Stack:** Three.js · TypeScript · Vite · Zustand

```bash
npm install
npm run dev            # http://localhost:5174
npm run typecheck
npm run build
npm run itch           # release/hackerspace-tycoon-web-v<version>.zip, for itch.io's HTML upload
```

**Releasing to itch.io:** bump `version` in `package.json` (it is what the start screen shows),
write the devlog in `docs/itch/devlog/v<version>.md`, bring `docs/itch/description.md` up to
date if the game changed, then `npm run itch` and upload the zip.

The simulation imports neither `three` nor the DOM, so a whole playthrough replays in Node.
That is what makes the balance testable:

```bash
npm run sim-check      # full playthroughs under three player archetypes
npm run era-pace       # 8 seeds by default: era pacing, awards nights, final standings
npm run project-times  # every brief against its declared length tier
npm run hype-check     # does posting pay for the hour it costs?
npm run kickoff-check  # a kickoff needs the whole crew (or five of a big one)
npm run layout-check   # nothing is used from off the floor; a bigger room keeps the layout
npm run time-budget    # where a volunteer's day actually goes
npm run click-check    # drives the real UI with real mouse events (needs `npm run dev`)
```

Type `debug` in the game (or press the backtick key) for the developer console.

See [CLAUDE.md](./CLAUDE.md) for the full design document — every system, why it is the way it
is, and what each balance change measured.
