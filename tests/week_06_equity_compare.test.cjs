const test=require("node:test");
const assert=require("node:assert/strict");
const C=require("../docs/week-06/companies/compare.js");
const M=require("../docs/week-06/companies/model.js");
const microsoft=require("../docs/week-06/companies/data/MSFT.json");
const apple=require("../docs/week-06/companies/data/AAPL.json");
const homeDepot=require("../docs/week-06/companies/data/HD.json");
const options={method:"cagr",horizon:3,growth:0,margin:0};
const frames=()=>C.prepare([microsoft,apple],options,5);

test("two companies keep selection order and distinct underlying filings",()=>{
  const series=frames();
  assert.deepEqual(series.map(f=>f.ticker),["MSFT","AAPL"]);
  assert.equal(series[0].company,microsoft);
  assert.equal(series[1].company,apple);
  assert.notEqual(series[0].color,series[1].color);
  assert.deepEqual(C.available(series).slice(0,4),[
    "company-chart","equity-revenue","equity-operating","equity-margins"
  ]);
});

test("indexed comparison normalizes each company independently without changing raw fiscal dates",()=>{
  const series=frames();
  const chart=C.study(series,"equity-revenue","net","indexed",options);
  assert.equal(chart.traces.length,4);
  for(const [index,ticker] of ["MSFT","AAPL"].entries()){
    const observed=chart.traces[index*2];
    const projected=chart.traces[index*2+1];
    assert.match(observed.name,new RegExp(ticker));
    const anchor=observed.x.findIndex(date=>
      date.slice(0,4)===chart.layout.meta.anchorFiscalYear);
    assert.ok(anchor>=0,"Each company has a point in the common anchor year");
    assert.equal(observed.y[anchor],100);
    assert.deepEqual(observed.x,series[index].history.map(r=>r.fiscal_end));
    assert.equal(projected.x[0],series[index].forecast.projected[0].fiscal_end);
    assert.equal(chart.layout.meta.tickers[index],ticker);
  }
  assert.equal(chart.layout.meta.primary,"MSFT");
});

test("nominal view retains separately reported USD amounts and per-company forecast boundaries",()=>{
  const series=frames();
  const chart=C.study(series,"company-chart","net","nominal",options);
  assert.equal(chart.layout.meta.indexed,false);
  assert.equal(chart.traces[0].y.at(-1),microsoft.annual.at(-1).net_income_musd/1000);
  assert.equal(chart.traces[1].y[0],microsoft.annual.at(-1).net_income_musd/1000);
  assert.equal(chart.traces[2].y.at(-1),apple.annual.at(-1).net_income_musd/1000);
  assert.ok(chart.traces[1].x.at(-1)>chart.traces[1].x[0]);
});

test("optional financial charts require each selected company to disclose underlying values",()=>{
  const incomplete=structuredClone(homeDepot);
  incomplete.annual.forEach(r=>{
    delete r.cfo_musd;
    delete r.capex_musd;
    delete r.interest_musd;
    delete r.cash_musd;
    delete r.total_debt_musd;
  });
  const selected=C.prepare([microsoft,incomplete],options,5);
  assert.ok(!C.available(selected).includes("equity-fcf"));
  assert.ok(!C.available(selected).includes("equity-coverage"));
  assert.ok(!C.available(selected).includes("equity-balance"));
  assert.throws(()=>C.study(selected,"equity-fcf","net","nominal",options),
    /disclose sufficient data/);
});

test("duplicate or oversize selection is rejected before any chart calculation",()=>{
  assert.throws(()=>C.prepare([microsoft,microsoft],options,5),/different companies/);
  assert.throws(()=>C.prepare([microsoft,apple,homeDepot,microsoft,microsoft],
    options,5),/different companies/);
});

test("unindexable negative baselines are refused instead of presenting a misleading index",()=>{
  const edited=structuredClone(microsoft);
  edited.annual.at(-5).net_income_musd=-1;
  const selected=C.prepare([edited,apple],options,5);
  assert.throws(()=>C.study(selected,"company-chart","net","indexed",options),
    /positive starting values/);
  assert.ok(C.study(selected,"company-chart","net","nominal",options).traces.length>=4);
});
