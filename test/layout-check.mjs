#!/usr/bin/env node
/**
 * Real-browser layout check (no dependencies, uses the installed Chrome).
 *
 * The panel's promises are geometric — cards never overlap text, the pane has no
 * dead band, every metric row lines up — and only a real layout
 * engine can confirm them. This script renders the panel's markup with the
 * plugin's actual stylesheet at several pane heights and fails when:
 *   - any two text leaves overlap,
 *   - any card's content is taller/wider than the card (a precursor of overlap),
 *   - the card column overflows horizontally,
 *   - the last card does not reach the bottom edge of the column (dead band),
 *   - the column scrolls at a height where it should not.
 *
 * Usage: node test/layout-check.mjs [--keep]
 */
import { execFileSync, spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { existsSync, mkdtempSync as createTemp, realpathSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { panelHtml } from './render-fixture.mjs';

// One browser per RUN, not per case (see "launcher" below). Set
// `--no-reuse-browser` to fall back to the old one-launch-per-case behaviour.
const REUSE_BROWSER = !process.argv.includes('--no-reuse-browser');
const startedAt = Date.now();
const browser = { child: null, socket: null, port: 0, seq: 0, started: false, fallback: null, launches: 0, measurements: 0, currentUrl: null };

function killBrowser() {
  const child = browser.child;
  const socket = browser.socket;
  browser.child = null;
  browser.socket = null;
  if (socket !== null) { try { socket.close(); } catch (error) { /* already closed */ } }
  if (child === null || child.exitCode !== null) return;
  try { child.kill('SIGKILL'); } catch (error) { /* already gone */ }
}

/** Leave the process deliberately: an open DevTools socket would keep it alive. */
function shutdown(code) {
  killBrowser();
  process.exit(code);
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(130));
}

const ownedTempRoots = new Set();
function mkdtempSync(prefix) {
  const dir = createTemp(prefix);
  ownedTempRoots.add(realpathSync(dir));
  return dir;
}
process.on('exit', () => {
  killBrowser();
  if (process.argv.includes('--keep') || process.argv.includes('--shot')) return;
  for (const dir of ownedTempRoots) {
    // Delete only canonical directories created and recorded by this invocation.
    if (existsSync(dir) && realpathSync(dir) === dir && dir.startsWith(realpathSync(tmpdir()) + '/aup-')) rmSync(dir, { recursive: true });
  }
});

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
];

/** Pull the plugin stylesheet out of client.js without booting the module. */
function readStylesheet() {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const start = source.indexOf('const CSS = [');
  if (start < 0) throw new Error('stylesheet array not found');
  const end = source.indexOf('].join(', start);
  if (end < 0) throw new Error('stylesheet array end not found');
  // The literal is a plain array of strings; comments inside are legal in an expression.
  const rules = eval(source.slice(start + 'const CSS = '.length, end + 1));
  return rules.join('\n');
}

const THEME = `
:root{
  --dsw-alias-bg-layer-1:#ffffff;
  --dsw-alias-bg-layer-2:#ffffff;
  --dsw-alias-bg-skeleton:rgba(0,0,0,.04);
  --dsw-alias-border-l2:rgba(0,0,0,.1);
  --dsw-alias-border-l3:rgba(0,0,0,.08);
  --dsw-alias-brand-primary:#0f1115;
  --dsw-alias-interactive-bg-hover:rgba(38,49,72,.06);
  --dsw-alias-label-primary:#0f1115;
  --dsw-alias-label-secondary:#61666b;
  --dsw-alias-state-error-primary:#ec1313;
  --dsw-static-amber-500:#f59e0b;
  --dsw-static-blue-450:#4d93f8;
  --dsw-static-violet-400:#a78bfa;
  --dsw-static-neutral-bluish-400:#adb2b8;
}
html,body{margin:0;padding:0;background:#fff;font-size:13px}
#pane{width:420px;overflow:hidden}
`;


// --------------------------------------------------------------- fixtures --
// Real panel state, so the geometry measured here is production geometry: three
// providers, a balance row per provider, a per-provider session block, four model
// rows and a full session card. The statistics card is gone (1.0.16), so there is
// no period data and no dimension axis left to fixture.
const DAY_MS = 24 * 60 * 60 * 1000;
// One provider runs two models, so the per-model block renders (the worst case for
// content height); the other two run one model each, whose model row would only
// repeat the provider total and is therefore not drawn (1.0.16).
const SESSION_MODELS = {
  phase: 'ready',
  totalTokens: 460_050_000,
  lastProvider: 'opencode-go',
  items: [
    { provider: 'opencode-go', model: 'deepseek-v4.1-flash', tokens: 251_000_000, requests: 800 },
    { provider: 'openrouter', model: 'deepseek-flash-latest', tokens: 172_000_000, requests: 400 },
    { provider: 'openrouter', model: 'claude-sonnet-4.5', tokens: 8_000_000, requests: 20 },
    { provider: 'deepseek-account', model: 'deepseek-flash', tokens: 29_050_000, requests: 120 }
  ]
};
const OPENCODE_PLAN = {
  provider: 'opencode-go',
  kind: 'opencode-plan',
  currency: 'USD',
  fetchedAt: Date.now(),
  windows: [
    { id: 'rolling', usedPercent: 16, resetsAt: Date.now() + 3600_000 },
    { id: 'weekly', usedPercent: 12, resetsAt: Date.now() + DAY_MS },
    { id: 'monthly', usedPercent: 6, resetsAt: Date.now() + DAY_MS }
  ]
};
const OPENROUTER_CREDITS = { provider: 'openrouter', kind: 'credits', currency: 'USD', remaining: 1.5, used: 2, total: 3.5, fetchedAt: Date.now() };
// The client keeps one state per provider (`{phase, byProvider}`), exactly like the
// live body: an entry is `{phase:'ready', data}` or `{phase:'error', code}`.
function balancesOf(entries) {
  const byProvider = {};
  for (const entry of entries) {
    if (entry.phase === 'error') byProvider[entry.provider] = { phase: 'error', code: entry.code };
    else byProvider[entry.provider] = { phase: 'ready', data: entry };
  }
  return { phase: 'ready', byProvider };
}
const PROVIDER_BALANCES = balancesOf([OPENCODE_PLAN, OPENROUTER_CREDITS]);
// Real projection shapes: without a context window the panel silently skipped the
// context block and the legend, so the measured content height was ~40px short of
// production and every ladder threshold was calibrated too low.
const PROJECTION = (key) => {
  switch (key) {
    case 'sessionStats':
      return { turns: 151, steps: 1677, decodeTokens: 128_000, decodeMs: 1000, llmMs: 26_640_000, toolMs: 5_280_000, ttftMs: 8_600, ttftSteps: 1000 };
    case 'tokenUsage':
      return { uncachedInputTokens: 7_820_000, outputTokens: 1_130_000, cacheReadTokens: 570_000_000, cacheWriteTokens: 0 };
    case 'contextPressure':
      return { projectedTokens: 724_000, contextWindow: 1_000_000 };
    case 'contextBreakdown':
      return { systemTokens: 21_000, toolsTokens: 14_000, messageTokens: 689_000 };
    default:
      return undefined;
  }
};

