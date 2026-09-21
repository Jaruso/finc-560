from __future__ import annotations

import pandas as pd
from pandas_datareader import wb
from src.data.cache import MacroCache

cache = MacroCache()

def fetch_wb_series(indicator: str, countries: list[str] | str = "all", start: int = 2000, end: int = 2024) -> pd.DataFrame:
    """
    Fetches series from World Bank and caches the result.
    """
    if isinstance(countries, list):
        c_str = "_".join(sorted(countries))
    else:
        c_str = countries
        
    name = f"wb_{indicator}_{c_str}_{start}_{end}"
    
    def fetch_fn():
        df = wb.download(indicator=indicator, country=countries, start=start, end=end)
        return df.reset_index()
        
    df = cache.get_dataframe("world_bank", name, fetch_fn)
    return df
