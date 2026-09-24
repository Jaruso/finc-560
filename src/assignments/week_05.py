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
        margin={"t": 60, "r": 32, "b": 104, "l": 72},
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
        automargin=True,
    )
    figure.update_yaxes(
        gridcolor="#ececea",
        zeroline=False,
        linecolor=LINE,
        tickfont={"color": MUTED},
        title_font={"color": MUTED},
        automargin=True,
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
        y=-0.12,
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
        margin={"t": 10, "r": 8, "b": 92, "l": 8},
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



# --- 10. Labor Supply & Wage Pressure ---
def labor_supply_wage_pressure() -> go.Figure:
    df = fetch_fred_indicators(
        ["labor_force_participation", "prime_age_epop", "average_hourly_earnings"],
        years_ago(15),
    )
    df["wage_growth_yoy"] = df["average_hourly_earnings"].pct_change(12) * 100

    fig = make_subplots(
        rows=2,
        cols=1,
        row_heights=[0.56, 0.44],
        vertical_spacing=0.14,
        shared_xaxes=True,
        subplot_titles=("Labor supply", "Nominal wage pressure"),
    )
    fig.add_trace(
        go.Scatter(
            x=df.index,
            y=df["labor_force_participation"],
            name="Labor force participation",
            line={"color": NEUTRAL, "width": 2.2},
        ),
        row=1,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=df.index,
            y=df["prime_age_epop"],
            name="Prime-age employment/population",
            line={"color": ACCENT, "width": 2.2},
        ),
        row=1,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=df.index,
            y=df["wage_growth_yoy"],
            name="Avg. hourly earnings YoY",
            line={"color": NEGATIVE, "width": 2.3},
        ),
        row=2,
        col=1,
    )
    fig.add_hline(y=0, line_dash="dot", line_color=LINE, row=2, col=1)
    fig.update_yaxes(title="Percent of population", row=1, col=1)
    fig.update_yaxes(title="YoY %", row=2, col=1)
    add_metadata_footer(fig, "U.S. Bureau of Labor Statistics via FRED", _latest_date(df))
    return apply_finance_theme(fig, height=610)


# --- 11. Leading vs Coincident Business-Cycle Signal ---
def leading_coincident_cycle() -> go.Figure:
    df = fetch_fred_indicators(
        ["oecd_cli", "cfnai_3m"],
        years_ago(20),
    )
    cli_gap = df["oecd_cli"] - 100

    fig = make_subplots(
        rows=2,
        cols=1,
        row_heights=[0.5, 0.5],
        vertical_spacing=0.15,
        shared_xaxes=True,
        subplot_titles=("OECD composite leading indicator", "Chicago Fed coincident activity"),
    )
    fig.add_trace(
        go.Scatter(
            x=df.index,
            y=cli_gap,
            name="CLI deviation from 100",
            line={"color": ACCENT, "width": 2.4},
            fill="tozeroy",
            fillcolor="rgba(13,127,111,0.08)",
        ),
        row=1,
        col=1,
    )
    fig.add_hline(y=0, line_dash="dash", line_color=MUTED, row=1, col=1)

    fig.add_trace(
        go.Scatter(
            x=df.index,
            y=df["cfnai_3m"],
            name="CFNAI 3-month average",
            line={"color": NEUTRAL, "width": 2.3},
            fill="tozeroy",
            fillcolor="rgba(47,72,88,0.08)",
        ),
        row=2,
        col=1,
    )
    fig.add_hline(y=0, line_dash="dash", line_color=MUTED, row=2, col=1)
    fig.update_yaxes(title="Index pts vs 100", row=1, col=1)
    fig.update_yaxes(title="Index", row=2, col=1)
    add_metadata_footer(
        fig,
        "OECD and Federal Reserve Bank of Chicago via FRED",
        _latest_date(df),
    )
    return apply_finance_theme(fig, height=610)


# --- 12. Global External Imbalances ---
def current_account_imbalances() -> go.Figure:
    indicator = "BN.CAB.XOKA.GD.ZS"
    df = fetch_wb_series(
        indicator,
        "all",
        TODAY.year - 4,
        TODAY.year,
    ).dropna(subset=[indicator])
    metadata = fetch_wb_countries().copy()

    def region_name(value):
        if isinstance(value, dict):
            return value.get("value")
        return value

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
        labels={indicator: "Current account (% GDP)", "year": "Latest year"},
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


