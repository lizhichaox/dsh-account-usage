/**
 * Host half — real DeepSeek platform usage for the account usage panel.
 *
 * The Client half cannot reach the platform session token (it is Host-only), so
 * this half registers a loopback/same-origin HTTP route the page fetches:
 *
 *   GET /account-usage/platform/usage?year=YYYY&month=M&force=1
 *     -> { ok: true, data: { year, month, currency,
 *                            days: [{date, tokens, cost, requests}],
 *                            month: {tokens, cost, requests}, fetchedAt } }
 *     -> { ok: false, code: 'no_account' | 'auth_failed' | 'timeout'
 *                            | 'fetch_failed' | 'invalid_response' }
 *
 *   GET /account-usage/session/models?sessionId=<id>
 *     -> { ok: true, data: { models: [{provider, model, tokens, requests}],
 *                            totalTokens, fetchedAt } }
 *     -> { ok: false, code: 'no_session' }
 *
 * Data comes from the same private Platform Web endpoints the platform usage
 * page loads, authenticated with the signed-in harness account's platform
 * session (with a DEEPSEEK_USER_TOKEN credential as fallback):
 *
 *   GET {origin}/api/v0/usage/amount?month=M&year=YYYY
 *   GET {origin}/api/v0/usage/cost?month=M&year=YYYY
 *   header: x-dsh-auth-token: <platform session token>
 *
 * These are private dashboard endpoints of the DeepSeek Platform, not the
 * documented public API; they may change without notice.
 */
export const inject = ['webServer'];

const AMOUNT_PATH = '/api/v0/usage/amount';
const COST_PATH = '/api/v0/usage/cost';
const DEFAULT_ORIGIN = 'https://platform.deepseek.com';
const ROUTE_PATH = '/account-usage/platform/usage';
const MODELS_ROUTE_PATH = '/account-usage/session/models';
const PROVIDER_BALANCE_ROUTE_PATH = '/account-usage/provider/balance';
const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]{0,40}$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const CACHE_TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 15000;
const MAX_BYTES = 4 * 1024 * 1024;
const USER_TOKEN_CREDENTIAL = 'DEEPSEEK_USER_TOKEN';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const RESERVED_HEADERS = new Set([
  'authorization',
  'x-dsh-auth-token',
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'content-type'
]);

function validPeriod(year, month) {
  return Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12 && year >= 2000 && year <= 2100;
}

function codedError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  if (status !== undefined) error.status = status;
  return error;
}

