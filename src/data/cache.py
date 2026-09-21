from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import pandas as pd

class MacroCache:
    def __init__(self, cache_dir: str = "data/raw") -> None:
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _cache_path(self, provider: str, name: str) -> Path:
        digest = hashlib.sha256(name.encode()).hexdigest()[:20]
        path = self.cache_dir / provider
        path.mkdir(parents=True, exist_ok=True)
        return path / f"{digest}.parquet"

    def get_dataframe(
        self,
        provider: str,
        name: str,
        fetch_fn: callable,
        *,
        allow_stale: bool = True,
    ) -> pd.DataFrame:
        cache_path = self._cache_path(provider, name)
        
        if allow_stale and cache_path.exists():
            return pd.read_parquet(cache_path)
            
        # Fetch fresh data
        df = fetch_fn()
        
        # Save to cache
        tmp = cache_path.with_suffix(".tmp")
        df.to_parquet(tmp)
        tmp.replace(cache_path)
        
        return df
