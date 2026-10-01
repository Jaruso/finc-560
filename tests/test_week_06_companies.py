import unittest
from datetime import date
from scripts.export_week_06_companies import (
    ticker_ciks, normalize, FEATURED,
)


def sample_company(years=7):
    tags = ("RevenueFromContractWithCustomerExcludingAssessedTax",
            "OperatingIncomeLoss", "NetIncomeLoss")
    gaap = {}
    for j, tag in enumerate(tags):
        records = []
        for i in range(years):
            start, end = date(2018+i, 1, 1), date(2018+i, 12, 31)
            value = [100_000_000, 25_000_000, 15_000_000][j] * (1+i*.1)
            records.append({
                "form": "10-K", "start": start.isoformat(),
                "end": end.isoformat(), "val": round(value),
                "filed": date(2019+i, 3, 1).isoformat(),
                "accn": f"00000-{i}",
            })
        gaap[tag] = {"units": {"USD": records}}
    return {"entityName": "Test fixture - not real financial data",
            "facts": {"us-gaap": gaap}}


class SecNormalizerTests(unittest.TestCase):
    def test_cik_mapping(self):
        rows = {str(i): {"ticker": symbol, "title": symbol, "cik_str": i+100}
                for i, symbol in enumerate(FEATURED)}
        self.assertEqual(ticker_ciks(rows)["MSFT"]["cik"], 100)

    def test_periods_and_unit_normalization(self):
        d = normalize(sample_company(), "FIXTURE", 1234, retrieved="2030-01-01")
        self.assertEqual(len(d["annual"]), 7)
        self.assertEqual(d["annual"][0]["revenue_musd"], 100)
        self.assertEqual(d["annual"][-1]["net_income_musd"], 24)
        self.assertEqual(d["annual"][0]["filings"]["operating"]["start"], "2018-01-01")

    def test_mismatched_period_does_not_silently_merge(self):
        company = sample_company()
        company["facts"]["us-gaap"]["NetIncomeLoss"]["units"]["USD"][3]["start"] = "2021-03-01"
        with self.assertRaisesRegex(ValueError, "nonconsecutive"):
            normalize(company, "FIXTURE", 1234, retrieved="2030-01-01")

    def test_amended_annual_values_are_used(self):
        company = sample_company()
        net = company["facts"]["us-gaap"]["NetIncomeLoss"]["units"]["USD"]
        net.append({**net[-1], "filed": "2026-02-02",
                    "form": "10-K/A", "val": 40_000_000})
        d = normalize(company, "FIXTURE", 1234, retrieved="2030-01-01")
        self.assertEqual(d["annual"][-1]["net_income_musd"], 40.0)
        self.assertEqual(d["annual"][-1]["filings"]["net"]["filed"], "2026-02-02")

    def test_missing_and_sparse_data_are_not_published(self):
        with self.assertRaisesRegex(ValueError, "no US GAAP"):
            normalize({}, "FIXTURE", 1234, retrieved="2030-01-01")
        with self.assertRaisesRegex(ValueError, "only"):
            normalize(sample_company(years=4), "FIXTURE", 1234,
                      retrieved="2030-01-01")


if __name__ == "__main__":
    unittest.main()
