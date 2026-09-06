from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go

ASSIGNMENT = "week-03"
ASSIGNMENT_LABEL = "Week 03"
ASSIGNMENT_TITLE = "Visualizing financial statements"

INK = "#151515"
MUTED = "#666b72"
LINE = "#d8dadd"

# Accent colors aligned with the financial narrative
DTC_COLOR = "#0d7f6f"     # Success/growth color (using week 2 accent)
LINEAR_COLOR = "#2f4858"  # Subdued/legacy color
CONTENT_COLOR = "#d1495b" # Third segment color

# Raw Disney Fiscal 2023 & 2024 Data (in millions of USD)
# Sourced directly from The Walt Disney Company, 2024 Annual Report
DATA = {
    "Linear Networks": {
        "2023": {"Revenue": 11701, "Operating Income": 4119},
        "2024": {"Revenue": 10692, "Operating Income": 3452}
    },
    "Direct-to-Consumer": {
        "2023": {
            "Subscription": 16420, "Advertising": 3260, "Other": 206, "Total Revenue": 19886,
            "Operating expenses": 17859, "SG&A and other": 4168, "Depreciation and amortization": 355,
            "Operating Income": -2496
        },
        "2024": {
            "Subscription": 18796, "Advertising": 3707, "Other": 273, "Total Revenue": 22776,
            "Operating expenses": 17748, "SG&A and other": 4574, "Depreciation and amortization": 311,
            "Operating Income": 143
        }
    },
    "Content Sales / Licensing": {
        "2023": {"Revenue": 9048, "Operating Income": -179},
        "2024": {"Revenue": 7718, "Operating Income": 328}
    },
    "Total Entertainment": {
        "2023": {"Revenue": 40635, "Operating Income": 1444},
        "2024": {"Revenue": 41186, "Operating Income": 3923}
    }
}

