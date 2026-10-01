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
    const marketCalls=[];
    let marketUnavailable=false;
    let limitNvdaFinancialsOnce=true;
    await page.route("https://finc-560-finnhub.joseph-caruso-pc.workers.dev/quote?*",route=>{
      const request=route.request();
      const parsed=new URL(request.url());
      assert.deepEqual([...parsed.searchParams.keys()],["symbol"],"Only a public ticker is sent to the Worker");
      assert.equal(request.headers().authorization,undefined,"Never send a browser-side access credential");
      const ticker=parsed.searchParams.get("symbol");
      marketCalls.push(ticker);
      if(marketUnavailable)return route.fulfill({
        status:429,headers:{"access-control-allow-origin":"*"},
        json:{error:"Too many requests"}
      });
      return route.fulfill({
        headers:{"access-control-allow-origin":"*"},
        json:{c:ticker==="AAPL"?245.67:123.45,
          d:ticker==="AAPL"?-1.23:2.55,dp:ticker==="AAPL"?-0.5:2.11,t:1790812740}
      });
    });
    // Mock all public Finnhub routes. No real secret or live API dependency in CI.
    await page.route("https://finc-560-finnhub.joseph-caruso-pc.workers.dev/profile?*",route=>{
      const ticker=new URL(route.request().url()).searchParams.get("symbol");
      assert.equal(route.request().headers().authorization,undefined);
      return route.fulfill({headers:{"access-control-allow-origin":"*"},json:{
        name:ticker==="NVDA"?"Research Example Corporation":
          ticker==="MTMCF"?"International Research Example":ticker,
        ticker:ticker==="MTMCF"?"MTM.AX":ticker,
        country:ticker==="MTMCF"?"AU":"US",
        exchange:ticker==="MTMCF"?"ASX":"NASDAQ",
        currency:ticker==="MTMCF"?"AUD":"USD",
        finnhubIndustry:ticker==="MTMCF"?"Metals and mining":"Technology",
        shareOutstanding:15000,marketCapitalization:2000000
      }});
    });
    await page.route("https://finc-560-finnhub.joseph-caruso-pc.workers.dev/metrics?*",route=>
      route.fulfill({headers:{"access-control-allow-origin":"*"},
        json:{metric:{beta:1.15,peBasicExclExtraTTM:22.5,currentRatioAnnual:1.42}}}));
    await page.route("https://finc-560-finnhub.joseph-caruso-pc.workers.dev/financials?*",route=>{
      const ticker=new URL(route.request().url()).searchParams.get("symbol");
      if(ticker==="NVDA"&&limitNvdaFinancialsOnce){
        limitNvdaFinancialsOnce=false;
        return route.fulfill({status:429,
          headers:{"access-control-allow-origin":"*","Retry-After":"60"},
          json:{error:"Too many requests",source:"gateway"}});
      }
      if(!["NVDA","CASH","STRESS"].includes(ticker))return route.fulfill({
        headers:{"access-control-allow-origin":"*"},
        json:{symbol:ticker,cik:ticker==="MTMCF"?"":1234567,data:[]}
      });
      const d=fixture("NVDA");
      const data=d.annual.map((r,i)=>({
        year:2019+i,endDate:r.fiscal_end+" 00:00:00",
        startDate:r.fiscal_start+" 00:00:00",
        filedDate:(2019+i)+"-08-01 00:00:00",
        acceptedDate:(2019+i)+"-08-01 16:42:19",
        accessNumber:"0000123456-"+String(2019+i).slice(-2)+"-000001",form:"10-K",
        report:{
          ic:[
            {concept:"us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax",unit:"USD",value:r.revenue_musd*1e6},
            {concept:"us-gaap_OperatingIncomeLoss",unit:"USD",value:r.operating_income_musd*1e6},
            {concept:"us-gaap_NetIncomeLoss",unit:"USD",value:r.net_income_musd*1e6},
            {concept:"us-gaap_InterestExpenseNonOperating",unit:"USD",value:2300e6}
          ],
          // CASH lacks debt disclosures; STRESS has debt but lacks a
          // cash balance. This exercises one/two/three visible panel states.
          bs:[
            ...(ticker==="STRESS"?[]:
              [{concept:"us-gaap_CashAndCashEquivalentsAtCarryingValue",unit:"USD",value:20000e6}]),
            ...(ticker==="CASH"?[]:[
              {concept:"us-gaap_LongTermDebtCurrent",unit:"USD",value:12000e6},
              {concept:"us-gaap_LongTermDebtNoncurrent",unit:"USD",value:75000e6}
            ])
          ],
          cf:[
            {concept:"us-gaap_NetCashProvidedByUsedInOperatingActivities",unit:"USD",value:26000e6},
            {concept:"us-gaap_PaymentsToAcquirePropertyPlantAndEquipment",unit:"USD",value:5500e6},
            {concept:"us-gaap_DepreciationDepletionAndAmortization",unit:"USD",value:3400e6}
          ]
        }
      }));
      return route.fulfill({headers:{"access-control-allow-origin":"*"},
        json:{symbol:ticker,cik:123456,data}});
    });
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
      ["Bonds","Equities","Commodities"]);
    assert.equal(await page.locator(
      ".week-06-header > .workspaces + .source-stamp + .course-side").count(),1);
    const macroCenter=await page.locator(".workspaces").evaluate(n=>{
      const r=n.getBoundingClientRect();return r.x+r.width/2;
    });
    assert.ok(Math.abs(macroCenter-720)<1,
      "Macro tab switch must be horizontally centered regardless of page");
    assert.equal(await page.locator(".workspaces [aria-current=page]").textContent(),"Bonds");
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
    assert.equal(await page.locator("#controls-heading").textContent(),"Forecast controls");
    const help=page.locator(".model-help");
    assert.equal(await help.locator("summary").getAttribute("aria-label"),
      "Explain revenue forecast models");
    assert.equal(await help.locator(".model-help-panel").isVisible(),false,
      "Expanded model methodology must stay hidden until explicitly requested");
    await help.locator("summary").click();
    assert.equal(await help.locator(".model-help-panel").isVisible(),true,
      "Info button opens the revenue model explainer");
    const methodology=await help.locator(".model-help-panel").textContent();
    for(const phrase of ["Historical CAGR","compound annual growth rate",
      "Linear trend","ordinary least squares","fixed dollar change",
      "percentage-point adjustment","recency-weighted","Neither is an analyst consensus"]){
      assert.ok(methodology.includes(phrase),phrase);
    }
    await help.locator("summary").click();
    assert.equal(await help.locator(".model-help-panel").isVisible(),false);
    assert.equal(await page.locator("#method").inputValue(),"cagr");
    assert.equal(await page.locator("#reset").textContent(),"Reset");
    const equityHeading=await page.locator(".forecast-heading").evaluate(n=>{
      const title=n.querySelector("h2").getBoundingClientRect();
      const reset=n.querySelector("#reset").getBoundingClientRect();
      const wrapper=n.getBoundingClientRect();
      return {titleWidth:title.width,containerWidth:wrapper.width,
        titleBottom:title.bottom,resetTop:reset.top};
    });
    assert.ok(equityHeading.titleWidth>equityHeading.containerWidth-2);
    assert.ok(equityHeading.resetTop>=equityHeading.titleBottom);
    assert.equal(await page.locator(".controls .eyebrow").count(),0);
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
    assert.equal(await page.locator("#metric").inputValue(),"net");
    assert.equal(await page.locator("#chart-heading").textContent(),"Net income");
    assert.equal(await page.locator("#revenue-margin-guidance").isHidden(),true);
    await page.waitForFunction(()=>document.querySelector("#quote-price")?.textContent==="$123.45");
    assert.equal(await page.locator("#quote-change").textContent(),"+$2.55 (+2.11%)");
    assert.match(await page.locator("#quote-status").textContent(),/Finnhub.*May be delayed/);
    assert.deepEqual(marketCalls,["MSFT"],"Initial market quote is fetched once");

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
    assert.deepEqual(first.annotations,[],
      "Projection shading stays, but remove REPORTED/FORECAST labels above the graph");
    assert.equal(first.actual.name,"Reported (solid)");
    assert.equal(first.forecast.name,"Model forecast (dashed)");
    const cleanHover=await page.locator("#company-chart").evaluate(g=>
      g.data.map(trace=>trace.hovertemplate));
    assert.ok(cleanHover.every(template=>template.includes("<extra></extra>") &&
      !template.includes("Browser model") && !template.includes("Unadjusted model")),
      "Line hover shows only fiscal year and value without any separate model-label box");
    const standardLegend=await page.locator("#company-chart").evaluate(g=>
      g.data.filter(t=>t.showlegend!==false).map(t=>({name:t.name,dash:t.line?.dash||"solid"})));
    assert.deepEqual(standardLegend,[
      {name:"Reported (solid)",dash:"solid"},
      {name:"Model forecast (dashed)",dash:"dash"}
    ]);
    assert.ok(first.forecast.y.at(-1)>first.forecast.y[0]);
    const baseline=first.forecast.y.at(-1);
    const priorProfit=await page.locator("#kpi-forecast-profit").textContent();
    const initialRevenueKpi=await page.locator("#kpi-forecast-revenue").textContent();
    // With Net income selected by default, profit margin MUST move the graph,
    // while historical values and chart geometry remain fixed.
    await slide(page,"#margin",2);
    await page.waitForFunction(previous=>{
      const g=document.querySelector("#company-chart");
      return g?.data?.length===3 && g.layout?.meta?.measure==="net" &&
        g.data[2].y.at(-1)>previous;
    },first.forecast.y.at(-1));
    const marginPreview=await page.locator("#company-chart").evaluate(g=>({
      historical:g.data[0].y.slice(),
      adjusted:g.data[2].y.at(-1),
      baseline:g.data[1].y.at(-1),
      yRange:g.layout.yaxis.range.slice(),
      pixel:g._fullLayout.yaxis.l2p(g.data[0].y.at(-1))
    }));
    assert.deepEqual(marginPreview.historical,first.actual.y);
    assert.equal(marginPreview.baseline,first.forecast.y.at(-1));
    assert.deepEqual(marginPreview.yRange,first.yRange);
    assert.ok(Math.abs(marginPreview.pixel-first.historicalPixel)<.001);
    assert.equal(await page.locator("#kpi-forecast-revenue").textContent(),initialRevenueKpi);
    assert.notEqual(await page.locator("#kpi-forecast-profit").textContent(),priorProfit);
    await slide(page,"#margin",0);
    await page.waitForFunction(expected=>{
      const g=document.querySelector("#company-chart");
      return g?.data?.length===2 && Math.abs(g.data[1].y.at(-1)-expected)<1e-8;
    },first.forecast.y.at(-1));

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
    assert.ok(changed.names.includes("Unadjusted baseline (dotted)"));
    assert.equal(changed.names[2],"Adjusted scenario (dashed)");
    const adjustedLegend=await page.locator("#company-chart").evaluate(g=>
      g.data.filter(t=>t.showlegend!==false).map(t=>({name:t.name,dash:t.line?.dash||"solid"})));
    assert.deepEqual(adjustedLegend,[
      {name:"Reported (solid)",dash:"solid"},
      {name:"Unadjusted baseline (dotted)",dash:"dot"},
      {name:"Adjusted scenario (dashed)",dash:"dash"}
    ]);
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

    assert.equal(await page.locator("#metric").inputValue(),"net");
    assert.equal(await page.locator("#chart-heading").textContent(),"Net income");
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

    // Revenue must remain independent of margin assumptions. Provide a
    // deliberate one-click path to the affected earnings measure.
    await page.selectOption("#metric","revenue");
    await page.waitForFunction(()=>
      document.querySelector("#company-chart")?.layout?.meta?.measure==="revenue");
    assert.equal(await page.locator("#revenue-margin-guidance").isVisible(),true);
    assert.match(await page.locator("#revenue-margin-guidance").textContent(),
      /Profit-margin adjustments change projected earnings, not revenue/);
    const revenueBefore=await page.locator("#company-chart").evaluate(g=>({
      history:g.data[0].y.slice(),projected:g.data.at(-1).y.slice(),
      yRange:g.layout.yaxis.range.slice()
    }));
    const profitBefore=await page.locator("#kpi-forecast-profit").textContent();
    await slide(page,"#margin",5);
    await page.waitForFunction(prior=>
      document.querySelector("#kpi-forecast-profit")?.textContent!==prior,
      profitBefore);
    assert.equal(await page.locator("#margin-value").textContent(),"+5 pp");
    const revenueAfter=await page.locator("#company-chart").evaluate(g=>({
      history:g.data[0].y.slice(),projected:g.data.at(-1).y.slice(),
      yRange:g.layout.yaxis.range.slice()
    }));
    assert.deepEqual(revenueAfter,revenueBefore,
      "Revenue and its axis must remain unchanged when only margins change");
    assert.equal(await page.locator("#revenue-margin-guidance").isVisible(),true);
    await page.locator("#view-profit-impact").click();
    await page.waitForFunction(()=>
      document.querySelector("#company-chart")?.layout?.meta?.measure==="net" &&
      document.querySelector("#chart-heading")?.textContent==="Net income");
    assert.equal(await page.locator("#metric").inputValue(),"net");
    assert.equal(await page.locator("#revenue-margin-guidance").isHidden(),true);
    assert.equal(await page.locator("#data-error").isVisible(),false);

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
    await page.waitForFunction(()=>document.querySelector("#quote-price")?.textContent==="$245.67");
    assert.equal(await page.locator("#quote-change").textContent(),"−$1.23 (−0.50%)");
    assert.deepEqual(marketCalls,["MSFT","AAPL"],"Company switch fetches its own quote");
    assert.notEqual(await page.locator("#kpi-revenue").textContent(),"—");
    assert.equal(await page.locator("#source-period").textContent(),"FY ending 2025-06-30");
    assert.equal(await page.locator("#data-error").isVisible(),false,
      "Switching companies must retain a clean error-free dashboard");
    await page.locator("#reset").click();
    await page.waitForFunction(()=>document.querySelector("#growth-value")?.textContent==="0 pp");
    assert.equal(await page.locator("#method").inputValue(),"cagr");
    assert.equal(await page.locator("#horizon").inputValue(),"3");
    assert.equal(await page.locator("#metric").inputValue(),"net");
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
    // A Finnhub outage must not suppress previously loaded annual forecasts.
    marketUnavailable=true;
    await page.locator("#quote-refresh").click();
    await page.waitForFunction(()=>document.querySelector("#quote-status")?.textContent.includes("limited"));
    assert.equal(await page.locator("#data-error").isVisible(),false);
    assert.ok(await page.locator("#company-chart").evaluate(g=>g.data?.length>=2),
      "Market-quote failure may not break the SEC-backed financial forecast");
    marketUnavailable=false;
    // Real-world case: an international issuer has a valid market quote and
    // company profile but the US SEC as-reported endpoint returns no CIK/data.
    await page.locator("#custom-ticker").fill("MTMCF");
    await page.locator("#symbol-form button").click();
    await page.waitForFunction(()=>document.querySelector("#company-empty-title")
      ?.textContent.includes("International company"));
    assert.equal(await page.locator("#ticker").inputValue(),"MTMCF",
      "Custom ticker should remain selected instead of displaying a blank dropdown");
    assert.match(await page.locator("#company-empty-message").textContent(),/AUD/);
    assert.match(await page.locator("#company-empty-message").textContent(),/premium access/);
    assert.match(await page.locator("#research-company").textContent(),/International Research Example/);
    assert.match(await page.locator("#research-sector").textContent(),/Metals/);
    assert.match(await page.locator("#research-metrics").textContent(),/1\.15/);
    assert.equal(await page.locator("#research-columns").isHidden(),true,
      "No research cards should appear when no analytical model is possible");
    assert.equal(await page.locator(".research-panel:visible").count(),0);
    assert.equal(await page.locator(".research-decision").count(),0,
      "Decision supported footers must be removed, not hidden");
    assert.equal(await page.locator("#company-chart").isHidden(),true);
    assert.equal(await page.locator("#company-empty").isHidden(),false);
    assert.equal(await page.locator("#data-error").isVisible(),false);
    // Users can immediately return to a featured issuer with verified charts.
    await page.locator('[data-research-example="AAPL"]').click();
    await page.waitForFunction(()=>document.querySelector("#company-chart")?.data?.length===2);
    assert.equal(await page.locator("#company-empty").isHidden(),true);
    assert.equal(await page.locator("#company-chart").isHidden(),false);
    // Arbitrary ticker with complete as-reported filings exercises all three panels.
    await page.locator("#custom-ticker").fill("NVDA");
    await page.locator("#symbol-form button").click();
    await page.waitForFunction(()=>document.querySelector("#company-empty-message")
      ?.textContent.includes("rate limit reached"));
    assert.match(await page.locator("#company-empty-message").textContent(),
      /request failure, not proof/);
    assert.match(await page.locator("#research-status").textContent(),/HTTP 429/);
    // Once a rate-limit window ends, retry should load the actual statements.
    await page.locator("#symbol-form button").click();
    await page.waitForFunction(()=>document.querySelector("#source-period")
      ?.textContent==="FY ending 2025-06-30");
    await page.waitForFunction(()=>document.querySelector("#research-source")
      ?.textContent.includes("As-reported 10-K"));
    assert.equal(await page.locator("#company-name").textContent(),"Research Example Corporation");
    assert.match(await page.locator("#research-sector").textContent(),/Technology/);
    assert.match(await page.locator("#health-kpis").textContent(),/Interest coverage/);
    assert.match(await page.locator("#stress-kpis").textContent(),/Stressed coverage/);
    assert.match(await page.locator("#valuation-kpis").textContent(),/Implied equity value\/share/);
    assert.equal(await page.locator("#health-chart").isHidden(),false);
    assert.equal(await page.locator("#stress-chart").isHidden(),false);
    assert.equal(await page.locator("#valuation-chart").isHidden(),false);
    assert.equal(await page.locator(".research-panel:visible").count(),3,
      "Three supported analytical panels remain visible");
    assert.equal(await page.locator("#research-columns").getAttribute("data-visible"),"3");
    const before=await page.locator("#stress-kpis").textContent();
    await slide(page,"#rate-shock",200);
    assert.notEqual(await page.locator("#stress-kpis").textContent(),before);
    const valueBefore=await page.locator("#valuation-kpis").textContent();
    await slide(page,"#discount-rate",12);
    assert.notEqual(await page.locator("#valuation-kpis").textContent(),valueBefore);
    // One supported model: cash flow and interest exist, but debt does not.
    await page.locator("#custom-ticker").fill("CASH");
    await page.locator("#symbol-form button").click();
    await page.waitForFunction(()=>document.querySelector("#research-source")
      ?.textContent.includes("As-reported 10-K") &&
      document.querySelector("#research-columns")?.dataset.visible==="1");
    assert.equal(await page.locator("#health-panel").isVisible(),true);
    assert.equal(await page.locator("#health-chart").isVisible(),true);
    assert.equal(await page.locator("#stress-panel").isHidden(),true);
    assert.equal(await page.locator("#valuation-panel").isHidden(),true);
    assert.equal(await page.locator("#health-kpis").textContent().then(t=>t.includes("Unavailable")),false,
      "Do not leave unavailable financial KPIs inside an otherwise useful card");
    assert.equal(await page.locator(".research-panel:visible").count(),1);
    assert.equal(await page.locator("#health-panel .research-number").textContent(),"01");
    // Two supported models: debt and interest are reported, but valuation
    // cannot subtract net debt because no verified cash balance exists.
    await page.locator("#custom-ticker").fill("STRESS");
    await page.locator("#symbol-form button").click();
    await page.waitForFunction(()=>document.querySelector("#research-columns")?.dataset.visible==="2" &&
      document.querySelector("#research-company")?.textContent==="STRESS");
    assert.equal(await page.locator("#health-panel").isVisible(),true);
    assert.equal(await page.locator("#stress-panel").isVisible(),true);
    assert.equal(await page.locator("#valuation-panel").isHidden(),true);
    assert.equal(await page.locator(".research-panel:visible").count(),2);
    assert.equal(await page.locator("#stress-panel .research-number").textContent(),"02");
    // Once a fully reported issuer is selected, all three panels return.
    await page.locator("#custom-ticker").fill("NVDA");
    await page.locator("#symbol-form button").click();
    await page.waitForFunction(()=>document.querySelector("#research-columns")?.dataset.visible==="3" &&
      document.querySelector("#research-company")?.textContent==="Research Example Corporation");
    assert.equal(await page.locator(".research-panel:visible").count(),3);
    assert.equal(await page.locator("#data-error").isVisible(),false);
    assert.deepEqual(errors,[],"No uncaught browser errors during research loading");
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
