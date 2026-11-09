import assert from 'node:assert/strict';
import { accountCard, bodyHarness, toHtml } from './render-fixture.mjs';

const models = { phase: 'ready', lastProvider: 'openai', items: [
  { provider: 'deepseek-account', model: 'flash', tokens: 469000000, requests: 1000 },
  { provider: 'opencode-go', model: 'flash', tokens: 386000000, requests: 804 },
  { provider: 'openai', model: 'gpt', tokens: 1260000, requests: 13 },
  { provider: 'openrouter', model: 'x', tokens: 0, requests: 7 }
] };
const plan = { ok: true, provider: 'opencode-go', kind: 'opencode-plan', windows: [
  { id: 'rolling', usedPercent: 4 }, { id: 'weekly', usedPercent: 16 }, { id: 'monthly', usedPercent: 8 }
] };
function nodes(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach(n => nodes(n, predicate, out)); return out; }
  if (predicate(node)) out.push(node);
  nodes(node.children, predicate, out);
  return out;
}
const txt = node => toHtml(node).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const card = tree => nodes(tree, n => n.type?.name === 'AccountSection')[0];
const rowsOf = tree => Object.fromEntries(nodes(tree, n => n.props?.className === 'aup-acct-src').map(row => [
  txt(nodes(row, n => n.props?.className === 'aup-acct-src-label')[0]), row]));

// Every source is one aligned row; each row carries only that source's own data,
// independently of the order in which provider results arrive.
for (const locale of ['zh', 'en']) {
  for (const reverse of [false, true]) {
    const statuses = [
      ['openai', { phase: 'error', code: 'unsupported_provider' }],
      ['openrouter', { phase: 'error', code: 'no_credential' }],
      ['opencode-go', { phase: 'ready', data: plan }]
    ];
    const tree = accountCard({ locale, sessionModels: models,
      providerBalances: { phase: 'ready', byProvider: Object.fromEntries(reverse ? statuses.reverse() : statuses) } });
    const rows = rowsOf(tree);
    assert.deepEqual(Object.keys(rows), ['DeepSeek API', 'OpenCode Go', 'OpenAI', 'OpenRouter']);
    for (const row of Object.values(rows)) assert.equal(row.children.length, 2, 'two cells per row');
    assert.equal(nodes(tree, n => n.props?.role === 'tab').length, 0, 'no tabs');
    const highlighted = Object.values(rows).filter(row => row.props['data-current'] === true);
    assert.equal(highlighted.length, 1, 'exactly one account row is highlighted');
    assert.equal(txt(highlighted[0]), locale === 'en' ? 'OpenAI Unsupported' : 'OpenAI 插件暂不支持', 'the session provider row is the highlighted one');
    assert.equal(highlighted[0].props['aria-current'], 'true', 'the highlight is exposed to assistive tech');
    assert.equal(txt(rows['OpenCode Go']), 'OpenCode Go 5HW 96% WEK 84% MON 92%', 'plan windows show the share left in fixed order');
    assert.equal(txt(rows.OpenAI), locale === 'en' ? 'OpenAI Unsupported' : 'OpenAI 插件暂不支持');
    assert.match(txt(rows['DeepSeek API']), locale === 'en' ? /^DeepSeek API Balance \S+¥ Bonus \S+¥$/ : /^DeepSeek API 余额 \S+¥ 赠送 \S+¥$/, 'DeepSeek reads Balance x Bonus y');
    assert.equal(txt(rows.OpenRouter), locale === 'en' ? 'OpenRouter Key not configured' : 'OpenRouter 未配置密钥');
    assert(!/386M|1\.26M|804/.test(txt(tree)), 'session totals stay in the statistics card');
    assert.equal(nodes(tree, n => n.props?.className === 'aup-retry').length, 0);
  }
}
// The highlighted row follows the newest assistant message (user 2026-11-08); an
// unknown provider highlights nothing, and a single-account session has no row list.
{
  const mixed = { phase: 'ready', lastProvider: 'opencode-go', items: [
    { provider: 'deepseek-account', model: 'chat', tokens: 1, requests: 1 },
    { provider: 'opencode-go', model: 'flash', tokens: 2, requests: 2 },
    { provider: 'openrouter', model: 'x', tokens: 0, requests: 1 }
  ] };
  const balances = { phase: 'ready', byProvider: {
    'opencode-go': { phase: 'ready', data: plan },
    openrouter: { phase: 'error', code: 'no_credential' }
  } };
  let rows = rowsOf(accountCard({ sessionModels: mixed, providerBalances: balances }));
  assert.equal(rows['OpenCode Go'].props['data-current'], true, 'the provider in use is highlighted');
  assert.equal(rows['DeepSeek API'].props['data-current'], undefined, 'other rows stay plain');
  assert.equal(rows.OpenRouter.props['data-current'], undefined, 'other rows stay plain');

  rows = rowsOf(accountCard({ sessionModels: { ...mixed, lastProvider: 'deepseek-account' }, providerBalances: balances }));
  assert.equal(rows['DeepSeek API'].props['data-current'], true, 'the DeepSeek account row is highlighted for account sessions');
  assert.equal(rows['OpenCode Go'].props['data-current'], undefined);

  rows = rowsOf(accountCard({ sessionModels: { ...mixed, lastProvider: 'anthropic' }, providerBalances: balances }));
  assert.equal(Object.values(rows).filter(row => row.props['data-current'] !== undefined).length, 0, 'an unknown or stale provider highlights nothing');

  const single = accountCard({ sessionModels: { phase: 'ready', lastProvider: 'deepseek-account', items: [{ provider: 'deepseek-account', tokens: 1 }] } });
  assert.equal(nodes(single, n => n.props?.['data-current'] !== undefined).length, 0, 'a single-account session has no row highlight');
}

