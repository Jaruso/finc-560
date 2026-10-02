const test = require("node:test");
const assert = require("node:assert/strict");
const { fitSensitivities, lastYears, project } = require("../docs/week-06/rates/model.js");

test("100bp shock respects independent five- and ten-year response assumptions", () => {
  const result = project({ date: "2026-09-01", dgs5: 3.8, dgs10: 4.0 }, 100, 0.8, 0.25, 12, 25);
  assert.equal(result.path.length, 13);
  assert.ok(Math.abs(result.terminal.y5 - 4.6) < 1e-10);
  assert.ok(Math.abs(result.terminal.y10 - 4.25) < 1e-10);
  assert.ok(Math.abs(result.terminal.spread + 0.35) < 1e-10);
  assert.ok(Math.abs(result.terminal.lower + 0.6) < 1e-10);
  assert.equal(result.crossing.kind, "crossing");
  assert.ok(result.crossing.month > 4 && result.crossing.month < 5);
});

test("flat policy path retains current spread and never invents an inversion", () => {
  const p = project({ date: "2026-09-01", dgs5: 3.5, dgs10: 3.7 }, 0, 0.6, 0.3, 24, 50);
  assert.equal(p.crossing, null);
  assert.ok(Math.abs(p.terminal.spread - 0.2) < 1e-9);
});

test("baseline inversion is already inverted, not forecast", () => {
  const p = project({ date: "2026-09-01", dgs5: 4, dgs10: 3.8 }, -100, 0.4, 0.2, 6, 0);
  assert.equal(p.crossing.kind, "already");
});

test("month filtering and regression recover known co-movements", () => {
  const rows = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(Date.UTC(2020, i, 1)).toISOString().slice(0, 10);
    const policy = 1 + i * 0.05 + 0.12 * Math.sin(i);
    return { date: d, policy, dgs5: 2 + policy * 0.75, dgs10: 3 + policy * 0.3 };
  });
  assert.ok(lastYears(rows, "5").length > 55);
  const fit = fitSensitivities(rows);
  assert.ok(Math.abs(fit.beta5 - 0.75) < 1e-9);
  assert.ok(Math.abs(fit.beta10 - 0.3) < 1e-9);
});

test("insufficient policy variation cannot produce a fitted response", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({
    date: new Date(Date.UTC(2020, i, 1)).toISOString().slice(0, 10),
    policy: 1, dgs5: 2 + i * 0.1, dgs10: 3 + i * 0.04
  }));
  assert.equal(fitSensitivities(rows), null);
});

test("user-defined envelope is symmetric, not an estimated standard deviation", () => {
  const { scenarioBands } = require("../docs/week-06/rates/model.js");
  const sim = project({ date: "2026-09-01", dgs5: 4, dgs10: 4.2 }, -100, 0.7, 0.3, 12, 40);
  const five = scenarioBands(sim.path, "dgs5");
  const ten = scenarioBands(sim.path, "dgs10");
  const spread = scenarioBands(sim.path, "spread");
  assert.equal(five.length, 13);
  for (const band of [five, ten, spread]) {
    assert.equal(band[0].high, band[0].center);
    assert.equal(band[0].low, band[0].center);
    assert.ok(Math.abs(band.at(-1).center * 2 - band.at(-1).high - band.at(-1).low) < 1e-9);
  }
  assert.ok(Math.abs(five.at(-1).high - five.at(-1).center - 0.2) < 1e-9);
  assert.ok(Math.abs(ten.at(-1).high - ten.at(-1).center - 0.2) < 1e-9);
  assert.ok(Math.abs(spread.at(-1).high - spread.at(-1).center - 0.4) < 1e-9);
  assert.throws(() => scenarioBands(sim.path, "policy"), /Unsupported/);
});
