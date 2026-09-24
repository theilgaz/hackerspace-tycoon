/**
 * Clicking smoke test — the regression guard for a bug that shipped twice.
 *
 *   npm run dev          # in another terminal
 *   npm run click-check
 *
 * Drives the real UI with real `mousePressed` / `mouseReleased` pairs, with a gap between
 * them, while the sim is running at 4x. That gap is the whole point: panels re-render as
 * the clock advances, and if a re-render replaces the element between press and release
 * the browser never fires `click` at all — every button in the game goes dead the moment
 * you unpause.
 *
 * `element.click()` does NOT catch this. It dispatches a click event directly and skips
 * the press/release pairing entirely, which is exactly how the bug got through before.
 */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL_UNDER_TEST = process.env.GAME_URL ?? 'http://localhost:5174/';
const PORT = 9333;
const PROFILE = join(tmpdir(), `hst-click-check-${process.pid}`);
const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch {
      await sleep(125);
    }
  }
  throw new Error('timed out waiting for the browser');
}

try {
  await fetch(URL_UNDER_TEST);
} catch {
  console.error(`\n  No dev server at ${URL_UNDER_TEST}. Run "npm run dev" first.\n`);
  process.exit(2);
}

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--enable-unsafe-swiftshader',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1680,1050',
    `--user-data-dir=${PROFILE}`,
    URL_UNDER_TEST,
  ],
  { stdio: 'ignore' },
);

