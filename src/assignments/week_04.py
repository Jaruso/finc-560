from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import plotly.graph_objects as go

ASSIGNMENT = "week-04"
ASSIGNMENT_LABEL = "Week 04"
ASSIGNMENT_TITLE = "Stock market investment visualizations"

# --- House style (shared with earlier weeks) ---------------------------------
INK = "#17212b"
MUTED = "#64707d"
GRID = "#e7eaed"
ACCENT = "#0b7f73"
NAVY = "#314b5c"
NEGATIVE_COLOR = "#c94b5d"
NEUTRAL = "#8b949e"

# The dataset provides two observations per holding (purchase-date price and the
# 12/31/2024 endpoint price). It does NOT contain a continuous historical price
# series, so no intraperiod prices are interpolated or fabricated anywhere here.
AS_OF = date(2024, 12, 31)

SOURCE = (
    "Source: FINC-560 Week 4 assignment dataset — Balanced Growth Portfolio, "
    "holdings as of December 31, 2024"
)

# Broad asset classes keep scatter/legend color counts manageable (5 groups)
# while the finer `sector` field drives the allocation charts.
CLASS_COLORS = {
    "US Equity": NAVY,
    "Equity Funds": ACCENT,
    "Fixed Income": "#8a713c",
    "Real Estate": "#9c6b8e",
    "Commodities": "#c9a13b",
}
CLASS_ORDER = ["US Equity", "Equity Funds", "Fixed Income", "Real Estate", "Commodities"]

SECTOR_COLORS = {
    "Technology": ACCENT,
    "Healthcare": "#3f7cac",
    "Financials": NAVY,
    "Energy": "#8a713c",
    "Consumer Discretionary": NEGATIVE_COLOR,
    "Domestic Equity Fund": "#5a8f7b",
    # Darkened for white-text contrast on the treemap (static/PDF readability):
    # these three were the lightest fills (WCAG < ~3.2 against white).
    "International Equity Fund": "#587989",
    "Fixed Income Fund": "#6b7280",
    "Consumer Staples": "#8f6b4c",
    "Communication Services": "#9c6b8e",
    "Real Estate Fund": "#a86b5a",
    "Commodities/Gold": "#8f6f22",
}


@dataclass(frozen=True)
class Holding:
    ticker: str
    name: str
    sector: str
    asset_class: str
    shares: int
    purchase_date: str
    purchase_price: float
    current_price: float
    div_yield: float  # percent
    beta: float
    volatility: float  # annualized percent
    sharpe: float

    @property
    def cost_basis(self) -> float:
        return self.shares * self.purchase_price

    @property
    def current_value(self) -> float:
        return self.shares * self.current_price

    @property
    def gain(self) -> float:
        return self.current_value - self.cost_basis

    @property
    def gain_pct(self) -> float:
        """Total (holding-period) return since purchase, in percent."""
        return self.gain / self.cost_basis * 100

    @property
    def holding_years(self) -> float:
        """Actual calendar-day holding period through 12/31/2024, in years."""
        return (AS_OF - date.fromisoformat(self.purchase_date)).days / 365.25

    @property
    def cagr_pct(self) -> float:
        """Annualized return (CAGR) through 12/31/2024, in percent.

        CAGR = (current_price / purchase_price) ** (1 / holding_years) - 1
        Uses the price ratio (capital-only; dividends are not compounded here
        because the dataset supplies only a static current dividend yield).
        """
        ratio = self.current_price / self.purchase_price
        return (ratio ** (1.0 / self.holding_years) - 1.0) * 100


