import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const originalFetch = globalThis.fetch;
const originalCaches = globalThis.caches;
const auth = { FINNHUB_TOKEN: 'private-finnhub-value', DASHBOARD_ACCESS_TOKEN: 'private-browser-access', FINNHUB_RATE_LIMITER: { limit: async () => ({ success: true }) } };
const req = (path, options = {}) => new Request('https://example.workers.dev' + path, options);
let entries, calls, wait;
function setup() {
  entries = new Map(); calls = []; wait = [];
  globalThis.caches = { default: {
    match: async (key) => entries.get(key.url)?.clone(),
    put: async (key, value) => { entries.set(key.url, value.clone()); },
  } };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response('{"c":123.45}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}
const ctx = () => ({ waitUntil(p) { wait.push(p); } });
const withAuth = (extra = {}) => ({ headers: { Authorization: 'Bearer private-browser-access', ...extra } });
test.beforeEach(setup);
test.afterEach(() => { globalThis.fetch = originalFetch; globalThis.caches = originalCaches; });

test('health is public, data requires both secrets and bearer authentication', async () => {
  assert.equal((await worker.fetch(req('/health'), auth, ctx())).status, 200);
  assert.equal((await worker.fetch(req('/quote?symbol=AAPL'), auth, ctx())).status, 401);
  assert.equal((await worker.fetch(req('/quote?symbol=AAPL'), { ...auth, DASHBOARD_ACCESS_TOKEN: undefined }, ctx())).status, 503);
  assert.equal((await worker.fetch(req('/quote?symbol=AAPL'), { ...auth, FINNHUB_TOKEN: undefined }, ctx())).status, 503);
  assert.equal(calls.length, 0);
});

test('forwards only quote operation and keeps Finnhub token out of URL and body', async () => {
  const response = await worker.fetch(req('/quote?symbol=aapl', withAuth()), auth, ctx());
  await Promise.all(wait);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Cache'), 'MISS');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://finnhub.io/api/v1/quote?symbol=AAPL');
  assert.equal(calls[0].options.headers['X-Finnhub-Token'], 'private-finnhub-value');
  assert.ok(!(await response.text()).includes('private-finnhub-value'));
});

test('identical authorized requests reuse edge cache', async () => {
  await worker.fetch(req('/quote?symbol=AAPL', withAuth()), auth, ctx());
  await Promise.all(wait);
  const response = await worker.fetch(req('/quote?symbol=AAPL', withAuth()), auth, ctx());
  assert.equal(response.headers.get('X-Cache'), 'HIT');
  assert.equal(calls.length, 1);
});

test('rejects extra params, invalid symbols and arbitrary endpoints', async () => {
  for (const path of ['/quote?symbol=aapl&token=stolen', '/quote?symbol=https://evil.test', '/finnhub?symbol=AAPL', '/financials?symbol=AAPL&freq=invalid', '/financials?symbol=AAPL&from=2026-02-30', '/quote?symbol=AAPL&symbol=MSFT']) {
    assert.ok([400, 404].includes((await worker.fetch(req(path, withAuth()), auth, ctx())).status), path);
  }
  assert.equal(calls.length, 0);
});

test('financials passes only normalized supported arguments', async () => {
  const response = await worker.fetch(req('/financials?symbol=msft&freq=annual&from=2020-01-01&to=2025-01-01', withAuth()), auth, ctx());
  assert.equal(response.status, 200);
  assert.equal(calls[0].url, 'https://finnhub.io/api/v1/stock/financials-reported?symbol=MSFT&freq=annual&from=2020-01-01&to=2025-01-01');
});

test('browser CORS is restricted to dashboard origin', async () => {
  const foreign = await worker.fetch(req('/quote?symbol=AAPL', withAuth({ Origin: 'https://example.org' })), auth, ctx());
  assert.equal(foreign.status, 403);
  assert.equal(calls.length, 0);
  const preflight = await worker.fetch(req('/quote?symbol=AAPL', { method: 'OPTIONS', headers: { Origin: 'https://jaruso.github.io', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } }), auth, ctx());
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://jaruso.github.io');
  assert.equal(preflight.headers.get('Access-Control-Allow-Headers'), 'Authorization');
});

test('rate-limit rejection and upstream errors never expose secrets or cache failures', async () => {
  const denied = { ...auth, FINNHUB_RATE_LIMITER: { limit: async () => ({ success: false }) } };
  assert.equal((await worker.fetch(req('/quote?symbol=AAPL', withAuth()), denied, ctx())).status, 429);
  assert.equal(calls.length, 0);
  globalThis.fetch = async () => new Response('private upstream details', { status: 401 });
  const response = await worker.fetch(req('/quote?symbol=AAPL', withAuth()), auth, ctx());
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes('private upstream details'));
  assert.equal(entries.size, 0);
});

test('POST is not allowed', async () => {
  const response = await worker.fetch(req('/quote?symbol=AAPL', { method: 'POST', ...withAuth() }), auth, ctx());
  assert.equal(response.status, 405);
  assert.equal(calls.length, 0);
});
