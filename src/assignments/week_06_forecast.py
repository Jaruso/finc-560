"""Week 6: reproducible, data-calibrated dynamic Nelson–Siegel forecasting.

Method: cross-sectional fixed-decay Nelson–Siegel OLS each month followed
by a separate AR(1) for the three fitted factors (Diebold–Li-style two-stage
forecasting). This is a pedagogical implementation, not a no-arbitrage model.

Uncertainty: empirical 10th/90th percentiles of rolling-origin forecast
errors, fitted only using observations available at each origin. Such bands
describe historical errors; they are NOT guaranteed future coverage.
Conditional policy shocks: association between MONTHLY CHANGES in DFF and
MONTHLY CHANGES in NS factors, propagated through fitted AR coefficients.
This observational association is NOT an identified effect of a Fed surprise.
"""
from __future__ import annotations

from datetime import datetime, timezone
from math import sqrt

import numpy as np
import pandas as pd

from src.data.providers.fred import fetch_fred_series

# FRED publishes these as percent, NOT basis points.
TENORS = {
    "DGS1": 12,
    "DGS2": 24,
    "DGS3": 36,
    "DGS5": 60,
    "DGS7": 84,
    "DGS10": 120,
    "DGS20": 240,
    "DGS30": 360,
}
POLICY = "DFF"
ALL_SERIES = tuple(TENORS) + (POLICY,)
START = "2006-01-01"
DECAY_PER_MONTH = 0.0609
MAX_HORIZON = 24
MIN_TRAIN_MONTHS = 120
BACKTEST_ORIGINS = 60


def loadings(maturities_months: np.ndarray, decay: float = DECAY_PER_MONTH) -> np.ndarray:
    """Standard Nelson–Siegel [level, slope, curvature] factor loadings."""
    maturities_months = np.asarray(maturities_months, dtype=float)
    if (maturities_months <= 0).any() or decay <= 0:
        raise ValueError("Maturities and decay must be strictly positive")
    scaled = decay * maturities_months
    slope = -np.expm1(-scaled) / scaled
    return np.column_stack([np.ones_like(slope), slope, slope - np.exp(-scaled)])


LOAD = loadings(np.asarray(list(TENORS.values())))
IDX5 = tuple(TENORS).index("DGS5")
IDX10 = tuple(TENORS).index("DGS10")


def align_monthly(daily: pd.DataFrame) -> tuple[pd.DataFrame, pd.Timestamp]:
    """Select a SINGLE common trading day per month across all maturities."""
    absent = set(ALL_SERIES) - set(daily.columns)
    if absent:
        raise ValueError("Missing FRED series: " + ", ".join(sorted(absent)))
    frame = daily.loc[:, list(ALL_SERIES)].copy()
    frame.index = pd.to_datetime(frame.index)
    if frame.index.has_duplicates:
        frame = frame[~frame.index.duplicated(keep="last")]
    frame = frame.sort_index()
    for col in ALL_SERIES:
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    # Prevent stitching maturities from different days; Fed funds is
    # observed/forward-filled to the same latest common trading date.
    yields = frame.loc[:, list(TENORS)].dropna(how="any")
    if yields.empty:
        raise ValueError("No dates with a complete Treasury cross section.")
    common = yields.resample("MS").last().dropna()
    # Pick matching actual *daily* common date for provenance.
    common_dates = pd.Series(yields.index, index=yields.index).resample("MS").last()
    policy = frame[POLICY].ffill().reindex(common_dates.values, method="ffill")
    common[POLICY] = policy.to_numpy()
    common = common.dropna(how="any")
    if len(common) < MIN_TRAIN_MONTHS + MAX_HORIZON + 25:
        raise ValueError("Insufficient aligned history for 24-month rolling backtests")
    latest_day = pd.Timestamp(common_dates.loc[common.index[-1]])
    return common, latest_day


def cross_section_factors(matrix: np.ndarray) -> np.ndarray:
    """OLS fit of the fixed-loadings term structure at each observed month."""
    matrix = np.asarray(matrix, dtype=float)
    if matrix.ndim != 2 or matrix.shape[1] != len(TENORS) or not np.isfinite(matrix).all():
        raise ValueError("Yield matrix must contain eight finite maturity columns")
    return np.linalg.lstsq(LOAD, matrix.T, rcond=None)[0].T


