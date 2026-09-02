from __future__ import annotations

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots


ASSIGNMENT = "week-02"
ASSIGNMENT_LABEL = "Week 02"
ASSIGNMENT_TITLE = "Tools of financial visualization"

COMPANIES = ["TechCorp Inc.", "DataSystems LLC", "CloudServices Co."]
ACCENT = "#0d7f6f"
INK = "#151515"
MUTED = "#666b72"
LINE = "#d8dadd"


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
        # The top margin leaves room for the shared title, legend, and subplot labels.
        margin={"t": 156, "r": 44, "b": 72, "l": 72},
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        font={"family": "Inter, Arial, sans-serif", "color": INK},
        legend={
            "orientation": "h",
            # Keep the legend in its own band above the subplot titles.
            "y": 1.2,
            "x": 1,
            "xanchor": "right",
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


def spreadsheet_vs_python_view() -> go.Figure:
    data = long_revenue()
    # Aggregate to yearly totals for the left chart while preserving quarterly detail
    # for the right chart.
    annual = (
        data.groupby(["year", "company"], as_index=False)["revenue_millions"]
        .sum()
        .sort_values(["year", "company"])
    )

    figure = make_subplots(
        rows=1,
        cols=2,
        subplot_titles=(
            "Spreadsheet-ready: yearly grouped columns",
            "Plotly/Python: interactive quarterly detail",
        ),
        # Add extra gap so the right subplot title has room to breathe near the legend.
        horizontal_spacing=0.16,
    )

    colors = {
        "TechCorp Inc.": ACCENT,
        "DataSystems LLC": "#d1495b",
        "CloudServices Co.": "#2f4858",
    }
    for company in COMPANIES:
        annual_company = annual[annual["company"] == company]
        detail_company = data[data["company"] == company]
        figure.add_trace(
            go.Bar(
                x=annual_company["year"],
                y=annual_company["revenue_millions"],
                name=company,
                marker_color=colors[company],
                offsetgroup=company,
                legendgroup=company,
                hovertemplate=f"{company}<br>%{{x}}: $%{{y:.2f}}M<extra></extra>",
            ),
            row=1,
            col=1,
        )
        figure.add_trace(
            go.Scatter(
                x=detail_company["period_date"],
                y=detail_company["revenue_millions"],
                mode="lines+markers",
                name=company,
                line={"color": colors[company], "width": 3},
                marker={"size": 6},
                legendgroup=company,
                showlegend=False,
                customdata=detail_company[["period"]],
                hovertemplate=(
                    f"{company}<br>%{{customdata[0]}}: $%{{y:.2f}}M<extra></extra>"
                ),
            ),
            row=1,
            col=2,
        )

    figure.update_layout(
        title={
            "text": "Same dataset, different tool strengths",
            "x": 0.02,
            "xanchor": "left",
            "y": 0.98,
        },
        barmode="group",
    )
    # Nudge the subplot titles into a more stable position after the legend shift.
    figure.for_each_annotation(lambda annotation: annotation.update(y=1.01))
    figure.update_yaxes(title="Revenue ($M)", row=1, col=1)
    figure.update_yaxes(title="Revenue ($M)", row=1, col=2)
    figure.update_xaxes(title="Year", type="category", row=1, col=1)
    figure.update_xaxes(
        title="Quarter",
        rangeslider={"visible": True, "thickness": 0.08},
        row=1,
        col=2,
    )
    return apply_finance_theme(figure, height=760)


def tool_selection_matrix() -> go.Figure:
    criteria = [
        "Speed",
        "Accessibility",
        "Interactivity",
        "Reproducibility",
        "Large-data fit",
        "Design control",
    ]
    scores = {
        "Excel / Sheets": [5, 5, 2, 2, 2, 3],
        "Tableau / Power BI": [3, 3, 5, 3, 5, 4],
        "Python / Plotly": [2, 2, 5, 5, 4, 5],
    }
    score_frame = pd.DataFrame(scores, index=criteria)

    figure = go.Figure(
        data=go.Heatmap(
            z=score_frame.T.values,
            x=criteria,
            y=score_frame.columns,
            colorscale=[
                [0, "#f3f4f6"],
                [0.35, "#b7d7d2"],
                [0.7, "#4fa397"],
                [1, ACCENT],
            ],
            zmin=1,
            zmax=5,
            text=score_frame.T.values,
            texttemplate="%{text}",
            textfont={"color": INK, "size": 16},
            colorbar={"title": "Fit", "tickvals": [1, 3, 5]},
            hovertemplate="%{y}<br>%{x}: %{z}/5<extra></extra>",
        )
    )
    figure.update_layout(
        title={
            "text": "Audience-purpose tool fit matrix",
            "x": 0.02,
            "xanchor": "left",
        },
    )
    figure.update_xaxes(side="top")
    return apply_finance_theme(figure, height=620)


def growth_and_scale_dashboard() -> go.Figure:
    data = quarterly_revenue()
    totals = data[COMPANIES].sum().sort_values(ascending=True)
    growth = ((data.loc[data.index[-1], COMPANIES] / data.loc[data.index[0], COMPANIES]) - 1) * 100

    figure = make_subplots(
        rows=1,
        cols=2,
        specs=[[{"type": "bar"}, {"type": "bar"}]],
        subplot_titles=("Five-year revenue total", "Q1 2020 to Q4 2024 growth"),
        horizontal_spacing=0.18,
    )
    figure.add_trace(
        go.Bar(
            x=totals.values,
            y=totals.index,
            orientation="h",
            marker_color=[ACCENT, "#d1495b", "#2f4858"],
            hovertemplate="%{y}<br>Total revenue: $%{x:.2f}M<extra></extra>",
            text=[f"${value:.1f}M" for value in totals.values],
            textposition="outside",
            showlegend=False,
        ),
        row=1,
        col=1,
    )
    figure.add_trace(
        go.Bar(
            x=growth.index,
            y=growth.values,
            marker_color=[ACCENT, "#d1495b", "#2f4858"],
            hovertemplate="%{x}<br>Growth: %{y:.1f}%<extra></extra>",
            text=[f"{value:.0f}%" for value in growth.values],
            textposition="outside",
            showlegend=False,
        ),
        row=1,
        col=2,
    )
    figure.update_layout(
        title={
            "text": "BI-style summary: scale and growth answer different questions",
            "x": 0.02,
            "xanchor": "left",
        },
    )
    figure.update_xaxes(title="Revenue ($M)", row=1, col=1)
    figure.update_yaxes(title=None, row=1, col=1)
    figure.update_xaxes(tickangle=20, row=1, col=2)
    figure.update_yaxes(title="Growth", ticksuffix="%", row=1, col=2)
    return apply_finance_theme(figure, height=620)


FIGURES = [
    {
        "title": "Multi-tool revenue visualization",
        "slug": "multi-tool-revenue-visualization",
        "description": (
            "Uses the Week 2 assignment dataset to contrast a spreadsheet-friendly "
            "annual view with an interactive Plotly quarterly time series."
        ),
        "figure": spreadsheet_vs_python_view(),
    },
    {
        "title": "BI-style revenue summary",
        "slug": "bi-style-revenue-summary",
        "description": (
            "A dashboard-style comparison of total scale and growth, matching the Week 2 "
            "BI discussion about executive summaries, KPI monitoring, and drill-down needs."
        ),
        "figure": growth_and_scale_dashboard(),
    },
]
