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

const results = [];
const check = async (name, fn) => {
  const ok = await fn();
  results.push({ name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
};

console.log('\n  Clicking the real UI while the sim runs\n');

// Walk the Jobs wizard the way a player does: open it, pick a genre, a size, a project,
// then pitch.
await click('[data-action="jobs-open"]');
await click('#modal [data-action="jobs-category"]:not([disabled])');
await click('#modal [data-action="jobs-size"]:not([disabled])');
await click('#modal [data-action="jobs-project"]:not([disabled])');
await click('#modal [data-action="pitch"]:not([disabled])');
await evaluate(`window.__store.getState().setSpeed(4)`);
await sleep(500);

await check('the wizard pitched a project', async () => (await evaluate(`__game.sim.projects.length`)) > 0);
await check('Jobs opens while a project runs', async () => {
  await click('[data-action="jobs-open"]');
  return (await evaluate(`document.querySelectorAll('#modal .modal').length`)) === 1;
});
await check('a second project can be started with one already running', async () => {
  await click('#modal [data-action="jobs-category"]:not([disabled])');
  await click('#modal [data-action="jobs-size"]:not([disabled])');
  await click('#modal [data-action="jobs-project"]:not([disabled])');
  await click('#modal [data-action="pitch"]:not([disabled])');
  return (await evaluate(`__game.sim.projects.length`)) >= 2;
});
await check('closing the wizard', async () => {
  await click('[data-action="jobs-open"]');
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
await check('buy a spool (machines panel redraws every snapshot)', async () => {
  const before = await evaluate(`__store.getState().runtime.machines[0].consumable`);
  await evaluate(`__game.sim.printer.consumable = 100; __game.sim.publish();`);
  await click('[data-action="filament"]');
  const after = await evaluate(`__store.getState().runtime.machines[0].consumable`);
  return after > 100 && before !== undefined;
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
