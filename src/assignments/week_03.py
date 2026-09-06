from __future__ import annotations

from dataclasses import dataclass

import plotly.graph_objects as go

ASSIGNMENT = "week-03"
ASSIGNMENT_LABEL = "Week 03"
ASSIGNMENT_TITLE = "Visualizing financial statements"

INK = "#17212b"
MUTED = "#64707d"
GRID = "#e7eaed"
DTC_COLOR = "#0b7f73"
LINEAR_COLOR = "#314b5c"
NEGATIVE_COLOR = "#c94b5d"
CONTENT_COLOR = "#8a713c"
NEUTRAL = "#8b949e"
SOURCE = "Source: The Walt Disney Company, 2024 Annual Report (FY ended September 28, 2024)"

DATA = {
    "Linear Networks": {
        "2023": {"Revenue": 11701, "Operating Income": 4119},
        "2024": {"Revenue": 10692, "Operating Income": 3452},
    },
    "Direct-to-Consumer": {
        "2023": {
            "Subscription": 16420,
            "Advertising": 3260,
            "Other": 206,
            "Total Revenue": 19886,
            "Operating expenses": 17859,
            "SG&A and other": 4168,
            "Depreciation and amortization": 355,
            "Operating Income": -2496,
        },
        "2024": {
            "Subscription": 18796,
            "Advertising": 3707,
            "Other": 273,
            "Total Revenue": 22776,
            "Operating expenses": 17748,
            "SG&A and other": 4574,
            "Depreciation and amortization": 311,
            "Operating Income": 143,
        },
    },
    "Content Sales / Licensing": {
        "2023": {"Revenue": 9048, "Operating Income": -179},
        "2024": {"Revenue": 7718, "Operating Income": 328},
    },
    "Total Entertainment": {
        "2023": {"Revenue": 40635, "Operating Income": 1444},
        "2024": {"Revenue": 41186, "Operating Income": 3923},
    },
}

DTC = DATA["Direct-to-Consumer"]
LINEAR = DATA["Linear Networks"]
CONTENT = DATA["Content Sales / Licensing"]
ENTERTAINMENT = DATA["Total Entertainment"]


@dataclass(frozen=True)
class DumbbellRow:
    label: str
    y: int
    start: float
    end: float
    color: str
    start_text: str
    end_text: str
    delta_text: str


def operating_margin(income_m: float, revenue_m: float) -> float:
    return income_m / revenue_m * 100


def validate_data() -> None:
    for year in ("2023", "2024"):
        dtc = DTC[year]
        assert dtc["Subscription"] + dtc["Advertising"] + dtc["Other"] == dtc["Total Revenue"]
        assert (
            LINEAR[year]["Revenue"]
            + DTC[year]["Total Revenue"]
            + CONTENT[year]["Revenue"]
            == ENTERTAINMENT[year]["Revenue"]
        )

    drivers = [
        DTC["2024"]["Total Revenue"] - DTC["2023"]["Total Revenue"],
        DTC["2023"]["Operating expenses"] - DTC["2024"]["Operating expenses"],
        DTC["2023"]["SG&A and other"] - DTC["2024"]["SG&A and other"],
        DTC["2023"]["Depreciation and amortization"] - DTC["2024"]["Depreciation and amortization"],
    ]
    assert DTC["2023"]["Operating Income"] + sum(drivers) == DTC["2024"]["Operating Income"]


def finish_figure(
    fig: go.Figure,
    *,
    height: int,
    left: int,
    right: int,
    showlegend: bool = False,
) -> go.Figure:
    fig.update_layout(
        template=None,
        height=height,
        autosize=True,
        margin={"t": 34, "r": right, "b": 54, "l": left},
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        font={"family": "Inter, Arial, sans-serif", "color": INK, "size": 13},
        hoverlabel={"bgcolor": "#ffffff", "bordercolor": GRID, "font_size": 13},
        dragmode=False,
        showlegend=showlegend,
    )
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


