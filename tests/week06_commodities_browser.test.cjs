/* Actual Chromium + Plotly with test-only fixture: no invented published prices. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {spawn}=require("node:child_process");
const {chromium}=require("playwright");
const base="http://127.0.0.1:8789";
async function waitServer(){
  for(let i=0;i<60;i++){
    try{if((await fetch(base+"/week-06/commodities/")).ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,170));
  }
  throw Error("Preview server unavailable");
}
function fixture(){
  const make=(id,label,unit,series,starting,drift)=>({
    id,label,unit,source:"EIA via FRED",source_id:series,
    source_url:"https://fred.stlouisfed.org/series/"+series,
    frequency:"monthly mean of available daily spot prices",
    observations:Array.from({length:248},(_,i)=>({
      date:new Date(Date.UTC(2006,i,1)).toISOString().slice(0,10),
      value:starting+i*drift+2*Math.sin(i/9)
    }))
  });
  const commodities=[
    make("wti","WTI crude oil","USD/barrel","DCOILWTICO",58,.11),
    make("brent","Brent crude oil","USD/barrel","DCOILBRENTEU",63,.10),
    make("gas","Henry Hub natural gas","USD/MMBtu","DHHNGSP",3,.012)
  ];
  for(const c of commodities)c.last_observation=c.observations.at(-1).date;
  return {schema_version:1,status:"ready",retrieved_utc:"2026-10-01T10:00:00Z",
    commodities};
}
async function slide(page,n,value){
  await page.$eval(n,(el,v)=>{el.value=String(v);
    el.dispatchEvent(new Event("input",{bubbles:true}));
    el.dispatchEvent(new Event("change",{bubbles:true}));},value);
}
(async()=>{
  const server=spawn("python3",["-m","http.server","8789","--bind","127.0.0.1",
    "--directory","docs"],{stdio:"ignore"});
  let browser;
  try{
    await waitServer();
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.route("https://cdn.plot.ly/**",route=>route.fulfill({
      path:require.resolve("plotly.js-dist-min"),contentType:"application/javascript"}));
    await page.route("**/commodities/data.json",route=>route.fulfill({json:fixture()}));
    await page.goto(base+"/week-06/commodities/",{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>document.querySelector("#commodity-chart")
      ?.data?.length===4);
    assert.deepEqual(await page.locator(".workspaces a").allTextContents(),
      ["Bonds","Equities","Commodities"]);
    assert.equal(await page.locator(".workspaces [aria-current=page]").textContent(),
      "Commodities");
    assert.equal(await page.locator("#controls-heading").textContent(),"Forecast controls");
    assert.equal(await page.locator("#reset").textContent(),"Reset");
    assert.equal(await page.locator("#commodity option").count(),3);
    const picker=page.locator("#chart-picker");
    assert.equal(await picker.locator('input[type="checkbox"]').count(),8);
    assert.equal(await picker.locator("input:checked").count(),4);
    assert.equal(await page.locator("#chart-stage").getAttribute("data-count"),"4");
    assert.equal(await page.locator(".kpis").count(),0,
      "Commodity results belong in chart headings and hovers");
    await page.waitForFunction(()=>["commodity-yoy","commodity-returns","commodity-vol"]
      .every(id=>document.getElementById(id)?.data?.length===1));
    const four=await page.locator("#chart-stage").evaluate(stage=>
      [...stage.querySelectorAll(".chart-card:not(.is-view-hidden)")].map(node=>{
        const rect=node.getBoundingClientRect();
        return {x:Math.round(rect.x),y:Math.round(rect.y),w:rect.width};
      }));
    assert.ok(four[0].y===four[1].y&&four[2].y===four[3].y);
    assert.ok(four[1].x>four[0].x&&four[2].y>four[0].y);
    assert.equal(await page.locator("#commodity").inputValue(),"wti");
    assert.equal(await page.locator("#source-period").textContent(),"Through 2026-08");
    assert.equal(await page.locator("#data-error").isVisible(),false);
    const initial=await page.locator("#commodity-chart").evaluate(g=>({
      historical:g.data[0].y.slice(),forecast:g.data.at(-1).y.slice(),
      x:g.data[0].x.slice(),projected:g.data.at(-1).x.slice(),
      range:g.layout.yaxis.range.slice(),pixel:g._fullLayout.yaxis.l2p(g.data[0].y.at(-1)),
      shapeCount:g.layout.shapes.length,annotations:g.layout.annotations,
      unit:g.layout.meta.unit,mode:g.layout.meta.yScale
    }));
    assert.equal(initial.x.length,60);
    assert.equal(initial.projected.length,7);
    assert.equal(initial.x.at(-1),initial.projected[0]);
    assert.equal(initial.historical.at(-1),initial.forecast[0]);
    assert.equal(initial.shapeCount,2);
    assert.deepEqual(initial.annotations,[]);
    assert.equal(initial.unit,"USD/barrel");
    assert.equal(initial.mode,"baseline-locked");
    const navigationCenter=await page.locator(".workspaces").evaluate(n=>{
      const r=n.getBoundingClientRect();return r.x+r.width/2;});
    assert.ok(Math.abs(navigationCenter-720)<1,"Three-tab switch is centered");
    await slide(page,"#shock",20);
    await page.waitForFunction(previous=>{
      const g=document.querySelector("#commodity-chart");
      return g?.data?.some(t=>t.name==="Conditional scenario (dashed)" &&
        t.y.at(-1)>previous);
    },initial.forecast.at(-1));
    assert.equal(await picker.locator('input[value="commodity-shock"]').isDisabled(),false,
      "A nonzero conditional shock enables its own sensitivity chart");
    const shocked=await page.locator("#commodity-chart").evaluate(g=>({
      reported:g.data[0].y.slice(),range:g.layout.yaxis.range.slice(),
      pixel:g._fullLayout.yaxis.l2p(g.data[0].y.at(-1)),
      names:g.data.filter(t=>t.showlegend!==false).map(t=>t.name),
      projected:g.data.at(-1).y.at(-1),
      x:g.data.at(-1).x.slice(),
    }));
    assert.deepEqual(shocked.reported,initial.historical,
      "A scenario dial cannot change observed spot prices");
    assert.deepEqual(shocked.range,initial.range,
      "A scenario dial must not change the historical y-axis");
    assert.ok(Math.abs(shocked.pixel-initial.pixel)<.001);
    assert.ok(shocked.names.includes("Unadjusted baseline (dotted)"));
    assert.ok(shocked.names.includes("Volatility guide (dotted)"));
    assert.ok(shocked.names.includes("Conditional scenario (dashed)"));
    const terminal=await page.locator("#preview-scenario").textContent();
    await page.selectOption("#half-life","12");
    await page.waitForFunction(prior=>document.querySelector("#preview-scenario")
      ?.textContent!==prior,terminal);
    assert.deepEqual(await page.locator("#commodity-chart").evaluate(
      g=>g.layout.yaxis.range.slice()),initial.range);
    await page.selectOption("#horizon","12");
    await page.waitForFunction(()=>document.querySelector("#commodity-chart")
      ?.layout?.meta?.projectedEnd==="2027-08-01");
    assert.deepEqual(await page.locator("#commodity-chart").evaluate(
      g=>g.layout.yaxis.range.slice()),initial.range);
    await page.selectOption("#history","120");
    await page.waitForFunction(()=>document.querySelector("#commodity-chart")
      ?.data?.[0]?.x?.length===120);
    await page.selectOption("#commodity","gas");
    await page.waitForFunction(()=>document.querySelector("#commodity-chart")
      ?.layout?.meta?.commodity==="gas");
    assert.equal(await page.locator("#kpi-unit").textContent(),"USD/MMBtu");
    assert.match(await page.locator("#commodity-source").getAttribute("href"),/DHHNGSP/);
    // Optional charts use the same verified spot data; no additional API calls.
    await picker.locator("summary").click();
    await picker.locator('input[value="commodity-vol"]').uncheck();
    for(const [id,expected] of [
      ["commodity-models",3],["commodity-seasonality",1],
      ["commodity-drawdown",1],["commodity-shock",1]
    ]){
      const control=picker.locator('input[value="'+id+'"]');
      await control.check();
      await page.waitForFunction(({id,n})=>
        document.getElementById(id)?.data?.length===n,{id,n:expected});
      assert.equal(await page.locator("#chart-stage").getAttribute("data-count"),"4");
      await control.uncheck();
    }
    const boxes=()=>page.locator("#chart-stage").evaluate(stage=>
      [...stage.querySelectorAll(".chart-card:not(.is-view-hidden)")].map(node=>{
        const r=node.getBoundingClientRect();
        return {x:Math.round(r.x),y:Math.round(r.y),w:r.width};
      }));
    assert.equal(await page.locator("#chart-stage").getAttribute("data-count"),"3");
    const three=await boxes();
    assert.ok(three[0].w>three[1].w*1.8&&
      three[1].y===three[2].y&&three[2].x>three[1].x);
    await picker.locator('input[value="commodity-returns"]').uncheck();
    const two=await boxes();
    assert.equal(await page.locator("#chart-stage").getAttribute("data-count"),"2");
    assert.ok(two[1].y>two[0].y&&two[0].x===two[1].x);
    await picker.locator('input[value="commodity-yoy"]').uncheck();
    assert.equal(await page.locator("#chart-stage").getAttribute("data-count"),"1");
    await picker.locator('input[value="commodity-chart"]').click();
    assert.equal(await picker.locator('input[value="commodity-chart"]').isChecked(),true,
      "Cannot deselect the final visible chart");
    await page.locator("#reset").click();
    await page.waitForFunction(()=>document.querySelector("#shock-value")
      ?.textContent==="0%");
    assert.equal(await page.locator("#commodity").inputValue(),"gas");
    assert.equal(await page.locator("#model").inputValue(),"mean");
    assert.equal(await page.locator("#history").inputValue(),"60");
    assert.equal(await page.locator("#horizon").inputValue(),"6");
    assert.equal(await picker.locator("input:checked").count(),4);
    assert.equal(await picker.locator('input[value="commodity-shock"]').isDisabled(),true,
      "Zero-shock sensitivity must never create a useless chart");
    assert.equal(await page.locator("#data-error").isVisible(),false);
    await page.setViewportSize({width:390,height:844});
    const mobile=await page.evaluate(()=>({
      scroll:document.documentElement.scrollWidth,width:innerWidth,
      card:document.querySelector(".commodity-chart-card").getBoundingClientRect().width,
      tabs:(()=>{const r=document.querySelector(".workspaces").getBoundingClientRect();
        return r.x+r.width/2;})()
    }));
    assert.ok(mobile.scroll<=mobile.width+3);
    assert.ok(mobile.card<=mobile.width);
    assert.ok(Math.abs(mobile.tabs-195)<1,"Three-tab switch centered on mobile");
    fs.mkdirSync("test-artifacts",{recursive:true});
    await page.screenshot({path:"test-artifacts/week06-commodities-mobile.png",fullPage:true});
    assert.deepEqual(errors,[]);
    console.log("PASS: Commodities genuine-data controls, unified chart, locked axes, and mobile");
  }finally{
    if(browser)await browser.close();
    server.kill("SIGTERM");
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
