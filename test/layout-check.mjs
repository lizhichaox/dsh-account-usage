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

/** One text leaf: real markup so line heights, gaps and wrapping match production. */
function head(title, withDims) {
  const dims = withDims
    ? `<div class="aup-dims" role="tablist">${['Day', 'Week', 'Month', 'Qtr', 'Year']
        .map((label, index) => `<button type="button" class="aup-dim"${index === 0 ? ' data-active="true"' : ''}>${label}</button>`)
        .join('')}</div>`
    : '';
  return `<div class="${withDims ? 'aup-stats-head' : 'aup-card-head'}">
    <div class="aup-card-head-main"><span class="aup-card-icon">◧</span><h3 class="aup-card-title">${title}</h3></div>
  </div><span class="aup-divider"></span>${dims}`;
}

function sessionCard() {
  const cells = [
    ['Input (uncached)', '6.75M'],
    ['Output', '1.02M'],
    ['Cache read', '452M'],
    ['Cache write', '0']
  ]
    .map(
      ([label, value]) =>
        `<div class="aup-session-cell"><dt class="aup-session-label"><span class="aup-token-dot"></span>${label}</dt><dd class="aup-session-value">${value}</dd></div>`
    )
    .join('');
  const stats = [
    ['Turn/Step', '98 / 1274'],
    ['Requests', '1265'],
    ['Cache', '98.5%'],
    ['Avg', '363K'],
    ['Speed', '161 tok/s'],
    ['Model', '3h25m'],
    ['Tools', '1h40m'],
    ['TTFT', '4.7s']
  ]
    .map(([label, value]) => `<div class="aup-stat-row"><span class="aup-stat-label">${label}</span><span class="aup-stat-value">${value}</span></div>`)
    .join('');
  const models = [
    'OpenCode Go - deepseek-v4.1-flash',
    'OpenRouter - deepseek-flash-latest',
    'DeepSeek API - deepseek-flash'
  ]
    .map((name) => `<div class="aup-model-row"><span class="aup-model-name">${name}</span><span class="aup-model-tokens">251M</span></div>`)
    .join('');
  return `<section class="aup-card aup-card-session aup-card-session-fixed">
    ${head('Session usage', false)}
    <div class="aup-session-body">
      <div class="aup-session-total"><span class="aup-session-total-label">Total</span><span class="aup-session-total-value">460M</span></div>
      <div class="aup-compose"><span class="aup-compose-seg" style="flex-grow:6;background:#f59e0b"></span><span class="aup-compose-seg" style="flex-grow:1;background:#4d93f8"></span><span class="aup-compose-seg" style="flex-grow:3;background:#a78bfa"></span></div>
      <dl class="aup-session-grid">${cells}</dl>
      <span class="aup-session-sep"></span>
      <div class="aup-stat-list">${stats}</div>
      <span class="aup-session-sep"></span>
      <div class="aup-models">${models}</div>
      <span class="aup-session-sep"></span>
      <div class="aup-context">
        <div class="aup-context-head"><span>Context usage</span><span class="aup-context-figures">565K / 1M (56%)</span></div>
        <div class="aup-bar"><span class="aup-bar-fill" style="width:56%"></span></div>
        <div class="aup-context-breakdown"><div class="aup-context-legend"><span class="aup-context-legend-item">System 0%</span><span class="aup-context-legend-item">Tools 2%</span><span class="aup-context-legend-item">Messages 98%</span></div></div>
      </div>
    </div>
  </section>`;
}

function statsCard(sources, rows) {
  const srcs = sources
    .map(
      ([label, tokens, side]) => `<div class="aup-src"><span class="aup-src-label">${label}</span>
        <span class="aup-src-track"><span class="aup-src-fill" style="width:80%"></span></span>
        <span class="aup-src-tokens">${tokens}</span><span class="aup-src-side">${side}</span></div>`
    )
    .join('');
  const periods = [
    ['11-05', '0', ''],
    ['11-06', '209M', 'CNY7.72'],
    ['11-07', '287M', 'CNY29.28'],
    ['11-08', '46.52M', 'CNY4.63']
  ]
    .slice(0, rows)
    .map(
      ([label, tokens, cost]) => `<div class="aup-series-row"><span class="aup-series-label">${label}</span>
        <span class="aup-series-track"><span class="aup-series-fill" style="width:60%"></span></span>
        <span class="aup-series-value"><span class="aup-series-tokens">${tokens}</span>${cost ? `<span class="aup-series-cost">${cost}</span>` : ''}</span></div>`
    )
    .join('');
  const slots = Array.from({ length: Math.max(0, 4 - rows) }, () => '<div class="aup-series-row aup-series-slot" aria-hidden="true"></div>').join('');
  return `<section class="aup-card aup-card-stats">
    ${head('Usage statistics', true)}
    <div class="aup-stats-body">
      <div class="aup-srcs">${srcs}</div>
      <div class="aup-series">${periods}${slots}</div>
      <div class="aup-stats-summary"><span>543M · 1520 requests</span><span class="aup-stats-total">CNY23.28</span></div>
    </div>
  </section>`;
}

