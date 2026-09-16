from __future__ import annotations

from dataclasses import dataclass

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
    "International Equity Fund": "#7a9bb0",
    "Fixed Income Fund": "#6b7280",
    "Consumer Staples": "#b08968",
    "Communication Services": "#9c6b8e",
    "Real Estate Fund": "#a86b5a",
    "Commodities/Gold": "#c9a13b",
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
        return self.gain / self.cost_basis * 100


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
TOTAL_COST = sum(h.cost_basis for h in HOLDINGS)
TOTAL_VALUE = sum(h.current_value for h in HOLDINGS)
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

SECTOR_VALUE: dict[str, float] = {}
for _h in HOLDINGS:
    SECTOR_VALUE[_h.sector] = SECTOR_VALUE.get(_h.sector, 0.0) + _h.current_value

TECH_WEIGHT = SECTOR_VALUE["Technology"] / TOTAL_VALUE * 100


def validate_data() -> None:
    for h in HOLDINGS:
        assert abs(h.cost_basis - h.shares * h.purchase_price) < 1e-6
        assert abs(h.current_value - h.shares * h.current_price) < 1e-6
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
        hoverlabel={"bgcolor": "#ffffff", "bordercolor": GRID, "font_size": 13},
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


def sector_concentration() -> go.Figure:
    ordered = sorted(SECTOR_VALUE.items(), key=lambda kv: kv[1])
    sectors = [s for s, _ in ordered]
    weights = [v / TOTAL_VALUE * 100 for _, v in ordered]
    top_sector = max(SECTOR_VALUE, key=lambda s: SECTOR_VALUE[s])
    bar_colors = [ACCENT if s == top_sector else "#c2ccd3" for s in sectors]

    fig = go.Figure(
        go.Bar(
            y=sectors,
            x=weights,
            orientation="h",
            marker={"color": bar_colors},
            text=[f"{w:.1f}%" for w in weights],
            textposition="outside",
            cliponaxis=False,
            hovertemplate="%{y}<br>Weight: %{x:.1f}%<extra></extra>",
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
        text=f"<b>{top_sector}: {TECH_WEIGHT:.1f}% — largest concentration</b>",
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


def return_vs_holding_period() -> go.Figure:
    values = [h.current_value for h in HOLDINGS]
    sizeref = _bubble_sizeref(values)

    fig = go.Figure()
    for asset_class in CLASS_ORDER:
        members = [h for h in HOLDINGS if h.asset_class == asset_class]
        if not members:
            continue
        fig.add_trace(
            go.Scatter(
                x=[h.purchase_date for h in members],
                y=[h.gain_pct for h in members],
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
                customdata=[[h.name, h.current_value] for h in members],
                hovertemplate="<b>%{text}</b> — %{customdata[0]}<br>Bought %{x}<br>Return: %{y:.1f}%<br>Value: $%{customdata[1]:,.0f}<extra></extra>",
            )
        )

    fig.add_hline(
        y=TOTAL_RETURN_PCT,
        line_width=1.4,
        line_dash="dot",
        line_color=NAVY,
        annotation_text=f"Portfolio {TOTAL_RETURN_PCT:+.1f}%",
        annotation_position="top left",
        annotation_font={"size": 11, "color": NAVY},
    )
    fig.add_hline(y=0, line_width=1.2, line_color=INK)
    fig.update_yaxes(
        title="Total return since purchase",
        range=[-80, 270],
        ticksuffix="%",
        gridcolor=GRID,
        zeroline=False,
    )
    fig.update_xaxes(
        title="Purchase date",
        type="date",
        gridcolor=GRID,
        dtick="M6",
        tickformat="%b %Y",
        tickangle=-40,
        tickfont={"size": 10},
    )
    return finish_figure(
        fig, height=440, left=66, right=30, bottom=76, showlegend=True
    ).update_layout(
        legend={
            "orientation": "h",
            "x": 0,
            "y": 1.1,
            "xanchor": "left",
            "yanchor": "bottom",
            "font": {"size": 11, "color": MUTED},
        }
    )


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
                y=[h.gain_pct for h in members],
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
                customdata=[[h.name, h.sharpe, h.current_value] for h in members],
                hovertemplate="<b>%{text}</b> — %{customdata[0]}<br>Volatility: %{x:.1f}%<br>Return: %{y:.1f}%<br>Sharpe: %{customdata[1]:.2f}<br>Value: $%{customdata[2]:,.0f}<extra></extra>",
            )
        )

    fig.add_vline(
        x=WEIGHTED_VOL,
        line_width=1.3,
        line_dash="dot",
        line_color=MUTED,
        annotation_text=f"Wtd. avg vol {WEIGHTED_VOL:.1f}%",
        annotation_position="top",
        annotation_font={"size": 10, "color": MUTED},
    )
    fig.add_hline(
        y=TOTAL_RETURN_PCT,
        line_width=1.3,
        line_dash="dot",
        line_color=NAVY,
        annotation_text=f"Portfolio return {TOTAL_RETURN_PCT:+.1f}%",
        annotation_position="bottom right",
        annotation_font={"size": 10, "color": NAVY},
    )
    fig.add_hline(y=0, line_width=1.2, line_color=INK)
    fig.update_yaxes(
        title="Total return since purchase",
        range=[-80, 270],
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
    return finish_figure(
        fig, height=440, left=66, right=30, showlegend=True
    ).update_layout(
        legend={
            "orientation": "h",
            "x": 0,
            "y": 1.1,
            "xanchor": "left",
            "yanchor": "bottom",
            "font": {"size": 11, "color": MUTED},
        }
    )


def risk_vs_capital_contribution() -> go.Figure:
    risk_raw = {h.ticker: weight(h) * h.volatility for h in HOLDINGS}
    risk_total = sum(risk_raw.values())
    rows = sorted(HOLDINGS, key=lambda h: risk_raw[h.ticker])

    tickers = [h.ticker for h in rows]
    capital_share = [weight(h) * 100 for h in rows]
    risk_share = [risk_raw[h.ticker] / risk_total * 100 for h in rows]

    fig = go.Figure()
    fig.add_trace(
        go.Bar(
            y=tickers,
            x=capital_share,
            orientation="h",
            name="Share of capital",
            marker={"color": "#c2ccd3"},
            text=[f"{v:.1f}%" for v in capital_share],
            textposition="outside",
            cliponaxis=False,
            hovertemplate="%{y}<br>Share of capital: %{x:.1f}%<extra></extra>",
        )
    )
    fig.add_trace(
        go.Bar(
            y=tickers,
            x=risk_share,
            orientation="h",
            name="Share of portfolio risk",
            marker={"color": NEGATIVE_COLOR},
            text=[f"{v:.1f}%" for v in risk_share],
            textposition="outside",
            cliponaxis=False,
            hovertemplate="%{y}<br>Share of risk: %{x:.1f}%<extra></extra>",
        )
    )
    fig.update_layout(barmode="group", bargap=0.28, bargroupgap=0.12)
    fig.update_yaxes(showgrid=False)
    fig.update_xaxes(
        title="Share of portfolio (capital vs. risk)",
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
        y=1.06,
        xanchor="right",
        text="<b>Risk share &gt; capital share = outsized risk</b>",
        showarrow=False,
        font={"size": 12, "color": NEGATIVE_COLOR},
    )
    return finish_figure(
        fig, height=520, left=58, right=48, showlegend=True
    ).update_layout(
        legend={
            "orientation": "h",
            "x": 0,
            "y": 1.05,
            "xanchor": "left",
            "yanchor": "bottom",
            "font": {"size": 11, "color": MUTED},
        }
    )


validate_data()

DASHBOARD = {
    "eyebrow": "Balanced Growth Portfolio · As of December 31, 2024",
    "headline": "A tech-tilted growth portfolio: where the money sits, how it performed, and where the risk hides.",
    "summary": (
        "Fourteen holdings worth $491,650 are examined through three lenses — asset allocation, "
        "performance, and risk. The same portfolio is read three ways so that composition, returns, "
        "and risk concentration can each be judged on their own terms."
    ),
    "kpis": [
        {"label": "Portfolio value", "value": "$491.7K", "delta": f"{TOTAL_RETURN_PCT:+.1f}% total return", "tone": "positive"},
        {"label": "Total gain / loss", "value": f"+${TOTAL_GAIN / 1000:,.1f}K", "delta": f"{WINNERS} of {len(HOLDINGS)} holdings up", "tone": "positive"},
        {"label": "Weighted beta", "value": f"{WEIGHTED_BETA:.2f}", "delta": "vs. 1.00 market", "tone": "neutral"},
        {"label": "Technology weight", "value": f"{TECH_WEIGHT:.1f}%", "delta": "largest sector", "tone": "neutral"},
    ],
    "groups": [
        {
            "label": "Asset allocation",
            "title": "Equities dominate, and Technology is the single largest bet.",
            "description": (
                "The treemap maps every position by market value; the ranked bar isolates sector weights "
                "and flags the portfolio's concentration in Technology."
            ),
            "slugs": ["portfolio-allocation-treemap", "sector-allocation-concentration"],
        },
        {
            "label": "Performance over time",
            "title": "A few winners carried the portfolio; entry timing explains much of the spread.",
            "description": (
                "The bridge decomposes each holding's contribution to total profit and loss; the scatter "
                "relates each position's return to when it was purchased."
            ),
            "slugs": ["portfolio-gain-loss-bridge", "return-vs-holding-period"],
        },
        {
            "label": "Risk analysis",
            "title": "High-volatility positions carry more risk than their size suggests.",
            "description": (
                "The risk-return scatter locates every holding against portfolio averages; the contribution "
                "bars compare each position's share of capital with its share of portfolio risk."
            ),
            "slugs": ["risk-return-profile", "risk-vs-capital-contribution"],
        },
    ],
}

FIGURES = [
    {
        "title": "Where the $491.7K sits: a tech-heavy, equity-dominated mix",
        "slug": "portfolio-allocation-treemap",
        "description": "Portfolio market value broken down by sector and then by individual holding.",
        "takeaway": "Technology (Apple, Microsoft, NVIDIA) is the largest sector, and individual stocks outweigh the diversifying funds.",
        "audience": "Asset allocation · Composition map",
        "figure": allocation_treemap(),
    },
    {
        "title": "Technology is the largest concentration at 26% of assets",
        "slug": "sector-allocation-concentration",
        "description": "Each sector's share of total portfolio value, ranked to surface concentration.",
        "takeaway": "No single sector besides Technology exceeds 10%, but the tech tilt drives both the portfolio's upside and its volatility.",
        "audience": "Asset allocation · Sector concentration",
        "figure": sector_concentration(),
    },
    {
        "title": "The portfolio gained $39.9K — but the result is highly uneven",
        "slug": "portfolio-gain-loss-bridge",
        "description": "A waterfall from total cost basis to current value, with each holding's dollar contribution.",
        "takeaway": "VTI, NVDA, and MSFT drove most of the gain, while AMZN and BND together erased nearly $29K.",
        "audience": "Performance · Contribution to P&L",
        "figure": pnl_waterfall(),
    },
    {
        "title": "Longer-held and well-timed positions delivered the biggest returns",
        "slug": "return-vs-holding-period",
        "description": "Each holding's total return since purchase, plotted against its purchase date and sized by current value.",
        "takeaway": "Positions bought in 2020-2021 (VTI, MSFT) generally outperformed; AMZN is the clear outlier despite an early entry.",
        "audience": "Performance · Return vs holding period",
        "figure": return_vs_holding_period(),
    },
    {
        "title": "Risk and reward: NVIDIA is the high-risk, high-return corner",
        "slug": "risk-return-profile",
        "description": "Annualized volatility versus total return, sized by position value, against portfolio averages.",
        "takeaway": "BND anchors the low-risk corner, NVDA/VTI reward their risk, and AMZN carries high volatility with a deep loss.",
        "audience": "Risk · Risk–return profile",
        "figure": risk_return_scatter(),
    },
    {
        "title": "Which positions punch above their weight in risk",
        "slug": "risk-vs-capital-contribution",
        "description": "Each holding's share of invested capital compared with its share of portfolio risk (weight × volatility).",
        "takeaway": "NVDA, AMZN, and XOM contribute more risk than capital, while BND and PG dampen it.",
        "audience": "Risk · Capital vs risk",
        "figure": risk_vs_capital_contribution(),
    },
]
