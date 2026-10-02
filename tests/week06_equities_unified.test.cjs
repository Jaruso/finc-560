const test=require("node:test");
const assert=require("node:assert/strict");
const M=require("../docs/week-06/companies/model.js");
const C=require("../docs/week-06/companies/compare.js");

const names=["MSFT","AAPL","GOOG","NVDA"];
const year=i=>String(2019+i)+"-06-30";
function company(ticker,mult=1,loss=false){
  return {schema_version:1,status:"ready",ticker,company:ticker+" Test",
    annual:Array.from({length:7},(_,i)=>({
      fiscal_end:year(i),
      revenue_musd:240000*mult*Math.pow(1.12,i),
      operating_income_musd:loss?-1200:96000*mult*Math.pow(1.13,i),
      net_income_musd:loss?-500:62000*mult*Math.pow(1.11,i),
      filings:{revenue:{filed:year(i),accession:"0000-TEST"}}
    }))};
}
const base={method:"cagr",horizon:3,growth:0,margin:0,projectionsEnabled:true};
const companies=names.map((ticker,i)=>company(ticker,[1,.7,.8,.45][i]));
const frames=(options=base)=>C.prepare(companies,options,5);
const metricKeys=["revenue_musd","operating_income_musd","net_income_musd"];
test("comparison exposes separate financial measure charts",()=>{
  assert.deepEqual(C.available(frames()).slice(0,2),["company-chart","equity-margins"]);
  assert.ok(C.ABSOLUTE.includes("equity-revenue"));
  assert.ok(C.ABSOLUTE.includes("equity-operating"));
  assert.ok(C.ABSOLUTE.includes("equity-net"));
});
test("split comparison charts contain only their selected financial measure",()=>{
  for(const [id,metric,label] of [
    ["equity-revenue","revenue_musd","Revenue"],
    ["equity-operating","operating_income_musd","Operating income"],
    ["equity-net","net_income_musd","Net income"]
  ]){
    const chart=C.study(frames(),id,"net","indexed",base);
    assert.equal(chart.traces.length,8,
      id+" has one reported and one modeled trace per company");
    assert.ok(chart.traces.every(t=>t.name.includes(label)));
    assert.deepEqual(chart.layout.meta.measures,null);
    assert.equal(chart.layout.meta.tickerMarkers.MSFT,"circle");
  }
});
test("one combined chart contains all three metrics for four companies",()=>{
  const chart=C.study(frames(),"company-chart","net","indexed",base);
  assert.equal(chart.traces.length,24);
  assert.deepEqual(chart.layout.meta.measures,
    ["Revenue","Operating income","Net income"]);
  assert.deepEqual(chart.layout.meta.tickerMarkers,
    {MSFT:"circle",AAPL:"square",GOOG:"diamond",NVDA:"cross"});
  assert.equal(chart.traces.filter(t=>t.showlegend).length,3,
    "Only one legend entry per financial measure, not 24");
  assert.equal(chart.traces.filter(t=>t.line.dash==="dash").length,12);
  for(let c=0;c<4;c++){
    const group=chart.traces.slice(c*6,c*6+6);
    const actual=group.filter(t=>t.line.dash==="solid");
    const future=group.filter(t=>t.line.dash==="dash");
    assert.deepEqual(actual.map(t=>t.y[0]),[100,100,100]);
    assert.deepEqual(actual.map(t=>t.line.color),
      ["#0b7f73","#365977","#aa7840"]);
    assert.ok(actual.every(t=>t.marker.symbol===["circle","square","diamond","cross"][c]));
    for(let i=0;i<3;i++){
      assert.equal(actual[i].x.at(-1),future[i].x[0],
        "Forecast attaches at final reported fiscal year");
      assert.equal(actual[i].y.at(-1),future[i].y[0]);
    }
  }
  assert.equal(chart.layout.meta.projectionWindows.length,4);
  assert.match(chart.context,/Color = measure; marker = ticker/);
});
test("margin-only changes never move revenue while adjusting both projected earnings",()=>{
  const adjusted={...base,margin:4};
  const compared=C.study(frames(adjusted),"company-chart","net","nominal",adjusted);
  assert.equal(compared.traces.length,32,
    "No redundant revenue baseline for margin-only adjustment");
  for(const f of frames(adjusted)){
    const projected=f.forecast.projected.at(-1);
    const unadjusted=f.forecast.baseline.at(-1);
    assert.equal(projected.revenue_musd,unadjusted.revenue_musd);
    assert.notEqual(projected.operating_income_musd,unadjusted.operating_income_musd);
    assert.notEqual(projected.net_income_musd,unadjusted.net_income_musd);
  }
  const revenue=compared.traces.filter(t=>t.name.includes("Revenue"));
  assert.ok(revenue.every(t=>!t.name.includes("unadjusted")));
  const withGrowth={...base,growth:8,margin:4};
  const changed=C.study(frames(withGrowth),"company-chart","net","nominal",withGrowth);
  assert.equal(changed.traces.length,36);
  assert.equal(changed.traces.filter(t=>t.line.dash==="dot").length,12);
});
test("reported-only comparisons never include projections or forecast shading",()=>{
  const options={...base,projectionsEnabled:false};
  const chart=C.study(frames(options),"company-chart","net","indexed",options);
  assert.equal(chart.traces.length,12);
  assert.ok(chart.traces.every(t=>t.line.dash==="solid"));
  assert.deepEqual(chart.layout.shapes,[]);
  assert.equal(chart.layout.meta.projectionsEnabled,false);
});
test("nominal fallback works for disclosed negative earnings",()=>{
  const withLoss=[company("MSFT"),company("LOSS",.5,true)];
  const f=C.prepare(withLoss,base,5);
  assert.throws(()=>C.study(f,"company-chart","net","indexed",base),
    /Indexed view requires/);
  const chart=C.study(f,"company-chart","net","nominal",base);
  assert.equal(chart.traces.length,12);
  assert.equal(chart.layout.meta.indexed,false);
  assert.ok(chart.traces.some(t=>t.y.some(v=>v<0)));
});
