/* Browser regression: compact Week 6 workspace with real Plotly and real FRED snapshot. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const base = "http://127.0.0.1:8788";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitServer() {
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(base + "/week-06/")).ok) return; } catch {}
    await sleep(200);
  }
  throw new Error("Local GitHub Pages preview failed to start.");
}
async function setControl(page, selector, value) {
  await page.$eval(selector, (input, next) => {
    input.value = String(next);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
const visibleCharts = page => page.locator("#chart-stage > .chart-card:not(.is-view-hidden)");

(async () => {
  const server = spawn("python3", ["-m", "http.server", "8788", "--bind", "127.0.0.1", "--directory", "docs"], { stdio: "ignore" });
  let browser;
  try {
    await waitServer();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
    const errors = [];
    let onSimulator = false;
    page.on("pageerror", err => { if (onSimulator) errors.push(err.message); });
    // Real Plotly, served locally for deterministic browser CI.
    await page.route("https://cdn.plot.ly/**", route => route.fulfill({
      path: require.resolve("plotly.js-dist-min"), contentType: "application/javascript"
    }));

    await page.goto(base + "/#week-05", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("a.week-06-nav");
    assert.equal(await page.locator(".site-header h1").textContent(), "Financial Visualization Lab");
    assert.equal(await page.locator(".site-header h1").evaluate(n => getComputedStyle(n).viewTransitionName), "lab-title");
    await page.locator("a.week-06-nav").click();
    await page.waitForURL("**/week-06/");
    onSimulator = true;
    await page.waitForFunction(() => document.querySelector("#preview-spread")?.textContent !== "—");
    await page.waitForFunction(() => document.querySelector("#chart-historical-yields")?.data?.[0]?.x?.length > 100);
    assert.equal(await visibleCharts(page).count(), 1, "One graph by default, not four small graphs.");
    assert.equal(await page.locator(".lab-shared-title").textContent(), "Financial Visualization Lab");
    const brand = await page.locator(".course-mark").boundingBox();
    const title = await page.locator(".lab-shared-title").boundingBox();
    assert.ok(brand.x > title.x, "Course badge appears at right of compact header.");
    assert.equal(await page.locator(".lab-shared-title").evaluate(n => getComputedStyle(n).viewTransitionName), "lab-title");
    assert.equal(await page.locator(".course-mark").evaluate(n => getComputedStyle(n).viewTransitionName), "course-label");

    const first = await page.locator("#preview-spread").textContent();
    const observed = await page.locator("#kpi-5").textContent();
    const layout = await page.evaluate(() => ({
      viewport: innerHeight,
      bottom: document.querySelector(".chart-stage")?.getBoundingClientRect().bottom ??
        document.querySelector("#chart-stage").getBoundingClientRect().bottom,
      railX: document.querySelector(".controls-rail").getBoundingClientRect().left,
      stageX: document.querySelector("#chart-stage").getBoundingClientRect().left,
      railWidth: document.querySelector(".controls-rail").getBoundingClientRect().width,
      viewportWidth: innerWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    assert.ok(layout.railX + layout.railWidth <= layout.stageX, "Controls are a distinct narrow left sidebar.");
    assert.ok(layout.bottom <= layout.viewport + 4, "Selected plot is visible within the desktop viewport.");
    assert.ok(layout.scrollWidth <= layout.viewportWidth + 1, "Desktop has no horizontal overflow.");
    fs.mkdirSync("test-artifacts", { recursive: true });
    await page.screenshot({ path: "test-artifacts/week06-single.png", fullPage: false });

    await page.locator("#mode-compare").click();
    assert.equal(await page.locator("#mode-compare").getAttribute("aria-pressed"), "true");
    assert.equal(await visibleCharts(page).count(), 2);
    await page.waitForFunction(() => document.querySelector("#chart-historical-spread")?.data?.[0]?.x?.length > 100);
    const widths = await visibleCharts(page).evaluateAll(cards => cards.map(x => x.getBoundingClientRect().width));
    assert.ok(widths.every(x => x > 320), "Compare charts are side-by-side, large enough to read.");
    await page.screenshot({ path: "test-artifacts/week06-compare.png", fullPage: false });

    await page.selectOption("#chart-primary", "chart-projected-yields");
    await page.waitForFunction(() => document.querySelector("#chart-projected-yields")?.data?.[0]?.y?.length === 13);
    await setControl(page, "#delta", 200);
    await page.waitForFunction(() => document.querySelector("#delta-value").textContent === "+200 bps");
    await page.waitForFunction(previous => document.querySelector("#preview-spread").textContent !== previous, first);
    assert.equal(await page.locator("#kpi-5").textContent(), observed, "Observed historical data must not change.");
    await page.waitForFunction(() => Math.abs(
      document.querySelector("#chart-projected-yields")?.data?.[0]?.y?.at(-1) -
      parseFloat(document.querySelector("#preview-five")?.textContent ?? "NaN")) < 0.01);

    const changed = await page.locator("#preview-spread").textContent();
    await setControl(page, "#beta5", 0.95);
    await page.waitForFunction(old => document.querySelector("#preview-spread").textContent !== old, changed);
    await page.selectOption("#chart-secondary", "chart-projected-spread");
    await page.waitForFunction(() => document.querySelector("#chart-projected-spread")?.data?.[1]?.y?.length === 13);
    await setControl(page, "#corridor", 75);
    await page.waitForFunction(() => {
      const d = document.querySelector("#chart-projected-spread")?.data;
      return d && Math.abs(d[1].y.at(-1) - d[0].y.at(-1) - 1.5) < 1e-8;
    });
    await page.selectOption("#horizon", "6");
    await page.waitForFunction(() => document.querySelector("#chart-projected-yields")?.data?.[0]?.x.length === 7);
    await page.waitForFunction(() => document.querySelector("#chart-projected-spread")?.data?.[2]?.x.length === 7);

    await page.selectOption("#chart-secondary", "chart-historical-yields");
    await page.waitForFunction(() => document.querySelector("#chart-historical-yields")?.data?.[0]?.x.length > 100);
    const oldHistory = await page.locator("#chart-historical-yields").evaluate(n => n.data[0].x.length);
    await page.selectOption("#history-window", "5");
    await page.waitForFunction(old => document.querySelector("#chart-historical-yields")?.data?.[0]?.x.length < old, oldHistory);
    await page.locator("#mode-single").click();
    assert.equal(await visibleCharts(page).count(), 1);
    await page.selectOption("#chart-primary", "chart-historical-yields");
    await page.waitForFunction(() => document.querySelector("#chart-historical-yields").getBoundingClientRect().width > 500);
    await page.locator("#reset").click();
    await page.waitForFunction(() => document.querySelector("#delta-value").textContent === "−50 bps");
    assert.equal(await page.locator("#preview-spread").textContent(), first);
    assert.equal(await page.locator("#chart-stage .chart-card:not(.is-view-hidden)").count(), 1);

    // Mobile is allowed to scroll vertically, never horizontally; compare stacks instead of squashing.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#mode-compare").click();
    await page.waitForFunction(() => document.querySelectorAll("#chart-stage .chart-card:not(.is-view-hidden)").length === 2);
    const mobile = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth, viewport: innerWidth,
      compare: Array.from(document.querySelectorAll("#chart-stage .chart-card:not(.is-view-hidden)"))
        .map(n => n.getBoundingClientRect())
    }));
    assert.ok(mobile.width <= mobile.viewport + 2, "No mobile horizontal overflow.");
    assert.ok(mobile.compare.length === 2 &&
      mobile.compare[1].top >= mobile.compare[0].bottom - 1, "Mobile comparisons stack vertically.");
    await page.screenshot({ path: "test-artifacts/week06-mobile.png", fullPage: true });

    assert.deepEqual(errors, [], "No JavaScript errors on the Week 6 simulator.");
    onSimulator = false;
    await page.locator(".lab-home").click();
    await page.waitForURL(/\/(#week-05)?$/);
    assert.equal(await page.locator(".site-header .course").evaluate(n => getComputedStyle(n).viewTransitionName), "course-label");
    console.log("PASS: desktop one-screen layout, single/compare graph switching, responsive sidebar, rate controls, and reversible navigation.");
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
