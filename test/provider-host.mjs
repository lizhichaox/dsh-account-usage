import assert from 'node:assert/strict';
import test from 'node:test';
import { apply } from '../index.js';

// Exercise the real apply()/HTTP handler boundary without a server, network, or
// credential store. Only a deliberately fake placeholder ever reaches fetch.
const PLACEHOLDER = 'test-only-placeholder';
const BALANCE_PATH = '/account-usage/provider/balance';
const DEEPSEEK_URL = 'https://api.deepseek.com/user/balance';
const OPENCODE_URL = 'https://opencode.ai/zen/go/v1/usage';
const CREDITS_URL = 'https://openrouter.ai/api/v1/credits';
const KEY_URL = 'https://openrouter.ai/api/v1/key';
const allowedUrls = new Set([DEEPSEEK_URL, OPENCODE_URL, CREDITS_URL, KEY_URL]);
const json = (payload, status = 200) => ({ status, text: async () => JSON.stringify(payload) });
const balance = (remaining = 24) => json({ balance_infos: [{ total_balance: String(remaining), granted_balance: '2', currency: 'CNY' }] });
const plan = () => json({ usage: { rolling: { percent: 12.34 }, weekly: { percent: 30 }, monthly: { percent: 60 } } });
const namedError = (name) => Object.assign(new Error('simulated failure'), { name });
const credentials = () => ({ resolve: async () => ({ value: PLACEHOLDER }) });

async function withHarness(options, run) {
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  const controller = new AbortController();
  const calls = [];
  const routes = new Map();
  const disposers = [];
  const lookup = [];
  globalThis.fetch = async (url, init) => {
    assert.ok(allowedUrls.has(url), 'only an explicitly mocked official URL is requested');
    assert.equal(init.redirect, 'manual', 'credential-bearing requests never follow redirects');
    assert.equal(init.headers.authorization, 'Bearer ' + PLACEHOLDER, 'only the synthetic placeholder is used');
    assert.equal(init.signal, controller.signal, 'headers and body share the request deadline');
    calls.push(url);
    assert.equal(typeof options.fetch, 'function', 'unexpected fetch is forbidden');
    return options.fetch(url, init, controller);
  };
  AbortSignal.timeout = (milliseconds) => {
    assert.equal(milliseconds, 15000);
    return controller.signal;
  };
  try {
    apply({
      get(name) {
        lookup.push(name);
        assert.equal(name, 'credentials', 'provider requests do not read account/session services');
        return options.credentials;
      },
      effect(setup) { disposers.push(setup()); },
      webServer: {
        register(route) {
          assert.equal(route.kind, 'exact');
          assert.ok(!routes.has(route.path));
          routes.set(route.path, route.handler);
          return () => routes.delete(route.path);
        }
      }
    });
    assert.equal(routes.size, 3, 'apply registers all three routes via effects');
    const request = async (provider, overrides = {}) => {
      let response;
      const req = {
        method: 'GET',
        url: BALANCE_PATH + '?provider=' + encodeURIComponent(provider),
        headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'same-origin' },
        socket: { remoteAddress: '127.0.0.1' },
        ...overrides
      };
      await routes.get(BALANCE_PATH)(req, {
        headersSent: false,
        writeHead(status, headers) { response = { status, headers }; },
        end(text) {
          assert.ok(!text.includes(PLACEHOLDER), 'credentials never enter a route response');
          response.body = JSON.parse(text);
        }
      });
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
      return response;
    };
    await run({ request, calls, lookup });
  } finally {
    for (const dispose of disposers.reverse()) dispose();
    assert.equal(routes.size, 0, 'effect disposers remove every registered route');
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
  }
}

function expectError(response, code, status = 502) {
  assert.equal(response.status, status);
  assert.deepEqual(response.body, { ok: false, code });
}

