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
// The panel reads two Host routes: per-session model totals and per-provider
// balances. The platform period-usage route is still served by the Host but has no
// consumer in the panel any more (user 2026-11-09 deleted the statistics card), so
// this stub deliberately answers only the two routes the client actually calls.
let fetchCalls = 0;
globalThis.fetch = async (url) => {
  fetchCalls += 1;
  const parsed = new URL(String(url), 'http://127.0.0.1');
  if (parsed.pathname === '/account-usage/session/models') {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          models: [
            { provider: 'opencode-go', model: 'deepseek-v4.1-flash', tokens: 251_000_000, requests: 800 },
            { provider: 'openrouter', model: 'deepseek-flash-latest', tokens: 180_000_000, requests: 420 },
            { provider: 'deepseek-account', model: 'deepseek-flash', tokens: 29_050_000, requests: 120 }
          ],
          totalTokens: 460_050_000,
          lastRoute: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' }
        }
      })
    };
  }
  if (parsed.pathname === '/account-usage/provider/balance') {
    return { ok: true, status: 200, json: async () => ({ ok: true, data: { phase: 'ready', items: [] } }) };
  }
  return { ok: false, status: 404, json: async () => ({ ok: false, code: 'unknown_route' }) };
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
  // The session card folds in the per-provider totals; the reader is the only
  // session-scoped route the panel still calls.
  fetchCalls = 0;
  const models = await bodyProps.readSessionModels('session-1');
  assert.equal(models.ok, true);
  assert.equal(fetchCalls, 1, 'one route call for the session model totals');
  assert.equal(models.models.length, 3);
  assert.equal(models.models[0].provider, 'opencode-go');
  assert.equal(models.totalTokens, 460_050_000);
  assert.equal(models.lastProvider, 'opencode-go');
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
  assert.equal(walk(titleTree, (n) => hasClass(n, 'aup-tab-icon')).length, 1, 'the tab chip keeps its gauge glyph');
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
// Two cards only (1.0.16): the platform statistics card and its dimension control
// are gone, and the two remaining cards are not configurable (user 2026-11-09), so the
// settings shape is just the two toggles.
const DEFAULT_SETTINGS = {
  autoRefresh: true,
  hideComposerStats: true
};
function render(settingsValue, settingsOpen, sessionModelsValue, providerBalancesValue, projectionValue) {
  stateQueue.push(
    accountState,
    sessionModelsValue || { phase: 'idle', items: [], totalTokens: 0, lastProvider: '' },
    providerBalancesValue || { phase: 'idle', byProvider: {} },
    settingsValue || DEFAULT_SETTINGS,
    { count: 0, force: false },
    settingsOpen === true
  );
  const tree = bodyRegistration.component({
    t: first.t,
    useProjection: typeof projectionValue === 'function' ? projectionValue : (typeof projection === 'function' ? projection : () => undefined),
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
  fixtureLocale = options.locale || 'zh';
  try {
    const tree = render(options.settings, false, options.sessionModels, options.providerBalances, options.projection);
    return toHtml(tree);
  } finally { fixtureLocale = 'zh'; }
}

/** Render the real AccountSection for one state (no browser or live APIs). */
function accountCard(options) {
  const tree = render(undefined, false, options.sessionModels, options.providerBalances);
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
