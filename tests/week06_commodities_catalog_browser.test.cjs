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
   assert.deepEqual(errors,[]);
   console.log("PASS: Categorized multi-source commodity market discovery, units and provenance");
 }finally{
   if(browser)await browser.close();
   server.kill("SIGTERM");
 }
})().catch(err=>{console.error(err);process.exitCode=1;});
