# FINC 560 visualizations

View the visualizations on GitHub PAges 

https://jaruso.github.io/finc-560

## Finnhub market quotes through Cloudflare

The Week 6 Equities dashboard requests the latest Finnhub **market quote** on ticker changes and approximately once per minute while visible. The public browser sends **only a ticker** to the restricted Cloudflare Worker at https://finc-560-finnhub.joseph-caruso-pc.workers.dev; it never receives or contains FINNHUB_TOKEN. Quotes can be delayed or unavailable and do not modify the dated annual financial statements or their independent browser-side forecasts. When quote requests fail, existing curated annual charts continue working. See [Worker setup](worker/README.md). The Worker provides other allowlisted financial data endpoints for future use, but this integration consumes only /quote; do not label annual snapshots as live.