def add_dumbbell(fig: go.Figure, row: DumbbellRow) -> None:
    fig.add_trace(
        go.Scatter(
            x=[row.start, row.end],
            y=[row.y, row.y],
            mode="lines",
            line={"color": row.color, "width": 5},
            hoverinfo="skip",
            showlegend=False,
        )
    )
    for value, text, year, filled, position in (
        (row.start, row.start_text, "2023", False, "bottom center" if row.y == 0 else "top center"),
        (row.end, row.end_text, "2024", True, "top center" if row.y == 0 else "bottom center"),
    ):
        fig.add_trace(
            go.Scatter(
                x=[value],
                y=[row.y],
                mode="markers+text",
                marker={
                    "size": 15,
                    "color": row.color if filled else "#ffffff",
                    "line": {"color": row.color, "width": 2 if filled else 3},
                },
                text=[text],
                textposition=position,
                textfont={"color": row.color, "size": 12},
                customdata=[[row.label, year]],
                hovertemplate="%{customdata[0]}<br>%{customdata[1]}: %{text}<extra></extra>",
                showlegend=False,
            )
        )

    fig.add_annotation(
        x=row.end,
        y=row.y,
        text=f"<b>{row.delta_text}</b>",
        showarrow=False,
        xshift=62 if row.y == 0 else -62,
        font={"size": 12, "color": row.color},
        bgcolor="#ffffff",
        borderpad=3,
    )


def dtc_profitability_drivers() -> go.Figure:
    labels = ["Revenue growth", "Lower operating expenses", "Higher SG&A", "Lower D&A"]
    values = [
        DTC["2024"]["Total Revenue"] - DTC["2023"]["Total Revenue"],
        DTC["2023"]["Operating expenses"] - DTC["2024"]["Operating expenses"],
        DTC["2023"]["SG&A and other"] - DTC["2024"]["SG&A and other"],
        DTC["2023"]["Depreciation and amortization"] - DTC["2024"]["Depreciation and amortization"],
    ]

    fig = go.Figure(
        go.Bar(
            y=labels,
            x=values,
            orientation="h",
            marker={"color": [DTC_COLOR if value >= 0 else NEGATIVE_COLOR for value in values]},
            text=[f"+${v:,.0f}M" if v >= 0 else f"-${abs(v):,.0f}M" for v in values],
            textposition="outside",
            cliponaxis=False,
            hovertemplate="%{y}<br>Contribution: $%{x:,.0f}M<extra></extra>",
        )
    )
    fig.update_yaxes(categoryorder="array", categoryarray=list(reversed(labels)), showgrid=False)
    fig.update_xaxes(
        title="Contribution to operating income improvement ($M)",
        range=[-750, 3250],
        gridcolor=GRID,
        zeroline=True,
        zerolinecolor=INK,
        zerolinewidth=1.5,
        tickformat=",",
    )
    fig.add_annotation(
        xref="paper",
        yref="paper",
        x=1,
        y=1.08,
        xanchor="right",
        text="<b>Net improvement: +$2.64B</b>",
        showarrow=False,
        font={"size": 13, "color": DTC_COLOR},
    )
    return finish_figure(fig, height=350, left=172, right=76)


def profit_engine_shift() -> go.Figure:
    fig = go.Figure()
    rows = [
        DumbbellRow("Linear Networks", 1, 4119, 3452, LINEAR_COLOR, "$4.12B", "$3.45B", "-$667M"),
        DumbbellRow("Streaming (DTC)", 0, -2496, 143, DTC_COLOR, "-$2.50B", "$0.14B", "+$2.64B"),
    ]
    for row in rows:
        add_dumbbell(fig, row)

    fig.update_yaxes(
        tickmode="array",
        tickvals=[0, 1],
        ticktext=["Streaming (DTC)", "Linear Networks"],
        range=[-0.55, 1.55],
        showgrid=False,
        zeroline=False,
    )
    fig.update_xaxes(
        title="Operating income ($M)",
        range=[-3000, 4700],
        gridcolor=GRID,
        zeroline=True,
        zerolinecolor=INK,
        zerolinewidth=2,
        tickformat=",",
    )
    fig.add_annotation(
        xref="paper",
        yref="paper",
        x=0,
        y=1.08,
        xanchor="left",
        text="○ 2023 &nbsp;&nbsp; ● 2024",
        showarrow=False,
        font={"size": 11, "color": MUTED},
    )
    return finish_figure(fig, height=330, left=138, right=62)


