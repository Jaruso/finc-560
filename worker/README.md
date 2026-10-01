# FINC-560 Finnhub Worker

Small authenticated Finnhub proxy for the Week 6 company dashboard. GitHub Pages remains static, and financial projections remain browser-side. The live frontend is deliberately NOT connected in this commit: configure and test the Worker first.

## Configure Cloudflare

1. Prefer the EXISTING Cloudflare Worker with your existing FINNHUB_TOKEN secret. If its name is not finc-560, edit the name field in worker/wrangler.jsonc to EXACTLY match your existing Cloudflare Worker BEFORE connecting to GitHub. Creating a second Worker does not transfer secrets.
2. In Worker Settings > Variables and Secrets, retain FINNHUB_TOKEN as a runtime Secret. Add a SECOND, independent runtime Secret named DASHBOARD_ACCESS_TOKEN with a long random value. Neither secret belongs in GitHub, build variables, query parameters, public JavaScript, screenshots, or chat.
3. Worker Settings > Builds > Connect: select Jaruso/finc-560, branch main, root directory worker, leave Build command blank, Deploy command npx wrangler deploy. If available, set Build watch paths to worker/**.
4. Once deployed, visit https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/health. It should return {"ok":true}; this does NOT verify Finnhub access. For authenticated testing, use curl with Authorization: Bearer <DASHBOARD_ACCESS_TOKEN> to request /quote?symbol=AAPL. Never include either secret in the URL or a saved terminal transcript.

## Allowed data routes

All data endpoints require the separate DASHBOARD_ACCESS_TOKEN bearer header. The Finnhub token is added server-side ONLY to Finnhub requests. Only these GET routes exist:

- /quote?symbol=AAPL : quote, 60-second edge TTL.
- /profile?symbol=AAPL : company profile, 24-hour edge TTL.
- /metrics?symbol=AAPL : basic financial metrics, 1-hour edge TTL.
- /financials?symbol=AAPL&freq=annual&from=2015-01-01 : as-reported financials, 24-hour edge TTL; freq=annual|quarterly and ISO from/to dates are optional.

Plan access to financial-data endpoints depends on Finnhub. Failed requests are not cached. Browser CORS accepts only https://jaruso.github.io, but CORS is not authentication. The Cloudflare native rate-limit binding caps about 20 authenticated calls/minute per Cloudflare location, not an exact global budget. Cache API is local/best-effort, not a guarantee against upstream usage.

For personal live-data mode, future frontend integration should prompt you for DASHBOARD_ACCESS_TOKEN at runtime and keep it only in memory for that tab; never embed it in public JavaScript or persistent browser storage. Existing public, curated demo data should stay available to classmates. Anyone you give the access token to can reuse it.

## Local development

From this worker directory, run npm install and npm test. To run npx wrangler dev, copy .dev.vars.example to .dev.vars and supply local values there. .dev.vars and node_modules are Git-ignored. No real credentials are checked into this repository.

For reference: Cloudflare Workers Builds https://developers.cloudflare.com/workers/ci-cd/builds/ and Finnhub API https://finnhub.io/docs/api/.
