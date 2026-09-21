from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from src.data.catalog import INDICATORS
from src.data.providers.fred import fetch_fred_indicators, fetch_fred_series
from src.data.providers.world_bank import fetch_wb_countries, fetch_wb_series

ASSIGNMENT = "week-05"
ASSIGNMENT_LABEL = "Week 5"
ASSIGNMENT_TITLE = "Macroeconomic Monitoring Terminal"

INK = "#151515"
MUTED = "#666b72"
LINE = "#d8dadd"
ACCENT = "#0d7f6f"
NEGATIVE = "#d1495b"
NEUTRAL = "#2f4858"

TODAY = pd.Timestamp.now(tz="UTC").normalize()


def years_ago(years: int) -> str:
    return (TODAY - pd.DateOffset(years=years)).date().isoformat()


def apply_finance_theme(figure: go.Figure, height: int = 450) -> go.Figure:
    figure.update_layout(
        height=height,
        margin={"t": 60, "r": 28, "b": 76, "l": 64},
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        font={"family": "Inter, Arial, sans-serif", "color": INK},
        dragmode=False,
        hovermode="x unified",
        legend={
            "orientation": "h",
            "y": 1.12,
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


def _latest_date(frame: pd.DataFrame | pd.Series) -> pd.Timestamp | None:
    if isinstance(frame, pd.Series):
        non_null = frame.dropna()
        return pd.Timestamp(non_null.index.max()) if not non_null.empty else None

    non_null = frame.dropna(how="all")
    return pd.Timestamp(non_null.index.max()) if not non_null.empty else None


def _fmt_latest(value: pd.Timestamp | str | int | None) -> str:
    if value is None:
        return "varies by release"
    if isinstance(value, pd.Timestamp):
        if value.tzinfo is not None:
            value = value.tz_convert(None)
        return value.strftime("%Y-%m-%d")
    return str(value)


def add_metadata_footer(
    fig: go.Figure,
    source_text: str,
    latest_observation: pd.Timestamp | str | int | None = None,
) -> None:
    retrieved = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    fig.add_annotation(
        text=(
            f"Data source: {source_text} | Latest observation: "
            f"{_fmt_latest(latest_observation)} | Retrieved: {retrieved}"
        ),
        xref="paper",
        yref="paper",
        x=0,
        y=-0.18,
        showarrow=False,
        font={"size": 10, "color": MUTED},
        xanchor="left",
        yanchor="top",
        align="left",
    )


# --- 1. U.S. Inflation & Policy Regime ---
def inflation_policy_regime() -> go.Figure:
    # Use monthly FEDFUNDS so the policy-rate series aligns with monthly CPI/PCE.
    df = fetch_fred_series(
        ["CPIAUCSL", "PCEPILFE", "FEDFUNDS"],
        years_ago(12),
    ).rename(
        columns={
            "CPIAUCSL": "cpi",
            "PCEPILFE": "core_pce",
            "FEDFUNDS": "fed_funds",
        }
    )

    df["cpi_yoy"] = df["cpi"].pct_change(12) * 100
    df["core_pce_yoy"] = df["core_pce"].pct_change(12) * 100
    plot_df = df[["cpi_yoy", "core_pce_yoy", "fed_funds"]].dropna()

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=plot_df.index,
            y=plot_df["cpi_yoy"],
            name="Headline CPI",
            line={"color": NEGATIVE, "width": 1.8, "dash": "dash"},
        )
    )
    fig.add_trace(
        go.Scatter(
            x=plot_df.index,
            y=plot_df["core_pce_yoy"],
            name="Core PCE",
            line={"color": "#e07a5f", "width": 2.5},
        )
    )
    fig.add_trace(
        go.Scatter(
            x=plot_df.index,
            y=plot_df["fed_funds"],
            name="Fed Funds Rate",
            line={"color": NEUTRAL, "width": 2.5},
        )
    )

    fig.add_hline(
        y=2.0,
        line_dash="dot",
        line_color=MUTED,
        annotation_text="2% inflation objective",
        annotation_position="top left",
    )
    fig.update_yaxes(title="Percent (%)")
    add_metadata_footer(fig, "BLS and BEA; Federal Reserve via FRED", _latest_date(plot_df))
    return apply_finance_theme(fig)


