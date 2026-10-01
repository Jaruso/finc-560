# FINC 560 visualizations

View the visualizations on GitHub PAges 

https://jaruso.github.io/finc-560

## Week 6: Treasury yield-curve scenario dashboard

[Open the interactive Week 6 dashboard](https://jaruso.github.io/finc-560/week-06/) · [Design document](src/assignments/week_06_design.md)

The static GitHub Pages dashboard presents real 5-year/10-year Treasury observations and explicitly hypothetical rate-adjustment scenarios. Data are refreshed from FRED through `python scripts/export_week_06.py` and `.github/workflows/refresh-week-06.yml`; client-side sliders change the assumptions, not the historical observations. Run the scenario tests with `node --test tests/week_06_model.test.cjs` and `python -m unittest discover -s tests -p 'test_week_06.py'`.

## Live-data Week 6 forecasting upgrade

Week 6 now uses a **Diebold–Li-style two-stage Treasury yield-curve model**, trained on eight FRED constant-maturity Treasury series. Historical monthly level/slope/curvature factors feed separate fitted AR(1) processes to produce 5Y, 10Y and yield-spread baselines. An optional user-selected next-month policy deviation uses an explicitly **observational**, historically estimated association with factor changes—not a causal claim. Historical 10th–90th percentile expanding-window out-of-sample forecast errors supply descriptive ranges; backtested 6/12/24-month model RMSE is compared to an unchanged-yield baseline. The GitHub Actions job refreshes this verified research snapshot on weekdays (not an intraday trading feed). See [source](src/assignments/week_06_forecast.py) and [methodology](src/assignments/week_06_design.md).

## Week 6 company forecasting workspace

The Week 6 header includes simple **Macro** and **Companies** tabs. The company workspace runs two browser-side financial forecasting methods on annual published revenue (CAGR and OLS trend) and applies an explicit growth/margin scenario to derived operating/net income. Two linked historical and projected charts share identical dollar scales and join at the final reported fiscal year. Featured curated financial statements (Microsoft, Apple, Home Depot), with issuer or SEC source URL **on each annual record**, are versioned in `docs/week-06/companies/data/` as of 2026-09-30; Microsoft FY2026 values are from its official **unaudited** annual earnings release. The SEC Company Facts scheduled refresher is **paused** until network access is restored, since GitHub's hosted runners currently receive HTTP 403. Do not describe featured datasets as continuously live until this is fixed. Browser models need no backend, credentials or synthetic financial data in production.


## Finnhub market quotes through Cloudflare

The Week 6 Equities dashboard requests the latest Finnhub **market quote** on ticker changes and approximately once per minute while visible. The public browser sends **only a ticker** to the restricted Cloudflare Worker at https://finc-560-finnhub.joseph-caruso-pc.workers.dev; it never receives or contains FINNHUB_TOKEN. Quotes can be delayed or unavailable and do not modify the dated annual financial statements or their independent browser-side forecasts. When quote requests fail, existing curated annual charts continue working. See [Worker setup](worker/README.md). The Worker provides other allowlisted financial data endpoints for future use, but this integration consumes only /quote; do not label annual snapshots as live.