/** Loopback + same-origin guard, mirroring the DSH web server's trust posture. */
function isTrustedRequest(req) {
  const address = req.socket === undefined ? undefined : req.socket.remoteAddress;
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false;
  const host = req.headers === undefined ? undefined : req.headers.host;
  if (typeof host !== 'string') return false;
  let hostUrl;
  try {
    hostUrl = new URL('http://' + host);
  } catch {
    return false;
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}

function toInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toFloat(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Platform auth failures surface as an HTTP status or as an envelope business code. */
function authFailure(status, data) {
  if (status === 401 || status === 403) return true;
  if (data === null || typeof data !== 'object') return false;
  if (data.code === 40002 || data.code === 40003) return true;
  const inner = data.data;
  if (inner !== null && typeof inner === 'object' && (inner.biz_code === 40002 || inner.biz_code === 40003)) return true;
  return false;
}

async function readJsonLimited(response) {
  const declared = response.headers === undefined ? null : response.headers.get('content-length');
  if (declared !== null && declared !== undefined && Number(declared) > MAX_BYTES) {
    throw codedError('invalid_response', '平台返回内容过大');
  }
  let text;
  try {
    text = await response.text();
  } catch {
    throw codedError('fetch_failed', '读取平台返回失败');
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw codedError('invalid_response', '平台返回内容过大');
  try {
    return JSON.parse(text);
  } catch {
    throw codedError('invalid_response', '平台返回内容不是 JSON');
  }
}

/** Deployment headers plus the platform account auth header. */
function platformHeaders(token, requestHeaders) {
  const headers = {
    'x-dsh-auth-token': token,
    accept: 'application/json',
    'user-agent': USER_AGENT,
    'x-client-platform': 'web'
  };
  if (requestHeaders !== null && requestHeaders !== undefined) {
    for (const [name, value] of Object.entries(requestHeaders)) {
      if (typeof value !== 'string' || RESERVED_HEADERS.has(name.toLowerCase())) continue;
      headers[name] = value;
    }
  }
  return headers;
}

async function platformGet(origin, path, token, requestHeaders) {
  let response;
  try {
    response = await fetch(origin + path, {
      headers: { ...platformHeaders(token, requestHeaders), referer: origin + '/usage' },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (error) {
    if (error !== null && typeof error === 'object' && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw codedError('timeout', '平台请求超时');
    }
    throw codedError('fetch_failed', '平台网络请求失败');
  }
  const data = await readJsonLimited(response);
  if (authFailure(response.status, data)) throw codedError('auth_failed', '平台登录态无效或已过期', response.status);
  if (response.status !== 200) throw codedError('invalid_response', '平台返回 HTTP ' + String(response.status), response.status);
  return data;
}

/** Fold one month's amount + cost payloads into per-day token, cost, and request buckets. */
function parseMonth(year, month, amountData, costData) {
  const amountBiz =
    amountData !== null && typeof amountData === 'object' && amountData.data !== null && typeof amountData.data === 'object'
      ? amountData.data.biz_data
      : undefined;
  const costRaw =
    costData !== null && typeof costData === 'object' && costData.data !== null && typeof costData.data === 'object'
      ? costData.data.biz_data
      : undefined;
  const costItem = Array.isArray(costRaw) ? costRaw[0] || {} : costRaw !== null && typeof costRaw === 'object' ? costRaw : {};
  const currency = typeof costItem.currency === 'string' && costItem.currency !== '' ? costItem.currency : 'CNY';

  const days = new Map();
  const cellOf = (date) => {
    let cell = days.get(date);
    if (cell === undefined) {
      cell = { date, tokens: 0, cost: 0, requests: 0 };
      days.set(date, cell);
    }
    return cell;
  };
  const eachUsage = (list, visit) => {
    for (const model of Array.isArray(list) ? list : []) {
      if (model === null || typeof model !== 'object' || !Array.isArray(model.usage)) continue;
      for (const entry of model.usage) {
        if (entry === null || typeof entry !== 'object') continue;
        visit(entry);
      }
    }
  };

  if (amountBiz !== null && typeof amountBiz === 'object' && Array.isArray(amountBiz.days)) {
    for (const day of amountBiz.days) {
      if (day === null || typeof day !== 'object' || typeof day.date !== 'string') continue;
      const cell = cellOf(day.date);
      eachUsage(day.data, (entry) => {
        const amount = toInt(entry.amount);
        if (entry.type === 'REQUEST') cell.requests += amount;
        else cell.tokens += amount;
      });
    }
  }
  if (Array.isArray(costItem.days)) {
    for (const day of costItem.days) {
      if (day === null || typeof day !== 'object' || typeof day.date !== 'string') continue;
      const cell = cellOf(day.date);
      eachUsage(day.data, (entry) => {
        if (entry.type !== 'REQUEST') cell.cost += toFloat(entry.amount);
      });
    }
  }

  const list = [...days.values()].sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0));
  const totals = list.reduce(
    (sum, cell) => ({ tokens: sum.tokens + cell.tokens, cost: sum.cost + cell.cost, requests: sum.requests + cell.requests }),
    { tokens: 0, cost: 0, requests: 0 }
  );
  return { year, month, currency, days: list, month: totals, fetchedAt: Date.now() };
}

/** Short-lived cache for the resolved platform session; each month read needs it. */
let platformSessionCache = null;
const PLATFORM_SESSION_TTL_MS = 30000;

/** Read the signed-in platform session, falling back to a stored userToken credential. */
async function resolvePlatformSession(ctx) {
  if (platformSessionCache !== null && Date.now() - platformSessionCache.at < PLATFORM_SESSION_TTL_MS) {
    return platformSessionCache.session;
  }
  const account = ctx.get('deepseekAccount');
  if (account !== undefined) {
    try {
      const session = await account.getPlatformSession();
      if (session !== null && session !== undefined && typeof session.token === 'string' && session.token !== '') {
        let origin = DEFAULT_ORIGIN;
        try {
          const parsed = new URL(session.origin);
          if (parsed.protocol === 'https:') origin = parsed.origin;
        } catch {
          /* keep the default */
        }
        const resolved = { origin, token: session.token, requestHeaders: session.requestHeaders };
        platformSessionCache = { session: resolved, at: Date.now() };
        return resolved;
      }
    } catch (error) {
      console.error('[account-usage] reading the platform session failed:', String(error && error.message ? error.message : error));
    }
  }
  const credentials = ctx.get('credentials');
  if (credentials !== undefined) {
    try {
      const record = await credentials.resolve(USER_TOKEN_CREDENTIAL);
      const token = record !== null && record !== undefined && typeof record.value === 'string' ? record.value.trim() : '';
      if (token !== '') {
        const resolved = { origin: DEFAULT_ORIGIN, token, requestHeaders: undefined };
        platformSessionCache = { session: resolved, at: Date.now() };
        return resolved;
      }
    } catch {
      /* no fallback token */
    }
  }
  platformSessionCache = null;
  return null;
}

/** One month of platform usage, cached by year/month with in-flight de-duplication. */
function createMonthReader(ctx) {
  const cache = new Map();
  return async function readMonth(year, month, force) {
    const key = String(year) + '-' + String(month);
    const hit = cache.get(key);
    if (hit !== undefined) {
      if (hit.inflight !== undefined) return hit.inflight;
      if (force !== true && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
    }
    const inflight = (async () => {
      const session = await resolvePlatformSession(ctx);
      if (session === null) throw codedError('no_account', '没有可用的 DeepSeek 平台登录态');
      const query = '?month=' + String(month) + '&year=' + String(year);
      const [amountData, costData] = await Promise.all([
        platformGet(session.origin, AMOUNT_PATH + query, session.token, session.requestHeaders),
        platformGet(session.origin, COST_PATH + query, session.token, session.requestHeaders)
      ]);
      const data = parseMonth(year, month, amountData, costData);
      cache.set(key, { data, at: Date.now() });
      return data;
    })();
    cache.set(key, { data: hit === undefined ? undefined : hit.data, at: Date.now(), inflight });
    try {
      return await inflight;
    } catch (error) {
      cache.delete(key);
      throw error;
    }
  };
}

/**
 * Last provider usage sample embedded in one attempt's compact stream.
 * The token-meter projection reads the same chunk shape.
 */
function usageSampleOf(event) {
  if (event === null || typeof event !== 'object') return undefined;
  const data = event.data !== null && typeof event.data === 'object' ? event.data : {};
  if (event.type === 'assistant/message' && data.usage !== null && typeof data.usage === 'object') return data.usage;
  const stream = data.stream;
  if (!Array.isArray(stream)) return undefined;
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const chunk = stream[index];
    if (chunk !== null && typeof chunk === 'object' && chunk.type === 'usage' && chunk.usage !== null && typeof chunk.usage === 'object') {
      return chunk.usage;
    }
  }
  return undefined;
}

/** Provider/model route recorded on an assistant message. */
function routeOf(event) {
  const data = event.data !== null && typeof event.data === 'object' ? event.data : {};
  const message = data.message !== null && typeof data.message === 'object' ? data.message : undefined;
  const source = message !== undefined && message.source !== null && typeof message.source === 'object' ? message.source : undefined;
  if (source === undefined || typeof source.model !== 'string' || source.model === '') return undefined;
  return { provider: typeof source.provider === 'string' ? source.provider : '', model: source.model };
}

function bucketsOf(usage) {
  const count = (value) => (Number.isSafeInteger(value) && value > 0 ? value : 0);
  return {
    input: count(usage.inputTokens),
    output: count(usage.outputTokens),
    cacheRead: count(usage.cacheReadTokens),
    cacheWrite: count(usage.cacheWriteTokens)
  };
}

/** Token bucket sum for one model row. */
function tokensOf(bucket) {
  return bucket.input + bucket.output + bucket.cacheRead + bucket.cacheWrite;
}

/**
 * Fold a session log into per-model provider-reported token totals.
 * Each settled attempt replaces its own sample (same turn/step), mirrors the
 * tokenUsage projection, and is attributed to the message route in force.
 * @param events - Session events in log order.
 * @returns Rows sorted by descending token total.
 */
export function foldSessionModels(events) {
  const models = new Map();
  let last = null;
  let route;
  const keyOf = (value) => (value.provider || '') + '\u0000' + value.model;
  const entryOf = (value) => {
    const key = keyOf(value);
    let entry = models.get(key);
    if (entry === undefined) {
      entry = { provider: value.provider || '', model: value.model, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 };
      models.set(key, entry);
    }
    return entry;
  };
  for (const event of events) {
    if (event === null || typeof event !== 'object') continue;
    if (event.type === 'llm/retry-started') {
      last = null;
      continue;
    }
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') continue;
    const found = routeOf(event);
    if (found !== undefined) route = found;
    const usage = usageSampleOf(event);
    if (usage === undefined || route === undefined) continue;
    const data = event.data !== null && typeof event.data === 'object' ? event.data : {};
    const turn = data.turn;
    const step = data.step;
    const key = keyOf(route);
    const bucket = bucketsOf(usage);
    if (last !== null && last.turn === turn && last.step === step) {
      const previous = models.get(last.key);
      if (previous !== undefined) {
        previous.input -= last.bucket.input;
        previous.output -= last.bucket.output;
        previous.cacheRead -= last.bucket.cacheRead;
        previous.cacheWrite -= last.bucket.cacheWrite;
        previous.requests = Math.max(0, previous.requests - 1);
      }
    }
    const entry = entryOf(route);
    entry.input += bucket.input;
    entry.output += bucket.output;
    entry.cacheRead += bucket.cacheRead;
    entry.cacheWrite += bucket.cacheWrite;
    entry.requests += 1;
    last = { turn, step, key, bucket };
  }
  return [...models.values()]
    .map((entry) => ({
      provider: entry.provider,
      model: entry.model,
      tokens: tokensOf(entry),
      requests: entry.requests
    }))
    .filter((entry) => entry.tokens > 0)
    .sort((left, right) => right.tokens - left.tokens);
}

/** One read of the on-screen session's per-model token totals, cached briefly. */
function createSessionModelReader(ctx) {
  const cache = new Map();
  return async function readSessionModels(sessionId) {
    const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined;
    if (sessions === undefined || sessions === null || typeof sessions.get !== 'function') {
      return { ok: false, code: 'no_session' };
    }
    const session = sessions.get(sessionId);
    if (session === undefined || session === null) return { ok: false, code: 'no_session' };
    const seq = typeof session.seq === 'number' ? session.seq : -1;
    const hit = cache.get(sessionId);
    const now = Date.now();
    if (hit !== undefined && hit.seq === seq && now - hit.at < 10000) {
      return { ok: true, models: hit.models, totalTokens: hit.totalTokens, lastRoute: hit.lastRoute, fetchedAt: hit.at };
    }
    let models;
    let lastRoute;
    try {
      const events = session.ownEvents();
      models = foldSessionModels(events);
      lastRoute = lastRouteOf(events);
    } catch (error) {
      return { ok: false, code: 'no_session' };
    }
    const totalTokens = models.reduce((sum, entry) => sum + entry.tokens, 0);
    cache.set(sessionId, { at: now, seq, models, totalTokens, lastRoute });
    if (cache.size > 20) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return { ok: true, models, totalTokens, lastRoute, fetchedAt: now };
  };
}

/** Provider/model of the newest routed assistant message in the session log. */
function lastRouteOf(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event === null || typeof event !== 'object') continue;
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') continue;
    const route = routeOf(event);
    if (route !== undefined) return route;
  }
  return undefined;
}

// ---------------------------------------------------------- provider balances --

/** Balance endpoints per provider; unsupported providers return a typed reason. */
const PROVIDER_BALANCE_SPECS = {
  openrouter: { kind: 'openrouter', currency: 'USD', keyEnv: 'OPENROUTER_API_KEY' },
  deepseek: { kind: 'deepseek', currency: 'CNY', keyEnv: 'DEEPSEEK_API_KEY' },
  'deepseek-api': { kind: 'deepseek', currency: 'CNY', keyEnv: 'DEEPSEEK_API_KEY' },
  'deepseek-api-key': { kind: 'deepseek', currency: 'CNY', keyEnv: 'DEEPSEEK_API_KEY' },
  opencode: { kind: 'opencode-plan', keyEnv: 'OPENCODE_API_KEY' },
  'opencode-go': { kind: 'opencode-plan', keyEnv: 'OPENCODE_GO_API_KEY' },
  'opencode-zen': { kind: 'opencode-plan', keyEnv: 'OPENCODE_API_KEY' }
};

function finiteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

/** Read one provider API key from the Host credential seam, never from the client. */
async function resolveProviderKey(ctx, spec, provider) {
  const credentials = typeof ctx.get === 'function' ? ctx.get('credentials') : undefined;
  if (credentials === undefined || credentials === null) return undefined;
  try {
    const envRef = spec.keyEnv || provider.toUpperCase().replaceAll('-', '_') + '_API_KEY';
    if (typeof credentials.resolve === 'function') {
      const hit = await credentials.resolve(envRef);
      if (hit !== undefined && hit !== null && typeof hit.value === 'string' && hit.value.trim() !== '') return hit.value;
    }
    if (typeof credentials.readRecord === 'function') {
      const record = await credentials.readRecord('llm-pi-ai/' + provider);
      if (record !== undefined && record !== null && record.kind === 'api-key' && typeof record.key === 'string' && record.key.trim() !== '') return record.key;
    }
  } catch (error) {
    return undefined;
  }
  return undefined;
}

async function getJson(url, key, signal) {
  let response;
  try {
    response = await fetch(url, {
      headers: { authorization: 'Bearer ' + key, accept: 'application/json' },
      redirect: 'manual',
      signal
    });
  } catch (error) {
    throw codedError(error && error.name === 'TimeoutError' ? 'timeout' : 'fetch_failed', 'provider balance request failed');
  }
  if (response.status === 401 || response.status === 403) throw codedError('auth_failed', 'provider rejected the API key', response.status);
  if (response.status !== 200) throw codedError('invalid_response', 'provider returned HTTP ' + String(response.status), response.status);
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > 262144) throw codedError('invalid_response', 'provider response too large');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw codedError('invalid_response', 'provider response is not JSON');
  }
}

