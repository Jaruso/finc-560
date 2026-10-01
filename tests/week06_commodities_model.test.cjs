const test=require("node:test");
const assert=require("node:assert/strict");
const M=require("../docs/week-06/commodities/model.js");
function commodity(id="wti",n=120){
  const observations=Array.from({length:n},(_,i)=>({
    date:new Date(Date.UTC(2016,i,1)).toISOString().slice(0,10),
    value:55+i*.22+3*Math.sin(i/7)
  }));
  return {id,label:id,unit:"USD/barrel",
    source_url:"https://fred.stlouisfed.org/series/DCOILWTICO",
    last_observation:observations.at(-1).date,observations};
}
test("rejects missing, fabricated or unordered public commodity datasets",()=>{
  const snap={schema_version:1,status:"ready",
    commodities:["wti","brent","gas"].map(x=>commodity(x))};
  assert.equal(M.verify(snap),snap);
  assert.throws(()=>M.verify({...snap,status:"pending"}),/not available/);
  assert.throws(()=>M.verify({...snap,commodities:snap.commodities.slice(0,2)}),/not available/);
  const altered=structuredClone(snap);
  altered.commodities[0].observations[3].value=NaN;
  assert.throws(()=>M.verify(altered),/invalid commodity/i);
});
test("all three methods anchor to observed history and remain distinct",()=>{
  const c=commodity();
  const mean=M.forecast(c,{model:"mean",horizon:12});
  const trend=M.forecast(c,{model:"trend",horizon:12});
  const unchanged=M.forecast(c,{model:"unchanged",horizon:12});
  assert.equal(mean.scenario.length,13);
  for(const f of [mean,trend,unchanged]){
    assert.equal(f.scenario[0].date,c.last_observation);
    assert.equal(f.scenario[0].price,c.observations.at(-1).value);
    assert.equal(f.scenario.at(-1).date,M.shiftMonth(c.last_observation,12));
  }
  assert.notEqual(trend.scenario.at(-1).price,unchanged.scenario.at(-1).price);
  assert.notEqual(mean.scenario.at(-1).price,trend.scenario.at(-1).price);
  assert.equal(unchanged.scenario.at(-1).price,c.observations.at(-1).value);
});
test("shock, half life and realized volatility have independent effects",()=>{
  const c=commodity(),base=M.forecast(c,{model:"mean",horizon:6,shock:0});
  const up=M.forecast(c,{model:"mean",horizon:6,shock:20,halfLife:3});
  const long=M.forecast(c,{model:"mean",horizon:6,shock:20,halfLife:12});
  const bound=M.forecast(c,{model:"mean",horizon:6,vol:2});
  assert.equal(up.baseline.at(-1).price,base.scenario.at(-1).price);
  assert.equal(up.scenario[0].price,base.scenario[0].price);
  assert.ok(up.scenario.at(-1).price>base.scenario.at(-1).price);
  assert.ok(long.scenario.at(-1).price>up.scenario.at(-1).price);
  assert.ok(bound.high.at(-1).price>bound.scenario.at(-1).price);
  assert.ok(bound.low.at(-1).price<bound.scenario.at(-1).price);
  assert.throws(()=>M.forecast(c,{horizon:48}),/Unsupported/);
});
test("half-life is inert at zero shock and changes every nonzero endpoint",()=>{
  const c=commodity();
  const neutral=[3,6,12].map(halfLife=>
    M.forecast(c,{model:"mean",horizon:6,shock:0,halfLife}));
  assert.deepEqual(neutral[0].scenario,neutral[1].scenario);
  assert.deepEqual(neutral[1].scenario,neutral[2].scenario);
  const scenarios=[3,6,12].map(halfLife=>
    M.forecast(c,{model:"mean",horizon:6,shock:20,halfLife,vol:0}));
  const expected=halfLife=>.20*Math.pow(.5,5/halfLife);
  for(let i=0;i<scenarios.length;i++){
    const row=scenarios[i].scenario.at(-1).price;
    const baseline=scenarios[i].baseline.at(-1).price;
    assert.ok(Math.abs(row/baseline-1-expected([3,6,12][i]))<1e-10);
    assert.equal(scenarios[i].scenario[1].price,scenarios[0].scenario[1].price,
      "The first forecast month has the same immediate shock");
  }
  assert.ok(scenarios[0].scenario.at(-1).price<
    scenarios[1].scenario.at(-1).price);
  assert.ok(scenarios[1].scenario.at(-1).price<
    scenarios[2].scenario.at(-1).price);
});
test("history controls return exact observed months",()=>{
  const c=commodity();
  assert.deepEqual(M.history(c,24),c.observations.slice(-24));
  assert.deepEqual(M.history(c,"all"),c.observations);
  assert.throws(()=>M.history(c,1),/Invalid/);
});

test("expanded categorized commodity catalog enforces trusted origins and unique IDs",()=>{
  const c=commodity();
  const snap={schema_version:2,status:"ready",retrieved_utc:"2026-10-01T10:00:00Z",
    commodities:Array.from({length:33},(_,i)=>({
      ...structuredClone(c),id:"wb-sample-"+i,
      category:i%2?"Precious metals":"Grains",
      source:"World Bank Pink Sheet",
      source_url:"https://thedocs.worldbank.org/en/doc/official/related/CMO-Historical-Data-Monthly.xlsx"
    }))};
  assert.equal(M.verify(snap),snap);
  assert.throws(()=>M.verify({...snap,commodities:snap.commodities.slice(0,32)}),/incomplete/);
  const spoofed=structuredClone(snap);
  spoofed.commodities[0].source_url="https://unverified.example/data.csv";
  assert.throws(()=>M.verify(spoofed),/Invalid commodity history/);
  const duplicated=structuredClone(snap);
  duplicated.commodities[1].id=duplicated.commodities[0].id;
  assert.throws(()=>M.verify(duplicated),/Invalid commodity history/);
});
