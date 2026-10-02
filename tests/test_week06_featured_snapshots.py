"""Verify versioned real, source-linked featured historical datasets."""
import json
import unittest
from pathlib import Path
from urllib.parse import urlparse

DATA = Path("docs/week-06/equities/data")
EXPECTED = {"MSFT": 6, "AAPL": 5, "HD": 5}


class FeaturedDatasetTests(unittest.TestCase):
    def test_manifest_matches_verified_company_snapshots(self):
        manifest = json.loads((DATA / "manifest.json").read_text())
        self.assertEqual(manifest["status"], "ready")
        self.assertEqual({c["ticker"] for c in manifest["companies"]}, set(EXPECTED))
        for c in manifest["companies"]:
            ticker = c["ticker"]
            d = json.loads((DATA / f"{ticker}.json").read_text())
            self.assertEqual(d["ticker"], ticker)
            self.assertEqual(len(d["annual"]), EXPECTED[ticker])
            self.assertEqual(d["annual"][-1]["fiscal_end"], c["latest_fiscal_end"])
            self.assertEqual(d["refresh_mode"], "curated")
            self.assertEqual(d["unit"], "USD millions")
            years = [r["fiscal_end"] for r in d["annual"]]
            self.assertEqual(years, sorted(years))
            for row in d["annual"]:
                self.assertGreater(row["revenue_musd"], 0)
                self.assertLess(abs(row["operating_income_musd"]), row["revenue_musd"])
                self.assertLess(abs(row["net_income_musd"]), row["revenue_musd"])
                self.assertTrue(row["source_url"].startswith("https://"))
                host = urlparse(row["source_url"]).netloc
                self.assertIn(host, {"www.microsoft.com", "microsoft.com", "www.sec.gov"})
                for key in ("revenue", "operating", "net"):
                    self.assertEqual(row["filings"][key]["source_url"], row["source_url"])

    def test_initial_snapshot_is_not_mislabeled_live(self):
        manifest = json.loads((DATA / "manifest.json").read_text())
        self.assertEqual(manifest["refresh_mode"], "curated")
        self.assertIn("paused", manifest["refresh_note"])
        microsoft = json.loads((DATA / "MSFT.json").read_text())
        self.assertIn("unaudited", microsoft["as_reported_note"].lower())


if __name__ == "__main__":
    unittest.main()