// Mirrors the client rule: a model row is only drawn for a provider that ran more
// than one model (1.0.16 - a single-model provider's row would repeat its total).
function detailModelCount(items) {
  const counts = {};
  for (const item of items) counts[item.provider] = (counts[item.provider] || 0) + 1;
  return items.filter((item) => counts[item.provider] > 1).length;
}
function caseOf() {
  return {
    id: 'session',
    projection: PROJECTION,
    sessionModels: SESSION_MODELS,
    providerBalances: PROVIDER_BALANCES
  };
}

const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
if (chrome === undefined) {
  console.log('layout check skipped: no Chrome/Chromium found');
  shutdown(0);
}
const css = readStylesheet();

// ---------------------------------------------------------------- launcher --
// Every case is the same page skeleton with different CSS + fixture, so one
// browser can serve all of them: it is started once, and each case is a viewport
// change (`Emulation.setDeviceMetricsOverride`) plus a navigation. Relaunching
// Chrome per case was ~87 process starts for ~15s of real layout work, and on
// macOS each start made a Dock icon appear and vanish.
//
// Two paths, same contract (return the text the page left in `#result`):
//   - `renderWithBrowser`: one shared page target driven over the DevTools
//     protocol with Node's built-in WebSocket (no dependencies).
//   - `renderLegacy`: the previous one-launch-per-case `--dump-dom` path. It is
//     kept as the fallback, and `--no-reuse-browser` forces it, so a browser that
//     refuses remote debugging can never turn the geometry check into a no-op.
let legacyLaunches = 0;

/** A minimal DevTools-protocol client over Node's built-in WebSocket. */
function connectDevTools(wsUrl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    const waiters = new Map();
    let seq = 0;
    const send = (method, params = {}) => new Promise((res, rej) => {
      seq += 1;
      pending.set(seq, { res, rej, method });
      socket.send(JSON.stringify({ id: seq, method, params }));
    });
    const once = (method) => new Promise((res) => {
      const list = waiters.get(method) ?? [];
      list.push(res);
      waiters.set(method, list);
    });
    socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch (error) { return; }
      if (message.id !== undefined) {
        const entry = pending.get(message.id);
        if (entry === undefined) return;
        pending.delete(message.id);
        if (message.error !== undefined) entry.rej(new Error(entry.method + ' failed: ' + JSON.stringify(message.error)));
        else entry.res(message.result);
        return;
      }
      const list = waiters.get(message.method);
      if (list === undefined || list.length === 0) return;
      waiters.set(message.method, []);
      for (const resolveWaiter of list) resolveWaiter(message.params);
    });
    socket.addEventListener('error', () => reject(new Error('could not connect to the DevTools socket')));
    socket.addEventListener('open', () => resolve({ send, once, close: () => socket.close() }));
  });
}

/** Start the shared browser once; resolve with a connected page target. */
async function ensureBrowser() {
  if (browser.socket !== null) return browser.socket;
  if (browser.started) throw new Error('the shared browser is not available');
  browser.started = true;
  const dir = mkdtempSync(join(tmpdir(), 'aup-browser-'));
  const profile = join(dir, 'profile');
  const child = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--mute-audio',
    '--hide-scrollbars',
    '--window-size=520,1200',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  browser.child = child;
  browser.launches += 1;
  child.on('exit', () => { if (browser.child === child) { browser.child = null; browser.socket = null; } });
  // `--remote-debugging-port=0` writes the chosen port and the browser socket
  // path into `<user-data-dir>/DevToolsActivePort` as soon as the server is up.
  const portFile = join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + 20000;
  while (!existsSync(portFile)) {
    if (child.exitCode !== null) throw new Error('the browser exited before its DevTools port was ready');
    if (Date.now() > deadline) throw new Error('timed out waiting for the DevTools port');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const [port] = readFileSync(portFile, 'utf8').split('\n');
  browser.port = Number(port);
  const page = await resolvePageTarget();
  const socket = await connectDevTools(page.webSocketDebuggerUrl);
  await socket.send('Page.enable');
  await socket.send('Runtime.enable');
  browser.socket = socket;
  if (process.argv.includes('--debug-browser')) console.log(`[browser] one Chrome on port ${browser.port}, page target ${page.id}`);
  return socket;
}

/**
 * One JSON request to the browser's DevTools HTTP endpoint, over `node:http`.
 *
 * `fetch` is unusable here: `test/render-fixture.mjs` replaces `globalThis.fetch`
 * with an in-process stub that answers the panel's own Host routes, so the test's
 * DevTools calls would be swallowed by that stub. `node:http` is never stubbed.
 */
function devtoolsJson(pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port: browser.port, path: pathname, method, timeout: 5000 }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) { reject(new Error(pathname + ' -> HTTP ' + response.statusCode)); return; }
        try { resolve(JSON.parse(body)); } catch (error) { reject(new Error(pathname + ' returned no JSON')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error(pathname + ' timed out')));
    request.on('error', reject);
    request.end();
  });
}

/**
 * Find a page target. The DevTools port file appears before the initial target is
 * listed, so this retries; `PUT /json/new` (required on Chrome 111+) creates one we
 * own rather than depending on startup timing or the shell's own tabs.
 */
async function resolvePageTarget() {
  const deadline = Date.now() + 10000;
  let lastError;
  while (Date.now() < deadline) {
    for (const method of ['PUT', 'GET']) {
      try {
        const created = await devtoolsJson('/json/new?about:blank', method);
        if (created !== null && typeof created.webSocketDebuggerUrl === 'string') return created;
      } catch (error) {
        lastError = error;
      }
    }
    try {
      const listed = await devtoolsJson('/json/list');
      const page = Array.isArray(listed)
        ? listed.find((target) => target.type === 'page' && typeof target.webSocketDebuggerUrl === 'string')
        : undefined;
      if (page !== undefined) return page;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('the browser exposed no page target' + (lastError === undefined ? '' : ' (' + lastError.message + ')'));
}

/** Measure one case in the shared browser. */
async function renderWithBrowser(file, width, height) {
  const socket = await ensureBrowser();
  browser.seq += 1;
  await socket.send('Emulation.setDeviceMetricsOverride', { width: 520, height, deviceScaleFactor: 1, mobile: false });
  // A file:// URL cannot carry a query string (Chrome reads it as part of the
  // path), so a repeated file is reloaded by bouncing through about:blank first.
  const url = pathToFileURL(file).href;
  if (browser.currentUrl === url) {
    await socket.send('Page.navigate', { url: 'about:blank' });
    browser.currentUrl = 'about:blank';
  }
  const loaded = socket.once('Page.loadEventFired');
  await socket.send('Page.navigate', { url });
  browser.currentUrl = url;
  // Never wait forever: a page that fails to load must fall back, not hang the run.
  let timer;
  const timedOut = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('the page did not finish loading within 15s')), 15000);
  });
  try {
    await Promise.race([loaded, timedOut]);
  } finally {
    clearTimeout(timer);
  }
  const evaluated = await socket.send('Runtime.evaluate', {
    expression: 'document.getElementById("result").textContent',
    returnByValue: true
  });
  const text = evaluated === undefined || evaluated.result === undefined ? undefined : evaluated.result.value;
  if (typeof text !== 'string' || text.startsWith('pending')) throw new Error('the page left no measurement (its script threw)');
  return text;
}

