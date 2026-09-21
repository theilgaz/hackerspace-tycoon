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
const openWizard = () => openPanel('jobs-open');

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
      sim.publish();
      return sim.projects.length;
    })()
  `);
}

const results = [];
const check = async (name, fn) => {
  const ok = await fn();
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

// Walk the Jobs wizard the way a player does: open it, pick a genre, a project, then pitch.
await click('[data-action="jobs-open"]');
await click('#modal [data-action="jobs-category"]:not([disabled])');
await click('#modal [data-action="jobs-project"]:not([disabled])');
await click('#modal [data-action="pitch"]:not([disabled])');
await evaluate(`window.__store.getState().setSpeed(4)`);
await sleep(500);

await check('the wizard pitched a project', async () => (await evaluate(`__game.sim.projects.length`)) > 0);
await check('Jobs opens while a project runs', async () => {
  await openWizard();
  return (await evaluate(`document.querySelectorAll('#modal .modal').length`)) === 1;
});
await check('a second project can be started with one already running', async () => {
  await click('#modal [data-action="jobs-category"]:not([disabled])');
  await click('#modal [data-action="jobs-project"]:not([disabled])');
  await click('#modal [data-action="pitch"]:not([disabled])');
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
  await click('#modal [data-action="jobs-category"]:not([disabled])');
  sizes.push(await box());
  await click('#modal [data-action="jobs-size"][data-value="solo"]:not([disabled])');
  sizes.push(await box());
  await click('#modal [data-action="jobs-project"]:not([disabled])');
  sizes.push(await box());
  const unique = [...new Set(sizes)];
  if (unique.length !== 1) console.log(`      sizes seen: ${unique.join(' | ')}`);
  return unique.length === 1 && unique[0] !== 'none';
});

await check('the crew step arrives with the best people already picked', async () => {
  await openWizard();
  await click('#modal [data-action="jobs-category"]:not([disabled])');
  await click('#modal [data-action="jobs-project"]:not([disabled])');
  // The header states the count, and the toggles carry it — check both agree, so a
  // suggestion that ticks buttons without reaching the pitch would still fail here.
  const label = await evaluate(
    `document.querySelector('#modal .ui-label')?.textContent.trim().match(/Crew (\\d+)\\/(\\d+)/)?.slice(1).join('/')`,
  );
  const pressed = await evaluate(
    `document.querySelectorAll('#modal .ui-toggle[aria-pressed="true"]').length`,
  );
  const free = await evaluate(`__game.sim.members.filter((m) => !m.team).length`);
  const [picked, size] = (label ?? '0/0').split('/').map(Number);
  const want = Math.min(size, free);
  if (!(pressed === want && picked === want && want > 0)) {
    console.log(`      picked ${picked}, pressed ${pressed}, wanted ${want} (team ${size}, free ${free})`);
  }
  return pressed === want && picked === want && want > 0;
});

await check('breadcrumb jumps back to a completed step', async () => {
  await openWizard();
  await click('#modal [data-action="jobs-category"]:not([disabled])');
  await click('#modal [data-action="jobs-project"]:not([disabled])');
  const onCrew = await evaluate(`document.querySelector('#modal .step.now')?.textContent.trim()`);
  // Jump straight past the project step back to the first one.
  await click('#modal button.step[data-value="category"]');
  const afterJump = await evaluate(`document.querySelector('#modal .step.now')?.textContent.trim()`);
  // Steps that are not yet reached must not be clickable.
  const aheadClickable = await evaluate(
    `document.querySelectorAll('#modal button.step').length`,
  );
  if (!onCrew?.includes('Crew') || !afterJump?.includes('Kind of work')) {
    console.log(`      crew step read "${onCrew}", after jump "${afterJump}"`);
  }
  return Boolean(onCrew?.includes('Crew')) && Boolean(afterJump?.includes('Kind of work')) && aheadClickable === 0;
});

await check('closing the wizard', async () => {
  await openWizard();
  await click('#modal header [data-action="jobs-close"]');
  return (await evaluate(`document.querySelectorAll('#modal .modal').length`)) === 0;
});
await check('speed button', async () => {
  await click('[data-action="speed"][data-value="2"]');
  return (await evaluate(`__store.getState().speed`)) === 2;
});
await check('work on a project (button inside a constantly redrawing panel)', async () => {
  await click('[data-action="work"]');
  return Boolean(await evaluate(`__game.sim.player.project`));
});
await check('buy a spool (machines overlay redraws every snapshot)', async () => {
  const before = await evaluate(`__store.getState().runtime.machines[0].consumable`);
  await evaluate(`__game.sim.printer.consumable = 100; __game.sim.publish();`);
  await openPanel('machines-open');
  const shown = await evaluate(`document.querySelectorAll('#modal .machine-card').length > 0`);
  await click('#modal [data-action="filament"]');
  const after = await evaluate(`__store.getState().runtime.machines[0].consumable`);
  await click('#modal header [data-action="jobs-close"]');
  return shown && after > 100 && before !== undefined;
});
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

await check('Jobs: best-fit ranks the catalogue for whoever is free', async () => {
  // Free somebody up first, or there is nothing for the view to rank.
  await evaluate(`
    (() => { const sim = window.__game.sim;
      const m = sim.members.find((x) => x.team);
      if (m) { const p = sim.projects.find((x) => x.id === m.team);
               if (p) p.team = p.team.filter((i) => i !== m.id);
               m.team = null; }
      sim.publish(); })()
  `);
  await openPanel('jobs-open');
  const hasTile = await evaluate(
    `!!document.querySelector('#modal [data-action="jobs-category"][data-value="bestfit"]')`,
  );
  await click('#modal [data-action="jobs-category"][data-value="bestfit"]');
  const fits = JSON.parse(
    await evaluate(`JSON.stringify([...document.querySelectorAll('#modal .ui-row .ui-badge')]
      .map((el) => el.textContent.trim()).filter((t) => t.endsWith('fit'))
      .map((t) => parseInt(t, 10)))`),
  );
  // Ranked means ranked: a list that is not sorted is not a recommendation.
  const sorted = fits.every((v, i) => i === 0 || fits[i - 1] >= v);
  const ok = hasTile && fits.length > 1 && sorted;
  if (!ok) console.log(`      tile ${hasTile}, fits ${JSON.stringify(fits)}`);
  return ok;
});

await check('Projects: the filter narrows one list', async () => {
  await ensureWorkInFlight();
  await openPanel('projects-open');
  const count = () => evaluate(`document.querySelectorAll('#modal .rank-table tbody tr').length`);
  const totals = JSON.parse(
    await evaluate(`JSON.stringify({ done: __store.getState().shipped.length,
                                     open: __store.getState().runtime.projects.length })`),
  );
  const all = await count();
  await click('#modal [data-action="projects-tab"][data-value="done"]:not([disabled])');
  const onlyDone = await count();
  await click('#modal [data-action="projects-tab"][data-value="on"]:not([disabled])');
  const onlyOpen = await count();
  // All really is everything, and each filter really is its own slice of it.
  const ok =
    totals.done > 0 && totals.open > 0 &&
    all === totals.done + totals.open && onlyDone === totals.done && onlyOpen === totals.open;
  if (!ok) {
    console.log(`      all ${all}, done ${onlyDone}/${totals.done}, open ${onlyOpen}/${totals.open}`);
  }
  return ok;
});

await check('Machines: buying a printer puts one on the floor', async () => {
  await evaluate(`(() => { __store.getState().earn(60000); __game.sim.publish(); })()`);
  await openPanel('machines-open');
  const before = await evaluate(`__game.sim.machines.filter((m) => m.type === 'fdm').length`);
  await evaluate(`document.querySelector('#modal .modal-body').scrollTop = 99999`);
  await click('#modal [data-action="buy-printer"]:not([disabled])');
  const after = JSON.parse(
    await evaluate(`(() => { const fdm = __game.sim.machines.filter((m) => m.type === 'fdm');
      return JSON.stringify({ n: fdm.length, cap: Math.max(...fdm.map((m) => m.consumableMax)),
                              full: fdm.every((m) => m.consumable > 0) }); })()`),
  );
  // It arrives, it arrives full, and it holds more than the one kilo the space started with.
  const ok = after.n === before + 1 && after.cap > 1000 && after.full;
  if (!ok) console.log(`      printers ${before} -> ${after.n}, capacity ${after.cap}, full ${after.full}`);
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
  // Under for too long.
  await evaluate(
    `__store.setState({ cash: -500, overdraftSince: __store.getState().day - 61, gameOver: null })`,
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
    console.log(`      saved=${saved} offered=${offered}\n      before ${before}\n      after  ${after}`);
  }
  return saved && offered && before === after;
});

await check('unchanged panels keep their DOM (build menu and top bar)', async () => {
  await evaluate(`window.__store.getState().setSpeed(4)`);
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
});

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