# --- 13. Global Trade Momentum ---
def trade_momentum() -> go.Figure:
    export_indicator = "NE.EXP.GNFS.KD.ZG"
    import_indicator = "NE.IMP.GNFS.KD.ZG"
    countries = ["US", "KR", "DE", "JP", "GB", "CA", "MX", "IN"]

    exports = fetch_wb_series(
        export_indicator,
        countries,
        TODAY.year - 9,
        TODAY.year,
    ).dropna(subset=[export_indicator])
    imports = fetch_wb_series(
        import_indicator,
        countries,
        TODAY.year - 9,
        TODAY.year,
    ).dropna(subset=[import_indicator])

    for frame in (exports, imports):
        frame["year"] = pd.to_numeric(frame["year"], errors="coerce")

    export_pivot = exports.pivot(index="country", columns="year", values=export_indicator)
    import_pivot = imports.pivot(index="country", columns="year", values=import_indicator)

    desired_names = [
        "United States",
        "Korea, Rep.",
        "Germany",
        "Japan",
        "United Kingdom",
        "Canada",
        "Mexico",
        "India",
    ]
    common_years = sorted(set(export_pivot.columns).intersection(import_pivot.columns))[-6:]
    export_pivot = export_pivot.reindex(index=desired_names, columns=common_years)
    import_pivot = import_pivot.reindex(index=desired_names, columns=common_years)

    values = pd.concat(
        [export_pivot.stack(future_stack=True), import_pivot.stack(future_stack=True)]
    ).dropna()
    max_abs = max(float(values.abs().max()), 1.0)

    fig = make_subplots(
        rows=1,
        cols=2,
        horizontal_spacing=0.08,
        subplot_titles=("Real export growth", "Real import growth"),
    )
    fig.add_trace(
        go.Heatmap(
            z=export_pivot.values,
            x=[str(int(y)) for y in common_years],
            y=export_pivot.index,
            zmin=-max_abs,
            zmax=max_abs,
            zmid=0,
            colorscale="RdBu",
            colorbar={"title": "Annual %", "x": 0.46, "len": 0.82},
            hovertemplate="%{y}<br>%{x}<br>Export growth: %{z:.1f}%<extra></extra>",
        ),
        row=1,
        col=1,
    )
    fig.add_trace(
        go.Heatmap(
            z=import_pivot.values,
            x=[str(int(y)) for y in common_years],
            y=import_pivot.index,
            zmin=-max_abs,
            zmax=max_abs,
            zmid=0,
            colorscale="RdBu",
            showscale=False,
            hovertemplate="%{y}<br>%{x}<br>Import growth: %{z:.1f}%<extra></extra>",
        ),
        row=1,
        col=2,
    )
    fig.update_xaxes(title="Year", row=1, col=1)
    fig.update_xaxes(title="Year", row=1, col=2)
    # Put the second heatmap's country labels on its outer edge so long names
    # such as "United Kingdom" cannot be clipped in the inter-panel gap.
    fig.update_yaxes(side="right", row=1, col=2, automargin=True)
    add_metadata_footer(
        fig,
        "World Bank World Development Indicators",
        int(max(common_years)),
    )
    fig = apply_finance_theme(fig, height=560)
    fig.update_layout(margin={"t": 60, "r": 120, "b": 104, "l": 84})
    return fig


# --- 14. Fiscal Space Snapshot ---
def fiscal_space_snapshot() -> go.Figure:
    debt_series = {
        "United States": "QUSGAM770A",
        "Germany": "QDEGAM770A",
        "Japan": "QJPGAM770A",
        "United Kingdom": "QGBGAM770A",
    }
    yield_series = {
        "United States": "IRLTLT01USM156N",
        "Germany": "IRLTLT01DEM156N",
        "Japan": "IRLTLT01JPM156N",
        "United Kingdom": "IRLTLT01GBM156N",
    }

    debt_df = fetch_fred_series(list(debt_series.values()), years_ago(5))
    yield_df = fetch_fred_series(list(yield_series.values()), years_ago(3))
    gdp_indicator = "NY.GDP.MKTP.CD"
    gdp = fetch_wb_series(
        gdp_indicator,
        ["US", "DE", "JP", "GB"],
        TODAY.year - 3,
        TODAY.year,
    ).dropna(subset=[gdp_indicator])
    gdp["year"] = pd.to_numeric(gdp["year"], errors="coerce")
    gdp_latest = gdp.sort_values("year").groupby("country").tail(1)
    gdp_map = gdp_latest.set_index("country")[gdp_indicator].to_dict()
    gdp_year_map = gdp_latest.set_index("country")["year"].to_dict()

    rows = []
    for country in debt_series:
        debt = debt_df[debt_series[country]].dropna()
        yld = yield_df[yield_series[country]].dropna()
        if debt.empty or yld.empty or country not in gdp_map:
            continue
        rows.append(
            {
                "Country": country,
                "Government credit / GDP": float(debt.iloc[-1]),
                "10Y government yield": float(yld.iloc[-1]),
                "GDP (USD bn)": float(gdp_map[country]) / 1e9,
                "Debt date": f"{debt.index[-1].year} Q{((debt.index[-1].month - 1) // 3) + 1}",
                "Yield date": yld.index[-1].strftime("%Y-%m"),
                "GDP year": int(gdp_year_map[country]),
            }
        )

    plot_df = pd.DataFrame(rows)
    if plot_df.empty:
        raise ValueError("No overlapping fiscal-space data were returned.")

    fig = px.scatter(
        plot_df,
        x="Government credit / GDP",
        y="10Y government yield",
        size="GDP (USD bn)",
        color="Country",
        text="Country",
        size_max=55,
        hover_name="Country",
        hover_data={
            "Government credit / GDP": ":.1f",
            "10Y government yield": ":.2f",
            "GDP (USD bn)": ":,.0f",
            "Debt date": True,
            "Yield date": True,
            "GDP year": True,
        },
    )
    fig.update_traces(textposition="top center")
    fig.update_xaxes(title="General-government credit (% of GDP)")
    fig.update_yaxes(title="10-year government bond yield (%)")
    fig.update_layout(hovermode="closest")
    add_metadata_footer(
        fig,
        "BIS credit series and OECD bond yields via FRED; World Bank GDP",
        _latest_date(yield_df),
    )
    return apply_finance_theme(fig, height=520)