const cleanup = () => {
  chrome.kill();
  try {
    rmSync(PROFILE, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
};
process.on('exit', cleanup);

const target = await waitFor(async () => {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page' && t.url.startsWith(URL_UNDER_TEST.slice(0, 21)));
  if (!page) throw new Error('no page target');
  return page;
});

const ws = new WebSocket(target.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
const exceptions = [];
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    exceptions.push(
      msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text,
    );
  }
};
const send = (method, params = {}) => {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
};
await new Promise((resolve) => (ws.onopen = resolve));
await send('Runtime.enable');
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
await sleep(2500);

// awaitPromise matters: without it a promise-returning expression resolves to undefined
// and every assertion built on one silently fails.
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result
    ?.value;

/**
 * Press, wait, release — the gap is where a re-render would kill the click. 400ms is a
 * deliberately slow click: it reliably spans a 5 Hz panel refresh, which is what a real
 * click does on a slower machine or a heavier scene.
 */
async function click(selector, gapMs = 400) {
  const box = await evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 }); })()`,
  );
  if (!box) return false;
  const { x, y } = JSON.parse(box);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(gapMs);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(160);
  return true;
}

/** Open an overlay from a known state — a bar button sits under the backdrop when one is
 *  already open, so clicking it there closes the overlay instead. */
async function openPanel(action) {
  // A bill or an awards night is modal and has no jobs-close, so it has to be dismissed on
  // its own terms first — otherwise the bar button underneath is covered by the backdrop and
  // the click silently does nothing. That made this suite intermittent once already.
  for (const dismiss of ['bill-close', 'ceremony-close']) {
    if (await evaluate(`!!document.querySelector('[data-action="${dismiss}"]')`)) {
      await click(`[data-action="${dismiss}"]`);
    }
  }
  if (await evaluate(`document.querySelectorAll('#modal .modal').length > 0`)) {
    await click('#modal header [data-action="jobs-close"]');
  }
  await click(`[data-action="${action}"]`);
}
const openWizard = () => openPanel('new-open');

/**
 * Make sure there is something in flight and an hour to spend on it. Earlier checks run
 * tens of thousands of ticks, which can ship everything that was open — after which any
 * check about a running project fails for reasons that have nothing to do with the feature.
 */
async function ensureWorkInFlight() {
  await evaluate(`
    (() => {
      const sim = window.__game.sim;
      const st = __store.getState();
      st.earn(40000);
      sim.player.hoursLeft = 8;
      for (let i = 0; sim.projects.filter((p) => !p.shipped).length < 2 && i < 6; i += 1) {
        const offer = __store.getState().backlog[0];
        if (offer) sim.pitch(offer.defId, offer.id, []);
        else break;
      }
      // An empty backlog used to leave nothing in flight at all, and every check after this
      // one that needed a running build failed for a reason unrelated to its feature. Small
      // catalogue builds the garage can always make are the fallback.
      for (const id of ['phone-stand', 'led-badge', 'space-site', 'tool-booking', 'macropad']) {
        if (sim.projects.filter((p) => !p.shipped).length >= 2) break;
        if (!sim.projects.some((p) => p.defId === id && !p.shipped)) sim.pitch(id, undefined, []);
      }
      sim.publish();
      return sim.projects.length;
    })()
  `);
}

/**
 * The run opens with two people now, so after one build is running there is nobody free to
 * crew the next — and a wizard check fails on its precondition, not its feature. Take on
 * applicants (paying their fee from a top-up, as the dev console does) until a few are free.
 */
async function ensureFreeHands(n = 3) {
  await evaluate(`(() => { const sim = __game.sim;
    for (const id of [...__store.getState().applicants]) {
      if (sim.members.filter((m) => !m.team && !m.training).length >= ${n}) break;
      __store.getState().earn(sim.hireCost(id)); sim.hire(id);
    }
    sim.publish(); })()`);
}

const results = [];
/**
 * Every check runs with the clock stopped unless it says `{ live: true }`.
 *
 * **Why:** this suite was intermittent — a different check failed on roughly every other
 * run, and the same happened on older commits, so it was the suite and not the game. The
 * sim was left running at up to 4x between and during checks, so a check's count could go
 * stale between reading it and clicking (a build shipped, a volunteer joined a crew), and a
 * bill or an awards night could open over the very button about to be pressed. A check
 * about *logic* has to see a world that holds still.
 *
 * The checks that exist to prove clicks survive a constantly redrawing screen stay `live`:
 * pausing them would test nothing, because a paused sim stops republishing and the panels
 * stop rebuilding.
 */
const check = async (name, fn, { live = false } = {}) => {
  const wasPaused = await evaluate(`__store.getState().paused`);
  if (!live && wasPaused === false) await evaluate(`__store.getState().setPaused(true)`);
  let ok = false;
  try {
    ok = await fn();
  } finally {
    // Only give the clock back if this check took it, and only if the run is still going.
    if (!live && wasPaused === false) {
      await evaluate(`(() => { const st = __store.getState(); if (!st.gameOver && st.started) st.setPaused(false); })()`);
    }
  }
  results.push({ name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
};

console.log('\n  Clicking the real UI while the sim runs\n');

// The start screen gates everything: name the place and open the doors first.
await check('start screen opens the game', async () => {
  const hasStart = await evaluate(`document.querySelectorAll('#start .start-card').length === 1`);
  await evaluate(`document.querySelector('#space-name').value = 'Test Alanı'`);
  await click('[data-action="logo"][data-value="2"]');
  await evaluate(`document.querySelector('#space-name').value = 'Test Alanı'`);
  await click('[data-action="begin"]');
  const started = await evaluate(`__store.getState().started`);
  const named = await evaluate(`__store.getState().identity?.name`);
  return hasStart && started === true && named === 'Test Alanı';
});

// A fresh browser is a first-time player: the tour opens on its own, stops the clock, waits
// for a real press on a Do step, steps back when the wizard is closed unused, and gives the
// clock back when skipped.
await check('a first run is shown round, and the tour gets out of the way', async () => {
  const card = () => evaluate(`(() => { const el = document.querySelector('#tour-card');
    return el && el.style.display === 'block' ? (el.querySelector('.tour-count')?.textContent ?? '') : 'hidden'; })()`);
  const opened = await card();
  const paused = await evaluate(`__store.getState().paused`);
  await click('#tour-card [data-action="tour-next"]');
  await click('#tour-card [data-action="tour-next"]');
  const waiting = await card();
  await click('[data-action="new-open"]');
  const onWizard = await card();
  await click('#modal header [data-action="jobs-close"]');
  const backToNew = await card();
  await click('#tour-card [data-action="tour-skip"]');
  const gone = await card();
  const running = await evaluate(`!__store.getState().paused`);
  const remembered = await evaluate(`localStorage.getItem('hackerspace-tycoon-toured')`);
  const ok = opened.startsWith('1/') && paused === true && waiting.startsWith('3/') && onWizard.startsWith('4/') &&
    backToNew.startsWith('3/') && gone === 'hidden' && running === true && remembered === '1';
  if (!ok) console.log(`      ${JSON.stringify({ opened, paused, waiting, onWizard, backToNew, gone, running, remembered })}`);
  return ok;
}, { live: true });

// Walk the New Project wizard the way a player does: genre, brief, crew, design, review.
/** Tick people until the crew is as big as the size says — nobody is picked for you now. */
async function pickCrew() {
  for (let i = 0; i < 10; i += 1) {
    const [picked, size] = ((await evaluate(`document.querySelector('#modal [data-crew]')?.dataset.crew`)) ?? '0/0')
      .split('/')
      .map(Number);
    if (picked >= size) return;
    if (!(await click('#modal .crew-pick[aria-pressed="false"]:not([disabled])'))) {
      // Fewer free people than the size: take a size that fits.
      await click('#modal [data-action="np-seats"][data-value="1"]');
    }
  }
}

async function walkWizard({ start = true } = {}) {
  await click('#modal [data-action="np-genre"]:not([disabled])');
  await click('#modal [data-action="np-brief"]:not([disabled])');
  await pickCrew();
  await click('#modal [data-action="np-next"]');
  await click('#modal [data-action="np-next"]');
  if (start) {
    // Every build is named now; the suggestion is a name like any other.
    await click('#modal [data-action="np-name-suggest"]');
    await click('#modal [data-action="np-start"]:not([disabled])');
  }
}
await click('[data-action="new-open"]');
await walkWizard();
await evaluate(`window.__store.getState().setSpeed(3)`);
await sleep(500);

await check('the wizard started a project', async () => (await evaluate(`__game.sim.projects.length`)) > 0);
await check('New Project opens while a project runs', async () => {
  await openWizard();
  return (await evaluate(`document.querySelectorAll('#modal .modal').length`)) === 1;
});
await check('a second project can be started with one already running', async () => {
  await ensureFreeHands();
  await walkWizard();
  return (await evaluate(`__game.sim.projects.length`)) >= 2;
});
await check('the wizard keeps one size across every step', async () => {
  const box = () =>
    evaluate(`(() => { const el = document.querySelector('#modal .modal');
      if (!el) return 'none';
      const r = el.getBoundingClientRect();
      return Math.round(r.width) + 'x' + Math.round(r.height) + '@' + Math.round(r.y); })()`);
  await openWizard();
  const sizes = [await box()];
  await click('#modal [data-action="np-genre"]:not([disabled])');
  sizes.push(await box());
  await click('#modal [data-action="np-brief"]:not([disabled])');
  await pickCrew();
  sizes.push(await box());
  await click('#modal [data-action="np-next"]');
  sizes.push(await box());
  await click('#modal [data-action="np-next"]');
  sizes.push(await box());
  const unique = [...new Set(sizes)];
  if (unique.length !== 1) console.log(`      sizes seen: ${unique.join(' | ')}`);
  return unique.length === 1 && unique[0] !== 'none';
});

await check('a design choice is a press, and it sticks', async () => {
  await ensureFreeHands();
  await openWizard();
  await click('#modal [data-action="np-genre"]:not([disabled])');
  await click('#modal [data-action="np-brief"]:not([disabled])');
  await pickCrew();
  await click('#modal [data-action="np-next"]');
  // One star is always available, whatever the crew can do, so it is the press to test.
  const target = `#modal [data-action="np-option"][data-id="0"]:not([disabled])`;
  const axis = await evaluate(`document.querySelector('${target}')?.dataset.value`);
  await click(target);
  const pressed = await evaluate(
    `document.querySelector('#modal [data-action="np-option"][data-value="${axis}"][data-id="0"]')?.getAttribute('aria-pressed')`,
  );
  const others = await evaluate(
    `document.querySelectorAll('#modal [data-action="np-option"][data-value="${axis}"][aria-pressed="true"]').length`,
  );
  if (pressed !== 'true' || others !== 1) console.log(`      axis ${axis}: pressed ${pressed}, on ${others}`);
  return pressed === 'true' && others === 1;
});