# ticker, name, sector, asset_class, shares, purchase_date, purchase_price,
# current_price, div_yield, beta, volatility, sharpe
HOLDINGS = [
    Holding("AAPL", "Apple Inc.", "Technology", "US Equity", 250, "2022-03-15", 165.00, 192.50, 0.52, 1.24, 24.30, 0.89),
    Holding("MSFT", "Microsoft Corp.", "Technology", "US Equity", 150, "2021-08-10", 285.00, 375.00, 0.83, 0.95, 21.70, 1.12),
    Holding("JNJ", "Johnson & Johnson", "Healthcare", "US Equity", 300, "2020-11-20", 145.00, 158.75, 3.05, 0.68, 14.80, 0.95),
    Holding("JPM", "JPMorgan Chase", "Financials", "US Equity", 200, "2022-01-05", 165.00, 182.50, 2.35, 1.15, 23.50, 0.76),
    Holding("XOM", "Exxon Mobil", "Energy", "US Equity", 400, "2023-06-12", 105.00, 112.25, 3.42, 0.88, 28.60, 0.54),
    Holding("AMZN", "Amazon.com", "Consumer Discretionary", "US Equity", 100, "2021-09-22", 340.00, 148.00, 0.00, 1.32, 32.40, 0.45),
    Holding("VTI", "Vanguard Total Stock ETF", "Domestic Equity Fund", "Equity Funds", 180, "2020-05-18", 155.00, 265.00, 1.42, 1.00, 18.20, 0.98),
    Holding("VEA", "Vanguard FTSE Developed Markets ETF", "International Equity Fund", "Equity Funds", 450, "2021-03-08", 48.00, 52.80, 2.18, 0.92, 17.90, 0.71),
    Holding("BND", "Vanguard Total Bond ETF", "Fixed Income Fund", "Fixed Income", 600, "2020-07-14", 88.50, 72.40, 3.65, 0.42, 6.80, 0.32),
    Holding("PG", "Procter & Gamble", "Consumer Staples", "US Equity", 250, "2022-10-30", 135.00, 152.80, 2.48, 0.58, 15.20, 0.88),
    Holding("DIS", "Walt Disney Co.", "Communication Services", "US Equity", 350, "2023-02-14", 105.00, 94.50, 0.00, 1.18, 29.70, 0.42),
    Holding("NVDA", "NVIDIA Corp.", "Technology", "US Equity", 50, "2022-11-01", 145.00, 495.00, 0.03, 1.68, 45.20, 1.35),
    Holding("REIT-1", "Vanguard Real Estate ETF", "Real Estate Fund", "Real Estate", 200, "2021-06-22", 105.00, 89.50, 3.95, 1.15, 24.10, 0.51),
    Holding("GLD", "SPDR Gold Trust", "Commodities/Gold", "Commodities", 75, "2023-09-05", 185.00, 195.00, 0.00, 0.05, 16.50, 0.28),
]

# --- Portfolio-level aggregates ----------------------------------------------
# Data reconciliation: the dataset header reports a portfolio value of $487,350,
# but the holding-level current values sum to $491,650. This analysis uses the
# sum of holding-level values so portfolio totals and weights reconcile
# internally. The discrepancy is disclosed on the dashboard, not overwritten.
HEADER_PORTFOLIO_VALUE = 487_350  # as printed in the supplied dataset header
TOTAL_COST = sum(h.cost_basis for h in HOLDINGS)
TOTAL_VALUE = sum(h.current_value for h in HOLDINGS)  # $491,650 (reconciled)
TOTAL_GAIN = TOTAL_VALUE - TOTAL_COST
TOTAL_RETURN_PCT = TOTAL_GAIN / TOTAL_COST * 100
WINNERS = sum(1 for h in HOLDINGS if h.gain > 0)


def weight(holding: Holding) -> float:
    """Share of total portfolio market value (0-1)."""
    return holding.current_value / TOTAL_VALUE


# Weighted beta / volatility. Weighted-average volatility overstates true
# portfolio volatility (it ignores diversification / correlation, which the
# single-snapshot dataset does not provide), so it is labeled as such.
WEIGHTED_BETA = sum(weight(h) * h.beta for h in HOLDINGS)
WEIGHTED_VOL = sum(weight(h) * h.volatility for h in HOLDINGS)
# Value-weighted average of the individual holding CAGRs. This is a summary of
# per-holding annualized returns, NOT a money-weighted portfolio return: the
# holdings have different purchase dates, so a single defensible annualized
# portfolio return cannot be computed from the supplied data.
WEIGHTED_CAGR = sum(weight(h) * h.cagr_pct for h in HOLDINGS)

SECTOR_VALUE: dict[str, float] = {}
for _h in HOLDINGS:
    SECTOR_VALUE[_h.sector] = SECTOR_VALUE.get(_h.sector, 0.0) + _h.current_value

