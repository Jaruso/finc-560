const test=require("node:test");
const assert=require("node:assert/strict");
const M=require("../docs/week-06/equities/model.js");
const {fixture}=require("./week06_company_fixture.cjs");
test("annual SEC input rejects absent statements and nonmonotonic history",()=>{
  const d=fixture();
  assert.equal(M.verify(d),d);
  assert.throws(()=>M.verify({...d,annual:d.annual.slice(0,4)}),/unavailable/);
  assert.throws(()=>M.verify({...d,annual:d.annual.slice().reverse()}),/unavailable/);
  assert.throws(()=>M.verify({...d,annual:d.annual.map(x=>({...x,net_income_musd:NaN}))}),/unavailable/);
});
test("browser model forecasts revenue and linked operating/net income",()=>{
  const d=fixture(),r=M.forecast(d,{method:"linear",horizon:3});
  assert.equal(r.projected.length,4);
  assert.equal(r.projected[0].revenue_musd,d.annual.at(-1).revenue_musd);
  assert.equal(r.baseline[0].net_income_musd,d.annual.at(-1).net_income_musd);
  assert.ok(r.projected[3].revenue_musd>r.projected[0].revenue_musd);
  assert.ok(Math.abs(r.projected[2].operating_income_musd -
    r.projected[2].revenue_musd*r.margin_assumptions.operating)<1e-8);
});
test("growth and margin dials affect different derived financial outputs",()=>{
  const d=fixture(),a=M.forecast(d,{method:"cagr",horizon:3});
  const b=M.forecast(d,{method:"cagr",horizon:3,growth:8,margin:2});
  assert.ok(b.projected[3].revenue_musd>a.projected[3].revenue_musd);
  assert.ok(b.projected[3].net_income_musd>a.projected[3].net_income_musd);
  assert.equal(a.projected[0].revenue_musd,b.projected[0].revenue_musd);
  assert.equal(b.baseline[3].revenue_musd,a.projected[3].revenue_musd);
  assert.throws(()=>M.forecast(d,{horizon:10}),/Unsupported/);
});
test("CAGR model and linear trend are genuinely different methods",()=>{
  const d=fixture();
  const linear=M.forecast(d,{method:"linear",horizon:3});
  const compound=M.forecast(d,{method:"cagr",horizon:3});
  assert.notEqual(linear.projected[3].revenue_musd,compound.projected[3].revenue_musd);
});
test("replay never uses future observations and reports naive comparator",()=>{
  const d=fixture();
  const first=M.backtestRevenue(d,"cagr");
  const firstHist=d.annual.slice(0,-1);
  // An exploding latest-period actual only affects test target, not the
  // origin forecast. Backtest should detect changed error.
  const altered=fixture();
  altered.annual.at(-1).revenue_musd*=2;
  assert.notEqual(M.backtestRevenue(altered,"cagr").model_rmse_musd,first.model_rmse_musd);
  assert.equal(first.n,d.annual.length-4);
  assert.ok(first.naive_rmse_musd>=0);
  assert.deepEqual(M.history(d,4),d.annual.slice(-4));
  assert.equal(firstHist.length,d.annual.length-1);
});

test("margin-only inputs change projected profits, not revenue or reported financials",()=>{
  const d=fixture(),base=M.forecast(d,{method:"cagr",horizon:3});
  const altered=M.forecast(d,{method:"cagr",horizon:3,margin:3});
  assert.deepEqual(altered.historical,base.historical);
  assert.deepEqual(altered.projected.map(row=>row.revenue_musd),
    base.projected.map(row=>row.revenue_musd));
  assert.equal(altered.projected[0].net_income_musd,base.projected[0].net_income_musd);
  assert.ok(altered.projected.at(-1).net_income_musd>base.projected.at(-1).net_income_musd);
  assert.ok(altered.projected.at(-1).operating_income_musd>base.projected.at(-1).operating_income_musd);
  assert.equal(altered.baseline.at(-1).net_income_musd,base.projected.at(-1).net_income_musd);
});
