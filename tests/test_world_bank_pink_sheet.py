"""Unit tests use generated fixtures; production prices are downloaded separately."""
from datetime import datetime, timezone
from io import BytesIO
import sys
from pathlib import Path
import unittest
import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.world_bank_pink_sheet import (
    category_for, parse_monthly_workbook, select_workbook_url, CATEGORIES
)

URL=("https://thedocs.worldbank.org/en/doc/official/related/"
     "CMO-Historical-Data-Monthly.xlsx")


def workbook():
    book=openpyxl.Workbook()
    sheet=book.active
    sheet.title="Mismatch Details"
    sheet.sheet_state="hidden"
    ws=book.create_sheet("Monthly Prices")
    for text in ["World Bank commodity price data", "nominal prices",
                 "updated monthly", "Updated September 2026"]:
        ws.append([text])
    names=["Crude oil, Brent", "Gold", "Natural gas index",
           "Barley", "Tea, Kolkata", "Copper", "Cotton, A Index"]
    names += [f"Sample {i}" for i in range(41)]
    units=["($/kg)"]*len(names)
    units[0]="($/bbl)"
    units[1]="($/troy oz)"
    units[2]="(2010=100)"
    units[3]="($/mt)"
    units[5]="($/mt)"
    ws.append([None, *names])
    ws.append([None, *units])
    for i in range(96):
        year=2018+i//12;month=i%12+1
        date=f"{year}M{month:02d}"
        vals=[12+i*.1+j for j in range(len(names))]
        # One benchmark vanishes for the final 62 months; never interpolate.
        if i>=34: vals[3]="…"
        ws.append([date, *vals])
    bio=BytesIO()
    book.save(bio)
    return bio.getvalue()


class CommodityCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.assets,cls.skipped=parse_monthly_workbook(
            workbook(),URL,datetime(2026,1,15,tzinfo=timezone.utc))

    def test_monthly_price_rows_not_hidden_sheet(self):
        self.assertGreaterEqual(len(self.assets),40)
        keys={item["id"] for item in self.assets}
        self.assertIn("wb-gold",keys)
        self.assertIn("wb-tea-kolkata",keys)
        self.assertNotIn("wb-natural-gas-index",keys)
        self.assertNotIn("wb-barley",keys)
        self.assertIn("Barley", [item["name"] for item in self.skipped])
        gold=next(item for item in self.assets if item["id"]=="wb-gold")
        self.assertEqual(gold["unit"],"USD/troy oz")
        self.assertEqual(gold["category"],"Precious metals")
        self.assertEqual(gold["last_observation"],"2025-12-01")
        self.assertTrue(gold["source_url"].startswith("https://thedocs.worldbank.org/"))

    def test_categories_cover_requested_markets(self):
        checks={
          "Uranium":"Industrial metals", # Separate IMF Uranium overrides Critical minerals.
          "Crude oil, Brent":"Energy","Silver":"Precious metals",
          "Copper":"Industrial metals","Logs, Malaysian":"Forest products",
          "Wheat, US HRW":"Grains","Rice, Thai 5%":"Grains",
          "Soybeans":"Oilseeds & oils","Tea, Kolkata":"Soft commodities",
          "Cocoa":"Soft commodities","Urea":"Fertilizers",
          "Chicken":"Livestock & food"
        }
        for label,expected in checks.items():
            self.assertEqual(category_for(label),expected,label)
        self.assertGreaterEqual(len(CATEGORIES),10)

    def test_only_trust_world_bank_workbook_url(self):
        html=(
          '<a href="https://evil.example/CMO-Historical-Data-Monthly.xlsx">bad</a>'
          '<a href="/en/doc/official/related/CMO-Historical-Data-Monthly.xlsx">good</a>'
        )
        self.assertEqual(select_workbook_url(html),URL)
        self.assertIn("thedocs.worldbank.org",select_workbook_url(""))
