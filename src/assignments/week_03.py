from __future__ import annotations

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
CONTENT_COLOR = "#c96b4b"
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


def _money_b(value_m: float) -> str:
    sign = "-" if value_m < 0 else ""
    return f"{sign}${abs(value_m) / 1000:.2f}B"


def _base_layout(fig: go.Figure, *, height: int, left: int = 82, right: int = 42) -> go.Figure:
    fig.update_layout(
        height=height,
        autosize=True,
        margin={"t": 34, "r": right, "b": 54, "l": left},
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        font={"family": "Inter, Arial, sans-serif", "color": INK, "size": 13},
        showlegend=False,
        hoverlabel={"bgcolor": "#ffffff", "bordercolor": GRID, "font_size": 13},
        dragmode=False,
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


def dtc_profitability_drivers() -> go.Figure:
    """Board view: isolate the drivers of the $2.639B DTC operating-income swing."""
    d23 = DATA["Direct-to-Consumer"]["2023"]
    d24 = DATA["Direct-to-Consumer"]["2024"]

    drivers = [
        "Revenue growth",
        "Lower operating expenses",
        "Higher SG&A",
        "Lower D&A",
    ]
    impacts = [
        d24["Total Revenue"] - d23["Total Revenue"],
        d23["Operating expenses"] - d24["Operating expenses"],
        d23["SG&A and other"] - d24["SG&A and other"],
        d23["Depreciation and amortization"] - d24["Depreciation and amortization"],
    ]
    assert d23["Operating Income"] + sum(impacts) == d24["Operating Income"]

    colors = [DTC_COLOR if value >= 0 else NEGATIVE_COLOR for value in impacts]
    labels = [f"+${v:,.0f}M" if v >= 0 else f"-${abs(v):,.0f}M" for v in impacts]

    fig = go.Figure(
        go.Bar(
            y=drivers,
            x=impacts,
            orientation="h",
            marker={"color": colors},
            text=labels,
            textposition="outside",
            cliponaxis=False,
            customdata=[[d23["Operating Income"], d24["Operating Income"]]] * len(drivers),
            hovertemplate=(
                "%{y}<br>Contribution: $%{x:,.0f}M"
                "<br>2023 DTC operating income: $%{customdata[0]:,.0f}M"
                "<br>2024 DTC operating income: $%{customdata[1]:,.0f}M<extra></extra>"
            ),
        )
    )
    fig.update_yaxes(
        categoryorder="array",
        categoryarray=list(reversed(drivers)),
        showgrid=False,
        tickfont={"size": 13, "color": INK},
    )
    fig.update_xaxes(
        title="Contribution to operating income improvement ($M)",
        range=[-750, 3250],
        zeroline=True,
        zerolinecolor=INK,
        zerolinewidth=1.5,
        gridcolor=GRID,
        tickformat=",",
    )
    fig.add_annotation(
        xref="paper",
        yref="paper",
        x=1,
        y=1.08,
        xanchor="right",
        showarrow=False,
        text="<b>Net improvement: +$2.64B</b>",
        font={"size": 13, "color": DTC_COLOR},
    )
    return _base_layout(fig, height=350, left=172, right=76)


def profit_engine_shift() -> go.Figure:
    """Investor view: compact before/after dumbbell chart around the profit threshold."""
    linear = [
        DATA["Linear Networks"]["2023"]["Operating Income"],
        DATA["Linear Networks"]["2024"]["Operating Income"],
    ]
    dtc = [
        DATA["Direct-to-Consumer"]["2023"]["Operating Income"],
        DATA["Direct-to-Consumer"]["2024"]["Operating Income"],
    ]

    fig = go.Figure()
    rows = [
        ("Linear Networks", 1, linear, LINEAR_COLOR, "-$667M"),
        ("Streaming (DTC)", 0, dtc, DTC_COLOR, "+$2.64B"),
    ]

    for label, y, values, color, delta in rows:
        fig.add_trace(
            go.Scatter(
                x=values,
                y=[y, y],
                mode="lines",
                line={"color": color, "width": 5},
                hoverinfo="skip",
                showlegend=False,
            )
        )
        fig.add_trace(
            go.Scatter(
                x=[values[0]],
                y=[y],
                mode="markers+text",
                marker={"size": 15, "color": "#ffffff", "line": {"color": color, "width": 3}},
                text=[_money_b(values[0])],
                textposition="bottom center" if y == 0 else "top center",
                textfont={"color": color, "size": 12},
                customdata=[[label, "2023"]],
                hovertemplate="%{customdata[0]}<br>%{customdata[1]}: %{text}<extra></extra>",
                showlegend=False,
            )
        )
        fig.add_trace(
            go.Scatter(
                x=[values[1]],
                y=[y],
                mode="markers+text",
                marker={"size": 15, "color": color, "line": {"color": color, "width": 2}},
                text=[_money_b(values[1])],
                textposition="top center" if y == 0 else "bottom center",
                textfont={"color": color, "size": 12},
                customdata=[[label, "2024"]],
                hovertemplate="%{customdata[0]}<br>%{customdata[1]}: %{text}<extra></extra>",
                showlegend=False,
            )
        )
        fig.add_annotation(
            x=values[1],
            y=y,
            text=f"<b>{delta}</b>",
            showarrow=False,
            xshift=62 if y == 0 else -62,
            yshift=0,
            font={"size": 12, "color": color},
            bgcolor="#ffffff",
            borderpad=3,
        )

    fig.update_yaxes(
        tickmode="array",
        tickvals=[0, 1],
        ticktext=["Streaming (DTC)", "Linear Networks"],
        range=[-0.55, 1.55],
        showgrid=False,
        zeroline=False,
        tickfont={"size": 13, "color": INK},
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
    return _base_layout(fig, height=330, left=138, right=62)


def entertainment_revenue_mix() -> go.Figure:
    totals = {
        "2023": DATA["Total Entertainment"]["2023"]["Revenue"],
        "2024": DATA["Total Entertainment"]["2024"]["Revenue"],
    }
    segments = [
        ("Direct-to-Consumer", DTC_COLOR, "Total Revenue"),
        ("Linear Networks", LINEAR_COLOR, "Revenue"),
        ("Content Sales / Licensing", CONTENT_COLOR, "Revenue"),
    ]

    fig = go.Figure()
    for segment, color, revenue_key in segments:
        values = []
        raw = []
        for year in ["2023", "2024"]:
            revenue = DATA[segment][year][revenue_key]
            values.append(revenue / totals[year] * 100)
            raw.append(revenue)
        fig.add_trace(
            go.Bar(
                y=["2023", "2024"],
                x=values,
                orientation="h",
                name=segment,
                marker={"color": color},
                text=[f"{v:.1f}%" for v in values],
                textposition="inside",
                insidetextanchor="middle",
                textfont={"color": "white", "size": 12},
                customdata=[[raw[0]], [raw[1]]],
                hovertemplate=f"{segment}<br>%{{y}} revenue: $%{{customdata[0]:,.0f}}M<br>Mix: %{{x:.1f}}%<extra></extra>",
            )
        )

    fig.update_layout(
        barmode="stack",
        showlegend=True,
        legend={"orientation": "h", "y": 1.10, "x": 0, "xanchor": "left"},
    )
    fig.update_yaxes(showgrid=False, tickfont={"size": 13, "color": INK})
    fig.update_xaxes(
        title="Share of Entertainment revenue",
        range=[0, 100],
        ticksuffix="%",
        dtick=25,
        gridcolor=GRID,
        zeroline=False,
    )
    fig.add_vline(x=50, line_width=1, line_dash="dot", line_color=NEUTRAL)
    fig.add_annotation(
        x=50,
        y=1.13,
        yref="paper",
        text="50% majority threshold",
        showarrow=False,
        font={"size": 10, "color": MUTED},
        bgcolor="#ffffff",
    )
    return _base_layout(fig, height=300, left=72, right=28)


def operating_margin_shift() -> go.Figure:
    dtc_23 = DATA["Direct-to-Consumer"]["2023"]
    dtc_24 = DATA["Direct-to-Consumer"]["2024"]
    linear_23 = DATA["Linear Networks"]["2023"]
    linear_24 = DATA["Linear Networks"]["2024"]

    rows = [
        (
            "Linear Networks",
            1,
            linear_23["Operating Income"] / linear_23["Revenue"] * 100,
            linear_24["Operating Income"] / linear_24["Revenue"] * 100,
            LINEAR_COLOR,
        ),
        (
            "Streaming (DTC)",
            0,
            dtc_23["Operating Income"] / dtc_23["Total Revenue"] * 100,
            dtc_24["Operating Income"] / dtc_24["Total Revenue"] * 100,
            DTC_COLOR,
        ),
    ]

    fig = go.Figure()
    for label, y, start, end, color in rows:
        fig.add_trace(
            go.Scatter(
                x=[start, end],
                y=[y, y],
                mode="lines",
                line={"color": color, "width": 5},
                hoverinfo="skip",
                showlegend=False,
            )
        )
        fig.add_trace(
            go.Scatter(
                x=[start],
                y=[y],
                mode="markers+text",
                marker={"size": 14, "color": "white", "line": {"color": color, "width": 3}},
                text=[f"{start:.1f}%"],
                textposition="bottom center" if y == 0 else "top center",
                textfont={"color": color},
                hovertemplate=f"{label}<br>2023 margin: {start:.2f}%<extra></extra>",
                showlegend=False,
            )
        )
        fig.add_trace(
            go.Scatter(
                x=[end],
                y=[y],
                mode="markers+text",
                marker={"size": 14, "color": color, "line": {"color": color, "width": 2}},
                text=[f"{end:.1f}%"],
                textposition="top center" if y == 0 else "bottom center",
                textfont={"color": color},
                hovertemplate=f"{label}<br>2024 margin: {end:.2f}%<extra></extra>",
                showlegend=False,
            )
        )
        delta = end - start
        fig.add_annotation(
            x=end,
            y=y,
            xshift=68 if y == 0 else -68,
            text=f"<b>{delta:+.1f} pts</b>",
            showarrow=False,
            font={"size": 12, "color": color},
            bgcolor="white",
        )

    fig.update_yaxes(
        tickmode="array",
        tickvals=[0, 1],
        ticktext=["Streaming (DTC)", "Linear Networks"],
        range=[-0.55, 1.55],
        showgrid=False,
        zeroline=False,
        tickfont={"size": 13, "color": INK},
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
    return _base_layout(fig, height=300, left=138, right=48)


DTC_REVENUE_GROWTH = (
    DATA["Direct-to-Consumer"]["2024"]["Total Revenue"]
    / DATA["Direct-to-Consumer"]["2023"]["Total Revenue"]
    - 1
) * 100
DTC_MARGIN_2023 = (
    DATA["Direct-to-Consumer"]["2023"]["Operating Income"]
    / DATA["Direct-to-Consumer"]["2023"]["Total Revenue"]
    * 100
)
DTC_MARGIN_2024 = (
    DATA["Direct-to-Consumer"]["2024"]["Operating Income"]
    / DATA["Direct-to-Consumer"]["2024"]["Total Revenue"]
    * 100
)
LINEAR_OI_CHANGE = (
    DATA["Linear Networks"]["2024"]["Operating Income"]
    / DATA["Linear Networks"]["2023"]["Operating Income"]
    - 1
) * 100

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
            "title": "What actually caused the streaming turnaround?",
            "description": "Focus on the operating drivers management can act on, not just the headline result.",
            "slugs": ["dtc-profitability-bridge"],
        },
        {
            "label": "Investor view",
            "title": "The profit engine is beginning to shift.",
            "description": "Show the strategic contrast quickly: legacy TV is declining while streaming crossed the profit threshold.",
            "slugs": ["linear-vs-dtc-operating-income"],
        },
        {
            "label": "Supporting context",
            "title": "The economics underneath the transition",
            "description": "Revenue mix and margin movement explain why the shift matters beyond one year's operating-income swing.",
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
