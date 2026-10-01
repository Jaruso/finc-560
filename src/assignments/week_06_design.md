# Week 6 — Interactive Treasury Yield-Curve Dashboard

**Dashboard:** https://jaruso.github.io/finc-560/week-06/  
**Selected platform:** Python for FRED retrieval, model fitting, and backtesting; Plotly in a browser-based dashboard for visualization and interactive scenarios.  
**Audience:** Fixed-income risk analyst at an asset manager.

## Audience and decision context

The intended user monitors intermediate-maturity U.S. Treasury exposure and briefs a portfolio manager on potential interest-rate risk. They need to identify whether five- and ten-year yields are moving differently, whether the yield curve is flattening or inverting, how conditional rate scenarios alter those relationships, and whether historical forecast accuracy justifies attention to the model. The dashboard supports investigation of maturity concentration and possible hedging needs; it does not prescribe trades.

## KPIs and complementary visualizations

Four compact cards show the latest observed **1Y, 2Y, 5Y, and 10Y Treasury yields**, providing immediate term-structure context. The **modeled 5Y and 10Y yields**, **10Y–5Y spread**, and **out-of-sample forecast error** form the remaining decision-relevant measures. Four related charts appear together by default:

1. **Observed and projected 5Y/10Y yields** distinguish solid historical observations from dashed modeled paths. Comparing the two maturities helps the analyst identify which portion of intermediate-duration exposure warrants closer investigation under the selected scenario.
2. **10Y–5Y yield spread** combines historical and projected differences with a zero threshold. It helps identify flattening, steepening, and modeled inversion conditions that could warrant review of maturity positioning.
3. **Effective federal funds rate history** places the analyst's hypothetical policy-rate deviation in historical context. This supports scenario interpretation without implying that observed rate associations demonstrate causality.
4. **Out-of-sample forecast accuracy** compares the fitted model's rolling historical RMSE with an unchanged-yield benchmark. It helps the analyst judge how cautiously to use modeled paths rather than treating a sophisticated forecast as inherently reliable.

## Layout, interaction, and design rationale

The left rail holds scenario controls and observed-yield cards; the main canvas gives the four complementary charts equal initial prominence. Consistent navy/teal series colors, a shared visual style, explicit units, and solid-versus-dashed line patterns distinguish observations from projections without relying on color alone. Exact values stay available in hover details instead of occupying extra summary panels.

The analyst can select one to four charts, change the historical viewing window, and focus on the projection period. A **6-, 12-, or 24-month horizon** and a **±100-basis-point conditional rate-deviation slider** recalculate modeled outcomes without modifying observed data. An optional 10th–90th-percentile historical-error display adds uncertainty context. These controls enable side-by-side scenario investigation and reduce clutter when concentrating on one question.

## Sources and limitations

Python synchronizes eight Treasury constant-maturity series and the effective federal funds rate from [FRED](https://fred.stlouisfed.org/), fitting a simplified fixed-decay **Diebold–Li-style** factor model with historical AR(1) dynamics. The conditional rate response uses an observed statistical association, **not** an identified causal Fed-policy effect. Historical-error ranges describe past out-of-sample errors and do not guarantee future coverage. Weekday source refreshes are not real-time streaming quotes. The dashboard explicitly separates observed yields, statistical forecasts, and analyst-supplied assumptions.
