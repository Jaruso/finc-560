import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const originalFetch = globalThis.fetch;
const originalCaches = globalThis.caches;
const env = { FINNHUB_TOKEN: 'private-finnhub-value', FINNHUB_RATE_LIMITER: { limit: async () => ({ success: true }) } };
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
const withHeaders = (extra = {}) => ({ headers: extra });
test.beforeEach(setup);
test.afterEach(() => { globalThis.fetch = originalFetch; globalThis.caches = originalCaches; });

test('health and quotes are public; Finnhub secret and rate limiting remain mandatory', async () => {
  const healthy = await worker.fetch(req('/health'), env, ctx());
  assert.equal(healthy.status, 200);
  assert.deepEqual(await healthy.json(), { ok: true, release: 'company-news-20261001', checks: {
    finnhubSecretBound: true, rateLimiterBound: true,
  } });
  assert.equal((await worker.fetch(req('/quote?symbol=AAPL'), { ...env, FINNHUB_TOKEN: undefined }, ctx())).status, 503);
  assert.equal((await worker.fetch(req('/quote?symbol=AAPL'), { ...env, FINNHUB_RATE_LIMITER: undefined }, ctx())).status, 503);
  assert.equal(calls.length, 0);
  assert.equal((await worker.fetch(req('/quote?symbol=AAPL'), env, ctx())).status, 200);
  assert.equal(calls.length, 1);
});

test('health identifies only missing binding names and never exposes token values', async () => {
  const noSecret = await worker.fetch(req('/health'), { ...env, FINNHUB_TOKEN: undefined }, ctx());
  assert.equal(noSecret.status, 503);
  assert.deepEqual(await noSecret.json(), { ok: false, release: 'company-news-20261001', checks: {
    finnhubSecretBound: false, rateLimiterBound: true,
  } });
  const noLimiter = await worker.fetch(req('/health'), { ...env, FINNHUB_RATE_LIMITER: undefined }, ctx());
  assert.equal(noLimiter.status, 503);
  assert.deepEqual(await noLimiter.json(), { ok: false, release: 'company-news-20261001', checks: {
    finnhubSecretBound: true, rateLimiterBound: false,
  } });
  const empty = await worker.fetch(req('/health'), {}, ctx());
  assert.equal(empty.status, 503);
  assert.ok(!(await empty.text()).includes('private-finnhub-value'));
  assert.equal(calls.length, 0);
});

test('forwards only quote operation and keeps Finnhub token out of URL and body', async () => {
  const response = await worker.fetch(req('/quote?symbol=aapl', withHeaders()), env, ctx());
  await Promise.all(wait);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Cache'), 'MISS');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://finnhub.io/api/v1/quote?symbol=AAPL');
  assert.equal(calls[0].options.headers['X-Finnhub-Token'], 'private-finnhub-value');
  assert.ok(!(await response.text()).includes('private-finnhub-value'));
});

test('identical public requests reuse edge cache', async () => {
  await worker.fetch(req('/quote?symbol=AAPL', withHeaders()), env, ctx());
  await Promise.all(wait);
  const response = await worker.fetch(req('/quote?symbol=AAPL', withHeaders()), env, ctx());
  assert.equal(response.headers.get('X-Cache'), 'HIT');
  assert.equal(calls.length, 1);
});

test('edge-cache hits bypass gateway rate limiting without bypassing secret validation', async () => {
  let counter = 0;
  const limited = { ...env, FINNHUB_RATE_LIMITER: { limit: async () => {
    counter++;
    return { success: counter === 1 };
  } } };
  const first = await worker.fetch(req('/quote?symbol=AAPL'), limited, ctx());
  await Promise.all(wait);
  const second = await worker.fetch(req('/quote?symbol=AAPL'), limited, ctx());
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.headers.get('X-Cache'), 'HIT');
  assert.equal(counter, 1, 'Only upstream cache misses count toward provider request budget');
  assert.equal(calls.length, 1);
  assert.equal((await worker.fetch(req('/quote?symbol=AAPL'),
    { ...limited, FINNHUB_TOKEN: undefined }, ctx())).status, 503);
});

test('rejects extra params, invalid symbols and arbitrary endpoints', async () => {
  for (const path of ['/quote?symbol=aapl&token=stolen', '/quote?symbol=https://evil.test', '/finnhub?symbol=AAPL', '/financials?symbol=AAPL&freq=invalid', '/financials?symbol=AAPL&from=2026-02-30', '/quote?symbol=AAPL&symbol=MSFT']) {
    assert.ok([400, 404].includes((await worker.fetch(req(path, withHeaders()), env, ctx())).status), path);
  }
  assert.equal(calls.length, 0);
});

test('financials passes only normalized supported arguments', async () => {
  const response = await worker.fetch(req('/financials?symbol=msft&freq=annual&from=2020-01-01&to=2025-01-01', withHeaders()), env, ctx());
  assert.equal(response.status, 200);
  assert.equal(calls[0].url, 'https://finnhub.io/api/v1/stock/financials-reported?symbol=MSFT&freq=annual&from=2020-01-01&to=2025-01-01');
});


