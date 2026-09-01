from __future__ import annotations

import plotly.graph_objects as go
from plotly.subplots import make_subplots


ASSIGNMENT = "week-01"
ASSIGNMENT_LABEL = "Week 01"
ASSIGNMENT_TITLE = "Visualization design principles"


def design_cleanup_example() -> go.Figure:
    quarters = [
        "2020 Q1",
        "2020 Q2",
        "2020 Q3",
        "2020 Q4",
        "2021 Q1",
        "2021 Q2",
        "2021 Q3",
        "2021 Q4",
        "2022 Q1",
        "2022 Q2",
        "2022 Q3",
        "2022 Q4",
        "2023 Q1",
        "2023 Q2",
        "2023 Q3",
        "2023 Q4",
        "2024 Q1",
        "2024 Q2",
        "2024 Q3",
        "2024 Q4",
    ]
    revenue = [
        2.45,
        2.38,
        2.62,
        2.89,
        3.12,
        3.34,
        3.58,
        3.92,
        4.18,
        4.52,
        4.76,
        5.14,
        5.38,
        5.62,
        5.81,
        6.25,
        6.52,
        6.78,
        6.92,
        7.38,
    ]

    figure = make_subplots(
        rows=1,
        cols=2,
        subplot_titles=(
            "Default-style chart: too much visual noise",
            "Cleaned chart: title, contrast, and fewer distractions",
        ),
        horizontal_spacing=0.12,
    )
    figure.add_trace(
        go.Scatter(
            x=quarters,
            y=revenue,
            mode="lines",
            name="Revenue",
            line={"color": "#1f77b4", "width": 2},
            marker={"size": 6},
        ),
        row=1,
        col=1,
    )
    figure.add_trace(
        go.Scatter(
            x=quarters,
            y=revenue,
            mode="lines+markers",
            name="TechCorp revenue",
            line={"color": "#0d7f6f", "width": 4},
            marker={"color": "#0d7f6f", "size": 7},
            hovertemplate="%{x}<br>$%{y:.2f}M<extra></extra>",
        ),
        row=1,
        col=2,
    )
    figure.add_annotation(
        x="2024 Q4",
        y=7.38,
        text="Revenue triples by 2024",
        showarrow=True,
        arrowhead=2,
        ax=-90,
        ay=-54,
        bgcolor="#ffffff",
        bordercolor="#d8dadd",
        row=1,
        col=2,
    )
    figure.update_layout(
        title={
            "text": "Week 1 example: decluttering makes the financial trend easier to read",
            "x": 0.02,
            "xanchor": "left",
        },
        height=720,
        margin={"t": 100, "r": 42, "b": 90, "l": 68},
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        showlegend=False,
        font={"family": "Inter, Arial, sans-serif", "color": "#151515"},
    )
    figure.update_xaxes(tickangle=60, row=1, col=1)
    figure.update_yaxes(
        title="Revenue ($M)",
        gridcolor="#c7c9cc",
        zeroline=True,
        zerolinecolor="#9ca3af",
        row=1,
        col=1,
    )
    figure.update_xaxes(
        tickangle=60,
        tickfont={"size": 10, "color": "#666b72"},
        linecolor="#d8dadd",
        row=1,
        col=2,
    )
    figure.update_yaxes(
        title="Revenue ($M)",
        gridcolor="#ececea",
        zeroline=False,
        linecolor="#d8dadd",
        row=1,
        col=2,
    )
    return figure


FIGURES = [
    {
        "title": "Design cleanup: same data, clearer message",
        "slug": "design-cleanup-revenue-trend",
        "description": (
            "A course-connected Week 1 example showing how decluttering, direct annotation, "
            "and pre-attentive contrast change the readability of a financial trend."
        ),
        "figure": design_cleanup_example(),
    }
]