TECH_WEIGHT = SECTOR_VALUE["Technology"] / TOTAL_VALUE * 100


def validate_data() -> None:
    for h in HOLDINGS:
        assert abs(h.cost_basis - h.shares * h.purchase_price) < 1e-6
        assert abs(h.current_value - h.shares * h.current_price) < 1e-6
        assert h.holding_years > 0
    assert abs(sum(weight(h) for h in HOLDINGS) - 1.0) < 1e-9
    assert abs(TOTAL_VALUE - TOTAL_COST - TOTAL_GAIN) < 1e-6


def finish_figure(
    fig: go.Figure,
    *,
    height: int,
    left: int,
    right: int,
    top: int = 34,
    bottom: int = 54,
    showlegend: bool = False,
    source: bool = True,
) -> go.Figure:
    """Apply the shared layout/theme used across the assignment pages."""
    fig.update_layout(
        template=None,
        height=height,
        autosize=True,
        margin={"t": top, "r": right, "b": bottom, "l": left},
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        font={"family": "Inter, Arial, sans-serif", "color": INK, "size": 13},
        hoverlabel={"bgcolor": "#ffffff", "bordercolor": GRID, "font_size": 13, "font_color": INK},
        dragmode=False,
        showlegend=showlegend,
    )
    if source:
        fig.add_annotation(
            text=SOURCE,
            xref="paper",
            yref="paper",
            x=0,
            y=-0.18,
            xanchor="left",
            yanchor="top",
            showarrow=False,
            font={"size": 10, "color": MUTED},
        )
    return fig


def _legend_bottom(fig: go.Figure, y: float = 1.1) -> go.Figure:
    fig.update_layout(
        legend={
            "orientation": "h",
            "x": 0,
            "y": y,
            "xanchor": "left",
            "yanchor": "bottom",
            "font": {"size": 11, "color": MUTED},
        }
    )
    return fig


def _bubble_sizeref(values: list[float], max_marker: float = 54.0) -> float:
    return 2.0 * max(values) / (max_marker**2)


# --- Section 1: Asset allocation ---------------------------------------------
def allocation_treemap() -> go.Figure:
    ids = ["Portfolio"]
    labels = ["Portfolio"]
    parents = [""]
    values = [TOTAL_VALUE]
    colors = ["#ffffff"]
    text = [""]
    customdata: list[list] = [[100.0]]

    for sector, sector_value in sorted(SECTOR_VALUE.items(), key=lambda kv: -kv[1]):
        ids.append(sector)
        labels.append(sector)
        parents.append("Portfolio")
        values.append(sector_value)
        colors.append(SECTOR_COLORS.get(sector, NEUTRAL))
        text.append("")
        customdata.append([sector_value / TOTAL_VALUE * 100])

    for h in sorted(HOLDINGS, key=lambda x: -x.current_value):
        ids.append(h.ticker)
        labels.append(h.ticker)
        parents.append(h.sector)
        values.append(h.current_value)
        colors.append(SECTOR_COLORS.get(h.sector, NEUTRAL))
        text.append(f"${h.current_value / 1000:,.1f}K")
        customdata.append([weight(h) * 100])

    fig = go.Figure(
        go.Treemap(
            ids=ids,
            labels=labels,
            parents=parents,
            values=values,
            branchvalues="total",
            marker={"colors": colors, "line": {"color": "#ffffff", "width": 1.5}},
            text=text,
            texttemplate="<b>%{label}</b><br>%{text}<br>%{customdata[0]:.1f}%",
            customdata=customdata,
            hovertemplate="<b>%{label}</b><br>Value: $%{value:,.0f}<br>Weight: %{customdata[0]:.1f}%<extra></extra>",
            tiling={"pad": 2},
            pathbar={"visible": False},
            sort=True,
        )
    )
    fig.update_traces(insidetextfont={"color": "#ffffff", "size": 13})
    return finish_figure(fig, height=440, left=6, right=6, top=10, bottom=30)


