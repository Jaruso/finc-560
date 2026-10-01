/* FINC-560: one honest calendar axis for historical data and hypothetical scenarios. */
(() => {
  "use strict";
  const M = window.YieldModel;
  const byId = id => document.getElementById(id);
  const COLOR = { historical: "#314b5c", central: "#0b7f73", bound: "#798d9b", warning: "#b84253" };
  const DEFAULT = { delta: -50, beta5: 0.65, beta10: 0.30, corridor: 25,
    horizon: 12, history: "10", chartMonths: "120" };
  const CONTROL = { delta: "delta", beta5: "beta5", beta10: "beta10", corridor: "corridor", horizon: "horizon" };
  const CHART_IDS = ["chart-five", "chart-ten", "chart-spread"];
  const latestPlots = new Map(), pendingPlots = new Map(), drawing = new Set();
  let snapshot = null, fitted = null, scenarioFrame = null, focused = false;

  const nice = (n, digits = 2) => Number(n).toFixed(digits);
  const percent = n => nice(n) + "%";
  const basisPoints = n => (n < 0 ? "−" : "+") + nice(Math.abs(n * 100), 0) + " bps";
  const current = () => snapshot.observations[snapshot.observations.length - 1];
  const input = key => Number(byId(CONTROL[key]).value);
  const assumptions = () => ({ delta: input("delta"), beta5: input("beta5"),
    beta10: input("beta10"), corridor: input("corridor"), horizon: input("horizon") });
  const visible = id => !byId(id).closest(".chart-card").classList.contains("is-view-hidden");
  const historyRows = () => {
    const months = byId("chart-context").value;
    return months === "all" ? snapshot.observations : snapshot.observations.slice(-Number(months));
  };
  const monthOffset = (iso, months) => {
    const d = new Date(String(iso).slice(0, 7) + "-01T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + months);
    return d.toISOString().slice(0, 10);
  };

  // Plotly.react isn't reentrant: discard queued obsolete frames and render
  // only the latest interaction. Each chart is cached until selected.
  async function flushPlot(id) {
    if (drawing.has(id)) return;
    drawing.add(id);
    try {
      while (pendingPlots.has(id)) {
        const next = pendingPlots.get(id);
        pendingPlots.delete(id);
        await window.Plotly.react(id, next.traces, next.layout, {
          responsive: true, displayModeBar: true, displaylogo: false, scrollZoom: false,
          modeBarButtonsToRemove: ["select2d", "lasso2d", "hoverCompareCartesian"]
        });
      }
    } catch (error) {
      byId("data-error").hidden = false;
      byId("data-error").textContent = "Unable to update chart: " + (error.message || String(error));
    } finally {
      drawing.delete(id);
    }
  }
  function queuePlot(id, traces, layout) {
    latestPlots.set(id, { traces, layout });
    if (visible(id)) {
      pendingPlots.set(id, { traces, layout });
      void flushPlot(id);
    }
  }

  function plotContinuous(id, historical, path, label, spread) {
    const metric = spread ? "spread" : id === "chart-five" ? "dgs5" : "dgs10";
    const observedY = historical.map(r => spread ? r.dgs10 - r.dgs5 :
      metric === "dgs5" ? r.dgs5 : r.dgs10);
    const observedX = historical.map(r => r.date);
    const bands = M.scenarioBands(path, metric);
    const forecastX = bands.map(r => r.date);
    const baseDate = forecastX[0], endDate = forecastX[forecastX.length - 1];
    const defaultStart = observedX[0];
    const focusHistory = Math.min(historical.length - 1, Math.max(12, path.length - 1));
    const focusedStart = historical[Math.max(0, historical.length - 1 - focusHistory)].date;
    const rangeStart = focused ? focusedStart : defaultStart;
    // Same genuine UTC calendar axis from first observed date to scenario end:
    // boundary position follows elapsed months; no 50/50 date distortion.
    const boundaryFraction = (Date.parse(baseDate) - Date.parse(rangeStart)) /
      (Date.parse(endDate) - Date.parse(rangeStart));
    const plotHistorical = focused
      ? observedY.slice(Math.max(0, historical.length - 1 - focusHistory)) : observedY;
    const unit = spread ? "pp" : "%";
    const inView = spread
      ? [...plotHistorical, ...bands.flatMap(r => [r.low, r.high]), 0]
      : [...plotHistorical, ...bands.flatMap(r => [r.low, r.high])];
    const ymin = Math.min(...inView), ymax = Math.max(...inView);
    const padding = Math.max((ymax - ymin) * 0.11, spread ? 0.065 : 0.14);
    const traces = [
      { x: observedX, y: observedY, type: "scatter", mode: "lines",
        name: "Observed", line: { color: COLOR.historical, width: 2.25 },
        hovertemplate: "%{x|%b %Y}: %{y:.2f} " + unit + "<extra>FRED observed</extra>" },
      { x: forecastX, y: bands.map(r => r.low), type: "scatter", mode: "lines",
        name: "Lower scenario", line: { color: COLOR.bound, width: 1.4, dash: "dot" },
        hovertemplate: "%{x|%b %Y}: %{y:.2f} " + unit + "<extra>Lower (illustrative)</extra>" },
      { x: forecastX, y: bands.map(r => r.high), type: "scatter", mode: "lines",
        name: "Upper scenario", fill: "tonexty", fillcolor: "rgba(11,127,115,0.09)",
        line: { color: COLOR.bound, width: 1.4, dash: "dot" },
        hovertemplate: "%{x|%b %Y}: %{y:.2f} " + unit + "<extra>Upper (illustrative)</extra>" },
      { x: forecastX, y: bands.map(r => r.center), type: "scatter", mode: "lines",
        name: "Central assumption", line: { color: COLOR.central, width: 2.7 },
        hovertemplate: "%{x|%b %Y}: %{y:.2f} " + unit + "<extra>Central (hypothetical)</extra>" }
    ];
    const layout = {
      autosize: true, height: byId(id).clientHeight || 350,
      margin: { l: 55, r: 16, t: 68, b: 47 },
      paper_bgcolor: "#fff", plot_bgcolor: "#fff",
      font: { family: "Inter, system-ui, sans-serif", size: 11, color: "#465865" },
      hovermode: "closest", showlegend: true,
      legend: { orientation: "h", x: 0.5, xanchor: "center", y: 1.12,
        font: { size: 10 }, itemwidth: 35 },
      xaxis: {
        type: "date", range: [rangeStart, endDate], showgrid: false,
        tickformat: "%b '%y", nticks: focused ? 8 : 10,
        linecolor: "#dfe3e6", tickfont: { size: 10 }, automargin: true
      },
      yaxis: {
        title: { text: label, font: { size: 11 } },
        range: [ymin - padding, ymax + padding], zeroline: false,
        gridcolor: "#edf1f2", automargin: true
      },
      annotations: [
        { x: baseDate, xref: "x", y: 1.045, yref: "paper", showarrow: false,
          xanchor: "right", text: "<b>OBSERVED</b>",
          font: { size: 10, color: COLOR.historical } },
        { x: endDate, xref: "x", y: 1.045, yref: "paper", showarrow: false,
          xanchor: "right", text: "<b>HYPOTHETICAL</b>",
          font: { size: 10, color: COLOR.central } }
      ],
      shapes: [
        { type: "rect", xref: "x", yref: "paper", x0: baseDate, x1: endDate,
          y0: 0, y1: 1, fillcolor: "rgba(11,127,115,0.045)",
          line: { width: 0 }, layer: "below" },
        { type: "line", xref: "x", yref: "paper", x0: baseDate, x1: baseDate,
          y0: 0, y1: 1, line: { color: "#93a9a8", width: 1.4, dash: "dash" } }
      ],
      meta: {
        observedStart: defaultStart,
        forecastStart: baseDate,
        forecastEnd: endDate,
        boundaryFraction,
        viewStart: rangeStart,
        equalTimeScale: true,
        focused
      }
    };
    if (spread) layout.shapes.push({
      type: "line", xref: "x", yref: "y", x0: rangeStart, x1: endDate,
      y0: 0, y1: 0, line: { color: COLOR.warning, width: 1.3, dash: "dash" }
    });
    queuePlot(id, traces, layout);
  }

  function renderCharts() {
    if (!snapshot || !window.Plotly) return;
    const rows = historyRows();
    const state = assumptions();
    const result = M.project(current(), state.delta, state.beta5, state.beta10,
      state.horizon, state.corridor);
    plotContinuous("chart-five", rows, result.path, "Yield (%)", false);
    plotContinuous("chart-ten", rows, result.path, "Yield (%)", false);
    plotContinuous("chart-spread", rows, result.path, "Spread (pp)", true);

    const historyText = byId("chart-context").selectedOptions[0].textContent.trim();
    const baseText = new Date(result.path[0].date + "T00:00:00Z")
      .toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
    byId("axis-explanation").textContent = focused
      ? "Focused: most recent " + Math.max(1, Math.min(rows.length - 1, Math.max(12, state.horizon))) +
        " months before " + baseText + " and " + state.horizon + " hypothetical months after. One continuous date scale."
      : historyText + " of observed data ending " + baseText + " → " +
        state.horizon + " hypothetical months. One continuous date scale: short projections appear narrow alongside long history. Focus projection for detail.";
  }

  function updateSummary() {
    const state = assumptions();
    byId("delta-value").textContent = (state.delta < 0 ? "−" :
      state.delta > 0 ? "+" : "") + Math.abs(state.delta) + " bps";
    byId("beta5-value").textContent = nice(state.beta5) + "×";
    byId("beta10-value").textContent = nice(state.beta10) + "×";
    byId("corridor-value").textContent = state.corridor + " bps";
    if (!snapshot) return;
    const base = current();
    const result = M.project(base, state.delta, state.beta5, state.beta10,
      state.horizon, state.corridor);
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
    updateSummary();
    if (scenarioFrame !== null) return;
    scenarioFrame = window.requestAnimationFrame(() => {
      scenarioFrame = null;
      renderCharts();
    });
  }

  function showChartView() {
    const selected = byId("chart-primary").value;
    CHART_IDS.forEach(id => {
      const card = byId(id).closest(".chart-card");
      card.classList.toggle("is-view-hidden", selected !== id);
      card.setAttribute("aria-hidden", String(selected !== id));
    });
    byId("chart-stage").prepend(byId(selected).closest(".chart-card"));
    window.requestAnimationFrame(() => {
      const cached = latestPlots.get(selected);
      if (!cached) return;
      pendingPlots.set(selected, {
        traces: cached.traces,
        layout: { ...cached.layout, height: byId(selected).clientHeight || 340 }
      });
      void flushPlot(selected);
    });
  }
  function initChartSwitcher() {
    byId("chart-primary").addEventListener("change", showChartView);
    byId("chart-context").addEventListener("change", renderCharts);
    byId("focus-projection").addEventListener("click", () => {
      focused = !focused;
      byId("focus-projection").setAttribute("aria-pressed", String(focused));
      byId("focus-projection").textContent = focused ? "Show full timeline" : "Focus projection";
      renderCharts();
    });
    let timer;
    window.addEventListener("resize", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const selected = byId("chart-primary").value;
        const cached = latestPlots.get(selected);
        if (!cached) return;
        pendingPlots.set(selected, {
          traces: cached.traces,
          layout: { ...cached.layout, height: byId(selected).clientHeight || 340 }
        });
        void flushPlot(selected);
      }, 150);
    });
    showChartView();
  }
  function setControls() {
    Object.entries(DEFAULT).forEach(([key, value]) => {
      const id = CONTROL[key] || (key === "history" ? "history-window" :
        key === "chartMonths" ? "chart-context" : null);
      if (id) byId(id).value = String(value);
    });
    focused = false;
    byId("focus-projection").setAttribute("aria-pressed", "false");
    byId("focus-projection").textContent = "Focus projection";
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
      byId("beta5").value = (Math.round(fitted.beta5 / 0.05) * 0.05).toFixed(2);
      byId("beta10").value = (Math.round(fitted.beta10 / 0.05) * 0.05).toFixed(2);
      byId("fit-message").textContent = "Historical co-movement loaded. Still not a causal Fed-policy estimate.";
      updateSummary(); renderCharts();
    });
    try {
      if (!window.Plotly || !M) throw new Error("Plotly or scenario model unavailable.");
      const response = await fetch("./data.json", { cache: "no-store" });
      if (!response.ok) throw new Error("FRED data unavailable. Run python scripts/export_week_06.py.");
      const data = await response.json();
      if (data.status !== "ready" || !Array.isArray(data.observations) ||
          data.observations.length < 36 ||
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
