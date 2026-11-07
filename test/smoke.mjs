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

// ------------------------------------------------------------- client boot --
const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
assert.equal((source.match(/text-overflow:ellipsis/g) || []).length, 0, 'card text never uses ellipsis');

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

  // Wide panel: the shortcut drives the host's own handle to the minimum width.
  const wide = makeHandle('700px');
  globalThis.document = { querySelector: (selector) => (selector === '[data-side="rightbar"]' ? wide : null) };
  const wideBoot = bootClient();
  const wideRun = wideBoot.shortcutRegistrations[0].resolve({ target: null });
  wideRun.run();
  assert.deepEqual(wide.events, ['pointerdown', 'pointermove', 'pointerup'], 'shortcut narrows a wide right sidebar');

  // Already narrow: no synthetic drag happens.
  const narrow = makeHandle('900px');
  globalThis.document = { querySelector: () => narrow };
  const narrowBoot = bootClient();
  narrowBoot.shortcutRegistrations[0].resolve({ target: null }).run();
  assert.deepEqual(narrow.events, [], 'no drag when the sidebar is already at the minimum');

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
  if (node.type === 'style') return '';
  return text(node.children);
}
const flat = (node) => text(node).replace(/\s+/g, ' ').trim();

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
  assert.equal(walk(loadingTree, (n) => hasClass(n, 'aup-skeleton-row')).length, 7, 'skeleton rows while loading');
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
  assert.ok(flat(summary).includes('¥542.52'), 'real platform amount shown');
  const total = walk(readyTree, (n) => hasClass(n, 'aup-session-total-value'))[0];
  assert.equal(flat(total), '5.92B', 'session total uses B unit with two decimals');
  const header = walk(readyTree, (n) => hasClass(n, 'aup-head'))[0];
  const headerActions = header.children.find((child) => child && hasClass(child, 'aup-head-actions'));
  assert.ok(headerActions, 'header groups its actions on the right');
  assert.equal(headerActions.children.length, 2, 'settings gear + refresh button');
  assert.ok(headerActions.children[0].props['aria-haspopup'] === 'dialog', 'first action opens settings');
  assert.ok(headerActions.children[1].props['aria-label'] !== undefined, 'second action refreshes');
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
  assert.equal(preciseRow, '78.77M', 'per-period token value keeps at most two decimals');
  const preciseCost = walk(preciseTree, (n) => hasClass(n, 'aup-series-cost'))[0];
  assert.equal(flat(preciseCost), '¥3.80', 'spend keeps the two-decimal platform style');

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
  assert.equal(flat(walk(tree, (node) => hasClass(node, 'aup-models-caption'))[0]), '按模型', 'model block caption');
  const modelNames = walk(tree, (node) => hasClass(node, 'aup-model-name')).map(flat);
  const modelTokens = walk(tree, (node) => hasClass(node, 'aup-model-tokens')).map(flat);
  assert.deepEqual(modelNames, ['deepseek-chat', 'deepseek-reasoner'], 'model rows show names');
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
  assert.equal(walk(tree, (node) => node.type === 'section' && hasClass(node, 'aup-card-stats')).length, 0, 'DeepSeek platform stats are hidden for an off-account session');
  const modelName = walk(tree, (node) => hasClass(node, 'aup-model-name')).map(flat)[0];
  assert.equal(modelName, 'deepseek-flash', 'model rows keep the full model name');
  assert.equal(flat(walk(tree, (node) => hasClass(node, 'aup-models-provider'))[0]), 'OpenRouter', 'model caption names the provider');

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
  assert.ok(providerText.includes('7.50'), 'provider used amount');
  assert.ok(!providerText.includes('542.52'), 'DeepSeek wallet never renders in provider mode');
  assert.equal(walk(providerTree, (node) => node.type === 'section' && hasClass(node, 'aup-card-stats')).length, 0, 'platform stats stay hidden in provider mode');
  assert.equal(walk(providerTree, (node) => node.type === 'section' && hasClass(node, 'aup-card-session')).length, 1, 'session card still renders');
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
  assert.equal(flat(walk(tree, (node) => hasClass(node, 'aup-models-provider'))[0]), 'DeepSeek account', 'provider names localize to English');
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
  assert.equal(walkRoles(dialog, 'switch').length, 6, 'three card switches + spend + auto refresh + hide composer stats');
  const miniTabs = walk(dialog, (node) => node.props && String(node.props.className || '').includes('aup-dims-mini'))[0];
  assert.equal(walk(miniTabs, (node) => node.type === 'button').length, 5, 'five range options');
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
  assert.equal(walk(hidden, (node) => node.props && node.props.className === 'aup-stats-total').length, 0, 'spend hidden when the option is off');
  assert.equal(walk(hidden, (node) => node.props && node.props.className === 'aup-series-cost').length, 0, 'per-row spend hidden');

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