def sector_asset_class_allocation() -> go.Figure:
    ordered = sorted(SECTOR_VALUE.items(), key=lambda kv: kv[1])
    categories = [s for s, _ in ordered]
    weights = [v / TOTAL_VALUE * 100 for _, v in ordered]
    top_category = max(SECTOR_VALUE, key=lambda s: SECTOR_VALUE[s])
    bar_colors = [ACCENT if s == top_category else "#c2ccd3" for s in categories]

    fig = go.Figure(
        go.Bar(
            y=categories,
            x=weights,
            orientation="h",
            marker={"color": bar_colors},
            text=[f"{w:.1f}%" for w in weights],
            textposition="outside",
            cliponaxis=False,
            hovertemplate="%{y}<br>Weight: %{x:.1f}% of portfolio value<extra></extra>",
        )
    )
    fig.update_yaxes(showgrid=False)
    fig.update_xaxes(
        title="Share of portfolio value",
        range=[0, 30],
        ticksuffix="%",
        dtick=5,
        gridcolor=GRID,
        zeroline=True,
        zerolinecolor=INK,
        zerolinewidth=1.4,
    )
    fig.add_annotation(
        xref="paper",
        yref="paper",
        x=1,
        y=1.06,
        xanchor="right",
        text=f"<b>{top_category}: {TECH_WEIGHT:.1f}% — largest directly classified allocation</b>",
        showarrow=False,
        font={"size": 12, "color": ACCENT},
    )
    return finish_figure(fig, height=440, left=150, right=70)


# --- Section 2: Performance over time ----------------------------------------
def pnl_waterfall() -> go.Figure:
    ordered = sorted(HOLDINGS, key=lambda h: h.gain, reverse=True)
    x = ["Cost basis"] + [h.ticker for h in ordered] + ["Current value"]
    measure = ["absolute"] + ["relative"] * len(ordered) + ["total"]
    y = [TOTAL_COST] + [h.gain for h in ordered] + [TOTAL_VALUE]
    text = (
        [f"${TOTAL_COST / 1000:,.0f}K"]
        + [f"{'+' if h.gain >= 0 else '-'}${abs(h.gain) / 1000:,.1f}K" for h in ordered]
        + [f"${TOTAL_VALUE / 1000:,.0f}K"]
    )

    fig = go.Figure(
        go.Waterfall(
            x=x,
            measure=measure,
            y=y,
            text=text,
            textposition="outside",
            textfont={"size": 10},
            cliponaxis=False,
            connector={"line": {"color": GRID, "width": 1}},
            increasing={"marker": {"color": ACCENT}},
            decreasing={"marker": {"color": NEGATIVE_COLOR}},
            totals={"marker": {"color": NAVY}},
            hovertemplate="%{x}<br>%{y:$,.0f}<extra></extra>",
        )
    )
    fig.update_yaxes(
        title="Portfolio value ($)",
        range=[0, 560000],
        gridcolor=GRID,
        tickprefix="$",
        tickformat=",.0s",
        zeroline=True,
        zerolinecolor=INK,
        zerolinewidth=1.4,
    )
    fig.update_xaxes(tickangle=-45, tickfont={"size": 11})
    fig.add_annotation(
        xref="paper",
        yref="paper",
        x=1,
        y=1.07,
        xanchor="right",
        text=f"<b>Net gain: +${TOTAL_GAIN / 1000:,.0f}K ({TOTAL_RETURN_PCT:+.1f}%)</b>",
        showarrow=False,
        font={"size": 12, "color": ACCENT},
    )
    return finish_figure(fig, height=460, left=70, right=26, bottom=70)