test('news permits only 31-day valid ranges and never exposes the token to clients', async () => {
  const invalid = [
    '/news?symbol=MSFT',
    '/news?symbol=MSFT&from=2026-09-01',
    '/news?symbol=MSFT&from=2026-09-01&to=2026-10-03',
    '/news?symbol=MSFT&from=2026-02-30&to=2026-03-01',
    '/news?symbol=MSFT&from=2026-09-30&to=2026-09-01',
    '/news?symbol=MSFT&from=2026-09-01&to=2026-09-30&category=crypto',
    '/news?symbol=MSFT&from=2026-09-01&from=2026-09-02&to=2026-09-30',
  ];
  for(const path of invalid){
    const r=await worker.fetch(req(path),env,ctx());
    assert.equal(r.status,400,path);
  }
  assert.equal(calls.length,0);
  globalThis.fetch = async(url,options)=>{
    calls.push({url,options});
    return new Response(JSON.stringify([
      {id:2,headline:'Later earnings update',source:'Publisher A',
        summary:'Profit and cash-flow update.',url:'https://news.example/item2',
        datetime:1790784000,image:'https://tracker.example/track',sensitive:'do not send'},
      {id:1,headline:'Earlier company coverage',source:'Publisher B',summary:'',
        url:'https://news.example/item1',datetime:1790697600},
      {headline:'Dangerous link',source:'Publisher',url:'javascript:alert(1)',datetime:1790784000},
    ]),{status:200});
  };
  const result=await worker.fetch(req('/news?symbol=msft&from=2026-09-01&to=2026-09-30'),env,ctx());
  assert.equal(result.status,200);
  assert.equal(calls[0].url,
    'https://finnhub.io/api/v1/company-news?symbol=MSFT&from=2026-09-01&to=2026-09-30');
  assert.equal(calls[0].options.headers['X-Finnhub-Token'],'private-finnhub-value');
  assert.ok(!calls[0].url.includes('private-finnhub-value'));
  const items=await result.json();
  assert.equal(items.length,2);
  assert.equal(items[0].headline,'Later earnings update');
  assert.equal(items[0].image,undefined);
  assert.equal(items[0].sensitive,undefined);
  assert.ok(!(JSON.stringify(items)).includes('private-finnhub-value'));
  await Promise.all(wait);
  const cacheValues=[...entries.values()];
  assert.equal(cacheValues[0].headers.get('Cache-Control'),'public, max-age=900');
  const repeat=await worker.fetch(req('/news?symbol=MSFT&from=2026-09-01&to=2026-09-30'),env,ctx());
  assert.equal(repeat.headers.get('X-Cache'),'HIT');
  assert.equal(calls.length,1);
});

test('news fails closed on unexpected Finnhub responses, including 200 error objects', async()=>{
  globalThis.fetch=async()=>new Response(JSON.stringify({error:'Not permitted'}),{status:200});
  const r=await worker.fetch(req('/news?symbol=AAPL&from=2026-09-01&to=2026-09-30'),env,ctx());
  assert.equal(r.status,502);
  assert.equal(entries.size,0);
  assert.equal((await r.json()).error,'Invalid Finnhub response');
});

test('browser CORS is restricted to dashboard origin', async () => {
  const foreign = await worker.fetch(req('/quote?symbol=AAPL', withHeaders({ Origin: 'https://example.org' })), env, ctx());
  assert.equal(foreign.status, 403);
  assert.equal(calls.length, 0);
  const preflight = await worker.fetch(req('/quote?symbol=AAPL', { method: 'OPTIONS', headers: { Origin: 'https://jaruso.github.io', 'Access-Control-Request-Method': 'GET' } }), env, ctx());
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://jaruso.github.io');
  assert.equal(preflight.headers.get('Access-Control-Allow-Headers'), null);
  const forbiddenHeaders = await worker.fetch(req('/quote?symbol=AAPL', { method: 'OPTIONS', headers: { Origin: 'https://jaruso.github.io', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } }), env, ctx());
  assert.equal(forbiddenHeaders.status, 403);
});

test('rate-limit rejection and upstream errors never expose secrets or cache failures', async () => {
  const denied = { ...env, FINNHUB_RATE_LIMITER: { limit: async () => ({ success: false }) } };
  const blocked = await worker.fetch(req('/quote?symbol=AAPL', withHeaders()), denied, ctx());
  assert.equal(blocked.status, 429);
  assert.deepEqual(await blocked.json(), { error: 'Too many requests', source: 'gateway' });
  assert.equal(calls.length, 0);
  globalThis.fetch = async () => new Response('private upstream details', { status: 401 });
  const response = await worker.fetch(req('/quote?symbol=AAPL', withHeaders()), env, ctx());
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes('private upstream details'));
  assert.equal(entries.size, 0);
});


test('distinguishes provider quota from gateway throttling', async () => {
  globalThis.fetch = async () => new Response('Upstream sensitive response', {
    status: 429, headers: { 'Retry-After': '30' },
  });
  const r = await worker.fetch(req('/financials?symbol=NVDA'), env, ctx());
  assert.equal(r.status, 429);
  assert.deepEqual(await r.json(), { error: 'Finnhub rejected the request',
    source: 'provider', upstreamStatus: 429 });
  assert.equal(r.headers.get('Retry-After'), '30');
  assert.equal(entries.size, 0, 'Do not cache upstream quota failures');
});

test('POST is not allowed', async () => {
  const response = await worker.fetch(req('/quote?symbol=AAPL', { method: 'POST', ...withHeaders() }), env, ctx());
  assert.equal(response.status, 405);
  assert.equal(calls.length, 0);
});