/** The original path: one headless Chrome launch per case, retried once. */
function renderLegacy(file, dir, height) {
  legacyLaunches += 1;
  const profile = join(dir, 'profile-' + String(legacyLaunches));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--window-size=520,${height + 143}`,
    `--user-data-dir=${profile}`,
    '--virtual-time-budget=3000',
    '--dump-dom',
    `file://${file}`
  ];
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return execFileSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

const MEASURE_SCRIPT = `
const out = { paneHeight: innerHeight, paneWidth: Math.round(document.getElementById('pane').getBoundingClientRect().width), overlaps: [], cardOverflow: [], horizontal: [], scrolls: false, deadBand: 0, cards: [] };
const cardsEl = document.querySelector('.aup-cards');
const rectOf = (el) => el.getBoundingClientRect();
const leaves = [];
for (const el of document.querySelectorAll('.aup-cards *')) {
  if (el.children.length > 0 || getComputedStyle(el).visibility === 'hidden') continue;
  const text = (el.textContent || '').trim();
  if (text === '') continue;
  const rect = rectOf(el);
  if (rect.width < 1 || rect.height < 1) continue;
  leaves.push({ el, text, rect });
}
for (let i = 0; i < leaves.length; i += 1) {
  for (let j = i + 1; j < leaves.length; j += 1) {
    const a = leaves[i].rect, b = leaves[j].rect;
    const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (dx > 1 && dy > 1) out.overlaps.push(leaves[i].text + ' || ' + leaves[j].text);
  }
}
for (const card of document.querySelectorAll('.aup-card')) {
  out.cards.push({ classes: card.className, height: rectOf(card).height, top: rectOf(card).top, bottom: rectOf(card).bottom });
  if (card.scrollHeight > card.clientHeight + 1 || card.scrollWidth > card.clientWidth + 1) {
    out.cardOverflow.push(card.className + ' ' + card.scrollHeight + '>' + card.clientHeight + ' / ' + card.scrollWidth + '>' + card.clientWidth);
  }
}
if (cardsEl.scrollWidth > cardsEl.clientWidth + 1) out.horizontal.push(cardsEl.scrollWidth + '>' + cardsEl.clientWidth);
const columnEdges = (groupSelector, probeSelector, edge) => {
  const edges = new Set();
  for (const row of document.querySelectorAll(groupSelector + ' > *')) {
    const probe = row.querySelector(probeSelector);
    if (probe === null) continue;
    const rect = probe.getBoundingClientRect();
    edges.add(Math.round(edge === 'right' ? rect.right : rect.left));
  }
  return [...edges].sort((a, b) => a - b);
};
out.align = {
  acctLabelLeft: columnEdges('.aup-acct-srcs', '.aup-acct-src-label, .aup-acct-label', 'left'),
  acctValueRight: columnEdges('.aup-acct-srcs', '.aup-acct-src-value', 'right'),
  // The per-provider block is one shared parent grid: every name starts on the same
  // line and every figure ends on the same line (1.0.16, session card).
  provLabelLeft: columnEdges('.aup-providers', '.aup-provider-name', 'left'),
  provTokensRight: columnEdges('.aup-providers', '.aup-provider-tokens', 'right')
};
// The session card's footer keeps its left / centre / right structure.
const footerOf = (selector) => {
  const row = document.querySelector(selector);
  if (row === null) return null;
  const box = row.getBoundingClientRect();
  const cells = [...row.children].map((el) => {
    const rect = el.getBoundingClientRect();
    return { left: rect.left, right: rect.right, center: (rect.left + rect.right) / 2 };
  });
  return { left: box.left, right: box.right, center: (box.left + box.right) / 2, cells };
};
out.footers = { legend: footerOf('.aup-context-legend') };
const centring = (groupSelector, probeSelector) => {
  let worst = 0;
  for (const row of document.querySelectorAll(groupSelector + ' > *')) {
    const probe = row.querySelector(probeSelector);
    if (probe === null) continue;
    const rowRect = row.getBoundingClientRect();
    const probeRect = probe.getBoundingClientRect();
    if (rowRect.height < 1) continue;
    worst = Math.max(worst, Math.abs((probeRect.top + probeRect.bottom) / 2 - (rowRect.top + rowRect.bottom) / 2));
  }
  return Math.round(worst * 10) / 10;
};
out.centring = {
  acctValue: centring('.aup-acct-srcs', '.aup-acct-src-value'),
  provTokens: centring('.aup-providers', '.aup-provider-tokens')
};
for (const [name, selector] of [['legend', '.aup-context-legend']]) {
  const row = document.querySelector(selector);
  if (row === null) continue;
  const cells = [...row.children];
  out[name + 'Lines'] = new Set(cells.map((el) => Math.round(el.getBoundingClientRect().top))).size;
  out[name + 'Overflow'] = row.scrollWidth > row.clientWidth + 1;
}
// Per-provider rows: one line each, and the block order inside the session card is
// statistics -> per provider -> per model (1.0.16).
out.providerRows = [...document.querySelectorAll('.aup-providers .aup-provider-row')].map((el) => ({
  text: el.textContent.slice(0, 40),
  height: Math.round(el.getBoundingClientRect().height)
}));
out.sessionOrder = [...document.querySelectorAll('.aup-card-session .aup-stat-list, .aup-card-session .aup-providers, .aup-card-session .aup-models')]
  .map((el) => (el.className.match(/aup-(stat-list|providers|models)/) || [])[1] || '');
out.modelRows = [...document.querySelectorAll('.aup-card-session .aup-model-row')].map((row) => {
  const name = row.querySelector('.aup-model-name');
  const tokens = row.querySelector('.aup-model-tokens');
  const rowRect = row.getBoundingClientRect();
  const nameRect = name === null ? null : name.getBoundingClientRect();
  const tokenRect = tokens === null ? null : tokens.getBoundingClientRect();
  return {
    text: row.textContent.slice(0, 60),
    height: Math.round(rowRect.height),
    sameLine: nameRect === null || tokenRect === null ? true : Math.round(nameRect.top) === Math.round(tokenRect.top)
  };
});
out.acctRows = [...document.querySelectorAll('.aup-acct-src, .aup-acct-row')].map((el) => Math.round(el.getBoundingClientRect().height) + ':' + el.textContent.slice(0, 40));
out.acctPairs = [...document.querySelectorAll('.aup-acct-srcs .aup-acct-src')].flatMap((row) => {
  const pairs = row.querySelector('.aup-acct-pairs');
  if (pairs === null) return [];
  const label = row.querySelector('.aup-acct-src-label');
  const items = [...pairs.querySelectorAll('.aup-acct-pair')];
  const rowRect = row.getBoundingClientRect();
  const pairsRect = pairs.getBoundingClientRect();
  return [{
    label: (label === null ? '' : label.textContent).slice(0, 20),
    lines: new Set(items.map((el) => Math.round(el.getBoundingClientRect().top))).size,
    clipped: pairsRect.right > rowRect.right + 1 || pairsRect.left < rowRect.left - 1,
    width: Math.round(pairsRect.width),
    rowWidth: Math.round(rowRect.width),
    labelWidth: label === null ? 0 : Math.round(label.getBoundingClientRect().width),
    available: Math.round(rowRect.right - label.getBoundingClientRect().right),
    natural: Math.round(items.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) + (Number.parseFloat(getComputedStyle(pairs).columnGap) || 0) * Math.max(0, items.length - 1)),
    // The figure of each pair and the gap the browser gave it: textContent joins the
    // cells without spaces, so the label/figure separation is measured, not grepped.
    pairs: items.map((el) => {
      const labelEl = el.querySelector('.aup-acct-pair-label');
      const figureEl = el.children[1] ?? null;
      const labelRect = labelEl === null ? null : labelEl.getBoundingClientRect();
      const figureRect = figureEl === null ? null : figureEl.getBoundingClientRect();
      return {
        label: labelEl === null ? '' : labelEl.textContent,
        figure: figureEl === null ? '' : figureEl.textContent,
        gap: labelRect === null || figureRect === null ? 0 : Math.round((figureRect.left - labelRect.right) * 10) / 10
      };
    }),
    text: pairs.textContent
  }];
});
out.scrolls = cardsEl.scrollHeight > cardsEl.clientHeight + 1;
out.scrollInfo = cardsEl.scrollHeight + '/' + cardsEl.clientHeight;
const lastCard = document.querySelector('.aup-cards > .aup-card:last-child');
if (lastCard) out.deadBand = Math.round(rectOf(cardsEl).bottom - rectOf(lastCard).bottom);
document.getElementById('result').textContent = JSON.stringify(out);
`;