def indexed_growth_since_purchase() -> go.Figure:
    """Growth of $100 from each holding's purchase to 12/31/2024 (dumbbell).

    Only two observations exist per holding (the purchase price and the
    12/31/2024 endpoint price). Each dumbbell shows just those two points — an
    open marker at 100 (purchase) and a filled marker at the 12/31/2024 indexed
    value. No intraperiod prices are interpolated or implied. The dashed line is
    the total portfolio's indexed value (aggregate current value / aggregate
    cost basis), a total (not annualized) return used purely as a benchmark.
    """
    rows = sorted(HOLDINGS, key=lambda h: h.current_price / h.purchase_price)
    portfolio_index = TOTAL_VALUE / TOTAL_COST * 100

    fig = go.Figure()
    for h in rows:
        index_end = h.current_price / h.purchase_price * 100
        color = ACCENT if index_end >= 100 else NEGATIVE_COLOR
        fig.add_trace(
            go.Scatter(
                x=[100.0, index_end],
                y=[h.ticker, h.ticker],
                mode="lines",
                line={"color": color, "width": 3},
                hoverinfo="skip",
                showlegend=False,
            )
        )
        fig.add_trace(
            go.Scatter(
                x=[100.0],
                y=[h.ticker],
                mode="markers",
                marker={"size": 11, "color": "#ffffff", "line": {"color": NEUTRAL, "width": 2}},
                hoverinfo="skip",
                showlegend=False,
            )
        )
        fig.add_trace(
            go.Scatter(
                x=[index_end],
                y=[h.ticker],
                mode="markers+text",
                marker={"size": 13, "color": color, "line": {"color": "#ffffff", "width": 1}},
                text=[f"{h.gain_pct:+.1f}%"],
                # Keep labels off the 100 baseline and off the axis edges:
                #  - moderate gainers to the right of their dot
                #  - the far-right outlier (NVDA) to the left, to avoid clipping
                #  - deep losers (dot far left) to the right, into the gap before
                #    the baseline, so the label clears the y-axis ticks
                #  - mild losers to the left of their dot
                textposition=(
                    "middle right"
                    if (100 <= index_end <= 320 or index_end < 70)
                    else "middle left"
                ),
                textfont={"size": 10, "color": color},
                cliponaxis=False,
                customdata=[[h.name, h.purchase_date, h.holding_years, index_end, h.gain_pct]],
                hovertemplate=(
                    "<b>%{y}</b> — %{customdata[0]}<br>"
                    "Purchased %{customdata[1]} · held %{customdata[2]:.1f} yrs<br>"
                    "Indexed value: %{customdata[3]:.0f} (start 100)<br>"
                    "Total return: %{customdata[4]:+.1f}%<extra></extra>"
                ),
            )
        )

    fig.add_vline(x=100, line_width=1.4, line_color=INK)
    fig.add_vline(
        x=portfolio_index,
        line_width=1.5,
        line_dash="dash",
        line_color=NAVY,
        annotation_text=f"Aggregate gain vs. portfolio cost basis: {TOTAL_RETURN_PCT:+.1f}%",
        annotation_position="top",
        annotation_font={"size": 11, "color": NAVY},
    )
    fig.update_yaxes(
        showgrid=False,
        categoryorder="array",
        categoryarray=[h.ticker for h in rows],
    )
    fig.update_xaxes(
        title="Indexed value (100 = purchase price)",
        range=[0, 390],
        dtick=50,
        gridcolor=GRID,
        zeroline=False,
    )
    fig.add_annotation(
        xref="paper",
        yref="paper",
        x=0,
        y=-0.16,
        xanchor="left",
        yanchor="top",
        align="left",
        text=(
            "○ purchase (100)&nbsp;&nbsp;● Dec 31, 2024 — two observations per holding; "
            "endpoints only, not an actual price path."
        ),
        showarrow=False,
        font={"size": 10, "color": MUTED},
    )
    return finish_figure(fig, height=520, left=58, right=54, top=40, bottom=92)


