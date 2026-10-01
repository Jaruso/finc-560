/* Regression: paired observed/scenario time axes and honest sensitivity envelopes. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const base = "http://127.0.0.1:8788";
const sleep = n => new Promise(done => setTimeout(done, n));
async function waitForServer() {
  for (let i = 0; i < 50; i++) {
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
const countVisible = page => page.locator("#chart-stage > .chart-card:not(.is-view-hidden)").count();
const graph = (page, id) => page.locator("#" + id);
const pairReady = (id, count) => {
  const n = document.getElementById(id);
  return n && Array.isArray(n.data) && n.data.length === 4 &&
    n.data[0].x.length === count && n.data[3].x.length === 13;
};
(async () => {
  const server = spawn("python3", ["-m", "http.server", "8788", "--bind", "127.0.0.1", "--directory", "docs"], {stdio:"ignore"});
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
      const n = document.querySelector("#chart-five");
      return n?.data?.length === 4 && n.data[0].x.length === 24 && n.data[3].x.length === 13;
    });
    assert.equal(await countVisible(page), 1, "Only one compound chart visible by default.");
    assert.equal(await page.locator(".lab-shared-title").textContent(), "Financial Visualization Lab");
    assert.equal(await page.locator(".lab-shared-title").evaluate(n => getComputedStyle(n).viewTransitionName), "lab-title");

    // The two panels should each occupy about half the same plot, share y,
    // and have separate, visibly labeled time axes.
    const plot = await graph(page,"chart-five").evaluate(n => ({
      axes: [n.layout.xaxis.domain, n.layout.xaxis2.domain],
      anchor: n.layout.xaxis2.anchor, annotations: n.layout.annotations,
      lengthHistory: n.data[0].x.length, lengthFuture: n.data[3].x.length,
      names: n.data.map(x => x.name), xaxes: n.data.map(x => x.xaxis)
    }));
    assert.ok(Math.abs(plot.axes[0][1] - .475) < .001 && Math.abs(plot.axes[1][0] - .525) < .001);
    assert.equal(plot.anchor, "y", "Both halves share a y axis.");
    assert.ok(plot.annotations.some(n => n.text.includes("OBSERVED")) &&
      plot.annotations.some(n => n.text.includes("HYPOTHETICAL")));
    assert.deepEqual(plot.names, ["Observed", "Lower scenario", "Upper scenario", "Central assumption"]);
    assert.deepEqual(plot.xaxes.slice(1), ["x2", "x2", "x2"]);
    const firstPreview = await page.locator("#preview-spread").textContent();
    const actualYield = await page.locator("#kpi-5").textContent();
    const dims = await page.evaluate(() => ({
      bottom: document.querySelector("#chart-stage").getBoundingClientRect().bottom,
      viewport: window.innerHeight,
      railRight: document.querySelector(".controls-rail").getBoundingClientRect().right,
      stageLeft: document.querySelector("#chart-stage").getBoundingClientRect().left,
      scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth
    }));
    assert.ok(dims.bottom <= dims.viewport + 4, "Dashboard fits in the desktop viewport.");
    assert.ok(dims.railRight <= dims.stageLeft, "Controls are a separate narrow left rail.");
    assert.ok(dims.scrollWidth <= dims.width + 1, "No desktop horizontal overflow.");

    fs.mkdirSync("test-artifacts", { recursive: true });
    await page.screenshot({ path:"test-artifacts/week06-split-single.png", fullPage:false });

    // Actual scenario changing affects the projected right half immediately.
    const before = await graph(page,"chart-five").evaluate(n => n.data[3].y.at(-1));
    await setRange(page,"#delta",200);
    await page.waitForFunction(v => document.querySelector("#preview-spread").textContent !== v,firstPreview);
    await page.waitForFunction(v => Math.abs(document.querySelector("#chart-five")?.data?.[3]?.y?.at(-1) - v) > .01,before);
    assert.equal(await page.locator("#kpi-5").textContent(),actualYield,"Changing assumptions does not change observed data.");
    assert.equal(await graph(page,"chart-five").evaluate(n=>n.data[0].x.length),24);
    await setRange(page,"#corridor",80);
    await page.waitForFunction(() => {
      const traces = document.querySelector("#chart-five")?.data;
      return traces && Math.abs(traces[2].y.at(-1)-traces[1].y.at(-1) - .8) < 1e-6;
    });
    await page.selectOption("#horizon","6");
    await page.waitForFunction(() => document.querySelector("#chart-five")?.data?.[3]?.x?.length === 7);
    await page.selectOption("#horizon","12");

    // Historical context is a separate selector; fitting window must not
    // silently stretch the observed axis or claim forward projections.
    await page.selectOption("#chart-context","12");
    await page.waitForFunction(() => document.querySelector("#chart-five")?.data?.[0]?.x?.length === 12);
    await page.selectOption("#history-window","5");
    assert.equal(await graph(page,"chart-five").evaluate(n=>n.data[0].x.length),12);
    await page.selectOption("#chart-context","24");

    await page.locator("#mode-compare").click();
    assert.equal(await countVisible(page),2);
    await page.waitForFunction(() => document.querySelector("#chart-spread")?.data?.length === 4);
    const compare = await page.locator("#chart-stage .chart-card:not(.is-view-hidden)").evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
    assert.ok(compare.every(x=>x>320),"Compound plots remain legible in compare mode.");
    await page.screenshot({ path:"test-artifacts/week06-split-compare.png", fullPage:false });
    await setRange(page,"#corridor",60);
    await page.waitForFunction(() => {
      const d=document.querySelector("#chart-spread")?.data;
      return d && Math.abs(d[2].y.at(-1) - d[1].y.at(-1)-1.2)<1e-6;
    });
    await page.selectOption("#chart-primary","chart-ten");
    await page.waitForFunction(()=>document.querySelector("#chart-ten")?.data?.length===4);
    await page.selectOption("#chart-secondary","chart-five");
    assert.equal(await countVisible(page),2);
    await page.locator("#mode-single").click();
    assert.equal(await countVisible(page),1);
    await page.locator("#reset").click();
    await page.waitForFunction(() => document.querySelector("#delta-value").textContent === "−50 bps");
    assert.equal(await page.locator("#preview-spread").textContent(), firstPreview);
    assert.equal(await page.locator("#chart-context").inputValue(),"24");
    await page.locator("#mode-compare").click();

    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(() =>
      document.querySelectorAll("#chart-stage > .chart-card:not(.is-view-hidden)").length === 2);
    const mobile = await page.evaluate(() => {
      const panels=[...document.querySelectorAll("#chart-stage > .chart-card:not(.is-view-hidden)")].map(n=>n.getBoundingClientRect());
      return {width:document.documentElement.scrollWidth,viewport:innerWidth,panels};
    });
    assert.ok(mobile.width <= mobile.viewport + 2,"No horizontal overflow on mobile.");
    assert.ok(mobile.panels[1].top >= mobile.panels[0].bottom - 1,"Compare panels stack on mobile.");
    await page.screenshot({path:"test-artifacts/week06-split-mobile.png",fullPage:true});
    assert.deepEqual(errors, [], "No uncaught errors from the simulator");
    onSimulator = false;
    await page.locator(".lab-home").click();
    await page.waitForURL(/\/(#week-05)?$/);
    console.log("PASS: observed/projected split views, central/upper/lower bands, scenario knobs, compare, mobile and navigation.");
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  }
})().catch(error => {console.error(error);process.exitCode=1;});
