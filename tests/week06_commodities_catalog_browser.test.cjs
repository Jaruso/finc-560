/* Multi-source catalog regression: deterministic test-only input, never shipped. */
const assert=require("node:assert/strict");
const {spawn}=require("node:child_process");
const {chromium}=require("playwright");
const base="http://127.0.0.1:8790";

function asset(id,label,category,unit,source,sourceUrl,starting=30){
  const observations=Array.from({length:180},(_,i)=>({
    date:new Date(Date.UTC(2011,i,1)).toISOString().slice(0,10),
    value:starting+i*.17+1.5*Math.sin(i/10)
  }));
  return {id,label,category,unit,source,source_id:id.toUpperCase(),
    source_url:sourceUrl,
    last_observation:observations.at(-1).date,observations};
}
const FRED="https://fred.stlouisfed.org/series/";
const WB="https://thedocs.worldbank.org/en/doc/release/related/CMO-Historical-Data-Monthly.xlsx";
function dataset(){
  const commodities=[
    asset("wti","WTI crude oil","Energy","USD/barrel","EIA via FRED",FRED+"DCOILWTICO",60),
    asset("brent","Brent crude oil","Energy","USD/barrel","EIA via FRED",FRED+"DCOILBRENTEU",63),
    asset("gas","Natural gas","Energy","USD/MMBtu","EIA via FRED",FRED+"DHHNGSP",3),
    asset("uranium","Uranium","Critical minerals","USD/lb","IMF via FRED",FRED+"PURANUSDM",67),
    asset("wb-gold","Gold","Precious metals","USD/troy oz","World Bank Pink Sheet",WB,2600),
    asset("wb-silver","Silver","Precious metals","USD/troy oz","World Bank Pink Sheet",WB,37),
    asset("wb-copper","Copper","Industrial metals","USD/metric ton","World Bank Pink Sheet",WB,7000),
    asset("wb-plywood","Plywood","Forest products","cents/sheet","World Bank Pink Sheet",WB,220),
    asset("wb-logs-malaysian","Logs, Malaysian","Forest products","USD/m³","World Bank Pink Sheet",WB,180),
    asset("wb-wheat","Wheat","Grains","USD/metric ton","World Bank Pink Sheet",WB,200),
    asset("wb-rice","Rice","Grains","USD/metric ton","World Bank Pink Sheet",WB,360),
    asset("wb-cocoa","Cocoa","Soft commodities","USD/metric ton","World Bank Pink Sheet",WB,3500),
    asset("wb-tea","Tea","Soft commodities","USD/kg","World Bank Pink Sheet",WB,3),
  ];
  for(let i=0;i<22;i++)commodities.push(
    asset("wb-test-"+i,"Test verified market "+i,"Grains",
      "USD/metric ton","World Bank Pink Sheet",WB,200+i)
  );
  return {schema_version:2,status:"ready",
    retrieved_utc:"2026-10-01T10:00:00Z",commodities,
    unavailable:[
      {name:"Lithium",reason:"Specialized spot benchmark",category:"Critical minerals"},
      {name:"Gallium",reason:"Specialized spot benchmark",category:"Critical minerals"},
      {name:"Milk",reason:"Needs a separate dairy benchmark",category:"Livestock & food"}
    ]};
}
async function ready(){
  for(let i=0;i<60;i++){
    try{if((await fetch(base+"/week-06/commodities/")).ok)return;}catch{}
    await new Promise(done=>setTimeout(done,200));
  }
  throw Error("Commodity preview did not start");
}
async function openCommodityPicker(page){
  const picker=page.locator("#commodity-picker");
  if(await picker.getAttribute("open")===null)
    await picker.locator("summary").click();
  return picker;
}
async function focus(page,id){
  const picker=await openCommodityPicker(page);
  await page.locator("#commodity-clear").click();
  await picker.locator('input[value="'+id+'"]').check();
  await page.waitForFunction(id=>document.querySelector("#commodity-chart")
    ?.layout?.meta?.commodity===id,id);
}
async function choose(page,id){
  const picker=await openCommodityPicker(page);
  await picker.locator('input[value="'+id+'"]').check();
}
async function switchMode(page,id,mode){
  const group=page.locator('.chart-scale-toggle[data-chart-mode="'+id+'"]');
  await group.locator('button[data-mode="'+mode+'"]').click();
  await page.waitForFunction(({id,mode})=>
    document.getElementById(id)?.layout?.meta?.mode===mode,{id,mode});
  assert.equal(await group.locator('button[data-mode="'+mode+'"]')
    .getAttribute("aria-pressed"),"true");
}
(async()=>{
 const server=spawn("python3",["-m","http.server","8790","--bind","127.0.0.1",
   "--directory","docs"],{stdio:"ignore"});
 let browser;
 try{
   await ready();
   browser=await chromium.launch({headless:true});
   const page=await browser.newPage({viewport:{width:1440,height:900}});
   const errors=[];page.on("pageerror",e=>errors.push(e.message));
   await page.route("https://cdn.plot.ly/**",route=>route.fulfill({
     path:require.resolve("plotly.js-dist-min"),
     contentType:"application/javascript"}));
   await page.route("**/commodities/data.json",route=>route.fulfill({json:dataset()}));
   await page.goto(base+"/week-06/commodities/",{waitUntil:"domcontentloaded"});
   await page.waitForFunction(()=>document.querySelector("#commodity-chart")
     ?.layout?.meta?.commodity==="wti");
   const picker=page.locator("#commodity-picker");
   assert.equal(await page.locator("#comparison-picker").count(),0,
     "There must be exactly ONE commodity selection dropdown");
   assert.equal(await page.locator("#commodity-category").isDisabled(),false);
   assert.match(await page.locator("#commodity-count").textContent(),
     /35 verified benchmarks/);
   assert.equal(await page.locator("#commodity-summary").textContent(),"WTI crude oil");
   assert.equal(await page.locator("#commodity-selection-count").textContent(),"1 of 4");
   assert.equal(await page.locator(".chart-scale-toggle").count(),8);
   assert.equal(await page.locator("#catalog-gaps").isHidden(),false);
   assert.match(await page.locator("#catalog-gap-list").textContent(),/Gallium/);

   // A secondary scale switch must not turn a one-commodity dashboard into
   // the comparison dashboard. The target card changes units; its neighbors
   // retain their original chart type, description, and source treatment.
   await switchMode(page,"commodity-yoy","nominal");
   assert.equal(await page.locator("#commodity-chart").evaluate(g=>
     g.layout.meta.comparison),false);
   assert.match(await page.locator("#chart-subtitle").textContent(),/^Observed /,
     "Spot-price copy must remain the single-benchmark copy");
   assert.match(await page.locator("#commodity-yoy-context").textContent(),
     /YoY difference in original units/);
   assert.equal(await page.locator("#commodity-returns").evaluate(g=>
     g.layout.meta.mode),"indexed",
     "Changing YoY must not alter the monthly-return card");
   await switchMode(page,"commodity-yoy","indexed");
   assert.equal(await page.locator("#commodity-chart").evaluate(g=>
     g.layout.meta.comparison),false);
   assert.match(await page.locator("#commodity-yoy-context").textContent(),
     /^Latest observed YoY /);

   // Filtering must NEVER alter the selected primary automatically.
   await page.selectOption("#commodity-category","Precious metals");
   assert.equal(await page.locator("#commodity-summary").textContent(),"WTI crude oil");
   assert.equal(await page.locator("#commodity-chart").evaluate(g=>
     g.layout.meta.commodity),"wti");
   assert.equal(await page.locator("#commodity-options input").count(),3,
     "Primary stays visible alongside Gold and Silver despite category filter");
   await focus(page,"wb-gold");
   assert.equal(await page.locator("#commodity-summary").textContent(),"Gold");
   assert.equal(await page.locator("#kpi-unit").textContent(),"USD/troy oz");
   assert.match(await page.locator("#commodity-source").getAttribute("href"),
     /^https:\/\/thedocs.worldbank.org\//);

   await page.selectOption("#commodity-category","Critical minerals");
   assert.equal(await page.locator("#commodity-summary").textContent(),"Gold",
     "Filtering is not selecting a new primary");
   await focus(page,"uranium");
   assert.equal(await page.locator("#kpi-unit").textContent(),"USD/lb");
   assert.match(await page.locator("#commodity-source").textContent(),/IMF/);

   await page.selectOption("#commodity-category","Forest products");
   await focus(page,"wb-plywood");
   const paper=await page.locator("#commodity-chart").evaluate(g=>({
     prefix:g.layout.yaxis.tickprefix,suffix:g.layout.yaxis.ticksuffix,
     source:g.layout.meta.source
   }));
   assert.equal(paper.prefix,"");
   assert.equal(paper.suffix,"¢");
   assert.match(await page.locator("#preview-scenario").textContent(),/¢/);

   await page.selectOption("#commodity-category","all");
   await page.locator("#commodity-search").fill("tea");
   await focus(page,"wb-tea");
   assert.equal(await page.locator("#commodity-count").textContent(),
     "1 verified benchmark across 1 category");
   await page.locator("#commodity-search").fill("gallium");
   assert.match(await page.locator("#commodity-count").textContent(),
     /0 verified benchmarks/);
   assert.equal(await picker.locator('input:checked').count(),1,
     "Search must preserve even a now-filtered selection");
   assert.equal(await page.locator("#commodity-chart").evaluate(g=>
     g.layout.meta.commodity),"wb-tea",
     "No matching filters must never change an existing selection");
   assert.equal(await page.locator("#data-error").isVisible(),false);

   // Adding in one dropdown determines primary/comparison order. No separate
   // selector or reordering while using categories or search.
   await page.locator("#commodity-search").fill("");
   await focus(page,"wti");
   await choose(page,"brent");
   await page.selectOption("#commodity-category","Precious metals");
   await choose(page,"wb-gold");
   await page.selectOption("#commodity-category","Industrial metals");
   await choose(page,"wb-copper");
   await page.waitForFunction(()=>document.querySelector("#commodity-chart")
     ?.layout?.meta?.commodities?.length===4);
   await page.waitForFunction(()=>["commodity-yoy","commodity-returns","commodity-vol"]
     .every(id=>document.getElementById(id)?.data?.length===
       (id==="commodity-yoy"?8:4)));
   const initialYoy=await page.locator("#commodity-yoy").evaluate(g=>({
     observed:g.data.filter(t=>t.meta.kind==="solid").map(t=>t.y.slice()),
     forecast:g.data.filter(t=>t.meta.kind==="dash").map(t=>t.y.at(-1)),
     lineStyles:g.data.map(t=>t.meta.kind)
   }));
   assert.equal(initialYoy.observed.length,4);
   assert.equal(initialYoy.forecast.length,4);
   assert.equal(initialYoy.lineStyles.filter(k=>k==="dash").length,4);
   assert.equal(await page.locator("#commodity-selection-count").textContent(),"4 of 4");
   assert.match(await page.locator("#commodity-summary").textContent(),
     /^WTI crude oil \+ 3 comparisons$/);
   assert.equal(await picker.locator('input[value="wb-copper"]').isChecked(),true);
   await page.selectOption("#commodity-category","all");
   assert.equal(await picker.locator('input[value="wb-silver"]').isDisabled(),true,
     "No fifth commodity is selectable");
   const order=await page.locator("#commodity-options .commodity-multi-group").first()
     .locator("input").evaluateAll(inputs=>inputs.map(input=>input.value));
   assert.deepEqual(order,["wti","brent","wb-gold","wb-copper"]);

   const initial=await page.locator("#commodity-chart").evaluate(g=>({
     names:g.data.filter(t=>t.showlegend!==false).map(t=>t.name),
     ids:g.layout.meta.commodities.slice(),unit:g.layout.meta.unit,mode:g.layout.meta.mode,
     observed:g.data.slice(0,4).map(t=>t.y[0]),
     originals:g.data.slice(0,4).map(t=>t.customdata[0]),
     units:g.data.slice(0,4).map(t=>t.meta.unit),
     colors:g.data.slice(0,4).map(t=>t.line.color),
     historical:g.data[0].y.slice(),range:g.layout.yaxis.range.slice(),
     pixel:g._fullLayout.yaxis.l2p(g.data[0].y.at(-1))
   }));
   assert.deepEqual(initial.ids,["wti","brent","wb-gold","wb-copper"]);
   assert.equal(initial.mode,"indexed");
   assert.deepEqual(initial.observed,[100,100,100,100]);
   assert.deepEqual(initial.units,["USD/barrel","USD/barrel","USD/troy oz",
     "USD/metric ton"]);
   assert.equal(new Set(initial.colors).size,4);
   assert.ok(Math.max(...initial.originals)>2000);
   assert.equal(await page.locator(".comparison-preview-heading").textContent(),
     "Projected outcomes");
   assert.equal(await page.locator(".comparison-preview-row").count(),4);
   assert.equal(await page.locator(".commodity-preview>div").first().isHidden(),true,
     "The redundant primary-only KPI row stays hidden during comparisons");
   assert.equal(await page.locator(".comparison-sources-label").textContent(),"Sources");
   assert.equal(await page.locator("#comparison-sources a").count(),4);
   assert.equal(await page.locator("#comparison-sources").evaluate(node=>
     node.scrollWidth<=node.clientWidth),true,"Source links must wrap without overflow");
   assert.equal(await page.locator("#reset").evaluate((reset)=>{
     const heading=document.querySelector("#controls-heading").getBoundingClientRect();
     return Math.abs(reset.getBoundingClientRect().top-heading.top)<3;
   }),true,"Reset stays on the Forecast controls title row");
   assert.match(await page.locator("#chart-subtitle").textContent(),/Index 100/);

   // Chart-specific nominal toggle: actual underlying unit values are
   // restored with separate axes for three distinct units.
   await switchMode(page,"commodity-chart","nominal");
   const nominal=await page.locator("#commodity-chart").evaluate(g=>({
     ids:g.layout.meta.commodities,unit:g.layout.meta.unit,
     values:g.data.slice(0,4).map(t=>t.y[0]),
     axes:g.layout.meta.axesByUnit,
     axisTitles:[g.layout.yaxis?.title?.text,
       g.layout.yaxis2?.title?.text,g.layout.yaxis3?.title?.text],
     history:g.data[0].y.slice(),domain:g.layout.xaxis.domain.slice(),ranges:[g.layout.yaxis.range.slice(),
       g.layout.yaxis2.range.slice(),g.layout.yaxis3.range.slice()]
   }));
   assert.deepEqual(nominal.values,initial.originals);
   assert.deepEqual(nominal.axes,
     ["USD/barrel","USD/troy oz","USD/metric ton"]);
   assert.deepEqual(nominal.domain,[0,1],
     "Nominal comparison reserves only outer margins, not in-chart whitespace");
   assert.deepEqual(nominal.axisTitles,nominal.axes,
     "Unlike indexed data, mixed nominal units require independent labeled axes");
   assert.equal(await page.locator(
     '.chart-scale-toggle[data-chart-mode="commodity-yoy"] button[data-mode="indexed"]'
   ).getAttribute("aria-pressed"),"true",
   "Changing Spot Prices should never toggle another chart");
   // A global shock must not change any nominal historical values or axis
   // scale, and it must not silently flip mode back to Indexed.
   await page.$eval("#shock",node=>{
     node.value="20";node.dispatchEvent(new Event("input",{bubbles:true}));
     node.dispatchEvent(new Event("change",{bubbles:true}));
   });
   await page.waitForFunction(()=>document.querySelector("#commodity-chart")
     ?.data?.some(t=>t.name==="Gold baseline")&&
     document.querySelector("#commodity-chart")?.data?.some(
       t=>t.name==="Gold forecast"&&t.line.dash==="dash"));
   await page.waitForFunction(()=>document.querySelector("#commodity-yoy")
     ?.data?.length===12);
   const shockedYoy=await page.locator("#commodity-yoy").evaluate(g=>({
     observed:g.data.filter(t=>t.meta.kind==="solid").map(t=>t.y.slice()),
     baseline:g.data.filter(t=>t.meta.kind==="dot").map(t=>t.y.at(-1)),
     scenario:g.data.filter(t=>t.meta.kind==="dash").map(t=>t.y.at(-1))
   }));
   assert.deepEqual(shockedYoy.observed,initialYoy.observed,
     "Four-asset annual history must not change under a conditional shock");
   assert.ok(shockedYoy.scenario.every((value,i)=>
     value!==shockedYoy.baseline[i]));
   const nominalShock=await page.locator("#commodity-chart").evaluate(g=>({
     history:g.data[0].y.slice(),ranges:[g.layout.yaxis.range.slice(),
       g.layout.yaxis2.range.slice(),g.layout.yaxis3.range.slice()],
     mode:g.layout.meta.mode
   }));
   assert.equal(nominalShock.mode,"nominal");
   assert.deepEqual(nominalShock.history,nominal.history);
   assert.deepEqual(nominalShock.ranges,nominal.ranges);
   const terminalPrices=()=>page.locator("#commodity-chart").evaluate(g=>
     Object.fromEntries(g.data.filter(t=>t.name.endsWith(" forecast"))
       .map(t=>[t.meta.commodity,t.y.at(-1)])));
   const six=await terminalPrices();
   assert.equal(await page.locator("#half-life").isDisabled(),false);
   await page.selectOption("#half-life","3");
   await page.waitForFunction(prior=>{
     const lines=document.querySelector("#commodity-chart")?.data
       ?.filter(t=>t.name.endsWith(" forecast"));
     return lines?.length===4&&lines.every(t=>t.y.at(-1)<prior[t.meta.commodity]);
   },six);
   const short=await terminalPrices();
   assert.equal(await page.locator("#half-life-impact").textContent(),
     "At month 6: +6.3% shock remains.");
   await page.selectOption("#half-life","12");
   await page.waitForFunction(prior=>{
     const lines=document.querySelector("#commodity-chart")?.data
       ?.filter(t=>t.name.endsWith(" forecast"));
     return lines?.length===4&&lines.every(t=>t.y.at(-1)>prior[t.meta.commodity]);
   },six);
   const long=await terminalPrices();
   assert.equal(await page.locator("#half-life-impact").textContent(),
     "At month 6: +15.0% shock remains.");
   assert.match(await page.locator("#scenario-status").textContent(),
     /12-month half-life/);
   for(const id of Object.keys(six)){
     assert.ok(short[id]<six[id]&&six[id]<long[id],
       "Half-life must change "+id+" independently");
   }
   assert.deepEqual(await page.locator("#commodity-chart").evaluate(g=>
     g.data[0].y.slice()),nominalShock.history);
   assert.deepEqual(await page.locator("#commodity-chart").evaluate(g=>[
     g.layout.yaxis.range.slice(),g.layout.yaxis2.range.slice(),
     g.layout.yaxis3.range.slice()]),nominalShock.ranges);
   await page.selectOption("#half-life","6");
   await switchMode(page,"commodity-chart","indexed");
   const restored=await page.locator("#commodity-chart").evaluate(g=>({
     actual:g.data[0].y.slice(),range:g.layout.yaxis.range.slice(),
     pixel:g._fullLayout.yaxis.l2p(g.data[0].y.at(-1))
   }));
   assert.deepEqual(restored.actual,initial.historical);
   assert.deepEqual(restored.range,initial.range);
   assert.ok(Math.abs(restored.pixel-initial.pixel)<.01);

   // Indexed percent changes and nominal underlying-unit changes are
   // independently selectable on all eight analytic cards.
   for(const id of ["commodity-yoy","commodity-returns","commodity-vol"]){
     await switchMode(page,id,"nominal");
     const result=await page.locator("#"+id).evaluate(g=>({
       count:g.data.length,axes:g.layout.meta.axesByUnit,
       mode:g.layout.meta.mode
     }));
     assert.equal(result.count,id==="commodity-yoy"?12:4);
     assert.equal(result.mode,"nominal");
     assert.deepEqual(result.axes,nominal.axes);
     assert.equal(await page.locator("#commodity-chart").evaluate(g=>
       g.layout.meta.mode),"indexed");
     await switchMode(page,id,"indexed");
   }
   const studies=page.locator("#chart-picker");
   await studies.locator("summary").click();
   await studies.locator('input[value="commodity-vol"]').uncheck();
   for(const [id,n] of [["commodity-seasonality",4],["commodity-models",12],
     ["commodity-shock",4],["commodity-drawdown",4]]){
     const control=studies.locator('input[value="'+id+'"]');
     await control.check();
     await page.waitForFunction(({id,count})=>
       document.getElementById(id)?.data?.length===count,{id,count:n});
     assert.equal(await page.locator("#chart-stage").getAttribute("data-count"),"4");
     await switchMode(page,id,"nominal");
     const result=await page.locator("#"+id).evaluate(g=>({
       axes:g.layout.meta.axesByUnit,
       mode:g.layout.meta.mode,
       ids:[...new Set(g.data.map(t=>t.meta.commodity))].sort()
     }));
     assert.equal(result.mode,"nominal");
     assert.deepEqual(result.axes,nominal.axes);
     assert.deepEqual(result.ids,["brent","wb-copper","wb-gold","wti"].sort());
     await switchMode(page,id,"indexed");
     await control.uncheck();
   }
   await studies.locator('input[value="commodity-vol"]').check();
   await studies.locator("summary").click();

   // Removing the first selection promotes the next selected commodity,
   // while switching category only filters available additions.
   await picker.locator('input[value="wti"]').uncheck();
   await page.waitForFunction(()=>document.querySelector("#commodity-chart")
     ?.layout?.meta?.commodities?.[0]==="brent");
   assert.match(await page.locator("#commodity-summary").textContent(),
     /^Brent crude oil \+ 2 comparisons$/);
   await page.locator("#commodity-search").fill("silver");
   assert.equal(await page.locator("#commodity-chart").evaluate(g=>
     g.layout.meta.commodities[0]),"brent");
   await page.locator("#commodity-search").fill("");
   for(const id of ["wb-copper","wb-gold"]){
     await picker.locator('input[value="'+id+'"]').uncheck();
   }
   await page.waitForFunction(()=>document.querySelector("#commodity-chart")
     ?.layout?.meta?.commodities?.length===1&&
       !document.querySelector("#commodity-chart")?.layout?.meta?.comparison);
   assert.equal(await page.locator("#commodity-chart").evaluate(g=>
     g.layout.meta.mode),"indexed",
     "Removing comparisons must preserve the explicitly selected chart mode");
   await switchMode(page,"commodity-chart","nominal");
   await page.waitForFunction(()=>document.querySelector("#commodity-chart")
     ?.layout?.meta?.unit==="USD/barrel"&&
       !document.querySelector("#commodity-chart")?.layout?.meta?.comparison);
   assert.equal(await page.locator("#commodity-selection-count").textContent(),"1 of 4");
   assert.equal(await page.locator("#comparison-sources").isHidden(),true);
   assert.equal(await page.locator("#commodity-source").isHidden(),false);
   await page.setViewportSize({width:390,height:844});
   const mobile=await page.evaluate(()=>({
     scroll:document.documentElement.scrollWidth,width:innerWidth,
     count:document.querySelectorAll(".chart-scale-toggle").length
   }));
   assert.ok(mobile.scroll<=mobile.width+3,
     "Adding toggles to chart headings must not overflow on mobile");
   assert.equal(mobile.count,8);
   assert.equal(await page.locator("#data-error").isVisible(),false);
   assert.deepEqual(errors,[]);
   console.log("PASS: one ordered multi-select Commodity dropdown, mixed-unit "+
     "nominal/indexed switches per graph and stable historical comparisons");
 }finally{
   if(browser)await browser.close();
   server.kill("SIGTERM");
 }
})().catch(err=>{console.error(err);process.exitCode=1;});
