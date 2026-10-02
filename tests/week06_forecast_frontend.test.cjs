const test=require("node:test");
const assert=require("node:assert/strict");
const M=require("../docs/week-06/rates/forecast_model.js");
const {makeFixture}=require("./week06_forecast_fixture.cjs");

test("rejects stale scenario-only v1 snapshots and invalid origins",()=>{
  const d=makeFixture();
  assert.throws(()=>M.verify({...d,schema_version:1}),/calibrated/);
  assert.throws(()=>M.verify({...d,forecast:[{date:"2099-01-01"}]}),/calibrated/);
  assert.throws(()=>M.verify({...d,forecast:d.forecast.map((f,i)=>i===0?{...f,y5:f.y5+.1}:f)}),
    /origin/);
});
test("calibrated baseline comes from fitted forecast rows, not user multipliers",()=>{
  const d=makeFixture(),p=M.forecast(d,0,12);
  assert.equal(p.length,13);
  assert.equal(p[0].y5,d.observations.at(-1).dgs5);
  assert.equal(p.at(-1).y5,d.forecast[12].y5);
  assert.notEqual(p.at(-1).y5,p[0].y5);
  assert.ok(p[12].high5>p[12].low5);
});
test("a 50-bp rate deviation shifts both maturities by the data-calibrated association",()=>{
  const d=makeFixture(),base=M.forecast(d,0,24),scenario=M.forecast(d,50,24);
  assert.equal(scenario[0].y5,base[0].y5);
  assert.ok(Math.abs(scenario[1].y5-base[1].y5-d.forecast[1].effect5_per_1pp*.5)<1e-9);
  assert.ok(Math.abs(scenario[1].y10-base[1].y10-d.forecast[1].effect10_per_1pp*.5)<1e-9);
  assert.ok(Math.abs(scenario[12].spread-(scenario[12].y10-scenario[12].y5))<1e-9);
  assert.notEqual(scenario[12].spread,base[12].spread);
});
test("spread bounds use independently backtested JOINT spread errors",()=>{
  const d=makeFixture(),p=M.forecast(d,0,6);
  const spreadCalibration=d.empirical_error_bands.spread[5];
  assert.equal(p[6].lowSpread,p[6].spread+spreadCalibration.error_p10_pp);
  assert.equal(p[6].highSpread,p[6].spread+spreadCalibration.error_p90_pp);
  assert.notEqual(p[6].lowSpread,p[6].low10-p[6].high5);
});
test("controls reject unsupported horizons and show true selected observed history",()=>{
  const d=makeFixture();
  assert.throws(()=>M.forecast(d,0,120),/Unsupported/);
  assert.throws(()=>M.forecast(d,200,6),/Unsupported/);
  assert.equal(M.history(d,"120").length,120);
  assert.equal(M.history(d,"all").length,190);
});
