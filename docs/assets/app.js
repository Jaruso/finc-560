const tabsContainer = document.querySelector(".tabs");
const assignmentsContainer = document.querySelector("#assignments");
const ASSET_VERSION = "20260910-margin-bars";
const manifestUrl = `assets/plots-manifest.json?v=${ASSET_VERSION}`;
const mobilePlotQuery = window.matchMedia("(max-width: 760px)");
const mobilePlotSlugs = new Set([
  "dtc-profitability-bridge",
  "linear-vs-dtc-operating-income",
]);
const chartTermNotes = new Map([
  [
    "dtc-profitability-bridge",
    "OpEx = operating expenses · SG&A = selling, general and administrative expenses · D&A = depreciation and amortization",
  ],
]);

function setActiveTab(tabId) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === tabId);
  });

  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === tabId);
  });

  if (location.hash.slice(1) !== tabId) {
    history.replaceState(null, "", `#${tabId}`);
  }
}

function removeSourceAnnotations(frame) {
  try {
    const doc = frame.contentDocument;
    doc.querySelectorAll(".annotation").forEach((annotation) => {
      if (String(annotation.textContent || "").trim().startsWith("Source:")) {
        annotation.remove();
      }
    });
  } catch {
    // Cross-frame access should be same-origin on GitHub Pages; fail quietly if unavailable.
  }
}

