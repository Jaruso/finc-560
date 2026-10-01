/* All values are loaded from the versioned FRED snapshot, never fabricated. */
(() => {
  "use strict";
  const M = window.YieldModel;
  const byId = id => document.getElementById(id);
  const BRAND = { five: "#365977", ten: "#14877c", red: "#b54856", muted: "#60707d" };
  const DEFAULTS = { delta: -50, beta5: 0.65, beta10: 0.30, corridor: 25, horizon: 12, history: "10" };
  const ids = { delta: "delta", beta5: "beta5", beta10: "beta10", corridor: "corridor", horizon: "horizon", history: "history-window" };
  let snapshot = null, fitted = null;
  const lastRow = () => snapshot.observations[snapshot.observations.length - 1];
  const nice = (n, digits = 2) => n.toFixed(digits);
  const bp = n => (n >= 0 ? "+" : "−") + nice(Math.abs(n * 100), 0) + " bps";
  const percent = n => nice(n, 2) + "%";
  const val = name => Number(byId(ids[name]).value);
  const describeDate = iso => new Date(iso + "T00:00:00Z").toLocaleDateString(
    "en-US", { month: "short", year: "numeric", timeZone: "UTC" }
  );
  const period = rows => M.lastYears(rows, byId(ids.history).value);

  function setControls(values = DEFAULTS) {
    ["delta", "beta5", "beta10", "corridor", "horizon"].forEach(name => {
      byId(ids[name]).value = values[name];
    });
    byId(ids.history).value = values.history;
  }
  function readControls() {
    return { delta: val("delta"), beta5: val("beta5"), beta10: val("beta10"),
      corridor: val("corridor"), horizon: val("horizon") };
  }

  function plot(id, traces, yLabel, options = {}) {
    const layout = {
      autosize: true, height: byId(id).clientHeight || 340,
      margin: { l: 57, r: 15, t: 20, b: 53 },
      paper_bgcolor: "#fff", plot_bgcolor: "#fff",
      font: { family: "Inter, system-ui, sans-serif", size: 11, color: "#344755" },
      hovermode: "x unified", showlegend: true,
      legend: { orientation: "h", x: 0.5, xanchor: "center", y: 1.15 },
      xaxis: { showgrid: false, linecolor: "#dce4e7", tickfont: { size: 10 }, automargin: true },
      yaxis: { title: { text: yLabel, font: { size: 11 } },
        gridcolor: "#edf0f1", zeroline: false, automargin: true },
      ...options
    };
    return window.Plotly.react(id, traces, layout,
      { responsive: true, displayModeBar: false, displaylogo: false, scrollZoom: false });
  }

  function renderHistory(rows) {
    const x = rows.map(r => r.date), y5 = rows.map(r => r.dgs5), y10 = rows.map(r => r.dgs10);
    const spread = rows.map(r => r.dgs10 - r.dgs5);
    const markerDates = rows.filter(r => r.dgs10 - r.dgs5 < 0).map(r => r.date);
    const negative = rows.filter(r => r.dgs10 - r.dgs5 < 0).map(r => r.dgs10 - r.dgs5);
    plot("chart-historical-yields", [
      { x, y: y5, type: "scatter", mode: "lines", name: "5Y Treasury",
        line: { color: BRAND.five, width: 2.3 }, hovertemplate: "%{y:.2f}%<extra>5Y</extra>" },
      { x, y: y10, type: "scatter", mode: "lines", name: "10Y Treasury",
        line: { color: BRAND.ten, width: 2.3 }, hovertemplate: "%{y:.2f}%<extra>10Y</extra>" }
    ], "Yield (%)");
    plot("chart-historical-spread", [
      { x, y: spread, type: "scatter", mode: "lines", name: "10Y − 5Y",
        line: { color: BRAND.five, width: 2.2 }, hovertemplate: "%{y:.2f} pp<extra>Spread</extra>" },
      { x: markerDates, y: negative, type: "scatter", mode: "markers", name: "Inverted",
        marker: { color: BRAND.red, size: 5 }, hovertemplate: "%{y:.2f} pp<extra>Inverted</extra>" }
    ], "Spread (pp)", {
      shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 0, y1: 0,
        line: { color: BRAND.red, width: 1.4, dash: "dot" } }]
    });
  }

  function renderScenario(state) {
    const base = lastRow();
    const result = M.project(base, state.delta, state.beta5, state.beta10, state.horizon, state.corridor);
    const p = result.path, dates = p.map(r => r.date);
    byId("kpi-5").textContent = percent(base.dgs5);
    byId("kpi-10").textContent = percent(base.dgs10);
    byId("kpi-base-spread").textContent = bp(base.dgs10 - base.dgs5);
    byId("kpi-terminal").textContent = bp(result.terminal.spread);
    const msg = !result.crossing ? "No central-path inversion in this scenario."
      : result.crossing.kind === "already" ? "Curve is already inverted at the baseline."
      : "Illustrative zero crossing: month " + nice(result.crossing.month, 1) + " of " + state.horizon + ".";
    byId("kpi-crossing").textContent = msg;
    plot("chart-projected-yields", [
      { x: dates, y: p.map(r => r.y5), type: "scatter", mode: "lines+markers", name: "5Y scenario",
        line: { color: BRAND.five, width: 2.4 }, marker: { size: 4 },
        hovertemplate: "%{y:.2f}%<extra>5Y (hypothetical)</extra>" },
      { x: dates, y: p.map(r => r.y10), type: "scatter", mode: "lines+markers", name: "10Y scenario",
        line: { color: BRAND.ten, width: 2.4 }, marker: { size: 4 },
        hovertemplate: "%{y:.2f}%<extra>10Y (hypothetical)</extra>" }
    ], "Illustrative yield (%)", { xaxis: { tickformat: "%b %Y", type: "date", showgrid: false } });
    plot("chart-projected-spread", [
      { x: dates, y: p.map(r => r.lower), type: "scatter", mode: "lines",
        name: "Sensitivity range", line: { width: 0 }, hoverinfo: "skip", showlegend: false },
      { x: dates, y: p.map(r => r.upper), type: "scatter", mode: "lines",
        name: "Illustrative ± corridor", fill: "tonexty", fillcolor: "rgba(54,89,119,0.12)",
        line: { width: 0 }, hoverinfo: "skip" },
      { x: dates, y: p.map(r => r.spread), type: "scatter", mode: "lines+markers",
        name: "Central assumed path", line: { width: 2.5, color: BRAND.ten },
        marker: { size: 4 }, hovertemplate: "%{y:.2f} pp<extra>Hypothetical spread</extra>" }
    ], "10Y − 5Y (pp)", {
      xaxis: { tickformat: "%b %Y", type: "date", showgrid: false },
      shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 0, y1: 0,
        line: { color: BRAND.red, width: 1.4, dash: "dash" } }]
    });
  }

  function render() {
    if (!snapshot || !window.Plotly) return;
    const state = readControls(), selected = period(snapshot.observations);
    byId("delta-value").textContent = (state.delta < 0 ? "−" : state.delta > 0 ? "+" : "") +
      Math.abs(state.delta) + " bps";
    byId("beta5-value").textContent = nice(state.beta5) + "×";
    byId("beta10-value").textContent = nice(state.beta10) + "×";
    byId("corridor-value").textContent = state.corridor + " bps";
    fitted = M.fitSensitivities(selected);
    byId("fit-summary").textContent = fitted
      ? "Selected history: " + fitted.samples + " consecutive month-to-month changes · 5Y " +
        nice(fitted.beta5) + "× · 10Y " + nice(fitted.beta10) + "×."
      : "Insufficient month-to-month policy-rate variation for an informative OLS estimate.";
    byId("apply-fit").disabled = !fitted;
    renderHistory(selected);
    renderScenario(state);
  }

  function initControls() {
    Object.values(ids).forEach(id => byId(id).addEventListener("input", render));
    byId("reset").addEventListener("click", () => {
      setControls();
      byId("fit-message").textContent = "Manual scenario assumptions reset; historical fit remains informational.";
      render();
    });
    byId("apply-fit").addEventListener("click", () => {
      if (!fitted) return;
      if ([fitted.beta5, fitted.beta10].some(n => n < -1 || n > 2)) {
        byId("fit-message").textContent = "Historical fitted values exceed the slider range. Keep manual assumptions or select a different history window.";
        return;
      }
      byId("beta5").value = (Math.round(fitted.beta5 / 0.05) * 0.05).toFixed(2);
      byId("beta10").value = (Math.round(fitted.beta10 / 0.05) * 0.05).toFixed(2);
      byId("fit-message").textContent = "Loaded rounded historical co-movement estimates. These are still assumptions, not causal forecasts.";
      render();
    });
    setControls();
  }

  async function init() {
    initControls();
    try {
      if (!window.Plotly || !M) throw new Error("Chart library unavailable. Reload with an internet connection.");
      const response = await fetch("./data.json", { cache: "no-store" });
      if (!response.ok) throw new Error("FRED snapshot missing. Run python scripts/export_week_06.py.");
      const data = await response.json();
      const rows = data.observations;
      if (data.status !== "ready" || !Array.isArray(rows) || rows.length < 36 ||
          rows.some(r => ![r.dgs5, r.dgs10, r.policy].every(Number.isFinite))) {
        throw new Error("Historical data have not been refreshed or failed validation.");
      }
      snapshot = data;
      byId("data-date").textContent = data.latest_synchronized_daily_observation;
      byId("data-refresh").textContent = "FRED snapshot retrieved " + data.retrieved_utc.slice(0, 10) + " (UTC)";
      render();
    } catch (error) {
      byId("data-date").textContent = "Unavailable";
      byId("data-error").hidden = false;
      byId("data-error").textContent = String(error.message || error) +
        " Scenarios are disabled instead of substituting invented observations.";
      byId("fit-summary").textContent = "Awaiting verified historical data.";
    }
  }
  init();
})();
