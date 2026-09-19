# Hackerspace Tycoon

An isometric management sim about running a hackerspace.

> A hackerspace is a machine for *starting* projects. Your job is to make it *finish* one.

You don't have employees. You have **volunteers** — people with their own passions who sign up for
what excites them and drift away when it stops being interesting. You can't order anyone to do
anything. You pitch projects, post bounties, buy tools that act as magnets, run events, and set
policies people may or may not like.

Meanwhile the work is physical. Fabrication isn't a progress bar — it's jobs queued on machines that
run overnight, burn through filament, and fail at hour 19 of 22.

Post the build to Reddit to turn work into hype, turn hype into backers, and try to deliver what you
promised before the rent is due twice.

**Stack:** Three.js · TypeScript · Vite · Zustand

```bash
npm install
npm run dev          # http://localhost:5174
npm run typecheck
npm run build

npm run sim-check    # replay full playthroughs headlessly, under three player archetypes
npm run time-budget  # where a volunteer's day actually goes
```

The simulation imports neither `three` nor the DOM, so a whole playthrough replays in Node
in milliseconds. That is what makes the balance testable — and it has already caught a
fabrication soft-lock and a bug where volunteers spent 80% of every visit walking.

**Current state:** Phase 1 vertical slice. One garage, three volunteers, one printer, one
drone, Concept → Release. A run takes 20–36 days depending on how hard you push.

See [CLAUDE.md](./CLAUDE.md) for the full design document.
