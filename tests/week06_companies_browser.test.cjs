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
async function selectPrimary(page,ticker){
  const remove=page.locator("#ticker-pills .ticker-pill-remove");
  while(await remove.count())await remove.first().click();
  await page.locator("#custom-ticker").fill(ticker);
  await page.locator("#custom-ticker").press("Enter");
  await page.locator("#analyze-tickers").click();
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
    const newsCalls=[];
    let newsNVDAFailure=true;
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
    await page.route("https://finc-560-finnhub.joseph-caruso-pc.workers.dev/news?*",route=>{
      const request=route.request();
      const url=new URL(request.url()),ticker=url.searchParams.get("symbol");
      assert.deepEqual([...url.searchParams.keys()],["symbol","from","to"]);
      assert.match(url.searchParams.get("from"),/^\d{4}-\d{2}-\d{2}$/);
      assert.match(url.searchParams.get("to"),/^\d{4}-\d{2}-\d{2}$/);
      assert.ok((Date.parse(url.searchParams.get("to"))-
        Date.parse(url.searchParams.get("from")))/86400000<=31);
      assert.equal(request.headers().authorization,undefined,
        "News must use the server-side FINNHUB_TOKEN, not a browser token");
      newsCalls.push(ticker);
      const headers={"access-control-allow-origin":"*"};
      if(ticker==="NVDA"&&newsNVDAFailure){
        newsNVDAFailure=false;
        return route.fulfill({status:429,headers,
          json:{error:"Finnhub rejected the request",source:"provider",upstreamStatus:429}});
      }
      if(ticker==="MTMCF")return route.fulfill({headers,json:[]});
      const count=ticker==="MSFT"?18:ticker==="AAPL"?2:4;
      const latest=Math.floor(Date.now()/1000)-3600;
      const articles=Array.from({length:count},(_,i)=>({
        id:100+i,
        headline:i===0&&ticker==="AAPL"
          ?'<img src=x onerror=alert(1)> Quarterly update'
          :ticker+" article "+i,
        summary:ticker+" credit research source article "+i,
        source:"Publisher "+(i%2+1),
        url:"https://news.example/"+ticker+"/"+i,
        datetime:latest-i*3600
      }));
      // Reverse input order to verify client enforces newest first.
      return route.fulfill({headers,json:articles.reverse()});
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
    await page.waitForFunction(()=>
      document.querySelectorAll("#ticker-pills .ticker-pill").length===1 &&
      document.querySelector("#ticker-pills")?.textContent.includes("MSFT"))
      .catch(async error => {
        throw new Error("Ticker pills failed to initialize: "+
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
    assert.equal(await page.locator("#ticker").count(),0,
      "Old single-select company dropdown must be removed");
    assert.equal(await page.locator("#ticker-pills .ticker-pill").count(),1);
    assert.match(await page.locator("#ticker-pills").textContent(),/MSFT.*Primary/);
    assert.equal(await page.locator("#custom-ticker").inputValue(),"");
    await page.waitForFunction(()=>
      document.querySelectorAll("#news-list .news-item").length===15 &&
      document.querySelector("#news-status")?.dataset.state==="ready");
    assert.equal(await page.locator(".research-panel").count(),0,
      "Obsolete bottom corporate research cards have been removed");
    assert.equal(await page.locator(".news-board").count(),1);
    assert.match(await page.locator("#news-company-title").textContent(),/MSFT/);
    assert.equal(await page.locator("#news-list .news-item").count(),15);
    assert.equal(await page.locator("#news-list .news-item").first()
      .locator("a").first().textContent(),"MSFT article 0");
    assert.equal(await page.locator("#news-list .news-item").first()
      .locator("time").count(),1);
    assert.deepEqual(newsCalls,["MSFT"]);
    assert.equal(await page.locator("#metric").inputValue(),"net");
    const picker=page.locator("#chart-picker");
    assert.equal(await picker.locator('input[type="checkbox"]').count(),8);
    assert.equal(await picker.locator("input:checked").count(),4);
    assert.equal(await page.locator("#chart-stage").getAttribute("data-count"),"4");
    assert.equal(await page.locator(".kpis").count(),0);
    assert.equal(await picker.locator('input[value="equity-cashflows"]').isDisabled(),true,
      "Do not imply curated earnings-only filings contain cash-flow disclosures");
    await page.waitForFunction(()=>
      document.querySelector("#equity-revenue")?.data?.length===2 &&
      document.querySelector("#equity-operating")?.data?.length===2 &&
      document.querySelector("#equity-margins")?.data?.length===4);
    assert.match(await page.locator("#company-chart-context").textContent(),/Latest reported/);
    assert.match(await page.locator("#equity-revenue-context").textContent(),/Latest reported/);
    const layoutRects=()=>page.locator("#chart-stage").evaluate(stage=>
      [...stage.querySelectorAll(".chart-card:not(.is-view-hidden)")].map(card=>{
        const r=card.getBoundingClientRect();
        return {x:Math.round(r.x),y:Math.round(r.y),w:r.width};
      }));
    const four=await layoutRects();
    assert.equal(four[0].y,four[1].y);
    assert.equal(four[2].y,four[3].y);
    assert.ok(four[1].x>four[0].x&&four[2].y>four[0].y);
    await picker.locator("summary").click();
    await picker.locator('input[value="equity-margins"]').uncheck();
    const three=await layoutRects();
    assert.equal(await page.locator("#chart-stage").getAttribute("data-count"),"3");
    assert.ok(three[0].w>three[1].w*1.8&&
      three[1].y===three[2].y&&three[2].x>three[1].x);
    await picker.locator('input[value="equity-operating"]').uncheck();
    const two=await layoutRects();
    assert.equal(await page.locator("#chart-stage").getAttribute("data-count"),"2");
    assert.ok(two[1].y>two[0].y&&two[0].x===two[1].x);
    await picker.locator('input[value="equity-revenue"]').uncheck();
    assert.equal(await page.locator("#chart-stage").getAttribute("data-count"),"1");
    await picker.locator('input[value="company-chart"]').click();
    assert.equal(await picker.locator('input[value="company-chart"]').isChecked(),true);
    await page.locator("#reset").click();
    await page.waitForFunction(()=>document.querySelector("#chart-stage")?.dataset.count==="4");
    await picker.locator("summary").click();
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

    // Enter and pill removal only change pending selection, not analysis.
    const oldQuoteCalls=marketCalls.length,oldNewsCalls=newsCalls.length;
    await page.locator("#custom-ticker").fill("AAPL");
    await page.locator("#custom-ticker").press("Enter");
    assert.equal(await page.locator("#ticker-pills .ticker-pill").count(),2);
    assert.equal(await page.locator("#ticker-pills .ticker-pill").first()
      .locator("strong").textContent(),"MSFT");
    assert.equal(await page.locator("#company-name").textContent(),"Test Corporation");
    assert.equal(marketCalls.length,oldQuoteCalls);
    assert.equal(newsCalls.length,oldNewsCalls);
    await page.locator("#ticker-pills .ticker-pill-remove").last().click();
    assert.equal(await page.locator("#ticker-pills .ticker-pill").count(),1);
    assert.equal(marketCalls.length,oldQuoteCalls);
    await selectPrimary(page,"AAPL");
    await page.waitForFunction(()=>document.querySelector("#company-name")?.textContent==="Another Test Corporation");
    await page.waitForFunction(()=>document.querySelector("#quote-price")?.textContent==="$245.67");
    assert.equal(await page.locator("#quote-change").textContent(),"−$1.23 (−0.50%)");
    assert.deepEqual(marketCalls,["MSFT","AAPL"],"Company switch fetches its own quote");
    await page.waitForFunction(()=>document.querySelector("#news-company-title")
      ?.textContent.includes("AAPL") &&
      document.querySelectorAll("#news-list .news-item").length===2);
    const firstHeadline=page.locator("#news-list .news-item").first().locator("a").first();
    assert.equal(await firstHeadline.textContent(),'<img src=x onerror=alert(1)> Quarterly update');
    assert.equal(await page.locator("#news-list img").count(),0,
      "Untrusted publisher headlines must be escaped as plain text");
    assert.ok((await firstHeadline.getAttribute("href")).startsWith("https://news.example/AAPL/"));
    assert.equal(await firstHeadline.getAttribute("rel"),"noopener noreferrer");
    await page.locator("#news-refresh").click();
    await page.waitForFunction(()=>document.querySelector("#news-status")
      ?.textContent.includes("Refreshed"));
    assert.equal(newsCalls.filter(t=>t==="AAPL").length,2,
      "Explicit refresh should request current ticker news");
    assert.notEqual(await page.locator("#kpi-revenue").textContent(),"—");
    assert.equal(await page.locator("#source-period").textContent(),"FY ending 2025-06-30");
    assert.equal(await page.locator("#data-error").isVisible(),false,
      "Switching companies must retain a clean error-free dashboard");
    await page.locator("#reset").click();
    await page.waitForFunction(()=>document.querySelector("#growth-value")?.textContent==="0 pp");
    assert.equal(await page.locator("#method").inputValue(),"cagr");
    assert.equal(await page.locator("#horizon").inputValue(),"3");
    assert.equal(await page.locator("#metric").inputValue(),"net");
    assert.equal(await page.locator("#ticker-pills .ticker-pill strong").textContent(),"AAPL");
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
    // Quote and article availability must be independent of curated forecasts.
    marketUnavailable=true;
    await page.locator("#quote-refresh").click();
    await page.waitForFunction(()=>
      document.querySelector("#quote-status")?.textContent.includes("limited"));
    assert.equal(await page.locator("#data-error").isVisible(),false);
    assert.ok(await page.locator("#company-chart").evaluate(g=>g.data?.length>=2));
    assert.equal(await page.locator("#news-list .news-item").count(),2);
    marketUnavailable=false;

    // International company: annual US filings absent, but news requests still
    // happen and the UI explains the lack of recent covered articles.
    await selectPrimary(page,"MTMCF");
    await page.waitForFunction(()=>document.querySelector("#company-empty-title")
      ?.textContent.includes("International company"));
    assert.equal(await page.locator("#ticker-pills .ticker-pill strong").textContent(),"MTMCF");
    assert.match(await page.locator("#company-empty-message").textContent(),/AUD/);
    await page.waitForFunction(()=>document.querySelector("#news-status")?.dataset.state==="empty" &&
      document.querySelector("#news-company-title")?.textContent
        .includes("International Research Example"));
    assert.equal(await page.locator("#news-list .news-item").count(),0);
    assert.match(await page.locator("#news-status").textContent(),/Coverage varies/);
    assert.equal(await page.locator("#data-error").isVisible(),false);

    // A company news failure should not masquerade as a financial failure.
    // Example buttons now stage a ticker; Analyze alone commits it.
    await page.locator('[data-research-example="AAPL"]').click();
    assert.equal(await page.locator("#ticker-pills .ticker-pill").count(),2);
    assert.equal(await page.locator("#news-company-title").textContent(),
      "International Research Example");
    await selectPrimary(page,"AAPL");
    await page.waitForFunction(()=>document.querySelector("#company-chart")?.data?.length===2 &&
      document.querySelectorAll("#news-list .news-item").length===2);
    await selectPrimary(page,"NVDA");
    await page.waitForFunction(()=>document.querySelector("#news-status")?.dataset.state==="error");
    assert.match(await page.locator("#news-status").textContent(),/rate limited/);
    assert.match(await page.locator("#company-empty-message").textContent(),
      /request failure, not proof/);
    await page.locator("#news-refresh").click();
    await page.waitForFunction(()=>document.querySelector("#news-status")?.dataset.state==="ready");
    assert.equal(await page.locator("#news-list .news-item").count(),4);
    // Financials retry is independent of news refresh.
    await page.locator("#analyze-tickers").click();
    await page.waitForFunction(()=>document.querySelector("#source-period")
      ?.textContent==="FY ending 2025-06-30");
    assert.equal(await page.locator("#company-name").textContent(),"Research Example Corporation");
    await page.waitForFunction(()=>
      document.querySelector("#chart-picker input[value='equity-fcf']")?.disabled===false &&
      document.querySelector("#chart-picker input[value='equity-balance']")?.disabled===false);
    await picker.locator("summary").click();
    await picker.locator('input[value="equity-margins"]').uncheck();
    for(const [id,expected] of [
      ["equity-cashflows",2],["equity-fcf",1],
      ["equity-coverage",1],["equity-balance",2]
    ]){
      const control=picker.locator('input[value="'+id+'"]');
      await control.check();
      await page.waitForFunction(({id,count})=>
        document.getElementById(id)?.data?.length===count,{id,count:expected});
      await control.uncheck();
    }
    await picker.locator('input[value="equity-margins"]').check();
    await picker.locator("summary").click();
    assert.equal(await page.locator(".research-panel").count(),0,
      "No legacy research cards should reappear when full statements load");
    assert.equal(await page.locator("#news-list .news-item").count(),4);

    // Switching to a partially disclosed company disables unsupported main
    // visualizations but still supplies its independent recent news.
    await selectPrimary(page,"CASH");
    await page.waitForFunction(()=>
      document.querySelector("#news-company-title")?.textContent.includes("CASH") &&
      document.querySelector("#chart-picker input[value='equity-balance']")?.disabled===true);
    await page.waitForFunction(()=>document.querySelector("#news-status")?.dataset.state==="ready" &&
      document.querySelectorAll("#news-list .news-item").length>0);
    assert.ok(await page.locator("#news-list .news-item").count()>0);
    assert.equal(await page.locator("#data-error").isVisible(),false);

    // Staged AAPL must not affect displayed MSFT until Analyze; both
    // comparative charts use real independent statements and fiscal dates.
    await selectPrimary(page,"MSFT");
    await page.waitForFunction(()=>document.querySelector("#company-chart")?.data?.length===2);
    await page.locator("#reset").click();
    await page.locator("#custom-ticker").fill("AAPL");
    await page.locator("#custom-ticker").press("Enter");
    assert.equal(await page.locator("#ticker-pills .ticker-pill").count(),2);
    assert.equal(await page.locator("#company-name").textContent(),"Test Corporation");
    assert.equal(await page.locator("#company-chart").evaluate(g=>g.layout.meta.singleChart),true);
    await page.locator("#analyze-tickers").click();
    await page.waitForFunction(()=>document.querySelector("#company-chart")?.layout?.meta
      ?.comparison===true&&document.querySelector("#company-chart")?.data?.length===4);
    const comparative=await page.locator("#company-chart").evaluate(g=>({
      primary:g.layout.meta.primary,tickers:g.layout.meta.tickers,
      indexed:g.layout.meta.indexed,
      anchor1:g.data[0].y[0],anchor2:g.data[2].y[0]
    }));
    assert.deepEqual(comparative.tickers,["MSFT","AAPL"]);
    assert.equal(comparative.primary,"MSFT");
    assert.equal(comparative.indexed,true);
    assert.equal(comparative.anchor1,100);
    assert.equal(comparative.anchor2,100);
    assert.equal(await page.locator("#equity-comparison-sources").isVisible(),true);
    assert.equal(await page.locator("#equity-comparison-sources a").count(),2);
    assert.match(await page.locator("#news-company-title").textContent(),/MSFT/,
      "News still follow primary ticker during a comparison");
    await page.locator('[data-chart="company-chart"] .equity-scale-switch '+
      'button[data-mode="nominal"]').click();
    await page.waitForFunction(()=>document.querySelector("#company-chart")
      ?.layout?.meta?.indexed===false);
    assert.equal(await page.locator("#equity-revenue").evaluate(g=>
      g.layout.meta.indexed),true,"Each absolute-value chart keeps its own scale");
    await page.locator("#ticker-pills .ticker-pill-remove").first().click();
    assert.equal(await page.locator("#ticker-pills .ticker-pill strong").textContent(),"AAPL");
    assert.equal(await page.locator("#company-chart").evaluate(g=>g.layout.meta.primary),
      "MSFT","Removing a pill does not replot the applied comparison");
    await page.locator("#analyze-tickers").click();
    await page.waitForFunction(()=>document.querySelector("#company-chart")
      ?.layout?.meta?.singleChart===true&&
      document.querySelector("#news-company-title")?.textContent.includes("AAPL"));
    assert.equal(await page.locator("#equity-comparison-sources").isVisible(),false);
    assert.deepEqual(errors,[],"No uncaught browser errors during ticker/news loading");
    onCompany=false;
    await page.locator(".workspaces a").first().click();
    await page.waitForURL("**/week-06/");
    assert.equal(await page.locator(".workspaces [aria-current=page]").textContent(),"Bonds");
    console.log("PASS: two compact workspace tabs, browser-calculated model, source switch, "+
      "one continuous chronological company chart and mobile.");
  }finally{
    if(browser)await browser.close();
    server.kill("SIGTERM");
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
