from __future__ import annotations

import pandas as pd
import pandas_datareader.data as web

from src.data.cache import MacroCache
from src.data.catalog import INDICATORS

cache = MacroCache()


def _today_iso() -> str:
    return pd.Timestamp.now(tz="UTC").date().isoformat()


def fetch_fred_series(
    series_ids: list[str],
    start: str,
    end: str | None = None,
    *,
    max_age_hours: float = 12,
) -> pd.DataFrame:
    """
    Fetch one or more FRED series as a wide DataFrame.

    When 'end' is omitted the request runs through the current UTC date. The
    cache key remains stable ("latest") so refreshes replace the same local
    cache file instead of creating a new file every day.
    """
    requested_end = end or _today_iso()
    end_key = end or "latest"
    name = f"fred_{'_'.join(sorted(series_ids))}_{start}_{end_key}"

    def fetch_fn() -> pd.DataFrame:
        return web.DataReader(series_ids, "fred", start, requested_end)

    return cache.get_dataframe(
        "fred",
        name,
        fetch_fn,
        max_age_hours=max_age_hours,
    )


def fetch_fred_indicators(
    indicator_keys: list[str],
    start: str,
    end: str | None = None,
    *,
    max_age_hours: float = 12,
) -> pd.DataFrame:
    """
    Fetch catalog-backed FRED indicators and rename columns to their semantic keys.
    """
    specs = {key: INDICATORS[key] for key in indicator_keys}
    non_fred = [key for key, spec in specs.items() if spec["provider"] != "fred"]
    if non_fred:
        raise ValueError(f"Indicators are not configured as FRED series: {non_fred}")

    raw = fetch_fred_series(
        [spec["series_id"] for spec in specs.values()],
        start,
        end,
        max_age_hours=max_age_hours,
    )
    rename = {spec["series_id"]: key for key, spec in specs.items()}
    return raw.rename(columns=rename)