# --- Section 3: Risk analysis ------------------------------------------------
def risk_return_scatter() -> go.Figure:
    values = [h.current_value for h in HOLDINGS]
    sizeref = _bubble_sizeref(values)

    fig = go.Figure()
    for asset_class in CLASS_ORDER:
        members = [h for h in HOLDINGS if h.asset_class == asset_class]
        if not members:
            continue
        fig.add_trace(
            go.Scatter(
                x=[h.volatility for h in members],
                y=[h.cagr_pct for h in members],
                mode="markers+text",
                name=asset_class,
                text=[h.ticker for h in members],
                textposition="top center",
                textfont={"size": 9, "color": MUTED},
                marker={
                    "size": [h.current_value for h in members],
                    "sizemode": "area",
                    "sizeref": sizeref,
                    "sizemin": 5,
                    "color": CLASS_COLORS[asset_class],
                    "line": {"color": "#ffffff", "width": 1},
                    "opacity": 0.85,
                },
                customdata=[
                    [h.name, h.sharpe, h.current_value, h.gain_pct, h.holding_years]
                    for h in members
                ],
                hovertemplate=(
                    "<b>%{text}</b> — %{customdata[0]}<br>"
                    "Annualized volatility: %{x:.1f}%<br>"
                    "Annualized return (CAGR): %{y:.1f}%<br>"
                    "Total return: %{customdata[3]:+.1f}% over %{customdata[4]:.1f} yrs<br>"
                    "Sharpe: %{customdata[1]:.2f} · Value: $%{customdata[2]:,.0f}<extra></extra>"
                ),
            )
        )

    fig.add_vline(
        x=WEIGHTED_VOL,
        line_width=1.3,
        line_dash="dot",
        line_color=MUTED,
        annotation_text=f"Value-weighted avg of holding volatilities {WEIGHTED_VOL:.1f}% (not actual portfolio volatility)",
        annotation_position="top",
        annotation_font={"size": 10, "color": MUTED},
    )
    fig.add_hline(
        y=WEIGHTED_CAGR,
        line_width=1.3,
        line_dash="dot",
        line_color=NAVY,
        annotation_text=f"Value-weighted avg of holding CAGRs {WEIGHTED_CAGR:.1f}% (not actual portfolio CAGR)",
        annotation_position="bottom right",
        annotation_font={"size": 10, "color": NAVY},
    )
    fig.add_hline(y=0, line_width=1.2, line_color=INK)
    fig.update_yaxes(
        title="Annualized return since purchase (CAGR)",
        range=[-30, 85],
        ticksuffix="%",
        gridcolor=GRID,
        zeroline=False,
    )
    fig.update_xaxes(
        title="Annualized volatility",
        range=[0, 50],
        ticksuffix="%",
        dtick=10,
        gridcolor=GRID,
        zeroline=False,
    )
    fig = finish_figure(fig, height=440, left=66, right=30, showlegend=True)
    return _legend_bottom(fig)


def volatility_weighted_exposure() -> go.Figure:
    # Volatility-weighted exposure = portfolio weight x standalone annualized
    # volatility, rescaled to sum to 100%. This is NOT covariance-aware risk
    # contribution: it ignores correlations among holdings.
    vwe_raw = {h.ticker: weight(h) * h.volatility for h in HOLDINGS}
    vwe_total = sum(vwe_raw.values())
    rows = sorted(HOLDINGS, key=lambda h: vwe_raw[h.ticker])

    tickers = [h.ticker for h in rows]
    capital_weight = [weight(h) * 100 for h in rows]
    vol_weighted = [vwe_raw[h.ticker] / vwe_total * 100 for h in rows]

    fig = go.Figure()
    fig.add_trace(
        go.Bar(
            y=tickers,
            x=capital_weight,
            orientation="h",
            name="Capital weight",
            marker={"color": "#c2ccd3"},
            text=[f"{v:.1f}%" for v in capital_weight],
            textposition="outside",
            cliponaxis=False,
            hovertemplate="%{y}<br>Capital weight: %{x:.1f}%<extra></extra>",
        )
    )
    fig.add_trace(
        go.Bar(
            y=tickers,
            x=vol_weighted,
            orientation="h",
            name="Volatility-weighted exposure",
            marker={"color": NEGATIVE_COLOR},
            text=[f"{v:.1f}%" for v in vol_weighted],
            textposition="outside",
            cliponaxis=False,
            hovertemplate="%{y}<br>Volatility-weighted exposure: %{x:.1f}%<extra></extra>",
        )
    )
    fig.update_layout(barmode="group", bargap=0.28, bargroupgap=0.12)
    fig.update_yaxes(showgrid=False)
    fig.update_xaxes(
        title="Share of portfolio (capital weight vs. volatility-weighted exposure)",
        range=[0, 15],
        ticksuffix="%",
        dtick=3,
        gridcolor=GRID,
        zeroline=True,
        zerolinecolor=INK,
        zerolinewidth=1.4,
    )
    fig.add_annotation(
        xref="paper",
        yref="paper",
        x=1,
        y=1.05,
        xanchor="right",
        text="<b>Exposure &gt; capital weight = over-represented in portfolio volatility</b>",
        showarrow=False,
        font={"size": 12, "color": NEGATIVE_COLOR},
    )
    fig.add_annotation(
        xref="paper",
        yref="paper",
        x=0,
        y=-0.135,
        xanchor="left",
        yanchor="top",
        text="Metric = portfolio weight × standalone annualized volatility (ignores correlations)",
        showarrow=False,
        font={"size": 10, "color": MUTED},
    )
    fig = finish_figure(fig, height=520, left=58, right=48, bottom=92, showlegend=True)
    return _legend_bottom(fig, y=1.02)