await check('the crew step starts empty, and only a full crew moves on', async () => {
  // The projects started above can take everybody, and then there is nobody to suggest —
  // which is correct and tests nothing. Free one person first.
  await evaluate(`(() => { const sim = __game.sim;
    if (!sim.members.some((m) => !m.team && !m.training)) {
      const m = sim.members.find((x) => x.team);
      if (m) sim.releaseMember(m.team, m.id);
    }
    sim.publish(); })()`);
  await openWizard();
  await click('#modal [data-action="np-genre"]:not([disabled])');
  await click('#modal [data-action="np-brief"]:not([disabled])');
  // Nobody is ticked for you (an auto-picked crew the player then edited ran builds with
  // people nobody chose), and Next stays shut until the crew is as big as the size.
  const pressed = await evaluate(`document.querySelectorAll('#modal .crew-pick[aria-pressed="true"]').length`);
  const shutEmpty = await evaluate(`document.querySelector('#modal [data-action="np-next"]')?.disabled === true`);
  await pickCrew();
  const openFull = await evaluate(`document.querySelector('#modal [data-action="np-next"]')?.disabled === false`);
  const ok = pressed === 0 && shutEmpty && openFull;
  if (!ok) console.log(`      pre-picked ${pressed}, next shut while empty ${shutEmpty}, open once full ${openFull}`);
  return ok;
});

await check('typing a build\'s name keeps the focus while the panel redraws', async () => {
  // The review redraws several times a second and its Start button carries the name, so the
  // input used to be replaced under the caret on every keystroke. Typed with real key
  // events while the clock runs — the redraw is the whole point.
  await evaluate(`__store.getState().setSpeed(4)`);
  await evaluate(`__store.getState().setPaused(false)`);
  await openWizard();
  await click('#modal [data-action="np-genre"]:not([disabled])');
  await click('#modal [data-action="np-brief"]:not([disabled])');
  await pickCrew();
  await click('#modal [data-action="np-next"]');
  await click('#modal [data-action="np-next"]');
  await click('#np-name');
  for (const ch of 'Neon Kestrel') {
    await send('Input.insertText', { text: ch });
    await sleep(90);
  }
  const value = await evaluate(`document.querySelector('#np-name')?.value`);
  const focused = await evaluate(`document.activeElement?.id`);
  await click('#modal header [data-action="jobs-close"]');
  const ok = value === 'Neon Kestrel' && focused === 'np-name';
  if (!ok) console.log(`      value "${value}", focused ${focused}`);
  return ok;
}, { live: true });

await check('a design the overdraft cannot pay for cannot be started', async () => {
  const before = await evaluate(`__store.getState().cash`);
  // Right on the floor: even a one-star design budget would go past it. Paused, because a
  // running clock would charge upkeep past the floor and end the run under the next check.
  await evaluate(`(() => { __store.getState().setPaused(true); __store.setState({ cash: -30000, overdraftSince: null });
    __game.sim.publish(); })()`);
  await openWizard();
  await click('#modal [data-action="np-genre"]:not([disabled])');
  await click('#modal [data-action="np-brief"]:not([disabled])');
  await pickCrew();
  await click('#modal [data-action="np-next"]');
  const lockedFive = await evaluate(`document.querySelectorAll('#modal [data-action="np-option"][data-id="2"]:not([disabled])').length`);
  await click('#modal [data-action="np-next"]');
  const startDisabled = await evaluate(`document.querySelector('#modal [data-action="np-start"]')?.disabled`);
  await click('#modal header [data-action="jobs-close"]');
  await evaluate(`(() => { __store.setState({ cash: ${before}, overdraftSince: null, gameOver: null });
    __store.getState().setPaused(false); __game.sim.publish(); })()`);
  if (!(lockedFive === 0 && startDisabled === true)) console.log(`      unlocked five-star ${lockedFive}, start disabled ${startDisabled}`);
  return lockedFive === 0 && startDisabled === true;
});

await check('breadcrumb jumps back to a completed step', async () => {
  await openWizard();
  await click('#modal [data-action="np-genre"]:not([disabled])');
  await click('#modal [data-action="np-brief"]:not([disabled])');
  await pickCrew();
  await click('#modal [data-action="np-next"]');
  const onCrew = await evaluate(`document.querySelector('#modal .step.now')?.dataset.step`);
  // Jump straight past the crew and brief steps back to the first one.
  await click('#modal button.step[data-value="genre"]');
  const afterJump = await evaluate(`document.querySelector('#modal .step.now')?.dataset.step`);
  // Steps that are not yet reached must not be clickable.
  const aheadClickable = await evaluate(`document.querySelectorAll('#modal button.step').length`);
  if (onCrew !== 'design' || afterJump !== 'genre') {
    console.log(`      design step read "${onCrew}", after jump "${afterJump}"`);
  }
  return onCrew === 'design' && afterJump === 'genre' && aheadClickable === 0;
});