async function readOpenRouterBalance(key, signal) {
  try {
    const payload = await getJson('https://openrouter.ai/api/v1/credits', key, signal);
    const data = payload !== null && typeof payload === 'object' && payload.data !== null && typeof payload.data === 'object' ? payload.data : {};
    const total = finiteNumber(data.total_credits);
    const used = finiteNumber(data.total_usage);
    if (total !== undefined) {
      return {
        provider: 'openrouter',
        kind: 'openrouter',
        currency: 'USD',
        remaining: Math.max(0, total - (used === undefined ? 0 : used)),
        ...used === undefined ? {} : { used },
        total
      };
    }
  } catch (error) {
    /* fall back to the per-key view below */
  }
  const payload = await getJson('https://openrouter.ai/api/v1/key', key, signal);
  const data = payload !== null && typeof payload === 'object' && payload.data !== null && typeof payload.data === 'object' ? payload.data : {};
  const used = finiteNumber(data.usage);
  const limit = finiteNumber(data.limit);
  const limitRemaining = finiteNumber(data.limit_remaining);
  const remaining = limitRemaining !== undefined ? limitRemaining : limit !== undefined && used !== undefined ? Math.max(0, limit - used) : undefined;
  if (remaining === undefined && used === undefined) throw codedError('invalid_response', 'provider balance response missing amounts');
  return {
    provider: 'openrouter',
    kind: 'openrouter',
    currency: 'USD',
    ...remaining === undefined ? {} : { remaining },
    ...used === undefined ? {} : { used }
  };
}

