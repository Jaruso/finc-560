/* Week 6 regression: two selectable charts with continuous historical/projected dates. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const base = "http://127.0.0.1:8788";
async function awaitServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + "/week-06/")).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw Error("Preview server did not start");
}
async function slide(page,id,value) {
  await page.$eval(id,(n,v)=>{
    n.value = String(v);
    n.dispatchEvent(new Event("input",{bubbles:true}));
    n.dispatchEvent(new Event("change",{bubbles:true}));
  },value);
}
(async()=>{
  const server=spawn("python3",["-m","http.server","8788","--bind","127.0.0.1","--directory","docs"],{stdio:"ignore"});
  let browser;
  try {
    await awaitServer();
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:"no-preference"});
    const errors=[];
    let inSimulator=false;
    page.on("pageerror",e=>{if(inSimulator)errors.push(e.message);});
    await page.route("https://cdn.plot.ly/**",r=>r.fulfill({
      path:require.resolve("plotly.js-dist-min"),contentType:"application/javascript"
    }));
    await page.goto(base+"/#week-05",{waitUntil:"domcontentloaded"});
    await page.locator("a.week-06-nav").click();
    await page.waitForURL("**/week-06/");
    inSimulator=true;
    await page.waitForFunction(()=>
      document.querySelector("#chart-yields")?.data?.length===8 &&
      document.querySelector("#chart-yields").data[0].x.length===120);
    const select=await page.locator("#chart-primary option").allTextContents();
    assert.deepEqual(select,["5Y & 10Y yields","10Y–5Y spread"]);
    assert.equal(await page.locator("#mode-compare").count(),0);
    assert.equal(await page.locator("#chart-stage > .chart-card:not(.is-view-hidden)").count(),1);

    const first=await page.locator("#chart-yields").evaluate(n=>({
      x:n.data.map(t=>t.x),y:n.data.map(t=>t.y),
      traces:n.data.map(t=>({name:t.name,showlegend:t.showlegend,line:t.line,fill:t.fill,fillcolor:t.fillcolor})),
      xaxis:n.layout.xaxis,secondAxis:n.layout.xaxis2,meta:n.layout.meta,shapes:n.layout.shapes
    }));
    assert.equal(first.secondAxis,undefined,"Only one calendar x-axis.");
    assert.equal(first.xaxis.range[0],first.x[0][0]);
    assert.equal(first.meta.forecastStart,first.x[0].at(-1));
    assert.equal(first.meta.forecastStart,first.x[1].at(-1));
    for(let i=2;i<8;i++)assert.equal(first.x[i][0],first.meta.forecastStart);
    assert.ok(first.meta.boundaryFraction>.89 && first.meta.boundaryFraction<.94);
    assert.notDeepEqual(first.y[0],first.y[1],"Distinct 5Y and 10Y observed histories.");
    assert.equal(first.traces[0].name,"5Y Treasury");
    assert.equal(first.traces[1].name,"10Y Treasury");
    assert.equal(first.traces[0].line.color,first.traces[6].line.color);
    assert.equal(first.traces[1].line.color,first.traces[7].line.color);
    assert.equal(first.traces[6].line.dash,"dash");
    assert.equal(first.traces[7].line.dash,"dash");
    assert.equal(first.traces[6].showlegend,false);
    assert.equal(first.traces[7].showlegend,false);
    assert.equal(first.traces[3].fill,"tonexty");
    assert.equal(first.traces[5].fill,"tonexty");
    assert.equal(first.y[0].at(-1),first.y[6][0]);
    assert.equal(first.y[1].at(-1),first.y[7][0]);
    assert.ok(first.shapes.some(s=>s.xref==="x"&&s.x0===first.meta.forecastStart&&s.x1===first.meta.forecastStart));

    const observed5=first.y[0],observed10=first.y[1];
    const terminal5=first.y[6].at(-1),terminal10=first.y[7].at(-1);
    await slide(page,"#delta",200);
    await page.waitForFunction(old=>{
      const n=document.querySelector("#chart-yields");
      return n?.data?.[6]?.y&&Math.abs(n.data[6].y.at(-1)-old)>.01;
    },terminal5);
    const changed=await page.locator("#chart-yields").evaluate(n=>n.data.map(d=>d.y));
    assert.deepEqual(changed[0],observed5,"5Y observed history unaffected by scenario");
    assert.deepEqual(changed[1],observed10,"10Y observed history unaffected by scenario");
    assert.ok(Math.abs(changed[7].at(-1)-terminal10)>.01,"10Y hypothetical changes too");
    await slide(page,"#beta10",1.2);
    const tenAfter=changed[7].at(-1);
    await page.waitForFunction(old=>Math.abs(document.querySelector("#chart-yields")?.data?.[7]?.y.at(-1)-old)>.01,tenAfter);

    await slide(page,"#corridor",80);
    await page.waitForFunction(()=>{
      const d=document.querySelector("#chart-yields")?.data;
      return d && Math.abs(d[3].y.at(-1)-d[2].y.at(-1)-.8)<1e-6 &&
        Math.abs(d[5].y.at(-1)-d[4].y.at(-1)-.8)<1e-6;
    });
    await page.selectOption("#horizon","6");
    await page.waitForFunction(()=>document.querySelector("#chart-yields")?.data?.[6]?.x.length===7);
    const short=await page.locator("#chart-yields").evaluate(n=>n.layout.meta.boundaryFraction);
    assert.ok(short>.93&&short<.97,"Six months is proportionally narrow beside decade history");
    await page.selectOption("#horizon","24");
    await page.waitForFunction(()=>document.querySelector("#chart-yields")?.data?.[6]?.x.length===25);
    await page.waitForFunction(old=>document.querySelector("#chart-yields")?.layout?.meta?.boundaryFraction<old,short);

    await page.locator("#focus-projection").click();
    await page.waitForFunction(()=>document.querySelector("#chart-yields")?.layout?.meta?.focused===true);
    const focus=await page.locator("#chart-yields").evaluate(n=>n.layout.meta);
    assert.ok(focus.boundaryFraction>.46&&focus.boundaryFraction<.54);
    await page.selectOption("#chart-context","all");
    await page.waitForFunction(()=>document.querySelector("#chart-yields")?.data?.[0]?.x.length>180);
    await page.locator("#focus-projection").click();
    await page.waitForFunction(()=>document.querySelector("#chart-yields")?.layout?.meta?.focused===false);
    await page.selectOption("#chart-primary","chart-spread");
    await page.waitForFunction(()=>document.querySelector("#chart-spread")?.data?.length===4);
    const spread=await page.locator("#chart-spread").evaluate(n=>({
      n:n.data.length,meta:n.layout.meta,shapes:n.layout.shapes,terminal:n.data[3].x.at(-1)
    }));
    assert.equal(spread.n,4,"Original spread chart retained");
    assert.equal(spread.meta.equalTimeScale,true);
    assert.ok(spread.shapes.some(s=>s.y0===0&&s.y1===0&&s.x1===spread.terminal),
      "Spread chart retains the zero inversion line");

    await page.selectOption("#chart-primary","chart-yields");
    await page.waitForFunction(()=>document.querySelector("#chart-yields")?.data?.length===8);
    assert.equal(await page.locator("#chart-stage > .chart-card:not(.is-view-hidden)").count(),1);
    await page.locator("#reset").click();
    await page.waitForFunction(()=>document.querySelector("#delta-value")?.textContent==="−50 bps");
    assert.equal(await page.locator("#chart-context").inputValue(),"120");
    const desktop=await page.evaluate(()=>({
      bottom:document.querySelector("#chart-stage").getBoundingClientRect().bottom,
      viewport:innerHeight,
      railRight:document.querySelector(".controls-rail").getBoundingClientRect().right,
      chartLeft:document.querySelector("#chart-stage").getBoundingClientRect().left
    }));
    assert.ok(desktop.bottom<=desktop.viewport+4&&desktop.railRight<=desktop.chartLeft);
    fs.mkdirSync("test-artifacts",{recursive:true});
    await page.screenshot({path:"test-artifacts/week06-two-options.png",fullPage:false});
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
    await page.screenshot({path:"test-artifacts/week06-two-options-mobile.png",fullPage:true});
    assert.deepEqual(errors,[],"No simulator JavaScript exceptions");
    inSimulator=false;
    await page.locator(".lab-home").click();
    await page.waitForURL(/\/(#week-05)?$/);
    console.log("PASS: two chart options, 5Y+10Y historical and hypothetical lines, spread, chronology, controls and mobile.");
  } finally {
    if(browser)await browser.close();
    server.kill("SIGTERM");
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
