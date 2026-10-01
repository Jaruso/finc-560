# FINC 560 visualizations

View the visualizations on GitHub PAges 

https://jaruso.github.io/finc-560

## Week 6: Treasury yield-curve scenario dashboard

[Open the interactive Week 6 dashboard](https://jaruso.github.io/finc-560/week-06/) · [Design document](src/assignments/week_06_design.md)

The static GitHub Pages dashboard presents real 5-year/10-year Treasury observations and explicitly hypothetical rate-adjustment scenarios. Data are refreshed from FRED through `python scripts/export_week_06.py` and `.github/workflows/refresh-week-06.yml`; client-side sliders change the assumptions, not the historical observations. Run the scenario tests with `node --test tests/week_06_model.test.cjs` and `python -m unittest discover -s tests -p 'test_week_06.py'`.
