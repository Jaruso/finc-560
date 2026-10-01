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

The existing curated public dataset and charts remain unchanged until the frontend is explicitly wired to this Worker. Check your Finnhub subscription terms for public display/redistribution rights even for an academic project.

## Local tests

Inside `worker/`: `npm install` then `npm test`. For local `npx wrangler dev`, copy `.dev.vars.example` to `.dev.vars` and supply your own local key. `.dev.vars` and `node_modules` are Git-ignored. Never commit actual keys.

Cloudflare Workers Builds: https://developers.cloudflare.com/workers/ci-cd/builds/
Finnhub API: https://finnhub.io/docs/api/