for (const code of ['loading','no_credential','auth_failed','credential_failed','timeout','invalid_response','fetch_failed','unsupported_provider']) {
  const calls = [];
  const tree = accountCard({ sessionModels: models, onRetry: id => calls.push(id), providerBalances: {
    phase: 'ready', byProvider: { openai: code === 'loading' ? { phase: 'loading' } : { phase: 'error', code }, 'opencode-go': { phase: 'ready', data: plan } }
  } });
  const rows = rowsOf(tree);
  assert.equal(nodes(tree, n => n.type === 'button').length, 0, 'all balance states are read-only: ' + code);
  assert.deepEqual(calls, [], 'failed reads do not initiate retries');
  assert.equal(rows.OpenAI.props['aria-busy'], code === 'loading' ? true : undefined);
  assert(txt(rows['OpenCode Go']).includes('MON 92%'), 'another source failure never hides a success');
}

// DeepSeek failures stay quiet both alone and in mixed-source sessions.
for (const sessionModels of [models, { phase: 'ready', items: [{ provider: 'deepseek-account', tokens: 1 }] }]) {
  for (const state of [
    { phase: 'error', result: { ok: false, code: 'fetch_failed' } },
    { phase: 'ready', result: { ok: true, view: { status: 'credential-stored' }, balance: { status: 'failed' } } }
  ]) {
    const tree = accountCard({ sessionModels, state });
    assert.equal(nodes(tree, n => n.type === 'button').length, 0, 'DeepSeek errors have no Retry button');
  }
}

