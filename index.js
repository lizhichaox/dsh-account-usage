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

function writeJson(res, status, body) {
  if (res.headersSent === true) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function apply(ctx) {
  const readMonth = createMonthReader(ctx);

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
