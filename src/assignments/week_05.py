from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
import numpy as np
from datetime import datetime

from src.data.providers.fred import fetch_fred_series
from src.data.providers.world_bank import fetch_wb_series
from src.data.catalog import INDICATORS

ASSIGNMENT = "week-05"
ASSIGNMENT_LABEL = "Week 5"
ASSIGNMENT_TITLE = "Macroeconomic Monitoring Terminal"

# --- Theme Configuration ---
INK = "#151515"
MUTED = "#666b72"
LINE = "#d8dadd"

def apply_finance_theme(figure: go.Figure, height: int = 450) -> go.Figure:
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

def add_metadata_footer(fig: go.Figure, source_text: str):
    fig.add_annotation(
        text=f"Source: {source_text} | Retrieved: {datetime.now().strftime('%Y-%m-%d')}",
        xref="paper", yref="paper",
        x=0, y=-0.15,
        showarrow=False,
        font=dict(size=10, color=MUTED),
        xanchor="left"
    )

# --- 1. U.S. Inflation & Policy Regime ---
def inflation_policy_regime() -> go.Figure:
    series = ["CPIAUCSL", "CPILFESL", "PCEPILFE", "DFF"]
    df = fetch_fred_series(series, "2014-01-01", "2024-12-31")
    
    # Calculate YoY % for price indexes
    for col in ["CPIAUCSL", "CPILFESL", "PCEPILFE"]:
        df[f"{col}_YoY"] = df[col].pct_change(12) * 100
        
    df = df.dropna()
    
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=df.index, y=df["CPIAUCSL_YoY"], name="Headline CPI", line=dict(color="#d1495b", width=1.5, dash="dash")))
    fig.add_trace(go.Scatter(x=df.index, y=df["PCEPILFE_YoY"], name="Core PCE", line=dict(color="#e07a5f", width=2.5)))
    fig.add_trace(go.Scatter(x=df.index, y=df["DFF"], name="Fed Funds Rate", line=dict(color="#2f4858", width=2.5)))
    
    fig.add_hline(y=2.0, line_dash="dot", line_color=MUTED, annotation_text="2% Target")
    
    fig.update_yaxes(title="Percentage (%)")
    add_metadata_footer(fig, "U.S. BLS and BEA via FRED")
    return apply_finance_theme(fig)

# --- 2. Treasury Yield-Curve Regime ---
def yield_curve_regime() -> go.Figure:
    series = ["DGS3MO", "DGS2", "DGS5", "DGS10", "DGS30"]
    df = fetch_fred_series(series, "2021-01-01", "2024-12-31").dropna()
    
    maturities = [0.25, 2, 5, 10, 30]
    labels = ["3M", "2Y", "5Y", "10Y", "30Y"]
    
    latest = df.iloc[-1]
    year_ago = df.iloc[-252] if len(df) > 252 else df.iloc[0]
    pre_hike = df.loc["2022-01-03"] if "2022-01-03" in df.index else df.iloc[0]
    
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=labels, y=latest, name="Latest", line=dict(color="#2f4858", width=3)))
    fig.add_trace(go.Scatter(x=labels, y=year_ago, name="1 Year Ago", line=dict(color="#d1495b", width=2, dash="dash")))
    fig.add_trace(go.Scatter(x=labels, y=pre_hike, name="Pre-Hiking Cycle (Jan 2022)", line=dict(color="#81b29a", width=2, dash="dot")))
    
    fig.update_yaxes(title="Yield (%)")
    fig.update_xaxes(title="Maturity")
    add_metadata_footer(fig, "Federal Reserve via FRED")
    return apply_finance_theme(fig)

# --- 3. Beveridge Curve ---
def beveridge_curve() -> go.Figure:
    df = fetch_fred_series(["UNRATE", "JTSJOR"], "2005-01-01", "2024-12-31").dropna()
    
    fig = go.Figure()
    # Color by year to show regime shift
    years = df.index.year
    fig.add_trace(go.Scatter(
        x=df["UNRATE"], 
        y=df["JTSJOR"], 
        mode="markers+lines",
        marker=dict(
            size=6,
            color=years,
            colorscale="Viridis",
            showscale=True,
            colorbar=dict(title="Year")
        ),
        line=dict(color="rgba(0,0,0,0.1)", width=1),
        text=df.index.strftime('%Y-%m'),
        hovertemplate="Date: %{text}<br>Unemployment: %{x}%<br>Job Openings Rate: %{y}%<extra></extra>",
        name="Beveridge Curve"
    ))
    
    fig.update_xaxes(title="Unemployment Rate (%)", autorange="reversed")
    fig.update_yaxes(title="Job Openings Rate (%)")
    # Custom legend/hover positioning since it's a scatter
    fig.update_layout(hovermode="closest")
    add_metadata_footer(fig, "U.S. BLS via FRED")
    return apply_finance_theme(fig, height=500)

