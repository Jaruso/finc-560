# FINC 560 visualizations

View the visualizations on GitHub PAges 

https://jaruso.github.io/finc-560

## Week 6: Treasury yield-curve scenario dashboard

[Open the interactive Week 6 dashboard](https://jaruso.github.io/finc-560/week-06/) · [Design document](src/assignments/week_06_design.md)

The static GitHub Pages dashboard presents real 5-year/10-year Treasury observations and explicitly hypothetical rate-adjustment scenarios. Data are refreshed from FRED through `python scripts/export_week_06.py` and `.github/workflows/refresh-week-06.yml`; client-side sliders change the assumptions, not the historical observations. Run the scenario tests with `node --test tests/week_06_model.test.cjs` and `python -m unittest discover -s tests -p 'test_week_06.py'`.

## Live-data Week 6 forecasting upgrade

Week 6 now uses a **Diebold–Li-style two-stage Treasury yield-curve model**, trained on eight FRED constant-maturity Treasury series. Historical monthly level/slope/curvature factors feed separate fitted AR(1) processes to produce 5Y, 10Y and yield-spread baselines. An optional user-selected next-month policy deviation uses an explicitly **observational**, historically estimated association with factor changes—not a causal claim. Historical 10th–90th percentile expanding-window out-of-sample forecast errors supply descriptive ranges; backtested 6/12/24-month model RMSE is compared to an unchanged-yield baseline. The GitHub Actions job refreshes this verified research snapshot on weekdays (not an intraday trading feed). See [source](src/assignments/week_06_forecast.py) and [methodology](src/assignments/week_06_design.md).
