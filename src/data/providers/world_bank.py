from __future__ import annotations

import os
import time

import pandas as pd
from pandas_datareader import wb

from src.data.cache import MacroCache

cache = MacroCache()


def _retry_world_bank(fetch_fn):
    """Retry transient World Bank API failures before cache fallback is used."""
    attempts = max(1, int(os.getenv("WORLD_BANK_RETRY_ATTEMPTS", "4")))
    base_delay = max(0.0, float(os.getenv("WORLD_BANK_RETRY_DELAY_SECONDS", "2")))

    last_error = None
    for attempt in range(1, attempts + 1):
        try:
            return fetch_fn()
        except Exception as exc:
            last_error = exc
            if attempt == attempts:
                break
            # Simple exponential backoff: 2s, 4s, 8s by default.
            time.sleep(base_delay * (2 ** (attempt - 1)))

    assert last_error is not None
    raise last_error


def fetch_wb_series(
    indicator: str,
    countries: list[str] | str = "all",
    start: int = 2000,
    end: int | None = None,
    *,
    max_age_hours: float = 24,
) -> pd.DataFrame:
    """
    Fetch a World Bank indicator and cache the normalized tabular response.
    """
    requested_end = end or pd.Timestamp.now(tz="UTC").year
    if isinstance(countries, list):
        c_str = "_".join(sorted(countries))
    else:
        c_str = countries

    end_key = end if end is not None else "latest"
    name = f"wb_{indicator}_{c_str}_{start}_{end_key}"

    def fetch_fn() -> pd.DataFrame:
        def request() -> pd.DataFrame:
            frame = wb.download(
                indicator=indicator,
                country=countries,
                start=start,
                end=requested_end,
            )
            return frame.reset_index()

        return _retry_world_bank(request)

    return cache.get_dataframe(
        "world_bank",
        name,
        fetch_fn,
        max_age_hours=max_age_hours,
    )


def fetch_wb_countries(*, max_age_hours: float = 24 * 30) -> pd.DataFrame:
    """
    Fetch World Bank country metadata so aggregate regions can be separated
    from actual countries before geographic visualization.
    """
    return cache.get_dataframe(
        "world_bank",
        "country_metadata",
        lambda: _retry_world_bank(wb.get_countries),
        max_age_hours=max_age_hours,
    )
