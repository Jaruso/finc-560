import os
from pathlib import Path
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas_datareader.data as web

# Output directory
OUTPUT_DIR = Path("docs/visualizations/report")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Theme
INK = "#151515"
MUTED = "#666b72"
LINE = "#d8dadd"

def apply_theme(fig):
    fig.update_layout(
        paper_bgcolor="#ffffff",
        plot_bgcolor="#ffffff",
        font={"family": "Arial, sans-serif", "color": INK},
        hoverlabel={"bgcolor": "#ffffff", "bordercolor": LINE, "font_size": 13},
        showlegend=True,
    )
    fig.update_xaxes(showgrid=False, linecolor=LINE, tickfont={"color": MUTED}, title_font={"color": MUTED})
    fig.update_yaxes(gridcolor="#ececea", zeroline=False, linecolor=LINE, tickfont={"color": MUTED}, title_font={"color": MUTED})
    return fig

print("Fetching data for Beveridge Curve...")
# 1. Beveridge Curve
df_bev = web.DataReader(["UNRATE", "JTSJOR", "DFF"], "fred", "2000-12-01", "2026-08-01").dropna()
fig_bev = go.Figure()

# Plot the path as a light line
fig_bev.add_trace(go.Scatter(
    x=df_bev["UNRATE"], y=df_bev["JTSJOR"],
    mode="lines",
    line=dict(color="rgba(0,0,0,0.1)", width=1),
    showlegend=False
))

# Plot the dots colored by DFF
fig_bev.add_trace(go.Scatter(
    x=df_bev["UNRATE"], y=df_bev["JTSJOR"],
    mode="markers",
    marker=dict(
        size=8,
        color=df_bev["DFF"],
        colorscale="Viridis",
        showscale=True,
        colorbar=dict(title="Fed funds<br>rate (%)", thickness=15, len=0.8, y=0.5)
    ),
    name="Monthly observations",
    showlegend=True
))

# Highlight the latest observation
latest = df_bev.iloc[-1]
fig_bev.add_trace(go.Scatter(
    x=[latest["UNRATE"]], y=[latest["JTSJOR"]],
    mode="markers",
    marker=dict(size=12, color="#d1495b", symbol="diamond"),
    name=f"Latest ({latest.name.strftime('%Y-%m')})"
))

# Annotate some key years
for year in [2008, 2010, 2020, 2021, 2022]:
    year_data = df_bev[df_bev.index.year == year]
    if len(year_data) > 0:
        point = year_data.iloc[0]
        fig_bev.add_annotation(
            x=point["UNRATE"], y=point["JTSJOR"],
            text=str(year),
            showarrow=False,
            yshift=10,
            font=dict(size=10, color=MUTED)
        )

fig_bev.update_layout(
    title=dict(text="<b>U.S. Beveridge Curve & Fed Policy Regime</b><br><span style='font-size:12px;color:#666b72'>The U.S. Beveridge Curve is colored by the effective federal funds rate so labor-market tightness can<br>be read directly alongside the monetary-policy environment.</span>", font=dict(size=18)),
    xaxis=dict(title="Unemployment rate (%)"),
    yaxis=dict(title="Job openings rate (%)"),
    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="center", x=0.5),
    margin=dict(t=120, b=80, l=80, r=80)
)
apply_theme(fig_bev)
fig_bev.add_annotation(
    text="Data source: BLS labor-market data and Federal Reserve federal funds rate via FRED",
    xref="paper", yref="paper", x=0, y=-0.15, showarrow=False, font=dict(size=10, color=MUTED), xanchor="left"
)
fig_bev.write_image(OUTPUT_DIR / "1_beveridge_curve.png", width=900, height=600, scale=3)


print("Fetching data for Vacancy Cushion...")
# 2. Vacancy Cushion & Fed Policy Transmission
df_vac = web.DataReader(["DFF", "JTSJOR", "UNRATE", "JTSJOL", "UNEMPLOY"], "fred", "2019-01-01", "2026-08-01").dropna()
df_vac["Vacancy_Ratio"] = df_vac["JTSJOL"] / df_vac["UNEMPLOY"]

fig_vac = make_subplots(
    rows=4, cols=1, 
    shared_xaxes=True,
    vertical_spacing=0.08,
    subplot_titles=("Policy stance", "Labor demand: posted vacancies", "Employment outcome", "Vacancy cushion: openings per unemployed worker")
)

fig_vac.add_trace(go.Scatter(x=df_vac.index, y=df_vac["DFF"], name="Effective fed funds rate", line=dict(color="#2f4858", width=2)), row=1, col=1)
fig_vac.add_trace(go.Scatter(x=df_vac.index, y=df_vac["JTSJOR"], name="Job openings rate", line=dict(color="#0d7f6f", width=2)), row=2, col=1)
fig_vac.add_trace(go.Scatter(x=df_vac.index, y=df_vac["UNRATE"], name="Unemployment rate", line=dict(color="#d1495b", width=2)), row=3, col=1)
fig_vac.add_trace(go.Scatter(x=df_vac.index, y=df_vac["Vacancy_Ratio"], name="Openings per unemployed", line=dict(color="#81b29a", width=2)), row=4, col=1)

