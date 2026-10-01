/* Real Chromium + real Plotly against a deterministic, test-only model snapshot. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {spawn}=require("node:child_process");
const {chromium}=require("playwright");
const {makeFixture}=require("./week06_forecast_fixture.cjs");
const base="http://127.0.0.1:8788";
async function waitServer(){
  for(let i=0;i<60;i++){
    try{if((await fetch(base+"/week-06/")).ok)return;}catch{}
    await new Promise(done=>setTimeout(done,180));
  }
  throw Error("Preview server did not start");
}
async function slide(page,id,v){
  await page.$eval(id,(n,value)=>{
    n.value=String(value);
    n.dispatchEvent(new Event("input",{bubbles:true}));
    n.dispatchEvent(new Event("change",{bubbles:true}));
  },v);
}
(async()=>{
  const server=spawn("python3",["-m","http.server","8788","--bind","127.0.0.1","--directory","docs"],{stdio:"ignore"});
  let browser;
  try{
    await waitServer();
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:"no-preference"});
    const errors=[];
    let onSimulator=false;
    page.on("pageerror",e=>{if(onSimulator)errors.push(e.message);});
    await page.route("https://cdn.plot.ly/**",r=>r.fulfill({
      path:require.resolve("plotly.js-dist-min"),contentType:"application/javascript"
    }));
    // This fixture tests the browser independent of FRED network availability.
    // Separate Python/refresh CI verifies the actual FRED fitting pipeline.
    await page.route("**/week-06/data.json",r=>r.fulfill({json:makeFixture()}));
    await page.goto(base+"/#week-05",{waitUntil:"domcontentloaded"});
    await page.locator("a.week-06-nav").click();
    await page.waitForURL("**/week-06/");
    onSimulator=true;
    await page.waitForFunction(()=>{
      const d=document.querySelector("#chart-yields");
      return d?.data?.length===8&&d.data[0].x.length===120&&d.data[6].x.length===13;
    });
    assert.deepEqual(await page.locator(".workspaces a").allTextContents(),
      ["Macro","Equities"]);
    assert.equal(await page.locator(".hero").count(),0,
      "No redundant Treasury yields headline or hero");
    assert.equal(await page.locator(
      ".week-06-header > .workspaces + .source-stamp + .course-side").count(),1,
      "Historical date belongs between dashboard tabs and course label");
    const macroTabCenter=await page.locator(".workspaces").evaluate(n=>{
      const r=n.getBoundingClientRect();return r.x+r.width/2;
    });
    assert.ok(Math.abs(macroTabCenter-720)<1,
      "Macro switch must be centered in the viewport");
    assert.match(await page.locator(".week-06-header .source-stamp").textContent(),
      /Historical data.*\d{4}-\d\d-\d\d/s);
    assert.equal(await page.locator("#chart-picker input").count(),8);
    assert.equal(await page.locator("#chart-stage > .chart-card:not(.is-view-hidden)").count(),4);
    assert.equal(await page.locator("#model-status").textContent(),
      "Fitted Diebold–Li style · 189 training months · 8 Treasury maturities");
    assert.equal(await page.locator("#controls-heading").textContent(),"Forecast controls");
    assert.equal(await page.locator("#reset").textContent(),"Reset");
    assert.equal(await page.locator(".controls .eyebrow").count(),0,
      "Redundant heading copy must not take sidebar space");
    const macroHeading=await page.locator(".forecast-heading").evaluate(n=>{
      const title=n.querySelector("h2").getBoundingClientRect();
      const reset=n.querySelector("#reset").getBoundingClientRect();
      const wrapper=n.getBoundingClientRect();
      return {titleWidth:title.width,containerWidth:wrapper.width,
        titleBottom:title.bottom,resetTop:reset.top};
    });
    assert.ok(macroHeading.titleWidth>macroHeading.containerWidth-2,
      "Sidebar heading must occupy the full available width");
    assert.ok(macroHeading.resetTop>=macroHeading.titleBottom,
      "Reset must not crowd the title");
    assert.equal(await page.locator("#backtest-table tr").count(),9);

    const baseline=await page.locator("#chart-yields").evaluate(n=>({
      names:n.data.map(t=>t.name),hist5:n.data[0].y,hist10:n.data[1].y,
      legend:n.data.filter(t=>t.showlegend!==false).map(t=>({name:t.name,dash:t.line?.dash||"solid"})),
      annotations:n.layout.annotations,
      pred5:n.data[6].y,pred10:n.data[7].y,
      scenarioStart:n.layout.meta.forecastStart,
      histEnd:n.data[0].x.at(-1),futureStart:n.data[6].x[0],
      boundary:n.layout.meta.boundaryFraction,
      sameAxis:n.layout.xaxis2===undefined,
      bands:n.layout.meta.empiricalBands,shapes:n.layout.shapes,
      yRange:n.layout.yaxis.range.slice(),
      historicPixel:n._fullLayout.yaxis.l2p(n.data[0].y.at(-1))
    }));
    assert.deepEqual(baseline.names.slice(0,2),
      ["5Y observed (solid)","10Y observed (solid)"]);
    assert.deepEqual(baseline.annotations,[],
      "Do not float OBSERVED/FORECAST labels above the shaded graph");
    assert.deepEqual(baseline.legend,[
      {name:"5Y observed (solid)",dash:"solid"},
      {name:"10Y observed (solid)",dash:"solid"},
      {name:"5Y forecast (dashed)",dash:"dash"},
      {name:"10Y forecast (dashed)",dash:"dash"}
    ]);
    assert.equal(baseline.pred5[0],baseline.hist5.at(-1));
    assert.equal(baseline.pred10[0],baseline.hist10.at(-1));
    assert.notEqual(baseline.pred5.at(-1),baseline.hist5.at(-1));
    assert.equal(baseline.scenarioStart,baseline.histEnd);
    assert.equal(baseline.futureStart,baseline.histEnd);
    assert.ok(baseline.sameAxis&&baseline.boundary>.88&&baseline.boundary<.94);
    assert.equal(baseline.bands,true);
    const initialTerminal5=baseline.pred5.at(-1);
    const initialTerminal10=baseline.pred10.at(-1);
    const actual5=await page.locator("#chart-yields-context").textContent();

    // The policy input is data-calibrated, not separate arbitrary 5Y and 10Y slopes.
    assert.equal(await page.locator("#beta5").count(),0);
    assert.equal(await page.locator("#beta10").count(),0);
    assert.equal(await page.locator("#corridor").count(),0);
    await slide(page,"#delta",50);
    await page.waitForFunction(previous=>{
      const g=document.querySelector("#chart-yields");
      return g?.data?.[6]?.y&&Math.abs(g.data[6].y.at(-1)-previous)>.01;
    },initialTerminal5);
    const shocked=await page.locator("#chart-yields").evaluate(n=>({
      p5:n.data[6].y.at(-1),p10:n.data[7].y.at(-1),
      actual5:n.data[0].y,actual10:n.data[1].y,
      label:n.data[6].name,meta:n.layout.meta,
      annotations:n.layout.annotations,
      yRange:n.layout.yaxis.range.slice(),
      historicPixel:n._fullLayout.yaxis.l2p(n.data[0].y.at(-1))
    }));
    assert.notEqual(shocked.p10,initialTerminal10);
    assert.deepEqual(shocked.actual5,baseline.hist5);
    assert.deepEqual(shocked.actual10,baseline.hist10);
    assert.equal(shocked.label,"5Y scenario (dashed)");
    assert.deepEqual(shocked.annotations,[]);
    assert.equal((await page.locator("#chart-yields-context").textContent()).slice(0,20),actual5.slice(0,20));
    assert.equal(shocked.meta.conditionalShockBp,50);
    assert.deepEqual(shocked.yRange,baseline.yRange,"Fed dial cannot rescale historical yields");
    assert.ok(Math.abs(shocked.historicPixel-baseline.historicPixel)<.001,
      "Historical data must stay at the exact same vertical position");
    assert.match(shocked.meta.yScale,/locked/);

    // Confidence setting changes historical-error shading, never the central.
    await page.locator("#show-bands").uncheck();
    await page.waitForFunction(()=>document.querySelector("#chart-yields")?.data?.length===4);
    const without=await page.locator("#chart-yields").evaluate(n=>({
      last:n.data.map(t=>t.y.at(-1)),range:n.layout.yaxis.range.slice()
    }));
    assert.deepEqual(without.range,baseline.yRange,"Band toggle cannot rescale");
    assert.equal(without.last[2],shocked.p5);
    assert.equal(without.last[3],shocked.p10);
    await page.locator("#show-bands").check();
    await page.waitForFunction(()=>document.querySelector("#chart-yields")?.data?.length===8);

    await page.selectOption("#horizon","6");
    await page.waitForFunction(()=>document.querySelector("#chart-yields")?.data?.[6]?.x.length===7);
    const short=await page.locator("#chart-yields").evaluate(n=>({
      cutoff:n.layout.meta.boundaryFraction,range:n.layout.yaxis.range.slice()
    }));
    assert.deepEqual(short.range,baseline.yRange,"Horizon must retain fixed y-range");
    assert.ok(short.cutoff>.93&&short.cutoff<.97);
    await page.selectOption("#horizon","24");
    await page.waitForFunction(()=>document.querySelector("#chart-yields")?.data?.[6]?.x.length===25);
    const long=await page.locator("#chart-yields").evaluate(n=>({
      cutoff:n.layout.meta.boundaryFraction,range:n.layout.yaxis.range.slice()
    }));
    assert.deepEqual(long.range,baseline.yRange,"24-month horizon must retain fixed y-range");
    assert.ok(long.cutoff<short.cutoff&&long.cutoff>.81&&long.cutoff<.87);

    await page.locator("#focus-projection").click();
    await page.waitForFunction(()=>document.querySelector("#chart-yields")?.layout?.meta?.focused===true);
    const focused=await page.locator("#chart-yields").evaluate(n=>n.layout.meta.boundaryFraction);
    assert.ok(focused>.46&&focused<.54);
    await page.locator("#focus-projection").click();
    await page.selectOption("#chart-context","180");
    await page.waitForFunction(()=>document.querySelector("#chart-yields")?.data?.[0]?.x.length===180);

    await page.locator("#chart-picker summary").click();
    const chartInput=id=>page.locator('#chart-picker input[value="'+id+'"]');
    await chartInput("chart-five").click();
    assert.equal(await chartInput("chart-five").isChecked(),false,
      "A fifth chart must be refused");
    assert.match(await page.locator("#chart-selection-status").textContent(),/maximum/);
    const boxes=()=>page.locator("#chart-stage .chart-card:not(.is-view-hidden)")
      .evaluateAll(cards=>cards.map(card=>{
        const r=card.getBoundingClientRect();
        return {top:Math.round(r.top),left:Math.round(r.left),width:r.width};
      }));
    const four=await boxes();
    assert.ok(four[0].top===four[1].top&&four[2].top===four[3].top);
    assert.ok(four[2].top>four[0].top&&four[1].left>four[0].left);
    await chartInput("chart-accuracy").uncheck();
    assert.equal(await page.locator("#chart-stage").getAttribute("data-count"),"3");
    const three=await boxes();
    assert.ok(three[0].width>three[1].width*1.8 &&
      three[1].top===three[2].top && three[2].left>three[1].left,
      "Three charts must show a full-width featured chart over two columns");
    await chartInput("chart-policy").uncheck();
    const two=await boxes();
    assert.equal(await page.locator("#chart-stage").getAttribute("data-count"),"2");
    assert.ok(two[1].top>two[0].top&&two[0].left===two[1].left,
      "Two charts must stack at full width");
    await chartInput("chart-yields").uncheck();
    assert.equal(await page.locator("#chart-stage").getAttribute("data-count"),"1");
    await chartInput("chart-spread").click();
    assert.equal(await chartInput("chart-spread").isChecked(),true,
      "The last chart cannot be removed");
    await page.waitForFunction(()=>document.querySelector("#chart-spread")?.data?.length===4);
    const spread=await page.locator("#chart-spread").evaluate(n=>({
      first:n.data[0].y.at(-1),central:n.data[3].y,
      lower:n.data[1].y,upper:n.data[2].y,
      zero:n.layout.shapes.find(s=>s.y0===0&&s.y1===0),
      bound:n.layout.meta.forecastStart,
      yRange:n.layout.yaxis.range.slice(),hist:n.data[0].y.slice(),
      legend:n.data.filter(t=>t.showlegend!==false).map(t=>({name:t.name,dash:t.line?.dash||"solid"})),
      annotations:n.layout.annotations
    }));
    assert.ok(spread.zero&&spread.zero.xref==="x");
    assert.equal(spread.lower[0],spread.first);
    assert.equal(spread.upper[0],spread.first);
    assert.equal(spread.central[0],spread.first);
    assert.deepEqual(spread.annotations,[]);
    assert.deepEqual(spread.legend,[
      {name:"Observed spread (solid)",dash:"solid"},
      {name:"Historical error bounds (dotted)",dash:"dot"},
      {name:"Spread scenario (dashed)",dash:"dash"}
    ]);
    await slide(page,"#delta",-100);
    await page.waitForFunction(()=>
      document.querySelector("#chart-spread")?.layout?.meta?.conditionalShockBp===-100);
    const stressed=await page.locator("#chart-spread").evaluate(n=>({
      range:n.layout.yaxis.range.slice(),hist:n.data[0].y.slice()
    }));
    assert.deepEqual(stressed.range,spread.yRange,"Spread dial cannot rescale y-axis");
    assert.deepEqual(stressed.hist,spread.hist);
    // Additional views must render from the same verified dataset on demand.
    for(const [id,expected] of [
      ["chart-five",4],["chart-ten",4],
      ["chart-shock",2],["chart-policy-gap",2]
    ]){
      const input=page.locator('#chart-picker input[value="'+id+'"]');
      await input.check();
      await page.waitForFunction(({id,n})=>
        document.getElementById(id)?.data?.length===n,{id,n:expected});
      assert.equal(await page.locator("#chart-stage").getAttribute("data-count"),"2");
      await input.uncheck();
    }
    await page.locator("#reset").click();
    await page.waitForFunction(()=>document.querySelector("#delta-value").textContent==="0 bps");
    assert.equal(await page.locator("#horizon").inputValue(),"12");
    assert.equal(await page.locator("#show-bands").isChecked(),true);
    assert.equal(await page.locator("#chart-stage").getAttribute("data-count"),"4");
    await page.waitForFunction(()=>document.querySelector("#chart-yields")?.data?.length===8);
    const desktop=await page.evaluate(()=>({
      bottom:document.querySelector("#chart-stage").getBoundingClientRect().bottom,
      height:innerHeight,rail:document.querySelector(".controls-rail").getBoundingClientRect().right,
      left:document.querySelector("#chart-stage").getBoundingClientRect().left
    }));
    assert.ok(desktop.bottom<=desktop.height+4&&desktop.rail<=desktop.left);
    fs.mkdirSync("test-artifacts",{recursive:true});
    await page.screenshot({path:"test-artifacts/week06-fitted-model.png",fullPage:false});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
    await page.screenshot({path:"test-artifacts/week06-fitted-mobile.png",fullPage:true});
    assert.deepEqual(errors,[],"No browser exceptions");
    onSimulator=false;
    await page.locator(".lab-home").click();
    await page.waitForURL(/\/(#week-05)?$/);
    console.log("PASS: fitted baseline, shock response, empirical intervals, RMSE table, chart switching, calendar axes and mobile.");
  }finally{
    if(browser)await browser.close();
    server.kill("SIGTERM");
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
