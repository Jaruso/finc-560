from __future__ import annotations

import pandas as pd
import pandas_datareader.data as web
from src.data.cache import MacroCache
from src.data.catalog import INDICATORS

cache = MacroCache()

def fetch_fred_series(series_ids: list[str], start: str, end: str) -> pd.DataFrame:
    """
    Fetches series from FRED and caches the result.
    """
    # Create a deterministic name for the cache
    name = f"fred_{'_'.join(sorted(series_ids))}_{start}_{end}"
    
    def fetch_fn():
        return web.DataReader(series_ids, "fred", start, end)
        
    df = cache.get_dataframe("fred", name, fetch_fn)
    return df