validate_data()

_RECONCILIATION_NOTE = (
    "Data reconciliation: holding-level current values in the supplied dataset "
    "sum to $491,650, while the dataset header reports $487,350. This analysis "
    "uses the sum of holding-level values so portfolio totals and weights "
    "reconcile consistently."
)

DASHBOARD = {
    "eyebrow": "Balanced Growth Portfolio · As of December 31, 2024",
    "headline": "A tech-tilted growth portfolio: where the money sits, how it performed, and where the risk hides.",
    "summary": (
        "Fourteen holdings worth $491,650 are examined through three lenses — asset allocation, "
        "performance, and risk. Each lens has one primary assignment figure plus a supplemental "
        "chart. The supplied dataset provides two price observations per holding (purchase and "
        "12/31/2024), not a continuous history, so the performance views are built only from those "
        "endpoints."
    ),
    "methodology": [
        _RECONCILIATION_NOTE,
        {
            "label": "Performance over time",
            "text": (
                "The dataset provides two observations per holding — the purchase-date price and the "
                "12/31/2024 price — not a continuous historical price series. Performance charts use only "
                "these endpoints; connecting lines link them and do not represent actual intraperiod paths. "
                "No intermediate prices are interpolated or fabricated."
            ),
        },
        {
            "label": "Annualized return (CAGR)",
            "text": (
                "CAGR = (current price / purchase price) ^ (1 / holding years) − 1, where holding years = "
                "calendar days from purchase to 12/31/2024 ÷ 365.25. It is capital-only (dividends are not "
                "compounded, since only a static current yield is supplied)."
            ),
        },
        {
            "label": "Portfolio annualized return",
            "text": (
                "Holdings have different purchase dates, so no single defensible annualized portfolio return "
                "is computed. The risk-return reference line is the value-weighted average of individual "
                "holding CAGRs, not a money-weighted portfolio return."
            ),
        },
        {
            "label": "Volatility-weighted exposure",
            "text": (
                "Volatility-weighted exposure = portfolio weight × standalone annualized volatility, rescaled "
                "to sum to 100%. It is not covariance-aware risk contribution and ignores correlations among "
                "holdings (the single-snapshot dataset has no return series to estimate them)."
            ),
        },
        {
            "label": "Technology allocation",
            "text": (
                "Sector / asset-class labels are taken directly from the dataset. The "
                f"{TECH_WEIGHT:.1f}% Technology figure is the directly classified allocation; diversified funds "
                "(e.g., VTI, VEA) may hold additional technology exposure the dataset does not disclose."
            ),
        },
    ],
    "kpis": [
        {"label": "Portfolio value", "value": "$491.7K", "delta": f"{TOTAL_RETURN_PCT:+.1f}% total return", "tone": "positive"},
        {"label": "Total gain / loss", "value": f"+${TOTAL_GAIN / 1000:,.1f}K", "delta": f"{WINNERS} of {len(HOLDINGS)} holdings up", "tone": "positive"},
        {"label": "Weighted beta", "value": f"{WEIGHTED_BETA:.2f}", "delta": "vs. 1.00 market", "tone": "neutral"},
        {"label": "Technology weight", "value": f"{TECH_WEIGHT:.1f}%", "delta": "directly classified", "tone": "neutral"},
    ],
    "groups": [
        {
            "label": "Asset allocation",
            "title": "Equities dominate, and Technology is the largest directly classified allocation.",
            "description": (
                "Primary: the treemap maps every position by market value. Supplemental: the ranked bar "
                "compares sector and asset-class categories and flags the Technology tilt."
            ),
            "slugs": ["portfolio-allocation-treemap", "sector-asset-class-allocation"],
        },
        {
            "label": "Performance over time",
            "title": "Returns vary sharply across holdings, with several major outliers.",
            "description": (
                "Primary: growth of $100 from each holding's purchase to 12/31/2024, versus the total "
                "portfolio. Supplemental: a bridge decomposing each holding's dollar contribution to total "
                "profit and loss. Both use only the two supplied observations per holding."
            ),
            "slugs": ["indexed-growth-since-purchase", "portfolio-gain-loss-bridge"],
        },
        {
            "label": "Risk analysis",
            "title": "Some positions weigh more in volatility terms than in capital terms.",
            "description": (
                "Primary: annualized return (CAGR) versus annualized volatility, sized by position value. "
                "Supplemental: each holding's capital weight against its volatility-weighted exposure "
                "(weight × standalone volatility, correlations not modeled)."
            ),
            "slugs": ["risk-return-profile", "volatility-weighted-exposure"],
        },
    ],
}

