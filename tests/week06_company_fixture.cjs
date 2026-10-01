/* Browser-test-only deterministic accounting fixture; never published. */
function fixture(ticker="MSFT"){
  const annual=Array.from({length:7},(_,i)=>({
    fiscal_end:(2019+i)+"-06-30",
    fiscal_start:(2018+i)+"-07-01",
    revenue_musd:100000*Math.pow(1.11,i),
    operating_income_musd:25000*Math.pow(1.13,i),
    net_income_musd:17000*Math.pow(1.12,i),
    tags:{revenue:"RevenueFromContractWithCustomerExcludingAssessedTax",
      operating:"OperatingIncomeLoss",net:"NetIncomeLoss"},
    filings:{
      revenue:{filed:(2019+i)+"-08-01",accession:"0000-TEST"},
      operating:{filed:(2019+i)+"-08-01",accession:"0000-TEST"},
      net:{filed:(2019+i)+"-08-01",accession:"0000-TEST"}
    }
  }));
  return {schema_version:1,status:"ready",ticker,company:"Test Corporation",
    cik:"0000123456",retrieved_utc:"2026-09-29T18:00:00+00:00",
    currency:"USD",unit:"USD millions",annual,
    data_source:"https://www.sec.gov/EDGAR/test-only"};
}
module.exports={fixture};
