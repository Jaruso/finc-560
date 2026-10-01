/* Full browser checks with test-only normalized annual financial fixture.
   SEC refresh is validated independently by its scheduled retrieval job. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const {spawn}=require("node:child_process");
const {chromium}=require("playwright");
const {fixture}=require("./week06_company_fixture.cjs");
const base="http://127.0.0.1:8788";
async function waitServer(){
  for(let i=0;i<55;i++){
    try{if((await fetch(base+"/week-06/")).ok)return;}catch{}
    await new Promise(r=>setTimeout(r,200));
  }
  throw Error("Local preview not available");
}
async function slide(page,id,value){
  await page.$eval(id,(node,next)=>{
    node.value=String(next);
    node.dispatchEvent(new Event("input",{bubbles:true}));
    node.dispatchEvent(new Event("change",{bubbles:true}));
  },value);
}
(async()=>{
  const server=spawn("python3",["-m","http.server","8788",
    "--bind","127.0.0.1","--directory","docs"],{stdio:"ignore"});
  let browser;
  try{
    await waitServer();
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:900},
      reducedMotion:"no-preference"});
    const errors=[];
    let onCompany=false;
    page.on("pageerror",e=>{if(onCompany)errors.push(e.message);});
    await page.route("https://cdn.plot.ly/**",route=>route.fulfill({
      path:require.resolve("plotly.js-dist-min"),
      contentType:"application/javascript"
    }));
    const symbols=["MSFT","AAPL","HD","CAT"];
    await page.route("**/week-06/companies/data/*.json",route=>{
      const ticker=route.request().url().match(/\/([A-Z]+)\.json$/)?.[1];
      const d=fixture(ticker);
      if(ticker==="AAPL"){
        d.annual.forEach(r=>{
          r.revenue_musd*=1.7;r.operating_income_musd*=1.5;r.net_income_musd*=1.4;
        });
        d.company="Another Test Corporation";
      }
      return route.fulfill({json:d});
    });
    await page.route("**/week-06/companies/data/manifest.json",route=>route.fulfill({
      json:{schema_version:1,status:"ready",retrieved_utc:"2026-09-29T00:00:00+00:00",
        companies:symbols.map(t=>({
          ticker:t,company:t,file:"data/"+t+".json",latest_fiscal_end:"2025-06-30"
        }))}
    }));
    // Existing Treasury dashboard must remain functional and the page-to-
    // page nav should require no verbose onboarding or extra giant heading.
    await page.goto(base+"/week-06/",{waitUntil:"domcontentloaded"});
    assert.equal(await page.locator(".hero").count(),0);
    assert.deepEqual(await page.locator(".workspaces a").allTextContents(),
      ["Macro","Equities"]);
    assert.equal(await page.locator(
      ".week-06-header > .workspaces + .source-stamp + .course-side").count(),1);
    const macroCenter=await page.locator(".workspaces").evaluate(n=>{
      const r=n.getBoundingClientRect();return r.x+r.width/2;
    });
    assert.ok(Math.abs(macroCenter-720)<1,
      "Macro tab switch must be horizontally centered regardless of page");
    assert.equal(await page.locator(".workspaces [aria-current=page]").textContent(),"Macro");
    await page.locator(".workspaces a").nth(1).click();
    await page.waitForURL("**/week-06/companies/");
    onCompany=true;
    await page.waitForFunction(()=>document.querySelector("#ticker")?.disabled===false)
      .catch(async error => {
        throw new Error("Ticker failed to load: "+
          await page.locator("#data-error").textContent()+"; "+error.message);
      });
    await page.waitForFunction(()=>document.querySelector("#company-chart")?.data?.length===2 &&
      document.querySelector("#company-chart")?.data?.[0]?.x?.length===5 &&
      document.querySelector("#company-chart")?.data?.[1]?.x?.length===4);
    assert.equal(await page.locator(".company-timeline").count(),1);
    assert.equal(await page.locator("#history-chart, #projection-chart").count(),0);
    assert.equal(await page.locator(".workspaces [aria-current=page]").textContent(),"Equities");
    assert.equal(await page.locator(".hero").count(),0,
      "Company forecasts title must stay removed");
    const equitiesCenter=await page.locator(".workspaces").evaluate(n=>{
      const r=n.getBoundingClientRect();return r.x+r.width/2;
    });
    assert.ok(Math.abs(equitiesCenter-macroCenter)<1,
      "Workspace tabs must not move when switching dashboards");
    assert.equal(await page.locator(
      ".company-header > .workspaces + .source-stamp + .course-side").count(),1,
      "Annual financial reports must appear between workspace tabs and course label");
    assert.match(await page.locator(".company-header .source-stamp").textContent(),
      /Annual financial reports.*FY ending 2025-06-30.*(Verified annual snapshot|SEC refreshed)/s);
    assert.equal(await page.locator("#data-error").isVisible(),false,
      "Rendering a forecast must not show the old undefined .catch error");
    assert.equal(await page.locator("#ticker option").count(),4);
    assert.equal(await page.locator("#ticker").inputValue(),"MSFT");

    const first=await page.evaluate(()=>{
      const g=document.querySelector("#company-chart");
      return {
        actual:{x:g.data[0].x,y:g.data[0].y,name:g.data[0].name},
        forecast:{x:g.data[1].x,y:g.data[1].y,name:g.data[1].name},
        axes:Object.keys(g.layout).filter(k=>(k.startsWith("xaxis")&&k!=="xaxis")||(k.startsWith("yaxis")&&k!=="yaxis")),
        xaxis:g.layout.xaxis, yaxis:g.layout.yaxis,
        shapes:g.layout.shapes,annotations:g.layout.annotations,
        meta:g.layout.meta,
        yRange:g.layout.yaxis.range.slice(),
        historicalPixel:g._fullLayout.yaxis.l2p(g.data[0].y.at(-1)),
      plotHeight:g._fullLayout._size.h,
      plotMargin:g._fullLayout.margin,
      };
    });
    assert.deepEqual(first.axes,[],"One Plotly x-axis and one y-axis only");
    assert.equal(first.meta.singleChart,true);
    assert.equal(first.meta.continuousCalendar,true);
    assert.equal(first.meta.unit,"USD billions");
    assert.equal(first.actual.x.at(-1),first.forecast.x[0],
      "Projection must touch the final historical point on the same date axis");
    assert.equal(first.actual.y.at(-1),first.forecast.y[0],
      "Dashed forecast must join the solid reported series at the final value");
    assert.deepEqual(first.xaxis.range,[first.actual.x[0],first.forecast.x.at(-1)]);
    assert.ok(first.meta.cutoffFraction>.55&&first.meta.cutoffFraction<.60,
      "Historical/projection widths reflect elapsed years, not an arbitrary 50/50");
    assert.equal(first.shapes.length,2,"Future shading and one cutoff divider");
    assert.equal(first.shapes[1].x0,first.forecast.x[0]);
    assert.equal(first.shapes[1].x1,first.forecast.x[0]);
    assert.deepEqual(first.annotations.map(a=>a.text),
      ["<b>REPORTED</b>","<b>FORECAST</b>"]);
    assert.equal(first.actual.name,"Reported");
    assert.equal(first.forecast.name,"Model forecast");
    assert.ok(first.forecast.y.at(-1)>first.forecast.y[0]);
    const baseline=first.forecast.y.at(-1);
    const priorProfit=await page.locator("#kpi-forecast-profit").textContent();

    await slide(page,"#growth",10);
    await page.waitForFunction(old=>{
      const g=document.querySelector("#company-chart");
      return g?.data?.length===3 && g.data[2].y.at(-1)>old;
    },baseline);
    const changed=await page.locator("#company-chart").evaluate(g=>({
      historical:g.data[0].y,
      projected:g.data[2].y.at(-1),
      baseline:g.data[1].y.at(-1),
      names:g.data.map(d=>d.name),
      boundary:g.layout.meta.cutoffFraction,
      yRange:g.layout.yaxis.range.slice(),
      historicalPixel:g._fullLayout.yaxis.l2p(g.data[0].y.at(-1)),
      plotHeight:g._fullLayout._size.h,
      plotMargin:g._fullLayout.margin
    }));
    assert.deepEqual(changed.historical,first.actual.y,
      "Input dials cannot change audited historical observations");
    assert.equal(changed.baseline,baseline,
      "Unadjusted baseline must remain available for comparison");
    assert.ok(changed.names.includes("Unadjusted baseline"));
    assert.equal(changed.names[2],"Adjusted scenario");
    assert.deepEqual(changed.boundary,first.meta.cutoffFraction,
      "Changing financial assumptions cannot move the historical boundary");
    assert.notEqual(await page.locator("#kpi-forecast-profit").textContent(),priorProfit);
    assert.equal(await page.locator("#data-error").isVisible(),false,
      "Slider updates must not show the former undefined .catch banner");
    assert.deepEqual(changed.yRange,first.yRange,
      "Growth dial must not change the historical financial y-scale");
    assert.ok(Math.abs(changed.historicalPixel-first.historicalPixel)<.001,
      "Reported observations cannot move vertically as growth assumptions change; "+
      JSON.stringify({before:{pixel:first.historicalPixel,height:first.plotHeight,margin:first.plotMargin},
                      after:{pixel:changed.historicalPixel,height:changed.plotHeight,margin:changed.plotMargin}}));
    assert.equal(await page.locator("#fit-company-projection").textContent(),"Fit projection");
    assert.equal(await page.locator("#fit-company-projection").isEnabled(),true);

    await page.selectOption("#metric","net");
    await page.waitForFunction(()=>
      document.querySelector("#company-chart")?.layout?.meta?.measure==="net" &&
      document.querySelector("#chart-heading")?.textContent==="Net income");
    const netInitial=await page.locator("#company-chart").evaluate(g=>({
      range:g.layout.yaxis.range.slice(),
      hist:g.data[0].y.slice(),forecast:g.data.at(-1).y.at(-1)
    }));
    const revenueAfterGrowth=await page.locator("#kpi-forecast-revenue").textContent();
    const profitAfterGrowth=await page.locator("#kpi-forecast-profit").textContent();
    await slide(page,"#margin",4);
    await page.waitForFunction(old=>document.querySelector("#kpi-forecast-profit").textContent!==old,profitAfterGrowth);
    assert.equal(await page.locator("#kpi-forecast-revenue").textContent(),revenueAfterGrowth,
      "Margin dial must not silently change revenue");
    await page.waitForFunction(previous=>{
      const g=document.querySelector("#company-chart");
      return g?.data?.length===3 && g.data[2].y.at(-1)!==previous;
    },netInitial.forecast);
    const netAfterMargin=await page.locator("#company-chart").evaluate(g=>({
      range:g.layout.yaxis.range.slice(),history:g.data[0].y.slice()
    }));
    assert.deepEqual(netAfterMargin.range,netInitial.range,
      "Margin dial must not move the net-income historical y-scale");
    assert.deepEqual(netAfterMargin.history,netInitial.hist);
    await page.selectOption("#method","linear");
    await page.waitForFunction(()=>document.querySelector("#model-note")?.textContent.includes("OLS"));
    await page.selectOption("#horizon","1");
    await page.waitForFunction(()=>
      document.querySelector("#company-chart")?.data?.at(-1)?.x.length===2);
    const shorter=await page.locator("#company-chart").evaluate(g=>({
      fraction:g.layout.meta.cutoffFraction,range:g.layout.xaxis.range,
      observedEnd:g.data[0].x.at(-1),futureStart:g.data.at(-1).x[0],
      futureEnd:g.data.at(-1).x.at(-1)
    }));
    assert.ok(shorter.fraction>.78&&shorter.fraction<.82,
      "Shorter projection must consume less chronological width");
    assert.equal(shorter.observedEnd,shorter.futureStart);
    assert.equal(shorter.futureEnd,shorter.range[1]);
    await page.selectOption("#history","all");
    await page.waitForFunction(()=>
      document.querySelector("#company-chart")?.data?.[0]?.x?.length===7);
    const longerHistory=await page.locator("#company-chart").evaluate(g=>g.layout.meta.cutoffFraction);
    assert.ok(longerHistory>shorter.fraction,
      "Expanding observation window shifts boundary right on the same scale");
    assert.match(await page.locator("#backtest").textContent(),/historical one-year origins/);

    await page.selectOption("#ticker","AAPL");
    await page.waitForFunction(()=>document.querySelector("#company-name")?.textContent==="Another Test Corporation");
    assert.notEqual(await page.locator("#kpi-revenue").textContent(),"—");
    assert.equal(await page.locator("#source-period").textContent(),"FY ending 2025-06-30");
    assert.equal(await page.locator("#data-error").isVisible(),false,
      "Switching companies must retain a clean error-free dashboard");
    await page.locator("#reset").click();
    await page.waitForFunction(()=>document.querySelector("#growth-value")?.textContent==="0 pp");
    assert.equal(await page.locator("#method").inputValue(),"cagr");
    assert.equal(await page.locator("#horizon").inputValue(),"3");
    assert.equal(await page.locator("#metric").inputValue(),"revenue");
    assert.equal(await page.locator("#ticker").inputValue(),"AAPL");
    assert.equal(await page.locator("#history").inputValue(),"5");
    await page.waitForFunction(()=>
      document.querySelector("#company-chart")?.data?.length===2 &&
      document.querySelector("#company-chart")?.data?.[1]?.x.length===4);
    assert.equal(await page.locator(".company-timeline").count(),1);
    const defaultRange=await page.locator("#company-chart").evaluate(g=>
      g.layout.yaxis.range.slice());
    // Extreme adjustments may exceed the scale, but must never silently
    // squeeze history. Fit projection is the explicit exception.
    await slide(page,"#growth",20);
    await page.waitForFunction(()=>document.querySelector("#company-chart")
      ?.layout?.meta?.projectionClipped===true);
    assert.deepEqual(await page.locator("#company-chart").evaluate(g=>
      g.layout.yaxis.range.slice()),defaultRange);
    assert.equal(await page.locator("#fit-company-projection").textContent(),"Fit projection");
    await page.locator("#fit-company-projection").click();
    await page.waitForFunction(()=>document.querySelector("#company-chart")
      ?.layout?.meta?.yScale==="manual-locked");
    const fittedRange=await page.locator("#company-chart").evaluate(g=>
      g.layout.yaxis.range.slice());
    assert.ok(fittedRange[1]>defaultRange[1],
      "Only an explicit Fit projection click may enlarge the vertical scale");
    await slide(page,"#growth",15);
    await page.waitForFunction(()=>document.querySelector("#company-chart")
      ?.layout?.meta?.projectionClipped===false);
    assert.deepEqual(await page.locator("#company-chart").evaluate(g=>
      g.layout.yaxis.range.slice()),fittedRange,
      "Dials cannot silently modify a manually fitted axis either");
    await slide(page,"#growth",0);
    await page.waitForFunction(()=>document.querySelector("#fit-company-projection")
      ?.textContent==="Restore scale");
    await page.locator("#fit-company-projection").click();
    await page.waitForFunction(()=>document.querySelector("#company-chart")
      ?.layout?.meta?.yScale==="baseline-locked");
    assert.deepEqual(await page.locator("#company-chart").evaluate(g=>
      g.layout.yaxis.range.slice()),defaultRange);

    const layout=await page.evaluate(()=>({
      bottom:document.querySelector(".company-timeline").getBoundingClientRect().bottom,
      height:innerHeight,
      left:document.querySelector(".controls-rail").getBoundingClientRect().right,
      right:document.querySelector(".analysis-pane").getBoundingClientRect().left,
      scroll:document.documentElement.scrollWidth,
      width:innerWidth
    }));
    assert.ok(layout.bottom<=layout.height+4,"Dashboard should fit on one desktop screen");
    assert.ok(layout.left<=layout.right,"Controls stay beside the graphs");
    assert.ok(layout.scroll<=layout.width+2);
    fs.mkdirSync("test-artifacts",{recursive:true});
    await page.screenshot({path:"test-artifacts/week06-company-dashboard.png",fullPage:false});
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>
      document.querySelector("#company-chart")?.data?.length===2);
    const mobile=await page.evaluate(()=>({
      scroll:document.documentElement.scrollWidth,width:innerWidth,
      plots:document.querySelectorAll(".company-timeline .js-plotly-plot").length,
      cardWidth:document.querySelector(".company-timeline").getBoundingClientRect().width,
      meta:document.querySelector("#company-chart").layout.meta
    }));
    assert.ok(mobile.scroll<=mobile.width+2,"No horizontal mobile overflow");
    assert.equal(mobile.plots,1,"Mobile also presents one continuous chart");
    assert.equal(mobile.meta.singleChart,true);
    assert.ok(mobile.cardWidth<=mobile.width);
    const mobileTabCenter=await page.locator(".workspaces").evaluate(n=>{
      const r=n.getBoundingClientRect();return r.x+r.width/2;
    });
    assert.ok(Math.abs(mobileTabCenter-195)<1,
      "Workspace switch must also stay centered on mobile");
    assert.equal(await page.locator(".week-06-header .source-stamp").isVisible(),true);
    await page.screenshot({path:"test-artifacts/week06-company-mobile.png",fullPage:true});
    assert.deepEqual(errors,[],"No uncaught browser errors");
    onCompany=false;
    await page.locator(".workspaces a").first().click();
    await page.waitForURL("**/week-06/");
    assert.equal(await page.locator(".workspaces [aria-current=page]").textContent(),"Macro");
    console.log("PASS: two compact workspace tabs, browser-calculated model, source switch, "+
      "one continuous chronological company chart and mobile.");
  }finally{
    if(browser)await browser.close();
    server.kill("SIGTERM");
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
