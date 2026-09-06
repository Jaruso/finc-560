const tabsContainer = document.querySelector(".tabs");
const assignmentsContainer = document.querySelector("#assignments");
const assetVersion = "20260906-week3-redesign-2";
const manifestUrl = `assets/plots-manifest.json?v=${assetVersion}`;

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

function resizeFrame(frame) {
  try {
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

function attachInteractions(scope = document) {
  scope.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
  });

  scope.querySelectorAll(".plot-frame").forEach((frame) => {
    frame.addEventListener("load", () => resizeFrame(frame));
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
  const plotUrl = `${figure.path}?v=${assetVersion}`;
  shell.innerHTML = `
    <div class="plot-title">
      <div>
        ${figure.audience ? `<p class="chart-audience">${figure.audience}</p>` : ""}
        <h3>${figure.title}</h3>
        ${figure.takeaway ? `<p class="chart-takeaway">${figure.takeaway}</p>` : figure.description ? `<p>${figure.description}</p>` : ""}
      </div>
    </div>
    <div class="plot-viewport" aria-label="Interactive financial visualization">
      <iframe
        class="plot-frame"
        title="${figure.title}"
        src="${plotUrl}"
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
  section.className = "panel";
  section.id = assignment.id;
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

const initialTab = location.hash.slice(1);
attachInteractions();
loadAssignments().then(() => {
  if (initialTab && document.getElementById(initialTab)) {
    setActiveTab(initialTab);
  } else {
    setActiveTab("overview");
  }
});