FIGURES = [
    {
        "title": "Where the $491.7K sits: a tech-heavy, equity-dominated mix",
        "slug": "portfolio-allocation-treemap",
        "description": "Portfolio market value broken down by sector / asset-class category and then by individual holding.",
        "takeaway": "Technology (Apple, Microsoft, NVIDIA) is the largest directly classified allocation, and individual stocks outweigh the diversifying funds.",
        "audience": "Primary assignment visualization · Asset allocation",
        "figure": allocation_treemap(),
    },
    {
        "title": "Technology is the largest directly classified allocation at 26% of assets",
        "slug": "sector-asset-class-allocation",
        "description": "Each sector / asset-class category's share of total portfolio value, ranked to surface concentration.",
        "takeaway": "Technology is the largest directly classified allocation; diversified funds such as VTI and VEA may add further technology exposure that the dataset does not disclose.",
        "audience": "Supplemental analysis · Asset allocation",
        "figure": sector_asset_class_allocation(),
    },
    {
        "title": "Purchase-to-12/31/2024 endpoint return: individual holdings vs. portfolio (not a time series)",
        "slug": "indexed-growth-since-purchase",
        "description": "Each holding indexed to 100 at its purchase date and marked at its 12/31/2024 value, alongside the total portfolio. Built from the two supplied observations per holding, not a continuous price history.",
        "takeaway": "Returns vary sharply across holdings — NVDA and VTI sit far above the portfolio line while AMZN and BND fall well below it.",
        "audience": "Primary assignment visualization · Performance over time",
        "figure": indexed_growth_since_purchase(),
    },
    {
        "title": "The portfolio gained $39.9K — but the result is highly uneven",
        "slug": "portfolio-gain-loss-bridge",
        "description": "A waterfall from total cost basis to current value, with each holding's dollar contribution.",
        "takeaway": "VTI, NVDA, and MSFT account for most of the gain, while AMZN and BND together offset nearly $29K.",
        "audience": "Supplemental analysis · Performance over time",
        "figure": pnl_waterfall(),
    },
    {
        "title": "Risk and return: annualized return vs. annualized volatility",
        "slug": "risk-return-profile",
        "description": "Annualized return (CAGR through 12/31/2024) versus annualized volatility, sized by position value, against value-weighted averages.",
        "takeaway": "BND sits in the low-volatility corner; NVDA and VTI pair high volatility with high annualized returns, while AMZN pairs high volatility with a negative annualized return.",
        "audience": "Primary assignment visualization · Risk analysis",
        "figure": risk_return_scatter(),
    },
    {
        "title": "Which positions weigh more in volatility than in capital",
        "slug": "volatility-weighted-exposure",
        "description": "Each holding's capital weight compared with its volatility-weighted exposure (weight × standalone annualized volatility; correlations not modeled).",
        "takeaway": "NVDA, AMZN, and XOM show more volatility-weighted exposure than capital weight, while BND and PG show less.",
        "audience": "Supplemental analysis · Risk analysis",
        "figure": volatility_weighted_exposure(),
    },
]