def apply_finance_theme(figure: go.Figure, height: int = 550) -> go.Figure:
    figure.update_layout(
        height=height,
        margin={"t": 78, "r": 28, "b": 85, "l": 64},
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
    # Standardized source citation across all Week 3 figures
    figure.add_annotation(
        text="Source: The Walt Disney Company, 2024 Annual Report (Fiscal Year Ended September 28, 2024)",
        xref="paper", yref="paper",
        x=0, y=-0.18,
        showarrow=False,
        font={"size": 11, "color": MUTED},
        xanchor="left", yanchor="top"
    )
    return figure


def dtc_profitability_bridge() -> go.Figure:
    """
    Figure 1: Board-level waterfall showing the operational drivers 
    behind Disney Direct-to-Consumer's $2.639 billion improvement.
    """
    dtc_23 = DATA["Direct-to-Consumer"]["2023"]
    dtc_24 = DATA["Direct-to-Consumer"]["2024"]

    # Calculate operational drivers
    start_op_inc = dtc_23["Operating Income"]
    rev_growth = dtc_24["Total Revenue"] - dtc_23["Total Revenue"]
    # Lower expenses are a positive driver for income
    op_ex_impact = dtc_23["Operating expenses"] - dtc_24["Operating expenses"] 
    # Higher SG&A is a negative driver for income
    sga_impact = dtc_23["SG&A and other"] - dtc_24["SG&A and other"] 
    # Lower depreciation is a positive driver
    da_impact = dtc_23["Depreciation and amortization"] - dtc_24["Depreciation and amortization"]
    end_op_inc = dtc_24["Operating Income"]

    # Sanity check reconciliation
    assert start_op_inc + rev_growth + op_ex_impact + sga_impact + da_impact == end_op_inc

    fig = go.Figure(go.Waterfall(
        name="DTC Operating Income",
        orientation="v",
        measure=["absolute", "relative", "relative", "relative", "relative", "total"],
        x=[
            "2023 DTC<br>Op. Income", 
            "Revenue<br>Growth", 
            "Lower Op.<br>Expenses", 
            "Higher<br>SG&A", 
            "Lower<br>D&A", 
            "2024 DTC<br>Op. Income"
        ],
        textposition="outside",
        text=[
            f"${start_op_inc:,.0f}M", 
            f"+${rev_growth:,.0f}M", 
            f"+${op_ex_impact:,.0f}M", 
            f"-${abs(sga_impact):,.0f}M", 
            f"+${da_impact:,.0f}M", 
            f"${end_op_inc:,.0f}M"
        ],
        y=[start_op_inc, rev_growth, op_ex_impact, sga_impact, da_impact, end_op_inc],
        connector={"line": {"color": LINE}},
        decreasing={"marker": {"color": CONTENT_COLOR}},
        increasing={"marker": {"color": DTC_COLOR}},
        totals={"marker": {"color": LINEAR_COLOR}},
        hovertemplate="%{x}<br>Impact: $%{y:,.0f}M<extra></extra>"
    ))
    
    fig = apply_finance_theme(fig)
    fig.update_yaxes(title="Operating Income ($M)", zeroline=True, zerolinewidth=1.5, zerolinecolor=INK)
    return fig


def linear_vs_dtc_operating_income() -> go.Figure:
    """
    Figure 2: Investor-focused comparison showing declining Linear Networks profit 
    alongside Disney streaming's transition from loss to profit.
    """
    linear_23 = DATA["Linear Networks"]["2023"]["Operating Income"]
    linear_24 = DATA["Linear Networks"]["2024"]["Operating Income"]
    dtc_23 = DATA["Direct-to-Consumer"]["2023"]["Operating Income"]
    dtc_24 = DATA["Direct-to-Consumer"]["2024"]["Operating Income"]

    fig = go.Figure()
    
    fig.add_trace(go.Bar(
        x=["2023", "2024"],
        y=[linear_23, linear_24],
        name="Linear Networks",
        marker_color=LINEAR_COLOR,
        text=[f"${linear_23:,.0f}M", f"${linear_24:,.0f}M"],
        textposition="outside",
        hovertemplate="Linear Networks<br>%{x}: $%{y:,.0f}M<extra></extra>"
    ))
    
    fig.add_trace(go.Bar(
        x=["2023", "2024"],
        y=[dtc_23, dtc_24],
        name="Direct-to-Consumer",
        marker_color=DTC_COLOR,
        text=[f"-${abs(dtc_23):,.0f}M", f"${dtc_24:,.0f}M"],
        textposition="outside",
        hovertemplate="Direct-to-Consumer<br>%{x}: $%{y:,.0f}M<extra></extra>"
    ))
    
    fig.update_layout(barmode="group")
    
    # Tasteful annotations
    fig.add_annotation(
        x="2024", y=dtc_24 + 500,
        text="+$2.64B improvement",
        showarrow=False,
        font={"color": DTC_COLOR, "weight": "bold"}
    )
    fig.add_annotation(
        x="2024", y=linear_24 + 500,
        text="-$667M profit decline",
        showarrow=False,
        font={"color": LINEAR_COLOR, "weight": "bold"}
    )
    
    fig = apply_finance_theme(fig)
    fig.update_yaxes(title="Operating Income ($M)", zeroline=True, zerolinewidth=2, zerolinecolor=INK)
    return fig


def entertainment_revenue_mix() -> go.Figure:
    """
    Figure 3: Revenue mix view showing Direct-to-Consumer increasing 
    from roughly 49% to 55% of Entertainment revenue.
    """
    lin_23 = DATA["Linear Networks"]["2023"]["Revenue"]
    dtc_23 = DATA["Direct-to-Consumer"]["2023"]["Total Revenue"]
    cs_23 = DATA["Content Sales / Licensing"]["2023"]["Revenue"]
    tot_23 = DATA["Total Entertainment"]["2023"]["Revenue"]
    
    lin_24 = DATA["Linear Networks"]["2024"]["Revenue"]
    dtc_24 = DATA["Direct-to-Consumer"]["2024"]["Total Revenue"]
    cs_24 = DATA["Content Sales / Licensing"]["2024"]["Revenue"]
    tot_24 = DATA["Total Entertainment"]["2024"]["Revenue"]
    
    # Normalize to 100%
    pct_lin_23, pct_dtc_23, pct_cs_23 = lin_23/tot_23*100, dtc_23/tot_23*100, cs_23/tot_23*100
    pct_lin_24, pct_dtc_24, pct_cs_24 = lin_24/tot_24*100, dtc_24/tot_24*100, cs_24/tot_24*100
    
    fig = go.Figure()
    
    # Order: Content, Linear, DTC (DTC on top to emphasize growth, or DTC bottom for foundation)
    # DTC at the bottom so its growth is clearest and grounded
    fig.add_trace(go.Bar(
        x=["2023", "2024"], y=[pct_dtc_23, pct_dtc_24], name="Direct-to-Consumer",
        marker_color=DTC_COLOR,
        text=[f"{pct_dtc_23:.1f}%", f"{pct_dtc_24:.1f}%"],
        textposition="inside",
        customdata=[[dtc_23], [dtc_24]],
        hovertemplate="Direct-to-Consumer<br>Revenue: $%{customdata[0]:,.0f}M<br>Mix: %{y:.1f}%<extra></extra>"
    ))
    fig.add_trace(go.Bar(
        x=["2023", "2024"], y=[pct_lin_23, pct_lin_24], name="Linear Networks",
        marker_color=LINEAR_COLOR,
        text=[f"{pct_lin_23:.1f}%", f"{pct_lin_24:.1f}%"],
        textposition="inside",
        customdata=[[lin_23], [lin_24]],
        hovertemplate="Linear Networks<br>Revenue: $%{customdata[0]:,.0f}M<br>Mix: %{y:.1f}%<extra></extra>"
    ))
    fig.add_trace(go.Bar(
        x=["2023", "2024"], y=[pct_cs_23, pct_cs_24], name="Content Sales / Licensing",
        marker_color=CONTENT_COLOR,
        text=[f"{pct_cs_23:.1f}%", f"{pct_cs_24:.1f}%"],
        textposition="inside",
        customdata=[[cs_23], [cs_24]],
        hovertemplate="Content Sales / Licensing<br>Revenue: $%{customdata[0]:,.0f}M<br>Mix: %{y:.1f}%<extra></extra>"
    ))
    
    fig.update_layout(barmode="stack")
    fig = apply_finance_theme(fig)
    fig.update_yaxes(title="Percentage of Entertainment Revenue", range=[0, 100], ticksuffix="%")
    return fig


def operating_margin_shift() -> go.Figure:
    """
    Figure 4: Operating margin comparison showing Disney streaming's sharp 
    profitability recovery alongside modest Linear Networks margin compression.
    """
    dtc_margin_23 = (DATA["Direct-to-Consumer"]["2023"]["Operating Income"] / DATA["Direct-to-Consumer"]["2023"]["Total Revenue"]) * 100
    dtc_margin_24 = (DATA["Direct-to-Consumer"]["2024"]["Operating Income"] / DATA["Direct-to-Consumer"]["2024"]["Total Revenue"]) * 100
    
    lin_margin_23 = (DATA["Linear Networks"]["2023"]["Operating Income"] / DATA["Linear Networks"]["2023"]["Revenue"]) * 100
    lin_margin_24 = (DATA["Linear Networks"]["2024"]["Operating Income"] / DATA["Linear Networks"]["2024"]["Revenue"]) * 100
    
    fig = go.Figure()
    
    # Linear Networks Slope
    fig.add_trace(go.Scatter(
        x=["2023", "2024"], 
        y=[lin_margin_23, lin_margin_24],
        mode="lines+markers+text",
        name="Linear Networks",
        text=[f"{lin_margin_23:.1f}%", f"{lin_margin_24:.1f}%"],
        textposition=["top center", "bottom center"],
        marker={"size": 12, "color": LINEAR_COLOR},
        line={"color": LINEAR_COLOR, "width": 4},
        hovertemplate="Linear Networks<br>Margin: %{y:.2f}%<extra></extra>"
    ))

    # Direct-to-Consumer Slope
    fig.add_trace(go.Scatter(
        x=["2023", "2024"], 
        y=[dtc_margin_23, dtc_margin_24],
        mode="lines+markers+text",
        name="Direct-to-Consumer",
        text=[f"{dtc_margin_23:.1f}%", f"{dtc_margin_24:.1f}%"],
        textposition=["bottom center", "top right"],
        marker={"size": 12, "color": DTC_COLOR},
        line={"color": DTC_COLOR, "width": 4},
        hovertemplate="Direct-to-Consumer<br>Margin: %{y:.2f}%<extra></extra>"
    ))
    
    fig = apply_finance_theme(fig)
    fig.update_yaxes(title="Operating Margin (%)", zeroline=True, zerolinewidth=1.5, zerolinecolor=INK, ticksuffix="%")
    # Add a little padding to the y-axis
    fig.update_layout(yaxis_range=[-18, 45])
    
    return fig


FIGURES = [
    {
        "title": "How Disney Streaming Improved Operating Income by $2.64B",
        "slug": "dtc-profitability-bridge",
        "description": "Board-level waterfall showing the operational drivers behind Disney Direct-to-Consumer's $2.639 billion improvement in operating income.",
        "figure": dtc_profitability_bridge(),
    },
    {
        "title": "Disney's Profit Engine Is Beginning to Shift",
        "slug": "linear-vs-dtc-operating-income",
        "description": "Investor-focused comparison showing declining Linear Networks profit alongside Disney streaming's transition from loss to profit.",
        "figure": linear_vs_dtc_operating_income(),
    },
    {
        "title": "Streaming Now Generates More Than Half of Entertainment Revenue",
        "slug": "entertainment-revenue-mix",
        "description": "Revenue mix view showing Direct-to-Consumer increasing from roughly 49% to 55% of Entertainment revenue.",
        "figure": entertainment_revenue_mix(),
    },
    {
        "title": "Streaming Margin Recovered as Linear Network Margins Contracted",
        "slug": "operating-margin-shift",
        "description": "Operating margin comparison showing Disney streaming's sharp profitability recovery alongside modest Linear Networks margin compression.",
        "figure": operating_margin_shift(),
    },
]