await check('closing the wizard', async () => {
  await openWizard();
  await click('#modal header [data-action="jobs-close"]');
  return (await evaluate(`document.querySelectorAll('#modal .modal').length`)) === 0;
});
await check('speed button', async () => {
  await click('[data-action="speed"][data-value="2"]');
  return (await evaluate(`__store.getState().speed`)) === 2;
}, { live: true });
await check('work on a project (button inside a constantly redrawing panel)', async () => {
  await click('[data-action="work"]');
  return Boolean(await evaluate(`__game.sim.player.project`));
}, { live: true });
await check('buy a spool (machines overlay redraws every snapshot)', async () => {
  const before = await evaluate(`__store.getState().runtime.machines[0].consumable`);
  await evaluate(`__game.sim.printer.consumable = 100; __game.sim.publish();`);
  await openPanel('machines-open');
  const shown = await evaluate(`document.querySelectorAll('#modal .machine-table tbody tr').length > 0`);
  await click('#modal [data-action="filament"]');
  const after = await evaluate(`__store.getState().runtime.machines[0].consumable`);
  await click('#modal header [data-action="jobs-close"]');
  return shown && after > 100 && before !== undefined;
}, { live: true });
await check('player stays on the project across stage changes', async () =>
  evaluate(`
    (() => {
      const sim = window.__game.sim;
      const id = sim.player.project;
      if (!id) return false;
      for (let i = 0; i < 40000; i += 1) {
        sim.tick(0.05, 4);
        const p = sim.project(id);
        if (!p) return true;               // shipped with the player aboard throughout
        if (sim.player.project !== id) return false;
        for (const q of sim.projects) {
          if (!q.partsOrdered && __store.getState().cash >= q.bomCost) sim.orderParts(q.id);
          if (q.stage === 'fabrication' && q.parts.some((x) => x.status === 'pending')) {
            sim.queueAllPending(q.id);
          }
        }
        if (sim.printer.consumable < 250) sim.buyFilament();
      }
      return false;
    })()
  `),
);
// The mechanism itself: an unchanged panel must keep its DOM nodes. When the clock alone
// rebuilt every panel 60x a second, the element under the cursor was destroyed between
// press and release and the browser never fired `click` — every button went dead on
// unpause. Counting rebuilds catches that directly, where a click test only catches it
// by luck of timing.
await check('People opens and hiring works', async () => {
  if (await evaluate(`document.querySelectorAll('#modal .modal').length > 0`)) {
    await click('#modal header [data-action="jobs-close"]');
  }
  // Give it enough reputation that somebody is interested.
  await evaluate(`
    (() => {
      const sim = window.__game.sim;
      for (let i = 0; i < 40000 && __store.getState().applicants.length === 0; i += 1) {
        sim.tick(0.05, 4);
        const st = __store.getState();
        if (sim.player.hoursLeft >= 2 && sim.projects.length < 2 && st.backlog[0]) {
          sim.pitch(st.backlog[0].defId, st.backlog[0].id, []);
        }
        for (const p of sim.projects) {
          if (!p.partsOrdered && st.cash >= p.bomCost) sim.orderParts(p.id);
          if (p.stage === 'fabrication' && p.parts.some((x) => x.status === 'pending')) sim.queueAllPending(p.id);
        }
        if (sim.printer.consumable < 250) sim.buyFilament();
        if (!sim.player.project && sim.player.present && sim.player.hoursLeft > 0) {
          const t = sim.projects.find((p) => p.required[p.stage] > 0);
          if (t) sim.workOn(t.id);
        }
      }
      return __store.getState().applicants.length;
    })()
  `);
  // The first person now gets in touch around the same day as the first bill, and the bill
  // is modal — so clear it or People opens behind it and there is nothing to click.
  if (await evaluate(`!!document.querySelector('[data-action="bill-close"]')`)) {
    await click('[data-action="bill-close"]');
  }
  // This check is about the panel wiring, not the economy: make sure the hire is
  // affordable so a spent day cannot make it flaky.
  await evaluate(`
    (() => {
      __game.sim.player.hoursLeft = 6;
      __store.getState().earn(20000);
      __game.sim.publish();
    })()
  `);
  await click('[data-action="people-open"]');
  // Candidates live behind their own tab now, reached from the banner above the roster —
  // the banner being there at all is half of what this checks.
  const banner = await evaluate(`!!document.querySelector('#modal .candidate-banner [data-action="people-tab"]')`);
  if (!banner) {
    console.log('      no candidate banner');
    return false;
  }
  await click('#modal .candidate-banner [data-action="people-tab"]');
  const before = await evaluate(`__game.sim.members.length`);
  const hireable = await evaluate(`document.querySelectorAll('#modal [data-action="hire"]:not([disabled])').length`);
  await click('#modal [data-action="hire"]:not([disabled])');
  const after = await evaluate(`__game.sim.members.length`);
  if (!(hireable > 0 && after === before + 1)) {
    console.log(`      hireable=${hireable} roster ${before} -> ${after}`);
  }
  return hireable > 0 && after === before + 1;
});

await check('People: passing on a candidate removes them, and the roster fits without scrolling', async () => {
  const open = await evaluate(`__store.getState().applicants.length`);
  if (open && !(await evaluate(`!!document.querySelector('#modal .candidates')`))) {
    await click('#modal .candidate-banner [data-action="people-tab"]');
  }
  const passed = open
    ? await (async () => {
        await click('#modal [data-action="pass-applicant"]');
        return (await evaluate(`__store.getState().applicants.length`)) === open - 1;
      })()
    : true;
  await click('#modal [data-action="people-tab"][data-value="all"]');
  // The table used to be wider than the modal; the roster should be read without a scrollbar.
  const overflow = await evaluate(`(() => {
    const body = document.querySelector('#modal .modal-body');
    return body && document.querySelector('#modal .people-table') ? body.scrollWidth - body.clientWidth : -1;
  })()`);
  const ok = passed && overflow === 0;
  if (!ok) console.log(`      passed ${passed}, horizontal overflow ${overflow}px`);
  return ok;
});

/**
 * Build mode (§7b): picking from the shelves buys nothing; a tile click asks, and only
 * yes pays. The tile is chosen the way a player would — a real press on the canvas over a
 * tile the sim says is legal.
 */
async function enterBuild() {
  if (!(await evaluate(`__store.getState().buildMode`))) await openPanel('build-open');
}
async function leaveBuild() {
  if (await evaluate(`__store.getState().buildMode`)) await click('#buildpanel [data-action="build-exit"]');
}
/** Press on the centre of a floor tile, through the game's own camera. */
async function clickTile(x, y) {
  const pt = JSON.parse(await evaluate(`(() => {
    const V = __game.scene.camera.position.constructor;
    const grid = __game.gridSize();
    return JSON.stringify(__game.scene.project(new V(${x} - (grid.width - 1) / 2, 0, ${y} - (grid.height - 1) / 2)));
  })()`));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(80);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await sleep(200);
}
async function legalTile(kind, id) {
  return JSON.parse(await evaluate(`(() => {
    const g = __game.gridSize();
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++)
      if (__game.sim.canPlaceNew({ kind: '${kind}', id: '${id}' }, x, y)) return JSON.stringify({ x, y });
    return 'null';
  })()`));
}