async function readDeepSeekKeyBalance(key, signal) {
  const payload = await getJson('https://api.deepseek.com/user/balance', key, signal);
  const infos = payload !== null && typeof payload === 'object' && Array.isArray(payload.balance_infos) ? payload.balance_infos : [];
  const first = infos[0] !== null && typeof infos[0] === 'object' ? infos[0] : {};
  const remaining = finiteNumber(first.total_balance);
  if (remaining === undefined) throw codedError('invalid_response', 'provider balance response missing amounts');
  const granted = finiteNumber(first.granted_balance);
  const currency = typeof first.currency === 'string' && first.currency !== '' ? first.currency : 'CNY';
  return {
    provider: 'deepseek',
    kind: 'deepseek',
    currency,
    remaining,
    ...granted === undefined ? {} : { granted }
  };
}

/**
 * Plan usage for opencode (Go/Zen): the official endpoint reports percentages
 * over rolling / weekly / monthly windows instead of a money balance.
 *   GET https://opencode.ai/zen/go/v1/usage  (Authorization: Bearer <key>)
 */
async function readOpenCodePlan(key, signal) {
  const payload = await getJson('https://opencode.ai/zen/go/v1/usage', key, signal);
  const usage = payload !== null && typeof payload === 'object' && payload.usage !== null && typeof payload.usage === 'object' ? payload.usage : undefined;
  if (usage === undefined) throw codedError('invalid_response', 'opencode plan response missing usage');
  const windows = [];
  for (const id of ['rolling', 'weekly', 'monthly']) {
    const window = usage[id];
    if (window === null || typeof window !== 'object') continue;
    const percent = finiteNumber(window.percent);
    if (percent === undefined) continue;
    windows.push({
      id,
      usedPercent: Math.min(100, Math.max(0, Math.round(percent * 10) / 10)),
      ...typeof window.status === 'string' ? { status: window.status } : {},
      ...typeof window.resetsAt === 'string' ? { resetsAt: window.resetsAt } : {}
    });
  }
  if (windows.length === 0) throw codedError('invalid_response', 'opencode plan response missing windows');
  return { provider: 'opencode-go', kind: 'opencode-plan', windows };
}