def fit_factor_ar(factors: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Three separately estimated stationary AR(1)s; no hidden future data."""
    if len(factors) < MIN_TRAIN_MONTHS:
        raise ValueError("Insufficient factor history")
    x = np.column_stack([np.ones(len(factors) - 1), factors[:-1]])
    # Separate univariate factor regressions, not pooled cross-factor OLS:
    intercept = np.zeros(3)
    phi = np.zeros(3)
    for col in range(3):
        beta = np.linalg.lstsq(x[:, [0, col + 1]], factors[1:, col], rcond=None)[0]
        # Mild stationarity guard prevents explosive extrapolation with
        # near-unit-root finite samples. The fitted raw phi is documented.
        phi[col] = float(np.clip(beta[1], -0.995, 0.995))
        intercept[col] = float(np.mean(factors[1:, col]) -
                               phi[col] * np.mean(factors[:-1, col]))
    return intercept, phi


def fit_policy_association(factors: np.ndarray, policy: np.ndarray) -> np.ndarray:
    """Descriptive monthly differenced co-movement, NOT causal policy beta."""
    if len(factors) != len(policy):
        raise ValueError("Misaligned policy/factor observations")
    x = np.diff(policy)
    y = np.diff(factors, axis=0)
    centered = x - x.mean()
    denom = float(centered @ centered)
    if denom < 0.01:
        # No observed changes: do not invent policy sensitivity.
        return np.zeros(3)
    return np.asarray(centered @ (y - y.mean(axis=0)) / denom, dtype=float)


def factor_path(last: np.ndarray, intercept: np.ndarray, phi: np.ndarray, months: int) -> np.ndarray:
    out = [np.array(last, dtype=float)]
    for _ in range(months):
        out.append(intercept + phi * out[-1])
    return np.asarray(out)


def _calendar(date: pd.Timestamp, month: int) -> str:
    return (pd.Timestamp(date) + pd.DateOffset(months=month)).strftime("%Y-%m-%d")


def rolling_errors(
    complete_yields: np.ndarray, complete_factors: np.ndarray
) -> tuple[dict, list[dict]]:
    """Walk-forward forecasts never fit an AR using target-month observations.

    Factors have fixed cross-sectional loadings at each observed date. Origin
    models and baseline random-walk forecasts use data through origin only.
    Last 60 valid origins for the *longest* (24-month) horizon supply
    empirical error distributions across all 1–24-month horizons.
    """
    n = len(complete_factors)
    latest_origin = n - MAX_HORIZON - 1
    first_origin = max(MIN_TRAIN_MONTHS - 1, latest_origin - BACKTEST_ORIGINS + 1)
    origins = list(range(first_origin, latest_origin + 1))
    if len(origins) < 25:
        raise ValueError("Need at least 25 historical origins for the 24-month horizon")
    errors = {name: {h: [] for h in range(1, MAX_HORIZON + 1)}
              for name in ("5y", "10y", "spread")}
    naive = {name: {h: [] for h in (6, 12, 24)}
             for name in ("5y", "10y", "spread")}
    for origin in origins:
        a, phi = fit_factor_ar(complete_factors[: origin + 1])
        predicted = factor_path(complete_factors[origin], a, phi, MAX_HORIZON) @ LOAD.T
        initial = complete_yields[origin]
        for h in range(1, MAX_HORIZON + 1):
            actual = complete_yields[origin + h]
            prediction = predicted[h]
            for name, i in (("5y", IDX5), ("10y", IDX10)):
                errors[name][h].append(float(actual[i] - prediction[i]))
                if h in naive[name]:
                    naive[name][h].append(float(actual[i] - initial[i]))
            actual_spread = actual[IDX10] - actual[IDX5]
            forecast_spread = prediction[IDX10] - prediction[IDX5]
            errors["spread"][h].append(float(actual_spread - forecast_spread))
            if h in naive["spread"]:
                naive["spread"][h].append(
                    float(actual_spread - (initial[IDX10] - initial[IDX5]))
                )
    envelopes = {
        name: [
            {
                "month": h, "error_p10_pp": round(float(np.quantile(errors[name][h], .1)), 5),
                "error_p90_pp": round(float(np.quantile(errors[name][h], .9)), 5),
                "sample_count": len(errors[name][h])
            }
            for h in range(1, MAX_HORIZON + 1)
        ]
        for name in errors
    }
    diagnostics = []
    for h in (6, 12, 24):
        for name in errors:
            model_rmse = sqrt(float(np.mean(np.square(errors[name][h]))))
            naive_rmse = sqrt(float(np.mean(np.square(naive[name][h]))))
            diagnostics.append({
                "horizon_months": h, "metric": name, "origins": len(origins),
                "rmse_model_bp": round(model_rmse * 100, 2),
                "rmse_no_change_bp": round(naive_rmse * 100, 2)
            })
    return envelopes, diagnostics


def build_snapshot(daily: pd.DataFrame | None = None, *, as_of: datetime | None = None) -> dict:
    if daily is None:
        daily = fetch_fred_series(list(ALL_SERIES), START, max_age_hours=0)
    monthly, latest_day = align_monthly(daily)
    now = as_of or datetime.now(timezone.utc)
    partial_month = monthly.index[-1].to_period("M") == pd.Timestamp(now).tz_localize(None).to_period("M")
    matrix = monthly[list(TENORS)].to_numpy(dtype=float)
    factors = cross_section_factors(matrix)
    # Partial months are useful for latest live baseline, but not training
    # dynamics or backtests that assume equally spaced complete months.
    complete_count = len(monthly) - int(partial_month)
    complete_factors = factors[:complete_count]
    complete_yields = matrix[:complete_count]
    if complete_count < MIN_TRAIN_MONTHS + MAX_HORIZON + 25:
        raise ValueError("Insufficient COMPLETE history for validated 24-month output")
    intercept, phi = fit_factor_ar(complete_factors)
    policy_beta = fit_policy_association(
        complete_factors, monthly[POLICY].to_numpy()[:complete_count]
    )
    predicted_factors = factor_path(factors[-1], intercept, phi, MAX_HORIZON)
    predicted = predicted_factors @ LOAD.T
    effects = np.asarray([
        LOAD @ (np.power(phi, h - 1) * policy_beta)
        for h in range(1, MAX_HORIZON + 1)
    ])
    envelopes, diagnostics = rolling_errors(complete_yields, complete_factors)
    observed = [
        {"date": month.strftime("%Y-%m-%d"),
         "dgs5": round(float(y[IDX5]), 4),
         "dgs10": round(float(y[IDX10]), 4),
         "policy": round(float(row[POLICY]), 4)}
        for (month, row), y in zip(monthly.iterrows(), matrix)
    ]
    baseline = [
        {"date": observed[-1]["date"], "month": 0,
         "y5": observed[-1]["dgs5"], "y10": observed[-1]["dgs10"],
         "spread": round(observed[-1]["dgs10"] - observed[-1]["dgs5"], 5),
         "effect5_per_1pp": 0, "effect10_per_1pp": 0}
    ]
    for h in range(1, MAX_HORIZON + 1):
        y5 = float(predicted[h, IDX5])
        y10 = float(predicted[h, IDX10])
        baseline.append({
            "date": _calendar(monthly.index[-1], h), "month": h,
            "y5": round(y5, 5), "y10": round(y10, 5),
            "spread": round(y10 - y5, 5),
            "effect5_per_1pp": round(float(effects[h - 1, IDX5]), 6),
            "effect10_per_1pp": round(float(effects[h - 1, IDX10]), 6),
        })
    fit_error = factors @ LOAD.T - matrix
    return {
        "schema_version": 2,
        "status": "ready",
        "model": "Fixed-decay Nelson–Siegel monthly factors + separate factor AR(1) (Diebold–Li-style)",
        "model_parameters": {
            "lambda_per_month": DECAY_PER_MONTH,
            "maturities_months": list(TENORS.values()),
            "factor_ar_phi": [round(float(x), 5) for x in phi],
            "policy_factor_association_per_1pp": [round(float(x), 5) for x in policy_beta],
            "cross_section_rmse_bp": round(
                float(np.sqrt(np.mean(np.square(fit_error))) * 100), 2
            ),
            "complete_training_months": complete_count
        },
        "source": "Federal Reserve / FRED H.15 Treasury constant maturities and DFF",
        "source_urls": {s: "https://fred.stlouisfed.org/series/" + s for s in ALL_SERIES},
        "retrieved_utc": now.isoformat(timespec="seconds"),
        "latest_synchronized_daily_observation": latest_day.strftime("%Y-%m-%d"),
        "latest_month_is_partial": bool(partial_month),
        "frequency": "Last complete COMMON trading-date Treasury cross-section each month; latest month may be partial",
        "unit": "Percent per annum; forecast errors use basis points where marked",
        "observations": observed,
        "forecast": baseline,
        "empirical_error_bands": envelopes,
        "backtest": {
            "method": "60 expanding rolling origins, using data through each origin; fixed calendar 6/12/24-month targets",
            "origin_count": diagnostics[0]["origins"],
            "min_initial_training_months": MIN_TRAIN_MONTHS,
            "band_interpretation": "Historical 10th/90th percentile rolling-origin forecast error. Descriptive, not guaranteed 80% predictive coverage; one-time policy scenarios not separately backtested.",
            "metrics": diagnostics
        },
        "policy_scenario": {
            "interpretation": "One-time next-month DFF deviation versus the model baseline, in percentage points; observed association only (not a causal policy-surprise effect or futures-implied expectation).",
            "applied_month": 1,
            "response": "Monthly factor-difference/DFF-difference OLS association, propagated through fitted AR(1) factor dynamics",
        },
    }
