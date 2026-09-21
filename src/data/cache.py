from __future__ import annotations

import hashlib
import os
import time
from pathlib import Path
from typing import Callable

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

    @staticmethod
    def _force_refresh_from_env() -> bool:
        return os.getenv("MACRO_FORCE_REFRESH", "").strip().lower() in {"1", "true", "yes", "on"}

    @staticmethod
    def _is_fresh(path: Path, max_age_hours: float | None) -> bool:
        if not path.exists():
            return False
        if max_age_hours is None:
            return True
        age_seconds = time.time() - path.stat().st_mtime
        return age_seconds <= max_age_hours * 3600

    def get_dataframe(
        self,
        provider: str,
        name: str,
        fetch_fn: Callable[[], pd.DataFrame],
        *,
        max_age_hours: float | None = 24,
        force_refresh: bool | None = None,
        allow_stale_on_error: bool = True,
    ) -> pd.DataFrame:
        cache_path = self._cache_path(provider, name)
        refresh = self._force_refresh_from_env() if force_refresh is None else force_refresh

        if not refresh and self._is_fresh(cache_path, max_age_hours):
            return pd.read_parquet(cache_path)

        try:
            df = fetch_fn()
            if not isinstance(df, pd.DataFrame):
                raise TypeError(f"Expected DataFrame from {provider}, got {type(df)!r}")

            tmp = cache_path.with_suffix(".tmp.parquet")
            df.to_parquet(tmp)
            tmp.replace(cache_path)
            return df
        except Exception:
            if allow_stale_on_error and cache_path.exists():
                return pd.read_parquet(cache_path)
            raise
