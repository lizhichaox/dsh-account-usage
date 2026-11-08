#!/usr/bin/env node
/**
 * Real-browser layout check (no dependencies, uses the installed Chrome).
 *
 * The panel's promises are geometric — cards never overlap text, the pane has no
 * dead band, a dimension switch never moves anything — and only a real layout
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
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { panelHtml } from './render-fixture.mjs';

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
// providers, four period rows, the provider plan card and a full session card.
const DAY_MS = 24 * 60 * 60 * 1000;
function isoDay(offset) {
  const date = new Date();
  date.setDate(date.getDate() - offset);
  return date.toISOString().slice(0, 10);
}
const USAGE_DAYS = [0, 1, 2, 3].map((offset, index) => ({
  date: isoDay(offset),
  tokens: [46_520_000, 287_000_000, 209_000_000, 543_000_000][index],
  cost: [4.63, 10.92, 7.72, 23.28][index],
  count: [120, 300, 260, 840][index]
}));
const SESSION_MODELS = {
  phase: 'ready',
  totalTokens: 460_050_000,
  lastProvider: 'opencode-go',
  items: [
    { provider: 'opencode-go', model: 'deepseek-v4.1-flash', tokens: 251_000_000, requests: 800 },
    { provider: 'openrouter', model: 'deepseek-flash-latest', tokens: 180_000_000, requests: 420 },
    { provider: 'deepseek-account', model: 'deepseek-flash', tokens: 29_050_000, requests: 120 }
  ]
};
const PROVIDER_BALANCES = {
  phase: 'ready',
  error: undefined,
  items: [
    {
      provider: 'opencode-go',
      kind: 'opencode-plan',
      currency: 'USD',
      fetchedAt: Date.now(),
      windows: [
        { id: 'rolling', usedPercent: 16, resetsAt: Date.now() + 3600_000 },
        { id: 'weekly', usedPercent: 12, resetsAt: Date.now() + DAY_MS },
        { id: 'monthly', usedPercent: 6, resetsAt: Date.now() + DAY_MS }
      ]
    },
    { provider: 'openrouter', kind: 'credits', currency: 'USD', remaining: 1.5, used: 2, total: 3.5, fetchedAt: Date.now() },
    { provider: 'deepseek', kind: 'balance', currency: 'CNY', remaining: 12.5, fetchedAt: Date.now() }
  ]
};
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

function caseOf(dimension) {
  return {
    id: dimension,
    dimension,
    usageState: { phase: 'ready', ok: true, source: 'platform', days: USAGE_DAYS, currency: 'CNY', dimension, refreshing: false },
    projection: PROJECTION,
    sessionModels: SESSION_MODELS,
    providerBalances: PROVIDER_BALANCES
  };
}

const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
if (chrome === undefined) {
  console.log('layout check skipped: no Chrome/Chromium found');
  process.exit(0);
}
const css = readStylesheet();

// ---------------------------------------------------------------- launcher --
let launchSeq = 0;

/** Run one headless Chrome render, isolating the profile dir and retrying once. */
function render(file, dir, height) {
  launchSeq += 1;
  const profile = join(dir, 'profile-' + String(launchSeq));
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
  if (el.children.length > 0) continue;
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
  out.cards.push({ classes: card.className, height: Math.round(rectOf(card).height) });
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
  srcTrackLeft: columnEdges('.aup-srcs', '.aup-src-track', 'left'),
  srcSideRight: columnEdges('.aup-srcs', '.aup-src-side', 'right'),
  seriesTrackLeft: columnEdges('.aup-card-stats .aup-series', '.aup-series-track', 'left'),
  seriesValueRight: columnEdges('.aup-card-stats .aup-series', '.aup-series-value', 'right')
};
// One strict table: the provider rows and the period rows must share all four
// columns, so every bar starts on one line and every figure ends on one.
const edgesOf = (selector, edge) => {
  const edges = new Set();
  for (const el of document.querySelectorAll('.aup-card-stats ' + selector)) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1) continue;
    edges.add(Math.round(edge === 'right' ? rect.right : rect.left));
  }
  return [...edges].sort((a, b) => a - b);
};
out.table = {
  barLeft: edgesOf('.aup-src-track, .aup-series-track', 'left'),
  tokensRight: edgesOf('.aup-src-tokens, .aup-series-tokens', 'right'),
  amountRight: edgesOf('.aup-src-side, .aup-series-cost', 'right')
};
// The two card footers must share one left / centre / right structure.
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
out.footers = { legend: footerOf('.aup-context-legend'), summary: footerOf('.aup-stats-summary') };
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
  srcBar: centring('.aup-srcs', '.aup-src-track'),
  srcLabel: centring('.aup-srcs', '.aup-src-label'),
  seriesBar: centring('.aup-card-stats .aup-series', '.aup-series-track')
};
out.scrolls = cardsEl.scrollHeight > cardsEl.clientHeight + 1;
out.scrollInfo = cardsEl.scrollHeight + '/' + cardsEl.clientHeight;
const lastCard = document.querySelector('.aup-cards > .aup-card:last-child');
if (lastCard) out.deadBand = Math.round(rectOf(cardsEl).bottom - rectOf(lastCard).bottom);
document.getElementById('result').textContent = JSON.stringify(out);
`;

/** One measurement page: real panel markup inside a pane of the given size. */
function page(css, height, testCase, extraCss = '', width = 420) {
  const markup = panelHtml({
    dimension: testCase.dimension,
    usageState: testCase.usageState,
    projection: testCase.projection,
    sessionModels: testCase.sessionModels,
    providerBalances: testCase.providerBalances
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>${THEME}</style><style>${css}</style><style>${extraCss}</style></head>
<body><div id="pane" style="height:100vh;width:${width}px!important">${markup}</div>
<pre id="result">pending</pre>
<script>${MEASURE_SCRIPT}</script></body></html>`;
}