function resizeFrame(frame) {
  try {
    removeSourceAnnotations(frame);
    const doc = frame.contentDocument;
    const graph = doc.querySelector(".plotly-graph-div");
    const graphHeight = graph?.getBoundingClientRect().height;
    const documentHeight = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
    const height = Math.ceil(graphHeight || documentHeight);
    frame.style.height = `${height + 2}px`;
  } catch {
    frame.style.height = "420px";
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function mobileSourceAnnotation(annotation) {
  if (!String(annotation.text || "").startsWith("Source:")) return annotation;
  return {
    ...annotation,
    x: 0,
    y: -0.29,
    xanchor: "left",
    yanchor: "top",
    font: { ...(annotation.font || {}), size: 8 },
  };
}

function mobileDriverLayout(baseLayout) {
  const layout = cloneJson(baseLayout);
  layout.height = 370;
  layout.margin = { t: 48, r: 24, b: 88, l: 78 };
  layout.xaxis = {
    ...(layout.xaxis || {}),
    title: { text: "" },
    tickmode: "array",
    tickvals: [-500, 0, 1000, 2000, 3000],
    ticktext: ["−0.5B", "0", "1B", "2B", "3B"],
    tickangle: 0,
    tickfont: { size: 10 },
  };
  layout.yaxis = {
    ...(layout.yaxis || {}),
    tickmode: "array",
    tickvals: ["Revenue growth", "Lower operating expenses", "Higher SG&A", "Lower D&A"],
    ticktext: ["Revenue", "OpEx", "SG&A", "D&A"],
    tickfont: { size: 11 },
  };
  layout.annotations = (layout.annotations || []).map((annotation) => {
    const updated = mobileSourceAnnotation(annotation);
    if (String(updated.text || "").includes("Net improvement")) {
      return { ...updated, x: 0.5, xanchor: "center", y: 1.09 };
    }
    return updated;
  });
  return layout;
}

function mobileDriverData(baseData) {
  const data = cloneJson(baseData);
  data.forEach((trace) => {
    if (trace.type !== "bar" || trace.orientation !== "h") return;
    trace.text = ["+$2.89B", "+$111M", "−$406M", "+$44M"];
    trace.textposition = ["inside", "outside", "inside", "outside"];
    trace.insidetextanchor = "middle";
    trace.insidetextfont = { ...(trace.insidetextfont || {}), color: "#ffffff", size: 10 };
    trace.outsidetextfont = { ...(trace.outsidetextfont || {}), color: "#17212b", size: 10 };
    trace.cliponaxis = false;
  });
  return data;
}

function addMobileRowLabels(layout) {
  layout.annotations = [
    ...(layout.annotations || []),
    {
      xref: "paper",
      x: 0.01,
      xanchor: "left",
      yref: "y",
      y: 1,
      yshift: 31,
      text: "<b>Linear Networks</b>",
      showarrow: false,
      font: { size: 11, color: "#17212b" },
    },
    {
      xref: "paper",
      x: 0.01,
      xanchor: "left",
      yref: "y",
      y: 0,
      yshift: 31,
      text: "<b>Streaming (DTC)</b>",
      showarrow: false,
      font: { size: 11, color: "#17212b" },
    },
  ];
}

function mobileDumbbellLayout(baseLayout, slug) {
  const layout = cloneJson(baseLayout);
  layout.height = 340;
  layout.margin = { t: 58, r: 18, b: 86, l: 22 };
  layout.yaxis = {
    ...(layout.yaxis || {}),
    showticklabels: false,
    ticks: "",
  };

  if (slug === "linear-vs-dtc-operating-income") {
    layout.xaxis = {
      ...(layout.xaxis || {}),
      title: { text: "" },
      tickmode: "array",
      tickvals: [-2000, 0, 2000, 4000],
      ticktext: ["−$2B", "$0", "$2B", "$4B"],
      tickangle: 0,
      tickfont: { size: 10 },
    };
  } else {
    layout.xaxis = {
      ...(layout.xaxis || {}),
      title: { text: "" },
      tickmode: "array",
      tickvals: [-10, 0, 20, 40],
      ticktext: ["−10%", "0%", "20%", "40%"],
      tickangle: 0,
      tickfont: { size: 10 },
    };
  }

  layout.annotations = (layout.annotations || []).map((annotation) => {
    const updated = mobileSourceAnnotation(annotation);
    if (String(updated.text || "").includes("○ 2023")) {
      return { ...updated, x: 0.5, xanchor: "center", y: 1.12 };
    }
    return updated;
  });
  addMobileRowLabels(layout);
  return layout;
}

function applyResponsivePlotLayout(frame) {
  const slug = frame.dataset.plotSlug;
  if (!mobilePlotSlugs.has(slug)) {
    removeSourceAnnotations(frame);
    resizeFrame(frame);
    return;
  }

  try {
    const win = frame.contentWindow;
    const graph = frame.contentDocument?.querySelector(".plotly-graph-div");
    if (!win?.Plotly || !graph) {
      removeSourceAnnotations(frame);
      resizeFrame(frame);
      return;
    }

    if (!frame._basePlotLayout) {
      frame._basePlotLayout = cloneJson(graph.layout || {});
    }
    if (!frame._basePlotData) {
      frame._basePlotData = cloneJson(graph.data || []);
    }

    const baseLayout = frame._basePlotLayout;
    const baseData = frame._basePlotData;
    const isMobile = mobilePlotQuery.matches;
    const nextLayout = !isMobile
      ? cloneJson(baseLayout)
      : slug === "dtc-profitability-bridge"
        ? mobileDriverLayout(baseLayout)
        : mobileDumbbellLayout(baseLayout, slug);
    const nextData = isMobile && slug === "dtc-profitability-bridge"
      ? mobileDriverData(baseData)
      : cloneJson(baseData);

    win.Plotly.react(
      graph,
      nextData,
      nextLayout,
      {
        responsive: true,
        displayModeBar: false,
        displaylogo: false,
        scrollZoom: false,
        doubleClick: false,
      }
    ).then(() => {
      removeSourceAnnotations(frame);
      resizeFrame(frame);
    });
  } catch {
    removeSourceAnnotations(frame);
    resizeFrame(frame);
  }
}

function attachInteractions(scope = document) {
  scope.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
  });

  scope.querySelectorAll(".plot-frame").forEach((frame) => {
    frame.addEventListener("load", () => applyResponsivePlotLayout(frame));
  });
}

function addAssignmentTab(assignment) {
  const tab = document.createElement("button");
  tab.className = "tab";
  tab.type = "button";
  tab.dataset.tab = assignment.id;
  tab.textContent = assignment.label;
  tabsContainer.insertBefore(tab, tabsContainer.lastElementChild);
  tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
  return tab;
}