# --- 2. Treasury Yield-Curve Regime ---
def yield_curve_regime() -> go.Figure:
    curve_keys = [
        "treasury_3m",
        "treasury_2y",
        "treasury_5y",
        "treasury_10y",
        "treasury_30y",
        "spread_10y_2y",
    ]
    df = fetch_fred_indicators(curve_keys, years_ago(20))

    curve_cols = ["treasury_3m", "treasury_2y", "treasury_5y", "treasury_10y", "treasury_30y"]
    complete_curve = df[curve_cols].dropna()
    if complete_curve.empty:
        raise ValueError("No complete Treasury yield-curve observations were returned.")

    latest_date = complete_curve.index[-1]
    latest = complete_curve.iloc[-1]

    one_year_target = latest_date - pd.DateOffset(years=1)
    one_year_ago = complete_curve.loc[:one_year_target].iloc[-1]

    pre_cycle_target = pd.Timestamp("2022-01-03")
    pre_cycle_candidates = complete_curve.loc[:pre_cycle_target]
    pre_cycle = pre_cycle_candidates.iloc[-1] if not pre_cycle_candidates.empty else complete_curve.iloc[0]

    labels = ["3M", "2Y", "5Y", "10Y", "30Y"]

    fig = make_subplots(
        rows=2,
        cols=1,
        row_heights=[0.45, 0.55],
        vertical_spacing=0.16,
        subplot_titles=("Curve snapshots", "10Y − 2Y spread"),
    )

    fig.add_trace(
        go.Scatter(
            x=labels,
            y=latest.values,
            name=f"Latest ({latest_date:%Y-%m-%d})",
            mode="lines+markers",
            line={"color": NEUTRAL, "width": 3},
        ),
        row=1,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=labels,
            y=one_year_ago.values,
            name=f"1 year earlier ({one_year_ago.name:%Y-%m-%d})",
            mode="lines+markers",
            line={"color": NEGATIVE, "width": 2, "dash": "dash"},
        ),
        row=1,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=labels,
            y=pre_cycle.values,
            name=f"Jan 2022 ({pre_cycle.name:%Y-%m-%d})",
            mode="lines+markers",
            line={"color": ACCENT, "width": 2, "dash": "dot"},
        ),
        row=1,
        col=1,
    )

    spread = df["spread_10y_2y"].dropna()
    fig.add_trace(
        go.Scatter(
            x=spread.index,
            y=spread,
            name="10Y − 2Y",
            line={"color": NEUTRAL, "width": 2},
            fill="tozeroy",
            fillcolor="rgba(47,72,88,0.08)",
        ),
        row=2,
        col=1,
    )
    fig.add_hline(y=0, line_dash="dash", line_color=MUTED, row=2, col=1)
    spread_min = min(float(spread.min()), -0.25)
    fig.add_hrect(
        y0=spread_min,
        y1=0,
        fillcolor="rgba(209,73,91,0.08)",
        line_width=0,
        row=2,
        col=1,
    )

    fig.update_yaxes(title="Yield (%)", row=1, col=1)
    fig.update_yaxes(title="Spread (pp)", row=2, col=1)
    fig.update_xaxes(title="Maturity", row=1, col=1)
    add_metadata_footer(fig, "Federal Reserve via FRED", latest_date)
    fig = apply_finance_theme(fig, height=650)
    fig.update_layout(hovermode="closest")
    return fig


# --- 3. Beveridge Curve ---
def beveridge_curve() -> go.Figure:
    df = fetch_fred_indicators(
        ["unemployment", "job_openings_rate"],
        "2005-01-01",
    ).dropna()

    years = df.index.year
    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=df["unemployment"],
            y=df["job_openings_rate"],
            mode="markers+lines",
            marker={
                "size": 6,
                "color": years,
                "colorscale": "Viridis",
                "showscale": True,
                "colorbar": {"title": "Year"},
            },
            line={"color": "rgba(0,0,0,0.10)", "width": 1},
            text=df.index.strftime("%Y-%m"),
            hovertemplate=(
                "Date: %{text}<br>Unemployment: %{x:.1f}%"
                "<br>Job openings rate: %{y:.1f}%<extra></extra>"
            ),
            name="Monthly observations",
        )
    )
    latest = df.iloc[-1]
    fig.add_trace(
        go.Scatter(
            x=[latest["unemployment"]],
            y=[latest["job_openings_rate"]],
            mode="markers",
            marker={"size": 13, "color": NEGATIVE, "line": {"color": "#ffffff", "width": 1.5}},
            name=f"Latest ({df.index[-1]:%Y-%m})",
            hovertemplate=(
                f"Latest: {df.index[-1]:%Y-%m}<br>"
                "Unemployment: %{x:.1f}%<br>Job openings rate: %{y:.1f}%<extra></extra>"
            ),
        )
    )

    # Conventional Beveridge plots put higher unemployment to the right.
    fig.update_xaxes(title="Unemployment rate (%)")
    fig.update_yaxes(title="Job openings rate (%)")
    fig.update_layout(hovermode="closest")
    add_metadata_footer(fig, "BLS via FRED", _latest_date(df))
    return apply_finance_theme(fig, height=500)