# --- 15. Credit Leverage & Debt-Service Pressure ---
def credit_cycle_risk() -> go.Figure:
    credit_series = {
        "United States": "QUSPAM770A",
        "China": "QCNPAM770A",
        "Japan": "QJPPAM770A",
        "Germany": "QDEPAM770A",
        "United Kingdom": "QGBPAM770A",
    }
    credit_df = fetch_fred_series(list(credit_series.values()), years_ago(12))

    rows = []
    for country, series_id in credit_series.items():
        series = credit_df[series_id].dropna()
        if series.empty:
            continue
        latest_date = series.index[-1]
        target = latest_date - pd.DateOffset(years=5)
        prior_candidates = series.loc[:target]
        prior = prior_candidates.iloc[-1] if not prior_candidates.empty else series.iloc[0]
        rows.append(
            {
                "Country": country,
                "Private credit / GDP": float(series.iloc[-1]),
                "5Y change": float(series.iloc[-1] - prior),
                "Latest quarter": f"{latest_date.year} Q{((latest_date.month - 1) // 3) + 1}",
            }
        )
    leverage = pd.DataFrame(rows)

    dsr = fetch_fred_series(["TDSP", "MDSP", "CDSP"], years_ago(15))

    fig = make_subplots(
        rows=2,
        cols=1,
        row_heights=[0.48, 0.52],
        vertical_spacing=0.17,
        subplot_titles=("Cross-country private leverage", "U.S. household debt-service burden"),
    )

    fig.add_trace(
        go.Scatter(
            x=leverage["Private credit / GDP"],
            y=leverage["5Y change"],
            mode="markers+text",
            text=leverage["Country"],
            textposition="top center",
            customdata=leverage[["Latest quarter"]],
            marker={"size": 16, "color": ACCENT, "line": {"color": "#ffffff", "width": 1}},
            hovertemplate=(
                "%{text}<br>Private credit/GDP: %{x:.1f}%"
                "<br>5Y change: %{y:+.1f} pp"
                "<br>Latest: %{customdata[0]}<extra></extra>"
            ),
            name="Private credit / GDP",
        ),
        row=1,
        col=1,
    )
    fig.add_hline(y=0, line_dash="dash", line_color=MUTED, row=1, col=1)

    fig.add_trace(
        go.Scatter(
            x=dsr.index,
            y=dsr["TDSP"],
            name="Total household DSR",
            line={"color": NEUTRAL, "width": 2.5},
        ),
        row=2,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=dsr.index,
            y=dsr["MDSP"],
            name="Mortgage DSR",
            line={"color": ACCENT, "width": 2},
        ),
        row=2,
        col=1,
    )
    fig.add_trace(
        go.Scatter(
            x=dsr.index,
            y=dsr["CDSP"],
            name="Consumer DSR",
            line={"color": NEGATIVE, "width": 2},
        ),
        row=2,
        col=1,
    )

    fig.update_xaxes(title="Private credit (% of GDP)", row=1, col=1)
    fig.update_yaxes(title="5-year change (pp)", row=1, col=1)
    fig.update_yaxes(title="% of disposable income", row=2, col=1)
    add_metadata_footer(
        fig,
        "BIS private-credit series and Federal Reserve household DSR via FRED",
        max(_latest_date(credit_df), _latest_date(dsr)),
    )
    fig = apply_finance_theme(fig, height=680)
    fig.update_layout(hovermode="closest")
    return fig


