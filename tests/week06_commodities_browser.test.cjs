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
      ["Rates","Equities","Commodities"]);
    assert.equal(await page.locator(".workspaces [aria-current=page]").textContent(),
      "Commodities");
    assert.equal(await page.locator("#controls-heading").textContent(),"Controls");
    assert.equal(await page.locator("#reset").textContent(),"Reset");
    assert.equal(await page.locator("#half-life").isDisabled(),true,
      "Half-life has no effect with the default zero shock");
    assert.match(await page.locator("#half-life-impact").textContent(),/nonzero/);
    assert.equal(await page.locator("#commodity-options input").count(),3);
    assert.equal(await page.locator("#commodity-summary").textContent(),"WTI crude oil");
    assert.equal(await page.locator("#commodity-quote").isVisible(),true);
    assert.equal(await page.locator("#commodity-quote-name").textContent(),"WTI crude oil");
    const lastWTI=fixture().commodities[0].observations.at(-1).value;
    assert.equal(await page.locator("#commodity-quote-price").textContent(),
      "$"+lastWTI.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}));
    assert.match(await page.locator("#commodity-quote-change").textContent(),/% \/ 12 mo/);
    assert.match(await page.locator("#market-description").textContent(),
      /USD\/barrel.*monthly average/);
    assert.match(await page.locator("#commodity-quote-source").getAttribute("href"),
      /DCOILWTICO/);
    assert.equal(await page.locator("#commodity-count").isVisible(),false,
      "Verification count belongs in picker logic, not the sidebar");
    await page.locator(".sidebar-model-control .model-help summary").click();
    assert.match(await page.locator(".sidebar-model-control .model-help-panel").textContent(),
      /Mean reversion.*Recent log-price trend.*Unchanged price/s);
    await page.locator(".sidebar-model-control .model-help summary").click();
    assert.equal(await page.locator("#commodity-selection-count").textContent(),"1 of 4");
    const picker=page.locator("#chart-picker");
    assert.equal(await picker.locator('input[type="checkbox"]').count(),8);
    assert.equal(await picker.locator("input:checked").count(),4);
    assert.equal(await page.locator("#chart-stage").getAttribute("data-count"),"4");
    assert.equal(await page.locator(".kpis").count(),0,
      "Commodity results belong in chart headings and hovers");
    await page.waitForFunction(()=>["commodity-yoy","commodity-returns","commodity-vol"]
        .every(id=>document.getElementById(id)?.data?.length===
        (id==="commodity-yoy"?2:1)));
    const defaultYoy=await page.locator("#commodity-yoy").evaluate(g=>({
      kinds:g.data.map(t=>t.line.dash||"solid"),
      final:g.data.at(-1).y.at(-1),
      projectedDate:g.data.at(-1).x.at(-1),
      anchor:g.data.at(-1).y[0],
      observedLast:g.data[0].y.at(-1)
    }));
    assert.deepEqual(defaultYoy.kinds,["solid","dash"]);
    assert.equal(defaultYoy.anchor,defaultYoy.observedLast,
      "Forecast YoY must connect to the last measured YoY change");
    assert.equal(defaultYoy.projectedDate,
      require("../docs/week-06/commodities/model.js")
        .shiftMonth(fixture().commodities[0].last_observation,6));
    const four=await page.locator("#chart-stage").evaluate(stage=>
      [...stage.querySelectorAll(".chart-card:not(.is-view-hidden)")].map(node=>{
        const rect=node.getBoundingClientRect();
        return {x:Math.round(rect.x),y:Math.round(rect.y),w:rect.width};
      }));
    assert.ok(four[0].y===four[1].y&&four[2].y===four[3].y);
    assert.ok(four[1].x>four[0].x&&four[2].y>four[0].y);
    assert.equal(await page.locator("#commodity-summary").textContent(),"WTI crude oil");
    assert.equal(await page.locator("#source-period").textContent(),"Through 2026-08");
    assert.equal(await page.locator("#data-error").isVisible(),false);
    const initial=await page.locator("#commodity-chart").evaluate(g=>({
      historical:g.data[0].y.slice(),forecast:g.data.at(-1).y.slice(),
      x:g.data[0].x.slice(),projected:g.data.at(-1).x.slice(),
      range:g.layout.yaxis.range.slice(),pixel:g._fullLayout.yaxis.l2p(g.data[0].y.at(-1)),
      shapeCount:g.layout.shapes.length,annotations:g.layout.annotations,
      unit:g.layout.meta.unit,mode:g.layout.meta.yScale,
      height:g._fullLayout.height,plotSize:g._fullLayout._size,
      layoutMargin:g._fullLayout.margin
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
    await page.waitForFunction(()=>document.querySelector("#commodity-yoy")
      ?.data?.length===3);
    const shockedYoy=await page.locator("#commodity-yoy").evaluate(g=>({
      observed:g.data[0].y.slice(),
      baseline:g.data[1].y.at(-1),
      scenario:g.data[2].y.at(-1),
      names:g.data.map(t=>t.name)
    }));
    assert.equal(shockedYoy.observed.at(-1),defaultYoy.observedLast,
      "Shock sliders must not revise reported year-over-year changes");
    assert.notEqual(shockedYoy.scenario,shockedYoy.baseline,
      "Conditional shock must propagate into the projected YoY chart");
    assert.ok(shockedYoy.names.includes("Unshocked YoY")&&
      shockedYoy.names.includes("Modeled YoY"));
    await page.waitForFunction(previous=>{
      const g=document.querySelector("#commodity-chart");
      return g?.data?.some(t=>t.name==="Conditional scenario (dashed)" &&
        t.y.at(-1)>previous);
    },initial.forecast.at(-1));
    assert.equal(await picker.locator('input[value="commodity-shock"]').isDisabled(),false,
      "A nonzero conditional shock enables its own sensitivity chart");
    assert.equal(await page.locator("#half-life").isDisabled(),false,
      "A nonzero shock unlocks half-life selection");
    const shocked=await page.locator("#commodity-chart").evaluate(g=>({
      reported:g.data[0].y.slice(),range:g.layout.yaxis.range.slice(),
      pixel:g._fullLayout.yaxis.l2p(g.data[0].y.at(-1)),
      height:g._fullLayout.height,plotSize:g._fullLayout._size,
      layoutMargin:g._fullLayout.margin,
      names:g.data.filter(t=>t.showlegend!==false).map(t=>t.name),
      projected:g.data.at(-1).y.at(-1),
      x:g.data.at(-1).x.slice(),
    }));
    assert.deepEqual(shocked.reported,initial.historical,
      "A scenario dial cannot change observed spot prices");
    assert.deepEqual(shocked.range,initial.range,
      "A scenario dial must not change the historical y-axis");
    assert.ok(Math.abs(shocked.pixel-initial.pixel)<.001,
      "Fixed-price axis moved unexpectedly "+JSON.stringify({initial:{
        pixel:initial.pixel,height:initial.height,plotSize:initial.plotSize,
        layoutMargin:initial.layoutMargin
      },shocked:{pixel:shocked.pixel,height:shocked.height,
        plotSize:shocked.plotSize,layoutMargin:shocked.layoutMargin}}));
    assert.ok(shocked.names.includes("Unadjusted baseline (dotted)"));
    assert.ok(shocked.names.includes("Volatility guide (dotted)"));
    assert.ok(shocked.names.includes("Conditional scenario (dashed)"));
    await page.selectOption("#half-life","3");
    await page.waitForFunction(prior=>document.querySelector("#commodity-chart")
      ?.data?.at(-1)?.y.at(-1)<prior,shocked.projected);
    const short=await page.locator("#commodity-chart").evaluate(g=>g.data.at(-1).y.at(-1));
    assert.equal(await page.locator("#half-life-impact").textContent(),
      "At month 6: +6.3% shock remains.");
    assert.match(await page.locator("#scenario-status").textContent(),/3-month half-life/);
    await page.selectOption("#half-life","12");
    await page.waitForFunction(prior=>document.querySelector("#commodity-chart")
      ?.data?.at(-1)?.y.at(-1)>prior,shocked.projected);
    const long=await page.locator("#commodity-chart").evaluate(g=>g.data.at(-1).y.at(-1));
    assert.ok(short<shocked.projected&&shocked.projected<long,
      "Changing half-life must visibly change projected terminal prices");
    assert.equal(await page.locator("#half-life-impact").textContent(),
      "At month 6: +15.0% shock remains.");
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
    await page.locator("#commodity-picker summary").click();
    await page.locator("#commodity-clear").click();
    await page.locator('#commodity-options input[value="gas"]').check();
    await page.waitForFunction(()=>document.querySelector("#commodity-chart")
      ?.layout?.meta?.commodity==="gas");
    assert.equal(await page.locator("#kpi-unit").textContent(),"USD/MMBtu");
    assert.equal(await page.locator("#commodity-quote-name").textContent(),
      "Henry Hub natural gas");
    assert.match(await page.locator("#market-description").textContent(),
      /USD\/MMBtu.*monthly average/);
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
    assert.equal(await page.locator("#fit-projection").isHidden(),false);
    await picker.locator('input[value="commodity-chart"]').click();
    assert.equal(await picker.locator('input[value="commodity-chart"]').isChecked(),true,
      "Cannot deselect the final visible chart");
    await page.locator("#reset").click();
    await page.waitForFunction(()=>document.querySelector("#shock-value")
      ?.textContent==="0%");
    assert.equal(await page.locator("#commodity-summary").textContent(),"Henry Hub natural gas");
    assert.equal(await page.locator("#model").inputValue(),"mean");
    assert.equal(await page.locator("#history").inputValue(),"60");
    assert.equal(await page.locator("#horizon").inputValue(),"6");
    assert.equal(await picker.locator("input:checked").count(),4);
    assert.equal(await picker.locator('input[value="commodity-shock"]').isDisabled(),true,
      "Zero-shock sensitivity must never create a useless chart");
    assert.equal(await page.locator("#half-life").isDisabled(),true);
    assert.match(await page.locator("#half-life-impact").textContent(),/nonzero/);
    await picker.locator("summary").click();
    assert.equal(await page.locator("#data-error").isVisible(),false);
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>
      document.querySelector("#commodity-chart")?.layout?.margin?.t===32);
    const mobileDensity=await page.evaluate(()=>({
      card:document.querySelector('[data-chart="commodity-chart"]').getBoundingClientRect().height,
      top:document.querySelector("#commodity-chart").layout.margin.t
    }));
    assert.ok(mobileDensity.card<295&&mobileDensity.top<=32,
      "Commodity mobile cards should fit content without desktop plot whitespace");
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