# --- 4. U.S. Economic Activity Pulse ---
def activity_pulse() -> go.Figure:
    df = fetch_fred_indicators(
        ["industrial_production", "retail_sales", "payrolls", "housing_starts"],
        "2000-01-01",
    )

    # Compounded 3-month change, annualized. A long baseline keeps the z-score
    # from being dominated by only the post-2019/COVID period.
    ratio_3m = df / df.shift(3)
    momentum = ((ratio_3m ** 4) - 1) * 100
    momentum = momentum.replace([float("inf"), float("-inf")], pd.NA)

    baseline_mean = momentum.mean(skipna=True)
    baseline_std = momentum.std(skipna=True).replace(0, pd.NA)
    z_scores = (momentum - baseline_mean) / baseline_std
    z_t = z_scores.tail(24).T
    z_t.index = ["Industrial production", "Real retail sales", "Payrolls", "Housing starts"]

    fig = px.imshow(
        z_t,
        color_continuous_scale="RdBu",
        color_continuous_midpoint=0,
        aspect="auto",
        zmin=-3,
        zmax=3,
        labels={"color": "Momentum z-score"},
    )
    fig.update_xaxes(title="Month")
    add_metadata_footer(fig, "Federal Reserve, Census and BLS via FRED", _latest_date(df))
    return apply_finance_theme(fig, height=480)


# --- 5. G7 Inflation Divergence ---
def g7_inflation() -> go.Figure:
    countries = ["CA", "FR", "DE", "IT", "JP", "GB", "US"]
    indicator = INDICATORS["g7_inflation"]["series_id"]
    df = fetch_wb_series(
        indicator,
        countries,
        TODAY.year - 12,
        TODAY.year,
    ).dropna(subset=[indicator])

    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    pivot_df = df.pivot(index="year", columns="country", values=indicator).sort_index()

    colors = {
        "United States": NEGATIVE,
        "United Kingdom": NEUTRAL,
        "Japan": ACCENT,
        "Germany": "#e07a5f",
        "France": "#3d5a80",
        "Italy": "#81b29a",
        "Canada": "#f2cc8f",
    }

    fig = go.Figure()
    for country in pivot_df.columns:
        fig.add_trace(
            go.Scatter(
                x=pivot_df.index,
                y=pivot_df[country],
                name=country,
                mode="lines+markers",
                line={"color": colors.get(country, "#777777"), "width": 2},
            )
        )

    fig.add_hline(y=2, line_dash="dot", line_color=MUTED)
    fig.update_yaxes(title="Annual CPI inflation (%)")
    fig.update_xaxes(dtick=1)
    add_metadata_footer(fig, "World Bank World Development Indicators", int(df["year"].max()))
    return apply_finance_theme(fig)