# --- 16. Labor-Force Participation by Gender & Geography ---
def gender_labor_force_participation() -> go.Figure:
    female_indicator = "SL.TLF.CACT.FE.ZS"
    male_indicator = "SL.TLF.CACT.MA.ZS"

    country_codes = ["US", "GB", "DE", "FR", "CA", "JP", "KR", "CN", "IN", "SA"]
    country_order = [
        "United States",
        "United Kingdom",
        "Germany",
        "France",
        "Canada",
        "Japan",
        "Korea, Rep.",
        "China",
        "India",
        "Saudi Arabia",
    ]

    female = fetch_wb_series(
        female_indicator,
        country_codes,
        1990,
        TODAY.year,
    ).dropna(subset=[female_indicator])
    male = fetch_wb_series(
        male_indicator,
        country_codes,
        1990,
        TODAY.year,
    ).dropna(subset=[male_indicator])

    female["year"] = pd.to_numeric(female["year"], errors="coerce")
    male["year"] = pd.to_numeric(male["year"], errors="coerce")

    female = female[female["country"].isin(country_order)].copy()
    male = male[male["country"].isin(country_order)].copy()

    fig = make_subplots(
        rows=5,
        cols=2,
        subplot_titles=country_order,
        vertical_spacing=0.08,
        horizontal_spacing=0.09,
    )

    panel_positions = {
        "United States": (1, 1),
        "United Kingdom": (1, 2),
        "Germany": (2, 1),
        "France": (2, 2),
        "Canada": (3, 1),
        "Japan": (3, 2),
        "Korea, Rep.": (4, 1),
        "China": (4, 2),
        "India": (5, 1),
        "Saudi Arabia": (5, 2),
    }

    for country in country_order:
        row, col = panel_positions[country]

        female_country = female[female["country"] == country][
            ["year", female_indicator]
        ].sort_values("year")
        male_country = male[male["country"] == country][
            ["year", male_indicator]
        ].sort_values("year")

        merged = female_country.merge(
            male_country,
            on="year",
            how="inner",
        ).dropna()

        if merged.empty:
            continue

        show_legend = country == "United States"

        # Draw women first, then men with fill='tonexty' so the shaded band
        # represents the participation gap between the two series.
        fig.add_trace(
            go.Scatter(
                x=merged["year"],
                y=merged[female_indicator],
                name="Women",
                legendgroup="Women",
                showlegend=show_legend,
                mode="lines",
                line={"color": ACCENT, "width": 2.6},
                hovertemplate=(
                    f"{country}<br>Women<br>%{{x:.0f}}: %{{y:.1f}}%<extra></extra>"
                ),
            ),
            row=row,
            col=col,
        )
        fig.add_trace(
            go.Scatter(
                x=merged["year"],
                y=merged[male_indicator],
                name="Men",
                legendgroup="Men",
                showlegend=show_legend,
                mode="lines",
                line={"color": NEUTRAL, "width": 2.6},
                fill="tonexty",
                fillcolor="rgba(47,72,88,0.12)",
                hovertemplate=(
                    f"{country}<br>Men<br>%{{x:.0f}}: %{{y:.1f}}%<extra></extra>"
                ),
            ),
            row=row,
            col=col,
        )

        fig.update_yaxes(range=[0, 100], row=row, col=col)
        fig.update_xaxes(tickformat="d", row=row, col=col)

    for row in range(1, 6):
        fig.update_yaxes(title="Participation rate (%)", row=row, col=1)

    fig.update_xaxes(title="Year", row=5, col=1)
    fig.update_xaxes(title="Year", row=5, col=2)

    latest_year = int(
        max(
            female["year"].dropna().max(),
            male["year"].dropna().max(),
        )
    )
    add_metadata_footer(
        fig,
        "ILO modeled participation estimates via World Bank World Development Indicators",
        latest_year,
    )

    fig = apply_finance_theme(fig, height=1500)
    fig.update_layout(
        hovermode="closest",
        legend={
            "orientation": "h",
            "y": 1.035,
            "x": 0.5,
            "xanchor": "center",
            "title": None,
        },
        margin={"t": 88, "r": 36, "b": 104, "l": 76},
    )
    return fig

# --- 17. U.S. Beveridge Curve Colored by Fed Funds Rate ---
def beveridge_fed_policy() -> go.Figure:
    labor = fetch_fred_indicators(
        ["unemployment", "job_openings_rate"],
        "2005-01-01",
    )
    fed_funds = fetch_fred_series(["FEDFUNDS"], "2005-01-01").rename(
        columns={"FEDFUNDS": "fed_funds"}
    )
    df = labor.join(fed_funds, how="inner").dropna(
        subset=["unemployment", "job_openings_rate", "fed_funds"]
    )
    if df.empty:
        raise ValueError("No overlapping Beveridge Curve and federal-funds observations were returned.")

    hover_data = pd.DataFrame(
        {
            "date": df.index.strftime("%Y-%m"),
            "fed_funds": df["fed_funds"],
        },
        index=df.index,
    )
    hover_template = (
        "<b>%{customdata[0]}</b><br>"
        "Unemployment: %{x:.1f}%<br>"
        "Job openings rate: %{y:.1f}%<br>"
        "Fed funds rate: %{customdata[1]:.2f}%<extra></extra>"
    )

    fig = go.Figure()

    # A faint chronological path preserves the familiar Beveridge-curve trajectory.
    fig.add_trace(
        go.Scatter(
            x=df["unemployment"],
            y=df["job_openings_rate"],
            mode="lines",
            line={"color": "rgba(21,21,21,0.15)", "width": 1.2},
            hoverinfo="skip",
            showlegend=False,
        )
    )

    # Visible observations. Slightly larger markers make individual months easier
    # to distinguish without overwhelming the phase-space view.
    fig.add_trace(
        go.Scatter(
            x=df["unemployment"],
            y=df["job_openings_rate"],
            mode="markers",
            marker={
                "size": 9,
                "color": df["fed_funds"],
                "colorscale": "Viridis",
                "showscale": True,
                "colorbar": {"title": "Fed funds<br>rate (%)"},
                "line": {"color": "rgba(255,255,255,0.75)", "width": 0.6},
            },
            customdata=hover_data,
            hovertemplate=hover_template,
            name="Monthly observations",
        )
    )

    # Plotly normally gives a marker only a small hover hit-box. Overlay a nearly
    # invisible larger target for every month so users can reliably inspect dense
    # portions of the curve without having to land exactly on a 9px bubble.
    fig.add_trace(
        go.Scatter(
            x=df["unemployment"],
            y=df["job_openings_rate"],
            mode="markers",
            marker={
                "size": 22,
                "color": "rgba(0,0,0,0.001)",
                "line": {"width": 0},
            },
            customdata=hover_data,
            hovertemplate=hover_template,
            showlegend=False,
            name="Hover targets",
        )
    )

    # Add sparse year labels as wayfinding anchors. Exact month remains available
    # through hover, while the labels make the chronological path readable at a glance.
    anchor_years = set(range(2006, int(df.index.max().year) + 1, 2))
    anchor_years.update({2020, 2021, 2022, 2023, 2024, 2025, int(df.index.max().year)})
    anchors = (
        df.assign(year=df.index.year)
        .loc[lambda x: x["year"].isin(anchor_years)]
        .groupby("year", as_index=False)
        .first()
    )
    if not anchors.empty:
        fig.add_trace(
            go.Scatter(
                x=anchors["unemployment"],
                y=anchors["job_openings_rate"],
                mode="text",
                text=anchors["year"].astype(str),
                textposition="top center",
                textfont={"size": 9, "color": MUTED},
                hoverinfo="skip",
                showlegend=False,
            )
        )

    latest = df.iloc[-1]
    fig.add_trace(
        go.Scatter(
            x=[latest["unemployment"]],
            y=[latest["job_openings_rate"]],
            mode="markers",
            marker={
                "size": 15,
                "symbol": "diamond",
                "color": NEGATIVE,
                "line": {"color": "#ffffff", "width": 1.5},
            },
            name=f"Latest ({df.index[-1]:%Y-%m})",
            hovertemplate=(
                f"<b>Latest: {df.index[-1]:%Y-%m}</b><br>"
                "Unemployment: %{x:.1f}%<br>"
                "Job openings rate: %{y:.1f}%<extra></extra>"
            ),
        )
    )

    fig.update_xaxes(title="Unemployment rate (%)")
    fig.update_yaxes(title="Job openings rate (%)")
    add_metadata_footer(
        fig,
        "BLS labor-market data and Federal Reserve federal funds rate via FRED",
        _latest_date(df),
    )
    fig = apply_finance_theme(fig, height=590)
    fig.update_layout(
        hovermode="closest",
        hoverdistance=45,
    )
    return fig


