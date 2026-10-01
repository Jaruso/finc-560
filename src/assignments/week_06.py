"""Week 6 Treasury scenario dashboard: reproducible FRED data preparation.

Scenario projections run client-side, separate from historical observations.
This file NEVER manufactures yield forecasts or claims the simple OLS fit is causal.
"""
from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd

from src.data.providers.fred import fetch_fred_series

SERIES = ("DGS5", "DGS10", "DFF")
HISTORY_START = "2006-01-01"


def monthly_observations(daily: pd.DataFrame) -> list[dict]:
    """Take each month's latest available observation for each daily FRED series.

    Dates in the JSON designate reporting months, NOT an invented exact common
    observation timestamp. Values are percent per annum (not basis points).
    """
    missing = set(SERIES) - set(daily.columns)
    if missing:
        raise ValueError("Missing required FRED series: " + ", ".join(sorted(missing)))
    data = daily.loc[:, list(SERIES)].copy()
    data.index = pd.to_datetime(data.index)
    data = data.sort_index()
    for col in SERIES:
        data[col] = pd.to_numeric(data[col], errors="coerce")
    monthly = data.resample("MS").last().dropna(how="any")
    rows = []
    for date, row in monthly.iterrows():
        rows.append({
            "date": date.strftime("%Y-%m-%d"),
            "dgs5": round(float(row["DGS5"]), 4),
            "dgs10": round(float(row["DGS10"]), 4),
            "policy": round(float(row["DFF"]), 4),
        })
    return rows


def build_snapshot(daily: pd.DataFrame | None = None) -> dict:
    if daily is None:
        daily = fetch_fred_series(list(SERIES), HISTORY_START, max_age_hours=0)
    observations = monthly_observations(daily)
    if len(observations) < 36:
        raise ValueError("Insufficient aligned historical observations (<36 months).")
    # The last synchronized daily row may be older than the end of the month;
    # separately expose its real calendar date for transparent provenance.
    synced = daily.loc[:, list(SERIES)].apply(pd.to_numeric, errors="coerce").dropna()
    if synced.empty:
        raise ValueError("No synchronized Treasury and policy observations.")
    last_date = pd.Timestamp(synced.index.max())
    return {
        "schema_version": 1,
        "status": "ready",
        "source": "FRED / Federal Reserve: DGS5, DGS10, DFF",
        "source_urls": {
            "5y": "https://fred.stlouisfed.org/series/DGS5",
            "10y": "https://fred.stlouisfed.org/series/DGS10",
            "policy": "https://fred.stlouisfed.org/series/DFF"
        },
        "retrieved_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "latest_synchronized_daily_observation": last_date.strftime("%Y-%m-%d"),
        "frequency": "Monthly latest available observations; latest month may be partial.",
        "unit": "Percent per annum",
        "observations": observations,
    }