# --- 4. U.S. Economic Activity Pulse ---
def activity_pulse() -> go.Figure:
    series = ["INDPRO", "RRSFS", "PAYEMS", "HOUST"]
    df = fetch_fred_series(series, "2019-01-01", "2024-12-31")
    
    # 3-month momentum (annualized)
    momentum = (df / df.shift(3) - 1) * (12/3) * 100
    momentum = momentum.dropna().tail(24) # Last 2 years
    
    # Standardize (z-score) based on historical rolling mean/std to make the heatmap comparable
    hist = (df / df.shift(3) - 1) * (12/3) * 100
    z_scores = (momentum - hist.mean()) / hist.std()
    
    # Transpose for heatmap
    z_t = z_scores.T
    z_t.index = ["Industrial Prod", "Real Retail Sales", "Payrolls", "Housing Starts"]
    
    fig = px.imshow(
        z_t, 
        color_continuous_scale="RdBu", 
        color_continuous_midpoint=0,
        aspect="auto",
        labels=dict(color="Z-Score")
    )
    
    fig.update_xaxes(title="Date")
    add_metadata_footer(fig, "Federal Reserve, Census, BLS via FRED")
    return apply_finance_theme(fig)

# --- 5. G7 Inflation Divergence ---
def g7_inflation() -> go.Figure:
    countries = ["CA", "FR", "DE", "IT", "JP", "GB", "US"]
    df = fetch_wb_series("FP.CPI.TOTL.ZG", countries, 2014, 2023)
    pivot_df = df.pivot(index="year", columns="country", values="FP.CPI.TOTL.ZG")
    
    fig = go.Figure()
    colors = {"United States": "#d1495b", "United Kingdom": "#2f4858", "Japan": "#0d7f6f", 
              "Germany": "#e07a5f", "France": "#3d5a80", "Italy": "#81b29a", "Canada": "#f2cc8f"}
              
    for country in pivot_df.columns:
        fig.add_trace(go.Scatter(
            x=pivot_df.index, y=pivot_df[country], 
            name=country, line=dict(color=colors.get(country, "#000"), width=2)
        ))
        
    fig.update_yaxes(title="Inflation (Annual % YoY)")
    fig.update_xaxes(type="category")
    add_metadata_footer(fig, "World Bank")
    return apply_finance_theme(fig)

# --- 6. Global Growth Outlook (Map) ---
def global_growth_map() -> go.Figure:
    df = fetch_wb_series("NY.GDP.MKTP.KD.ZG", "all", 2023, 2023)
    df = df.dropna(subset=["NY.GDP.MKTP.KD.ZG"])
    
    fig = px.choropleth(
        df,
        locations="country",
        locationmode="country names",
        color="NY.GDP.MKTP.KD.ZG",
        hover_name="country",
        color_continuous_scale="RdBu",
        color_continuous_midpoint=0,
        title=None,
    )
    fig.update_layout(
        margin={"t": 0, "r": 0, "b": 0, "l": 0},
        geo=dict(showframe=False, showcoastlines=True, projection_type='equirectangular')
    )
    add_metadata_footer(fig, "World Bank")
    return fig

# --- 7. International Monetary Stance ---
def international_stance() -> go.Figure:
    # Proxying stance using 2023 Inflation (World Bank) vs Policy Rates (End of 2023)
    # We will hardcode some policy rates for the scatter since WB doesn't have real-time daily policy rates
    # and fetching 10 different central bank rates from FRED is complex for a scatter.
    
    data = {
        "Country": ["US", "UK", "Euro Area", "Japan", "Canada", "Australia"],
        "Inflation": [4.1, 7.3, 5.4, 3.2, 3.9, 5.6],
        "Policy Rate": [5.33, 5.25, 4.00, -0.10, 5.00, 4.35],
        "GDP": [27360, 3340, 15000, 4212, 2140, 1720]
    }
    df = pd.DataFrame(data)
    
    fig = px.scatter(
        df, x="Inflation", y="Policy Rate", size="GDP", color="Country",
        hover_name="Country", size_max=40
    )
    
    # Add diagonal "Neutral" line where Policy Rate = Inflation
    fig.add_shape(type="line", x0=0, y0=0, x1=8, y1=8, line=dict(color=MUTED, dash="dash"))
    fig.add_annotation(x=7, y=7.5, text="Restrictive", showarrow=False)
    fig.add_annotation(x=7, y=6.5, text="Accommodative", showarrow=False)
    
    fig.update_layout(hovermode="closest")
    add_metadata_footer(fig, "World Bank & Central Bank Data")
    return apply_finance_theme(fig)