# Annotations for panel 2
fig_vac.add_hline(y=4.5, row=2, col=1, line_dash="dot", line_color=MUTED)
fig_vac.add_annotation(x=df_vac.index[-1], y=4.5, text="Waller 2022 model endpoint: ~4.5% vacancy rate", showarrow=False, xanchor="right", yshift=-10, font=dict(size=10, color=MUTED), row=2, col=1)

# Annotations for panel 4
fig_vac.add_hline(y=1.19, row=4, col=1, line_dash="dot", line_color=MUTED)
fig_vac.add_annotation(x=df_vac.index[-1], y=1.19, text="2019 average: 1.19", showarrow=False, xanchor="right", yshift=10, font=dict(size=10, color=MUTED), row=4, col=1)

fig_vac.update_layout(
    title=dict(text="<b>Vacancy Cushion & Fed Policy Transmission</b><br><span style='font-size:12px;color:#666b72'>Four synchronized panels trace the effective federal funds rate, job-openings rate, unemployment rate,<br>and openings per unemployed worker since 2019.</span>", font=dict(size=18)),
    height=800,
    showlegend=True,
    legend=dict(orientation="h", yanchor="bottom", y=1.05, xanchor="center", x=0.5),
    margin=dict(t=160, b=80, l=80, r=80)
)
fig_vac.update_yaxes(title_text="Percent (%)", row=1, col=1)
fig_vac.update_yaxes(title_text="Percent (%)", row=2, col=1)
fig_vac.update_yaxes(title_text="Percent (%)", row=3, col=1)
fig_vac.update_yaxes(title_text="Ratio", row=4, col=1)
fig_vac.update_xaxes(title_text="Date", row=4, col=1)
apply_theme(fig_vac)
fig_vac.add_annotation(
    text="Data source: Federal Reserve and U.S. Bureau of Labor Statistics JOLTS/CPS via FRED",
    xref="paper", yref="paper", x=0, y=-0.1, showarrow=False, font=dict(size=10, color=MUTED), xanchor="left"
)
fig_vac.write_image(OUTPUT_DIR / "2_vacancy_cushion.png", width=900, height=800, scale=3)


print("Fetching data for International Facet Grid...")
# 3. International Job-Opening Response
countries = {
    "United States": {"rate": "IR3TIB01USM156N", "vac": "LMJVTTUVUSQ647S"},
    "United Kingdom": {"rate": "IR3TIB01GBM156N", "vac": "LMJVTTUVGBQ647S"},
    "Germany": {"rate": "IR3TIB01DEM156N", "vac": "LMJVTTUVDEQ647S"},
    "Australia": {"rate": "IR3TIB01AUM156N", "vac": "LMJVTTUVAUQ647S"},
}

fig_intl = make_subplots(
    rows=4, cols=2,
    subplot_titles=[title for country in countries.keys() for title in [f"{country}: short-rate change", f"{country}: unfilled vacancies"]],
    vertical_spacing=0.08,
    horizontal_spacing=0.05
)

colors = {"United States": "#2f4858", "United Kingdom": "#3d5a80", "Germany": "#2f4858", "Australia": "#2f4858"}
row = 1
for country, series in countries.items():
    df_intl = web.DataReader([series["rate"], series["vac"]], "fred", "2022-01-01", "2024-06-01").interpolate(method='time').dropna()
    
    # Calculate changes
    rate_change = df_intl[series["rate"]] - df_intl[series["rate"]].iloc[0]
    vac_index = (df_intl[series["vac"]] / df_intl[series["vac"]].iloc[0]) * 100
    
    fig_intl.add_trace(go.Scatter(x=df_intl.index, y=rate_change, name=f"{country} Rate", line=dict(color=colors[country], width=2), mode="lines+markers"), row=row, col=1)
    fig_intl.add_trace(go.Scatter(x=df_intl.index, y=vac_index, name=f"{country} Vacancies", line=dict(color="#0d7f6f", width=2), mode="lines+markers"), row=row, col=2)
    
    # 100 baseline for vacancies
    fig_intl.add_hline(y=100, row=row, col=2, line_dash="dot", line_color=MUTED)
    
    # Fill to 100 area
    fig_intl.add_trace(go.Scatter(x=df_intl.index, y=vac_index, fill='tonexty', fillcolor="rgba(13, 127, 111, 0.1)", line=dict(width=0), showlegend=False), row=row, col=2)
    
    if row == 4:
        fig_intl.update_xaxes(title_text="Date", row=row, col=1)
        fig_intl.update_xaxes(title_text="Date", row=row, col=2)
        
    fig_intl.update_yaxes(title_text="Rate change (pp)", row=row, col=1)
    fig_intl.update_yaxes(title_text="Index (2022=100)", row=row, col=2)
    
    row += 1

fig_intl.update_layout(
    title=dict(text="<b>International Job-Opening Response to Tightening</b><br><span style='font-size:12px;color:#666b72'>Country-by-country panels align the change in short-term rates with an indexed unfilled-vacancy<br>series (first complete 2022 observation = 100).</span>", font=dict(size=18)),
    height=1000,
    showlegend=False,
    margin=dict(t=120, b=80, l=80, r=80)
)
apply_theme(fig_intl)
fig_intl.write_image(OUTPUT_DIR / "3_international_response.png", width=900, height=1000, scale=3)

print("Export complete!")
