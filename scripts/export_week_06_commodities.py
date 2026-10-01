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
from scripts.world_bank_pink_sheet import fetch_workbook, parse_monthly_workbook  # noqa: E402

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
            "category": "Energy",
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


def uranium_series(now: datetime) -> dict:
    """Monthly IMF uranium benchmark via FRED (source attribution required)."""
    import math
    import pandas as pd
    from scripts.world_bank_pink_sheet import next_month
    sid = "PURANUSDM"
    series = fetch_fred_series([sid], "1980-01-01", max_age_hours=0)[sid].dropna()
    series = series[series.index < pd.Timestamp(now.date().replace(day=1))]
    observations = [
        {"date": month.strftime("%Y-%m-01"), "value": round(float(value), 5)}
        for month, value in series.items()
        if math.isfinite(float(value)) and float(value) > 0
    ]
    if len(observations) < 60 or (now.date().replace(day=1) -
                                 datetime.fromisoformat(observations[-1]["date"]).date()).days > 125:
        raise ValueError("IMF uranium series is too sparse or stale")
    recent = observations[-60:]
    if any(next_month(recent[i-1]["date"]) != recent[i]["date"]
           for i in range(1, 60)):
        raise ValueError("IMF uranium monthly history has material gaps")
    return {
        "id": "uranium", "label": "Uranium", "category": "Critical minerals",
        "unit": "USD/lb",
        "source": "International Monetary Fund Primary Commodity Prices via FRED",
        "source_id": sid,
        "source_url": "https://fred.stlouisfed.org/series/PURANUSDM",
        "rights_note": "IMF statistical data: attribution required; educational use",
        "frequency": "IMF monthly benchmark (not an exchange futures quotation)",
        "last_observation": observations[-1]["date"],
        "observations": observations,
    }


def main():
    now = datetime.now(timezone.utc)
    # Retain EIA raw spot sources for continuity, including benchmark metadata.
    frame = fetch_fred_series([record[2] for record in SOURCES],
                              "2005-01-01", max_age_hours=0)
    snapshot = normalized(frame, now)
    workbook, url = fetch_workbook()
    expanded, skipped = parse_monthly_workbook(workbook, url, now)
    snapshot["commodities"].extend(expanded)

    # Uranium has a genuine IMF benchmark, but not in the World Bank workbook.
    # A temporary gap here must never invalidate the separately verified WB/EIA
    # history or be replaced by a mining-stock/ETF proxy.
    unavailable = [
        {"name": "Lithium", "category": "Critical minerals",
         "reason": "Reliable comparable monthly underlying benchmark not yet integrated."},
        {"name": "Gallium", "category": "Critical minerals",
         "reason": "Comparable historical benchmark requires a specialized source."},
        {"name": "Steel", "category": "Industrial metals",
         "reason": "Iron ore is available, but it is not a steel price."},
        {"name": "Lumber futures", "category": "Forest products",
         "reason": "Sawnwood, plywood and logs are available; none is an exchange lumber future."},
        {"name": "Milk", "category": "Livestock & food",
         "reason": "Needs a separate USDA regional/farmgate dairy benchmark."},
        {"name": "Wool", "category": "Soft commodities",
         "reason": "Specialty wool benchmark is not published in the current catalog."},
    ]
    try:
        snapshot["commodities"].append(uranium_series(now))
    except Exception as exc:
        unavailable.append({"name": "Uranium", "category": "Critical minerals",
                            "reason": "IMF benchmark refresh currently unavailable."})
        print("WARNING: uranium benchmark skipped:", str(exc))

    snapshot["schema_version"] = 2
    snapshot["method"] = "Verified EIA/FRED spot means, WB monthly benchmark prices and IMF uranium"
    snapshot["source_catalog"] = [
        {"name": "EIA via FRED", "url": "https://fred.stlouisfed.org/"},
        {"name": "World Bank Pink Sheet", "url": url},
        {"name": "IMF (uranium, when available)",
         "url": "https://www.imf.org/en/Research/commodity-prices"},
    ]
    snapshot["unavailable"] = unavailable
    snapshot["skipped_world_bank"] = skipped
    if len(snapshot["commodities"]) < 33:
        raise ValueError("Insufficient verified coverage; retaining previous commodity snapshot")
    # Atomic replacement: never publish half-refreshes.
    DEST.parent.mkdir(parents=True, exist_ok=True)
    temporary = DEST.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(snapshot, indent=2, allow_nan=False)+"\n",
                         encoding="utf-8")
    temporary.replace(DEST)
    print("Published", len(snapshot["commodities"]), "verified underlying commodity series")
    from collections import Counter
    print("Categories:", dict(Counter(c["category"] for c in snapshot["commodities"])))
    print("Skipped/stale WB:", [(c["name"], c["reason"]) for c in skipped])
    print("IMF Uranium available:", any(c["id"] == "uranium" for c in snapshot["commodities"]))


if __name__ == "__main__":
    main()
