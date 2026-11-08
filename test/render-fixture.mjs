/**
 * Real-markup fixture for the browser layout check.
 *
 * The layout check used to measure a hand-written imitation of the panel, which
 * drifted from production and hid real overflows. This module boots the real
 * client half with the same stubs the smoke test uses, renders the panel body from
 * real state, and serialises the element tree to HTML — so the browser measures
 * exactly what production renders.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8');

const assert = {
  ok() {},
  equal() {},
  notEqual() {},
  deepEqual() {},
  match() {}
};

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key)
};

let fixtureLocale = 'zh';
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
          let text = (dictionaries[namespace] || {})[fixtureLocale]?.[key];
          if (text === undefined) return key;
          if (params) text = text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
          return text;
        };
      },
      getSnapshot: () => ({ active: fixtureLocale }),
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
{
  const titleRegistration = first.registrations.find((r) => r.definition.name === 'sidebar.right.pane.tab.title');
  const titleTree = titleRegistration.component({ useTabInfo: () => ({ tab: { title: '账号用量' } }), t: (key) => first.t(key) });
  assert.equal(walk(titleTree, (n) => hasClass(n, 'aup-tab-icon')).length, 1, 'the tab chip keeps its wallet glyph');
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

// ------------------------------------------------------------- serialiser --
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);

function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, '&quot;');
}

function attributesOf(props) {
  const out = [];
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('aria-') && typeof value === 'boolean') { out.push(key + '="' + String(value) + '"'); continue; }
    if (key === 'children' || value === null || value === undefined || value === false) continue;
    if (key === 'style' && typeof value === 'object') {
      const css = Object.entries(value)
        .map(([property, raw]) => property.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase()) + ':' + String(raw))
        .join(';');
      out.push('style="' + escapeAttribute(css) + '"');
      continue;
    }
    if (key === 'className') {
      out.push('class="' + escapeAttribute(value) + '"');
      continue;
    }
    if (/^on[A-Z]/.test(key)) continue;
    if (value === true) {
      out.push(key);
      continue;
    }
    if (typeof value === 'object') continue;
    out.push(key + '="' + escapeAttribute(value) + '"');
  }
  return out.length === 0 ? '' : ' ' + out.join(' ');
}

function childrenOf(node) {
  const raw = node.children;
  if (raw === undefined) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/** Serialise one element tree node (or array/text) to HTML. */
function toHtml(node) {
  if (node === null || node === undefined || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return escapeText(node);
  if (Array.isArray(node)) return node.map(toHtml).join('');
  if (typeof node.type === 'function') {
    const children = childrenOf(node);
    const expanded = node.type({ ...node.props, children: children.length === 1 ? children[0] : children });
    return toHtml(expanded);
  }
  if (typeof node.type !== 'string') return toHtml(childrenOf(node));
  const tag = node.type;
  const attributes = attributesOf(node.props || {});
  if (VOID_TAGS.has(tag)) return '<' + tag + attributes + '>';
  return '<' + tag + attributes + '>' + childrenOf(node).map(toHtml).join('') + '</' + tag + '>';
}

/** The real panel markup for one set of states. */
function panelHtml(options = {}) {
  const dimension = options.dimension || 'day';
  const state = options.usageState ?? {
    phase: 'ready',
    ok: true,
    source: 'platform',
    days: [],
    currency: 'CNY',
    dimension,
    refreshing: false
  };
  fixtureLocale = options.locale || 'zh';
  try {
    const tree = render(state, options.projection, dimension, options.settings, false, options.sessionModels, options.providerBalances);
    return toHtml(tree);
  } finally { fixtureLocale = 'zh'; }
}

/** Render the real AccountSection for one state (no browser or live APIs). */
function accountCard(options) {
  const tree = render({ phase: 'ready', ok: true, days: [], dimension: 'day' }, undefined, 'day', undefined, false, options.sessionModels, options.providerBalances);
  function find(node) {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) return node.map(find).find(Boolean);
    if (node.type?.name === 'AccountSection') return node;
    return find(node.children);
  }
  const account = find(tree);
  fixtureLocale = options.locale || 'en';
  try { return account.type({ ...account.props, state: options.state || account.props.state, locale: fixtureLocale }); }
  finally { fixtureLocale = 'zh'; }
}

// A small hook runner for the real body effects: setters/refs survive explicit renders.
// No DOM is emulated; browser geometry remains the responsibility of layout-check.
function bodyHarness(overrides = {}) {
  const values = [], dependencies = [], cleanups = [];
  let cursor = 0;
  const equalDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const methods = ['useState', 'useRef', 'useMemo', 'useEffect'];
  return {
    render() {
      cursor = 0;
      const pending = [];
      const originals = Object.fromEntries(methods.map((key) => [key, React[key]]));
      React.useState = (initial) => {
        const i = cursor++;
        if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial;
        return [values[i], (value) => { values[i] = typeof value === 'function' ? value(values[i]) : value; }];
      };
      React.useRef = (initial) => { const i = cursor++; return values[i] ??= { current: initial }; };
      React.useMemo = (fn, deps) => {
        const i = cursor++;
        if (!equalDeps(dependencies[i], deps)) { values[i] = fn(); dependencies[i] = deps; }
        return values[i];
      };
      React.useEffect = (fn, deps) => {
        const i = cursor++;
        if (!equalDeps(dependencies[i], deps)) {
          dependencies[i] = deps;
          pending.push(() => { cleanups[i]?.(); cleanups[i] = fn(); });
        }
      };
      let tree;
      try { tree = bodyRegistration.component({ ...bodyProps, sessionId: 'fixture-session', useProjection: () => undefined, ...overrides }); }
      finally { Object.assign(React, originals); }
      for (const effect of pending) effect();
      return tree;
    },
    destroy() { for (const cleanup of cleanups) cleanup?.(); }
  };
}
export { panelHtml, render, toHtml, accountCard, bodyHarness };