def entertainment_revenue_mix() -> go.Figure:
    fig = go.Figure()
    segments = [
        ("Direct-to-Consumer", "DTC", DTC_COLOR, lambda year: DTC[year]["Total Revenue"]),
        ("Linear Networks", "Linear", LINEAR_COLOR, lambda year: LINEAR[year]["Revenue"]),
        ("Content Sales / Licensing", "Content", CONTENT_COLOR, lambda year: CONTENT[year]["Revenue"]),
    ]
    years = ["2023", "2024"]

    for label, short_label, color, revenue_for_year in segments:
        raw = [revenue_for_year(year) for year in years]
        share = [raw[i] / ENTERTAINMENT[year]["Revenue"] * 100 for i, year in enumerate(years)]
        fig.add_trace(
            go.Bar(
                y=years,
                x=share,
                orientation="h",
                name=label,
                marker={"color": color},
                text=[f"{short_label} {value:.1f}%" for value in share],
                textposition="inside",
                insidetextanchor="middle",
                textfont={"color": "white", "size": 12},
                customdata=[[value] for value in raw],
                hovertemplate=f"{label}<br>%{{y}} revenue: $%{{customdata[0]:,.0f}}M<br>Mix: %{{x:.1f}}%<extra></extra>",
            )
        )

    fig = finish_figure(fig, height=300, left=72, right=28)
    fig.update_layout(barmode="stack")
    fig.update_yaxes(showgrid=False)
    fig.update_xaxes(
        title="Share of Entertainment revenue",
        range=[0, 100],
        ticksuffix="%",
        dtick=25,
        gridcolor=GRID,
        zeroline=False,
    )
    fig.add_vline(x=50, line_width=1, line_dash="dot", line_color=NEUTRAL)
    return fig


def operating_margin_shift() -> go.Figure:
    rows = [
        DumbbellRow(
            "Linear Networks",
            1,
            operating_margin(LINEAR["2023"]["Operating Income"], LINEAR["2023"]["Revenue"]),
            operating_margin(LINEAR["2024"]["Operating Income"], LINEAR["2024"]["Revenue"]),
            LINEAR_COLOR,
            "35.2%",
            "32.3%",
            "-2.9 pts",
        ),
        DumbbellRow(
            "Streaming (DTC)",
            0,
            operating_margin(DTC["2023"]["Operating Income"], DTC["2023"]["Total Revenue"]),
            operating_margin(DTC["2024"]["Operating Income"], DTC["2024"]["Total Revenue"]),
            DTC_COLOR,
            "-12.6%",
            "0.6%",
            "+13.2 pts",
        ),
    ]

    fig = go.Figure()
    for row in rows:
        add_dumbbell(fig, row)

    fig.update_yaxes(
        tickmode="array",
        tickvals=[0, 1],
        ticktext=["Streaming (DTC)", "Linear Networks"],
        range=[-0.55, 1.55],
        showgrid=False,
        zeroline=False,
    )
    fig.update_xaxes(
        title="Operating margin",
        range=[-18, 42],
        ticksuffix="%",
        dtick=10,
        gridcolor=GRID,
        zeroline=True,
        zerolinecolor=INK,
        zerolinewidth=2,
    )
    fig.add_annotation(
        xref="paper",
        yref="paper",
        x=0,
        y=1.08,
        xanchor="left",
        text="○ 2023 &nbsp;&nbsp; ● 2024",
        showarrow=False,
        font={"size": 11, "color": MUTED},
    )
    return finish_figure(fig, height=300, left=138, right=48)


validate_data()

