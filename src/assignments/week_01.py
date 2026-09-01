from __future__ import annotations

import math

import plotly.graph_objects as go


ASSIGNMENT = "week-01"
ASSIGNMENT_LABEL = "Week 01"
ASSIGNMENT_TITLE = "Example long Plotly graph"


def sample_long_plot() -> go.Figure:
    x = list(range(1, 181))
    baseline = [100 + value * 0.34 + math.sin(value / 7) * 6 for value in x]
    comparison = [94 + value * 0.42 + math.cos(value / 9) * 5 for value in x]

    figure = go.Figure()
    figure.add_trace(
        go.Scatter(
            x=x,
            y=baseline,
            mode="lines",
            name="Baseline",
            line={"color": "#0d7f6f", "width": 3},
        )
    )
    figure.add_trace(
        go.Scatter(
            x=x,
            y=comparison,
            mode="lines",
            name="Comparison",
            line={"color": "#151515", "width": 2},
        )
    )
    figure.update_layout(
        title={"text": "Long Plotly Export Example", "x": 0.02, "xanchor": "left"},
        height=1180,
        margin={"t": 72, "r": 42, "b": 64, "l": 68},
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        xaxis={"title": "Observation", "gridcolor": "#ececea", "zeroline": False},
        yaxis={"title": "Indexed value", "gridcolor": "#ececea", "zeroline": False},
        legend={"orientation": "h", "y": 1.04, "x": 1, "xanchor": "right"},
    )
    return figure


FIGURES = [
    {
        "title": "Example long Plotly graph",
        "slug": "sample-long-plot",
        "figure": sample_long_plot(),
    }
]