# --- 18. Vacancy Cushion & Fed Policy Transmission ---
def vacancy_cushion_policy_transmission() -> go.Figure:
    raw = fetch_fred_series(
        ["FEDFUNDS", "JTSJOR", "UNRATE", "JTSJOL", "UNEMPLOY"],
        "2019-01-01",
    ).rename(
        columns={
            "FEDFUNDS": "fed_funds",
            "JTSJOR": "job_openings_rate",
            "UNRATE": "unemployment_rate",
            "JTSJOL": "job_openings_level",
            "UNEMPLOY": "unemployed_level",
        }
    )

    ratio_data = raw[["job_openings_level", "unemployed_level"]].dropna()
    if ratio_data.empty:
        raise ValueError("No overlapping job-openings and unemployment levels were returned.")

    raw["openings_per_unemployed"] = (
        raw["job_openings_level"] / raw["unemployed_level"]
    )

    pre_pandemic_ratio = raw.loc[
        "2019-01-01":"2019-12-31", "openings_per_unemployed"
    ].dropna()
    ratio_2019_avg = (
        float(pre_pandemic_ratio.mean()) if not pre_pandemic_ratio.empty else None
    )

    fig = make_subplots(
        rows=4,
        cols=1,
        shared_xaxes=True,
        vertical_spacing=0.075,
        subplot_titles=(
            "Policy stance",
            "Labor demand: posted vacancies",
            "Employment outcome",
            "Vacancy cushion: openings per unemployed worker",
        ),
    )

    fig.add_trace(
        go.Scatter(
            x=raw.index,
            y=raw["fed_funds"],
            name="Effective fed funds rate",
            line={"color": NEUTRAL, "width": 2.6},
            hovertemplate="%{x|%Y-%m}<br>Fed funds rate: %{y:.2f}%<extra></extra>",
        ),
        row=1,
        col=1,
    )

    fig.add_trace(
        go.Scatter(
            x=raw.index,
            y=raw["job_openings_rate"],
            name="Job openings rate",
            line={"color": ACCENT, "width": 2.8},
            hovertemplate="%{x|%Y-%m}<br>Job openings rate: %{y:.1f}%<extra></extra>",
        ),
        row=2,
        col=1,
    )
    # Waller's 2022 Beveridge-curve exercise modeled a decline in the vacancy
    # rate from roughly 7.5% to about 4.5% with only a modest unemployment rise.
    fig.add_hline(
        y=4.5,
        line_dash="dot",
        line_color=MUTED,
        annotation_text="Waller 2022 model endpoint: ~4.5% vacancy rate",
        annotation_position="bottom right",
        row=2,
        col=1,
    )

    fig.add_trace(
        go.Scatter(
            x=raw.index,
            y=raw["unemployment_rate"],
            name="Unemployment rate",
            line={"color": NEGATIVE, "width": 2.6},
            hovertemplate="%{x|%Y-%m}<br>Unemployment rate: %{y:.1f}%<extra></extra>",
        ),
        row=3,
        col=1,
    )

    fig.add_trace(
        go.Scatter(
            x=raw.index,
            y=raw["openings_per_unemployed"],
            name="Openings per unemployed",
            line={"color": "#8c6bb1", "width": 2.7},
            fill="tozeroy",
            fillcolor="rgba(140,107,177,0.08)",
            hovertemplate=(
                "%{x|%Y-%m}<br>Openings per unemployed worker: %{y:.2f}<extra></extra>"
            ),
        ),
        row=4,
        col=1,
    )
    fig.add_hline(
        y=1.0,
        line_dash="dash",
        line_color=LINE,
        annotation_text="1 opening per unemployed worker",
        annotation_position="bottom left",
        row=4,
        col=1,
    )
    if ratio_2019_avg is not None:
        fig.add_hline(
            y=ratio_2019_avg,
            line_dash="dot",
            line_color=MUTED,
            annotation_text=f"2019 average: {ratio_2019_avg:.2f}",
            annotation_position="top right",
            row=4,
            col=1,
        )

    # March 2022 marks the first increase in the federal-funds target range of
    # the post-pandemic tightening cycle. Show the same event marker in every panel.
    liftoff = pd.Timestamp("2022-03-16")
    for row in range(1, 5):
        fig.add_vline(
            x=liftoff,
            line_dash="dash",
            line_color="rgba(102,107,114,0.55)",
            line_width=1.2,
            row=row,
            col=1,
        )
    fig.add_annotation(
        x=liftoff,
        y=0.97,
        xref="x",
        yref="y domain",
        text="Fed liftoff<br>Mar. 2022",
        showarrow=False,
        xanchor="left",
        yanchor="top",
        font={"size": 10, "color": MUTED},
        bgcolor="rgba(255,255,255,0.82)",
        borderpad=2,
    )

    fig.update_yaxes(title="Percent (%)", row=1, col=1)
    fig.update_yaxes(title="Percent (%)", row=2, col=1)
    fig.update_yaxes(title="Percent (%)", row=3, col=1)
    fig.update_yaxes(title="Ratio", row=4, col=1)
    fig.update_xaxes(title="Date", row=4, col=1)

    add_metadata_footer(
        fig,
        "Federal Reserve and U.S. Bureau of Labor Statistics JOLTS/CPS via FRED",
        _latest_date(raw),
    )
    fig = apply_finance_theme(fig, height=920)
    fig.update_layout(
        hovermode="x unified",
        legend={
            "orientation": "h",
            "y": 1.115,
            "x": 0.5,
            "xanchor": "center",
            "yanchor": "bottom",
            "title": None,
        },
        margin={"t": 132, "r": 42, "b": 110, "l": 78},
    )
    return fig

