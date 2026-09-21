from __future__ import annotations

import pandas as pd

def normalize_series(
    df: pd.DataFrame,
    provider: str,
    original_source: str,
    dataset: str,
    series_key: str,
    concept: str,
    unit: str,
    frequency: str,
    seasonal_adjustment: str,
) -> pd.DataFrame:
    """
    Normalizes a wide or raw DataFrame into the standard schema:
    [provider, original_source, dataset, series_key, concept, date, value, unit, frequency, seasonal_adjustment]
    """
    # Assuming df has 'DATE' or 'year' as index and 'value' as column, or is already unpivoted
    if df.index.name in ('DATE', 'year', 'date'):
        df = df.reset_index()
        df = df.rename(columns={df.columns[0]: 'date'})
    
    # If there are multiple series columns, melt them.
    # But usually we process one series at a time here.
    if len(df.columns) == 2 and 'date' in df.columns:
        value_col = [c for c in df.columns if c != 'date'][0]
        df = df.rename(columns={value_col: 'value'})
    
    df['provider'] = provider
    df['original_source'] = original_source
    df['dataset'] = dataset
    df['series_key'] = series_key
    df['concept'] = concept
    df['unit'] = unit
    df['frequency'] = frequency
    df['seasonal_adjustment'] = seasonal_adjustment
    
    return df