// Subtests intentionally run serially: fetch and AbortSignal are restored after
// each case. No external HTTP request is possible even if an assertion fails.
test('provider Host apply/route contract', async (t) => {
  await t.test('all aliases preserve their requested identity and have independent caches', async () => {
    const providers = ['deepseek', 'deepseek-api', 'deepseek-api-key', 'opencode', 'opencode-go', 'opencode-zen'];
    const refs = [];
    const records = [];
    await withHarness({
      credentials: {
        async resolve(ref) { refs.push(ref); return undefined; },
        async readRecord(key) { records.push(key); return { kind: 'api-key', key: PLACEHOLDER }; }
      },
      fetch: async (url) => url === DEEPSEEK_URL ? balance() : plan()
    }, async ({ request, calls }) => {
      const first = await Promise.all(providers.map((provider) => request(provider)));
      for (const [i, result] of first.entries()) {
        assert.equal(result.status, 200);
        assert.equal(result.body.ok, true);
        assert.equal(result.body.data.provider, providers[i], 'canonical endpoint ids never overwrite the requested alias');
        assert.ok(Number.isFinite(result.body.data.fetchedAt));
        assert.equal(result.body.data.kind, i < 3 ? 'deepseek' : 'opencode-plan');
      }
      assert.equal(new Set(first.map((result) => result.body.data.provider)).size, 6, 'no alias result collisions');
      assert.equal(calls.length, 6);
      assert.deepEqual(records, providers.map((provider) => 'llm-pi-ai/' + provider));
      assert.deepEqual(refs, ['DEEPSEEK_API_KEY', 'DEEPSEEK_API_KEY', 'DEEPSEEK_API_KEY', 'OPENCODE_API_KEY', 'OPENCODE_GO_API_KEY', 'OPENCODE_API_KEY']);
      for (const [i, provider] of providers.entries()) assert.deepEqual(await request(provider), first[i]);
      assert.equal(calls.length, 6, 'each exact provider uses its own cached result');
      await request('deepseek-api', { url: BALANCE_PATH + '?provider=deepseek-api&force=1' });
      assert.equal(calls.length, 7, 'force refresh bypasses only the requested cache');
    });
  });

  await t.test('individual requests retain partial successes without cross-provider failure', async () => {
    await withHarness({
      credentials: credentials(),
      fetch: async (url) => url === DEEPSEEK_URL ? balance(18) : json({}, 401)
    }, async ({ request }) => {
      const [success, failure, unsupported] = await Promise.all([
        request('deepseek-api-key'), request('opencode-zen'), request('google')
      ]);
      assert.equal(success.body.data.remaining, 18);
      assert.equal(success.body.data.provider, 'deepseek-api-key');
      expectError(failure, 'auth_failed');
      expectError(unsupported, 'unsupported_provider', 404);
      assert.deepEqual(await request('deepseek-api-key'), success, 'failure cannot discard another provider cache');
    });
  });

  await t.test('guards reject requests before credentials or network', async () => {
    await withHarness({}, async ({ request, calls, lookup }) => {
      expectError(await request('deepseek', { socket: { remoteAddress: '192.0.2.1' } }), 'forbidden', 403);
      expectError(await request('deepseek', { headers: { host: 'example.invalid' } }), 'forbidden', 403);
      expectError(await request('deepseek', { headers: { host: '127.0.0.1:3000', origin: 'https://example.invalid' } }), 'forbidden', 403);
      expectError(await request('deepseek', { headers: { host: '127.0.0.1:3000', 'sec-fetch-site': 'cross-site' } }), 'forbidden', 403);
      expectError(await request('deepseek', { method: 'POST' }), 'method_not_allowed', 405);
      expectError(await request('../deepseek'), 'invalid_provider', 400);
      expectError(await request('constructor'), 'unsupported_provider', 404);
      assert.equal(calls.length, 0);
      assert.equal(lookup.length, 0);
    });
  });

  await t.test('missing service, absent/blank keys and non-api records mean no credential', async () => {
    for (const store of [undefined, {}, { resolve: async () => undefined, readRecord: async () => undefined },
      { resolve: async () => ({ value: '   ' }), readRecord: async () => ({ kind: 'api-key', key: '' }) },
      { resolve: async () => undefined, readRecord: async () => ({ kind: 'grant', payload: {} }) }]) {
      await withHarness({ credentials: store }, async ({ request, calls }) => {
        expectError(await request('deepseek-api'), 'no_credential', 404);
        assert.equal(calls.length, 0);
      });
    }
  });

  await t.test('resolve failure still attempts the provider-specific record fallback', async () => {
    const records = [];
    await withHarness({
      credentials: {
        async resolve() { throw new Error('store failure ' + PLACEHOLDER); },
        async readRecord(key) { records.push(key); return { kind: 'api-key', key: PLACEHOLDER }; }
      },
      fetch: async () => balance()
    }, async ({ request }) => {
      assert.equal((await request('deepseek-api')).body.ok, true);
      assert.deepEqual(records, ['llm-pi-ai/deepseek-api']);
    });
  });

  await t.test('unreadable credential stores are not reported as unconfigured', async () => {
    const fail = async () => { throw new Error('store failure ' + PLACEHOLDER); };
    for (const store of [
      { resolve: fail, readRecord: async () => undefined },
      { resolve: async () => undefined, readRecord: fail },
      { resolve: fail, readRecord: fail },
      { resolve: fail }
    ]) {
      await withHarness({ credentials: store }, async ({ request, calls }) => {
        expectError(await request('deepseek'), 'credential_failed');
        assert.equal(calls.length, 0);
      });
    }
  });

  await t.test('valid resolved key does not consult an unavailable fallback', async () => {
    await withHarness({
      credentials: { ...credentials(), readRecord: async () => assert.fail('unneeded fallback') },
      fetch: async () => balance(0)
    }, async ({ request }) => {
      assert.equal((await request('deepseek')).body.data.remaining, 0, 'reported zero is retained');
    });
  });

  await t.test('authentication, HTTP and malformed payload errors remain typed', async () => {
    const cases = [
      [() => json({}, 401), 'auth_failed'], [() => json({}, 403), 'auth_failed'],
      [() => json({}, 500), 'invalid_response'], [() => json({}, 302), 'invalid_response'],
      [() => ({ status: 200, text: async () => '<html>error</html>' }), 'invalid_response'],
      [() => json({ balance_infos: [{ total_balance: null }] }), 'invalid_response'],
      [() => json({ balance_infos: [{ total_balance: '' }] }), 'invalid_response'],
      [() => json({ balance_infos: [{ total_balance: 'not-a-number' }] }), 'invalid_response'],
      [() => ({ status: 200, text: async () => 'x'.repeat(262145) }), 'invalid_response'],
      [() => { throw new TypeError('network ' + PLACEHOLDER); }, 'fetch_failed'],
      [() => ({ status: 200, text: async () => { throw new Error('body failure'); } }), 'fetch_failed']
    ];
    for (const [fetch, code] of cases) {
      await withHarness({ credentials: credentials(), fetch }, async ({ request }) => {
        expectError(await request('deepseek'), code);
      });
    }
  });

  await t.test('timeout during headers or response.text stays timeout', async () => {
    for (const provider of ['deepseek-api-key', 'opencode', 'openrouter']) {
      for (const name of ['TimeoutError', 'AbortError']) {
        for (const phase of ['headers', 'body']) {
          await withHarness({
            credentials: credentials(),
            fetch: async () => {
              if (phase === 'headers') throw namedError(name);
              return { status: 200, text: async () => { throw namedError(name); } };
            }
          }, async ({ request, calls }) => {
            expectError(await request(provider), 'timeout');
            assert.equal(calls.length, 1, 'expired deadline does not attempt OpenRouter fallback');
          });
        }
      }
    }
    await withHarness({
      credentials: credentials(),
      fetch: async (_url, _init, controller) => ({ status: 200, text: async () => {
        controller.abort();
        throw new TypeError('body aborted');
      } })
    }, async ({ request }) => expectError(await request('deepseek'), 'timeout'));
  });

  await t.test('OpenRouter complete credits have account scope (including explicit zero usage)', async () => {
    for (const used of [0, 7.5]) {
      await withHarness({
        credentials: credentials(), fetch: async () => json({ data: { total_credits: '50', total_usage: used } })
      }, async ({ request, calls }) => {
        const response = await request('openrouter');
        assert.equal(response.body.data.scope, 'account');
        assert.equal(response.body.data.remaining, 50 - used);
        assert.equal(response.body.data.used, used);
        assert.equal(response.body.data.total, 50);
        assert.deepEqual(calls, [CREDITS_URL]);
      });
    }
  });

  await t.test('OpenRouter absent/invalid credits usage falls back instead of inflating balance', async () => {
    for (const usage of [undefined, null, '', 'invalid']) {
      await withHarness({
        credentials: credentials(),
        fetch: async (url) => url === CREDITS_URL
          ? json({ data: { total_credits: 900, total_usage: usage } })
          : json({ data: { usage: 4, limit: 10, limit_remaining: 6 } })
      }, async ({ request, calls }) => {
        const response = await request('openrouter');
        assert.equal(response.body.data.scope, 'key');
        assert.equal(response.body.data.remaining, 6);
        assert.equal(response.body.data.used, 4);
        assert.ok(!Object.hasOwn(response.body.data, 'total'), 'account total never mixes with per-key spending');
        assert.deepEqual(calls, [CREDITS_URL, KEY_URL]);
      });
    }
  });

  await t.test('OpenRouter credits denial or malformed JSON can use key fallback', async () => {
    for (const first of [() => json({}, 403), () => ({ status: 200, text: async () => 'invalid' })]) {
      await withHarness({
        credentials: credentials(),
        fetch: async (url) => url === CREDITS_URL ? first() : json({ data: { limit: 20, usage: 5 } })
      }, async ({ request }) => {
        const response = await request('openrouter');
        assert.equal(response.body.data.scope, 'key');
        assert.equal(response.body.data.remaining, 15);
      });
    }
  });

  await t.test('OpenRouter key usage alone is partial data, not a fabricated remaining balance', async () => {
    await withHarness({
      credentials: credentials(),
      fetch: async (url) => url === CREDITS_URL ? json({ data: { total_credits: 900 } }) : json({ data: { usage: 3, limit: null } })
    }, async ({ request }) => {
      const response = await request('openrouter');
      assert.equal(response.body.ok, true);
      assert.equal(response.body.data.scope, 'key');
      assert.equal(response.body.data.used, 3);
      assert.ok(!Object.hasOwn(response.body.data, 'remaining'));
    });
  });

  await t.test('OpenRouter incomplete credits and invalid key response fail explicitly', async () => {
    await withHarness({
      credentials: credentials(), fetch: async () => json({ data: { total_credits: 900 } })
    }, async ({ request }) => expectError(await request('openrouter'), 'invalid_response'));
    await withHarness({
      credentials: credentials(), fetch: async () => json({}, 401)
    }, async ({ request }) => expectError(await request('openrouter'), 'auth_failed'));
  });

  await t.test('OpenRouter key-body timeout is not disguised as a network failure', async () => {
    await withHarness({
      credentials: credentials(),
      fetch: async (url) => url === CREDITS_URL ? json({}, 403) : {
        status: 200, text: async () => { throw namedError('AbortError'); }
      }
    }, async ({ request, calls }) => {
      expectError(await request('openrouter'), 'timeout');
      assert.deepEqual(calls, [CREDITS_URL, KEY_URL]);
    });
  });

  await t.test('openai/anthropic unsupported without reading credentials or requesting costs', async () => {
    for (const store of [undefined, credentials(), {
      resolve: async () => assert.fail('unsupported provider must not resolve credentials'),
      readRecord: async () => assert.fail('unsupported provider must not read stored keys')
    }]) {
      await withHarness({ credentials: store }, async ({ request, calls, lookup }) => {
        for (const provider of ['openai', 'anthropic']) {
          expectError(await request(provider), 'unsupported_provider', 404);
          expectError(await request(provider, { url: BALANCE_PATH + '?provider=' + provider + '&force=1' }), 'unsupported_provider', 404);
        }
        assert.equal(lookup.length, 0, 'balance-only unsupported paths never access the credential service');
        assert.equal(calls.length, 0, 'normal and forced requests never call organization costs or any external endpoint');
      });
    }
  });

  await t.test('a failed refresh never poisons another alias or caches an error as success', async () => {
    let attempt = 0;
    await withHarness({
      credentials: credentials(),
      fetch: async () => ++attempt === 1 ? json({}, 401) : balance(11)
    }, async ({ request, calls }) => {
      expectError(await request('deepseek-api'), 'auth_failed');
      const result = await request('deepseek-api');
      assert.equal(result.body.data.remaining, 11);
      assert.equal(result.body.data.provider, 'deepseek-api');
      assert.equal(calls.length, 2, 'typed failures remain retryable');
    });
  });
});