def _international_labor_policy_data() -> tuple[dict[str, pd.DataFrame], pd.DataFrame]:
    unemployment_series = {
        "United States": "LRHUTTTTUSM156S",
        "United Kingdom": "LRHUTTTTGBM156S",
        "Canada": "LRHUTTTTCAM156S",
        "Germany": "LRHUTTTTDEM156S",
        "France": "LRHUTTTTFRM156S",
        "Japan": "LRHUTTTTJPM156S",
        "South Korea": "LRHUTTTTKRM156S",
        "Australia": "LRHUTTTTAUM156S",
    }
    short_rate_series = {
        "United States": "IRSTCI01USM156N",
        "United Kingdom": "IRSTCI01GBM156N",
        "Canada": "IRSTCI01CAM156N",
        "Germany": "IRSTCI01DEM156N",
        "France": "IRSTCI01FRM156N",
        "Japan": "IRSTCI01JPM156N",
        "South Korea": "IRSTCI01KRM156N",
        "Australia": "IRSTCI01AUM156N",
    }

    all_series = list(unemployment_series.values()) + list(short_rate_series.values())
    raw = fetch_fred_series(all_series, "2021-01-01")

    baseline_date = pd.Timestamp("2022-01-01")
    histories: dict[str, pd.DataFrame] = {}
    summary_rows = []

    for country in unemployment_series:
        frame = raw[
            [unemployment_series[country], short_rate_series[country]]
        ].rename(
            columns={
                unemployment_series[country]: "unemployment",
                short_rate_series[country]: "short_rate",
            }
        ).dropna()

        if frame.empty:
            continue

        frame = frame.loc[frame.index >= baseline_date].copy()
        if frame.empty:
            continue

        baseline = frame.iloc[0]
        frame["unemployment_change"] = frame["unemployment"] - baseline["unemployment"]
        frame["short_rate_change"] = frame["short_rate"] - baseline["short_rate"]
        histories[country] = frame

        latest = frame.iloc[-1]
        summary_rows.append(
            {
                "Country": country,
                "Short-rate change": float(latest["short_rate_change"]),
                "Unemployment change": float(latest["unemployment_change"]),
                "Baseline month": frame.index[0].strftime("%Y-%m"),
                "Latest month": frame.index[-1].strftime("%Y-%m"),
                "Baseline unemployment": float(baseline["unemployment"]),
                "Latest unemployment": float(latest["unemployment"]),
                "Baseline short rate": float(baseline["short_rate"]),
                "Latest short rate": float(latest["short_rate"]),
            }
        )

    summary = pd.DataFrame(summary_rows)
    if summary.empty:
        raise ValueError("No overlapping OECD labor-market and short-rate data were returned.")
    return histories, summary