await check('Build: picking a desk buys nothing; the tile asks, and yes puts it there', async () => {
  await evaluate(`__store.getState().earn(20000)`);
  const before = await evaluate(`__store.getState().runtime.seats['cad-desk'] ?? 0`);
  await enterBuild();
  const pictures = await evaluate(`document.querySelectorAll('#buildpanel .build-thumb img').length`);
  await click('#buildpanel [data-action="build-shelf"][data-value="work"]');
  await click('#buildpanel [data-action="build-pick"][data-value="furniture:software-station"]:not([disabled])');
  const cashPicked = await evaluate(`__store.getState().cash`);
  const tile = await legalTile('furniture', 'software-station');
  if (tile) await clickTile(tile.x, tile.y);
  const asked = await evaluate(`!!document.querySelector('#buyconfirm [data-action="buy-yes"]')`);
  const cashAsked = await evaluate(`__store.getState().cash`);
  await click('#buyconfirm [data-action="buy-yes"]');
  await sleep(300);
  const after = await evaluate(`__store.getState().runtime.seats['cad-desk'] ?? 0`);
  const landed = await evaluate(`Object.values(__store.getState().stationPlacements).some((p) => p.x === ${tile?.x ?? -1} && p.y === ${tile?.y ?? -1})`);
  await leaveBuild();
  const ok = after === before + 1 && pictures >= 5 && asked && cashAsked === cashPicked && landed;
  if (!ok) console.log(`      seats ${before} → ${after}, pictures ${pictures}, asked ${asked}, cash moved before yes ${cashAsked !== cashPicked}, landed ${landed}`);
  return ok;
});

await check('Build: saying no buys nothing, and outside Build nothing in the room lifts', async () => {
  await enterBuild();
  await click('#buildpanel [data-action="build-shelf"][data-value="decor"]');
  await click('#buildpanel [data-action="build-pick"][data-value="amenity:rubber-duck"]:not([disabled])');
  const cash = await evaluate(`__store.getState().cash`);
  const tile = await legalTile('amenity', 'rubber-duck');
  if (tile) await clickTile(tile.x, tile.y);
  await click('#buyconfirm [data-action="buy-no"]');
  const noDuck = await evaluate(`!__store.getState().amenities.includes('rubber-duck') && __store.getState().cash === ${cash}`);
  await leaveBuild();
  // A press on a bench outside Build mode must not pick it up. Aimed at a station that is
  // actually standing in the room — a fresh run has no saved placements to read one from,
  // and a check with nothing to click passed while the rule was broken.
  const pt = JSON.parse(await evaluate(`(() => {
    // One the canvas is actually on top at — a station under the bench panel takes no click.
    // Aimed at its top, not its footprint: a ray to the floor under a desk goes between the
    // legs and hits nothing, which is a check that clicks and never touches anything.
    for (const node of __game.view.pickables) {
      const p = __game.scene.project(node.position.clone().setY(0.6));
      if (document.elementFromPoint(p.x, p.y)?.tagName !== 'CANVAS') continue;
      if (__game.scene.pick(p.x, p.y, __game.view.pickables)) return JSON.stringify(p);
    }
    return 'null';
  })()`));
  if (pt) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(80);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(200);
  }
  const lifted = await evaluate(`__store.getState().moving`);
  await evaluate(`__store.getState().setMoving(null)`);
  const ok = noDuck && !!pt && !lifted;
  if (!ok) console.log(`      no duck ${noDuck}, aimed ${!!pt}, lifted outside Build ${lifted}`);
  return ok;
});

await check('Ranking: a lean sortable table that fits without scrolling', async () => {
  // The standings were cut to three columns on purpose (ships this year, crew, reputation):
  // nine scrolled sideways and most were numbers nobody reads a leaderboard for, and the
  // awards moved to a footnote. This check asked for seven award columns for a long time
  // after that, failing on every run — a check nobody can make pass is one nobody reads.
  await openPanel('ranking-open');
  const read = () =>
    evaluate(`JSON.stringify((() => {
      const body = document.querySelector('#modal .modal-body');
      const heads = [...document.querySelectorAll('#modal .standings-table th [data-action="rank-sort"]')];
      return {
        sortable: heads.length,
        sorted: document.querySelector('#modal .standings-table th.sorted [data-action="rank-sort"]')?.dataset.value ?? null,
        rows: document.querySelectorAll('#modal .standings-table tbody tr').length,
        overflow: body ? body.scrollWidth - body.clientWidth : -1,
      };
    })())`).then(JSON.parse);
  const before = await read();
  // Sort by crew, and the crew column is the one marked.
  await click('#modal .standings-table [data-action="rank-sort"][data-value="members"]');
  const after = await read();
  const ok =
    before.sortable === 3 && before.rows >= 18 && before.overflow === 0 && after.sorted === 'members';
  if (!ok) console.log(`      ${JSON.stringify({ before, after })}`);
  return ok;
});