DTC_REVENUE_GROWTH = (DTC["2024"]["Total Revenue"] / DTC["2023"]["Total Revenue"] - 1) * 100
DTC_MARGIN_2023 = operating_margin(DTC["2023"]["Operating Income"], DTC["2023"]["Total Revenue"])
DTC_MARGIN_2024 = operating_margin(DTC["2024"]["Operating Income"], DTC["2024"]["Total Revenue"])
LINEAR_OI_CHANGE = (LINEAR["2024"]["Operating Income"] / LINEAR["2023"]["Operating Income"] - 1) * 100

DASHBOARD = {
    "eyebrow": "The Walt Disney Company · FY2024",
    "headline": "Streaming crossed into profitability while legacy television continued to contract.",
    "summary": (
        "Disney's Direct-to-Consumer business swung from a $2.50B operating loss to a $143M profit "
        "as streaming became the majority of Entertainment revenue. At the same time, Linear Networks "
        "remained highly profitable but moved in the opposite direction."
    ),
    "kpis": [
        {"label": "DTC revenue", "value": "$22.8B", "delta": f"+{DTC_REVENUE_GROWTH:.1f}% YoY", "tone": "positive"},
        {"label": "DTC operating income", "value": "$143M", "delta": "+$2.64B YoY", "tone": "positive"},
        {"label": "DTC operating margin", "value": f"{DTC_MARGIN_2024:.1f}%", "delta": f"{DTC_MARGIN_2024 - DTC_MARGIN_2023:+.1f} pts", "tone": "positive"},
        {"label": "Linear Networks op. income", "value": "$3.45B", "delta": f"{LINEAR_OI_CHANGE:.1f}% YoY", "tone": "negative"},
    ],
    "groups": [
        {
            "label": "Board view",
            "title": "Operating drivers of the streaming turnaround",
            "description": "Revenue growth added $2.89B to DTC operating income, while higher SG&A offset $406M of the gain.",
            "slugs": ["dtc-profitability-bridge"],
        },
        {
            "label": "Investor view",
            "title": "Profit contribution is shifting from linear TV toward streaming",
            "description": "Linear Networks operating income fell $667M while DTC improved $2.64B and moved into profitability.",
            "slugs": ["linear-vs-dtc-operating-income"],
        },
        {
            "label": "Supporting context",
            "title": "Revenue mix and margin economics",
            "description": "DTC reached 55.3% of Entertainment revenue as its operating margin improved 13.2 points year over year.",
            "slugs": ["entertainment-revenue-mix", "operating-margin-shift"],
            "layout": "two-column",
        },
    ],
}

FIGURES = [
    {
        "title": "The $2.64B streaming turnaround was overwhelmingly revenue-driven",
        "slug": "dtc-profitability-bridge",
        "description": "Board view of the operating drivers behind Disney Direct-to-Consumer's improvement in operating income.",
        "takeaway": "Revenue growth contributed $2.89B of improvement, partially offset by $406M of higher SG&A.",
        "audience": "Board of directors",
        "figure": dtc_profitability_drivers(),
    },
    {
        "title": "Legacy TV still earns more — but streaming crossed the line into profit",
        "slug": "linear-vs-dtc-operating-income",
        "description": "Investor view comparing 2023 and 2024 operating income for Linear Networks and Direct-to-Consumer.",
        "takeaway": "Linear Networks lost $667M of operating income while DTC improved by $2.64B and became profitable.",
        "audience": "Potential investors",
        "figure": profit_engine_shift(),
    },
    {
        "title": "Streaming became the majority of Entertainment revenue",
        "slug": "entertainment-revenue-mix",
        "description": "Entertainment revenue mix shifted materially toward Direct-to-Consumer in FY2024.",
        "takeaway": "DTC rose from 48.9% to 55.3% of Entertainment revenue in one year.",
        "audience": "Supporting analysis",
        "figure": entertainment_revenue_mix(),
    },
    {
        "title": "Streaming margin recovered by 13.2 points",
        "slug": "operating-margin-shift",
        "description": "Before-and-after operating margin comparison for streaming and Linear Networks.",
        "takeaway": "DTC moved from a -12.6% margin to +0.6%, while Linear Networks compressed from 35.2% to 32.3%.",
        "audience": "Supporting analysis",
        "figure": operating_margin_shift(),
    },
]