// Every unsupported provider id gets the same short row.
for (const provider of ['openai','anthropic','google','amazon-bedrock','azure','github-copilot','xai','mistral','groq','custom-provider']) {
  const ownModels = { ...models, lastProvider: provider, items: models.items.map(row => row.provider === 'openai' ? { ...row, provider } : row) };
  const tree = accountCard({ sessionModels: ownModels, providerBalances: { phase: 'ready', byProvider: { [provider]: { phase: 'error', code: 'unsupported_provider' } } } });
  const row = rowsOf(tree)[txt(nodes(tree, n => n.props?.className === 'aup-acct-src-label').find(n => !['DeepSeek API', 'OpenCode Go', 'OpenRouter'].includes(txt(n))))];
  assert(txt(row).endsWith('Unsupported') && !/386M|804|92%/.test(txt(row)), provider);
}
{
  const tree = accountCard({ sessionModels: { phase: 'ready', lastProvider: 'opencode-zen', items: [
    { provider: 'opencode-zen', tokens: 100, requests: 1 }, { provider: 'opencode-go', tokens: 200, requests: 2 }
  ] }, providerBalances: { phase: 'ready', byProvider: {
    'opencode-zen': { phase: 'ready', data: { ...plan, provider: 'opencode-zen', windows: [{ id: 'monthly', usedPercent: 61 }] } },
    'opencode-go': { phase: 'ready', data: plan }
  } } });
  const rows = nodes(tree, n => n.props?.className === 'aup-acct-src').map(txt);
  assert(rows.some(row => row.endsWith('MON 39%')) && rows.some(row => row.endsWith('MON 92%')), 'Zen and Go never share alias data: ' + rows);
}
// Command Code publishes a 5-hour and a weekly window plus the credits left, so its
// row keeps the plan rule (share left, fixed order) and appends one CRED pair.
{
  const ccModels = { phase: 'ready', lastProvider: 'commandcode', items: [
    { provider: 'commandcode', model: 'deepseek/deepseek-v4.1-flash-fast', tokens: 98000, requests: 12 }
  ] };
  const data = { ok: true, provider: 'commandcode', kind: 'commandcode-plan', currency: 'USD',
    windows: [
      { id: 'fiveHour', usedPercent: 100, status: 'exceeded', resetsAt: '2026-11-09T09:58:14.512Z' },
      { id: 'weekly', usedPercent: 50.04, resetsAt: '2026-11-16T03:38:14.512Z' }
    ],
    credits: { monthly: 6.9983883725, purchased: 0, free: 0 } };
  for (const locale of ['zh', 'en']) {
    const tree = accountCard({ locale, sessionModels: ccModels,
      providerBalances: { phase: 'ready', byProvider: { commandcode: { phase: 'ready', data } } } });
    const rows = rowsOf(tree);
    assert.deepEqual(Object.keys(rows), ['Command Code'], 'one aligned row for the Command Code source');
    const row = rows['Command Code'];
    assert.equal(row.children.length, 2, 'two cells per row');
    assert.equal(row.props['data-current'], true, 'the in-use source row is highlighted');
    assert.equal(txt(row), locale === 'en'
      ? 'Command Code 5HW 0% WEK 50% CRED 6.99$'
      : 'Command Code 5HW 0% WEK 50% 额度 6.99$',
      'windows read the share left in fixed order and credits stay the amount left');
    assert.equal(nodes(tree, n => /aup-acct-(track|fill)/.test(n.props?.className || '')).length, 0, 'no capsule bar for a plan row');
  }
  // A plan that only reported credits shows that one figure, never a zeroed window.
  const creditsOnly = { ...data, windows: [] };
  let rows = rowsOf(accountCard({ sessionModels: ccModels,
    providerBalances: { phase: 'ready', byProvider: { commandcode: { phase: 'ready', data: creditsOnly } } } }));
  assert.equal(txt(rows['Command Code']), 'Command Code CRED 6.99$', 'credits alone still read on the right');
  // With no reported credits the two windows stand alone.
  const windowsOnly = { ...data, credits: undefined };
  rows = rowsOf(accountCard({ sessionModels: ccModels,
    providerBalances: { phase: 'ready', byProvider: { commandcode: { phase: 'ready', data: windowsOnly } } } }));
  assert.equal(txt(rows['Command Code']), 'Command Code 5HW 0% WEK 50%', 'absent credits are not invented');
}

