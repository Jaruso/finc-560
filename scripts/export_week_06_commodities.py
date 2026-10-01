"""Publish genuine EIA/FRED daily spot data as complete monthly average prices.

Never fall back to synthetic prices. A failed fetch leaves the prior snapshot
untouched so GitHub Pages cannot publish an incomplete or fabricated series.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.data.providers.fred import fetch_fred_series  # noqa: E402

SOURCES = (
    ("wti", "WTI crude oil", "DCOILWTICO", "USD/barrel"),
    ("brent", "Brent crude oil", "DCOILBRENTEU", "USD/barrel"),
    ("gas", "Henry Hub natural gas", "DHHNGSP", "USD/MMBtu"),
)
DEST = ROOT / "docs/week-06/commodities/data.json"


def normalized(dataframe, today: datetime):
    import pandas as pd

    # Exclude partial current months. All assets use complete *calendar*
    # months (not last trading-day snapshots or futures settlement prices).
    current_month = today.date().replace(day=1)
    completed_end = current_month - timedelta(days=1)
    retrieved = today.astimezone(timezone.utc).isoformat()
    commodities = []
    for identifier, label, series_id, unit in SOURCES:
        if series_id not in dataframe.columns:
            raise ValueError(f"FRED did not supply {series_id}")
        column = dataframe[series_id].dropna()
        column = column[column.index <= pd.Timestamp(completed_end)]
        monthly = column.resample("MS").mean()
        counts = column.resample("MS").count()
        monthly = monthly[counts >= 3].dropna()
        observations = [
            {"date": date.strftime("%Y-%m-01"), "value": round(float(value), 5)}
            for date, value in monthly.items()
            if pd.notna(value) and value > 0
        ]
        if len(observations) < 60:
            raise ValueError(f"{series_id}: fewer than 60 verified monthly observations")
        latest = datetime.strptime(observations[-1]["date"], "%Y-%m-%d").date()
        if (current_month - latest).days > 125:
            raise ValueError(f"{series_id}: latest data too stale to publish")
        commodities.append({
            "id": identifier, "label": label, "unit": unit,
            "source": "U.S. Energy Information Administration via FRED",
            "source_id": series_id,
            "source_url": f"https://fred.stlouisfed.org/series/{series_id}",
            "frequency": "monthly mean of available daily spot prices",
            "last_observation": observations[-1]["date"],
            "observations": observations,
        })
    return {
        "schema_version": 1, "status": "ready",
        "retrieved_utc": retrieved,
        "method": "complete monthly average of reported daily EIA spot prices",
        "commodities": commodities,
    }


def main():
    now = datetime.now(timezone.utc)
    ids = [record[2] for record in SOURCES]
    frame = fetch_fred_series(ids, "2005-01-01", max_age_hours=0)
    snapshot = normalized(frame, now)  # all 3 validate BEFORE replacing data
    DEST.parent.mkdir(parents=True, exist_ok=True)
    temporary = DEST.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(snapshot, indent=2, allow_nan=False) + "\n",
                         encoding="utf-8")
    temporary.replace(DEST)
    print("Published verified FRED commodities:",
          [(c["id"], len(c["observations"]), c["last_observation"])
           for c in snapshot["commodities"]])


if __name__ == "__main__":
    main()