# --- 6. Global Growth: Latest Available Actual ---
def global_growth_map() -> go.Figure:
    indicator = INDICATORS["global_growth"]["series_id"]
    df = fetch_wb_series(
        indicator,
        "all",
        TODAY.year - 4,
        TODAY.year,
    ).dropna(subset=[indicator])
    metadata = fetch_wb_countries()

    def region_name(value):
        if isinstance(value, dict):
            return value.get("value")
        return value

    metadata = metadata.copy()
    metadata["region_name"] = metadata["region"].map(region_name)
    metadata = metadata.rename(columns={"name": "country_name", "iso3c": "iso3"})

    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    merged = df.merge(
        metadata[["country_name", "iso3", "region_name"]],
        left_on="country",
        right_on="country_name",
        how="left",
    )
    merged = merged[
        merged["iso3"].notna()
        & merged["region_name"].notna()
        & (merged["region_name"].astype(str).str.lower() != "aggregates")
    ]
    latest = (
        merged.sort_values("year")
        .groupby("iso3", as_index=False)
        .tail(1)
        .copy()
    )

    fig = px.choropleth(
        latest,
        locations="iso3",
        locationmode="ISO-3",
        color=indicator,
        hover_name="country",
        hover_data={"year": True, "iso3": False, indicator: ":.1f"},
        color_continuous_scale="RdBu",
        color_continuous_midpoint=0,
        labels={indicator: "Real GDP growth (%)", "year": "Latest year"},
    )
    fig.update_layout(
        height=500,
        margin={"t": 10, "r": 0, "b": 72, "l": 0},
        paper_bgcolor="#ffffff",
        font={"family": "Inter, Arial, sans-serif", "color": INK},
        geo={"showframe": False, "showcoastlines": True, "projection_type": "equirectangular"},
    )
    add_metadata_footer(
        fig,
        "World Bank World Development Indicators",
        f"latest available by country ({int(latest['year'].min())}–{int(latest['year'].max())})",
    )
    return fig


# --- 7. International Inflation vs Short-Rate Stance ---
def international_stance() -> go.Figure:
    # OECD immediate/overnight rates carried by FRED provide a consistent
    # cross-country short-rate proxy. They are not labeled as central-bank policy rates.
    short_rate_series = {
        "United States": "IRSTCI01USM156N",
        "United Kingdom": "IRSTCI01GBM156N",
        "Japan": "IRSTCI01JPM156N",
        "Canada": "IRSTCI01CAM156N",
        "Australia": "IRSTCI01AUM156N",
    }
    rate_df = fetch_fred_series(
        list(short_rate_series.values()),
        years_ago(3),
    )
    latest_rate_date = _latest_date(rate_df)

    inflation_indicator = "FP.CPI.TOTL.ZG"
    gdp_indicator = "NY.GDP.MKTP.CD"
    wb_codes = ["US", "GB", "JP", "CA", "AU"]
    inflation = fetch_wb_series(
        inflation_indicator,
        wb_codes,
        TODAY.year - 3,
        TODAY.year,
    ).dropna(subset=[inflation_indicator])
    gdp = fetch_wb_series(
        gdp_indicator,
        wb_codes,
        TODAY.year - 3,
        TODAY.year,
    ).dropna(subset=[gdp_indicator])

    inflation["year"] = pd.to_numeric(inflation["year"], errors="coerce")
    gdp["year"] = pd.to_numeric(gdp["year"], errors="coerce")
    inflation_latest = inflation.sort_values("year").groupby("country").tail(1)
    gdp_latest = gdp.sort_values("year").groupby("country").tail(1)

    inflation_map = inflation_latest.set_index("country")[inflation_indicator].to_dict()
    inflation_year_map = inflation_latest.set_index("country")["year"].to_dict()
    gdp_map = gdp_latest.set_index("country")[gdp_indicator].to_dict()

    rows = []
    for country, series_id in short_rate_series.items():
        rate_series = rate_df[series_id].dropna()
        if rate_series.empty or country not in inflation_map or country not in gdp_map:
            continue
        rows.append(
            {
                "Country": country,
                "Inflation": float(inflation_map[country]),
                "Short rate": float(rate_series.iloc[-1]),
                "Rate date": rate_series.index[-1].strftime("%Y-%m"),
                "Inflation year": int(inflation_year_map[country]),
                "GDP (USD bn)": float(gdp_map[country]) / 1e9,
            }
        )

    plot_df = pd.DataFrame(rows)
    if plot_df.empty:
        raise ValueError("No overlapping international inflation, GDP and short-rate data were returned.")

    fig = px.scatter(
        plot_df,
        x="Inflation",
        y="Short rate",
        size="GDP (USD bn)",
        color="Country",
        hover_name="Country",
        hover_data={
            "Inflation": ":.1f",
            "Short rate": ":.2f",
            "GDP (USD bn)": ":,.0f",
            "Rate date": True,
            "Inflation year": True,
        },
        size_max=45,
    )

    line_min = min(0.0, float(plot_df[["Inflation", "Short rate"]].min().min()))
    line_max = max(float(plot_df[["Inflation", "Short rate"]].max().max()), 1.0)
    fig.add_shape(
        type="line",
        x0=line_min,
        y0=line_min,
        x1=line_max,
        y1=line_max,
        line={"color": MUTED, "dash": "dash"},
    )
    fig.add_annotation(
        x=line_max,
        y=line_max,
        text="Short rate = inflation",
        showarrow=False,
        xanchor="right",
        yanchor="bottom",
        font={"size": 10, "color": MUTED},
    )
    fig.update_xaxes(title="Latest annual CPI inflation (%)")
    fig.update_yaxes(title="Latest OECD overnight / immediate rate (%)")
    fig.update_layout(hovermode="closest")
    add_metadata_footer(
        fig,
        "OECD immediate rates via FRED; World Bank inflation and GDP",
        latest_rate_date,
    )
    return apply_finance_theme(fig, height=500)