for (const [data, expected] of [[{ remaining: 2, total: 10, used: 8 }, 'Key 2.00$'], [{ used: 8 }, 'No balance']]) {
  const tree = accountCard({ sessionModels: { phase: 'ready', lastProvider: 'openrouter', items: [{ provider: 'openrouter', tokens: 0, requests: 1 }] },
    providerBalances: { phase: 'ready', byProvider: { openrouter: { phase: 'ready', data: { ok: true, provider: 'openrouter', scope: 'key', currency: 'USD', ...data } } } } });
  assert.equal(txt(nodes(tree, n => n.props?.className === 'aup-acct-src')[0]), 'OpenRouter ' + expected, 'balance card shows what is left only: no Used/costs, unknown remaining is never zero');
}
assert.equal(nodes(accountCard({ sessionModels: models, providerBalances: { phase: 'ready', byProvider: {} } }), n => /aup-acct-(track|fill)/.test(n.props?.className || '')).length, 0, 'no capsule bars');
// OpenAI / Anthropic expose spend only, never a balance (user 2026-11-08: no costs in
// the balance card), so they are plain Unsupported rows with no retry.
for (const [id, label] of [['openai', 'OpenAI'], ['anthropic', 'Anthropic']]) {
  const own = { phase: 'ready', lastProvider: id, items: [{ provider: id, tokens: 1, requests: 1 }] };
  const row = rowsOf(accountCard({ sessionModels: own, providerBalances: { phase: 'ready', byProvider: { [id]: { phase: 'error', code: 'unsupported_provider' } } } }))[label];
  assert.equal(txt(row), label + ' Unsupported');
  assert.equal(nodes(row, n => n.props?.className === 'aup-retry').length, 0);
}

// Execute the actual body effects, preserving hook state and refs between renders.
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const calls = [], reads = [];
const thirdParty = { ok: true, models: models.items.filter(row => row.provider !== 'deepseek-account'), lastProvider: 'openai' };
const accountWait = deferred(), usageWait = deferred();
const harness = bodyHarness({
  readSessionModels: async () => thirdParty,
  readAccount: () => accountWait.promise,
  readUsage: () => usageWait.promise,
  readProviderBalances: (id, force) => { calls.push([id, force]); const d = deferred(); reads.push({ id, ...d }); return d.promise; }
});
try {
  harness.render(); await settle(); harness.render(); await settle();
  assert.deepEqual(calls.map(c => c[0]).sort(), ['opencode-go','openai','openrouter'].sort());
  reads.find(r => r.id === 'opencode-go').resolve(plan);
  reads.find(r => r.id === 'openai').resolve({ ok: false, code: 'unsupported_provider' });
  reads.find(r => r.id === 'openrouter').resolve({ ok: false, code: 'no_credential' });
  await settle();
  let tree = harness.render();
  let states = card(tree).props.providerBalances.byProvider;
  assert.equal(states['opencode-go'].phase, 'ready');
  assert.equal(states.openai.code, 'unsupported_provider');
  assert.equal(states.openrouter.code, 'no_credential');
  const refresh = nodes(tree, n => n.type === 'button' && n.props?.onClick?.name === 'refresh')[0];
  assert(refresh && refresh.props.disabled !== true, 'canceled platform reads never disable third-party refresh');
  const before = calls.length;
  refresh.props.onClick(); harness.render(); await settle();
  assert.deepEqual(calls.slice(before).map(([id, force]) => [id, force]).sort(),
    [['opencode-go', true], ['openai', true], ['openrouter', true]].sort(), 'header refresh still reads each source');
  const older = reads.findLast(r => r.id === 'openai');
  tree = harness.render();
  nodes(tree, n => n.type === 'button' && n.props?.onClick?.name === 'refresh')[0].props.onClick();
  harness.render(); await settle();
  reads.findLast(r => r.id === 'openai').resolve({ ok: false, code: 'timeout' }); await settle();
  older.resolve({ ok: false, code: 'no_credential' }); await settle();
  tree = harness.render(); states = card(tree).props.providerBalances.byProvider;
  assert.equal(states.openai.code, 'timeout', 'stale refresh cannot overwrite the newest state');
  assert.equal(states['opencode-go'].data.windows[2].usedPercent, 8, 'other provider success survives refresh');
  assert.equal(card(tree).props.onRetry, undefined, 'no row retry plumbing remains');
} finally { harness.destroy(); }
console.log('provider client checks passed: independent balances, plan percentages, no costs/dots/retry buttons, header refresh, stale responses; zh/en');