/** One cached provider balance read; unsupported providers and missing keys stay typed. */
function createProviderBalanceReader(ctx) {
  const cache = new Map();
  return async function readProviderBalance(provider, force) {
    const spec = Object.prototype.hasOwnProperty.call(PROVIDER_BALANCE_SPECS, provider) ? PROVIDER_BALANCE_SPECS[provider] : undefined;
    if (spec === undefined) return { ok: false, code: 'unsupported_provider' };
    const hit = cache.get(provider);
    if (force !== true && hit !== undefined && Date.now() - hit.at < 60000) return hit.data;
    const key = await resolveProviderKey(ctx, spec, provider);
    if (key === undefined) return { ok: false, code: 'no_credential' };
    try {
      const signal = AbortSignal.timeout(TIMEOUT_MS);
      const data =
        spec.kind === 'openrouter'
          ? await readOpenRouterBalance(key, signal)
          : spec.kind === 'opencode-plan'
            ? await readOpenCodePlan(key, signal)
            : await readDeepSeekKeyBalance(key, signal);
      const result = { ok: true, data: { ...data, fetchedAt: Date.now() } };
      cache.set(provider, { at: Date.now(), data: result });
      return result;
    } catch (error) {
      const code = error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : 'fetch_failed';
      return { ok: false, code };
    }
  };
}