# --- 8. Global FX Regime Heatmap ---
def fx_heatmap() -> go.Figure:
    # Convert every quote into a common "USD strength" orientation before
    # calculating percentage changes. This avoids approximating reciprocal returns.
    series = {
        "Euro": ("DEXUSEU", "inverse"),
        "Japanese Yen": ("DEXJPUS", "direct"),
        "British Pound": ("DEXUSUK", "inverse"),
        "Canadian Dollar": ("DEXCAUS", "direct"),
        "Chinese Yuan": ("DEXCHUS", "direct"),
    }
    df = fetch_fred_series(
        [series_id for series_id, _ in series.values()],
        years_ago(2),
    ).ffill()

    strength = pd.DataFrame(index=df.index)
    for currency, (series_id, orientation) in series.items():
        quote = df[series_id]
        strength[currency] = (1 / quote) if orientation == "inverse" else quote

    strength = strength.dropna()
    latest = strength.iloc[-1]

    def prior(days: int) -> pd.Series:
        target = strength.index[-1] - pd.Timedelta(days=days)
        candidates = strength.loc[:target]
        return candidates.iloc[-1] if not candidates.empty else strength.iloc[0]

    changes = pd.DataFrame(
        {
            "1 Month": (latest / prior(30) - 1) * 100,
            "3 Month": (latest / prior(91) - 1) * 100,
            "12 Month": (latest / prior(365) - 1) * 100,
        }
    )

    fig = px.imshow(
        changes,
        color_continuous_scale="RdBu_r",
        color_continuous_midpoint=0,
        aspect="auto",
        text_auto=".1f",
        labels={"color": "USD strength change (%)"},
    )
    fig.update_xaxes(title="Horizon")
    add_metadata_footer(fig, "Federal Reserve H.10 via FRED", _latest_date(strength))
    return apply_finance_theme(fig)


# --- 9. Dollar & Commodity Shock Transmission ---
def commodity_shocks() -> go.Figure:
    df = fetch_fred_indicators(
        ["dollar_index", "wti_crude", "natural_gas"],
        "2020-01-01",
    ).ffill().dropna()

    indexed = (df / df.iloc[0]) * 100

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=indexed.index,
            y=indexed["dollar_index"],
            name="Broad dollar index",
            line={"color": NEUTRAL, "width": 2.5},
        )
    )
    fig.add_trace(
        go.Scatter(
            x=indexed.index,
            y=indexed["wti_crude"],
            name="WTI crude",
            line={"color": NEGATIVE, "width": 2},
        )
    )
    fig.add_trace(
        go.Scatter(
            x=indexed.index,
            y=indexed["natural_gas"],
            name="Henry Hub natural gas",
            line={"color": "#e07a5f", "width": 2},
        )
    )

    fig.add_hline(y=100, line_dash="dot", line_color=LINE)
    fig.update_yaxes(title="Index (2020 start = 100)")
    add_metadata_footer(fig, "Federal Reserve and EIA via FRED", _latest_date(df))
    return apply_finance_theme(fig)


