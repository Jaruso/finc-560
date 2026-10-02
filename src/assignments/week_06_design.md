# Week 6 — Interactive Treasury Rates Dashboard

**Dashboard:** https://jaruso.github.io/finc-560/week-06/  
**Platform:** Python for FRED data preparation, statistical forecasting, and backtesting; Plotly for the interactive browser dashboard.  
**Audience:** Fixed-income risk analyst at an asset manager.

## Audience and decision context

The analyst monitors U.S. Treasury interest-rate exposure and briefs a portfolio manager on maturity positioning and potential hedging needs. The dashboard addresses four connected questions: How have intermediate-term yields moved? Is the curve flattening or steepening? What does the current term structure look like across maturities? And how much reliance should be placed on the statistical forecast? It supports risk investigation, not automatic trading decisions.

## KPIs and four coordinated visualizations

The compact sidebar displays the latest synchronized **1Y, 2Y, 5Y, and 10Y observed Treasury yields**. The main canvas opens with four complementary charts, each serving a different analytical decision:

1. **5Y and 10Y Treasury yields:** Solid historical lines and dashed model paths reveal changes in intermediate-term rates and differences between maturities. An analyst can assess whether a conditional scenario warrants closer examination of exposure to either maturity.
2. **10Y–5Y yield spread:** Historical and modeled spreads, alongside a zero-inversion threshold, show flattening, steepening, or modeled inversion. This helps the analyst identify changes in curve shape that may affect maturity positioning.
3. **Treasury yield curve:** A single-date, **observed-only** view connects all eight verified maturities (1Y through 30Y), spaced by actual years. Unlike the time-series charts, it reveals the current term structure and where short-, intermediate-, and long-term yields differ. It does not present unsupported projections for the other six maturities.
4. **Backtested forecast error:** Grouped bars compare the fitted model with an unchanged-yield baseline for 5Y, 10Y, and their spread. Lower root mean squared error (RMSE) means smaller historical misses. This checks whether added model complexity improves forecasting; an explanatory tooltip makes the comparison and its limitations accessible.

## Layout and meaningful interactivity

The **Rates** workspace opens with these four charts simultaneously, satisfying the single-canvas requirement without requiring navigation to Equities or Commodities. Observed-yield cards and scenario inputs sit in a compact left rail, leaving most space for analysis. Consistent navy and teal identify related series; solid versus dashed lines and labeled forecast regions distinguish observation from modeling without relying on color alone. Hover details provide precise values without redundant KPI panels.

The analyst may choose **one to four charts**, select a historical window, or focus on the forecast period. Switching among **6-, 12-, and 24-month** horizons updates forecasts and the matching backtest. A **±100-basis-point next-month policy-rate deviation** tests conditional scenarios; the optional historical-error toggle exposes uncertainty context. Observed data, including the eight-maturity curve, remain unchanged when scenario controls move.

## Sources and limitations

Python synchronizes eight FRED Treasury series and the effective federal funds rate, then fits a simplified **Diebold–Li-style** factor model with historical AR(1) dynamics. A weekday refresh updates published snapshots, not real-time quotes. The policy scenario relies on an observed statistical association, not a causal estimate of Federal Reserve actions. Historical-error bands and rolling out-of-sample results describe past performance, not guaranteed future accuracy. The federal funds rate chart remains an optional view for policy context.
