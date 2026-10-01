/* FINC-560 Week 6: observed history and illustrative scenarios never share provenance. */
(() => {
  "use strict";
  const M = window.YieldModel;
  const byId = id => document.getElementById(id);
  const COLOR = { historical: "#314b5c", central: "#0b7f73", bound: "#798d9b", warning: "#b84253" };
  const DEFAULT = { delta: -50, beta5: 0.65, beta10: 0.30, corridor: 25, horizon: 12, history: "10", chartMonths: 24 };
  const CONTROL = { delta: "delta", beta5: "beta5", beta10: "beta10", corridor: "corridor", horizon: "horizon" };
  const CHART_IDS = ["chart-five", "chart-ten", "chart-spread"];
  const latestPlots = new Map(), pendingPlots = new Map(), drawing = new Set();
  let snapshot = null, fitted = null, scenarioFrame = null;

  const nice = (n, digits = 2) => Number(n).toFixed(digits);
  const percent = n => nice(n) + "%";
  const basisPoints = n => (n < 0 ? "−" : "+") + nice(Math.abs(n * 100), 0) + " bps";
  const current = () => snapshot.observations[snapshot.observations.length - 1];
  const input = key => Number(byId(CONTROL[key]).value);
  const assumptions = () => ({
    delta: input("delta"), beta5: input("beta5"), beta10: input("beta10"),
    corridor: input("corridor"), horizon: input("horizon")
  });
  const visible = id => !byId(id).closest(".chart-card").classList.contains("is-view-hidden");

  async function flushPlot(id) {
    if (drawing.has(id)) return;
    drawing.add(id);
    try {
      while (pendingPlots.has(id)) {
        const next = pendingPlots.get(id);
        pendingPlots.delete(id);
        await window.Plotly.react(id, next.traces, next.layout, {
          responsive: true, displayModeBar: false, displaylogo: false, scrollZoom: false
        });
      }
    } catch (error) {
      byId("data-error").hidden = false;
      byId("data-error").textContent = "Unable to update chart: " + (error.message || String(error));
    } finally {
      drawing.delete(id);
    }
  }

  // Two independent date axes with equal VISUAL space. A 24-month observed
  // period is NOT presented as the same time scale as a 12-month scenario.
  function plotCombined(id, historical, path, label, isSpread) {
    const historyX = historical.map(r => r.date);
    const historyY = historical.map(r => isSpread ? r.dgs10 - r.dgs5
      : id === "chart-five" ? r.dgs5 : r.dgs10);
    const metric = isSpread ? "spread" : id === "chart-five" ? "dgs5" : "dgs10";
    const bands = M.scenarioBands(path, metric);
    const dates = bands.map(r => r.date);
    const unit = isSpread ? "pp" : "%";
    const zeroOrBound = isSpread ? [...historyY, ...bands.flatMap(r => [r.low, r.high]), 0]
      : [...historyY, ...bands.flatMap(r => [r.low, r.high])];
    const ymin = Math.min(...zeroOrBound), ymax = Math.max(...zeroOrBound);
    const pad = Math.max((ymax - ymin) * 0.11, isSpread ? 0.065 : 0.14);
    const traces = [
      { x: historyX, y: historyY, type: "scatter", mode: "lines", name: "Observed",
        line: { color: COLOR.historical, width: 2.2 },
        hovertemplate: "%{x|%b %Y}: %{y:.2f} " + unit + "<extra>FRED observed</extra>" },
      { x: dates, y: bands.map(r => r.low), xaxis: "x2", type: "scatter", mode: "lines",
        name: "Lower scenario", line: { color: COLOR.bound, width: 1.3, dash: "dot" },
        hovertemplate: "%{x|%b %Y}: %{y:.2f} " + unit + "<extra>Lower (illustrative)</extra>" },
      { x: dates, y: bands.map(r => r.high), xaxis: "x2", type: "scatter", mode: "lines",
        name: "Upper scenario", fill: "tonexty", fillcolor: "rgba(11,127,115,0.09)",
        line: { color: COLOR.bound, width: 1.3, dash: "dot" },
        hovertemplate: "%{x|%b %Y}: %{y:.2f} " + unit + "<extra>Upper (illustrative)</extra>" },
      { x: dates, y: bands.map(r => r.center), xaxis: "x2", type: "scatter", mode: "lines",
        name: "Central assumption", line: { color: COLOR.central, width: 2.7 },
        hovertemplate: "%{x|%b %Y}: %{y:.2f} " + unit + "<extra>Central (hypothetical)</extra>" }
    ];
    const layout = {
      autosize: true, height: byId(id).clientHeight || 350,
      margin: { l: 55, r: 17, t: 67, b: 44 },
      paper_bgcolor: "#fff", plot_bgcolor: "#fff",
      font: { family: "Inter, system-ui, sans-serif", size: 11, color: "#465865" },
      hovermode: "closest", showlegend: true,
      legend: { orientation: "h", x: .5, xanchor: "center", y: 1.11,
        font: { size: 10 }, itemwidth: 35 },
      xaxis: {
        type: "date", domain: [0, .475], anchor: "y", showgrid: false,
        tickformat: "%b '%y", nticks: 5, linecolor: "#dfe3e6", automargin: true,
        tickfont: { size: 10 }
      },
      xaxis2: {
        type: "date", domain: [.525, 1], anchor: "y", showgrid: false,
        tickformat: "%b '%y", nticks: 5, linecolor: "#dfe3e6", automargin: true,
        tickfont: { size: 10 }
      },
      yaxis: { title: { text: label, font: { size: 11 } },
        range: [ymin - pad, ymax + pad], zeroline: false, automargin: true,
        gridcolor: "#edf1f2" },
      annotations: [
        { x: .2375, xref: "paper", y: 1.02, yref: "paper", showarrow: false,
          text: "<b>OBSERVED</b> · " + historical.length + " months", font: { size: 10, color: COLOR.historical } },
        { x: .7625, xref: "paper", y: 1.02, yref: "paper", showarrow: false,
          text: "<b>HYPOTHETICAL</b> · " + (path.length - 1) + " months", font: { size: 10, color: COLOR.central } }
      ],
      shapes: [
        { type: "rect", xref: "paper", yref: "paper", x0: .525, x1: 1, y0: 0, y1: 1,
          fillcolor: "rgba(11,127,115,.023)", line: { width: 0 }, layer: "below" },
        { type: "line", xref: "paper", yref: "paper", x0: .5, x1: .5, y0: 0, y1: 1,
          line: { color: "#aab8bb", width: 1.2, dash: "dash" } },
        // Make the common starting value visually legible across the time-axis break.
        { type: "line", xref: "paper", yref: "y", x0: .475, x1: .525,
          y0: historyY[historyY.length - 1], y1: historyY[historyY.length - 1],
          line: { color: COLOR.historical, width: 1.2, dash: "dot" } }
      ]
    };
    if (isSpread) layout.shapes.push({
      type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: 0, y1: 0,
      line: { color: COLOR.warning, width: 1.4, dash: "dash" }
    });
    latestPlots.set(id, { traces, layout });
    if (visible(id)) {
      pendingPlots.set(id, { traces, layout });
      void flushPlot(id);
    }
  }

  function renderCharts() {
    if (!snapshot || !window.Plotly) return;
    const months = Number(byId("chart-context").value);
    const historical = snapshot.observations.slice(-months);
    const state = assumptions();
    const result = M.project(current(), state.delta, state.beta5, state.beta10, state.horizon, state.corridor);
    plotCombined("chart-five", historical, result.path, "Yield (%)", false);
    plotCombined("chart-ten", historical, result.path, "Yield (%)", false);
    plotCombined("chart-spread", historical, result.path, "Spread (pp)", true);
  }

  function updateSummary() {
    const state = assumptions();
    byId("delta-value").textContent = (state.delta < 0 ? "−" : state.delta > 0 ? "+" : "") +
      Math.abs(state.delta) + " bps";
    byId("beta5-value").textContent = nice(state.beta5) + "×";
    byId("beta10-value").textContent = nice(state.beta10) + "×";
    byId("corridor-value").textContent = state.corridor + " bps";
    if (!snapshot) return;
    const base = current();
    const result = M.project(base, state.delta, state.beta5, state.beta10, state.horizon, state.corridor);
    byId("kpi-5").textContent = percent(base.dgs5);
    byId("kpi-10").textContent = percent(base.dgs10);
    byId("kpi-base-spread").textContent = basisPoints(base.dgs10 - base.dgs5);
    byId("kpi-terminal").textContent = basisPoints(result.terminal.spread);
    byId("preview-five").textContent = percent(result.terminal.y5);
    byId("preview-ten").textContent = percent(result.terminal.y10);
    byId("preview-spread").textContent = basisPoints(result.terminal.spread);
    byId("preview-spread").classList.toggle("is-inverted", result.terminal.spread < 0);
    const change = result.terminal.spread - (base.dgs10 - base.dgs5);
    const direction = state.delta < 0 ? Math.abs(state.delta) + "-bp cumulative cut" :
      state.delta > 0 ? state.delta + "-bp cumulative increase" : "unchanged policy rate";
    byId("scenario-status").textContent = "Modeled " + direction + " over " + state.horizon +
      " months changes the central spread by " + basisPoints(change) +
      ". Dotted bounds are manual sensitivity settings, not probabilities.";
    const gap = state.beta10 - state.beta5;
    const flat = Math.abs(gap) < 1e-9 ? null : -(base.dgs10 - base.dgs5) * 100 / gap;
    const explanation = result.crossing?.kind === "already" ? "Already inverted at the baseline." :
      result.crossing?.kind === "crossing"
        ? "Illustrative central-path zero crossing: month " + nice(result.crossing.month, 1) + "." :
        flat === null ? "Parallel responses cannot change the spread." :
        "No central-path inversion. Zero would require " +
        (flat < 0 ? "−" : "+") + Math.round(Math.abs(flat)) + " bps under these assumptions.";
    byId("kpi-crossing").textContent = explanation;
    byId("kpi-crossing").title = explanation;
  }

  function renderFit() {
    if (!snapshot) return;
    fitted = M.fitSensitivities(M.lastYears(snapshot.observations, byId("history-window").value));
    byId("fit-summary").textContent = fitted ?
      fitted.samples + " consecutive monthly differences · 5Y " + nice(fitted.beta5) +
      "× · 10Y " + nice(fitted.beta10) + "×." :
      "Too little month-to-month policy variation for this OLS estimate.";
    byId("apply-fit").disabled = !fitted;
  }

  function scheduleScenarioRender() {
    updateSummary(); // immediate, even when charts are asynchronously drawing
    if (scenarioFrame !== null) return;
    scenarioFrame = window.requestAnimationFrame(() => {
      scenarioFrame = null;
      renderCharts();
    });
  }

  function showChartView() {
    const primary = byId("chart-primary").value;
    const comparing = byId("mode-compare").getAttribute("aria-pressed") === "true";
    let secondary = byId("chart-secondary").value;
    if (comparing && primary === secondary) {
      secondary = CHART_IDS.find(id => id !== primary);
      byId("chart-secondary").value = secondary;
    }
    const selected = comparing ? [primary, secondary] : [primary];
    byId("compare-choice").hidden = !comparing;
    byId("primary-chart-label").textContent = comparing ? "Left" : "Chart";
    byId("chart-stage").classList.toggle("is-compare", comparing);
    CHART_IDS.forEach(id => {
      const card = byId(id).closest(".chart-card");
      card.classList.toggle("is-view-hidden", !selected.includes(id));
      card.setAttribute("aria-hidden", String(!selected.includes(id)));
    });
    selected.slice().reverse().forEach(id => byId("chart-stage").prepend(byId(id).closest(".chart-card")));
    window.requestAnimationFrame(() => selected.forEach(id => {
      const cached = latestPlots.get(id);
      if (!cached) return;
      const fresh = { ...cached.layout, height: byId(id).clientHeight || 340 };
      pendingPlots.set(id, { traces: cached.traces, layout: fresh });
      void flushPlot(id);
    }));
  }

  function initChartSwitcher() {
    ["single", "compare"].forEach(mode => byId("mode-" + mode).addEventListener("click", () => {
      ["single", "compare"].forEach(m => {
        const active = m === mode;
        byId("mode-" + m).setAttribute("aria-pressed", String(active));
        byId("mode-" + m).classList.toggle("is-active", active);
      });
      showChartView();
    }));
    byId("chart-primary").addEventListener("change", showChartView);
    byId("chart-secondary").addEventListener("change", showChartView);
    byId("chart-context").addEventListener("change", renderCharts);
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        CHART_IDS.filter(visible).forEach(id => {
          const cached = latestPlots.get(id);
          if (!cached) return;
          pendingPlots.set(id, { ...cached, layout: { ...cached.layout, height: byId(id).clientHeight || 340 } });
          void flushPlot(id);
        });
      }, 130);
    });
    showChartView();
  }

  function setControls() {
    Object.entries(DEFAULT).forEach(([key, value]) => {
      const id = CONTROL[key] || (key === "history" ? "history-window" : key === "chartMonths" ? "chart-context" : null);
      if (id) byId(id).value = String(value);
    });
  }

  async function init() {
    setControls();
    initChartSwitcher();
    Object.values(CONTROL).forEach(id => {
      byId(id).addEventListener("input", scheduleScenarioRender);
      byId(id).addEventListener("change", scheduleScenarioRender);
    });
    byId("history-window").addEventListener("change", renderFit);
    byId("reset").addEventListener("click", () => {
      setControls();
      byId("fit-message").textContent = "Manual assumptions restored.";
      renderFit(); updateSummary(); renderCharts();
    });
    byId("apply-fit").addEventListener("click", () => {
      if (!fitted) return;
      if ([fitted.beta5, fitted.beta10].some(n => n < -1 || n > 2)) {
        byId("fit-message").textContent = "Fitted response exceeds slider limits; retain manual assumptions.";
        return;
      }
      byId("beta5").value = (Math.round(fitted.beta5 / .05) * .05).toFixed(2);
      byId("beta10").value = (Math.round(fitted.beta10 / .05) * .05).toFixed(2);
      byId("fit-message").textContent = "Historical co-movement loaded. Still not a causal Fed-policy estimate.";
      updateSummary(); renderCharts();
    });
    try {
      if (!window.Plotly || !M) throw new Error("Plotly or scenario model unavailable.");
      const response = await fetch("./data.json", { cache: "no-store" });
      if (!response.ok) throw new Error("FRED data unavailable. Run python scripts/export_week_06.py.");
      const data = await response.json();
      if (data.status !== "ready" || !Array.isArray(data.observations) || data.observations.length < 36 ||
          data.observations.some(r => ![r.dgs5, r.dgs10, r.policy].every(Number.isFinite))) {
        throw new Error("FRED snapshot failed validation.");
      }
      snapshot = data;
      byId("data-date").textContent = data.latest_synchronized_daily_observation;
      byId("data-refresh").textContent = "FRED snapshot retrieved " + data.retrieved_utc.slice(0, 10) + " (UTC)";
      renderFit(); updateSummary(); renderCharts();
    } catch (error) {
      byId("data-date").textContent = "Unavailable";
      byId("data-error").hidden = false;
      byId("data-error").textContent = String(error.message || error) +
        " No synthetic historical rates have been substituted.";
    }
  }
  init();
})();
