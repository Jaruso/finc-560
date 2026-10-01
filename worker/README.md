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

All input parameters and paths are allowlisted. Finnhub authentication happens only inside the Worker using `FINNHUB_TOKEN` as a request header. Finnhub errors are returned in sanitized form without upstream body or credentials. Only successful JSON responses are cached on Cloudflare's edge. Cloudflare rate-limit binding caps approximately 20 calls/minute per location (not a global guarantee).

Browser CORS allows `https://jaruso.github.io`; **CORS is not authentication**. Non-browser clients can call these public endpoints and spoof the Origin header, so people can use some of your Finnhub allowance. Keep the rate-limit binding configured and monitor Finnhub usage. The Worker protects the key from normal dashboard visitors, not from anyone with administrative access to your Cloudflare account.

The Equities frontend now uses the /quote route to display a clearly separated latest market quote, refreshing approximately once a minute while visible; published annual statements and browser-side forecasts remain untouched. The other endpoints are available to future integrations but are not used by this dashboard yet. Check your Finnhub subscription terms for public display/redistribution rights even for an academic project.

## Local tests

Inside `worker/`: `npm install` then `npm test`. For local `npx wrangler dev`, copy `.dev.vars.example` to `.dev.vars` and supply your own local key. `.dev.vars` and `node_modules` are Git-ignored. Never commit actual keys.

Cloudflare Workers Builds: https://developers.cloudflare.com/workers/ci-cd/builds/
Finnhub API: https://finnhub.io/docs/api/

## Three-panel research integration

The Equities dashboard now starts parallel /profile, /metrics and /financials requests for each selected valid ticker; /quote remains independently refreshed. New USD US tickers are entered through the Analyze form. Responses never contain FINNHUB_TOKEN. It normalizes only explicitly supported as-reported USD US-GAAP annual 10-K concepts, deduplicating amendments, and requires five complete annual filings before enabling legacy CAGR/OLS forecasts. Curated verified snapshots remain if Finnhub fails or returns an older/incomplete statement history. The separate corporate financial resilience, Treasury-linked interest stress and simplified FCFF sensitivity panels are for analytical decision support, not price targets. Credit spread and exposed debt are **assumptions**. The existing Macro dashboard provides dated modeled baseline Treasury yields, not observed refinancing costs. Missing fields disable unsupported ratios/charts.

## Runtime diagnostics

If every endpoint returns `503 {"error":"Gateway not configured"}`, open `/health` directly. It now returns status 200 only when BOTH required bindings are attached, and otherwise returns 503 with `checks.finnhubSecretBound` and `checks.rateLimiterBound` booleans. These booleans disclose only whether the binding is present; the Finnhub token value is never exposed. If the secret is missing, open the **existing** `finc-560-finnhub` Worker's **Settings → Variables and Secrets** and ensure the **runtime** secret (not a GitHub/Build variable) is named exactly `FINNHUB_TOKEN`. If the limiter is missing, check that Builds root directory is `worker` and that its deployed `worker/wrangler.jsonc` includes `FINNHUB_RATE_LIMITER`. Cloudflare rate-limit bindings aren't individually shown in the dashboard, so `/health` is the binding check. Do not re-add or publish your actual API token in the repository.

## Protecting runtime configuration across GitHub deployments

Wrangler config sets `keep_vars: true` so dashboard-managed **plaintext environment variables** are not overwritten by `wrangler deploy`. Cloudflare documentation states encrypted secrets should already survive normal deploys; this setting is not itself a guarantee for missing/misattached secrets. We also declare `secrets.required: ["FINNHUB_TOKEN"]`, which makes supported Wrangler deployments fail early if the encrypted runtime secret is not attached. This prevents a successful-looking deploy that later returns 503 due to a missing key. It does not store the token in the repository or Workers Builds' **build-time** variables. Attach FINNHUB_TOKEN via the existing production Worker's **Settings → Variables and Secrets → Add → Secret**; confirm the Worker name is `finc-560-finnhub` and use the `/health` endpoint to verify both required runtime bindings. If the secret appears to disappear after a successful deploy despite this configuration, inspect production Worker Versions/Deployments and Builds (especially whether the dashboard created a new version rather than attaching the secret to the current deployment) rather than repeatedly committing the key.
