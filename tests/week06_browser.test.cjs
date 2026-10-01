/* Browser regression: one continuous calendar timeline, dynamic boundary and projections. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const base = "http://127.0.0.1:8788";
const sleep = n => new Promise(done => setTimeout(done, n));
async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(base + "/week-06/")).ok) return; } catch {}
    await sleep(200);
  }
  throw new Error("Cannot reach preview server.");
}
async function setRange(page, id, value) {
  await page.$eval(id, (node, v) => {
    node.value = String(v);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
const checkReady = (id, observed, forward) => {
  const graph = document.getElementById(id);
  return graph?.data?.length === 4 &&
    graph.data[0].x.length === observed && graph.data[3].x.length === forward;
};
(async () => {
  const server = spawn("python3", ["-m", "http.server", "8788", "--bind", "127.0.0.1", "--directory", "docs"], { stdio:"ignore" });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
    const errors = [];
    let onSimulator = false;
    page.on("pageerror", e => { if (onSimulator) errors.push(e.message); });
    await page.route("https://cdn.plot.ly/**", route => route.fulfill({
      path: require.resolve("plotly.js-dist-min"), contentType: "application/javascript"
    }));
    await page.goto(base + "/#week-05", { waitUntil: "domcontentloaded" });
    await page.locator("a.week-06-nav").click();
    await page.waitForURL("**/week-06/");
    onSimulator = true;
    await page.waitForFunction(() => document.querySelector("#preview-spread")?.textContent !== "—");
    await page.waitForFunction(() => {
      const n=document.querySelector("#chart-five");
      return n?.data?.length===4 && n.data[0].x.length===120 && n.data[3].x.length===13;
    });
    assert.equal(await page.locator("#mode-compare").count(),0,"Remove misleading two-graph feature.");
    assert.equal(await page.locator("#chart-stage > .chart-card:not(.is-view-hidden)").count(),1);

    const first = await page.locator("#chart-five").evaluate(node => ({
      meta: node.layout.meta, range: node.layout.xaxis.range, secondAxis: node.layout.xaxis2,
      x: node.data.map(d=>d.x), y: node.data.map(d=>d.y),
      shapes: node.layout.shapes, annotations: node.layout.annotations
    }));
    assert.equal(first.secondAxis, undefined,"No artificial independent x-axis.");
    assert.ok(first.meta.equalTimeScale && first.meta.boundaryFraction > .89 &&
      first.meta.boundaryFraction < .94, "10 years history and 1-year projection proportionally placed.");
    assert.equal(first.range[0], first.x[0][0]);
    assert.equal(first.meta.forecastStart,first.x[0].at(-1));
    assert.equal(first.meta.forecastStart,first.x[3][0]);
    assert.equal(first.meta.forecastEnd,first.x[3].at(-1));
    assert.deepEqual(first.x[1],first.x[2]);
    assert.deepEqual(first.x[2],first.x[3]);
    assert.ok(first.shapes.some(s=>s.xref==="x"&&s.x0===first.meta.forecastStart&&s.x1===first.meta.forecastStart),
      "Vertical history/scenario boundary follows actual calendar date.");
    assert.ok(first.annotations.some(a=>a.text.includes("OBSERVED")) &&
      first.annotations.some(a=>a.text.includes("HYPOTHETICAL")));
    assert.ok(first.y[1][0]===first.y[2][0] && first.y[2][0]===first.y[3][0],
      "Historical and hypothetical central/upper/lower meet at the same observed baseline.");
    const dims = await page.evaluate(() => ({
      bottom: document.querySelector("#chart-stage").getBoundingClientRect().bottom,
      viewport: innerHeight,
      railRight: document.querySelector(".controls-rail").getBoundingClientRect().right,
      stageLeft: document.querySelector("#chart-stage").getBoundingClientRect().left,
      width: document.documentElement.scrollWidth, viewportWidth: innerWidth
    }));
    assert.ok(dims.bottom <= dims.viewport + 4);
    assert.ok(dims.railRight <= dims.stageLeft);
    assert.ok(dims.width <= dims.viewportWidth + 1);
    fs.mkdirSync("test-artifacts",{recursive:true});
    await page.screenshot({path:"test-artifacts/week06-chronological-decade.png",fullPage:false});

    const originalObserved = await page.locator("#chart-five").evaluate(n=>n.data[0].y.slice());
    const originalPreview = await page.locator("#preview-spread").textContent();
    const originalTerminal = await page.locator("#chart-five").evaluate(n=>n.data[3].y.at(-1));
    await setRange(page,"#delta",200);
    await page.waitForFunction(old=>document.querySelector("#preview-spread").textContent!==old,originalPreview);
    await page.waitForFunction(old=>Math.abs(document.querySelector("#chart-five")?.data?.[3]?.y.at(-1)-old)>.01,originalTerminal);
    assert.deepEqual(await page.locator("#chart-five").evaluate(n=>n.data[0].y),originalObserved);
    await setRange(page,"#corridor",80);
    await page.waitForFunction(() => {
      const d=document.querySelector("#chart-five")?.data;
      return d && Math.abs(d[2].y.at(-1)-d[1].y.at(-1)-.8)<1e-6;
    });
    await page.selectOption("#horizon","6");
    await page.waitForFunction(()=>document.querySelector("#chart-five")?.data?.[3]?.x.length===7);
    const short = await page.locator("#chart-five").evaluate(n=>n.layout.meta.boundaryFraction);
    assert.ok(short>.93 && short<.97,"Six months occupies about 5% of 10.5 years.");
    await page.selectOption("#horizon","24");
    await page.waitForFunction(()=>document.querySelector("#chart-five")?.data?.[3]?.x.length===25);
    const long = await page.locator("#chart-five").evaluate(n=>n.layout.meta.boundaryFraction);
    assert.ok(long>.82 && long<.85,"Two years occupies about 1/6 of 12 years.");
    assert.ok(long<short,"Boundary slides left as future horizon gets longer.");

    await page.locator("#focus-projection").click();
    await page.waitForFunction(()=>document.querySelector("#chart-five")?.layout?.meta?.focused===true);
    const focus = await page.locator("#chart-five").evaluate(n=>n.layout.meta);
    assert.ok(focus.boundaryFraction>.46 && focus.boundaryFraction<.54,
      "Focused view zooms recent 24 months + projected 24 months with unchanged units.");
    assert.equal(await page.locator("#focus-projection").getAttribute("aria-pressed"),"true");
    await page.screenshot({path:"test-artifacts/week06-focused-projection.png",fullPage:false});

    await page.selectOption("#chart-context","all");
    await page.waitForFunction(()=>document.querySelector("#chart-five")?.data?.[0]?.x.length>180);
    await page.locator("#focus-projection").click();
    await page.waitForFunction(()=>document.querySelector("#chart-five")?.layout?.meta?.focused===false);
    const all = await page.locator("#chart-five").evaluate(n=>n.layout.meta);
    assert.ok(all.boundaryFraction>.9,"All history remains on real continuous date scale.");
    assert.equal(await page.locator("#chart-context").inputValue(),"all");
    await page.selectOption("#chart-context","180");
    await page.waitForFunction(()=>document.querySelector("#chart-five")?.data?.[0]?.x.length===180);
    await page.selectOption("#chart-primary","chart-ten");
    await page.waitForFunction(()=>document.querySelector("#chart-ten")?.data?.[0]?.x.length===180);
    assert.equal(await page.locator("#chart-stage > .chart-card:not(.is-view-hidden)").count(),1);
    await page.selectOption("#chart-primary","chart-spread");
    await page.waitForFunction(()=>document.querySelector("#chart-spread")?.data?.length===4);
    const spread = await page.locator("#chart-spread").evaluate(n=>({
      lines:n.data,
      zero:n.layout.shapes.find(s=>s.y0===0 && s.y1===0)
    }));
    assert.ok(spread.zero?.xref==="x" && spread.zero?.x1===spread.lines[3].x.at(-1));

    await page.locator("#reset").click();
    await page.waitForFunction(()=>document.querySelector("#delta-value").textContent==="−50 bps");
    assert.equal(await page.locator("#chart-context").inputValue(),"120");
    assert.equal(await page.locator("#focus-projection").getAttribute("aria-pressed"),"false");
    assert.equal(await page.locator("#preview-spread").textContent(),originalPreview);

    await page.setViewportSize({width:390,height:844});
    const mobile = await page.evaluate(()=>({
      scroll:document.documentElement.scrollWidth,width:innerWidth,
      visible:document.querySelectorAll("#chart-stage > .chart-card:not(.is-view-hidden)").length
    }));
    assert.ok(mobile.scroll<=mobile.width+2 && mobile.visible===1);
    await page.screenshot({path:"test-artifacts/week06-chronological-mobile.png",fullPage:true});
    assert.deepEqual(errors, [],"No uncaught simulator errors.");
    onSimulator=false;
    await page.locator(".lab-home").click();
    await page.waitForURL(/\/(#week-05)?$/);
    assert.equal(await page.locator(".site-header .course").evaluate(n=>getComputedStyle(n).viewTransitionName),"course-label");
    console.log("PASS: real calendar scale, dynamic history/scenario boundary, upper/central/lower, focus, controls, single chart and mobile.");
  } finally {
    if(browser)await browser.close();
    server.kill("SIGTERM");
  }
})().catch(err=>{console.error(err);process.exitCode=1;});
