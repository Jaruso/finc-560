from __future__ import annotations

import pandas as pd
import pandas_datareader.data as web
from pandas_datareader import wb
import plotly.graph_objects as go

ASSIGNMENT = "week-05"
ASSIGNMENT_LABEL = "Week 5"
ASSIGNMENT_TITLE = "Comprehensive Macroeconomic Trends"

ACCENT = "#0d7f6f"
INK = "#151515"
MUTED = "#666b72"
LINE = "#d8dadd"

def apply_finance_theme(figure: go.Figure, height: int = 400) -> go.Figure:
    figure.update_layout(
        height=height,
        margin={"t": 60, "r": 28, "b": 58, "l": 64},
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        font={"family": "Inter, Arial, sans-serif", "color": INK},
        dragmode=False,
        hovermode="x unified",
        legend={
            "orientation": "h",
            "y": 1.15,
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

def us_inflation_vs_rates_view() -> go.Figure:
    df = web.DataReader(["CPIAUCSL", "FEDFUNDS"], "fred", "2000-01-01", "2024-01-01")
    df["Inflation (YoY %)"] = df["CPIAUCSL"].pct_change(12) * 100
    df = df.dropna()
    figure = go.Figure()
    figure.add_trace(go.Scatter(x=df.index, y=df["Inflation (YoY %)"], name="Inflation", line={"color": "#d1495b", "width": 2}))
    figure.add_trace(go.Scatter(x=df.index, y=df["FEDFUNDS"], name="Fed Funds Rate", line={"color": "#2f4858", "width": 2}))
    figure.update_yaxes(title="Percentage (%)")
    return apply_finance_theme(figure)

def g7_inflation_comparison_view() -> go.Figure:
    countries = ["CA", "FR", "DE", "IT", "JP", "GB", "US"]
    df = wb.download(indicator="FP.CPI.TOTL.ZG", country=countries, start=2015, end=2023).reset_index()
    df["year"] = df["year"].astype(int)
    pivot_df = df.pivot(index="year", columns="country", values="FP.CPI.TOTL.ZG")
    figure = go.Figure()
    colors = {"United States": "#d1495b", "United Kingdom": "#2f4858", "Japan": "#0d7f6f", "Germany": "#e07a5f", "France": "#3d5a80", "Italy": "#81b29a", "Canada": "#f2cc8f"}
    for country in pivot_df.columns:
        figure.add_trace(go.Scatter(x=pivot_df.index, y=pivot_df[country], name=country, line={"color": colors.get(country, "#000"), "width": 2}))
    figure.update_yaxes(title="Inflation (Annual %)")
    figure.update_xaxes(type="category")
    return apply_finance_theme(figure)

def yield_curve_view() -> go.Figure:
    df = web.DataReader("T10Y2Y", "fred", "2000-01-01", "2024-01-01").dropna()
    figure = go.Figure()
    figure.add_trace(go.Scatter(x=df.index, y=df["T10Y2Y"], fill="tozeroy", name="10Y-2Y Spread", line={"color": "#3d5a80"}))
    figure.add_hline(y=0, line_color="#d1495b", line_dash="dash")
    figure.update_yaxes(title="Spread (%)")
    return apply_finance_theme(figure)

def unemployment_view() -> go.Figure:
    df = web.DataReader("UNRATE", "fred", "2000-01-01", "2024-01-01").dropna()
    figure = go.Figure()
    figure.add_trace(go.Scatter(x=df.index, y=df["UNRATE"], name="Unemployment Rate", line={"color": "#e07a5f", "width": 2}))
    figure.update_yaxes(title="Rate (%)")
    return apply_finance_theme(figure)

def participation_view() -> go.Figure:
    df = web.DataReader("CIVPART", "fred", "2000-01-01", "2024-01-01").dropna()
    figure = go.Figure()
    figure.add_trace(go.Scatter(x=df.index, y=df["CIVPART"], name="Participation Rate", line={"color": "#81b29a", "width": 2}))
    figure.update_yaxes(title="Rate (%)")
    return apply_finance_theme(figure)

def beveridge_curve_view() -> go.Figure:
    df = web.DataReader(["JTSJOL", "UNEMPLOY"], "fred", "2010-01-01", "2024-01-01").dropna()
    figure = go.Figure()
    figure.add_trace(go.Scatter(x=df.index, y=df["JTSJOL"]/1000, name="Job Openings", line={"color": "#0d7f6f", "width": 2}))
    figure.add_trace(go.Scatter(x=df.index, y=df["UNEMPLOY"]/1000, name="Unemployed", line={"color": "#d1495b", "width": 2}))
    figure.update_yaxes(title="Millions of People")
    return apply_finance_theme(figure)

def real_gdp_view() -> go.Figure:
    df = web.DataReader("GDPC1", "fred", "2000-01-01", "2024-01-01").dropna()
    figure = go.Figure()
    figure.add_trace(go.Scatter(x=df.index, y=df["GDPC1"], name="Real GDP", line={"color": "#2f4858", "width": 2}, fill="tozeroy"))
    figure.update_yaxes(title="Billions of Chained 2017 $")
    return apply_finance_theme(figure)

def global_gdp_growth_view() -> go.Figure:
    countries = ["US", "CN", "IN", "JP", "DE"]
    df = wb.download(indicator="NY.GDP.MKTP.KD.ZG", country=countries, start=2015, end=2023).reset_index()
    df["year"] = df["year"].astype(int)
    pivot_df = df.pivot(index="year", columns="country", values="NY.GDP.MKTP.KD.ZG")
    figure = go.Figure()
    colors = {"United States": "#d1495b", "China": "#e07a5f", "India": "#f2cc8f", "Japan": "#0d7f6f", "Germany": "#3d5a80"}
    for country in pivot_df.columns:
        figure.add_trace(go.Scatter(x=pivot_df.index, y=pivot_df[country], name=country, line={"color": colors.get(country, "#000"), "width": 2}))
    figure.update_yaxes(title="GDP Growth (%)")
    figure.update_xaxes(type="category")
    figure.add_hline(y=0, line_color=LINE, line_width=1)
    return apply_finance_theme(figure)

def dollar_index_view() -> go.Figure:
    df = web.DataReader("DTWEXBGS", "fred", "2010-01-01", "2024-01-01").dropna()
    figure = go.Figure()
    figure.add_trace(go.Scatter(x=df.index, y=df["DTWEXBGS"], name="Dollar Index", line={"color": "#81b29a", "width": 2}))
    figure.update_yaxes(title="Index (Jan 2006=100)")
    return apply_finance_theme(figure)


FIGURES = [
    {
        "title": "US Inflation vs Federal Funds Rate",
        "slug": "us-inflation-vs-fed-funds",
        "figure": us_inflation_vs_rates_view(),
    },
    {
        "title": "G7 Inflation Trajectories",
        "slug": "g7-inflation-comparison",
        "figure": g7_inflation_comparison_view(),
    },
    {
        "title": "Yield Curve Inversion (10Y-2Y Spread)",
        "slug": "yield-curve-inversion",
        "figure": yield_curve_view(),
    },
    {
        "title": "US Unemployment Rate",
        "slug": "us-unemployment-rate",
        "figure": unemployment_view(),
    },
    {
        "title": "US Labor Force Participation",
        "slug": "labor-force-participation",
        "figure": participation_view(),
    },
    {
        "title": "Job Openings vs Unemployed",
        "slug": "job-openings-vs-unemployed",
        "figure": beveridge_curve_view(),
    },
    {
        "title": "US Real GDP",
        "slug": "us-real-gdp",
        "figure": real_gdp_view(),
    },
    {
        "title": "Global GDP Growth (Major Economies)",
        "slug": "global-gdp-growth",
        "figure": global_gdp_growth_view(),
    },
    {
        "title": "Trade Weighted US Dollar Index",
        "slug": "us-dollar-index",
        "figure": dollar_index_view(),
    },
]

DASHBOARD = {
    "eyebrow": "Macroeconomic Trends",
    "headline": "Comprehensive Macroeconomic Dashboard",
    "summary": "This dashboard tracks 9 distinct macroeconomic indicators across 3 key categories: Inflation & Monetary Policy, Labor Market Dynamics, and Economic Output & Trade. By observing these interlocking pieces, we can form a holistic view of the global financial system.",
    "kpis": [],
    "methodology": [
        {"label": "Data Sources", "text": "Live data fetched via pandas-datareader from FRED (Federal Reserve Economic Data) and the World Bank API."},
    ],
    "groups": [
        {
            "label": "Part 1",
            "title": "Inflation & Monetary Policy",
            "description": "Tracking the global inflation shock, the central bank response, and the bond market's reaction (yield curve inversion).",
            "layout": "two-column",
            "slugs": ["us-inflation-vs-fed-funds", "g7-inflation-comparison", "yield-curve-inversion"],
        },
        {
            "label": "Part 2",
            "title": "Labor Market Dynamics",
            "description": "Evaluating the health of the US labor market through unemployment rates, participation, and the balance of job openings to unemployed persons.",
            "layout": "two-column",
            "slugs": ["us-unemployment-rate", "labor-force-participation", "job-openings-vs-unemployed"],
        },
        {
            "label": "Part 3",
            "title": "Growth & Trade",
            "description": "Tracking domestic output (Real GDP), comparative global growth, and the strength of the US Dollar.",
            "layout": "two-column",
            "slugs": ["us-real-gdp", "global-gdp-growth", "us-dollar-index"],
        },
    ],
}