await check('Trophy room: four views off two switches', async () => {
  // Two awards nights, planted rather than played: reaching October twice takes 250 sim-days
  // and the thing under test is the wiring, not the ceremony.
  await evaluate(`
    (() => {
      const cats = ['Most Projects', 'Biggest Crew', 'Deepest Pockets', 'Space of the Year',
        'Best Project'];
      const ceremonies = [2026, 2027].map((year, i) => ({
        year,
        awards: cats.map((category, j) => {
          const mine = (i + j) % 3 === 0;
          return {
            category, blurb: '', winnerId: mine ? 'player' : 'konya',
            winnerName: mine ? 'Test Alanı' : 'Konya Hackerspace',
            value: j + ' shipped', playerWon: mine,
          };
        }),
        reputationGained: 160,
        // Where the field stood that night — what the rank chart plots.
        standings: ['player', 'konya', 'c-base'].map((sid, k) => ({
          id: sid,
          rank: ((k + i) % 3) + 1,
          reputation: 900 + i * 1200 + k * 50,
        })),
      }));
      __store.setState({ ceremonies });
    })()
  `);
  await openPanel('ranking-open');
  await click('#modal [data-action="rank-view"][data-value="trophies"]');
  // By year is one night at a time: seven categories, and a pill per year to page between.
  const night = await evaluate(`document.querySelectorAll('#modal .trophy-cell').length`);
  const pills = await evaluate(`document.querySelectorAll('#modal .year-pill').length`);
  const opensOnNewest = await evaluate(
    `document.querySelector('#modal .year-pill[aria-pressed="true"]')?.textContent.trim().startsWith('2027')`,
  );
  await click('#modal .year-pill[data-value="2026"]');
  const paged = await evaluate(
    `document.querySelector('#modal .trophy-single thead th:last-child')?.textContent.includes('2026')`,
  );

  // All time organises by space: one row per space that has won something, plus you.
  await click('#modal [data-action="trophy-mode"][data-value="all"]');
  const league = await evaluate(`document.querySelectorAll('#modal .trophy-league tbody tr').length`);
  const totals = await evaluate(
    `[...document.querySelectorAll('#modal .trophy-league td.trophy-total')].map((td) => td.textContent.trim()).join(',')`,
  );

  // A column head is the way into that category; the crumb is the way back out.
  await click('#modal .league-col [data-action="trophy-cat"]');
  const scoped = await evaluate(`document.querySelector('#modal .trophy-scope b')?.textContent.trim()`);
  await click('#modal [data-action="trophy-mode"][data-value="year"]');
  const years = await evaluate(`document.querySelectorAll('#modal .trophy-single tbody tr').length`);
  await click('#modal [data-action="trophy-cat"][data-value=""]');
  // Back at every category, the scope side of the bar is the year strip itself.
  const back = await evaluate(`document.querySelectorAll('#modal .year-pill').length`);

  // 7 categories x 2 years, two spaces on the board, one row per year in a category.
  const ok = night === 5 && pills === 2 && opensOnNewest === true && paged === true &&
    league === 2 && totals === '7,3' && scoped === 'Most Projects' &&
    years === 2 && back === 2;
  if (!ok) {
    console.log(`      night ${night}, pills ${pills}, newest ${opensOnNewest}, paged ${paged}, league rows ${league}, totals ${totals}, scoped ${scoped}, years ${years}, back ${back}`);
  }
  return ok;
});

await check('Ranking: a row opens that space, and Escape comes back', async () => {
  await openPanel('ranking-open');
  // The previous check left the panel in the trophy room; the standings are a tab away.
  await click('#modal [data-action="rank-view"][data-value="table"]');
  // Your own row: the one space the planted standings above are guaranteed to carry, and
  // the case that matters most anyway.
  await click('#modal .standings-table tbody tr.me');
  const shape = JSON.parse(
    await evaluate(`JSON.stringify((() => {
      const detail = document.querySelector('#modal .space-detail');
      return {
        open: !!detail,
        name: document.querySelector('#modal .space-head-text b')?.textContent.trim() ?? '',
        crumb: document.querySelector('#modal .trophy-scope b')?.textContent.trim() ?? '',
        stats: document.querySelectorAll('#modal .stat').length,
        fits: detail ? detail.scrollWidth - detail.clientWidth : -1,
        // One point per night that recorded a table, and only the ends are labelled.
        // One finish chip per awards night (the line chart it replaced drew circles).
        points: document.querySelectorAll('#modal .finish-chip').length,
        marks: document.querySelectorAll('#modal .finish-chip b').length,
      };
    })())`),
  );
  // Escape pops the drill-in before it closes the panel (§11: one layer at a time).
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(220);
  const backOnTable = await evaluate(
    `!document.querySelector('#modal .space-detail') && !!document.querySelector('#modal .standings-table')`,
  );
  const ok = shape.open && shape.stats === 8 && shape.fits === 0 && shape.points === 2 &&
    shape.marks === 2 && shape.name.startsWith(shape.crumb) && backOnTable === true;
  if (!ok) console.log(`      ${JSON.stringify(shape)}, back on table ${backOnTable}`);
  return ok;
});

await check('Projects: opens on In progress, and the filter narrows one list', async () => {
  await ensureWorkInFlight();
  await openPanel('projects-open');
  const count = () => evaluate(`document.querySelectorAll('#modal .rank-table tbody tr').length`);
  const totals = JSON.parse(
    await evaluate(`JSON.stringify({ done: __store.getState().shipped.length,
                                     failed: __store.getState().failed.length,
                                     open: __store.getState().runtime.projects.length })`),
  );
  // What is running is what you open the panel to look at.
  const opensOn = await evaluate(`document.querySelector('#modal [data-action="projects-tab"][aria-pressed="true"]')?.dataset.value`);
  const first = await count();
  await click('#modal [data-action="projects-tab"][data-value="all"]:not([disabled])');
  const all = await count();
  await click('#modal [data-action="projects-tab"][data-value="done"]:not([disabled])');
  const onlyDone = await count();
  await click('#modal [data-action="projects-tab"][data-value="on"]:not([disabled])');
  const onlyOpen = await count();
  // All really is everything, and each filter really is its own slice of it.
  const ok =
    totals.done > 0 && totals.open > 0 && opensOn === 'on' && first === totals.open &&
    all === totals.done + totals.open + totals.failed && onlyDone === totals.done && onlyOpen === totals.open;
  if (!ok) {
    console.log(`      opens on ${opensOn} (${first}), all ${all}, done ${onlyDone}/${totals.done}, open ${onlyOpen}/${totals.open}, failed ${totals.failed}`);
  }
  return ok;
});