/** One measurement page: real panel markup inside a pane of the given size. */
function page(css, height, testCase, extraCss = '', width = 420) {
  const markup = panelHtml({
    projection: testCase.projection,
    sessionModels: testCase.sessionModels,
    providerBalances: testCase.providerBalances,
    locale: testCase.locale
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>${THEME}</style><style>${css}</style><style>${extraCss}</style></head>
<body><div id="pane" style="height:100vh;width:${width}px!important">${markup}</div>
<pre id="result">pending</pre>
<script>${MEASURE_SCRIPT}</script></body></html>`;
}

/**
 * Measure one case. Reuses the shared browser by default; if that fails once it
 * says so and falls back to one launch per case for the rest of the run, so the
 * check never silently degrades into "no measurement".
 */
async function measure(css, dir, height, testCase, extraCss = '', width = 420) {
  const file = join(dir, `pane-${width}x${height}-${testCase.id}.html`);
  writeFileSync(file, page(css, height, testCase, extraCss, width));
  browser.measurements += 1;
  let text;
  if (REUSE_BROWSER && browser.fallback === null) {
    try {
      text = await renderWithBrowser(file, width, height);
      // The emulated viewport is what the geometry depends on. If the browser
      // ignored it the numbers would silently describe the wrong pane, so such a
      // measurement is discarded and re-taken through the legacy launch, which
      // sizes the window instead.
      if (JSON.parse(text).paneHeight !== height) throw new Error('the browser ignored the emulated viewport');
    } catch (error) {
      browser.fallback = error.message;
      text = undefined;
      console.log(`layout check: shared browser unusable (${error.message}); falling back to one launch per case`);
    }
  }
  if (text === undefined) {
    const dom = renderLegacy(file, dir, height);
    const match = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/);
    if (match === null) return undefined;
    text = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }
  return JSON.parse(text);
}

const EXTRA_BALANCES = [
  { provider: 'openrouter', phase: 'error', code: 'timeout' },
  { provider: 'openai', phase: 'error', code: 'unsupported_provider' },
  { provider: 'anthropic', phase: 'error', code: 'unsupported_provider' },
  { provider: 'google', phase: 'error', code: 'unsupported_provider' },
  { provider: 'xai', phase: 'error', code: 'no_credential' }
];
const EXTRA_SOURCES = [
  { provider: 'openai', model: 'gpt', tokens: 1260000, requests: 13 },
  { provider: 'anthropic', model: 'claude', tokens: 1890000, requests: 9 },
  { provider: 'google', model: 'gemini', tokens: 420000, requests: 4 },
  { provider: 'xai', model: 'grok', tokens: 120000, requests: 2 }
];
function sourcesCase(count, locale) {
  const fixture = caseOf();
  fixture.id = 'sources-' + count + '-' + locale;
  fixture.locale = locale;
  fixture.sessionModels = { ...SESSION_MODELS, lastProvider: 'opencode-go', items: [...SESSION_MODELS.items, ...EXTRA_SOURCES.slice(0, count - 3)] };
  fixture.providerBalances = balancesOf([
    OPENCODE_PLAN,
    ...EXTRA_BALANCES
  ]);
  return fixture;
}
// Every provider ran exactly one model: no per-model row at all, because each such
// row would only repeat its provider's total (1.0.16).
function singleModelCase() {
  const fixture = caseOf();
  fixture.id = 'single-model';
  fixture.sessionModels = {
    phase: 'ready',
    totalTokens: 460_050_000,
    lastProvider: 'opencode-go',
    items: [
      { provider: 'opencode-go', model: 'deepseek-v4.1-flash', tokens: 251_000_000, requests: 800 },
      { provider: 'openrouter', model: 'deepseek-flash-latest', tokens: 180_000_000, requests: 420 },
      { provider: 'deepseek-account', model: 'deepseek-flash', tokens: 29_050_000, requests: 120 }
    ]
  };
  return fixture;
}
// A DeepSeek-only session: one wallet card with no provider rows, the layout the
// account-only path draws (kept for the shot tool and the space-allocation checks).
function accountOnlyCase() {
  const fixture = caseOf();
  fixture.id = 'account-only';
  fixture.sessionModels = {
    phase: 'ready',
    totalTokens: 460_050_000,
    lastProvider: 'deepseek-account',
    items: [{ provider: 'deepseek-account', model: 'deepseek-flash', tokens: 29_050_000, requests: 120 }]
  };
  fixture.providerBalances = balancesOf([]);
  return fixture;
}
// Worst case for the plan row: three 4-character percentages (`100%`) at the
// minimum supported panel width, where a wrapped row is unacceptable.
function wrapCase(locale) {
  const fixture = sourcesCase(3, locale);
  fixture.id = 'wrap-' + locale;
  fixture.providerBalances.byProvider['opencode-go'] = {
    phase: 'ready',
    data: { ...OPENCODE_PLAN, windows: OPENCODE_PLAN.windows.map((window) => ({ ...window, usedPercent: 0 })) }
  };
  return fixture;
}

// The common narrow case: two windows untouched and one partly used.
function mixedPlanCase(locale) {
  const fixture = sourcesCase(3, locale);
  fixture.id = 'mixed-plan-' + locale;
  const used = [0, 0, 16];
  fixture.providerBalances.byProvider['opencode-go'] = {
    phase: 'ready',
    data: { ...OPENCODE_PLAN, windows: OPENCODE_PLAN.windows.map((window, index) => ({ ...window, usedPercent: used[index] })) }
  };
  return fixture;
}
// Command Code reports two windows plus the credits left, which is the longest row
// this provider can produce (`CR 999.99$` is the widest credit figure), so it joins
// the narrow no-wrap check together with the three-`100%` plan worst case.
function commandCodeCase(locale) {
  const fixture = sourcesCase(3, locale);
  fixture.id = 'commandcode-' + locale;
  fixture.locale = locale;
  fixture.sessionModels = { ...SESSION_MODELS, lastProvider: 'commandcode', items: [
    ...SESSION_MODELS.items,
    { provider: 'commandcode', model: 'deepseek/deepseek-v4.1-flash-fast', tokens: 98_000, requests: 12 }
  ] };
  fixture.providerBalances = balancesOf([
    { provider: 'opencode-go', kind: 'opencode-plan', currency: 'USD', fetchedAt: Date.now(),
      windows: [{ id: 'rolling', usedPercent: 0 }, { id: 'weekly', usedPercent: 0 }, { id: 'monthly', usedPercent: 0 }] },
    { provider: 'openrouter', kind: 'credits', currency: 'USD', remaining: 1.5, fetchedAt: Date.now() },
    { provider: 'commandcode', kind: 'commandcode-plan', currency: 'USD', fetchedAt: Date.now(),
      windows: [{ id: 'fiveHour', usedPercent: 0 }, { id: 'weekly', usedPercent: 0 }],
      credits: { monthly: 999.99, purchased: 0, free: 0 } }
  ]);
  return fixture;
}

// The realistic Command Code state (one untouched window, one half used, a small
// credit balance) - the shape this account actually reports.
function commandCodeTypicalCase(locale) {
  const fixture = commandCodeCase(locale);
  fixture.id = 'commandcode-typical-' + locale;
  const entry = fixture.providerBalances.byProvider.commandcode.data;
  entry.windows = entry.windows.map((window, index) => ({ ...window, usedPercent: [0, 50.04][index] }));
  entry.credits = { monthly: 6.9983883725, purchased: 0, free: 0 };
  return fixture;
}

// `--shot <paneHeight> [case] [width]` writes one ready-to-look-at page so a
// human (or an agent with an image viewer) can see the real rendering.
if (process.argv.includes('--shot')) {
  const index = process.argv.indexOf('--shot');
  const shotHeight = Number(process.argv[index + 1]) || 1080;
  const shotArg = process.argv[index + 2] || 'session';
  // `--shot 1000 sources-5-en 340` renders a mixed five-source English session.
  const shotCase = shotArg.startsWith('sources-')
    ? sourcesCase(Number(shotArg.split('-')[1]), shotArg.split('-')[2] || 'zh')
    : shotArg.startsWith('mixed-plan-')
      ? mixedPlanCase(shotArg.split('-').pop())
      : shotArg.startsWith('commandcode')
        ? commandCodeCase(shotArg.split('-').pop())
        : shotArg === 'account'
          ? accountOnlyCase()
          : shotArg === 'single'
            ? singleModelCase()
            : caseOf();
  const shotWidth = Number(process.argv[index + 3]) || 420;
  const file = join(tmpdir(), 'aup-shot-' + shotHeight + '-' + shotCase.id + '-' + shotWidth + '.html');
  writeFileSync(file, page(css, shotHeight, shotCase, '', shotWidth));
  console.log(file);
  shutdown(0);
}

// `--tiers` prints the panel's content height at every shedding tier so the
// media-query thresholds are chosen from measurements instead of guesses.
if (process.argv.includes('--tiers')) {
  // Exactly the production shedding order (see the @container ladder in client.js).
  const STEP = [
    ['− token bar', '.aup-compose'],
    ['− model rows', '.aup-card-session .aup-models,.aup-card-session .aup-sep-models'],
    ['− stat rows', '.aup-card-session .aup-stat-list,.aup-card-session .aup-sep-stats'],
    ['− provider rows', '.aup-card-session .aup-providers,.aup-card-session .aup-sep-providers'],
    ['− context block', '.aup-card-session .aup-context'],
    ['− token 2×2', '.aup-card-session .aup-session-grid']
  ];
  // `--tiers 5` measures a five-source mixed session (per-source ladder budget).
  const tierSources = Number(process.argv[process.argv.indexOf('--tiers') + 1]) || 3;
  const TIERS = [['all', '']];
  for (let index = 0; index < STEP.length; index += 1) {
    const hidden = STEP.slice(0, index + 1).map(([, selector]) => selector + '{display:none}').join('');
    TIERS.push([STEP[index][0], hidden]);
  }
  const tierDir = mkdtempSync(join(tmpdir(), 'aup-tiers-'));
  console.log('tier'.padEnd(20) + 'content   cards');
  for (const [label, extra] of TIERS) {
    // Keep the pane tall so no ladder step fires, then freeze both cards at their
    // natural height and add those heights up: that is the content height.
    const extraCss = extra + '.aup-cards>.aup-card{flex:0 0 auto}';
    const measured = await measure(css, tierDir, 1600, tierSources > 3 ? sourcesCase(tierSources, 'zh') : caseOf(), extraCss);
    if (measured === undefined) {
      console.log(label.padEnd(20) + 'no measurement');
      continue;
    }
    const content = measured.cards.reduce((sum, card) => sum + card.height, 0) + 6 * Math.max(0, measured.cards.length - 1);
    console.log(label.padEnd(20) + String(content).padEnd(10) + measured.cards.map((card) => card.height).join('/'));
  }
  shutdown(0);
}

// Mixed sessions list every source in the balance card (no tabs). More sources add
// one statistics row and one balance row each; the per-count CSS budget must keep
// every state free of overlap, overflow, scrolling and a bottom dead band.
if (process.argv.includes('--debug-narrow')) {
  const width = Number(process.argv[process.argv.indexOf('--debug-narrow') + 1]) || 299;
  for (const locale of ['zh', 'en']) {
    for (const [name, fixture] of [['typical', sourcesCase(3, locale)], ['worst', wrapCase(locale)]]) {
      const r = await measure(css, mkdtempSync(join(tmpdir(), 'aup-narrow-')), 1400, fixture, '.aup-cards>.aup-card{flex:0 0 auto}', width);
      console.log(locale, width, name.padEnd(8), JSON.stringify(r.acctPairs), 'legend', r.legendLines, r.legendOverflow);
    }
  }
  shutdown(0);
}
if (process.argv.includes('--debug-wrap')) {
  for (const locale of ['zh', 'en']) {
    const r = await measure(css, mkdtempSync(join(tmpdir(), 'aup-wrap-')), 1600, wrapCase(locale), '.aup-cards>.aup-card{flex:0 0 auto}', 340);
    console.log(locale, 340, JSON.stringify(r.acctPairs));
  }
  shutdown(0);
}
if (process.argv.includes('--debug-commandcode')) {
  const widths = (process.argv[process.argv.indexOf('--debug-commandcode') + 1] || '340,320,310,300').split(',').map(Number);
  const variants = [
    ['worst', [0, 0], 999.99],
    ['typical', [0, 50.04], 6.998]
  ];
  for (const locale of ['zh', 'en']) for (const w of widths) for (const [name, percents, credit] of variants) {
    const fixture = commandCodeCase(locale);
    fixture.id = 'commandcode-' + name + '-' + locale;
    const entry = fixture.providerBalances.byProvider.commandcode.data;
    entry.windows = entry.windows.map((window, index) => ({ ...window, usedPercent: percents[index] }));
    entry.credits = { monthly: credit, purchased: 0, free: 0 };
    const r = await measure(css, mkdtempSync(join(tmpdir(), 'aup-cc-')), 1600, fixture, '.aup-cards>.aup-card{flex:0 0 auto}', w);
    const row = (r?.acctPairs ?? []).find((pair) => pair.label === 'Command Code');
    console.log(locale, w, name.padEnd(8), 'lines=' + row?.lines, 'nat=' + row?.natural, 'avail=' + row?.available);
  }
  shutdown(0);
}
if (process.argv.includes('--debug-model')) {
  const widths = (process.argv[process.argv.indexOf('--debug-model') + 1] || '340,320,300').split(',').map(Number);
  for (const locale of ['zh', 'en']) for (const w of widths) {
    const r = await measure(css, mkdtempSync(join(tmpdir(), 'aup-model-')), 900, sourcesCase(3, locale), '', w);
    console.log(locale, w, JSON.stringify(r.modelRows));
  }
  shutdown(0);
}
if (process.argv.includes('--debug-sources')) {
  for (const [loc, w, n] of [['en', 340, 5], ['zh', 340, 5]]) { const r = await measure(css, mkdtempSync(join(tmpdir(), 'aup-debug-')), 1600, sourcesCase(n, loc), '.aup-cards>.aup-card{flex:0 0 auto}', w); console.log(loc, w, n, r.cards.map((c) => c.height).join('/'), JSON.stringify(r.acctRows), JSON.stringify(r.providerRows)); }
  shutdown(0);
}
const providerFailures = [];
let providerChecks = 0;
const providerDir = mkdtempSync(join(tmpdir(), 'aup-provider-rows-'));
for (const locale of ['zh', 'en']) for (const width of [340, 420]) for (const height of [700, 900, 1080]) {
  // Seven sources need every optional block shed plus the recorded per-source
  // budget (see the `--tiers 7` row in AGENTS.md §7.1), so 700px is checked up to five.
  for (const count of height < 802 ? [3, 4, 5] : [3, 4, 5, 7]) {
    const fixture = sourcesCase(count, locale);
    const result = await measure(css, providerDir, height, fixture, '', width);
    const label = `${locale} ${width}×${height} ${count} sources`;
    if (!result || result.cards.length !== 2) { providerFailures.push(label + ': expected two cards, got ' + (result ? result.cards.length : 'none')); continue; }
    // The session card never truncates: every model row it draws is rendered, so the
    // rows are either all visible or all shed as one block - never a "N more models"
    // cut. Only multi-model providers get a detail row (see detailModelCount).
    const expectedModels = detailModelCount(fixture.sessionModels.items);
    const visibleModels = (result.modelRows ?? []).filter((row) => row.height > 0).length;
    if (visibleModels !== 0 && visibleModels !== expectedModels) {
      providerFailures.push(`${label}: model rows truncated -> ${visibleModels}/${expectedModels}`);
    }
    if (visibleModels > 0 && (result.modelRows ?? []).some((row) => row.height > 20)) {
      providerFailures.push(`${label}: a model row wrapped`);
    }
    if (result.overlaps.length || result.cardOverflow.length || result.horizontal.length || result.scrolls || result.deadBand > 2) {
      providerFailures.push(label + ': geometry invalid ' + JSON.stringify({ overlaps: result.overlaps, cardOverflow: result.cardOverflow, horizontal: result.horizontal, scroll: result.scrollInfo, deadBand: result.deadBand }));
    }
    for (const name of ['acctLabelLeft', 'acctValueRight', 'provLabelLeft', 'provTokensRight']) {
      if ((result.align?.[name] ?? []).length > 1) providerFailures.push(`${label}: ${name} not aligned -> ${result.align[name].join(' / ')}`);
    }
    // One line per provider, and the block sits between the statistics rows and the
    // per-model rows (1.0.16).
    for (const row of result.providerRows ?? []) {
      if (row.height > 20) providerFailures.push(`${label}: provider row wrapped -> ${row.text}`);
    }
    if (result.sessionOrder && result.sessionOrder.join(',') !== 'stat-list,providers,models') {
      providerFailures.push(`${label}: session block order is ${result.sessionOrder.join(',')}`);
    }
    // A balance row never wraps or clips its figures, whatever the source count.
    for (const pair of result.acctPairs ?? []) {
      if (pair.lines !== 1) providerFailures.push(`${label}: balance figures wrapped -> ${pair.label} ${pair.text}`);
      if (pair.clipped) providerFailures.push(`${label}: balance figures clipped -> ${pair.label} ${pair.text}`);
    }
    if ((result.centring?.acctValue ?? 0) > 1) providerFailures.push(`${label}: balance values not centred`);
    providerChecks++;
  }
}
// Below the documented 340px floor the panel gets one more compaction step
// (container query <=330px): typical two-digit values and both footers must still
// read as single lines, with no overflow, overlap or scroll.
for (const locale of ['zh', 'en']) for (const width of [330, 300]) {
  const result = await measure(css, providerDir, 900, sourcesCase(3, locale), '', width);
  const label = `${locale} ${width} narrow`;
  if (!result || result.cards.length !== 2) { providerFailures.push(label + ': expected two cards, got ' + (result ? result.cards.length : 'none')); continue; }
  if (result.overlaps.length || result.cardOverflow.length || result.horizontal.length || result.scrolls || result.deadBand > 2) {
    providerFailures.push(label + ': geometry invalid ' + JSON.stringify({ overlaps: result.overlaps, cardOverflow: result.cardOverflow, horizontal: result.horizontal, scroll: result.scrollInfo, deadBand: result.deadBand }));
  }
  for (const pair of result.acctPairs ?? []) {
    if (pair.lines !== 1) providerFailures.push(`${label}: balance figures wrapped -> ${pair.label} ${pair.text}`);
    if (pair.clipped) providerFailures.push(`${label}: balance figures clipped -> ${pair.label}`);
  }
  if (result.legendLines > 1) providerFailures.push(`${label}: context legend wrapped`);
  if (result.legendOverflow) providerFailures.push(`${label}: context legend overflows`);
  for (const row of result.modelRows ?? []) {
    if (row.height > 20) providerFailures.push(`${label}: model row wrapped -> ${row.text}`);
  }
  providerChecks++;
}
// Below 340px the ultra-narrow step must still keep even three `100%` windows on
// one line (user 2026-11-09: "真的放不下吗？我觉得还可以优化争取一行放完").
for (const locale of ['zh', 'en']) for (const width of [320, 310, 300]) {
  for (const [name, fixture] of [['worst', wrapCase(locale)], ['mixed', mixedPlanCase(locale)]]) {
    const result = await measure(css, providerDir, 900, fixture, '', width);
    const label = `${locale} ${width} narrow ${name}`;
    if (!result) { providerFailures.push(label + ': no measurement'); continue; }
    for (const pair of result.acctPairs ?? []) {
      if (pair.lines !== 1) providerFailures.push(`${label}: balance figures wrapped -> ${pair.text}`);
      if (pair.clipped) providerFailures.push(`${label}: balance figures clipped -> ${pair.text}`);
    }
    if (result.legendLines > 1) providerFailures.push(`${label}: context legend wrapped`);
    if (result.legendOverflow) providerFailures.push(`${label}: context legend overflows`);
    for (const row of result.modelRows ?? []) {
      if (row.height > 20) providerFailures.push(`${label}: model row wrapped -> ${row.text}`);
    }
    if (result.horizontal.length || result.cardOverflow.length || result.overlaps.length) {
      providerFailures.push(label + ': geometry invalid');
    }
    providerChecks++;
  }
}
// Command Code adds a 5-hour + weekly window and the credits left, so its row is the
// longest third-party row the panel draws. Measured rule (see AGENTS §7): every value,
// including three `100%` and a `999.99$` credit balance, stays on one line down to the
// 320px narrow tier; at 300-319px the realistic state (small credit balance) still does,
// and only an unusually wide credit amount may take a second line - that is the recorded
// physical limit for this longer Provider name, below the comfort width.
for (const locale of ['zh', 'en']) for (const [width, fixture] of [[420, commandCodeCase], [340, commandCodeCase], [320, commandCodeCase], [310, commandCodeTypicalCase], [300, commandCodeTypicalCase]]) {
  const result = await measure(css, providerDir, 1600, fixture(locale), '.aup-cards>.aup-card{flex:0 0 auto}', width);
  const label = `${locale} ${width} command code`;
  if (!result) { providerFailures.push(label + ': no measurement'); continue; }
  const row = (result.acctPairs ?? []).find((pair) => pair.label === 'Command Code');
  if (row === undefined) providerFailures.push(label + ': no Command Code row measured');
  // The credits pair is present with its own short label, and every label keeps a
  // measurable gap before its figure (user 2026-11-09: 「英文和数字之间也加个空格吧」).
  if (row !== undefined) {
    const creditPair = row.pairs[row.pairs.length - 1];
    if (creditPair === undefined || creditPair.label !== (locale === 'en' ? 'CR' : '额度')) providerFailures.push(label + ': wrong credit label -> ' + JSON.stringify(row.pairs));
    for (const pair of row.pairs) {
      if (pair.gap < 1) providerFailures.push(`${label}: label touches its figure -> ${pair.label} ${pair.figure} (${pair.gap}px)`);
    }
  }
  for (const pair of result.acctPairs ?? []) {
    if (pair.lines !== 1) providerFailures.push(`${label}: balance figures wrapped -> ${pair.label} ${pair.text}`);
    if (pair.clipped) providerFailures.push(`${label}: balance figures clipped -> ${pair.label} ${pair.text}`);
  }
  if (result.horizontal.length || result.cardOverflow.length || result.overlaps.length) {
    providerFailures.push(label + ': geometry invalid');
  }
  providerChecks++;
}
// The minimum width is the hard floor for the "never wrap" rule (user 2026-11-08):
// three 4-character percentages must still read as one line at 340px.
for (const locale of ['zh', 'en']) {
  const result = await measure(css, providerDir, 900, wrapCase(locale), '', 340);
  const pairs = result?.acctPairs ?? [];
  if (pairs.length === 0) providerFailures.push(`${locale} 340 minimum width: no balance rows measured`);
  for (const pair of pairs) {
    if (pair.lines !== 1) providerFailures.push(`${locale} 340 minimum width: balance figures wrapped -> ${pair.label} ${pair.text}`);
    if (pair.clipped) providerFailures.push(`${locale} 340 minimum width: balance figures clipped -> ${pair.label} ${pair.text}`);
  }
  providerChecks++;
}
console.log(`provider rows: ${providerChecks} states; zh/en, 340/420 wide, 700/900/1080 high, 3/4/5 sources (7 from 900), single-line minimum-width check`);
if (process.argv.includes('--providers')) {
  const providerSummary = `${providerChecks} provider-row states in ${((Date.now() - startedAt) / 1000).toFixed(1)}s (${browser.launches + legacyLaunches} browser launch${browser.launches + legacyLaunches === 1 ? '' : 'es'})`;
  if (providerFailures.length) {
    console.error('provider row geometry failed: ' + providerSummary);
    for (const failure of providerFailures) console.error('  - ' + failure);
    shutdown(1);
  }
  console.log('provider row geometry passed: ' + providerSummary);
  shutdown(0);
}
const SWEEPS = [
  // 584/585 straddle the first shedding step (hide the decorative token bar at
  // <= 584); 575/532/448/384/330 sit on the later steps, 330/331 straddle the last
  // one, and 700/900/1080/1200 cover the ordinary panes where all of it is visible.
  { width: 420, heights: [330, 331, 384, 448, 532, 575, 584, 585, 700, 900, 1080, 1200] },
  // The documented minimum width at the first ladder step and at full content.
  { width: 340, heights: [584, 900, 1080] }
];
// The panel has one state now: no range tabs, so no dimension axis to sweep.
const CASES = [caseOf()];

const dir = mkdtempSync(join(tmpdir(), 'aup-layout-'));
const failures = [...providerFailures];
const rows = [];
for (const sweep of SWEEPS) {
  for (const height of sweep.heights) {
    for (const testCase of CASES) {
      const result = await measure(css, dir, height, testCase, '', sweep.width);
      const label = `${sweep.width}×${height} ${testCase.id}`;
      if (result === undefined) {
        failures.push(`${label}: no measurement returned`);
        continue;
      }
      rows.push({ ...result, caseId: testCase.id, requested: height, requestedWidth: sweep.width });
      if (result.overlaps.length > 0) failures.push(`${label}: overlapping text -> ${result.overlaps.join(' | ')}`);
      if (result.cardOverflow.length > 0) failures.push(`${label}: card content overflows -> ${result.cardOverflow.join(' | ')}`);
      if (result.horizontal.length > 0) failures.push(`${label}: horizontal overflow -> ${result.horizontal.join(' | ')}`);
      if (result.deadBand > 2) failures.push(`${label}: dead band at the pane bottom -> ${result.deadBand}px`);
      if (result.scrolls) failures.push(`${label}: the card column scrolls (${result.scrollInfo}) - the panel must never scroll`);
      for (const [name, edges] of Object.entries(result.align ?? {})) {
        if (edges.length > 1) failures.push(`${label}: ${name} is not aligned across rows -> ${edges.join(' / ')}`);
      }
      for (const [name, footer] of Object.entries(result.footers ?? {})) {
      if (footer === null || footer === undefined) continue;
      const cells = footer.cells;
      if (cells.length !== 3) {
        failures.push(`${label}: the ${name} footer renders ${cells.length} cells instead of 3`);
        continue;
      }
      if (Math.abs(cells[0].left - footer.left) > 1) {
        failures.push(`${label}: the ${name} footer does not start at the card edge (off by ${(cells[0].left - footer.left).toFixed(1)}px)`);
      }
      if (Math.abs(cells[2].right - footer.right) > 1) {
        failures.push(`${label}: the ${name} footer does not end at the card edge (off by ${(cells[2].right - footer.right).toFixed(1)}px)`);
      }
      if (Math.abs(cells[1].center - footer.center) > 1.5) {
        failures.push(`${label}: the ${name} footer middle cell is not centred (off by ${(cells[1].center - footer.center).toFixed(1)}px)`);
      }
    }
    for (const [name, offset] of Object.entries(result.centring ?? {})) {
        if (offset > 1) failures.push(`${label}: ${name} is not vertically centred -> off by ${offset}px`);
      }
    }
  }
}

// Space allocation (user 2026-11-09: "底部太挤了 上面太空了 两个卡片的高度没安排好"):
// the leftover height is shared by BOTH cards in proportion to how much information
// they carry - the dense session card takes the larger share, the balance card takes
// a real share of its own instead of being squeezed against the pane bottom.
const heightOf = (result, className) => {
  const card = result.cards.find((entry) => String(entry.classes).includes(className));
  return card === undefined ? undefined : card.height;
};
const pick = (requested) => rows.find((row) => row.requested === requested && row.requestedWidth === 420 && row.caseId === 'session');
const small = pick(1080);
const large = pick(1200);
if (small === undefined || large === undefined) {
  failures.push('space allocation: the 420px 1080/1200 pane measurements are missing');
} else {
  const smallAccount = heightOf(small, 'aup-card-account');
  const largeAccount = heightOf(large, 'aup-card-account');
  const smallSession = heightOf(small, 'aup-card-session');
  const largeSession = heightOf(large, 'aup-card-session');
  if (smallAccount === undefined || largeAccount === undefined || smallSession === undefined || largeSession === undefined) {
    failures.push('space allocation: could not find the session and balance cards');
  } else {
    const accountGrowth = largeAccount - smallAccount;
    const sessionGrowth = largeSession - smallSession;
    if (accountGrowth < 20) {
      failures.push(`space allocation: the balance card does not take its share of the leftover height (${smallAccount}px -> ${largeAccount}px)`);
    }
    if (sessionGrowth <= accountGrowth) {
      failures.push(`space allocation: the dense session card must take the larger share of the leftover height (${smallSession}px -> ${largeSession}px, balance ${smallAccount}px -> ${largeAccount}px)`);
    }
    if (largeAccount > (large.paneHeight - 60) * 0.34) {
      failures.push(`space allocation: the balance card dominates the column (${largeAccount}px of ${large.paneHeight}px)`);
    }
  }
}

// `--debug-footers` prints the measured footer geometry, so a passing run is
// provably measuring something (and not just skipping a missing selector).
if (process.argv.includes('--debug-footers')) {
  const wanted = [...rows].filter((row) => row.requested === 1080 && row.caseId === 'session');
  for (const row of wanted) {
    for (const [name, footer] of Object.entries(row.footers ?? {})) {
      if (footer === null || footer === undefined) { console.log(name, 'missing'); continue; }
      const cells = footer.cells.map((cell) => `${cell.left.toFixed(0)}..${cell.right.toFixed(0)}`).join('  ');
      console.log(`${name}: row ${footer.left.toFixed(1)}..${footer.right.toFixed(1)}  cells ${cells}`);
    }
  }
  shutdown(0);
}

console.log('pane      scrolls  scrollH/clientH  bottom-gap  card heights');
for (const result of rows) {
  const label = result.paneWidth + '×' + result.paneHeight;
  console.log(
    label.padEnd(10) +
      (result.scrolls ? 'yes' : 'no ').padEnd(9) +
      String(result.scrollInfo).padEnd(17) +
      (result.deadBand + 'px').padEnd(12) +
      result.cards.map((card) => card.height).join(' / ')
  );
}

// One run, one set of numbers: the coverage counts used to require a second full
// run just to read them off, so they are part of every verdict.
const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
const launches = browser.launches + legacyLaunches;
const summary =
  `${providerChecks} provider-row states + ${rows.length} pane states = ${browser.measurements} measurements in ${elapsed}s` +
  ` (${browser.fallback === null ? launches + ' browser launch' + (launches === 1 ? '' : 'es') : launches + ' launches, shared browser unavailable'})`;

if (failures.length > 0) {
  console.error('\nlayout check failed: ' + summary);
  for (const failure of failures) console.error('  - ' + failure);
  shutdown(1);
}
console.log('\nlayout check passed: ' + summary + ' - no overlap, no overflow, no dead band, no scroll, aligned and centred');
shutdown(0);