function writeJson(res, status, body) {
  if (res.headersSent === true) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function apply(ctx) {
  const readMonth = createMonthReader(ctx);
  const readSessionModels = createSessionModelReader(ctx);
  const readProviderBalance = createProviderBalanceReader(ctx);

  const handler = async (req, res) => {
    if (!isTrustedRequest(req)) {
      writeJson(res, 403, { ok: false, code: 'forbidden' });
      return;
    }
    if (req.method !== 'GET') {
      writeJson(res, 405, { ok: false, code: 'method_not_allowed' });
      return;
    }
    let url;
    try {
      url = new URL(req.url, 'http://127.0.0.1');
    } catch {
      writeJson(res, 400, { ok: false, code: 'invalid_request' });
      return;
    }
    const year = Number.parseInt(url.searchParams.get('year') || '', 10);
    const month = Number.parseInt(url.searchParams.get('month') || '', 10);
    if (!validPeriod(year, month)) {
      writeJson(res, 400, { ok: false, code: 'invalid_period' });
      return;
    }
    try {
      const data = await readMonth(year, month, url.searchParams.get('force') === '1');
      writeJson(res, 200, { ok: true, data });
    } catch (error) {
      const code = error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : 'fetch_failed';
      const status = error !== null && typeof error === 'object' && typeof error.status === 'number' ? error.status : 502;
      console.error('[account-usage] platform usage failed:', { code, status });
      writeJson(res, status, { ok: false, code });
    }
  };


  const modelsHandler = async (req, res) => {
    if (!isTrustedRequest(req)) {
      writeJson(res, 403, { ok: false, code: 'forbidden' });
      return;
    }
    if (req.method !== 'GET') {
      writeJson(res, 405, { ok: false, code: 'method_not_allowed' });
      return;
    }
    let url;
    try {
      url = new URL(req.url, 'http://127.0.0.1');
    } catch {
      writeJson(res, 400, { ok: false, code: 'invalid_request' });
      return;
    }
    const sessionId = url.searchParams.get('sessionId') || '';
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      writeJson(res, 400, { ok: false, code: 'invalid_session' });
      return;
    }
    try {
      const data = await readSessionModels(sessionId);
      if (data.ok !== true) {
        writeJson(res, 404, { ok: false, code: data.code });
        return;
      }
      writeJson(res, 200, {
        ok: true,
        data: { models: data.models, totalTokens: data.totalTokens, lastRoute: data.lastRoute, fetchedAt: data.fetchedAt }
      });
    } catch (error) {
      console.error('[account-usage] session models failed:', { code: 'fetch_failed' });
      writeJson(res, 502, { ok: false, code: 'fetch_failed' });
    }
  };


  const providerBalanceHandler = async (req, res) => {
    if (!isTrustedRequest(req)) {
      writeJson(res, 403, { ok: false, code: 'forbidden' });
      return;
    }
    if (req.method !== 'GET') {
      writeJson(res, 405, { ok: false, code: 'method_not_allowed' });
      return;
    }
    let url;
    try {
      url = new URL(req.url, 'http://127.0.0.1');
    } catch {
      writeJson(res, 400, { ok: false, code: 'invalid_request' });
      return;
    }
    const provider = (url.searchParams.get('provider') || '').toLowerCase();
    if (!PROVIDER_ID_PATTERN.test(provider)) {
      writeJson(res, 400, { ok: false, code: 'invalid_provider' });
      return;
    }
    try {
      const result = await readProviderBalance(provider, url.searchParams.get('force') === '1');
      if (result.ok !== true) {
        const status = result.code === 'unsupported_provider' || result.code === 'no_credential' ? 404 : 502;
        writeJson(res, status, { ok: false, code: result.code });
        return;
      }
      writeJson(res, 200, { ok: true, data: result.data });
    } catch (error) {
      console.error('[account-usage] provider balance failed:', { code: 'fetch_failed' });
      writeJson(res, 502, { ok: false, code: 'fetch_failed' });
    }
  };

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: PROVIDER_BALANCE_ROUTE_PATH,
        handler: providerBalanceHandler
      }),
    'account-usage: provider balance route'
  );

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: MODELS_ROUTE_PATH,
        handler: modelsHandler
      }),
    'account-usage: session models route'
  );

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE_PATH,
        handler
      }),
    'account-usage: platform usage route'
  );

}
