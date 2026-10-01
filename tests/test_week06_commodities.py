"""Commodity snapshot tests use deterministic synthetic UNIT TEST fixtures only."""
from datetime import datetime, timezone
import sys
from pathlib import Path
import unittest
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.export_week_06_commodities import SOURCES, normalized


def frame():
    dates = pd.date_range("2015-01-02", "2026-08-28", freq="B")
    return pd.DataFrame({series: pd.Series(
        [70.0 + i * .01 + j for i in range(len(dates))], index=dates)
        for j, (_, _, series, _) in enumerate(SOURCES)}, index=dates)


class CommoditySnapshotTests(unittest.TestCase):
    def test_monthly_averages_and_source_provenance(self):
        d = normalized(frame(), datetime(2026, 9, 15, tzinfo=timezone.utc))
        self.assertEqual(d["status"], "ready")
        self.assertEqual({c["id"] for c in d["commodities"]},
                         {"wti", "brent", "gas"})
        for commodity in d["commodities"]:
            self.assertEqual(commodity["last_observation"], "2026-08-01")
            self.assertGreater(len(commodity["observations"]), 125)
            self.assertIn(commodity["source_id"], commodity["source_url"])
            self.assertTrue(all(v["value"] > 0 for v in commodity["observations"]))
            self.assertEqual(commodity["observations"][0]["date"], "2015-01-01")
            self.assertAlmostEqual(commodity["observations"][0]["value"],
                                   frame().loc["2015-01-01":"2015-01-31",
                                               commodity["source_id"]].mean(), places=4)

    def test_excludes_incomplete_current_month(self):
        d = normalized(frame(), datetime(2026, 8, 15, tzinfo=timezone.utc))
        self.assertEqual(d["commodities"][0]["last_observation"], "2026-07-01")

    def test_rejects_stale_or_missing_real_series(self):
        f = frame().drop(columns=["DHHNGSP"])
        with self.assertRaisesRegex(ValueError, "did not supply"):
            normalized(f, datetime(2026, 9, 15, tzinfo=timezone.utc))
        old = frame().loc[:"2025-12-31"]
        with self.assertRaisesRegex(ValueError, "too stale"):
            normalized(old, datetime(2026, 9, 15, tzinfo=timezone.utc))


if __name__ == "__main__":
    unittest.main()