FIGURES = [
    {
        "title": "U.S. Inflation & Policy Regime",
        "slug": "us-inflation-policy-regime",
        "description": "Headline CPI, core PCE and the monthly federal funds rate in one regime view, with the 2% inflation objective for context.",
        "figure": inflation_policy_regime(),
    },
    {
        "title": "Treasury Yield-Curve Regime",
        "slug": "treasury-yield-curve",
        "description": "Current, year-earlier and January 2022 curve snapshots paired with the long-run 10Y−2Y spread so curve shape and inversion history are not split across redundant charts.",
        "figure": yield_curve_regime(),
    },
    {
        "title": "Beveridge Curve (Labor Market Tightness)",
        "slug": "beveridge-curve",
        "description": "Monthly unemployment and job-openings rates plotted in labor-market phase space; color shows the historical path and the latest observation is highlighted.",
        "figure": beveridge_curve(),
    },
    {
        "title": "U.S. Economic Activity Pulse",
        "slug": "activity-pulse",
        "description": "A common z-score scale compares annualized three-month momentum in industrial production, real retail sales, payrolls and housing starts without four separate charts.",
        "figure": activity_pulse(),
    },
    {
        "title": "G7 Inflation Divergence",
        "slug": "g7-inflation",
        "description": "Comparable annual CPI inflation across the G7 shows whether price regimes are converging or diverging internationally.",
        "figure": g7_inflation(),
    },
    {
        "title": "Global Growth: Latest Available Actual",
        "slug": "global-growth-map",
        "description": "A country-only choropleth uses each economy's latest available World Bank real-GDP growth observation and excludes aggregate regions.",
        "figure": global_growth_map(),
    },
    {
        "title": "International Inflation vs Short-Rate Stance",
        "slug": "international-stance",
        "description": "Latest OECD overnight-rate proxies are compared with the latest annual inflation reading; bubble area represents nominal GDP. This is a cross-country stance proxy, not a claim that the short rate equals each central bank's policy rate.",
        "figure": international_stance(),
    },
    {
        "title": "Global FX Regime Heatmap",
        "slug": "fx-heatmap",
        "description": "Major bilateral quotes are normalized to a common USD-strength direction before calculating 1-, 3- and 12-month percentage changes.",
        "figure": fx_heatmap(),
    },
    {
        "title": "Dollar & Commodity Shock Transmission",
        "slug": "commodity-shocks",
        "description": "The broad dollar, WTI crude and Henry Hub natural gas are indexed to a common 2020 baseline to compare the scale and timing of major market shocks.",
        "figure": commodity_shocks(),
    },
]

DASHBOARD = {
    "eyebrow": "Macroeconomic Monitoring Terminal",
    "headline": "Automatically Refreshed Macroeconomic Dashboard",
    "summary": "Nine complementary views combine official statistical and market-data APIs into a compact macro framework: prices and policy, rates, labor, business-cycle momentum, global divergence, currencies and commodity transmission.",
    "kpis": [],
    "methodology": [
        {
            "label": "Refresh",
            "text": "Week 5 is regenerated automatically from current API observations; each chart displays its source, latest observation and retrieval date.",
        },
        {
            "label": "Data architecture",
            "text": "Provider adapters separate retrieval from visualization, with a freshness-aware local cache and stale-on-error fallback for resilient builds.",
        },
        {
            "label": "Sources",
            "text": "FRED (including Federal Reserve, BLS, BEA, EIA and OECD series) and World Bank World Development Indicators.",
        },
        {
            "label": "Comparison design",
            "text": "Related indicators are intentionally combined where they answer one analytical question, reducing redundant stand-alone charts.",
        },
    ],
    "groups": [
        {
            "label": "Block 1",
            "title": "Inflation, Monetary Policy & Rates",
            "description": "Are price pressures easing, how does short-rate policy compare with inflation, and what is the Treasury curve signaling?",
            "layout": "two-column",
            "slugs": ["us-inflation-policy-regime", "treasury-yield-curve", "international-stance"],
        },
        {
            "label": "Block 2",
            "title": "Labor Market & Business Cycle",
            "description": "How tight is the labor market, and is broad economic activity accelerating or weakening?",
            "layout": "two-column",
            "slugs": ["beveridge-curve", "activity-pulse"],
        },
        {
            "label": "Block 3",
            "title": "Global Divergence & Shock Transmission",
            "description": "How different are national inflation and growth regimes, and how are currency and commodity shocks moving across markets?",
            "layout": "two-column",
            "slugs": ["g7-inflation", "global-growth-map", "fx-heatmap", "commodity-shocks"],
        },
    ],
}