# --- 19. International Tightening vs Unemployment Change ---
def international_tightening_vs_unemployment() -> go.Figure:
    _, summary = _international_labor_policy_data()

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=summary["Short-rate change"],
            y=summary["Unemployment change"],
            mode="markers+text",
            text=summary["Country"],
            textposition="top center",
            customdata=summary[
                [
                    "Baseline month",
                    "Latest month",
                    "Baseline short rate",
                    "Latest short rate",
                    "Baseline unemployment",
                    "Latest unemployment",
                ]
            ],
            marker={
                "size": 16,
                "color": ACCENT,
                "line": {"color": "#ffffff", "width": 1.2},
            },
            hovertemplate=(
                "%{text}<br>"
                "Short-rate change: %{x:+.2f} pp<br>"
                "Unemployment change: %{y:+.2f} pp<br>"
                "Baseline: %{customdata[0]}<br>"
                "Latest: %{customdata[1]}<br>"
                "Short rate: %{customdata[2]:.2f}% → %{customdata[3]:.2f}%<br>"
                "Unemployment: %{customdata[4]:.2f}% → %{customdata[5]:.2f}%"
                "<extra></extra>"
            ),
            name="Country",
        )
    )
    fig.add_vline(x=0, line_dash="dash", line_color=MUTED)
    fig.add_hline(y=0, line_dash="dash", line_color=MUTED)
    fig.update_xaxes(title="Change in OECD overnight / call-money rate since Jan 2022 (pp)")
    fig.update_yaxes(title="Change in harmonized unemployment rate since Jan 2022 (pp)")
    fig.update_layout(hovermode="closest")
    add_metadata_footer(
        fig,
        "OECD harmonized unemployment and immediate-rate series via FRED",
        f"latest available by country ({summary['Latest month'].min()}–{summary['Latest month'].max()})",
    )
    return apply_finance_theme(fig, height=560)


