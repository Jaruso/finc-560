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
test("one to four distinct verified commodities; no arbitrary fifth asset",()=>{
  assert.throws(()=>C.prepare([],60,opt),/one to four/);
  assert.equal(C.prepare([choices[0]],60,opt).length,1);
  assert.throws(()=>C.prepare([...choices],60,opt),/one to four/);
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

test("each of eight charts independently supports genuinely nominal and indexed data",()=>{
  const frames=C.prepare(choices.slice(0,4),60,{...opt,shock:20});
  const priceIdx=C.prices(frames,{...opt,shock:20},"indexed");
  const priceRaw=C.prices(frames,{...opt,shock:20},"nominal");
  for(let i=0;i<4;i++){
    assert.equal(priceIdx.traces[i].y[0],100);
    assert.equal(priceRaw.traces[i].y[0],frames[i].anchor);
    assert.equal(priceRaw.traces[i].meta.unit,frames[i].unit);
    assert.match(priceRaw.traces[i].hovertemplate,/USD/);
  }
  for(const id of ["commodity-yoy","commodity-returns","commodity-vol",
    "commodity-seasonality","commodity-models","commodity-shock",
    "commodity-drawdown"]){
    const index=C.study(frames,id,{...opt,shock:20},"indexed");
    const nominal=C.study(frames,id,{...opt,shock:20},"nominal");
    assert.equal(nominal.traces.length,index.traces.length,id);
    assert.ok(nominal.traces.every(trace=>trace.meta.unit&&
      trace.hovertemplate.includes(trace.meta.unit)),id+" lost original unit");
    assert.equal(new Set(nominal.traces.map(t=>t.meta.commodity)).size,4,id);
    assert.ok(nominal.traces.some((t,j)=>t.y.some((v,k)=>
      Number.isFinite(v)&&Number.isFinite(index.traces[j].y[k])&&
        Math.abs(v-index.traces[j].y[k])>1e-6)),id+" has no nominal difference");
  }
});
test("multiple nominal unit groups receive independent labeled axes",()=>{
  const frames=C.prepare(choices.slice(0,4),60,opt);
  const traces=C.prices(frames,opt,"nominal").traces;
  const ranges=C.nominalPriceRanges(frames);
  const plan=C.nominalAxes(traces,frames,{ranges,positiveOnly:true});
  assert.deepEqual(plan.units,
    ["USD/barrel","USD/troy oz","USD/metric ton","USD/MMBtu"]);
  assert.deepEqual(plan.xDomain,[0,1],
    "Separate nominal units keep the full horizontal data domain");
  for(let i=0;i<4;i++){
    const key=i?"yaxis"+(i+1):"yaxis";
    assert.equal(plan.axes[key].title.text,choices[i].unit);
    assert.deepEqual(plan.axes[key].range,ranges[choices[i].unit]);
    assert.equal(traces[i].yaxis,i?"y"+(i+1):"y");
  }
  const shocked=C.prepare(choices.slice(0,4),60,{...opt,shock:25});
  assert.deepEqual(C.nominalPriceRanges(frames),C.nominalPriceRanges(shocked),
    "Nominal default ranges must exclude hypothetical shock values");
});
test("same-unit commodities share one nominal axis without false index rebasing",()=>{
  const frames=C.prepare([choices[0],commodity("oil2","USD/barrel",250)],60,opt);
  const traces=C.prices(frames,opt,"nominal").traces;
  const plan=C.nominalAxes(traces,frames,{ranges:C.nominalPriceRanges(frames)});
  assert.deepEqual(plan.units,["USD/barrel"]);
  assert.equal(plan.xDomain,null);
  assert.equal(traces[0].yaxis,"y");
  assert.equal(traces[1].yaxis,"y");
  assert.equal(traces[0].y[0],frames[0].anchor);
  assert.equal(traces[1].y[0],frames[1].anchor);
});
