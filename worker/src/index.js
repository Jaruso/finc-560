// FINC-560 Finnhub gateway. Keep all secrets out of GitHub and GitHub Pages.
const DASHBOARD_ORIGIN = 'https://jaruso.github.io';
const ROUTES = Object.freeze({
  quote: { path: '/quote', ttl: 60 },
  profile: { path: '/stock/profile2', ttl: 86400 },
  metrics: { path: '/stock/metric', ttl: 3600 },
  financials: { path: '/stock/financials-reported', ttl: 86400 },
});

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

function corsFor(origin) {
  return origin === DASHBOARD_ORIGIN
    ? { 'Access-Control-Allow-Origin': DASHBOARD_ORIGIN, Vary: 'Origin' }
    : {};
}

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + 'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function parseParams(url, route) {
  const allowed = route === 'financials'
    ? new Set(['symbol', 'freq', 'from', 'to'])
    : new Set(['symbol']);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) return null;
  }
  const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
  if (!/^[A-Z0-9.^_-]{1,15}$/.test(symbol)) return null;
  const params = new URLSearchParams({ symbol });
  if (route === 'metrics') params.set('metric', 'all');
  if (route === 'financials') {
    const freq = url.searchParams.get('freq') || 'annual';
    if (!['annual', 'quarterly'].includes(freq)) return null;
    params.set('freq', freq);
    for (const key of ['from', 'to']) {
      const value = url.searchParams.get(key);
      if (value !== null) {
        if (!isValidDate(value)) return null;
        params.set(key, value);
      }
    }
    if (params.has('from') && params.has('to') && params.get('from') > params.get('to')) return null;
  }
  return params;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (origin && origin !== DASHBOARD_ORIGIN) return json({ error: 'Origin not allowed' }, 403);
    const cors = corsFor(origin);

    if (request.method === 'OPTIONS') {
      if (origin !== DASHBOARD_ORIGIN || request.headers.get('Access-Control-Request-Method') !== 'GET') {
        return json({ error: 'Preflight not allowed' }, 403);
      }
      const wanted = (request.headers.get('Access-Control-Request-Headers') || '').toLowerCase().trim();
      if (wanted !== 'authorization') return json({ error: 'Preflight headers not allowed' }, 403, cors);
      return new Response(null, {
        status: 204,
        headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Authorization', 'Access-Control-Max-Age': '300', 'Cache-Control': 'no-store' },
      });
    }
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, { ...cors, Allow: 'GET, OPTIONS' });
    if (url.pathname === '/health') return json({ ok: true }, 200, cors);

    const route = url.pathname.slice(1);
    const config = ROUTES[route];
    if (!config) return json({ error: 'Unknown endpoint' }, 404, cors);
    if (url.toString().length > 512) return json({ error: 'Request too long' }, 414, cors);

    // Fail closed: a public Worker must not serve anonymous Finnhub requests.
    if (!env.FINNHUB_TOKEN || !env.DASHBOARD_ACCESS_TOKEN || !env.FINNHUB_RATE_LIMITER?.limit) {
      return json({ error: 'Gateway not configured' }, 503, cors);
    }
    if (request.headers.get('Authorization') !== 'Bearer ' + env.DASHBOARD_ACCESS_TOKEN) {
      return json({ error: 'Unauthorized' }, 401, { ...cors, 'WWW-Authenticate': 'Bearer' });
    }
    const params = parseParams(url, route);
    if (!params) return json({ error: 'Invalid ticker or query parameters' }, 400, cors);

    // Cloudflare rate-limit binding is local to each location, not global accounting.
    const { success } = await env.FINNHUB_RATE_LIMITER.limit({ key: 'finc-560-personal' });
    if (!success) return json({ error: 'Too many requests' }, 429, { ...cors, 'Retry-After': '60' });

    // Normalize cache keys. Neither browser access token nor Finnhub key is cached.
    const cacheUrl = new URL(url.origin);
    cacheUrl.pathname = url.pathname;
    cacheUrl.search = params.toString();
    const cacheKey = new Request(cacheUrl.toString());
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      const body = await cached.text();
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Cache': 'HIT', ...cors } });
    }

    const upstreamUrl = new URL('https://finnhub.io/api/v1' + config.path);
    upstreamUrl.search = params.toString();
    let upstream;
    try {
      upstream = await fetch(upstreamUrl.toString(), {
        method: 'GET',
        headers: { 'X-Finnhub-Token': env.FINNHUB_TOKEN, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      return json({ error: 'Finnhub temporarily unavailable' }, 502, cors);
    }
    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : upstream.status === 403 ? 403 : 502;
      return json({ error: 'Finnhub rejected the request', upstreamStatus: upstream.status }, status, {
        ...cors,
        ...(status === 429 ? { 'Retry-After': upstream.headers.get('Retry-After') || '60' } : {}),
      });
    }
    let payload;
    try {
      payload = await upstream.text();
      if (payload.length > 5_000_000) throw new Error('Oversized payload');
      JSON.parse(payload);
    } catch {
      return json({ error: 'Invalid Finnhub response' }, 502, cors);
    }
    const edgeResponse = new Response(payload, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=' + config.ttl },
    });
    ctx.waitUntil(cache.put(cacheKey, edgeResponse).catch(() => {}));
    // Do not store authorized requests or their payloads in the browser cache.
    return new Response(payload, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Cache': 'MISS', ...cors },
    });
  },
};