await check('Projects: a row opens that project, and the crumb comes back', async () => {
  await ensureWorkInFlight();
  await openPanel('projects-open');
  await click('#modal tr.row-link[data-action="project-detail"]');
  const open = await evaluate(`!!document.querySelector('#modal .detail-grid') && document.querySelectorAll('#modal .detail-crew tr').length > 0`);
  await click('#modal [data-action="project-detail"][data-id=""]');
  const back = await evaluate(`!document.querySelector('#modal .detail-grid') && !!document.querySelector('#modal tr.row-link')`);
  await click('#modal header [data-action="jobs-close"]');
  if (!(open && back)) console.log(`      detail open ${open}, back on the list ${back}`);
  return open && back;
});

await check('People: pressing a skill sends somebody on a course, and the bench shows it', async () => {
  await evaluate(`(() => { __store.getState().earn(20000); __game.sim.buyFurniture('learning-station');
    for (const m of __game.sim.members) if (m.team) __game.sim.releaseMember(m.team, m.id); __game.sim.publish(); })()`);
  await openPanel('people-open');
  const cell = await evaluate(`document.querySelector('#modal .skill-btn:not([disabled])')?.dataset.id ?? null`);
  const skill = await evaluate(`document.querySelector('#modal .skill-btn:not([disabled])')?.dataset.value ?? null`);
  // The cell opens the Learning Station with this person and skill picked — it does not
  // start anything by itself. A second person for the other chair can be added there.
  await click('#modal .skill-btn:not([disabled])');
  const opened = await evaluate(`!!document.querySelector('#modal .train-row.on[data-id=${JSON.stringify(cell)}]')`);
  const notYet = await evaluate(`!__game.sim.members.some((m) => m.id === ${JSON.stringify(cell)} && m.training)`);
  // The second chair: somebody else free for the same skill *and level* — a course is one
  // level, and a pick in another level's group switches the course rather than adding to it.
  const second = await evaluate(`document.querySelector('#modal .train-group--on .train-row:not(.on):not([disabled])')?.dataset.id ?? null`);
  if (second) await click(`#modal .train-row[data-id="${second}"]`);
  await click('#modal [data-action="train-start"]:not([disabled])');
  const onCourse = await evaluate(`__game.sim.members.filter((m) => m.training?.skill === ${JSON.stringify(skill)}).length`);
  await click('#modal header [data-action="jobs-close"]');
  await sleep(300);
  const bench = await evaluate(`document.querySelectorAll('.bench-training .trainee').length`);
  const ok = Boolean(cell) && opened && notYet && onCourse >= (second ? 2 : 1) && bench > 0;
  if (!ok) console.log(`      cell ${cell}, opened ${opened}, waited ${notYet}, on the course ${onCourse} (second ${second}), bench rows ${bench}`);
  return ok;
});

await check('Build: buying a printer puts one on the floor', async () => {
  await evaluate(`(() => { __store.getState().earn(60000); __game.sim.publish(); })()`);
  await enterBuild();
  await click('#buildpanel [data-action="build-shelf"][data-value="printers"]');
  const before = await evaluate(`__game.sim.machines.filter((m) => m.type === 'fdm').length`);
  // The A1 is on the shelf too now; the P2S is the one that holds more than a kilo.
  await click('#buildpanel [data-action="build-pick"][data-value="printer:p2s"]:not([disabled])');
  const held = await evaluate(`JSON.stringify(__store.getState().placingBuy)`);
  const tile = await legalTile('printer', 'p2s');
  if (tile) await clickTile(tile.x, tile.y);
  const asked = await evaluate(`!!document.querySelector('#buyconfirm [data-action="buy-yes"]')`);
  await click('#buyconfirm [data-action="buy-yes"]');
  await leaveBuild();
  const after = JSON.parse(
    await evaluate(`(() => { const fdm = __game.sim.machines.filter((m) => m.type === 'fdm');
      return JSON.stringify({ n: fdm.length, cap: Math.max(...fdm.map((m) => m.consumableMax)),
                              full: fdm.every((m) => m.consumable > 0) }); })()`),
  );
  // It arrives, it arrives full, and it holds a full four-spool load.
  const ok = after.n === before + 1 && after.cap >= 4000 && after.full;
  if (!ok) console.log(`      printers ${before} -> ${after.n}, capacity ${after.cap}, full ${after.full}, held ${held}, tile ${JSON.stringify(tile)}, asked ${asked}`);
  return ok;
});

await check('a scrolled panel stays where it was while the sim redraws it', async () => {
  await evaluate(`window.__store.getState().setSpeed(3)`);
  // The Projects panel scrolls once there is a history in it; Build is not a panel now.
  await evaluate(`(() => { for (let i = 0; i < 40; i++) __store.getState().pushLog('filler ' + i, 'info'); })()`);
  await openPanel('machines-open');
  await evaluate(`(() => { const b = document.querySelector('#modal .modal-body'); b.style.maxHeight = '120px'; })()`);
  await evaluate(`document.querySelector('#modal .modal-body').scrollTop = 400`);
  const before = await evaluate(`document.querySelector('#modal .modal-body').scrollTop`);
  await sleep(1500);
  const after = await evaluate(`document.querySelector('#modal .modal-body').scrollTop`);
  await click('#modal header [data-action="jobs-close"]');
  if (!(before > 0 && after === before)) console.log(`      scrollTop ${before} -> ${after}`);
  return before > 0 && after === before;
}, { live: true });

await check('the move strip sells what you are holding, and says what it fetches', async () => {
  const id = await evaluate(`(() => { __store.getState().earn(20000); __game.sim.buyFurniture('assembly-table');
    const s = [...Object.keys(__store.getState().stationPlacements)].find((k) => k.startsWith('assembly-table'));
    __store.getState().setBuildMode(true); __store.getState().setMoving(s); __game.sim.publish(); return s; })()`);
  await sleep(300);
  const label = await evaluate(`document.querySelector('[data-action="sell-held"]')?.textContent.trim() ?? ''`);
  const cash = await evaluate(`__store.getState().cash`);
  await click('[data-action="sell-held"]');
  const gone = await evaluate(`!Object.keys(__store.getState().stationPlacements).includes('${id}')`);
  const after = await evaluate(`__store.getState().cash`);
  const ok = Boolean(id) && /₺/.test(label) && after > cash && gone;
  if (!ok) console.log(`      id ${id}, label "${label}", cash ${cash} -> ${after}, gone ${gone}`);
  await evaluate(`__store.getState().setBuildMode(false)`);
  return ok;
});