function createPlotCard(figure, extraClass = "") {
  const shell = document.createElement("article");
  shell.className = `plot-shell ${extraClass}`.trim();
  const termNote = chartTermNotes.get(figure.slug);
  shell.innerHTML = `
    <div class="plot-title">
      <div>
        ${figure.audience ? `<p class="chart-audience">${figure.audience}</p>` : ""}
        <h3>${figure.title}</h3>
        ${figure.takeaway ? `<p class="chart-takeaway">${figure.takeaway}</p>` : figure.description ? `<p>${figure.description}</p>` : ""}
        ${termNote ? `<p class="chart-takeaway"><strong>Terms:</strong> ${termNote}</p>` : ""}
      </div>
    </div>
    <div class="plot-viewport" aria-label="Interactive financial visualization">
      <iframe
        class="plot-frame"
        data-plot-slug="${figure.slug}"
        title="${figure.title}"
        src="${figure.path}?v=${ASSET_VERSION}"
        loading="lazy"
      ></iframe>
    </div>
  `;
  return shell;
}

function createDashboardSection(assignment) {
  const dashboard = assignment.dashboard;
  const figuresBySlug = new Map(assignment.figures.map((figure) => [figure.slug, figure]));

  const section = document.createElement("section");
  section.className = "panel dashboard-panel";
  section.id = assignment.id;
  section.setAttribute("aria-labelledby", `${assignment.id}-title`);

  const hero = document.createElement("header");
  hero.className = "dashboard-hero";
  hero.innerHTML = `
    <p class="eyebrow">${dashboard.eyebrow}</p>
    <h2 id="${assignment.id}-title">${dashboard.headline}</h2>
    <p class="dashboard-summary">${dashboard.summary}</p>
  `;
  section.append(hero);

  const kpis = document.createElement("div");
  kpis.className = "kpi-grid";
  dashboard.kpis.forEach((kpi) => {
    const card = document.createElement("div");
    card.className = "kpi-card";
    card.innerHTML = `
      <p class="kpi-label">${kpi.label}</p>
      <p class="kpi-value">${kpi.value}</p>
      <p class="kpi-delta is-${kpi.tone || "neutral"}">${kpi.delta}</p>
    `;
    kpis.append(card);
  });
  section.append(kpis);

  dashboard.groups.forEach((group) => {
    const groupSection = document.createElement("section");
    groupSection.className = "dashboard-group";
    groupSection.innerHTML = `
      <div class="dashboard-group-heading">
        <p class="dashboard-group-label">${group.label}</p>
        <h3>${group.title}</h3>
        <p>${group.description}</p>
      </div>
    `;

    const chartGrid = document.createElement("div");
    chartGrid.className = group.layout === "two-column" ? "dashboard-chart-grid is-two-column" : "dashboard-chart-grid";
    group.slugs.forEach((slug) => {
      const figure = figuresBySlug.get(slug);
      if (figure) chartGrid.append(createPlotCard(figure, "dashboard-chart-card"));
    });
    groupSection.append(chartGrid);
    section.append(groupSection);
  });

  assignmentsContainer.append(section);
  attachInteractions(section);
}

function createStandardAssignmentSection(assignment) {
  const section = document.createElement("section");
  section.id = assignment.id;
  section.className = "panel";
  section.setAttribute("aria-labelledby", `${assignment.id}-title`);

  const heading = document.createElement("div");
  heading.className = "section-heading";
  heading.innerHTML = `
    <p class="eyebrow">${assignment.label}</p>
    <h2 id="${assignment.id}-title">${assignment.title}</h2>
  `;

  const list = document.createElement("div");
  list.className = "plot-list";
  assignment.figures.forEach((figure) => list.append(createPlotCard(figure)));

  section.append(heading, list);
  assignmentsContainer.append(section);
  attachInteractions(section);
}

function createAssignmentSection(assignment) {
  addAssignmentTab(assignment);
  if (assignment.dashboard) {
    createDashboardSection(assignment);
  } else {
    createStandardAssignmentSection(assignment);
  }
}

async function loadAssignments() {
  const response = await fetch(manifestUrl, { cache: "no-store" });
  const manifest = await response.json();
  manifest.assignments.forEach(createAssignmentSection);
}

let resizePending = false;
window.addEventListener("resize", () => {
  if (resizePending) return;
  resizePending = true;
  window.requestAnimationFrame(() => {
    resizePending = false;
    document.querySelectorAll(".plot-frame").forEach((frame) => applyResponsivePlotLayout(frame));
  });
});

const initialTab = location.hash.slice(1);
attachInteractions();
loadAssignments().then(() => {
  if (initialTab && document.getElementById(initialTab)) {
    setActiveTab(initialTab);
  } else {
    setActiveTab("overview");
  }
});