# --- 20. International Labor-Market Response to Tightening ---
def international_labor_policy_trajectories() -> go.Figure:
    histories, summary = _international_labor_policy_data()
    country_order = [
        "United States",
        "United Kingdom",
        "Canada",
        "Germany",
        "France",
        "Japan",
        "South Korea",
        "Australia",
    ]

    fig = make_subplots(
        rows=4,
        cols=2,
        subplot_titles=country_order,
        vertical_spacing=0.10,
        horizontal_spacing=0.08,
    )
    panel_positions = {
        country: ((i // 2) + 1, (i % 2) + 1)
        for i, country in enumerate(country_order)
    }

    max_abs = 1.0
    for frame in histories.values():
        local_max = frame[["short_rate_change", "unemployment_change"]].abs().max().max()
        if pd.notna(local_max):
            max_abs = max(max_abs, float(local_max))
    axis_bound = float(max_abs + 0.5)

    for country in country_order:
        if country not in histories:
            continue
        row, col = panel_positions[country]
        frame = histories[country]

        fig.add_trace(
            go.Scatter(
                x=frame.index,
                y=frame["short_rate_change"],
                name="Short-rate change",
                legendgroup="short-rate",
                showlegend=country == "United States",
                line={"color": NEUTRAL, "width": 2.4},
                hovertemplate=(
                    f"{country}<br>%{{x|%Y-%m}}<br>"
                    "Short-rate change: %{y:+.2f} pp<extra></extra>"
                ),
            ),
            row=row,
            col=col,
        )
        fig.add_trace(
            go.Scatter(
                x=frame.index,
                y=frame["unemployment_change"],
                name="Unemployment change",
                legendgroup="unemployment",
                showlegend=country == "United States",
                line={"color": NEGATIVE, "width": 2.4},
                hovertemplate=(
                    f"{country}<br>%{{x|%Y-%m}}<br>"
                    "Unemployment change: %{y:+.2f} pp<extra></extra>"
                ),
            ),
            row=row,
            col=col,
        )
        fig.add_hline(y=0, line_dash="dot", line_color=LINE, row=row, col=col)
        fig.update_yaxes(range=[-axis_bound, axis_bound], row=row, col=col)

    for row in range(1, 5):
        fig.update_yaxes(title="Change (pp)", row=row, col=1)

    fig.update_xaxes(title="Date", row=4, col=1)
    fig.update_xaxes(title="Date", row=4, col=2)
    fig.update_layout(hovermode="x unified")
    add_metadata_footer(
        fig,
        "OECD harmonized unemployment and immediate-rate series via FRED; changes indexed to each country's first complete observation in 2022",
        f"latest available by country ({summary['Latest month'].min()}–{summary['Latest month'].max()})",
    )
    fig = apply_finance_theme(fig, height=1180)
    fig.update_layout(
        legend={
            "orientation": "h",
            "y": 1.04,
            "x": 0.5,
            "xanchor": "center",
            "title": None,
        },
        margin={"t": 88, "r": 36, "b": 104, "l": 76},
    )
    return fig


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
    {
        "title": "Labor Supply & Wage Pressure",
        "slug": "labor-supply-wage-pressure",
        "description": "Labor-force participation and prime-age employment are paired with nominal wage growth so labor supply and compensation pressure can be read together without duplicating the Beveridge Curve.",
        "figure": labor_supply_wage_pressure(),
    },
    {
        "title": "Leading vs Coincident Business-Cycle Signal",
        "slug": "leading-coincident-cycle",
        "description": "The OECD composite leading indicator is paired with the Chicago Fed's broad activity index to compare forward-looking momentum with coincident economic performance.",
        "figure": leading_coincident_cycle(),
    },
    {
        "title": "Global Current-Account Imbalances",
        "slug": "current-account-imbalances",
        "description": "A latest-available country choropleth shows current-account balances as a share of GDP, separating external-surplus economies from external-deficit economies.",
        "figure": current_account_imbalances(),
    },
    {
        "title": "Global Trade Momentum",
        "slug": "trade-momentum",
        "description": "Real export and import growth are shown on the same color scale across major economies, making trade acceleration, contraction and divergence directly comparable.",
        "figure": trade_momentum(),
    },
    {
        "title": "Fiscal Space Snapshot",
        "slug": "fiscal-space",
        "description": "General-government credit burdens are compared with 10-year sovereign borrowing costs, while bubble area represents nominal GDP.",
        "figure": fiscal_space_snapshot(),
    },
    {
        "title": "Credit Leverage & Debt-Service Pressure",
        "slug": "credit-cycle-risk",
        "description": "BIS private-credit ratios and their five-year change provide a cross-country leverage view; U.S. household debt-service ratios add a direct measure of servicing pressure.",
        "figure": credit_cycle_risk(),
    },
    {
        "title": "Labor-Force Participation by Gender & Geography",
        "slug": "gender-labor-force-participation",
        "description": "Each country is shown in its own panel with women and men plotted together. The shaded space between the two lines makes the gender participation gap visible while preserving direct within-country comparison over time.",
        "figure": gender_labor_force_participation(),
    },
    {
        "title": "U.S. Beveridge Curve & Fed Policy Regime",
        "slug": "beveridge-fed-policy",
        "description": "The U.S. Beveridge Curve is colored by the effective federal funds rate so labor-market tightness can be read directly alongside the monetary-policy environment.",
        "figure": beveridge_fed_policy(),
    },
    {
        "title": "Vacancy Cushion & Fed Policy Transmission",
        "slug": "vacancy-cushion-policy-transmission",
        "description": "Four synchronized panels trace the effective federal funds rate, job-openings rate, unemployment rate, and openings per unemployed worker since 2019. The March 2022 liftoff and Waller's modeled ~4.5% vacancy-rate endpoint make it possible to see whether tightening was absorbed first through vacancies rather than job losses—and how much of that vacancy cushion remains.",
        "figure": vacancy_cushion_policy_transmission(),
    },
    {
        "title": "International Tightening vs Unemployment Change",
        "slug": "international-tightening-unemployment",
        "description": "Changes in a consistent OECD overnight/call-money rate proxy are compared with changes in harmonized unemployment since the start of 2022, revealing how differently labor markets absorbed tighter monetary conditions.",
        "figure": international_tightening_vs_unemployment(),
    },
    {
        "title": "International Labor-Market Response to Tightening",
        "slug": "international-labor-policy-trajectories",
        "description": "Eight country panels index both the OECD short-rate proxy and harmonized unemployment to their first complete 2022 observation, preserving geography while putting policy and labor responses on the same percentage-point scale.",
        "figure": international_labor_policy_trajectories(),
    },
]

DASHBOARD = {
    "eyebrow": "Macroeconomic Monitoring Terminal",
    "headline": "Automatically Refreshed Macroeconomic Dashboard",
    "summary": "Twenty complementary views combine official statistical and market-data APIs into a broad macro framework: prices and policy, rates, labor, business-cycle momentum, global growth and imbalances, trade, currencies, commodities, fiscal space and credit risk. New labor-policy views trace the U.S. vacancy cushion and compare monetary tightening with unemployment across major economies.",
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
            "text": "FRED (including Federal Reserve, BLS, BEA, EIA, OECD and BIS series) and World Bank World Development Indicators.",
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
            "layout": "single-column",
            "slugs": ["us-inflation-policy-regime", "treasury-yield-curve", "international-stance"],
        },
        {
            "label": "Block 2",
            "title": "Labor Market & Business Cycle",
            "description": "How tight is the labor market, and is broad economic activity accelerating or weakening?",
            "layout": "single-column",
            "slugs": ["beveridge-curve", "labor-supply-wage-pressure", "activity-pulse", "leading-coincident-cycle"],
        },
        {
            "label": "Block 3",
            "title": "Global Divergence & Shock Transmission",
            "description": "How different are national inflation, growth and external-balance regimes, and how are trade, currency and commodity shocks moving across markets?",
            "layout": "single-column",
            "slugs": ["g7-inflation", "global-growth-map", "current-account-imbalances", "trade-momentum", "fx-heatmap", "commodity-shocks"],
        },
        {
            "label": "Block 4",
            "title": "Fiscal & Credit Risk",
            "description": "How much balance-sheet room do major economies have, and where are leverage and debt-service pressures building?",
            "layout": "single-column",
            "slugs": ["fiscal-space", "credit-cycle-risk"],
        },
        {
            "label": "Block 5",
            "title": "Labor Participation: Gender & Geography",
            "description": "How do participation trends differ by gender and geography, and where are gender participation gaps narrowing or widening within each country?",
            "layout": "single-column",
            "slugs": ["gender-labor-force-participation"],
        },
        {
            "label": "Block 6",
            "title": "Monetary Tightening & Labor-Market Resilience",
            "description": "How has labor-market tightness evolved alongside Federal Reserve policy, and how differently have major economies absorbed tighter short-term monetary conditions since 2022?",
            "layout": "single-column",
            "slugs": ["beveridge-fed-policy", "vacancy-cushion-policy-transmission", "international-tightening-unemployment", "international-labor-policy-trajectories"],
        },
    ],
}
