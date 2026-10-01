/* Real-browser regression tests for Week 6; no fabricated finance values. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");

const base = "http://127.0.0.1:8788";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitServer() {
  for (let i = 0; i < 40; i += 1) {
    try { if ((await fetch(base + "/week-06/")).ok) return; } catch {}
    await sleep(250);
  }
  throw new Error("Could not start local GitHub Pages preview");
}
async function setControl(page, selector, value) {
  await page.$eval(selector, (node, value) => {
    node.value = String(value);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
(async () => {
  const server = spawn("python3", ["-m", "http.server", "8788", "--bind", "127.0.0.1", "--directory", "docs"], { stdio: "ignore" });
  let browser;
  try {
    await waitServer();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 940 }, reducedMotion: "no-preference" });
    const errors = [];
    let testingSimulator = false;
    // Legacy Week 5 iframes load their own Plotly versions and are outside this
    // regression's scope. Only flag uncaught errors while testing Week 6.
    page.on("pageerror", error => { if (testingSimulator) errors.push(error.message); });
    // Keep the actual Plotly implementation, but avoid relying on external CDN
    // availability during the UI tests.
    const plotly = require.resolve("plotly.js-dist-min");
    await page.route("https://cdn.plot.ly/**", route => route.fulfill({
      path: plotly,
      contentType: "application/javascript"
    }));

    await page.goto(base + "/#week-05", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("a.week-06-nav");
    const homeTitle = page.locator(".site-header h1");
    assert.equal(await homeTitle.textContent(), "Financial Visualization Lab");
    assert.equal(
      await homeTitle.evaluate(node => getComputedStyle(node).viewTransitionName),
      "lab-title"
    );
    await page.locator("a.week-06-nav").click();
    await page.waitForURL("**/week-06/");
    testingSimulator = true;
    await page.waitForFunction(() => document.querySelector("#preview-spread")?.textContent !== "—");
    assert.equal(await page.locator(".lab-shared-title").textContent(), "Financial Visualization Lab");
    const course = await page.locator(".course-mark").boundingBox();
    const title = await page.locator(".lab-shared-title").boundingBox();
    assert.ok(course.x > title.x, "FINC mark belongs on the right in compact header");
    assert.equal(
      await page.locator(".lab-shared-title").evaluate(node => getComputedStyle(node).viewTransitionName),
      "lab-title"
    );
    assert.equal(
      await page.locator(".course-mark").evaluate(node => getComputedStyle(node).viewTransitionName),
      "course-label"
    );

    const first = await page.locator("#preview-spread").textContent();
    const baseYield = await page.locator("#kpi-5").textContent();
    await setControl(page, "#delta", 200);
    await page.waitForFunction(() => document.querySelector("#delta-value").textContent === "+200 bps");
    await page.waitForFunction(previous => document.querySelector("#preview-spread").textContent !== previous, first);
    const changed = await page.locator("#preview-spread").textContent();
    assert.notEqual(first, changed, "Rate dial must change scenario spread next to the controls");
    assert.equal(await page.locator("#kpi-5").textContent(), baseYield, "Actual observed yield remains historical");
    await page.waitForFunction(() => {
      const graph = document.querySelector("#chart-projected-yields");
      const five = graph?.data?.[0]?.y;
      return Array.isArray(five) && five.length === 13 && five[12] > 0;
    });
    const graphTerminal = await page.locator("#chart-projected-yields").evaluate(node => node.data[0].y.at(-1));
    const previewFive = Number((await page.locator("#preview-five").textContent()).replace("%", ""));
    assert.ok(Math.abs(graphTerminal - previewFive) < 0.01, "Projection chart and live controls should agree");

    await setControl(page, "#beta5", 0.95);
    await page.waitForFunction(earlier => document.querySelector("#preview-spread").textContent !== earlier, changed);
    const changedAgain = await page.locator("#preview-spread").textContent();
    assert.notEqual(changedAgain, changed);
    await setControl(page, "#corridor", 75);
    await page.waitForFunction(() => document.querySelector("#corridor-value").textContent === "75 bps");
    await page.waitForFunction(() => {
      const plots = document.querySelector("#chart-projected-spread")?.data;
      return Array.isArray(plots) && Math.abs(plots[1].y.at(-1) - plots[0].y.at(-1) - 1.5) < 1e-8;
    });
    await page.selectOption("#horizon", "6");
    await page.waitForFunction(() => document.querySelector("#chart-projected-yields")?.data?.[0]?.x.length === 7);
    const longHistory = await page.locator("#chart-historical-yields").evaluate(node => node.data[0].x.length);
    await page.selectOption("#history-window", "5");
    await page.waitForFunction(old => document.querySelector("#chart-historical-yields")?.data?.[0]?.x.length < old, longHistory);
    await page.locator("#reset").click();
    await page.waitForFunction(() => document.querySelector("#delta-value").textContent === "−50 bps");
    assert.equal(await page.locator("#preview-spread").textContent(), first, "Reset restores original scenario");

    assert.deepEqual(errors, [], "No JavaScript errors in the Week 6 simulator");
    testingSimulator = false;
    await page.locator(".lab-home").click();
    await page.waitForURL(/\/(#week-05)?$/);
    await page.waitForFunction(() => document.querySelector(".site-header h1")?.textContent === "Financial Visualization Lab");
    assert.equal(
      await page.locator(".site-header .course").evaluate(node => getComputedStyle(node).viewTransitionName),
      "course-label"
    );

    console.log("PASS: Live scenario dials, four charts, responsive header positions and reversible shared title labels.");
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
