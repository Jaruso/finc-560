const test=require("node:test");
const assert=require("node:assert/strict");
const C=require("../docs/week-06/commodities/comparison.js");
const M=require("../docs/week-06/commodities/model.js");
function commodity(id,unit,base,shift=0){
  const observations=Array.from({length:260-shift},(_,i)=>({
    date:new Date(Date.UTC(2004,i+shift,1)).toISOString().slice(0,10),
    value:base*(1+i*.0015+Math.sin(i/9)*.025)
  }));
  return {id,label:id,unit,category:"Energy",
    observations,last_observation:observations.at(-1).date};
}
const choices=[
  commodity("wti","USD/barrel",90),
  commodity("gold","USD/troy oz",2900),
  commodity("copper","USD/metric ton",8500),
  commodity("gas","USD/MMBtu",3.8,2),
  commodity("extra","USD/kg",4.5)
];
const opt={model:"mean",horizon:6,shock:0,halfLife:6,vol:1};
test("two to four distinct verified commodities; no arbitrary fifth asset",()=>{
  assert.throws(()=>C.prepare([],60,opt),/two to four/);
  assert.throws(()=>C.prepare([choices[0]],60,opt),/two to four/);
  assert.throws(()=>C.prepare([...choices],60,opt),/two to four/);
  assert.throws(()=>C.prepare([choices[0],choices[0]],60,opt),/distinct/);
});
test("four disparate units normalize to their own index 100 and preserve underlying prices",()=>{
  const frames=C.prepare(choices.slice(0,4),60,opt);
  assert.equal(frames.length,4);
  assert.deepEqual(frames.map(f=>f.unit),
    ["USD/barrel","USD/troy oz","USD/metric ton","USD/MMBtu"]);
  assert.ok(frames.every(f=>f.toIndex(f.history[0].value)===100));
  const plotted=C.prices(frames,opt);
  assert.equal(plotted.traces.filter(t=>t.showlegend!==false).length,4);
  assert.equal(plotted.traces.length,16, // 4 observed, 4*(lower+upper+forecast)
    "Each selected asset has an observed path, own bounds and forecast");
  for(let i=0;i<4;i++){
    const observed=plotted.traces[i];
    assert.equal(observed.name,choices[i].label);
    assert.equal(observed.y[0],100);
    assert.equal(observed.customdata[0],frames[i].history[0].value);
    assert.equal(observed.meta.unit,choices[i].unit);
    assert.equal(observed.line.color,C.COLORS[i]);
    assert.ok(plotted.traces.some(t=>t.meta.commodity===choices[i].id&&
      t.meta.kind==="dash"),"A dashed model path exists for "+choices[i].id);
  }
  assert.equal(plotted.shapes.filter(s=>s.type==="rect").length,1);
  assert.ok(plotted.rangeX[0]<plotted.rangeX[1]);
});
test("all eight analytical chart choices overlay every selected benchmark",()=>{
  const frames=C.prepare(choices.slice(0,4),60,{...opt,shock:15});
  for(const id of ["commodity-chart","commodity-yoy","commodity-returns",
    "commodity-vol","commodity-seasonality","commodity-models",
    "commodity-shock","commodity-drawdown"]){
    const result=C.study(frames,id,{...opt,shock:15});
    const ids=new Set(result.traces.map(t=>t.meta.commodity));
    assert.deepEqual([...ids].sort(),choices.slice(0,4).map(c=>c.id).sort(),
      "Missing data series on "+id);
    assert.equal(result.traces.length,id==="commodity-models"?12:
      id==="commodity-chart"?20:4,id);
  }
  const season=C.study(frames,"commodity-seasonality",{...opt,shock:15});
  assert.ok(season.traces.every(t=>t.y.some(Number.isFinite)));
  const impact=C.study(frames,"commodity-shock",{...opt,shock:15});
  assert.ok(impact.index&&impact.traces.every(t=>t.y[0]===0));
});
test("shock does not change actual history, anchor or locked default axis",()=>{
  const baseline=C.prepare(choices.slice(0,4),60,opt);
  const shocked=C.prepare(choices.slice(0,4),60,{...opt,shock:25,horizon:12});
  const locked=C.commonRange(baseline);
  assert.deepEqual(C.commonRange(shocked),locked);
  for(let i=0;i<4;i++){
    assert.deepEqual(shocked[i].history,baseline[i].history);
    assert.equal(shocked[i].anchor,baseline[i].anchor);
    assert.equal(shocked[i].color,baseline[i].color);
    assert.ok(shocked[i].forecast.scenario.at(-1).price>
      M.forecast(choices[i],{...opt,horizon:12}).scenario.at(-1).price);
  }
  const extra=C.projectedRange(shocked,{...opt,shock:25});
  assert.ok(extra[1]>=Math.max(...shocked.map(f=>
    f.toIndex(f.forecast.scenario.at(-1).price))));
});
