from __future__ import annotations

import pandas as pd
import pandas_datareader.data as web
from pandas_datareader import wb
import plotly.graph_objects as go
from plotly.subplots import make_subplots

ASSIGNMENT = "week-05"
ASSIGNMENT_LABEL = "Week 5"
ASSIGNMENT_TITLE = "Global Inflation & Monetary Policy"

ACCENT = "#0d7f6f"
INK = "#151515"
MUTED = "#666b72"
LINE = "#d8dadd"

def apply_finance_theme(figure: go.Figure, height: int = 500) -> go.Figure:
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

def fetch_us_macro_data() -> pd.DataFrame:
    # Fetch from FRED
    # CPIAUCSL is the CPI Index. We need to compute YoY % change.
    # FEDFUNDS is the Fed Funds Rate.
    df = web.DataReader(["CPIAUCSL", "FEDFUNDS"], "fred", "2000-01-01", "2024-01-01")
    df["Inflation (YoY %)"] = df["CPIAUCSL"].pct_change(12) * 100
    df = df.dropna()
    return df

def us_inflation_vs_rates_view() -> go.Figure:
    df = fetch_us_macro_data()
    
    figure = go.Figure()
    figure.add_trace(
        go.Scatter(
            x=df.index,
            y=df["Inflation (YoY %)"],
            mode="lines",
            name="Inflation (YoY %)",
            line={"color": "#d1495b", "width": 3},
            hovertemplate="Inflation: %{y:.2f}%<extra></extra>",
        )
    )
    figure.add_trace(
        go.Scatter(
            x=df.index,
            y=df["FEDFUNDS"],
            mode="lines",
            name="Federal Funds Rate",
            line={"color": "#2f4858", "width": 3},
            hovertemplate="Fed Funds Rate: %{y:.2f}%<extra></extra>",
        )
    )
    
    figure.update_yaxes(title="Percentage (%)")
    figure.update_xaxes(title="Year")
    
    return apply_finance_theme(figure, height=450)

def fetch_g7_inflation() -> pd.DataFrame:
    # G7 Countries: Canada, France, Germany, Italy, Japan, UK, US
    countries = ["CA", "FR", "DE", "IT", "JP", "GB", "US"]
    df = wb.download(indicator="FP.CPI.TOTL.ZG", country=countries, start=2015, end=2023)
    df = df.reset_index()
    # rename column for clarity
    df = df.rename(columns={"FP.CPI.TOTL.ZG": "Inflation (%)"})
    # convert year to int
    df["year"] = df["year"].astype(int)
    return df

def g7_inflation_comparison_view() -> go.Figure:
    df = fetch_g7_inflation()
    
    # Pivot so each country is a line
    pivot_df = df.pivot(index="year", columns="country", values="Inflation (%)")
    
    figure = go.Figure()
    
    # Predefined colors for G7 to keep it consistent
    colors = {
        "United States": "#d1495b",
        "United Kingdom": "#2f4858",
        "Japan": "#0d7f6f",
        "Germany": "#e07a5f",
        "France": "#3d5a80",
        "Italy": "#81b29a",
        "Canada": "#f2cc8f"
    }
    
    for country in pivot_df.columns:
        color = colors.get(country, "#000000")
        figure.add_trace(
            go.Scatter(
                x=pivot_df.index,
                y=pivot_df[country],
                mode="lines+markers",
                name=country,
                line={"color": color, "width": 2},
                marker={"size": 6},
                hovertemplate=f"{country}<br>Year: %{{x}}<br>Inflation: %{{y:.2f}}%<extra></extra>",
            )
        )
        
    figure.update_yaxes(title="Inflation (Annual %)")
    figure.update_xaxes(title="Year", type="category")
    
    return apply_finance_theme(figure, height=450)

FIGURES = [
    {
        "title": "US Inflation vs Federal Funds Rate (2000-2024)",
        "slug": "us-inflation-vs-fed-funds",
        "description": "Comparing the US Consumer Price Index (YoY change) against the Federal Funds Rate, highlighting monetary policy responses to inflation.",
        "figure": us_inflation_vs_rates_view(),
    },
    {
        "title": "G7 Inflation Trajectories (2015-2023)",
        "slug": "g7-inflation-comparison",
        "description": "Annual inflation rates across G7 countries, showing the synchronized global inflation shock starting in 2021.",
        "figure": g7_inflation_comparison_view(),
    },
]

DASHBOARD = {
    "eyebrow": "Macroeconomic Trends",
    "headline": "Global Inflation & Monetary Policy Responses",
    "summary": "This report examines the return of global inflation and how central banks, particularly the Federal Reserve, have responded. By comparing historical US data and recent G7 inflation rates, we can identify synchronized global trends and policy mechanisms.",
    "kpis": [
        {"label": "US Inflation Peak (2022)", "value": "9.0%", "delta": "Highest since 1981", "tone": "negative"},
        {"label": "Fed Funds Peak (2023)", "value": "5.33%", "delta": "+500 bps from 2022", "tone": "neutral"},
        {"label": "G7 Average Peak (2022)", "value": "7.5%", "delta": "Broad-based shock", "tone": "negative"},
    ],
    "methodology": [
        {"label": "US Data", "text": "Federal Reserve Economic Data (FRED). CPIAUCSL for inflation and FEDFUNDS for the policy rate."},
        {"label": "Global Data", "text": "World Bank API (FP.CPI.TOTL.ZG) for annual consumer price inflation across G7 countries."},
    ],
    "groups": [
        {
            "label": "Temporal Analysis",
            "title": "The Federal Reserve's Dual Mandate in Action",
            "description": "The chart below tracks two decades of US monetary policy. Notice how the Fed Funds Rate is aggressively hiked when inflation spikes (e.g., 2004-2006, 2022-2023) and cut during crises (2001, 2008, 2020) to stimulate the economy. The recent hiking cycle represents the fastest monetary tightening in modern history.",
            "layout": "single-column",
            "slugs": ["us-inflation-vs-fed-funds"],
        },
        {
            "label": "Comparative Analysis",
            "title": "A Synchronized Global Shock",
            "description": "Inflation in the 2020s was not isolated to the US. Supply chain disruptions, pandemic stimulus, and energy shocks caused inflation to surge simultaneously across the G7. Japan, which historically battled deflation, also saw a notable increase, though significantly lower than Western counterparts.",
            "layout": "single-column",
            "slugs": ["g7-inflation-comparison"],
        },
    ],
}
