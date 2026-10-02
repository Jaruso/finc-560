const test=require("node:test");
const assert=require("node:assert/strict");
const R=require("../docs/week-06/equities/research.js");
const Forecast=require("../docs/week-06/equities/model.js");
const money=(concept,value)=>({concept:"us-gaap_"+concept,unit:"USD",value:value*1e6});
function makeYear(year,opts={}){
  const endDate=year+"-09-30",accessNumber="0000320193-"+String(year).slice(-2)+"-000001";
  const revenue=100000+(year-2018)*10000;
  const operating=20000+(year-2018)*1500;
  return {year,endDate,startDate:(year-1)+"-10-01",filedDate:year+"-11-15",form:"10-K",
    accessNumber,report:{
      ic:[money("RevenueFromContractWithCustomerExcludingAssessedTax",revenue),
        money("OperatingIncomeLoss",operating),money("NetIncomeLoss",operating*.7),
        money("InterestExpenseNonOperating",2000)],
      bs:[money("CashAndCashEquivalentsAtCarryingValue",15000),
        money("LongTermDebtNoncurrent",80000),
        money("LongTermDebtCurrent",20000)],
      cf:[money("NetCashProvidedByUsedInOperatingActivities",22000),
        money("PaymentsToAcquirePropertyPlantAndEquipment",3000),
        money("DepreciationDepletionAndAmortization",2200)]},...opts};
}
const profile={name:"Test Issuer",ticker:"AAPL",currency:"USD",shareOutstanding:15000,marketCapitalization:2000000};
function normalized(){
  return R.normalize({symbol:"AAPL",cik:320193,data:Array.from({length:7},(_,i)=>makeYear(2019+i))},profile,"AAPL");
}

test("seven distinct actual annual 10-K filing years are normalized in USD millions and source-linked",()=>{
  const d=normalized();assert.equal(d.annual.length,7);
  assert.equal(d.annual.at(-1).revenue_musd,170000);
  assert.equal(d.annual[0].cfo_musd,22000);
  assert.equal(d.annual[0].fcf_musd,19000);
  assert.equal(d.annual[0].total_debt_musd,100000);
  assert.equal(d.annual[0].source_url,"https://www.sec.gov/Archives/edgar/data/320193/000032019319000001/");
  assert.equal(d.shares_million,15000);
  assert.ok(d.annual.every(x=>x.filings.revenue.source_url===x.source_url));
});


test("real Finnhub timestamped 10-Ks normalize and activate revenue forecast, not just quote",()=>{
  // Matches the real finnhub endpoint's date fields shown for NVDA,
  // rather than only the previous fixture's YYYY-MM-DD dates.
  const data=Array.from({length:6},(_,index)=>{
    const year=2021+index;
    const filing=makeYear(year);
    return {...filing,accessNumber:"0001045810-"+String(year).slice(-2)+"-000021",
      startDate:(year-1)+"-01-27 00:00:00",
      endDate:year+"-01-25 00:00:00",
      filedDate:year+"-02-25 00:00:00",
      acceptedDate:year+"-02-25 16:42:19"};
  });
  const p={...profile,ticker:"NVDA",name:"NVIDIA Corp"};
  const normalized=R.normalize({cik:"1045810",symbol:"NVDA",data},p,"NVDA");
  assert.equal(normalized.annual.length,6);
  assert.equal(normalized.annual.at(-1).fiscal_end,"2026-01-25");
  assert.equal(normalized.annual.at(-1).filed_date,"2026-02-25");
  assert.equal(normalized.validation.invalidMetadata,0);
  assert.equal(normalized.validation.accepted,6);
  assert.equal(normalized.warning,null);
  assert.equal(Forecast.verify(normalized),normalized);
  const f=Forecast.forecast(normalized);
  assert.equal(f.projected.length,4);
  assert.equal(f.historical.length,6);
});
test("malformed timestamp or impossible dates are rejected without silent truncation",()=>{
  const cases=["2026-02-30 00:00:00","2026-01-25 25:00:00",
    "2026-01-25 00:00:00 extra","2026-01-25T00:00:00+06:00"];
  for(const endDate of cases){
    const payload=R.normalize({cik:"320193",symbol:"AAPL",
      data:[makeYear(2026,{endDate})]},profile,"AAPL");
    assert.equal(payload.annual.length,0,endDate);
    assert.equal(payload.validation.invalidMetadata,1,endDate);
  }
});
test("amendments replace earlier filings without double-counting, non-10-K excluded",()=>{
  const original=makeYear(2024);
  const amended=makeYear(2024,{form:"10-K/A",filedDate:"2025-02-01",
    report:{...original.report,ic:[money("RevenueFromContractWithCustomerExcludingAssessedTax",300000),
      money("OperatingIncomeLoss",42000),money("NetIncomeLoss",31000)]}});
  const quarterly=makeYear(2024,{form:"10-Q",endDate:"2024-06-30"});
  const d=R.normalize({symbol:"AAPL",cik:320193,data:[original,amended,quarterly]},profile,"AAPL");
  assert.equal(d.annual.length,1);assert.equal(d.annual[0].revenue_musd,300000);
});

