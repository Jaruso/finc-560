INDICATORS = {
    "core_pce": {
        "title": "Core PCE Price Index",
        "provider": "fred",
        "series_id": "PCEPILFE",
        "original_source": "BEA",
        "frequency": "M",
        "transform": "yoy_pct",
        "unit_display": "% YoY"
    },
    "cpi": {
        "title": "Headline CPI",
        "provider": "fred",
        "series_id": "CPIAUCSL",
        "original_source": "BLS",
        "frequency": "M",
        "transform": "yoy_pct",
        "unit_display": "% YoY"
    },
    "core_cpi": {
        "title": "Core CPI",
        "provider": "fred",
        "series_id": "CPILFESL",
        "original_source": "BLS",
        "frequency": "M",
        "transform": "yoy_pct",
        "unit_display": "% YoY"
    },
    "fed_funds": {
        "title": "Effective Federal Funds Rate",
        "provider": "fred",
        "series_id": "DFF", # or FEDFUNDS
        "original_source": "Federal Reserve",
        "frequency": "M",
        "transform": "level",
        "unit_display": "%"
    },
    "treasury_10y": {
        "title": "10-Year Treasury Constant Maturity Rate",
        "provider": "fred",
        "series_id": "DGS10",
        "original_source": "Federal Reserve",
        "frequency": "D",
        "transform": "level",
        "unit_display": "%"
    },
    "treasury_2y": {
        "title": "2-Year Treasury Constant Maturity Rate",
        "provider": "fred",
        "series_id": "DGS2",
        "original_source": "Federal Reserve",
        "frequency": "D",
        "transform": "level",
        "unit_display": "%"
    },
    "treasury_3m": {
        "title": "3-Month Treasury Constant Maturity Rate",
        "provider": "fred",
        "series_id": "DGS3MO",
        "original_source": "Federal Reserve",
        "frequency": "D",
        "transform": "level",
        "unit_display": "%"
    },
    "treasury_5y": {
        "title": "5-Year Treasury Constant Maturity Rate",
        "provider": "fred",
        "series_id": "DGS5",
        "original_source": "Federal Reserve",
        "frequency": "D",
        "transform": "level",
        "unit_display": "%"
    },
    "treasury_30y": {
        "title": "30-Year Treasury Constant Maturity Rate",
        "provider": "fred",
        "series_id": "DGS30",
        "original_source": "Federal Reserve",
        "frequency": "D",
        "transform": "level",
        "unit_display": "%"
    },
    "spread_10y_2y": {
        "title": "10-Year Minus 2-Year Treasury Yield Spread",
        "provider": "fred",
        "series_id": "T10Y2Y",
        "original_source": "Federal Reserve",
        "frequency": "D",
        "transform": "level",
        "unit_display": "%"
    },
    "unemployment": {
        "title": "U.S. Unemployment Rate",
        "provider": "fred",
        "series_id": "UNRATE",
        "original_source": "BLS",
        "frequency": "M",
        "transform": "level",
        "unit_display": "%"
    },
    "job_openings_rate": {
        "title": "Job Openings Rate",
        "provider": "fred",
        "series_id": "JTSJOR",
        "original_source": "BLS",
        "frequency": "M",
        "transform": "level",
        "unit_display": "%"
    },
    "real_gdp": {
        "title": "Real Gross Domestic Product",
        "provider": "fred",
        "series_id": "GDPC1",
        "original_source": "BEA",
        "frequency": "Q",
        "transform": "yoy_pct",
        "unit_display": "% YoY"
    },
    "industrial_production": {
        "title": "Industrial Production",
        "provider": "fred",
        "series_id": "INDPRO",
        "original_source": "Federal Reserve",
        "frequency": "M",
        "transform": "yoy_pct",
        "unit_display": "% YoY"
    },
    "retail_sales": {
        "title": "Real Retail and Food Services Sales",
        "provider": "fred",
        "series_id": "RRSFS",
        "original_source": "Census",
        "frequency": "M",
        "transform": "yoy_pct",
        "unit_display": "% YoY"
    },
    "payrolls": {
        "title": "All Employees, Total Nonfarm",
        "provider": "fred",
        "series_id": "PAYEMS",
        "original_source": "BLS",
        "frequency": "M",
        "transform": "yoy_pct",
        "unit_display": "% YoY"
    },
    "housing_starts": {
        "title": "Housing Starts",
        "provider": "fred",
        "series_id": "HOUST",
        "original_source": "Census",
        "frequency": "M",
        "transform": "yoy_pct",
        "unit_display": "% YoY"
    },
    "g7_inflation": {
        "title": "G7 Inflation",
        "provider": "oecd", # We'll use WB as substitute if OECD is unavailable
        "series_id": "FP.CPI.TOTL.ZG",
        "original_source": "World Bank",
        "frequency": "A",
        "transform": "level",
        "unit_display": "% YoY"
    },
    "global_growth": {
        "title": "Real GDP Growth",
        "provider": "world_bank",
        "series_id": "NY.GDP.MKTP.KD.ZG",
        "original_source": "World Bank",
        "frequency": "A",
        "transform": "level",
        "unit_display": "%"
    },
    "dollar_index": {
        "title": "Trade Weighted U.S. Dollar Index",
        "provider": "fred",
        "series_id": "DTWEXBGS",
        "original_source": "Federal Reserve",
        "frequency": "D",
        "transform": "index",
        "unit_display": "Index"
    },
    "wti_crude": {
        "title": "WTI Crude Oil Prices",
        "provider": "fred",
        "series_id": "DCOILWTICO",
        "original_source": "EIA",
        "frequency": "D",
        "transform": "level",
        "unit_display": "$/Barrel"
    },
    "brent_crude": {
        "title": "Brent Crude Oil Prices",
        "provider": "fred",
        "series_id": "DCOILBRENTEU",
        "original_source": "EIA",
        "frequency": "D",
        "transform": "level",
        "unit_display": "$/Barrel"
    },
    "labor_force_participation": {
        "title": "Civilian Labor Force Participation Rate",
        "provider": "fred",
        "series_id": "CIVPART",
        "original_source": "BLS",
        "frequency": "M",
        "transform": "level",
        "unit_display": "%"
    },
    "prime_age_epop": {
        "title": "Employment-Population Ratio, Ages 25-54",
        "provider": "fred",
        "series_id": "LNS12300060",
        "original_source": "BLS",
        "frequency": "M",
        "transform": "level",
        "unit_display": "%"
    },
    "average_hourly_earnings": {
        "title": "Average Hourly Earnings, Total Private",
        "provider": "fred",
        "series_id": "CES0500000003",
        "original_source": "BLS",
        "frequency": "M",
        "transform": "yoy_pct",
        "unit_display": "% YoY"
    },
    "oecd_cli": {
        "title": "OECD Composite Leading Indicator, United States",
        "provider": "fred",
        "series_id": "USALOLITOAASTSAM",
        "original_source": "OECD",
        "frequency": "M",
        "transform": "level",
        "unit_display": "Index"
    },
    "cfnai_3m": {
        "title": "Chicago Fed National Activity Index, 3-Month Average",
        "provider": "fred",
        "series_id": "CFNAIMA3",
        "original_source": "Federal Reserve Bank of Chicago",
        "frequency": "M",
        "transform": "level",
        "unit_display": "Index"
    },
    "natural_gas": {
        "title": "Henry Hub Natural Gas Spot Price",
        "provider": "fred",
        "series_id": "DHHNGSP",
        "original_source": "EIA",
        "frequency": "D",
        "transform": "level",
        "unit_display": "$/MMBtu"
    }
}
