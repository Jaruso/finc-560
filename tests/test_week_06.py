import unittest

import pandas as pd

from src.assignments.week_06 import build_snapshot, monthly_observations


class WeekSixSnapshotTests(unittest.TestCase):
    def setUp(self):
        index = pd.date_range("2021-01-01", periods=1100, freq="D")
        self.data = pd.DataFrame(
            {
                "DGS5": [1.0 + i / 2000 for i in range(len(index))],
                "DGS10": [1.5 + i / 2000 for i in range(len(index))],
                "DFF": [0.5 + i / 4000 for i in range(len(index))],
            }, index=index
        )

    def test_monthly_last_value_and_spread(self):
        rows = monthly_observations(self.data)
        self.assertEqual(rows[0]["date"], "2021-01-01")
        self.assertAlmostEqual(rows[0]["dgs5"], 1 + 30 / 2000)
        self.assertAlmostEqual(rows[0]["dgs10"] - rows[0]["dgs5"], 0.5)

    def test_snapshot_carries_sources_and_latest_actual_date(self):
        result = build_snapshot(self.data)
        self.assertEqual(result["status"], "ready")
        self.assertGreaterEqual(len(result["observations"]), 36)
        self.assertEqual(result["latest_synchronized_daily_observation"], "2024-01-05")

    def test_missing_series_rejected(self):
        with self.assertRaisesRegex(ValueError, "Missing required FRED series"):
            monthly_observations(self.data.drop(columns="DFF"))

    def test_no_fabricated_future_rows(self):
        rows = monthly_observations(self.data)
        self.assertTrue(all(pd.Timestamp(row["date"]) <= self.data.index.max() for row in rows))


if __name__ == "__main__":
    unittest.main()
