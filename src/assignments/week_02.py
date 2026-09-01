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
    rows = [
        ("Q1", 2020, 2.45, 1.82, 3.10),
        ("Q2", 2020, 2.38, 1.75, 3.25),
        ("Q3", 2020, 2.62, 1.89, 3.45),
        ("Q4", 2020, 2.89, 2.15, 3.78),
        ("Q1", 2021, 3.12, 2.28, 4.02),
        ("Q2", 2021, 3.34, 2.41, 4.35),
        ("Q3", 2021, 3.58, 2.59, 4.68),
        ("Q4", 2021, 3.92, 2.89, 5.12),
        ("Q1", 2022, 4.18, 3.05, 5.49),
        ("Q2", 2022, 4.52, 3.22, 5.83),
        ("Q3", 2022, 4.76, 3.41, 6.15),
        ("Q4", 2022, 5.14, 3.78, 6.62),
        ("Q1", 2023, 5.38, 3.98, 6.95),
        ("Q2", 2023, 5.62, 4.15, 7.28),
        ("Q3", 2023, 5.81, 4.29, 7.52),
        ("Q4", 2023, 6.25, 4.68, 8.10),
        ("Q1", 2024, 6.52, 4.89, 8.45),
        ("Q2", 2024, 6.78, 5.04, 8.79),
        ("Q3", 2024, 6.92, 5.15, 8.98),
        ("Q4", 2024, 7.38, 5.62, 9.65),
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
        margin={"t": 92, "r": 44, "b": 72, "l": 72},
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        font={"family": "Inter, Arial, sans-serif", "color": INK},
        legend={
            "orientation": "h",
            "y": 1.04,
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
        horizontal_spacing=0.13,
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
        },
        barmode="group",
    )
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
        "title": "Tool selection matrix",
        "slug": "tool-selection-matrix",
        "description": (
            "Turns the audience-purpose framework into a quick decision matrix across "
            "spreadsheets, BI platforms, and Python/Plotly."
        ),
        "figure": tool_selection_matrix(),
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