function measure(css, dir, height, testCase, extraCss = '', width = 420) {
  const file = join(dir, `pane-${width}x${height}-${testCase.id}.html`);
  writeFileSync(file, page(css, height, testCase, extraCss, width));
  const dom = render(file, dir, height);
  const match = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/);
  if (match === null) return undefined;
  return JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
}

// `--shot <paneHeight> [dimension] [width]` writes one ready-to-look-at page so a
// human (or an agent with an image viewer) can see the real rendering.
if (process.argv.includes('--shot')) {
  const index = process.argv.indexOf('--shot');
  const shotHeight = Number(process.argv[index + 1]) || 1080;
  const shotCase = caseOf(process.argv[index + 2] || 'day');
  const shotWidth = Number(process.argv[index + 3]) || 420;
  const file = join(tmpdir(), 'aup-shot-' + shotHeight + '-' + shotCase.id + '-' + shotWidth + '.html');
  writeFileSync(file, page(css, shotHeight, shotCase, '', shotWidth));
  console.log(file);
  process.exit(0);
}

// `--tiers` prints the panel's content height at every shedding tier so the
// media-query thresholds are chosen from measurements instead of guesses.
if (process.argv.includes('--tiers')) {
  // Exactly the production shedding order (see the @container ladder in client.js).
  const STEP = [
    ['− token bar', '.aup-compose'],
    ['− model rows', '.aup-card-session .aup-models'],
    ['− stat table', '.aup-card-session .aup-stat-list'],
    ['− context block', '.aup-context'],
    ['− token 2×2', '.aup-card-session .aup-session-grid']
  ];
  const TIERS = [['all', '']];
  for (let index = 0; index < STEP.length; index += 1) {
    const hidden = STEP.slice(0, index + 1).map(([, selector]) => selector + '{display:none}').join('');
    TIERS.push([STEP[index][0], hidden]);
  }
  const tierDir = mkdtempSync(join(tmpdir(), 'aup-tiers-'));
  console.log('tier'.padEnd(20) + 'content   cards');
  for (const [label, extra] of TIERS) {
    // Keep the pane tall so no ladder step fires, and stop the last card from
    // stretching, then add the card heights up: that is the natural content height.
    const extraCss = extra + '.aup-cards>.aup-card-session-fixed{flex:0 0 auto}';
    const measured = measure(css, tierDir, 1600, caseOf('day'), extraCss);
    if (measured === undefined) {
      console.log(label.padEnd(20) + 'no measurement');
      continue;
    }
    const content = measured.cards.reduce((sum, card) => sum + card.height, 0) + 6 * Math.max(0, measured.cards.length - 1);
    console.log(label.padEnd(20) + String(content).padEnd(10) + measured.cards.map((card) => card.height).join('/'));
  }
  process.exit(0);
}

