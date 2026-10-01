# Week 6: Interactive Financial Dashboard Project - Design Document

## Dashboard Link
*Local:* `http://127.0.0.1:8050/` (Run `python week_06.py` to view)

## Audience Definition
**Who is this for?**
This dashboard is designed for Portfolio Managers and Investment Analysts at a mid-sized asset management firm. 

**What is their role, responsibilities, and decision context?**
Their primary responsibility is to monitor sector-level performance, assess market trends, and make asset allocation decisions. They need to quickly identify which sectors are outperforming or underperforming relative to the market and drill down into specific stock correlations to uncover potential diversification opportunities or risks.

## Audience Needs
**What questions does this audience need to answer?**
1. How are different sectors performing over a given time frame?
2. What are the specific trends and volatilities of top-performing assets within a sector?
3. How do selected assets correlate with each other, and does this impact portfolio diversification?
4. What is the distribution of returns for a specific asset over the selected period?

**What decisions does this dashboard support?**
It supports tactical asset allocation (overweighting or underweighting specific sectors), risk management (identifying highly correlated assets that may increase portfolio risk), and performance reporting to stakeholders.

## KPI Selection
**What metrics did you include and why?**
- **Cumulative Returns / Stock Performance:** Essential for assessing the overall growth and trajectory of an asset.
- **Trading Volume / Metric 2:** Contextualizes price movements (e.g., are price drops accompanied by high volume, indicating strong selling pressure?).
- **Correlation:** Critical for risk management; helps ensure the portfolio is properly diversified.
- **Return Distribution:** Provides a view into the volatility and the probability of extreme gains or losses (tail risk).

**How do these KPIs support the audience's needs?**
Together, these KPIs provide a holistic view of performance and risk, allowing analysts to balance potential upside against potential volatility and correlation risks.

## Design Decisions
**Why did you choose this layout?**
The layout uses a classic F-pattern hierarchy. The top bar contains the interactive controls (filters and date pickers) so users can immediately set their context. The visualizations are arranged in a 2x2 grid, providing a balanced, comprehensive view without overwhelming the user.

**How did you establish visual hierarchy?**
The title and filters are prominent at the top. The charts are sized equally but categorized logically: the top row focuses on time-series performance and volume (the "what"), while the bottom row dives into analytical metrics like correlation and distribution (the "why" and "risk").

**Why these chart types and colors?**
- *Line Chart:* Best for showing performance trends over time.
- *Bar Chart:* Effective for comparing discrete values like daily volume.
- *Scatter Plot:* The standard for visualizing the relationship/correlation between two variables.
- *Histogram:* The clearest way to show frequency distributions of returns.
- *Colors:* Used a clean, minimalist theme (`plotly_white`) to maintain a professional financial aesthetic and reduce cognitive load.

## Interactivity Rationale
**What interactive features did you include?**
1. **Sector Filter (Dropdown):** Allows the user to isolate performance to a specific sector of interest.
2. **Date Range Picker:** Enables temporal analysis, letting users zoom in on specific market events or zoom out for macro trends.

**How do they enhance user experience?**
They empower the user to explore the data dynamically without needing multiple static reports. The user can answer specific ad-hoc questions on the fly.

**What analytical workflows do they enable?**
A user can start with a broad, year-to-date view across all sectors, notice an anomaly or trend in a specific sector, use the dropdown to filter to that sector, and then use the date picker to narrow down to the specific weeks where the anomaly occurred to analyze the correlation and return distribution during that stress period.
