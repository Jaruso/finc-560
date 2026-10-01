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


# Physical, monthly IMF commodity benchmarks missing or stale in the WB file.
# Wool's FRED units are US cents/kg; normalize to USD/kg (divide by 100).
IMF_BENCHMARKS = (
    ("uranium", "Uranium", "PURANUSDM", "USD/lb", "Critical minerals", 1.0),
    ("barley", "Barley", "PBARLUSDM", "USD/metric ton", "Grains", 1.0),
    ("wool-fine", "Wool (fine)", "PWOOLFUSDM", "USD/kg", "Soft commodities", 0.01),
    ("wool-coarse", "Wool (coarse)", "PWOOLCUSDM", "USD/kg", "Soft commodities", 0.01),
)


def imf_benchmarks(now: datetime, frame=None) -> tuple[list[dict], list[dict]]:
    """Return all verified IMF monthly benchmarks, reporting individual gaps."""
    import math
    import pandas as pd
    from scripts.world_bank_pink_sheet import next_month

    sources = [x[2] for x in IMF_BENCHMARKS]
    if frame is None:
        frame = fetch_fred_series(sources, "1992-01-01", max_age_hours=0)
    output, missing = [], []
    for identifier, label, sid, unit, category, factor in IMF_BENCHMARKS:
        try:
            if sid not in frame:
                raise ValueError("monthly benchmark is absent")
            series = frame[sid].dropna()
            series = series[series.index < pd.Timestamp(now.date().replace(day=1))]
            observations = [
                {"date": month.strftime("%Y-%m-01"),
                 "value": round(float(value)*factor, 5)}
                for month, value in series.items()
                if math.isfinite(float(value)) and float(value) > 0
            ]
            if not observations or len(observations) < 60 or (
                now.date().replace(day=1) -
                datetime.fromisoformat(observations[-1]["date"]).date()).days > 125:
                raise ValueError("fewer than 60 months or too stale")
            recent = observations[-60:]
            if any(next_month(recent[i-1]["date"]) != recent[i]["date"]
                   for i in range(1, 60)):
                raise ValueError("recent monthly history has missing months")
            output.append({
                "id": identifier, "label": label, "category": category,
                "unit": unit,
                "source": "International Monetary Fund Primary Commodity Prices via FRED",
                "source_id": sid,
                "source_url": f"https://fred.stlouisfed.org/series/{sid}",
                "rights_note": ("IMF statistical data: attribution required; "
                                + ("published cents/kg converted to USD/kg" if factor != 1
                                   else "published unit retained")),
                "frequency": "IMF monthly benchmark (not exchange futures)",
                "last_observation": observations[-1]["date"],
                "observations": observations,
            })
        except Exception as exc:
            print("WARNING: IMF benchmark unavailable:", sid, str(exc))
            missing.append({"name": label, "category": category,
                            "reason": "IMF benchmark refresh unavailable or stale."})
    return output, missing

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

    ]
    # Retain other verified providers if the IMF endpoint is temporarily down.
    try:
        international, gaps = imf_benchmarks(now)
        snapshot["commodities"].extend(international)
        unavailable.extend(gaps)
    except Exception as exc:
        print("WARNING: IMF source refresh skipped:", str(exc))
        unavailable.extend(
            {"name": item[1], "category": item[4],
             "reason": "IMF benchmark refresh currently unavailable."}
            for item in IMF_BENCHMARKS
        )

    snapshot["schema_version"] = 2
    snapshot["method"] = "Verified EIA/FRED spot means, WB monthly benchmark prices and attributed IMF minerals and agricultural benchmarks"
    snapshot["source_catalog"] = [
        {"name": "EIA via FRED", "url": "https://fred.stlouisfed.org/"},
        {"name": "World Bank Pink Sheet", "url": url},
        {"name": "IMF Primary Commodity Prices (when available)",
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
    print("IMF benchmarks available:", [c["id"] for c in snapshot["commodities"] if c["id"] in {i[0] for i in IMF_BENCHMARKS}])


if __name__ == "__main__":
    main()