# --- 8. Global FX Regime Heatmap ---
def fx_heatmap() -> go.Figure:
    # Major bilateral rates against USD
    series = ["DEXUSEU", "DEXJPUS", "DEXUSUK", "DEXCAUS", "DEXCHUS"]
    df = fetch_fred_series(series, "2023-01-01", "2024-12-31").ffill().dropna()
    
    # Calculate returns
    latest = df.iloc[-1]
    m1 = df.iloc[-22] if len(df) > 22 else df.iloc[0]
    m3 = df.iloc[-65] if len(df) > 65 else df.iloc[0]
    m12 = df.iloc[-252] if len(df) > 252 else df.iloc[0]
    
    changes = pd.DataFrame({
        "1 Month": (latest / m1 - 1) * 100,
        "3 Month": (latest / m3 - 1) * 100,
        "12 Month": (latest / m12 - 1) * 100
    })
    
    # Standardize sign: Positive means USD is stronger
    # DEXUSEU is USD per EUR, so down means USD stronger -> invert
    # DEXJPUS is JPY per USD, so up means USD stronger -> keep
    changes.loc["DEXUSEU"] = -changes.loc["DEXUSEU"]
    changes.loc["DEXUSUK"] = -changes.loc["DEXUSUK"]
    
    changes.index = ["Euro", "Japanese Yen", "British Pound", "Canadian Dollar", "Chinese Yuan"]
    
    fig = px.imshow(
        changes, 
        color_continuous_scale="RdBu_r", # Red means USD stronger (foreign weaker)
        color_continuous_midpoint=0,
        aspect="auto",
        labels=dict(color="USD % Change")
    )
    add_metadata_footer(fig, "Federal Reserve via FRED")
    return apply_finance_theme(fig)

# --- 9. Dollar & Commodity Shock Transmission ---
def commodity_shocks() -> go.Figure:
    series = ["DTWEXBGS", "DCOILWTICO", "DHHNGSP"]
    df = fetch_fred_series(series, "2020-01-01", "2024-12-31").ffill().dropna()
    
    # Index to 100 at start
    df_indexed = (df / df.iloc[0]) * 100
    
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=df_indexed.index, y=df_indexed["DTWEXBGS"], name="Broad Dollar Index", line=dict(color="#2f4858", width=2)))
    fig.add_trace(go.Scatter(x=df_indexed.index, y=df_indexed["DCOILWTICO"], name="WTI Crude", line=dict(color="#d1495b", width=2)))
    fig.add_trace(go.Scatter(x=df_indexed.index, y=df_indexed["DHHNGSP"], name="Natural Gas", line=dict(color="#e07a5f", width=2)))
    
    fig.update_yaxes(title="Index (Start = 100)")
    add_metadata_footer(fig, "Federal Reserve & EIA via FRED")
    return apply_finance_theme(fig)

# --- Export Configuration ---

FIGURES = [
    {
        "title": "U.S. Inflation & Policy Regime",
        "slug": "us-inflation-policy-regime",
        "figure": inflation_policy_regime(),
    },
    {
        "title": "Treasury Yield-Curve Regime",
        "slug": "treasury-yield-curve",
        "figure": yield_curve_regime(),
    },
    {
        "title": "Beveridge Curve (Labor Market Tightness)",
        "slug": "beveridge-curve",
        "figure": beveridge_curve(),
    },
    {
        "title": "U.S. Economic Activity Pulse",
        "slug": "activity-pulse",
        "figure": activity_pulse(),
    },
    {
        "title": "G7 Inflation Divergence",
        "slug": "g7-inflation",
        "figure": g7_inflation(),
    },
    {
        "title": "Global Growth Outlook",
        "slug": "global-growth-map",
        "figure": global_growth_map(),
    },
    {
        "title": "International Monetary Stance",
        "slug": "international-stance",
        "figure": international_stance(),
    },
    {
        "title": "Global FX Regime Heatmap",
        "slug": "fx-heatmap",
        "figure": fx_heatmap(),
    },
    {
        "title": "Dollar & Commodity Shock Transmission",
        "slug": "commodity-shocks",
        "figure": commodity_shocks(),
    },
]

DASHBOARD = {
    "eyebrow": "Macroeconomic Monitoring Terminal",
    "headline": "Release-Live Macroeconomic Dashboard",
    "summary": "This dashboard is built around official statistical APIs, with each visualization answering a specific analytical question about the state of the global economy.",
    "kpis": [],
    "methodology": [
        {"label": "Data Architecture", "text": "Separate retrieval, normalization, and visualization layers. Cached via MacroClient."},
        {"label": "Sources", "text": "FRED, BLS, BEA, World Bank."},
    ],
    "groups": [
        {
            "label": "Block 1",
            "title": "Inflation & Monetary Policy",
            "description": "Are price pressures easing, and how restrictive is policy?",
            "layout": "two-column",
            "slugs": ["us-inflation-policy-regime", "treasury-yield-curve", "international-stance"],
        },
        {
            "label": "Block 2",
            "title": "Labor Market & Business Cycle",
            "description": "How tight is the labor market, and is economic activity accelerating or weakening?",
            "layout": "two-column",
            "slugs": ["beveridge-curve", "activity-pulse"],
        },
        {
            "label": "Block 3",
            "title": "Global Divergence & Trade",
            "description": "Which economies are experiencing different regimes, and how are shocks transmitting?",
            "layout": "two-column",
            "slugs": ["g7-inflation", "global-growth-map", "fx-heatmap", "commodity-shocks"],
        },
    ],
}
