/**
 * Dependency-free smoke test for the account usage bundle.
 *
 *   node test/smoke.mjs
 *
 * It loads the real client half against a stubbed Host, checks the manifest
 * contract, the right-sidebar registrations, account/platform readers (with a
 * mocked HTTP route and localStorage), and the rendered panel states. No build
 * step and no network are required.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { foldSessionModels } from '../index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- manifest --
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
{
  // The plugin-list intro is one short line (user 2026-11-08: within 20 characters)
  // that still names balances and tokens.
  const description = String(manifest.description || '');
  assert.ok(description.length > 0 && description.length <= 20, 'the plugin intro stays within 20 characters: ' + description);
  assert.ok(/balance/i.test(description) && /token/i.test(description), 'the intro names balances and tokens: ' + description);
}
{
  assert.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml', 'bundle patch declared');
  assert.equal(manifest.dsh?.client?.platform, 'web', 'web client half declared');
  assert.ok(manifest.exports?.['./client'], './client export declared');
  assert.ok(manifest.exports?.['./locale/*.json'], 'locale export declared');
  assert.ok(manifest.exports?.['./icon'], 'icon export declared');
  assert.ok(Array.isArray(manifest.files) && manifest.files.includes('client.js'), 'runtime files listed');
  assert.notEqual(manifest.private, true, 'package is publishable');
  assert.ok(manifest.engines?.dsh, 'dsh compatibility declared');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/, 'semver package version');
  const en = JSON.parse(fs.readFileSync(path.join(root, 'locale/en.json'), 'utf8'));
  const zh = JSON.parse(fs.readFileSync(path.join(root, 'locale/zh.json'), 'utf8'));
  assert.ok(en.meta.title && en.meta.description, 'English display metadata');
  assert.ok(zh.meta.title && zh.meta.description, 'Chinese display metadata');
  for (const lang of ['ja', 'es', 'fr', 'de', 'ru', 'pt']) {
    const fallback = JSON.parse(fs.readFileSync(path.join(root, 'locale/' + lang + '.json'), 'utf8'));
    assert.ok(fallback.meta.title && fallback.meta.description, 'English metadata fallback for ' + lang);
  }
  assert.ok(fs.statSync(path.join(root, 'icon.svg')).size > 0, 'icon present');
  assert.ok(fs.existsSync(path.join(root, 'cordis.patch.yml')), 'patch present');
  assert.ok(fs.existsSync(path.join(root, 'LICENSE')), 'license present');
  assert.equal(manifest.name, 'dsh-account-usage', 'npm package name');
  assert.equal(manifest.author, 'chaox', 'author');
  assert.equal(manifest.repository?.url, 'git+https://github.com/lizhichaox/dsh-account-usage.git', 'repository');
  assert.equal(manifest.homepage, 'https://github.com/lizhichaox/dsh-account-usage#readme', 'homepage');
}

{
  // The Host reports the newest routed message so the balance card can preselect it.
  const events = [
    { type: 'assistant/message', data: { turn: 1, step: 1, message: { source: { provider: 'deepseek-account', model: 'deepseek-chat' } }, usage: { inputTokens: 10, outputTokens: 5 } } },
    { type: 'assistant/message', data: { turn: 2, step: 1, message: { source: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' } }, usage: { inputTokens: 20, outputTokens: 10 } } }
  ];
  const folded = foldSessionModels(events);
  assert.equal(folded.length, 2, 'two providers fold into two rows');
  assert.equal(folded[0].provider, 'opencode-go', 'rows stay sorted by tokens');
}

// ------------------------------------------------------------- client boot --
const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
const iconSvg = fs.readFileSync(path.join(root, 'icon.svg'), 'utf8');
{
  // The listed icon has to convey usage (user 2026-11-08): three rising bars on the
  // app tile, no wallet silhouette left over from the balance-only design.
  const bars = [...iconSvg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="3" height="([\d.]+)"/g)]
    .map(([, x, y, h]) => ({ x: Number(x), y: Number(y), h: Number(h) }));
  assert.equal(bars.length, 3, 'the icon draws three usage bars');
  assert.ok(bars[0].x < bars[1].x && bars[1].x < bars[2].x, 'the bars march left to right');
  assert.ok(bars[0].h < bars[1].h && bars[1].h < bars[2].h, 'the bars rise like a usage trend');
  assert.ok(iconSvg.includes('aria-label="Account usage"'), 'the icon keeps an accessible name');
  assert.ok(!/wallet|["']aup-wallet/i.test(iconSvg), 'the wallet artwork is gone');
  assert.ok(!/#93c5fd/i.test(iconSvg), 'no leftover wallet flap colour');
}
{
  // One family + one size per text category: every declaration goes through the tokens.
  const rawSizes = source.match(/font-size:[0-9.]+px/g) || [];
  assert.equal(rawSizes.length, 0, 'every font size goes through a token: ' + JSON.stringify(rawSizes));
  const css = source;
  for (const token of ['--aup-font-ui', '--aup-fs-text']) {
    assert.ok(source.includes(token + ':'), 'declares ' + token);
  }
  assert.ok(!source.includes('--aup-fs-num'), 'exactly one font size token exists');

  // Latin text must look as solid as CJK: a Latin-first family stack (a CJK font
  // renders Latin thin), a 500 baseline so nothing inherits 400, and a secondary
  // text colour mixed towards label-primary (~8.6:1 on white) instead of bare
  // label-secondary (~5.8:1).
  const familyMatch = source.match(/--aup-font-ui:([^;]+);/);
  assert.ok(familyMatch !== null, 'the family stack is declared');
  const family = familyMatch[1];
  const latinAt = family.indexOf('Helvetica Neue');
  const cjkAt = family.indexOf('PingFang SC');
  assert.ok(latinAt > -1 && cjkAt > -1 && latinAt < cjkAt, 'Latin families precede CJK ones in the stack');
  assert.ok(source.includes('--aup-label-2:color-mix(in srgb,var(--dsw-alias-label-primary) 30%,var(--dsw-alias-label-secondary))'), 'secondary text is darkened from theme tokens');
  assert.ok(source.includes('font-size:var(--aup-fs-text);font-weight:500;line-height:20px}'), 'the panel root sets a 500 baseline weight');
  assert.equal((source.match(/font-weight:400/g) || []).length, 1, 'only the close glyph stays at 400');
  for (const selector of ['.aup-stat-label{', '.aup-series-label{', '.aup-card-title{', '.aup-model-name{']) {
    const rule = source.slice(source.indexOf(selector), source.indexOf(selector) + 400);
    assert.ok(rule.includes('var(--aup-label-2)'), selector + ' text uses the darkened secondary colour');
  }
}
assert.equal((source.match(/text-overflow:ellipsis/g) || []).length, 0, 'card text never uses ellipsis');

// The stylesheet must live in document.head: tab chips render outside the panel
// body, so a body-scoped sheet disappears (and deforms the chip) once the panel
// is switched away.
assert.ok(/document\.head\.appendChild\(tag\)/.test(source), 'the stylesheet is injected into document.head');
assert.ok(source.includes("root.setAttribute('data-account-usage-hide-stats'"), 'the composer dock stats are hidden by default');

// Layout is deterministic CSS only: no runtime measurement may decide heights.
// Cards size to their content, so none of them can ever be squeezed below it and
// no text can be painted over another text; the last card absorbs the leftover
// height so the panel never shows a dead band; the detail list always occupies
// the same number of slots so a dimension switch cannot move the cards below it.
assert.ok(source.includes('.aup-card{flex:0 0 auto;min-height:auto;'), 'cards size to their content and are never squeezed');
assert.ok(source.includes('.aup-cards>.aup-card-session-fixed{flex:1 1 auto;min-height:auto}'), 'the dense session card absorbs the leftover height');
// One strict four-column table for the whole card: description | pill bar |
// tokens | amount. Both the provider rows and the period rows are rows of it,
// so every bar starts on one line and every figure ends on one.
assert.ok(source.includes('.aup-srcs,.aup-series{display:contents}'), 'both row groups feed one shared table');
assert.ok(source.includes('grid-template-columns:minmax(0,1fr) minmax(52px,max-content) minmax(0,max-content)'), 'the card declares the three columns once');
assert.ok(!source.includes('.aup-srcs{flex:none;display:grid'), 'no private grid for the provider rows');
assert.ok(!source.includes('.aup-card-stats .aup-series{flex:0 0 auto;display:grid'), 'no private grid for the period rows');
assert.ok(source.includes('.aup-card-stats .aup-series>.aup-series-row:first-child::before'), 'a hairline marks the second group without breaking the columns');
assert.ok(source.includes('const SERIES_ROW_SLOTS = 4'), 'the list keeps a constant slot count');
assert.ok(source.includes('Math.max(0, SERIES_ROW_SLOTS - periodRows.length)'), 'spare slots pad the list in quarter/year');
assert.ok(source.includes('.aup-series-slot{min-height:21px;pointer-events:none}'), 'the padding rows stay invisible');
assert.ok(!source.includes('rowBudget') && !source.includes('ROW_PITCH_PX'), 'no measured row budget remains');
assert.ok(!source.includes('data-aup-compact'), 'no height-driven compact attribute remains');
// The panel must never scroll. The ladder measures the PANEL, not the window:
// container queries on the root, because the pane is shorter than the window and
// viewport breakpoints fired too late (that is why the pane still scrolled).
assert.ok(source.includes('container-type:size;container-name:aup-panel'), 'the panel root is a size container');
for (const rule of [
  '@container aup-panel (max-height:850px){.aup-compose{display:none!important}}',
  '@container aup-panel (max-height:838px){.aup-card-session .aup-models,.aup-card-session .aup-sep-models{display:none!important}}',
  '@container aup-panel (max-height:771px){.aup-card-session .aup-stat-list,.aup-card-session .aup-sep-stats{display:none!important}}',
  '@container aup-panel (max-height:680px){.aup-context,.aup-card-session .aup-sep-context{display:none!important}}',
  '@container aup-panel (max-height:615px){.aup-card-session .aup-session-grid{display:none!important}}'
]) {
  assert.ok(source.includes(rule), 'the measured shedding ladder contains: ' + rule);
}
assert.ok(!source.includes('@media (max-height:'), 'the old viewport ladder is gone');
// A shed block takes the separator that introduces it: never two hairlines in a row.
for (const sep of ['aup-sep-models', 'aup-sep-stats', 'aup-sep-context']) {
  assert.ok(source.includes("className: 'aup-session-sep " + sep + "'"), 'each session separator belongs to one block: ' + sep);
}
assert.ok(source.indexOf('@container aup-panel (max-height:850px)') > source.indexOf('.aup-compose{display:flex'), 'the ladder is declared after the base rules it overrides');
// Compacted so a typical pane still shows every block: the measured full content
// height dropped from 886px to 790px.
assert.ok(source.includes("'.aup-card{gap:4px;padding:8px}'"), 'cards are padding 8 / gap 4');
assert.ok(source.includes('line-height:18px}'), 'the stat table rows are 18px');
assert.ok(source.includes('.aup-card-stats .aup-series-row{flex:0 0 auto;min-height:21px;') && source.includes('.aup-src{display:grid;grid-template-columns:subgrid;grid-column:1/-1;align-items:center;min-height:21px;'), 'both row groups share the same 21px pitch');
assert.ok(source.includes('scrollbar-width:none'), 'the card column never shows a scrollbar');
assert.ok(source.includes('.aup-cards::-webkit-scrollbar{width:0;height:0;display:none}'), 'no webkit scrollbar either');
assert.ok(!source.includes('@container aup-card'), 'no dead container queries remain');
assert.ok(!/\.aup-stats-summary\{[^}]*position:/.test(source), 'the summary is in normal flow, never positioned over the rows');
assert.ok(!/\.aup-card\{[^}]*overflow:hidden/.test(source), 'cards never clip their content');
// The period list may never overflow its box: the row count is derived from the
// pane height (cards split it evenly), so rows can never paint over the summary.
// The measurement reads only pane/flex geometry, so it cannot feed back.
assert.ok(!source.includes('justify-content:space-between;gap:2px}'), 'period rows are not re-spread when their count changes');
assert.ok(source.includes('.aup-srcs,.aup-series{display:contents}'), 'the label column is shared, so the bar cannot shift sideways');
// Rows of one table must share a single grid: with a grid per row the label
// column is sized per row, so bars start at different x positions and the right
// edge does not line up either (user report: 左侧没对齐).
assert.ok(source.includes('grid-template-columns:minmax(0,1fr) minmax(52px,max-content) minmax(0,max-content)'), 'the source rows share the card grid');
// Inside a shared grid the row itself must still centre its cells: without
// align-items the bar track sticks to the top and the row reads as misaligned.
assert.ok(source.includes('grid-template-columns:subgrid;grid-column:1/-1;align-items:center'), 'subgrid rows centre their cells vertically');
assert.ok(source.includes('.aup-series-row{display:grid;grid-template-columns:subgrid;grid-column:1/-1;align-items:center'), 'period rows centre their cells vertically');
assert.ok(source.includes('display:grid;grid-template-columns:subgrid'), 'rows take their columns from the shared grid');
assert.ok(source.includes('.aup-srcs,.aup-series{display:contents}'), 'the period rows share the card grid');
// The loading frame keeps the ready card's height: same source rows, four period
// slots, same summary row. Clicking a range must not move the panel.
assert.ok(source.includes('const skeletonPeriodRows = Array.from({ length: SERIES_ROW_SLOTS }'), 'the loading frame reserves all four period slots');
assert.ok(source.includes("const loadingSourceCount = sessionOnly === true ? loadingProviderRows.length : loadingProviderRows.length + 1"), 'the loading frame reserves one row per source');
assert.ok(source.includes("const skeletonSummary = h("), 'the loading frame keeps the summary row');
assert.ok(!source.includes('const skeletonCount = DIMENSION_ROW_CAP[dimension]'), 'the loading frame no longer varies with the target range');
// An empty range keeps the four slots too, so switching to it cannot collapse the card.
assert.ok(!source.includes('listMode === true && sessionOnly !== true && series.total > 0'), 'the period list is not hidden for an empty range');
assert.ok(source.includes('series.total === 0 && providerRows.length === 0 && listMode !== true'), 'the empty hint only replaces the body when the list is off');
// Every period label carries its year: short "11-05" dates left a ragged gap and
// the table read as uneven.
assert.ok(source.includes("return year + '-' + pad(month + 1) + '-' + pad(start.getDate())"), 'day and week labels carry the year');
assert.ok(!source.includes('for (let index = 0; index < 7; index += 1)'), 'no fixed 7-row loading placeholder');
assert.ok(source.includes("const WARM_ORDER = ['year', 'quarter', 'month', 'week', 'day', 'all']"), 'every dimension is warmed, ALL last');
assert.ok(source.includes('for (const warmId of WARM_ORDER)'), 'the warm-up loop covers the whole order');

// ALL tab: a sixth dimension after year that spans every month with data.
assert.ok(source.includes("{ id: 'all', key: 'stats.dim.all', buckets: 0 }"), 'ALL is a dimension without a fixed bucket count');
assert.ok(source.includes("'stats.dim.all': '\u5168'"), 'the ALL tab is the Chinese 全');
assert.ok(source.includes("'stats.dim.all': 'ALL'"), 'the ALL tab is ALL in English');
assert.ok(source.includes('all: 4 }'), 'ALL shows four year rows');
assert.ok(source.includes('const ALL_WINDOW_MONTHS = 36') && source.includes('const ALL_MAX_MONTHS = 72'), 'ALL widens from three to six years');
assert.ok(source.includes('async function readAllPlatformUsage('), 'ALL has its own widening reader');
assert.ok(source.includes('function rememberAllStart(') && source.includes('ALL_START_STORAGE_KEY'), 'the discovered first month is remembered');
assert.ok(source.includes("const summaryCells = dimension === 'all' ? series.cells : visibleCells"), 'the ALL total covers every year it found');

// The panel fills the right sidebar: cards grow with the pane instead of leaving a
// blank band, the column never reserves a scrollbar gutter, and invisible padding
// rows are gone now that growth (not filler) keeps the height constant.
assert.ok(source.includes('.aup-cards>.aup-card-session-fixed{flex:1 1 auto;min-height:auto}'), 'the panel fills the pane height');
assert.ok(source.includes('.aup-card-account-provider{flex:0 0 auto;min-height:auto;'), 'the provider account card sizes to its content');
// Space follows information density: the session card (eight metrics) takes the
// slack and the balance card (three rows) hugs its content instead of stretching.
assert.ok(source.includes('.aup-card-session .aup-session-body{flex:1 1 auto;min-height:auto;display:flex;flex-direction:column;gap:6px;justify-content:space-evenly}'), 'the session content spreads evenly over the space it gets');
assert.ok(source.includes("'.aup-card-account{flex:0 0 auto;min-height:auto;justify-content:flex-start}'"), 'the balance card hugs its content');
assert.ok(source.includes("'.aup-account-body{flex:0 0 auto;display:flex;flex-direction:column;justify-content:flex-start;gap:6px}'"), 'the balance rows do not stretch inside the balance card');
// Mixed sessions: one aligned row per source in the statistics-table rhythm, no tabs.
assert.ok(source.includes("'.aup-acct-srcs{display:grid;grid-template-columns:minmax(0,max-content) minmax(0,1fr);"), 'every source row reads name left, figures right');
assert.ok(!source.includes('aup-acct-track') && !source.includes('aup-acct-fill'), 'balance rows write the amount; no capsule bars');
assert.ok(source.includes("'.aup-acct-src,.aup-acct-row{display:grid;grid-template-columns:subgrid;grid-column:1/-1;align-items:center;min-height:21px;"), 'source rows take their columns from the shared table');
assert.ok(!source.includes('aup-src-tab') && !source.includes('aup-account-pane'), 'no source tabs or stacked panes remain');
assert.ok(!source.includes('.aup-cards>.aup-card:last-child{flex:1 1 auto}'), 'no card earns space just for being last');
assert.ok(!source.includes('scrollbar-gutter'), 'the card column spans the full pane width');
assert.ok(source.includes('aup-series-slot'), 'invisible slot rows keep the list height constant');
assert.ok(source.includes('.aup-card-session .aup-session-body>.aup-context{margin-top:0}'), 'the context block rides the even spread, not a bottom anchor');
assert.ok(source.includes('.aup-stat-list::before{content:""'), 'a hairline separates the two stat columns');
// Housekeeping: no dead selectors or stale dictionary entries survive a cleanup pass.
for (const gone of ['.aup-series-value{', '.aup-model-track{', '.aup-model-fill{', "'.aup-glyph{", "'stats.sessionScope'"]) {
  assert.ok(!source.includes(gone), 'dead code is gone: ' + gone);
}
assert.ok(source.includes('const currencySymbols = new Map()'), 'currency symbols are cached per currency+locale');
// Accessibility and motion are part of the contract, not polish:
// - reduced-motion disables every transition and animation in the panel
// - every remaining control keeps a visible keyboard ring
// - progress tracks are decorative (the number beside them is the alternative)
assert.ok(source.includes('@media (prefers-reduced-motion:reduce){.aup-toggle,.aup-toggle-knob,.aup-icon-button,.aup-dim,.aup-series-row,.aup-pop-link{transition:none}.aup-skeleton,.aup-spin{animation:none}}'), 'reduced motion covers every transition and animation');
assert.ok(source.includes('.aup-icon-button:focus-visible'), 'the refresh button keeps a keyboard ring');
assert.ok(!source.includes('aup-retry') && !source.includes('onRetry'), 'failed reads never render Retry buttons');
assert.equal((source.match(/'aria-hidden': true/g) || []).length >= 6, true, 'decorative bars are hidden from screen readers');
// Capsule bars carried no information beyond the number beside them (user 2026-11-08):
// only the session card keeps its composition/context bars.
for (const gone of ['aup-src-track', 'aup-src-fill', 'aup-series-track', 'aup-series-fill', 'aup-skeleton-track', 'aup-acct-track']) {
  assert.ok(!source.includes(gone), 'no capsule bar outside the session card: ' + gone);
}
assert.ok(!source.includes('buildDetailStats'), 'the dead provider-detail stat builder is gone');
assert.ok(source.includes('.aup-stats-summary{grid-column:1/-1;margin-top:2px}'), 'the total row spans the whole table');
// Both card footers share one left / centre / right grid, so the panel reads as a
// single component instead of two differently spaced rows.
assert.ok(source.includes('.aup-context-legend,.aup-stats-summary{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)'), 'the two footers share one left/centre/right grid');
assert.ok(source.includes('.aup-context-legend>span:nth-child(3),.aup-stats-summary>span:nth-child(3){justify-self:end'), 'the third cell is pinned to the right edge');
assert.ok(source.includes("'stats.summary.total': 'Total {total}'") && source.includes("'stats.summary.requests': '{count} requests'"), 'the summary speaks in three parts');

// Theme contract: only tokens the installed UI theme defines in both light and dark.
// Values resolved from the shipped theme bundle (light | dark):
//   bg-layer-1 #fff | #232324, bg-skeleton #0000000a | #ffffff14,
//   interactive-bg-hover #2631480f | #ffffff14, border-l2 #0000001a | #ffffff1f,
//   label-primary #0f1115 | #f9fafb, label-secondary #61666b | #cfd3d6,
//   brand-primary #0f1115 | #f9fafb, state-error-primary #ec1313 | #f25a5a,
//   static blue-450/violet-400/amber-500/neutral-bluish-400 (same in both modes).
const THEME_TOKENS = new Set([
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-skeleton',
  '--dsw-alias-border-l2',
  '--dsw-alias-border-l3',
  '--dsw-alias-brand-primary',
  '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-state-error-primary',
  '--dsw-static-amber-500',
  '--dsw-static-blue-450',
  '--dsw-static-neutral-bluish-400',
  '--dsw-static-violet-400'
]);
{
  const used = new Set(source.match(/--dsw-[a-z0-9-]+/g) ?? []);
  for (const token of used) assert.ok(THEME_TOKENS.has(token), 'theme token is defined in both modes: ' + token);
  assert.ok(!used.has('--dsw-alias-bg-layer-2'), 'never use bg-layer-2 (it equals bg-layer-1 in light mode)');
  assert.ok(!used.has('--dsw-alias-border-l1'), 'card borders/separators use border-l2 for light-mode visibility');
  // Chart tints may carry a palette fallback (the documented chart-colour exception);
  // every other colour must come from a token.
  const fallbacks = new Set(['#4d93f8', '#a78bfa', '#f59e0b', '#adb2b8']);
  const hardCoded = (source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).filter((colour) => !fallbacks.has(colour.toLowerCase()));
  assert.deepEqual(hardCoded, [], 'no hard-coded colours beyond chart-tint fallbacks');
  for (const tint of ['blue-450', 'violet-400', 'amber-500', 'neutral-bluish-400']) {
    assert.ok(source.includes('var(--dsw-static-' + tint + ','), 'usage composition uses the theme tint ' + tint + ' with a palette fallback');
  }
}

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key)
};

const React = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    return { type, props: props === null || props === undefined ? {} : props, children: children.flat(Infinity) };
  },
  useState(initial) {
    if (stateQueue.length > 0) return [stateQueue.shift(), () => {}];
    return [typeof initial === 'function' ? initial() : initial, () => {}];
  },
  useEffect() {},
  useRef(value) {
    return { current: value };
  },
  useMemo(fn) {
    return fn();
  }
};
const stateQueue = [];

function bootClient(config = {}) {
  const mountedValue = config.noSession === true ? undefined : 'session-1';
  let module;
  new Function('window', 'require', source)(
    { __ModuleLoader__: { load: (loaded) => (module = loaded) } },
    (id) => {
      if (id === 'react') return React;
      throw new Error('unexpected require: ' + id);
    }
  );
  assert.equal(module.id, manifest.name, 'client module id matches the package name');
  const plugin = module.factory(() => React);
  const registrations = [];
  const shortcutRegistrations = [];
  const dictionaries = {};
  const ctx = {
    effect(activate) {
      return activate();
    },
    inject(names, callback) {
      if (names.includes('shortcuts')) {
        callback({ ...ctx, shortcuts: { register: (definition) => (shortcutRegistrations.push(definition), () => {}) }, effect: (fn) => fn() });
      }
    },
    locale: {
      register(namespace, value) {
        dictionaries[namespace] = value;
        return () => {};
      },
      bind(namespace) {
        return (key, params) => {
          let text = (dictionaries[namespace] || {}).zh?.[key];
          if (text === undefined) return key;
          if (params) text = text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
          return text;
        };
      },
      getSnapshot: () => ({ active: 'zh' }),
      subscribe: () => () => {}
    },
    slots: {
      inject(name, callback) {
        callback();
        return () => {};
      },
      register(definition, component) {
        registrations.push({ definition, component });
        return () => {};
      }
    },
    sidebarRightTabs: { register: (definition) => (tabTypes.push(definition), () => {}) },
    sidebarRight: {
      mounted: { getSnapshot: () => mountedValue, subscribe: () => () => {} },
      openTab(kind) {
        opened.push(kind);
      }
    },
    remote: accountRemote
  };
  const tabTypes = [];
  const opened = [];
  plugin.apply(ctx);
  return { plugin, ctx, t: ctx.locale.bind('accountUsage'), registrations, tabTypes, shortcutRegistrations, opened, dictionary: dictionaries };
}

let getProfileCalls = 0;
const accountRemote = {
  account: {
    async getState() {
      return { ok: true, value: { status: 'credential-stored', links: {}, attempt: null } };
    },
    async getProfile() {
      getProfileCalls += 1;
      return { ok: true, value: { status: 'ready', value: { name: 'x' } } };
    },
    async getBalance() {
      return {
        ok: true,
        value: { status: 'ready', value: [{ currency: 'CNY', balance: '542.52' }], bonusWallets: [{ currency: 'CNY', balance: '10' }] }
      };
    }
  },
  session: { async list() { return { ok: true, value: { items: [] } }; } }
};

// ------------------------------------------------------------------- fetch --
let fetchCalls = 0;
const daysInMonth = (year, month) => new Date(year, month, 0).getDate();
globalThis.fetch = async (url) => {
  fetchCalls += 1;
  const parsed = new URL(String(url), 'http://127.0.0.1');
  const year = Number(parsed.searchParams.get('year'));
  const month = Number(parsed.searchParams.get('month'));
  const days = [];
  for (let day = 1; day <= daysInMonth(year, month); day += 1) {
    days.push({
      date: year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'),
      tokens: 1000,
      cost: 0.5,
      requests: 2
    });
  }
  return { status: 200, json: async () => ({ ok: true, data: { year, month, currency: 'CNY', days, month: {}, fetchedAt: Date.now() } }) };
};

// -------------------------------------------------------------- registrations --
const first = bootClient();
{
  const dicts = first.dictionary.accountUsage;
  for (const lang of ['zh', 'en', 'ja', 'es', 'fr', 'de', 'ru', 'pt']) {
    assert.ok(dicts[lang], 'runtime dictionary registered for ' + lang);
  }
}
assert.equal(first.tabTypes.length, 1, 'one tab type registered');
{
  const type = first.tabTypes[0];
  assert.equal(type.kind, 'account-usage');
  assert.equal(type.title('x'), '用量', 'short tab title avoids truncation');
  assert.equal(type.guide.length, 1);
  assert.equal(type.guide[0].title(), '账号用量');
  assert.equal(type.guide[0].commandId, 'accountUsage.open', 'guide card links to the shortcut for its key hint');
  assert.equal(typeof type.guide[0].icon, 'function');
}
assert.equal(first.registrations.filter((r) => r.definition.name === 'sidebar.footer.action').length, 0, 'left sidebar action removed');
assert.equal(first.registrations.filter((r) => r.definition.name === 'sidebar.right.pane.tab').length, 1, 'tab body registered');
assert.equal(first.registrations.filter((r) => r.definition.name === 'sidebar.right.pane.tab.title').length, 1, 'tab title registered');
{
  assert.equal(first.shortcutRegistrations.length, 1, 'one shortcut registered');
  const shortcut = first.shortcutRegistrations[0];
  assert.equal(shortcut.id, 'accountUsage.open');
  assert.deepEqual(shortcut.defaults['desktop:macos'], { code: 'KeyU', modifiers: ['primary'] });
  assert.equal(shortcut.defaults['web:linux'], undefined, 'unsupported web:linux combination omitted');
  const resolution = shortcut.resolve({ target: null });
  assert.equal(resolution.status, 'handled', 'shortcut resolves with a session on screen');
  resolution.run();
  assert.ok(first.opened.includes('account-usage'), 'shortcut opens the panel');
  assert.equal(shortcut.label(), '打开账号用量统计', 'shortcut label is localized');
  const blockedBoot = bootClient({ noSession: true });
  const blockedResolution = blockedBoot.shortcutRegistrations[0].resolve({ target: null });
  assert.equal(blockedResolution.status, 'blocked', 'shortcut is blocked without a session');
  assert.equal(blockedResolution.reason, '请先选择会话', 'blocked shortcut explains why');
}

// ------------------------------------------------------- rightbar narrowing --
{
  const makeHandle = (left) => {
    const events = [];
    const handle = {
      parentElement: { getBoundingClientRect: () => ({ width: 1200 }) },
      style: { left },
      setPointerCapture() {},
      hasPointerCapture() { return false; },
      releasePointerCapture() {},
      getBoundingClientRect: () => ({ left: 692, top: 0, width: 8, height: 800 }),
      dispatchEvent: (event) => {
        events.push(event.type);
        return true;
      },
      events
    };
    return handle;
  };

  globalThis.PointerEvent = class {
    constructor(type, init) {
      this.type = type;
      Object.assign(this, init);
    }
  };

  // Wide panel: opening the panel must not touch the width on its own.
  const wide = makeHandle('700px');
  globalThis.document = { querySelector: (selector) => (selector === '[data-side="rightbar"]' ? wide : null) };
  const wideBoot = bootClient();
  wideBoot.shortcutRegistrations[0].resolve({ target: null }).run();
  assert.deepEqual(wide.events, [], 'opening never resizes a wide sidebar on its own');

  // Panel narrower than the readable minimum: it widens itself back.
  const tooNarrow = makeHandle('920px');
  const pane = { getBoundingClientRect: () => ({ width: 280, height: 800 }) };
  globalThis.document = {
    querySelector: (selector) => (selector === '[data-side="rightbar"]' ? tooNarrow : selector === '.aup-root' ? pane : null)
  };
  const tooNarrowBoot = bootClient();
  tooNarrowBoot.shortcutRegistrations[0].resolve({ target: null }).run();
  assert.deepEqual(tooNarrow.events, ['pointerdown', 'pointermove', 'pointerup'], 'a too-narrow panel (280px) is widened to the minimum');

  // Already readable: still no synthetic drag.
  const readable = makeHandle('860px');
  const readablePane = { getBoundingClientRect: () => ({ width: 360, height: 800 }) };
  globalThis.document = {
    querySelector: (selector) => (selector === '[data-side="rightbar"]' ? readable : selector === '.aup-root' ? readablePane : null)
  };
  const readableBoot = bootClient();
  readableBoot.shortcutRegistrations[0].resolve({ target: null }).run();
  assert.deepEqual(readable.events, [], 'a readable panel is left alone');

  delete globalThis.document;
  delete globalThis.PointerEvent;
}

// ---------------------------------------------------------------- readers --
const bodyRegistration = first.registrations.find((r) => r.definition.name === 'sidebar.right.pane.tab');
const bodyProps = bodyRegistration.definition.inject('session-1');
{
  const result = await bodyProps.readAccount(false);
  assert.equal(result.ok, true);
  assert.equal(getProfileCalls, 0, 'account reader does not fetch the profile');
  assert.equal(result.balance.status, 'ready');
  assert.equal(result.locale, 'zh');
}
{
  const now = new Date();
  const expectedMonths = 25 + now.getMonth();
  fetchCalls = 0;
  const platform = await bodyProps.readUsage('year', false, 'CNY');
  assert.equal(platform.ok, true, 'platform usage read');
  assert.equal(platform.source, 'platform');
  assert.equal(fetchCalls, expectedMonths, 'one route call per month in the window');
  const stored = JSON.parse(storage.get('dsh.account-usage.months.v1'));
  assert.equal(Object.keys(stored).length, expectedMonths, 'months persisted');
  const cached = await bodyProps.readUsage('year', false, 'CNY');
  assert.equal(cached.ok, true);
  assert.equal(fetchCalls, expectedMonths, 'second read is served from cache');
  await bodyProps.readUsage('year', true, 'CNY');
  assert.equal(fetchCalls, expectedMonths + 1, 'force refresh only re-reads the live month');
  const reloaded = bootClient();
  const reloadBody = reloaded.registrations.find((r) => r.definition.name === 'sidebar.right.pane.tab').definition.inject('session-1');
  fetchCalls = 0;
  const warm = await reloadBody.readUsage('year', false, 'CNY');
  assert.equal(warm.ok, true);
  assert.equal(fetchCalls, 0, 'reload serves the year from persisted months');
}

// ------------------------------------------------------------------ render --
function expand(node) {
  const children = node.children.length === 1 ? node.children[0] : node.children;
  return node.type(node.props === null || node.props === undefined ? { children } : { ...node.props, children });
}
function walk(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, predicate, out));
    return out;
  }
  if (typeof node.type === 'function') {
    walk(expand(node), predicate, out);
    return out;
  }
  // User-visible assertions must not count the inactive intrinsic-sizing panes.
  if (node.props?.className === 'aup-account-pane' && node.props['aria-hidden'] === true) return out;
  if (predicate(node)) out.push(node);
  walk(node.children, predicate, out);
  return out;
}
const hasClass = (node, name) => typeof (node.props && node.props.className) === 'string' && node.props.className.split(' ').includes(name);
function text(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node.type === 'function') return text(expand(node));
  if (node.type === 'style' || (node.props?.className === 'aup-account-pane' && node.props['aria-hidden'] === true)) return '';
  return text(node.children);
}
const flat = (node) => text(node).replace(/\s+/g, ' ').trim();
{
  const titleRegistration = first.registrations.find((r) => r.definition.name === 'sidebar.right.pane.tab.title');
  const titleTree = titleRegistration.component({ useTabInfo: () => ({ tab: { title: '账号用量' } }), t: (key) => first.t(key) });
  assert.equal(walk(titleTree, (n) => hasClass(n, 'aup-tab-icon')).length, 1, 'the tab chip keeps its glyph cell');
  assert.ok(source.includes('IconGaugeOutlineRegular'), 'the tab glyph is the shell quick-action gauge');
  assert.ok(source.includes('icon: GaugeGlyph'), 'the guide card uses the same gauge glyph');
  assert.equal(flat(titleTree), '用量', 'the tab chip label stays short');
}

const accountState = {
  phase: 'ready',
  refreshing: false,
  result: {
    ok: true,
    view: { status: 'credential-stored', links: {} },
    locale: 'zh',
    balance: { status: 'ready', value: [{ currency: 'CNY', balance: '542.52' }], bonusWallets: [{ currency: 'CNY', balance: '10' }] }
  }
};
const DEFAULT_SETTINGS = {
  dimension: 'day',
  autoRefresh: true,
  showCost: true,
  hideComposerStats: true,
  usageList: true,
  cards: { session: true, stats: true, account: true }
};
function render(usageState, projection, dimensionValue, settingsValue, settingsOpen, sessionModelsValue, providerBalancesValue) {
  stateQueue.push(
    accountState,
    usageState,
    sessionModelsValue || { phase: 'idle', items: [], totalTokens: 0 },
    providerBalancesValue || { phase: 'idle', items: [], error: undefined },
    settingsValue || DEFAULT_SETTINGS,
    dimensionValue || 'day',
    { count: 0, force: false },
    { count: 0, force: false },
    settingsOpen === true
  );
  const tree = bodyRegistration.component({
    t: first.t,
    useProjection: projection || (() => undefined),
    ...bodyProps
  });
  stateQueue.length = 0;
  return tree;
}
{
  const loadingTree = render({ phase: 'loading', days: [], refreshing: false, dimension: 'day' });
  const skeletonOf = (className) => {
    const group = walk(loadingTree, (n) => hasClass(n, className))[0];
    return group === undefined ? 0 : walk(group, (n) => hasClass(n, 'aup-skeleton-row')).length;
  };
  assert.equal(skeletonOf('aup-series'), 4, 'the loading frame reserves four period slots');
  assert.equal(skeletonOf('aup-srcs'), 1, 'the loading frame reserves one row for the account source');
  const loadingQuarter = render({ phase: 'loading', days: [], refreshing: false, dimension: 'quarter' }, undefined, 'quarter');
  const quarterSeries = walk(loadingQuarter, (n) => hasClass(n, 'aup-series'))[0];
  assert.equal(walk(quarterSeries, (n) => hasClass(n, 'aup-skeleton-row')).length, 4, 'quarter reserves four period slots too, like every other range');
  const readyTree = render({
    phase: 'ready',
    ok: true,
    source: 'platform',
    days: [{ date: new Date().toISOString().slice(0, 10), tokens: 5_900_000_000, cost: 542.52, count: 10 }],
    currency: 'CNY',
    dimension: 'day',
    refreshing: false
  }, () => ({ uncachedInputTokens: 5_900_000_000, outputTokens: 19_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 }));
  const titles = walk(readyTree, (n) => hasClass(n, 'aup-card-title')).map((n) => flat(n));
  assert.deepEqual(titles, ['会话消耗', '用量统计', '账户余额'], 'four-character card titles');
  const summary = walk(readyTree, (n) => hasClass(n, 'aup-stats-summary'))[0];
  assert.ok(flat(summary).includes('5.9B'), 'B unit in the summary');
  assert.ok(flat(summary).includes('542.52¥'), 'real platform amount shown, symbol trailing');
  const total = walk(readyTree, (n) => hasClass(n, 'aup-session-total-value'))[0];
  // The eight session metrics are grouped in pairs and laid out row-major:
  // volume (turns/steps, requests), efficiency (cache, avg), responsiveness
  // (speed, ttft), time split (model, tools).
  const statsTree = render(
    {
      phase: 'ready',
      ok: true,
      source: 'platform',
      days: [{ date: new Date().toISOString().slice(0, 10), tokens: 5_900_000_000, cost: 542.52, count: 10 }],
      currency: 'CNY',
      dimension: 'day',
      refreshing: false
    },
    (key) =>
      key === 'sessionStats'
        ? { turns: 151, steps: 1677, decodeTokens: 128_000, decodeMs: 1000, llmMs: 26_640_000, toolMs: 5_280_000, ttftMs: 8_600, ttftSteps: 1000 }
        : { uncachedInputTokens: 5_000_000, outputTokens: 19_000_000, cacheReadTokens: 5_000_000, cacheWriteTokens: 0 },
    undefined,
    undefined,
    undefined,
    { phase: 'ready', items: [{ provider: 'deepseek-account', model: 'deepseek-flash', tokens: 5_000_000, requests: 1665 }], totalTokens: 5_000_000 }
  );
  const statLabels = walk(statsTree, (n) => hasClass(n, 'aup-stat-label')).map(flat);
  assert.deepEqual(
    statLabels,
    ['轮/步', '请求次数', '缓存命中', '平均', '输出速度', '首 Token', '模型用时', '工具用时'],
    'session stats are grouped in semantic pairs: ' + JSON.stringify(statLabels)
  );
  assert.deepEqual(statLabels.slice(0, 2), ['轮/步', '请求次数'], 'the volume pair opens the table');
  assert.deepEqual(statLabels.slice(4, 6), ['输出速度', '首 Token'], 'speed and ttft share the responsiveness row');
  assert.deepEqual(statLabels.slice(6, 8), ['模型用时', '工具用时'], 'the two durations close the table');

  // ALL tab: the sixth range after year. Rows are years, and the total counts every
  // year the reader found even when older ones no longer fit on screen.
  storage.set('dsh.account-usage.all-start.v1', '2020-01');
  const allTree = render(
    {
      phase: 'ready',
      ok: true,
      source: 'platform',
      days: [
        { date: '2020-05-04', tokens: 1_000_000, cost: 10, count: 3 },
        { date: '2021-03-01', tokens: 2_000_000, cost: 20, count: 4 },
        { date: '2023-01-01', tokens: 500_000, cost: 5, count: 1 },
        { date: new Date().toISOString().slice(0, 10), tokens: 3_000_000, cost: 30, count: 6 }
      ],
      currency: 'CNY',
      dimension: 'all',
      refreshing: false
    },
    () => undefined,
    'all'
  );
  const dimLabels = walk(allTree, (node) => hasClass(node, 'aup-dim')).map(flat);
  assert.deepEqual(dimLabels, ['日', '周', '月', '季', '年', '全'], 'ALL closes the range row: ' + JSON.stringify(dimLabels));
  const allRows = walk(allTree, (node) => hasClass(node, 'aup-series-label')).map(flat);
  assert.equal(allRows.length, 4, 'ALL keeps four year rows: ' + JSON.stringify(allRows));
  assert.ok(allRows.includes(String(new Date().getFullYear())), 'the current year is listed');
  assert.ok(!allRows.includes('2020'), 'older years drop out of the visible rows: ' + JSON.stringify(allRows));
  const allSummary = flat(walk(allTree, (node) => hasClass(node, 'aup-stats-summary'))[0]);
  assert.ok(allSummary.includes('6.5M'), 'the ALL total still counts every year: ' + allSummary);
  assert.ok(allSummary.includes('65.00¥'), 'the ALL spend counts every year: ' + allSummary);

  // Third-party rows are billed by their subscription, not by a platform amount:
  // the amount column says SUBSCRIPTION (订阅 in Chinese) instead of a scope hint.
  const mixedStats = render(
    {
      phase: 'ready',
      ok: true,
      source: 'platform',
      days: [{ date: new Date().toISOString().slice(0, 10), tokens: 1_000_000, cost: 10, count: 5 }],
      currency: 'CNY',
      dimension: 'day',
      refreshing: false
    },
    (key) => (key === 'sessionStats' ? { turns: 5, steps: 9 } : undefined),
    'day',
    DEFAULT_SETTINGS,
    false,
    {
      phase: 'ready',
      totalTokens: 3_000_000,
      lastProvider: 'opencode-go',
      items: [
        { provider: 'opencode-go', model: 'deepseek-v4.1-flash', tokens: 2_000_000, requests: 7 },
        { provider: 'openrouter', model: 'deepseek-flash-latest', tokens: 1_000_000, requests: 3 }
      ]
    }
  );
  const sideTexts = walk(mixedStats, (node) => hasClass(node, 'aup-src-side')).map(flat);
  assert.deepEqual(sideTexts, ['套餐', '套餐'], 'every provider row carries the plan marker: ' + JSON.stringify(sideTexts));
  assert.ok(!sideTexts.includes('本会话'), 'the session-scope wording is gone from the table');
  assert.ok(source.includes("'stats.subscriptionScope': 'PLAN'"), 'the English marker stays short: PLAN');
  assert.ok(source.includes("side: t('stats.subscriptionScope')"), 'provider rows use the subscription marker');
  assert.equal(flat(total), '5.92B', 'session total uses B unit with two decimals');
  const header = walk(readyTree, (n) => hasClass(n, 'aup-head'))[0];
  const headerGroups = header.children.filter((child) => child && hasClass(child, 'aup-head-actions'));
  assert.equal(headerGroups.length, 2, 'settings on the left, refresh on the right');
  assert.ok(hasClass(headerGroups[0], 'aup-head-left'), 'settings group is the left one');
  assert.equal(headerGroups[0].children.length, 1, 'settings button');
  assert.equal(headerGroups[1].children.length, 1, 'refresh button');
  assert.ok(headerGroups[0].children[0].props['aria-haspopup'] === 'dialog', 'left action opens settings');
  assert.ok(headerGroups[1].children[0].props['aria-label'] !== undefined, 'right action refreshes');
  assert.equal(walk(header, (n) => hasClass(n, 'aup-title')).length, 0, 'panel title is not repeated in the header');
  const greeting = walk(header, (n) => hasClass(n, 'aup-head-greeting'))[0];
  assert.ok(greeting !== undefined, 'the header has a greeting slot');
  assert.ok(typeof flat(greeting) === 'string' && flat(greeting).length > 0, 'the greeting line is filled');
  assert.ok(source.includes('border-bottom:.5px solid var(--dsw-alias-border-l3)'), 'the header rule matches the conversation rule');
  assert.ok(source.includes('--aup-head-h') && source.includes('conversation.header'), 'the band height is measured from the conversation header');
  assert.ok(source.includes('DIMENSION_ROW_CAP'), 'period rows are capped per dimension');
  assert.ok(!/new ResizeObserver\([^)]*\n?[^)]*setHiddenRows/s.test(source), 'row trimming never feeds back from a resize observer');
  // Unit-compacted token counts stop at two decimal places (78.77M, not 78.770161M).
  const preciseTree = render(
    {
      phase: 'ready',
      ok: true,
      source: 'platform',
      days: [{ date: new Date().toISOString().slice(0, 10), tokens: 78_770_161, cost: 3.808647, count: 446 }],
      currency: 'CNY',
      dimension: 'day',
      refreshing: false
    },
    () => ({ uncachedInputTokens: 78_770_161, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
  );
  const preciseSummary = walk(preciseTree, (n) => hasClass(n, 'aup-stats-summary'))[0];
  assert.ok(flat(preciseSummary).includes('78.77M'), 'stats token total keeps at most two decimals: ' + flat(preciseSummary));
  const preciseRow = walk(preciseTree, (n) => hasClass(n, 'aup-series-tokens')).map(flat).find((value) => value.includes('M'));
  const dayLabels = walk(preciseTree, (node) => hasClass(node, 'aup-series-label')).map(flat);
  assert.ok(dayLabels.length > 0 && dayLabels.every((label) => /^\d{4}-\d{2}-\d{2}$/u.test(label)), 'day rows show YYYY-MM-DD: ' + JSON.stringify(dayLabels));
  assert.equal(preciseRow, '78.77M', 'per-period token value keeps at most two decimals');
  const preciseCost = walk(preciseTree, (n) => hasClass(n, 'aup-series-cost')).map(flat).find((value) => value !== '');
  assert.equal(preciseCost, '3.80¥', 'spend keeps the two-decimal platform style, symbol trailing');
  // Currency is a bare symbol placed AFTER the amount (23.28¥), never a code prefix.
  assert.ok(source.includes("currencyDisplay: 'narrowSymbol'"), 'amounts use the narrow currency symbol');
  const plainCost = walk(preciseTree, (node) => hasClass(node, 'aup-series-cost')).map(flat).find((value) => value !== '');
  assert.ok(plainCost !== undefined && plainCost.endsWith('¥'), 'the spend row ends with the ¥ symbol: ' + String(plainCost));
  assert.ok(!/CN¥|CNY/u.test(plainCost), 'no currency code survives in the amount: ' + String(plainCost));
  // Every currency keeps its symbol after the figure (user 2026-11-08).
  assert.ok(source.includes('return body + currencySymbol(currency, locale)'), 'every currency keeps its symbol after the amount');
  assert.ok(!source.includes('return formatter.format(amount)'), 'no currency keeps the prefix form');

  const fallbackTree = render({
    phase: 'ready',
    ok: true,
    source: 'local',
    days: [{ date: new Date().toISOString().slice(0, 10), tokens: 2000, cost: 0.0046, count: 2 }],
    currency: 'CNY',
    reason: 'auth_failed',
    dimension: 'day',
    refreshing: false
  }, () => undefined);
  assert.equal(walk(fallbackTree, (n) => hasClass(n, 'aup-badge')).length, 1, 'local estimate badge');
}

// ------------------------------------------------------------ model stats --
{
  const events = [
    { type: 'assistant/message', data: { turn: 1, step: 1, message: { source: { provider: 'deepseek', model: 'deepseek-chat' } }, usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 5, cacheWriteTokens: 1 } } },
    { type: 'assistant/message', data: { turn: 2, step: 2, message: { source: { provider: 'deepseek', model: 'deepseek-chat' } }, usage: { inputTokens: 50, outputTokens: 10 } } },
    { type: 'assistant/message', data: { turn: 2, step: 2, message: { source: { provider: 'deepseek', model: 'deepseek-reasoner' } }, usage: { inputTokens: 70, outputTokens: 30 } } }
  ];
  const rows = foldSessionModels(events);
  assert.deepEqual(rows.map((row) => [row.model, row.tokens]), [['deepseek-chat', 126], ['deepseek-reasoner', 100]], 'per-model fold replaces the same attempt and attributes the route');

  stateQueue.push(
    accountState,
    { phase: 'ready', ok: true, source: 'platform', days: [], currency: 'CNY', dimension: 'day', refreshing: false },
    { phase: 'ready', items: [{ provider: 'deepseek-account', model: 'deepseek-chat', tokens: 5000, requests: 2 }, { provider: 'deepseek-account', model: 'deepseek-reasoner', tokens: 3000, requests: 1 }], totalTokens: 8000 },
    { phase: 'idle', items: [], error: undefined },
    DEFAULT_SETTINGS,
    'day',
    { count: 0, force: false },
    { count: 0, force: false },
    false
  );
  const tree = bodyRegistration.component({ t: first.t, useProjection: () => undefined, ...bodyProps });
  stateQueue.length = 0;
  assert.equal(walk(tree, (node) => hasClass(node, 'aup-models-caption')).length, 0, 'no redundant 按模型 caption');
  const modelNames = walk(tree, (node) => hasClass(node, 'aup-model-name')).map(flat);
  assert.ok(modelNames[0] === 'DeepSeek API-deepseek-chat', 'provider and model share one line without spaces around the dash: ' + modelNames[0]);
  const modelTokens = walk(tree, (node) => hasClass(node, 'aup-model-tokens')).map(flat);
  assert.deepEqual(modelNames, ['DeepSeek API-deepseek-chat', 'DeepSeek API-deepseek-reasoner'], 'model rows merge provider and model without separator spaces');
  assert.deepEqual(modelTokens, ['5K', '3K'], 'model rows show compact token totals');
}

// ------------------------------------------------------- third-party provider --
{
  stateQueue.push(
    accountState,
    { phase: 'ready', ok: true, source: 'platform', days: [], currency: 'CNY', dimension: 'day', refreshing: false },
    { phase: 'ready', items: [{ provider: 'openrouter', model: 'deepseek-flash', tokens: 5000, requests: 2 }], totalTokens: 5000 },
    { phase: 'idle', items: [], error: undefined },
    DEFAULT_SETTINGS,
    'day',
    { count: 0, force: false },
    { count: 0, force: false },
    false
  );
  const tree = bodyRegistration.component({ t: first.t, useProjection: () => undefined, ...bodyProps });
  stateQueue.length = 0;
  const accountCard = walk(tree, (node) => node.type === 'section' && hasClass(node, 'aup-card-account'))[0];
  const accountText = flat(accountCard);
  assert.ok(!accountText.includes('542.52'), 'DeepSeek balance is hidden for an off-account session');
  assert.ok(accountText.includes('OpenRouter'), 'balance card names the provider');
  const offAccountStats = walk(tree, (node) => node.type === 'section' && hasClass(node, 'aup-card-stats'))[0];
  assert.ok(offAccountStats !== undefined, 'the 用量统计 card always exists');
  assert.equal(walk(offAccountStats, (node) => hasClass(node, 'aup-dim')).length, 0, 'period switch only appears when platform data exists');
  assert.ok(walk(offAccountStats, (node) => hasClass(node, 'aup-src')).length > 0, 'same source-row layout as a mixed session');
  assert.ok(flat(offAccountStats).includes('OpenRouter'), 'off-account stats list the session sources');
  const modelName = walk(tree, (node) => hasClass(node, 'aup-model-name')).map(flat)[0];
  assert.equal(modelName, 'OpenRouter-deepseek-flash', 'model row merges provider and model name without separator spaces');
  assert.equal(walk(tree, (node) => hasClass(node, 'aup-models-provider')).length, 0, 'provider caption rows are gone');

  // Provider balance mode renders the provider amounts instead of the DeepSeek wallet.
  stateQueue.push(
    accountState,
    { phase: 'ready', ok: true, source: 'platform', days: [], currency: 'CNY', dimension: 'day', refreshing: false },
    { phase: 'ready', items: [{ provider: 'openrouter', model: 'deepseek-flash', tokens: 5000, requests: 2 }], totalTokens: 5000 },
    { phase: 'ready', items: [{ provider: 'openrouter', kind: 'openrouter', currency: 'USD', remaining: 42.5, used: 7.5 }], error: undefined },
    DEFAULT_SETTINGS,
    'day',
    { count: 0, force: false },
    { count: 0, force: false },
    false
  );
  const providerTree = bodyRegistration.component({ t: first.t, useProjection: () => undefined, ...bodyProps });
  stateQueue.length = 0;
  const providerCard = walk(providerTree, (node) => node.type === 'section' && hasClass(node, 'aup-card-account'))[0];
  const providerText = flat(providerCard);
  assert.ok(providerText.includes('42.50'), 'provider remaining balance');
  assert.ok(!providerText.includes('7.50'), 'no spend (Used) in the balance card');
  assert.ok(!providerText.includes('542.52'), 'DeepSeek wallet never renders in provider mode');
  assert.equal(walk(providerTree, (node) => node.type === 'section' && hasClass(node, 'aup-card-stats')).length, 1, 'the 用量统计 card always exists');
  assert.equal(walk(providerTree, (node) => node.type === 'section' && hasClass(node, 'aup-card-session')).length, 1, 'session card still renders');

  // Providers without a balance API (for example OpenCode Go) fall back to the
  // session totals instead of showing a dead retry button.
  stateQueue.push(
    accountState,
    { phase: 'ready', ok: true, source: 'platform', days: [], currency: 'CNY', dimension: 'day', refreshing: false },
    { phase: 'ready', items: [{ provider: 'opencode-go', model: 'deepseek-v4.1-flash', tokens: 7_500_000, requests: 1234 }], totalTokens: 7_500_000 },
    { phase: 'ready', byProvider: { 'opencode-go': { phase: 'error', code: 'unsupported_provider' } } },
    DEFAULT_SETTINGS,
    'day',
    { count: 0, force: false },
    { count: 0, force: false },
    false
  );
  const unsupportedTree = bodyRegistration.component({ t: first.t, useProjection: () => undefined, ...bodyProps });
  stateQueue.length = 0;
  const unsupportedCard = walk(unsupportedTree, (node) => node.type === 'section' && hasClass(node, 'aup-card-account'))[0];
  const unsupportedText = flat(unsupportedCard);
  assert.ok(unsupportedText.includes('OpenCode Go'), 'unknown providers get a readable label: ' + unsupportedText);
  assert.ok(unsupportedText.includes('插件暂不支持'), 'unsupported provider row states plugin support, not a vendor claim');
  assert.ok(!unsupportedText.includes('7.5M'), 'session tokens live in the statistics card, not repeated in the balance row');
  assert.ok(flat(walk(unsupportedTree, (node) => node.type === 'section' && hasClass(node, 'aup-card-stats'))[0]).includes('7.5M'), 'the statistics card carries this source session usage');
  assert.equal(walk(unsupportedCard, (node) => hasClass(node, 'aup-retry')).length, 0, 'no dead retry for a provider without a balance API');

  // opencode reports plan usage percentages instead of a money balance.
  stateQueue.push(
    accountState,
    { phase: 'ready', ok: true, source: 'platform', days: [], currency: 'CNY', dimension: 'day', refreshing: false },
    { phase: 'ready', items: [{ provider: 'opencode-go', model: 'deepseek-v4.1-flash', tokens: 5_000_000, requests: 500 }], totalTokens: 5_000_000 },
    { phase: 'ready', items: [{ provider: 'opencode-go', kind: 'opencode-plan', windows: [{ id: 'rolling', usedPercent: 1 }, { id: 'weekly', usedPercent: 12 }, { id: 'monthly', usedPercent: 35 }] }], error: undefined },
    DEFAULT_SETTINGS,
    'day',
    { count: 0, force: false },
    { count: 0, force: false },
    false
  );
  const planTree = bodyRegistration.component({ t: first.t, useProjection: () => undefined, ...bodyProps });
  stateQueue.length = 0;
  const planCard = walk(planTree, (node) => node.type === 'section' && hasClass(node, 'aup-card-account'))[0];
  const planText = flat(planCard);
  // Plan format (user 2026-11-08): `5HW 63%  WEK 70%  MON 85%`, every figure is the share left.
  assert.ok(planText.includes('5HW 99% WEK 88% MON 65%'), 'plan windows read 5HW / WEK / MON as the share left: ' + planText);
  assert.ok(!/剩余|已用|left|used/.test(planText.replace('账户余额', '')), 'plan figures carry no left/used wording: ' + planText);

  // Command Code publishes the same 5-hour / weekly plan windows as a share and the
  // credits left beside them; the row reuses the plan format and appends one pair.
  stateQueue.push(
    accountState,
    { phase: 'ready', ok: true, source: 'platform', days: [], currency: 'CNY', dimension: 'day', refreshing: false },
    { phase: 'ready', items: [{ provider: 'commandcode', model: 'deepseek/deepseek-v4.1-flash-fast', tokens: 4_500_000, requests: 400 }], totalTokens: 4_500_000 },
    { phase: 'ready', items: [{
      provider: 'commandcode',
      kind: 'commandcode-plan',
      currency: 'USD',
      windows: [{ id: 'fiveHour', usedPercent: 100, status: 'exceeded' }, { id: 'weekly', usedPercent: 50.04 }],
      credits: { monthly: 6.9983883725, purchased: 0, free: 0 }
    }], error: undefined },
    DEFAULT_SETTINGS,
    'day',
    { count: 0, force: false },
    { count: 0, force: false },
    false
  );
  const commandCodeTree = bodyRegistration.component({ t: first.t, useProjection: () => undefined, ...bodyProps });
  stateQueue.length = 0;
  const commandCodeCard = walk(commandCodeTree, (node) => node.type === 'section' && hasClass(node, 'aup-card-account'))[0];
  const commandCodeText = flat(commandCodeCard);
  // Share left in fixed order, then the credits left - never "used" or a spend figure.
  assert.ok(commandCodeText.includes('Command Code'), 'the Command Code source keeps its own display name: ' + commandCodeText);
  assert.ok(commandCodeText.includes('5HW 0% WEK 50%'), 'Command Code windows read the share left: ' + commandCodeText);
  assert.ok(commandCodeText.includes('CRED 6.99$') || commandCodeText.includes('额度 6.99$'), 'Command Code credits read the amount left with the symbol last: ' + commandCodeText);
  const commandCodeStats = flat(walk(commandCodeTree, (node) => node.type === 'section' && hasClass(node, 'aup-card-stats'))[0]);
  assert.ok(commandCodeStats.includes('Command Code') && commandCodeStats.includes('4.5M'), 'the statistics card names the Command Code source: ' + commandCodeStats);

  // Mixed sessions split the platform statistics by source instead of one flat total.
  stateQueue.push(
    accountState,
    { phase: 'ready', ok: true, source: 'platform', days: [{ date: '2026-11-07', tokens: 1_000_000, cost: 1.5, count: 10 }], currency: 'CNY', dimension: 'day', refreshing: false },
    { phase: 'ready', items: [{ provider: 'deepseek-account', model: 'deepseek-chat', tokens: 1_000_000, requests: 10 }, { provider: 'opencode-go', model: 'deepseek-v4.1-flash', tokens: 2_500_000, requests: 250 }], totalTokens: 3_500_000 },
    { phase: 'ready', byProvider: { 'opencode-go': { phase: 'error', code: 'unsupported_provider' } } },
    DEFAULT_SETTINGS,
    'day',
    { count: 0, force: false },
    { count: 0, force: false },
    false
  );
  const mixedTree = bodyRegistration.component({ t: first.t, useProjection: () => undefined, ...bodyProps });
  stateQueue.length = 0;
  const sourceRows = walk(mixedTree, (node) => hasClass(node, 'aup-src')).map(flat);
  assert.equal(sourceRows.length, 2, 'one row per source in a mixed session: ' + JSON.stringify(sourceRows));
  assert.ok(sourceRows[0].includes('DeepSeek API'), 'platform row first');
  assert.ok(sourceRows[1].includes('OpenCode Go'), 'third-party row second');
  assert.ok(sourceRows[1].includes('2.5M'), 'third-party row shows its session tokens');
  // Long stat values shrink a step so they never overlap the neighbouring column.
  stateQueue.push(
    accountState,
    { phase: 'ready', ok: true, source: 'platform', days: [{ date: '2026-11-07', tokens: 1_000_000, cost: 1.5, count: 10 }], currency: 'CNY', dimension: 'day', refreshing: false },
    { phase: 'ready', items: [{ provider: 'deepseek-account', model: 'deepseek-chat', tokens: 1_000_000, requests: 1149 }], totalTokens: 1_000_000 },
    { phase: 'idle', items: [], error: undefined },
    DEFAULT_SETTINGS,
    'day',
    { count: 0, force: false },
    { count: 0, force: false },
    false
  );
  const wideProjection = (key) => (key === 'sessionStats' ? { turns: 106, steps: 11550, decodeTokens: 900000, decodeMs: 5000, llmMs: 9180000, toolMs: 2476000, ttftMs: 2300, ttftSteps: 1 } : undefined);
  const wideTree = bodyRegistration.component({ t: first.t, useProjection: wideProjection, ...bodyProps });
  stateQueue.length = 0;
  const wideValues = walk(wideTree, (node) => hasClass(node, 'aup-stat-value')).map((node) => ({ text: flat(node), shrunk: hasClass(node, 'aup-stat-value-s') || hasClass(node, 'aup-stat-value-xs') }));
  const turnsCell = wideValues.find((cell) => cell.text.includes('/'));
  assert.ok(turnsCell !== undefined, 'turns / steps cell renders');
  assert.equal(turnsCell.shrunk, true, 'long stat value shrinks instead of overlapping: ' + turnsCell.text);

  // The default usage view is a compact trend: no per-period text rows, only bars.
  stateQueue.push(
    accountState,
    { phase: 'ready', ok: true, source: 'platform', days: [{ date: '2026-11-07', tokens: 1_000_000, cost: 1.5, count: 10 }], currency: 'CNY', dimension: 'day', refreshing: false },
    { phase: 'ready', items: [{ provider: 'deepseek-account', model: 'deepseek-chat', tokens: 1_000_000, requests: 10 }], totalTokens: 1_000_000 },
    { phase: 'idle', items: [], error: undefined },
    { ...DEFAULT_SETTINGS, usageList: false },
    'day',
    { count: 0, force: false },
    { count: 0, force: false },
    false
  );
  const trendTree = bodyRegistration.component({ t: first.t, useProjection: () => undefined, ...bodyProps });
  stateQueue.length = 0;
  assert.ok(walk(trendTree, (node) => hasClass(node, 'aup-src')).length === 1, 'one source row per session source');
  assert.equal(walk(trendTree, (node) => /track|fill/.test(String(node.props && node.props.className))).length, 0, 'statistics rows carry numbers only, no share bar');
  assert.equal(walk(trendTree, (node) => hasClass(node, 'aup-series-row') && !hasClass(node, 'aup-skeleton-row')).length, 0, 'no per-period rows unless the list is enabled');

  const mixedAccount = walk(mixedTree, (node) => node.type === 'section' && hasClass(node, 'aup-card-account'))[0];
  assert.equal(walk(mixedAccount, (node) => hasClass(node, 'aup-account-note')).length, 0, 'no bottom note line on the account card');
  const mixedStats = walk(mixedTree, (node) => node.type === 'section' && hasClass(node, 'aup-card-stats'))[0];
  assert.equal(walk(mixedStats, (node) => hasClass(node, 'aup-badge') && flat(node).includes('DeepSeek API')).length, 0, 'no misleading platform badge once the card holds several sources');

  // Mixed sessions also read the third-party balance and show it next to the DeepSeek wallet.
  stateQueue.push(
    accountState,
    { phase: 'ready', ok: true, source: 'platform', days: [{ date: '2026-11-07', tokens: 1_000_000, cost: 1.5, count: 10 }], currency: 'CNY', dimension: 'day', refreshing: false },
    { phase: 'ready', items: [{ provider: 'deepseek-account', model: 'deepseek-chat', tokens: 1_000_000, requests: 10 }, { provider: 'openrouter', model: 'deepseek-flash', tokens: 2_500_000, requests: 250 }], totalTokens: 3_500_000 },
    { phase: 'ready', items: [{ provider: 'openrouter', kind: 'openrouter', currency: 'USD', remaining: 11.04, used: 8.96 }], error: undefined },
    DEFAULT_SETTINGS,
    'day',
    { count: 0, force: false },
    { count: 0, force: false },
    false
  );
  const mixedWalletTree = bodyRegistration.component({ t: first.t, useProjection: () => undefined, ...bodyProps });
  stateQueue.length = 0;
  const mixedWallet = walk(mixedWalletTree, (node) => node.type === 'section' && hasClass(node, 'aup-card-account'))[0];
  const mixedWalletText = flat(mixedWallet);
  assert.ok(mixedWalletText.includes('542.52'), 'DeepSeek wallet still renders in a mixed session');
  const balanceRows = walk(mixedWallet, (node) => hasClass(node, 'aup-acct-src')).map((node) => flat(walk(node, (n) => hasClass(n, 'aup-acct-src-label'))[0]));
  assert.deepEqual(balanceRows, ['DeepSeek API', 'OpenRouter'], 'one aligned row per source: ' + JSON.stringify(balanceRows));
  assert.ok(mixedWalletText.includes('11.04$') && !mixedWalletText.includes('8.96$') && !mixedWalletText.includes('已用'), 'the balance card shows what is left, never costs: ' + mixedWalletText);
  // DeepSeek API format (user 2026-11-08): name left, `余额 542.52¥ 赠送 10.00¥` right.
  const deepseekRow = walk(mixedWallet, (node) => hasClass(node, 'aup-acct-src'))[0];
  assert.equal(flat(walk(deepseekRow, (node) => hasClass(node, 'aup-acct-src-value'))[0]), '余额 542.52¥ 赠送 10.00¥', 'DeepSeek reads Balance x Bonus y on the right: ' + flat(deepseekRow));
  for (const row of walk(mixedWallet, (node) => hasClass(node, 'aup-acct-src'))) {
    assert.equal(row.children.length, 2, 'every source row has exactly two cells');
  }
  assert.equal(walk(mixedWallet, (node) => node.props && node.props.role === 'tab').length, 0, 'no tabs to switch');
  assert.equal(walk(mixedWallet, (node) => hasClass(node, 'aup-badge')).length, 0, 'no partial badge in the source table');
  // The account card opens on the provider the session is currently using.
  stateQueue.push(
    accountState,
    { phase: 'ready', ok: true, source: 'platform', days: [], currency: 'CNY', dimension: 'day', refreshing: false },
    { phase: 'ready', lastProvider: 'opencode-go', items: [
      { provider: 'deepseek-account', model: 'deepseek-chat', tokens: 1_000_000, requests: 10 },
      { provider: 'opencode-go', model: 'deepseek-v4.1-flash', tokens: 2_000_000, requests: 20 }
    ], totalTokens: 3_000_000 },
    { phase: 'ready', items: [{ provider: 'opencode-go', kind: 'opencode-plan', windows: [{ id: 'rolling', usedPercent: 1 }, { id: 'weekly', usedPercent: 2 }, { id: 'monthly', usedPercent: 3 }] }], error: undefined },
    DEFAULT_SETTINGS,
    'day',
    { count: 0, force: false },
    { count: 0, force: false },
    false
  );
  const autoTree = bodyRegistration.component({ t: first.t, useProjection: () => undefined, ...bodyProps });
  stateQueue.length = 0;
  const autoCard = walk(autoTree, (node) => node.type === 'section' && hasClass(node, 'aup-card-account'))[0];
  // The account in use gets a quiet highlight (user 2026-11-08): exactly one row,
  // matched by the newest assistant message's provider, drawn as a background tint
  // so no column edge moves; the old decorative dot stays gone.
  const currentRows = walk(autoCard, (node) => hasClass(node, 'aup-acct-src') && node.props['data-current'] === true);
  assert.equal(currentRows.length, 1, 'exactly one account row is highlighted');
  assert.equal(flat(walk(currentRows[0], (node) => hasClass(node, 'aup-acct-src-label'))[0]), 'OpenCode Go', 'the row in use is the highlighted one');
  assert.equal(currentRows[0].props['aria-current'], 'true', 'the highlight is exposed to assistive tech');
  assert.ok(source.includes('.aup-acct-src[data-current]{background:color-mix('), 'the highlight is a background tint, not a pill');
  assert.ok(!source.includes('data-current] .aup-acct-src-label::after'), 'no dot decoration');
  assert.ok(flat(autoCard).includes('5HW 99% WEK 98% MON 97%') && flat(autoCard).includes('542.52'), 'plan and wallet render side by side: ' + flat(autoCard));

  // Card titles stay clean: the provider name lives in the tab row, never next to the title.
  for (const node of walk(mixedWalletTree, (n) => n.type === 'section' && hasClass(n, 'aup-card'))) {
    const head = walk(node, (n) => hasClass(n, 'aup-card-head'))[0];
    if (head === undefined) continue;
    assert.equal(walk(head, (n) => hasClass(n, 'aup-badge')).length, 0, 'no provider badge inside a card head');
  }
  for (const node of walk(mixedWalletTree, (n) => n.type === 'section' && hasClass(n, 'aup-card'))) {
    const head = walk(node, (n) => hasClass(n, 'aup-card-head'))[0];
    if (head === undefined) continue;
    assert.ok(!/OpenCode|OpenRouter|Anthropic|OpenAI|DeepSeek/.test(flat(head)), 'no provider name inside a card head: ' + flat(head));
  }
  assert.equal(walk(mixedWallet, (node) => hasClass(node, 'aup-account-body')).length, 1, 'one balance body');
  assert.ok(source.includes('row && row.provider === source.id'), 'provider fallback only uses selected source totals');
  assert.ok(!source.includes('const code = providerBalances.error'), 'errors are never shared between providers');
  assert.ok(source.includes('data: { ...result, provider }'), 'requested source identity overrides provider aliases');
  assert.ok(source.includes("'account.status.unsupported': 'Unsupported'"), 'the English unsupported status stays one short word');
  assert.ok(source.includes('const busy = offAccountAll !== true && platformBusy'), 'canceled platform requests cannot lock provider refresh');
  assert.ok(!mixedWalletText.includes('部分'), 'no 部分 prefix anywhere');
}

// --------------------------------------------------------------- english --
{
  const enDict = first.dictionary.accountUsage.en;
  const enT = (key, params) => {
    let text = enDict[key];
    if (text === undefined) return key;
    if (params) text = text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
    return text;
  };
  stateQueue.push(
    accountState,
    { phase: 'ready', ok: true, source: 'platform', days: [], currency: 'CNY', dimension: 'day', refreshing: false },
    { phase: 'ready', items: [{ provider: 'deepseek-account', model: 'deepseek-chat', tokens: 5000, requests: 2 }], totalTokens: 5000 },
    { phase: 'idle', items: [], error: undefined },
    DEFAULT_SETTINGS,
    'day',
    { count: 0, force: false },
    { count: 0, force: false },
    false
  );
  const tree = bodyRegistration.component({
    ...bodyProps,
    t: enT,
    bindTranslation: () => enT,
    readLocale: () => 'en',
    useProjection: () => undefined
  });
  stateQueue.length = 0;
  const titles = walk(tree, (n) => hasClass(n, 'aup-card-title')).map((n) => flat(n));
  assert.deepEqual(titles, ['Session usage', 'Usage statistics', 'Account balance'], 'non-Chinese locales render English titles');
  assert.ok(walk(tree, (node) => hasClass(node, 'aup-model-name')).map(flat).some((text) => text.startsWith('DeepSeek API-')), 'provider names localize to English');
}

// --------------------------------------------------------------- settings --
function walkRoles(node, role, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => walkRoles(child, role, out));
    return out;
  }
  if (typeof node.type === 'function') {
    walkRoles(expand(node), role, out);
    return out;
  }
  if (node.props && node.props.role === role) out.push(node);
  walkRoles(node.children, role, out);
  return out;
}
{
  // Closed by default: no dialog, gear exposes aria-expanded=false.
  const closed = render({ phase: 'loading', days: [], refreshing: false, dimension: 'day' });
  assert.equal(walkRoles(closed, 'dialog').length, 0, 'settings stay closed by default');
  const gear = walk(closed, (node) => node.type === 'button' && node.props['aria-haspopup'] === 'dialog')[0];
  assert.ok(gear, 'header exposes a settings trigger');
  assert.equal(gear.props['aria-expanded'], false);

  // Open: default range, visible cards, spend, auto refresh and a reset action.
  const open = render(
    { phase: 'ready', ok: true, source: 'platform', days: [], currency: 'CNY', dimension: 'day', refreshing: false },
    () => undefined,
    'day',
    DEFAULT_SETTINGS,
    true
  );
  const dialog = walkRoles(open, 'dialog')[0];
  assert.ok(dialog, 'settings dialog opens');
  assert.equal(walkRoles(dialog, 'switch').length, 7, 'three card switches + spend + auto refresh + hide composer stats + usage detail list');
  const miniTabs = walk(dialog, (node) => node.props && String(node.props.className || '').includes('aup-dims-mini'))[0];
  assert.equal(walk(miniTabs, (node) => node.type === 'button').length, 6, 'six range options including ALL');
  assert.ok(walk(dialog, (node) => node.props && node.props.className === 'aup-pop-link').length === 1, 'reset action present');
  assert.equal(flat(walk(dialog, (node) => node.props && node.props.className === 'aup-pop-title')[0]), '设置', 'settings title is short');
  assert.ok(walk(dialog, (node) => node.type === 'button' && node.props['aria-label'] === '关闭').length === 1, 'settings can be closed from the header');
  assert.equal(flat(walk(dialog, (node) => node.props && node.props.className === 'aup-pop-hint')[0]), '用量 2 分钟 · 余额 5 分钟', 'footer hint is one short line');

  // Hidden cards + spend off.
  const hiddenSettings = { ...DEFAULT_SETTINGS, showCost: false, cards: { session: false, stats: true, account: false } };
  const hidden = render(
    { phase: 'ready', ok: true, source: 'platform', days: [{ date: new Date().toISOString().slice(0, 10), tokens: 1000, cost: 0.5, count: 1 }], currency: 'CNY', dimension: 'day', refreshing: false },
    () => undefined,
    'day',
    hiddenSettings
  );
  assert.equal(walk(hidden, (node) => node.type === 'section' && String(node.props.className).includes('aup-card-session')).length, 0, 'session card hidden by settings');
  assert.equal(walk(hidden, (node) => node.type === 'section' && String(node.props.className).includes('aup-card-account')).length, 0, 'account card hidden by settings');
  const hiddenTotals = walk(hidden, (node) => node.props && node.props.className === 'aup-stats-total').map(flat).filter((value) => value !== '');
  assert.equal(hiddenTotals.length, 0, 'spend hidden when the option is off');
  assert.equal(walk(hidden, (node) => node.props && node.props.className === 'aup-series-cost').map(flat).filter((value) => value !== '').length, 0, 'per-row spend hidden');

  // All cards hidden -> empty hint, settings still reachable.
  const empty = render({ phase: 'loading', days: [], refreshing: false, dimension: 'day' }, () => undefined, 'day', {
    ...DEFAULT_SETTINGS,
    cards: { session: false, stats: false, account: false }
  });
  assert.equal(walk(empty, (node) => node.props && node.props.className === 'aup-empty').length, 1, 'empty hint when every card is hidden');
  assert.ok(walk(empty, (node) => node.type === 'button' && node.props['aria-haspopup'] === 'dialog').length === 1, 'settings reachable while empty');

  // Persisted preferences are read on mount (initializers, no queued settings value).
  storage.set('dsh.account-usage.settings.v1', JSON.stringify({
    dimension: 'week',
    autoRefresh: false,
    showCost: false,
    cards: { session: false, stats: true, account: true }
  }));
  stateQueue.push(accountState, {
    phase: 'loading',
    days: [],
    refreshing: false,
    dimension: 'week'
  });
  const restored = bodyRegistration.component({ t: first.t, useProjection: () => undefined, ...bodyProps });
  stateQueue.length = 0;
  assert.equal(walk(restored, (node) => node.type === 'section' && String(node.props.className).includes('aup-card-session')).length, 0, 'stored card visibility applied');
  const weekTab = walk(restored, (node) => node.type === 'button' && node.props['aria-selected'] === true);
  assert.ok(weekTab.length === 1 && flat(weekTab[0]).includes('周'), 'stored default range is applied');
  storage.delete('dsh.account-usage.settings.v1');
}

console.log('account-usage smoke test passed');
