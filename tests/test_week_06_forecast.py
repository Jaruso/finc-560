import unittest
from datetime import datetime, timezone
import numpy as np
import pandas as pd
from src.assignments.week_06_forecast import (
    ALL_SERIES, TENORS, LOAD, cross_section_factors, fit_factor_ar,
    fit_policy_association, factor_path, rolling_errors, align_monthly,
    build_snapshot
)

class ForecastModelTests(unittest.TestCase):
    @staticmethod
    def synthetic(months=234):
        """Deterministic, NON-public test fixture: never published as FRED data."""
        dates = pd.date_range("2006-01-01", periods=months, freq="MS")
        f = np.column_stack([
            3.2 + .9 * np.sin(np.arange(months) / 18),
            -.7 + .32 * np.sin(np.arange(months) / 12),
            .45 + .22 * np.cos(np.arange(months) / 16)
        ])
        grid = f @ LOAD.T
        policy = np.repeat(1.5, months) + np.sin(np.arange(months)/13) * .4
        daily = pd.DataFrame(grid, columns=list(TENORS), index=dates)
        daily["DFF"] = policy
        return daily, f

    def test_cross_section_recovers_known_factors(self):
        daily, factors = self.synthetic()
        reconstructed = cross_section_factors(daily[list(TENORS)].to_numpy())
        np.testing.assert_allclose(reconstructed, factors, atol=1e-11)

    def test_no_borrowing_values_from_different_trading_days(self):
        daily,_ = self.synthetic()
        frame = pd.concat([daily, daily.iloc[:1].rename(index={
            daily.index[0]: daily.index[0] + pd.Timedelta(days=1)
        })])
        frame.loc[daily.index[0] + pd.Timedelta(days=1),"DGS7"] = np.nan
        monthly,last = align_monthly(frame)
        self.assertAlmostEqual(monthly.iloc[0]["DGS7"],daily.iloc[0]["DGS7"])
        self.assertEqual(last.month,6)  # Last month for a 234-month fixture.

    def test_policy_association_handles_no_policy_variation(self):
        daily,f = self.synthetic()
        beta = fit_policy_association(f,np.ones(len(f)))
        np.testing.assert_array_equal(beta,np.zeros(3))

    def test_rolling_forecasts_do_not_read_future_rows(self):
        daily,f = self.synthetic()
        yields=daily[list(TENORS)].to_numpy()
        e1,d1=rolling_errors(yields, f)
        corrupt=yields.copy()
        corrupt[-1,:]+=25
        e2,d2=rolling_errors(corrupt,f)
        # All origins evaluate targets through the last complete month, so
        # changing the last value should affect errors at some horizons.
        self.assertNotEqual(e1["5y"][23],e2["5y"][23])
        # Only the longest horizon can reach the final evaluation month
        # among our fixed 60 rolling origins.
        self.assertEqual(e1["5y"][22],e2["5y"][22])
        self.assertEqual(len(e1["spread"]),24)
        self.assertEqual(len(d1),9)
        for row in d1:
            self.assertGreaterEqual(row["origins"],25)

    def test_snapshot_model_date_and_backtest(self):
        daily,_ = self.synthetic()
        result=build_snapshot(daily,as_of=datetime(2030,1,1,tzinfo=timezone.utc))
        self.assertEqual(result["schema_version"],2)
        self.assertEqual(len(result["forecast"]),25)
        self.assertEqual(result["forecast"][0]["y5"],result["observations"][-1]["dgs5"])
        self.assertEqual(len(result["backtest"]["metrics"]),9)
        self.assertTrue(np.isfinite(result["forecast"][-1]["y10"]))
        self.assertEqual(result["latest_synchronized_daily_observation"],daily.index[-1].strftime("%Y-%m-%d"))
        self.assertFalse(result["latest_month_is_partial"])
        self.assertEqual(set(result["source_urls"]),set(ALL_SERIES))
        self.assertTrue(all(x["sample_count"]>=25 for x in result["empirical_error_bands"]["spread"]))

    def test_latest_partial_month_not_used_to_fit(self):
        daily,_=self.synthetic()
        recent=daily.index[-1]
        result=build_snapshot(daily,as_of=recent.to_pydatetime().replace(tzinfo=timezone.utc))
        self.assertTrue(result["latest_month_is_partial"])
        self.assertEqual(result["model_parameters"]["complete_training_months"],len(daily)-1)

if __name__ == "__main__":
    unittest.main()