test("incomplete statements or missing debt are never fabricated",()=>{
  const d=R.normalize({symbol:"AAPL",cik:320193,data:[makeYear(2024,{
    report:{...makeYear(2024).report,
      ic:[money("RevenueFromContractWithCustomerExcludingAssessedTax",100000),
        money("OperatingIncomeLoss",20000),money("NetIncomeLoss",15000)],
      bs:[money("CashAndCashEquivalentsAtCarryingValue",18000)]}
  })]},profile,"AAPL");
  assert.equal(d.annual[0].total_debt_musd,null);
  assert.equal(d.annual[0].interest_musd,null);
  assert.equal(R.health(d.annual).latest.coverage,null);
  assert.equal(R.stress(d.annual,{observed10y:4,projected10y:5}),null);
  assert.equal(R.valuation(d.annual,15000),null);
  assert.equal(R.normalize({symbol:"AAPL",cik:320193,data:[makeYear(2024)]},
    {...profile,currency:"EUR"},"AAPL").annual.length,0);
});

test("statement integrity rejects unverified accessions, non-USD unit and mismatched tickers",()=>{
  const bad=makeYear(2024,{accessNumber:"../../../secret"});
  assert.equal(R.normalize({symbol:"AAPL",cik:320193,data:[bad]},profile,"AAPL").annual.length,0);
  const b=makeYear(2024);b.report.ic[0].unit="EUR";
  assert.equal(R.normalize({symbol:"AAPL",cik:320193,data:[b]},profile,"AAPL").annual.length,0);
  assert.throws(()=>R.normalize({symbol:"NVDA",cik:320193,data:[makeYear(2024)]},profile,"AAPL"),/mismatch/);
});

test("health model exposes real negative free cash flow and only known ratios",()=>{
  const d=normalized(),r=R.health(d.annual);
  assert.equal(r.latest.fcf,19000);
  assert.equal(r.latest.coverage,(20000+7*1500)/2000);
  assert.equal(r.latest.netDebt,85000);
  assert.equal(r.latest.leverage,85000/(30500+2200));
  const negative={...d.annual.at(-1),cfo_musd:1500,capex_musd:5000};
  assert.equal(R.health([negative]).latest.fcf,-3500);
});

test("rate shocks and exposed debt drive disclosed-interest coverage without claiming causality",()=>{
  const d=normalized(),macro={observed10y:4,projected10y:4.5};
  const baseline=R.stress(d.annual,macro);
  assert.equal(baseline.extraInterest,200);
  const high=R.stress(d.annual,macro,{shockBps:200,spreadBps:300,exposedPercent:40});
  assert.ok(high.extraInterest>baseline.extraInterest);
  assert.ok(high.coverage<baseline.coverage);
  const none=R.stress(d.annual,macro,{exposedPercent:0});
  assert.equal(none.extraInterest,0);
  assert.equal(none.coverage,none.baseCoverage);
});

test("stress requires disclosed debt and interest, but not a separate cash balance",()=>{
  const d=normalized(),latest={...d.annual.at(-1),cash_musd:null};
  const r=R.stress([latest],{observed10y:4,projected10y:5});
  assert.ok(r&&r.extraInterest>0);
  assert.equal(R.health([latest]).latest.netDebt,null);
});

test("value sensitivity uses normalized cash flows, interest, debt and millions of shares",()=>{
  const d=normalized();
  const base=R.valuation(d.annual,d.shares_million,{growth:5,discount:10,terminal:2,tax:21});
  assert.ok(base.perShare>0);
  assert.equal(base.fcff,19000+2000*.79);
  assert.equal(base.netDebt,85000);
  const higherDiscount=R.valuation(d.annual,d.shares_million,{growth:5,discount:12,terminal:2,tax:21});
  assert.ok(higherDiscount.perShare<base.perShare);
  const higherGrowth=R.valuation(d.annual,d.shares_million,{growth:7,discount:10,terminal:2,tax:21});
  assert.ok(higherGrowth.perShare>base.perShare);
  assert.equal(R.valuation([{...d.annual.at(-1),cfo_musd:-100000}],d.shares_million),null);
});

test("macro source requires real dated model baseline and twelve-month forecast",()=>{
  const result=R.macroSnapshot({status:"ready",source:"FRED",retrieved_utc:"2026-10-01",
    forecast:[{month:0,date:"2026-09-01",y10:4},{month:12,date:"2027-09-01",y10:4.3}]});
  assert.equal(result.projected10y,4.3);
  assert.equal(R.macroSnapshot({status:"ready",forecast:[]}),null);
});