const SWEEPS = [
  // 903/904 straddle the first shedding step (hide the token bar at <= 903).
  { width: 420, heights: [700, 810, 900, 903, 904, 1000, 1080, 1200] },
  // The documented minimum pane: six range tabs and both tables must still fit.
  { width: 340, heights: [900, 1080] }
];
const CASES = [caseOf('day'), caseOf('month'), caseOf('all')];

const dir = mkdtempSync(join(tmpdir(), 'aup-layout-'));
const failures = [];
const rows = [];
for (const sweep of SWEEPS) {
  for (const height of sweep.heights) {
    for (const testCase of CASES) {
      const result = measure(css, dir, height, testCase, '', sweep.width);
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
    for (const [name, edges] of Object.entries(result.table ?? {})) {
      if (edges.length > 1) failures.push(`${label}: the usage table column ${name} is not shared -> ${edges.join(' / ')}`);
    }
    for (const [name, offset] of Object.entries(result.centring ?? {})) {
        if (offset > 1) failures.push(`${label}: ${name} is not vertically centred -> off by ${offset}px`);
      }
    }
  }
}

// Space allocation: the leftover height must go to the information-dense card, so
// the session card grows with the pane while the two-row balance card stays put.
const heightOf = (result, className) => {
  const card = result.cards.find((entry) => String(entry.classes).includes(className));
  return card === undefined ? undefined : card.height;
};
const pick = (requested) => rows.find((row) => row.requested === requested && row.requestedWidth === 420 && row.caseId === 'day');
const small = pick(1000);
const large = pick(1200);
if (small !== undefined && large !== undefined) {
  const smallAccount = heightOf(small, 'aup-card-account');
  const largeAccount = heightOf(large, 'aup-card-account');
  const smallSession = heightOf(small, 'aup-card-session');
  const largeSession = heightOf(large, 'aup-card-session');
  if (smallAccount === undefined || largeAccount === undefined || smallSession === undefined || largeSession === undefined) {
    failures.push('space allocation: could not find the session and balance cards');
  } else {
    if (Math.abs(largeAccount - smallAccount) > 1) {
      failures.push(`space allocation: the balance card stretches with the pane (${smallAccount}px -> ${largeAccount}px) instead of hugging its content`);
    }
    if (largeSession - smallSession < 50) {
      failures.push(`space allocation: the dense session card does not grow with the pane (${smallSession}px -> ${largeSession}px)`);
    }
  }
}

// `--debug-footers` prints the measured footer geometry, so a passing run is
// provably measuring something (and not just skipping a missing selector).
if (process.argv.includes('--debug-footers')) {
  const wanted = [...rows].filter((row) => row.requested === 1080 && row.caseId === 'day');
  for (const row of wanted) {
    for (const [name, footer] of Object.entries(row.footers ?? {})) {
      if (footer === null || footer === undefined) { console.log(name, 'missing'); continue; }
      const cells = footer.cells.map((cell) => `${cell.left.toFixed(0)}..${cell.right.toFixed(0)}`).join('  ');
      console.log(`${name}: row ${footer.left.toFixed(1)}..${footer.right.toFixed(1)}  cells ${cells}`);
    }
  }
  process.exit(0);
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

if (failures.length > 0) {
  console.error('\nlayout check failed:');
  for (const failure of failures) console.error('  - ' + failure);
  process.exit(1);
}
console.log('\nlayout check passed: no overlap, no overflow, no dead band, no scroll, aligned and centred');
