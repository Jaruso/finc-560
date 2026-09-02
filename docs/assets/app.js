const tabsContainer = document.querySelector(".tabs");
const assignmentsContainer = document.querySelector("#assignments");

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
    const documentHeight = Math.max(
      doc.body.scrollHeight,
      doc.documentElement.scrollHeight
    );
    const height = Math.ceil(graphHeight || documentHeight);
    frame.style.height = `${height + 4}px`;
  } catch {
    frame.style.height = "640px";
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

function createAssignmentSection(assignment) {
  const tab = document.createElement("button");
  tab.className = "tab";
  tab.type = "button";
  tab.dataset.tab = assignment.id;
  tab.textContent = assignment.label;
  tabsContainer.insertBefore(tab, tabsContainer.lastElementChild);

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

  assignment.figures.forEach((figure) => {
    const shell = document.createElement("article");
    shell.className = "plot-shell";
    shell.innerHTML = `
      <div class="plot-title">
        <div>
          <h3>${figure.title}</h3>
          ${figure.description ? `<p>${figure.description}</p>` : ""}
        </div>
      </div>
      <div class="plot-viewport" aria-label="Scrollable visualization">
        <iframe
          class="plot-frame"
          title="${figure.title}"
          src="${figure.path}"
          loading="lazy"
        ></iframe>
      </div>
    `;
    list.append(shell);
  });

  section.append(heading, list);
  assignmentsContainer.append(section);
  attachInteractions(section);
  tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
}

async function loadAssignments() {
  const response = await fetch("assets/plots-manifest.json");
  const manifest = await response.json();
  manifest.assignments.forEach(createAssignmentSection);
}

const initialTab = location.hash.slice(1);
attachInteractions();
loadAssignments().then(() => {
  if (initialTab && document.getElementById(initialTab)) {
    setActiveTab(initialTab);
  }
});