function accountCard() {
  return `<section class="aup-card aup-card-account aup-card-account-provider">
    ${head('Account balance', false)}
    <div class="aup-src-tabs" role="tablist">
      <button type="button" class="aup-src-tab" data-active="true">DeepSeek API</button>
      <button type="button" class="aup-src-tab">OpenCode Go</button>
      <button type="button" class="aup-src-tab">OpenRouter</button>
    </div>
    <div class="aup-account-body">
      <div class="aup-provider-body">
        <div class="aup-provider-hero"><span class="aup-provider-hero-label">Plan left</span><span class="aup-provider-hero-value">95%</span></div>
        <div class="aup-provider-progress">
          <div class="aup-provider-rate"><span>5% used</span><span>This month</span></div>
          <div class="aup-bar"><span class="aup-bar-fill" style="width:5%"></span></div>
        </div>
        <div class="aup-plan-windows"><span class="aup-plan-window"><span class="aup-plan-window-label">5 hours</span><span class="aup-plan-window-value">10% used</span></span><span class="aup-plan-window"><span class="aup-plan-window-label">This week</span><span class="aup-plan-window-value">10% used</span></span></div>
      </div>
    </div>
  </section>`;
}

function page(css, height, options, extraCss = '') {
  const cards = [sessionCard(), statsCard(options.sources, options.rows), accountCard()].join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>${THEME}</style><style>${css}</style><style>${extraCss}</style></head>
<body><div id="pane" style="height:100vh"><div class="aup-root" style="height:100%">${
    '<div class="aup-head"><div class="aup-head-actions"><button type="button" class="aup-icon-button">⚙</button></div><span class="aup-head-greeting">Good morning</span><div class="aup-head-actions"><button type="button" class="aup-icon-button">⟳</button></div></div>'
  }<div class="aup-cards">${cards}</div></div></div>
<pre id="result">pending</pre>
<script>
const out = { height: ${height}, paneHeight: innerHeight, overlaps: [], cardOverflow: [], horizontal: [], scrolls: false, deadBand: 0, cards: [] };
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
  out.cards.push({ classes: card.className, height: Math.round(rectOf(card).height), scrollHeight: card.scrollHeight, clientHeight: card.clientHeight });
  if (card.scrollHeight > card.clientHeight + 1 || card.scrollWidth > card.clientWidth + 1) {
    out.cardOverflow.push(card.className + ' ' + card.scrollHeight + '>' + card.clientHeight + ' / ' + card.scrollWidth + '>' + card.clientWidth);
  }
}
if (cardsEl.scrollWidth > cardsEl.clientWidth + 1) out.horizontal.push(cardsEl.scrollWidth + '>' + cardsEl.clientWidth);
out.media = {
  q989: matchMedia('(max-height:989px)').matches,
  q959: matchMedia('(max-height:959px)').matches,
  q929: matchMedia('(max-height:929px)').matches,
  q889: matchMedia('(max-height:889px)').matches,
  q789: matchMedia('(max-height:789px)').matches,
  q739: matchMedia('(max-height:739px)').matches,
  viewport: innerHeight
};
out.shedding = {};
for (const selector of ['.aup-compose', '.aup-context-breakdown', '.aup-card-session .aup-models', '.aup-card-session .aup-stat-list', '.aup-context', '.aup-card-session .aup-session-grid']) {
  const el = document.querySelector(selector);
  out.shedding[selector] = el === null ? 'missing' : getComputedStyle(el).display;
}
// Column alignment: every row of the source list (and of the period list) must
// share one grid, otherwise the bars start at different x positions.
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
// Vertical centring: the bar track must sit on the row's own centre line, not at
// its top (a subgrid row that lost align-items:center top-aligns everything).
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
</script></body></html>`;
}

const HEIGHTS = [700, 760, 810, 900, 1000, 1080, 1200];
const SOURCES = [
  ['DeepSeek API', '543M', 'CNY23.28'],
  ['OpenCode Go', '251M', 'session'],
  ['OpenRouter', '180M', 'session']
];

const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
if (chrome === undefined) {
  console.log('layout check skipped: no Chrome/Chromium found');
  process.exit(0);
}

const css = readStylesheet();

// `--tiers` prints the panel's content height at every shedding tier so the
// media-query thresholds can be chosen from measurements instead of guesses.
if (process.argv.includes('--tiers')) {
  const TIERS = [
    ['all', ''],
    ['no compose', '.aup-compose{display:none}'],
    ['+ no pct legend', '.aup-compose,.aup-context-breakdown{display:none}'],
    ['+ no models', '.aup-compose,.aup-context-breakdown,.aup-card-session .aup-models{display:none}'],
    ['+ no stat list', '.aup-compose,.aup-context-breakdown,.aup-card-session .aup-models,.aup-card-session .aup-stat-list{display:none}'],
    ['+ no context', '.aup-compose,.aup-context-breakdown,.aup-card-session .aup-models,.aup-card-session .aup-stat-list,.aup-context{display:none}'],
    ['+ no token grid', '.aup-compose,.aup-context-breakdown,.aup-card-session .aup-models,.aup-card-session .aup-stat-list,.aup-context,.aup-session-grid{display:none}'],
    ['+ no plan rows', '.aup-compose,.aup-context-breakdown,.aup-card-session .aup-models,.aup-card-session .aup-stat-list,.aup-context,.aup-session-grid,.aup-plan-windows,.aup-provider-updated{display:none}']
  ];
  const tierDir = mkdtempSync(join(tmpdir(), 'aup-tiers-'));
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const startIndex = source.indexOf('const CSS = [');
  const endIndex = source.indexOf('].join(', startIndex);
  const tierCss = eval(source.slice(startIndex + 'const CSS = '.length, endIndex + 1)).join('\n');
  console.log('tier'.padEnd(20) + 'content   pane needed   cards');
  for (const [label, extra] of TIERS) {
    const file = join(tierDir, label.replace(/[^a-z0-9]+/gi, '-') + '.html');
    const measureCss = extra + '.aup-cards>.aup-card:last-child{flex:0 0 auto}';
    writeFileSync(file, page(tierCss.replace('.aup-root{', '.aup-root{height:auto!important;'), 2000, { sources: SOURCES, rows: 4 }, measureCss));
    const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--window-size=520,2000', `--user-data-dir=${join(tierDir, 'profile')}`, '--virtual-time-budget=3000', '--dump-dom', `file://${file}`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    const match = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/);
    const measured = JSON.parse(match[1].replace(/&quot;/g, '"'));
    const content = measured.scrollInfo !== undefined ? Number(measured.scrollInfo.split('/')[0]) : 0;
    const head = measured.scrollInfo !== undefined ? 0 : 0;
    console.log(label.padEnd(20) + String(content).padEnd(10) + '~' + String(content + 60).padEnd(13) + measured.cards.map((card) => card.height).join('/'));
  }
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), 'aup-layout-'));
const failures = [];
const rows = [];
for (const height of HEIGHTS) {
  for (const rowsCount of [4, 3]) {
    const file = join(dir, `pane-${height}-${rowsCount}.html`);
    writeFileSync(file, page(css, height, { sources: SOURCES, rows: rowsCount }));
    const dom = execFileSync(
      chrome,
      ['--headless=new', '--disable-gpu', '--no-sandbox', `--window-size=520,${height + 200}`, `--user-data-dir=${join(dir, 'profile')}`, '--virtual-time-budget=4000', '--dump-dom', `file://${file}`],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const match = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/);
    if (match === null) {
      failures.push(`${height}px rows=${rowsCount}: no measurement returned`);
      continue;
    }
    const result = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
    rows.push(result);
    if (result.overlaps.length > 0) failures.push(`${height}px rows=${rowsCount}: overlapping text -> ${result.overlaps.join(' | ')}`);
    if (result.cardOverflow.length > 0) failures.push(`${height}px rows=${rowsCount}: card content overflows -> ${result.cardOverflow.join(' | ')}`);
    if (result.horizontal.length > 0) failures.push(`${height}px rows=${rowsCount}: horizontal overflow -> ${result.horizontal.join(' | ')}`);
    if (result.deadBand > 2) failures.push(`${height}px rows=${rowsCount}: dead band at the pane bottom -> ${result.deadBand}px`);
    if (result.scrolls) failures.push(`${height}px rows=${rowsCount}: the card column scrolls (${result.scrollInfo}) - the panel must never scroll`);
    for (const [name, edges] of Object.entries(result.align ?? {})) {
      if (edges.length > 1) failures.push(`${height}px rows=${rowsCount}: ${name} is not aligned across rows -> ${edges.join(' / ')}`);
    }
    for (const [name, offset] of Object.entries(result.centring ?? {})) {
      if (offset > 1) failures.push(`${height}px rows=${rowsCount}: ${name} is not vertically centred -> off by ${offset}px`);
    }
  }
}

console.log('pane   rows  scrolls  scrollH/clientH  bottom-gap  card heights');
for (const result of rows) {
  const label = result.paneHeight + 'px';
  console.log(
    label.padEnd(7) +
      (result.cardOverflow.length === 0 ? 'ok' : 'BAD').padEnd(6) +
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
console.log('\nlayout check passed: no overlap, no card overflow, no dead band');
