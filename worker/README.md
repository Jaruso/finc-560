# FINC-560 Finnhub Worker

Public, tightly scoped Finnhub proxy for the Week 6 company dashboard. GitHub Pages remains static and financial projections remain browser-side. The Finnhub API key is never in GitHub or downloaded by a browser.

## Configure Cloudflare

1. Use the **existing** Cloudflare Worker `finc-560-finnhub` (not a new Worker) with its existing `FINNHUB_TOKEN` **runtime Secret**. `worker/wrangler.jsonc` uses that exact Worker name.
2. You **do not need** `DASHBOARD_ACCESS_TOKEN`. If you already created it in Cloudflare, you can delete it; the code no longer reads it.
3. Under Worker Settings > Builds, connect `Jaruso/finc-560` on `main`, set the root path to `/worker`, leave build command empty, and use `npx wrangler deploy` as the deploy command. If available, use build watch path `worker/**`.
4. After deployment, visit `https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/health` for `{"ok":true}` and visit `.../quote?symbol=AAPL` to verify the configured Finnhub secret and API access. **Never** put the Finnhub token in the URL, JavaScript, GitHub or screenshots.

## Public API

No visitor password, user login or browser authorization header is needed. Only these GET routes exist:

- `/quote?symbol=AAPL`: quote, 60-second edge TTL.
- `/profile?symbol=AAPL`: company profile, 24-hour edge TTL.
- `/metrics?symbol=AAPL`: financial metrics, 1-hour edge TTL.
- `/financials?symbol=AAPL&freq=annual&from=2015-01-01`: as-reported financials, 24-hour edge TTL; `freq=annual|quarterly` and ISO `from/to` dates optional.
- `/news?symbol=AAPL&from=2026-09-01&to=2026-09-30`: recent Finnhub company news, 15-minute edge TTL. Both ISO UTC dates required; maximum 31 days. Returns at most 60 recent entries, with only article ID, headline, summary, publisher, HTTPS source URL, and publication timestamp. News is separate from financial filings: absence or access denial does not affect forecasts. Client displays up to 15 stories, with publisher attribution and direct source links. Entitlements and availability depend on the Finnhub subscription.

All input parameters and paths are allowlisted. Finnhub authentication happens only inside the Worker using `FINNHUB_TOKEN` as a request header. Finnhub errors are returned in sanitized form without upstream body or credentials. Only successful JSON responses are cached on Cloudflare's edge. Cloudflare rate-limit binding caps approximately 20 calls/minute per location (not a global guarantee).

Browser CORS allows `https://jaruso.github.io`; **CORS is not authentication**. Non-browser clients can call these public endpoints and spoof the Origin header, so people can use some of your Finnhub allowance. Keep the rate-limit binding configured and monitor Finnhub usage. The Worker protects the key from normal dashboard visitors, not from anyone with administrative access to your Cloudflare account.

The Equities frontend uses /quote for the latest trading quote (refreshing approximately once per minute while visible), /profile and /financials to normalize source-linked company filings, and /news for the most recent publisher coverage. Annual financial charts and in-browser forecast calculations remain independent of news availability. /metrics remains available to future analysis, but is not requested solely to populate the news feed. Check your Finnhub subscription terms for public display/redistribution rights even for an academic project.

## Local tests

Inside `worker/`: `npm install` then `npm test`. For local `npx wrangler dev`, copy `.dev.vars.example` to `.dev.vars` and supply your own local key. `.dev.vars` and `node_modules` are Git-ignored. Never commit actual keys.

Cloudflare Workers Builds: https://developers.cloudflare.com/workers/ci-cd/builds/
Finnhub API: https://finnhub.io/docs/api/

## Equity forecasting and recent company news

The Equities chart canvas is configurable with eight options, up to four displayed simultaneously. A selected ticker triggers source-backed /profile and /financials requests through the same protected Worker; missing fundamentals only disable charts requiring specific unavailable values. Verified annual statements take priority over older Finnhub filings when necessary. The retired lower research-card section is replaced by company news: /news accepts exactly one symbol and two ISO dates covering no more than 31 days. The browser requests the past 30 calendar days, displays up to 15 attributed articles in descending publication order, updates on ticker changes, supports manual Refresh and checks again after 15 minutes while the page is visible. Headlines and summaries are rendered as plain text, original article links require HTTPS, and publisher reporting is never portrayed as a credit-risk judgment.

News may be empty for particular tickers, or Finnhub may return HTTP 403/429 depending on subscription/usage. Errors are explicit and leave quote and historical financial forecasts unaffected. No new API key, authentication token, premium provider or published personal data are required.

## Runtime diagnostics

If every endpoint returns `503 {"error":"Gateway not configured"}`, open `/health` directly. It now returns status 200 only when BOTH required bindings are attached, and otherwise returns 503 with `checks.finnhubSecretBound` and `checks.rateLimiterBound` booleans. These booleans disclose only whether the binding is present; the Finnhub token value is never exposed. If the secret is missing, open the **existing** `finc-560-finnhub` Worker's **Settings → Variables and Secrets** and ensure the **runtime** secret (not a GitHub/Build variable) is named exactly `FINNHUB_TOKEN`. If the limiter is missing, check that Builds root directory is `worker` and that its deployed `worker/wrangler.jsonc` includes `FINNHUB_RATE_LIMITER`. Cloudflare rate-limit bindings aren't individually shown in the dashboard, so `/health` is the binding check. Do not re-add or publish your actual API token in the repository.

## Protecting runtime configuration across GitHub deployments

Wrangler config sets `keep_vars: true` so dashboard-managed **plaintext environment variables** are not overwritten by `wrangler deploy`. Cloudflare documentation states encrypted secrets should already survive normal deploys; this setting is not itself a guarantee for missing/misattached secrets. We also declare `secrets.required: ["FINNHUB_TOKEN"]`, which makes supported Wrangler deployments fail early if the encrypted runtime secret is not attached. This prevents a successful-looking deploy that later returns 503 due to a missing key. It does not store the token in the repository or Workers Builds' **build-time** variables. Attach FINNHUB_TOKEN via the existing production Worker's **Settings → Variables and Secrets → Add → Secret**; confirm the Worker name is `finc-560-finnhub` and use the `/health` endpoint to verify both required runtime bindings. If the secret appears to disappear after a successful deploy despite this configuration, inspect production Worker Versions/Deployments and Builds (especially whether the dashboard created a new version rather than attaching the secret to the current deployment) rather than repeatedly committing the key.

## Rate limiting and diagnostics

A response with status `429` can come from the Cloudflare gateway (`source: gateway`) or Finnhub (`source: provider`). The frontend distinguishes these and advises waiting before retrying rather than incorrectly reporting that the issuer has no financial history. Cloudflare's limiter now applies **only to uncached, validated upstream Finnhub requests**; repeat successful requests that hit the Cloudflare edge cache don't consume the 20/m per-location gateway budget. Successful annual financial statements are cached for 24 hours on a best-effort per-data-center basis. A browser cache is deliberately disabled; upstream 403/429/502 failures are never cached. An empty data array is different from a rejected request. The source IP/geography may cause different cache hit rates across clients. This limit remains protective and is not global provider quota accounting.