await check('Reddit: a post lands and moves hype', async () => {
  await ensureWorkInFlight();
  await openPanel('reddit-open');
  // Pick the sceptical room and the biggest claim on purpose: the post should still land,
  // and whether it lands well or badly is the game's business, not this check's.
  await click('#modal [data-action="reddit-sub"][data-value="electronics"]');
  await click('#modal [data-action="reddit-claim"][data-value="bold"]');
  const before = await evaluate(
    `JSON.stringify({ posts: __store.getState().posts.length, hours: __game.sim.player.hoursLeft })`,
  );
  await click('#modal [data-action="reddit-post"]:not([disabled])');
  const after = await evaluate(
    `JSON.stringify({ posts: __store.getState().posts.length,
                      hype: __store.getState().hype,
                      hours: __game.sim.player.hoursLeft })`,
  );
  const a = JSON.parse(before);
  const b = JSON.parse(after);
  // The hour must actually be spent, or the verb is free and the whole trade is fake.
  const ok = b.posts === a.posts + 1 && b.hours < a.hours;
  if (!ok) console.log(`      posts ${a.posts} -> ${b.posts}, hours ${a.hours} -> ${b.hours}`);
  return ok;
});

await check('the overdraft ends a run two ways, and not before', async () => {
  const rollDay = `(() => { const sim = window.__game.sim; const d = sim.day;
      while (sim.day === d) sim.tick(0.05, 4); return !!__store.getState().gameOver; })()`;
  // Under, but inside both limits: the run carries on. This is the half that matters —
  // an overdraft that kills you the moment you use it is not an overdraft.
  await evaluate(`__store.setState({ cash: -12000, overdraftSince: null, gameOver: null })`);
  const survivesUnder = !(await evaluate(rollDay));
  // Past the floor.
  await evaluate(`__store.setState({ cash: -45000, overdraftSince: __store.getState().day, gameOver: null })`);
  const diesOnFloor = await evaluate(rollDay);
  // Under for too long. Deep enough that a build shipping during the rolled day cannot
  // pay it back — at −₺500 one payout lifted the balance above zero and the run rightly
  // carried on, which read as the rule being broken.
  await evaluate(
    `__store.setState({ cash: -25000, overdraftSince: __store.getState().day - 61, gameOver: null })`,
  );
  const diesOnTime = await evaluate(rollDay);
  await evaluate(`__store.setState({ cash: 40000, overdraftSince: null, gameOver: null })`);
  const ok = survivesUnder && diesOnFloor && diesOnTime;
  if (!ok) console.log(`      under ${survivesUnder}, floor ${diesOnFloor}, time ${diesOnTime}`);
  return ok;
});

await check('a run survives a reload', async () => {
  // Roll a day so the autosave fires, then reload and carry on.
  await evaluate(`
    (() => {
      const sim = window.__game.sim;
      const day = sim.day;
      while (sim.day === day) sim.tick(0.05, 4);
      __store.setState({ paused: false });
    })()
  `);
  await sleep(500);
  const before = await evaluate(`JSON.stringify({
    day: __store.getState().day,
    cash: __store.getState().cash,
    members: __game.sim.members.map((m) => m.id + ':' + m.employment).sort(),
    projects: __game.sim.projects.map((p) => p.defId + ':' + p.stage).sort(),
  })`);
  const saved = await evaluate(`(localStorage.getItem('hackerspace-tycoon-save-v1') || '').length > 0`);
  // Which day the file on disk is from, so a failure says whether the autosave ran at all.
  const onDisk = await evaluate(`(() => { const raw = localStorage.getItem('hackerspace-tycoon-save-v1') || '';
    try { const f = JSON.parse(raw); return 'day ' + f.store.day + ', ' + Math.round(raw.length / 1024) + ' KB, state ' +
      JSON.stringify({ started: __store.getState().started, paused: __store.getState().paused, gameOver: !!__store.getState().gameOver }); }
    catch (e) { return 'unreadable ' + raw.length; } })()`);
  await send('Page.reload', { ignoreCache: true });
  await sleep(2500);
  const offered = await evaluate(`document.querySelectorAll('#start .start-card.resume').length === 1`);
  await click('[data-action="continue"]');
  const after = await evaluate(`JSON.stringify({
    day: __store.getState().day,
    cash: __store.getState().cash,
    members: __game.sim.members.map((m) => m.id + ':' + m.employment).sort(),
    projects: __game.sim.projects.map((p) => p.defId + ':' + p.stage).sort(),
  })`);
  if (!(saved && offered && before === after)) {
    console.log(`      saved=${saved} offered=${offered} on disk: ${onDisk}\n      before ${before}\n      after  ${after}`);
  }
  return saved && offered && before === after;
});

await check('unchanged panels keep their DOM (build menu and top bar)', async () => {
  await evaluate(`window.__store.getState().setSpeed(3)`);
  const churn = await evaluate(`
    new Promise((resolve) => {
      const watch = ['#bottombar', '#topbar .speeds'].map((sel) => document.querySelector(sel));
      let mutations = 0;
      const observer = new MutationObserver((records) => { mutations += records.length; });
      for (const el of watch) if (el) observer.observe(el, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); resolve(mutations); }, 1200);
    })
  `);
  if (churn > 4) console.log(`      ${churn} rebuilds in 1.2s — panels are churning`);
  return churn <= 4;
}, { live: true });

await check('no exceptions', async () => exceptions.length === 0);

const failed = results.filter((r) => !r.ok);
console.log('');
if (failed.length) {
  if (exceptions.length) console.error('  exceptions:\n    ' + exceptions.join('\n    '));
  console.error(`  ${failed.length}/${results.length} checks failed\n`);
  process.exit(1);
}
console.log(`  ${results.length}/${results.length} checks passed\n`);
process.exit(0);
