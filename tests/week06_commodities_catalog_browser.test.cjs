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
   assert.equal(await page.locator("#commodity option").count(),35);
   assert.equal(await page.locator("#commodity-category").isDisabled(),false);
   assert.match(await page.locator("#commodity-count").textContent(),
     /35 verified benchmarks/);
   assert.equal(await page.locator("#catalog-gaps").isHidden(),false);
   assert.match(await page.locator("#catalog-gap-list").textContent(),/Gallium/);
   await page.selectOption("#commodity-category","Precious metals");
   await page.waitForFunction(()=>document.querySelector("#commodity-chart")
     ?.layout?.meta?.commodity==="wb-gold");
   assert.equal(await page.locator("#commodity option").count(),2);
   assert.equal(await page.locator("#kpi-unit").textContent(),"USD/troy oz");
   assert.match(await page.locator("#commodity-source").getAttribute("href"),
     /^https:\/\/thedocs.worldbank.org\//);
   await page.selectOption("#commodity-category","Critical minerals");
   await page.waitForFunction(()=>document.querySelector("#commodity-chart")
     ?.layout?.meta?.commodity==="uranium");
   assert.equal(await page.locator("#commodity option").count(),1);
   assert.equal(await page.locator("#kpi-unit").textContent(),"USD/lb");
   assert.match(await page.locator("#commodity-source").textContent(),/IMF/);
   await page.selectOption("#commodity-category","Forest products");
   await page.selectOption("#commodity","wb-plywood");
   await page.waitForFunction(()=>document.querySelector("#commodity-chart")
     ?.layout?.meta?.commodity==="wb-plywood");
   const paper=await page.locator("#commodity-chart").evaluate(g=>({
     prefix:g.layout.yaxis.tickprefix,suffix:g.layout.yaxis.ticksuffix,
     source:g.layout.meta.source
   }));
   assert.equal(paper.prefix,"");
   assert.equal(paper.suffix,"¢");
   assert.match(await page.locator("#preview-scenario").textContent(),/¢/);
   await page.selectOption("#commodity-category","all");
   await page.locator("#commodity-search").fill("tea");
   await page.waitForFunction(()=>document.querySelector("#commodity-chart")
     ?.layout?.meta?.commodity==="wb-tea");
   assert.equal(await page.locator("#commodity option").count(),1);
   assert.equal(await page.locator("#commodity-count").textContent(),
     "1 verified benchmark across 1 categories");
   await page.locator("#commodity-search").fill("gallium");
   assert.equal(await page.locator("#commodity").isDisabled(),true);
   assert.match(await page.locator("#commodity-count").textContent(),
     /0 verified benchmarks/);
   assert.equal(await page.locator("#commodity-chart").evaluate(g=>
     g.layout.meta.commodity),"wb-tea",
     "No matching filters must not fabricate or silently change a chart");
   assert.equal(await page.locator("#data-error").isVisible(),false);

   // Level 2: independently compare four verified commodities from different
   // units/categories on all eight selectable study types without new APIs.
   await page.locator("#commodity-search").fill("");
   await page.selectOption("#commodity","wti");
   await page.waitForFunction(()=>document.querySelector("#commodity-chart")
     ?.layout?.meta?.commodity==="wti");
   const compare=page.locator("#comparison-picker");
   assert.equal(await page.locator("#comparison-count").textContent(),"1 of 4");
   await compare.locator("summary").click();
   for(const id of ["brent","wb-gold","wb-copper"]){
     await compare.locator('input[value="'+id+'"]').check();
   }
   await page.waitForFunction(()=>document.querySelector("#commodity-chart")
     ?.layout?.meta?.commodities?.length===4);
   await page.waitForFunction(()=>["commodity-yoy","commodity-returns","commodity-vol"]
     .every(id=>document.getElementById(id)?.data?.length===4));
   assert.equal(await page.locator("#comparison-count").textContent(),"4 of 4");
   assert.equal(await compare.locator('input[value="wb-silver"]').isDisabled(),true,
     "Additional commodities must be disabled at the four-asset cap");
   assert.equal(await compare.locator('input[value="wti"]').isDisabled(),true,
     "The primary commodity remains selected in the comparison picker");
   const initialMulti=await page.locator("#commodity-chart").evaluate(g=>({
     names:g.data.filter(t=>t.showlegend!==false).map(t=>t.name),
     commodities:g.layout.meta.commodities.slice(),
     priceIndex:g.data.slice(0,4).map(t=>t.y[0]),
     originals:g.data.slice(0,4).map(t=>t.customdata[0]),
     units:g.data.slice(0,4).map(t=>t.meta.unit),
     colors:g.data.slice(0,4).map(t=>t.line.color),
     history:g.data[0].y.slice(),
     yRange:g.layout.yaxis.range.slice(),
     pixel:g._fullLayout.yaxis.l2p(g.data[0].y.at(-1)),
     height:g._fullLayout.height
   }));
   assert.deepEqual(initialMulti.commodities,["wti","brent","wb-gold","wb-copper"]);
   assert.deepEqual(initialMulti.names,["WTI crude oil","Brent crude oil","Gold","Copper"]);
   assert.deepEqual(initialMulti.priceIndex,[100,100,100,100]);
   assert.deepEqual(initialMulti.units,
     ["USD/barrel","USD/barrel","USD/troy oz","USD/metric ton"]);
   assert.equal(new Set(initialMulti.colors).size,4);
   assert.ok(Math.max(...initialMulti.originals)>2000,
     "Native gold/copper prices must remain available in the index trace hover");
   assert.equal(await page.locator("#comparison-sources a").count(),4);
   assert.match(await page.locator("#chart-subtitle").textContent(),/Index 100/);
   assert.equal(await page.locator("#comparison-preview-row").count(),0);
   assert.equal(await page.locator("#comparison-preview .comparison-preview-row").count(),4);
   // All four share the same conditional input; reported indexed observations
   // and the locked y-axis must remain pixel-stable when changing that input.
   await page.$eval("#shock",input=>{
     input.value="20";
     input.dispatchEvent(new Event("input",{bubbles:true}));
     input.dispatchEvent(new Event("change",{bubbles:true}));
   });
   await page.waitForFunction(()=>document.querySelector("#commodity-chart")
     ?.data?.some(t=>t.name==="Gold forecast"&&t.line.dash==="dash"));
   await page.waitForFunction(()=>document.querySelector("#commodity-shock")?.data?.length===0
     ||document.querySelector('#chart-picker input[value="commodity-shock"]')?.disabled===false);
   const afterShock=await page.locator("#commodity-chart").evaluate(g=>({
     actual:g.data[0].y.slice(),range:g.layout.yaxis.range.slice(),
     pixel:g._fullLayout.yaxis.l2p(g.data[0].y.at(-1)),
     units:g.data.slice(0,4).map(t=>t.meta.unit),
     commodities:g.layout.meta.commodities.slice()
   }));
   assert.deepEqual(afterShock.actual,initialMulti.history);
   assert.deepEqual(afterShock.range,initialMulti.yRange);
   assert.ok(Math.abs(afterShock.pixel-initialMulti.pixel)<.01,
     "Changing the common shock cannot move indexed history vertically");
   assert.deepEqual(afterShock.commodities,initialMulti.commodities);
   assert.equal(await page.locator("#data-error").isVisible(),false);

   const studies=page.locator("#chart-picker");
   await studies.locator("summary").click();
   await studies.locator('input[value="commodity-vol"]').uncheck();
   for(const [id,expected] of [
     ["commodity-seasonality",4],["commodity-models",12],
     ["commodity-shock",4],["commodity-drawdown",4]
   ]){
     const control=studies.locator('input[value="'+id+'"]');
     await control.check();
     await page.waitForFunction(({id,count})=>
       document.getElementById(id)?.data?.length===count,
       {id,count:expected});
     const checked=await page.locator("#chart-stage").getAttribute("data-count");
     assert.equal(checked,"4","Chart canvas must still select at most four graphs");
     const ids=await page.locator("#"+id).evaluate(g=>
       [...new Set(g.data.map(t=>t.meta.commodity))].sort());
     assert.deepEqual(ids,["brent","wb-copper","wb-gold","wti"].sort(),
       "All selected commodities must appear in "+id);
     await control.uncheck();
   }
   await studies.locator('input[value="commodity-vol"]').check();
   await studies.locator("summary").click();
   // Search the comparison control across categories without touching focus
   // search, then remove enough assets to return to raw-price single mode.
   await page.locator("#comparison-search").fill("silver");
   assert.equal(await compare.locator('input[value="wb-silver"]').isDisabled(),true);
   await page.locator("#comparison-search").fill("");
   for(const id of ["wb-copper","wb-gold","brent"]){
     await page.locator('#comparison-chips button[data-remove="'+id+'"]').click();
   }
   await page.waitForFunction(()=>document.querySelector("#commodity-chart")
     ?.layout?.meta?.unit==="USD/barrel"&&
       !document.querySelector("#commodity-chart")?.layout?.meta?.comparison);
   assert.equal(await page.locator("#comparison-count").textContent(),"1 of 4");
   assert.equal(await page.locator("#comparison-sources").isHidden(),true);
   assert.equal(await page.locator("#commodity-source").isHidden(),false);
   assert.deepEqual(errors,[]);
   console.log("PASS: Categorized multi-source commodity market discovery, units and provenance");
   console.log("PASS: Four-commodity overlays across eight studies, indexed units and locked scales");
 }finally{
   if(browser)await browser.close();
   server.kill("SIGTERM");
 }
})().catch(err=>{console.error(err);process.exitCode=1;});
