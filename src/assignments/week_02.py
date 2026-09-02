from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go


ASSIGNMENT = "week-02"
ASSIGNMENT_LABEL = "Week 02"
ASSIGNMENT_TITLE = "Tools of financial visualization"

COMPANIES = ["TechCorp Inc.", "DataSystems LLC", "CloudServices Co."]
ACCENT = "#0d7f6f"
INK = "#151515"
MUTED = "#666b72"
LINE = "#d8dadd"
COLORS = {
    "TechCorp Inc.": ACCENT,
    "DataSystems LLC": "#d1495b",
    "CloudServices Co.": "#2f4858",
}


def quarterly_revenue() -> pd.DataFrame:
    # Keep the raw dataset in a single wide table so the same source can feed both
    # the annual spreadsheet-friendly chart and the quarterly interactive view.
    rows = [
        ("Q1",2020,2450000,1820000,3100000),
        ("Q2",2020,2380000,1750000,3250000),
        ("Q3",2020,2620000,1890000,3450000),
        ("Q4",2020,2890000,2150000,3780000),
        ("Q1",2021,3120000,2280000,4020000),
        ("Q2",2021,3340000,2410000,4350000),
        ("Q3",2021,3580000,2590000,4680000),
        ("Q4",2021,3920000,2890000,5120000),
        ("Q1",2022,4180000,3050000,5490000),
        ("Q2",2022,4520000,3220000,5830000),
        ("Q3",2022,4760000,3410000,6150000),
        ("Q4",2022,5140000,3780000,6620000),
        ("Q1",2023,5380000,3980000,6950000),
        ("Q2",2023,5620000,4150000,7280000),
        ("Q3",2023,5810000,4290000,7520000),
        ("Q4",2023,6250000,4680000,8100000),
        ("Q1",2024,6520000,4890000,8450000),
        ("Q2",2024,6780000,5040000,8790000),
        ("Q3",2024,6920000,5150000,8980000),
        ("Q4",2024,7380000,5620000,9650000),
    ]
    data = pd.DataFrame(rows, columns=["quarter", "year", *COMPANIES])
    data["period"] = data["year"].astype(str) + " " + data["quarter"]
    data["period_date"] = pd.PeriodIndex(
        data["year"].astype(str) + data["quarter"], freq="Q"
    ).to_timestamp()
    return data


def long_revenue() -> pd.DataFrame:
    return quarterly_revenue().melt(
        id_vars=["quarter", "year", "period", "period_date"],
        value_vars=COMPANIES,
        var_name="company",
        value_name="revenue_millions",
    )


def apply_finance_theme(figure: go.Figure, height: int = 720) -> go.Figure:
    figure.update_layout(
        height=height,
        # The page already labels each panel, so the chart canvas only needs room
        # for the legend and axes.
        margin={"t": 78, "r": 28, "b": 58, "l": 64},
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        font={"family": "Inter, Arial, sans-serif", "color": INK},
        dragmode=False,
        legend={
            "orientation": "h",
            "y": 1.08,
            "x": 0.5,
            "xanchor": "center",
            "title": None,
        },
        hoverlabel={"bgcolor": "#ffffff", "bordercolor": LINE, "font_size": 13},
    )
    figure.update_xaxes(
        showgrid=False,
        linecolor=LINE,
        tickfont={"color": MUTED},
        title_font={"color": MUTED},
    )
    figure.update_yaxes(
        gridcolor="#ececea",
        zeroline=False,
        linecolor=LINE,
        tickfont={"color": MUTED},
        title_font={"color": MUTED},
    )
    return figure


def annual_revenue_view() -> go.Figure:
    data = long_revenue()
    # Aggregate the quarterly source into spreadsheet-style annual totals.
    annual = (
        data.groupby(["year", "company"], as_index=False)["revenue_millions"]
        .sum()
        .sort_values(["year", "company"])
    )

    figure = go.Figure()
    for company in COMPANIES:
        annual_company = annual[annual["company"] == company]
        figure.add_trace(
            go.Bar(
                x=annual_company["year"],
                y=annual_company["revenue_millions"],
                name=company,
                marker_color=COLORS[company],
                offsetgroup=company,
                legendgroup=company,
                hovertemplate=f"{company}<br>%{{x}}: $%{{y:.2f}}M<extra></extra>",
            ),
        )

    figure.update_layout(barmode="group")
    figure.update_yaxes(title="Revenue ($M)")
    figure.update_xaxes(title="Year", type="category")
    return apply_finance_theme(figure, height=500)


def quarterly_revenue_view() -> go.Figure:
    data = long_revenue()
    figure = go.Figure()

    for company in COMPANIES:
        detail_company = data[data["company"] == company]
        figure.add_trace(
            go.Scatter(
                x=detail_company["period_date"],
                y=detail_company["revenue_millions"],
                mode="lines+markers",
                name=company,
                line={"color": COLORS[company], "width": 3},
                marker={"size": 6},
                legendgroup=company,
                customdata=detail_company[["period"]],
                hovertemplate=(
                    f"{company}<br>%{{customdata[0]}}: $%{{y:.2f}}M<extra></extra>"
                ),
            )
        )

    figure.update_yaxes(title="Revenue ($M)")
    figure.update_xaxes(title="Quarter")
    return apply_finance_theme(figure, height=500)


FIGURES = [
    {
        "title": "Annual revenue by company",
        "slug": "annual-revenue-by-company",
        "description": (
            "A spreadsheet-friendly grouped column chart summarizing yearly revenue."
        ),
        "figure": annual_revenue_view(),
    },
    {
        "title": "Quarterly revenue trend",
        "slug": "quarterly-revenue-trend",
        "description": (
            "An interactive Plotly time series showing quarterly revenue movement."
        ),
        "figure": quarterly_revenue_view(),
    },
]
