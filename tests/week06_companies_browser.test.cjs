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
async function waitGraph(page,id,length){
  await page.waitForFunction(({id,length})=>{
    const chart=document.querySelector(id);
    return chart?.data?.length===1 && chart.data[0].x.length===length;
  },{id,length});
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
    assert.equal(await page.locator(".hero h1").textContent(),"Treasury yields");
    assert.deepEqual(await page.locator(".workspaces a").allTextContents(),
      ["Macro","Companies"]);
    assert.equal(await page.locator(".workspaces [aria-current=page]").textContent(),"Macro");
    await page.locator(".workspaces a").nth(1).click();
    await page.waitForURL("**/week-06/companies/");
    onCompany=true;
    await page.waitForFunction(()=>document.querySelector("#ticker")?.disabled===false)
      .catch(async error => {
        throw new Error("Ticker failed to load: "+
          await page.locator("#data-error").textContent()+"; "+error.message);
      });
    await page.waitForFunction(()=>document.querySelector("#history-chart")?.data?.[0]?.x?.length===5);
    await page.waitForFunction(()=>document.querySelector("#projection-chart")?.data?.[0]?.x?.length===4);
    assert.equal(await page.locator(".workspaces [aria-current=page]").textContent(),"Companies");
    assert.equal(await page.locator(".hero h1").textContent(),"Company forecasts");
    assert.equal(await page.locator("#ticker option").count(),4);
    assert.equal(await page.locator("#ticker").inputValue(),"MSFT");

    const first=await page.evaluate(()=>({
      historical:document.querySelector("#history-chart").data[0],
      projected:document.querySelector("#projection-chart").data[0],
      hY:document.querySelector("#history-chart").layout.yaxis.range,
      pY:document.querySelector("#projection-chart").layout.yaxis.range,
      hX:document.querySelector("#history-chart").data[0].x,
      pX:document.querySelector("#projection-chart").data[0].x,
      columns:document.querySelector("#company-charts").style.gridTemplateColumns
    }));
    assert.deepEqual(first.hY,first.pY,"Historical and forward charts must share dollar scale");
    assert.equal(first.pX[0],first.hX.at(-1),"Projection connects to final reported fiscal year");
    assert.equal(first.historical.y.at(-1),first.projected.y[0]);
    assert.ok(first.columns.includes("4fr")&&first.columns.includes("3fr"),
      "Two graphs sized to their elapsed years instead of arbitrary equal widths");
    assert.ok(first.projected.y.at(-1)>first.projected.y[0]);
    const baseline=first.projected.y.at(-1);
    const priorProfit=await page.locator("#kpi-forecast-profit").textContent();

    await slide(page,"#growth",10);
    await page.waitForFunction(old=>
      document.querySelector("#projection-chart")?.data?.at(-1)?.y?.at(-1)>old,baseline);
    const changed=await page.evaluate(()=>({
      historical:document.querySelector("#history-chart").data[0].y,
      projected:document.querySelector("#projection-chart").data.at(-1).y.at(-1),
      names:document.querySelector("#projection-chart").data.map(d=>d.name)
    }));
    assert.deepEqual(changed.historical,first.historical.y);
    assert.ok(changed.names.includes("Unadjusted baseline"));
    assert.notEqual(await page.locator("#kpi-forecast-profit").textContent(),priorProfit);

    await page.selectOption("#metric","net");
    await page.waitForFunction(()=>document.querySelector("#history-chart")?.data?.[0]?.name==="Net income as reported");
    const revenueAfterGrowth=await page.locator("#kpi-forecast-revenue").textContent();
    const profitAfterGrowth=await page.locator("#kpi-forecast-profit").textContent();
    await slide(page,"#margin",4);
    await page.waitForFunction(old=>document.querySelector("#kpi-forecast-profit").textContent!==old,profitAfterGrowth);
    assert.equal(await page.locator("#kpi-forecast-revenue").textContent(),revenueAfterGrowth,
      "Margin dial must not silently change revenue");
    await page.selectOption("#method","linear");
    await page.waitForFunction(()=>document.querySelector("#model-note")?.textContent.includes("OLS"));
    await page.selectOption("#horizon","1");
    await page.waitForFunction(()=>document.querySelector("#projection-chart")?.data?.at(-1)?.x?.length===2);
    assert.ok((await page.locator("#company-charts").getAttribute("style")).includes("1fr"));
    await page.selectOption("#history","all");
    await page.waitForFunction(()=>document.querySelector("#history-chart")?.data?.[0]?.x?.length===7);
    assert.match(await page.locator("#backtest").textContent(),/historical one-year origins/);

    await page.selectOption("#ticker","AAPL");
    await page.waitForFunction(()=>document.querySelector("#company-name")?.textContent==="Another Test Corporation");
    assert.notEqual(await page.locator("#kpi-revenue").textContent(),"—");
    assert.equal(await page.locator("#source-period").textContent(),"FY ending 2025-06-30");
    await page.locator("#reset").click();
    await page.waitForFunction(()=>document.querySelector("#growth-value")?.textContent==="+0 pp");
    assert.equal(await page.locator("#method").inputValue(),"cagr");
    assert.equal(await page.locator("#horizon").inputValue(),"3");
    assert.equal(await page.locator("#metric").inputValue(),"revenue");
    assert.equal(await page.locator("#ticker").inputValue(),"AAPL");
    assert.equal(await page.locator("#history").inputValue(),"5");
    await page.waitForFunction(()=>document.querySelector("#projection-chart")?.data?.length===1);

    const layout=await page.evaluate(()=>({
      bottom:document.querySelector("#company-charts").getBoundingClientRect().bottom,
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
    const mobile=await page.evaluate(()=>({
      scroll:document.documentElement.scrollWidth,width:innerWidth,
      cards:[...document.querySelectorAll(".company-chart-pair > .chart-card")]
        .map(c=>c.getBoundingClientRect())
    }));
    assert.ok(mobile.scroll<=mobile.width+2,"No horizontal mobile overflow");
    assert.ok(mobile.cards[1].top>=mobile.cards[0].bottom-1,"Mobile charts stack");
    await page.screenshot({path:"test-artifacts/week06-company-mobile.png",fullPage:true});
    assert.deepEqual(errors,[],"No uncaught browser errors");
    onCompany=false;
    await page.locator(".workspaces a").first().click();
    await page.waitForURL("**/week-06/");
    assert.equal(await page.locator(".workspaces [aria-current=page]").textContent(),"Macro");
    console.log("PASS: two compact workspace tabs, browser-calculated model, source switch, "+
      "financially linked historical/projection panels and mobile.");
  }finally{
    if(browser)await browser.close();
    server.kill("SIGTERM");
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
