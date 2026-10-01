"""Fetch and normalize annual SEC Company Facts for featured public companies.

Scheduled source-data loader, not the forecasting engine. Browser-side
financial models run on the verified published snapshot. Never synthesize
missing SEC financials or overwrite good data when refresh fails.
"""
from __future__ import annotations

import json
import os
import time
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "docs" / "week-06" / "companies" / "data"
FEATURED = ("MSFT", "AAPL", "HD", "CAT")
TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
AGENT = os.environ.get(
    "SEC_USER_AGENT",
    "FINC560 Academic Coursework jaruso@users.noreply.github.com "
    "https://github.com/jaruso/finc-560/issues",
)
REVENUE_TAGS = (
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues", "SalesRevenueNet",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueGoodsNet",
)
OP_TAGS = ("OperatingIncomeLoss",)
NET_TAGS = ("NetIncomeLoss", "ProfitLoss")
MIN_ANNUAL_DAYS, MAX_ANNUAL_DAYS = 330, 400


def get_json(url: str, retries: int = 3) -> dict:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": AGENT, "Accept": "application/json",
                "Accept-Encoding": "identity",
            })
            with urllib.request.urlopen(req, timeout=35) as response:
                return json.load(response)
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("unreachable")


def ticker_ciks(raw: dict) -> dict[str, dict]:
    rows = raw.values() if isinstance(raw, dict) else raw
    mapped = {item["ticker"].upper(): {
        "cik": int(item["cik_str"]), "name": str(item["title"]),
    } for item in rows if item.get("ticker") and item.get("cik_str")}
    missing = set(FEATURED) - mapped.keys()
    if missing:
        raise ValueError("Missing SEC ticker mapping: " + ", ".join(sorted(missing)))
    return mapped


def annual_gaap_facts(company: dict, tags: tuple[str, ...]) -> dict[str, dict]:
    gaap = company.get("facts", {}).get("us-gaap", {})
    chosen: dict[str, dict] = {}
    for priority, tag in enumerate(tags):
        for record in gaap.get(tag, {}).get("units", {}).get("USD", []):
            if record.get("form") not in ("10-K", "10-K/A"):
                continue
            start, end = record.get("start"), record.get("end")
            if not start or not end or not isinstance(record.get("val"), (int, float)):
                continue
            try:
                days = (date.fromisoformat(end) - date.fromisoformat(start)).days
            except ValueError:
                continue
            if not MIN_ANNUAL_DAYS <= days <= MAX_ANNUAL_DAYS or end < "2015-01-01":
                continue
            if record["val"] < 0 and tags is REVENUE_TAGS:
                continue
            # Retain consistent tag priority, then the most recently filed
            # comparative/restated value from that concept.
            candidate = {
                "value_usd": record["val"], "start": start, "end": end,
                "tag": tag, "filed": str(record.get("filed", "")),
                "accession": str(record.get("accn", "")),
                "rank": (priority, -int(str(record.get("filed", "1970-01-01")).replace("-", ""))),
            }
            prior = chosen.get(end)
            if prior is None or candidate["rank"] < prior["rank"]:
                chosen[end] = candidate
    return chosen


def normalize(company: dict, ticker: str, cik: int, *, retrieved: str) -> dict:
    if not company.get("facts", {}).get("us-gaap"):
        raise ValueError(f"{ticker}: no US GAAP companyfacts")
    revenue = annual_gaap_facts(company, REVENUE_TAGS)
    operating = annual_gaap_facts(company, OP_TAGS)
    net = annual_gaap_facts(company, NET_TAGS)
    rows = []
    for end in sorted(set(revenue) & set(operating) & set(net)):
        r, o, n = revenue[end], operating[end], net[end]
        if len({r["start"], o["start"], n["start"]}) > 1 or r["value_usd"] <= 0:
            continue
        rows.append({
            "fiscal_end": end, "fiscal_start": r["start"],
            "revenue_musd": round(r["value_usd"] / 1_000_000, 4),
            "operating_income_musd": round(o["value_usd"] / 1_000_000, 4),
            "net_income_musd": round(n["value_usd"] / 1_000_000, 4),
            "tags": {"revenue": r["tag"], "operating": o["tag"], "net": n["tag"]},
            "filings": {
                key: {"filed": rec["filed"], "accession": rec["accession"],
                      "start": rec["start"], "end": rec["end"]}
                for key, rec in (("revenue", r), ("operating", o), ("net", n))
            },
        })
    if len(rows) < 5:
        raise ValueError(f"{ticker}: only {len(rows)} matching annual periods")
    rows = rows[-8:]
    for left, right in zip(rows, rows[1:]):
        gap = (date.fromisoformat(right["fiscal_end"]) -
               date.fromisoformat(left["fiscal_end"])).days
        if not 330 <= gap <= 400:
            raise ValueError(f"{ticker}: nonconsecutive annual results")
    return {
        "schema_version": 1, "status": "ready", "ticker": ticker,
        "cik": f"{cik:010d}", "company": str(company.get("entityName", ticker)),
        "retrieved_utc": retrieved, "currency": "USD", "unit": "USD millions",
        "form": "Annual 10-K/10-K-A",
        "data_source": FACTS_URL.format(cik=cik),
        "as_reported_note": (
            "Annual US-GAAP concepts selected by published priority and the "
            "latest filing of each concept. Concept changes and restatements "
            "may affect comparability across financial years."
        ),
        "annual": rows,
    }


def main() -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    mapping = ticker_ciks(get_json(TICKERS_URL))
    payloads = []
    for ticker in FEATURED:
        time.sleep(0.35)  # SEC fair access: <10 requests per second.
        cik = mapping[ticker]["cik"]
        company = get_json(FACTS_URL.format(cik=cik))
        d = normalize(company, ticker, cik, retrieved=now)
        payloads.append(d)
        print(f"{ticker}: {len(d['annual'])} years, latest {d['annual'][-1]['fiscal_end']}")
    # All four fetch/normalization operations succeed BEFORE writing data.
    TARGET.mkdir(parents=True, exist_ok=True)
    for d in payloads:
        (TARGET / f"{d['ticker']}.json").write_text(
            json.dumps(d, indent=2, allow_nan=False) + "\n")
    manifest = {
        "schema_version": 1, "status": "ready", "retrieved_utc": now,
        "source": "SEC EDGAR Company Facts (annual US-GAAP 10-K)",
        "companies": [
            {"ticker": d["ticker"], "company": d["company"],
             "file": f"data/{d['ticker']}.json",
             "latest_fiscal_end": d["annual"][-1]["fiscal_end"]}
            for d in payloads
        ],
    }
    (TARGET / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
