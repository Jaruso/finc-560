from __future__ import annotations

import importlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSIGNMENT_MODULES = ["src.assignments.week_01", "src.assignments.week_02"]
PLOT_PAGE_HEAD = """\
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html,
  body {
    min-height: 100%;
    margin: 0;
  }
</style>
"""
PLOT_RESPONSIVE_SCRIPT = """\
<script>
(function () {
  const graph = document.querySelector(".plotly-graph-div");
  if (!graph || !window.Plotly) {
    return;
  }

  const baseLayout = JSON.parse(JSON.stringify(graph.layout || {}));
  const baseAnnotations = JSON.parse(JSON.stringify(baseLayout.annotations || []));
  const plotConfig = { responsive: true, displaylogo: false, scrollZoom: false };
  const hasSecondPanel = baseLayout.xaxis2 && baseLayout.yaxis2;

  function mobileAnnotations() {
    return baseAnnotations.map((annotation, index) => ({
      ...annotation,
      x: 0.5,
      xanchor: "center",
      y: index === 0 ? 0.91 : 0.46,
      yanchor: "bottom",
    }));
  }

  function applyResponsiveLayout() {
    const isMobile = window.matchMedia("(max-width: 760px)").matches;
    const height = isMobile ? 1120 : baseLayout.height;
    const layout = isMobile
      ? {
          height,
          margin: { t: 96, r: 18, b: 64, l: 58 },
          legend: {
            ...(baseLayout.legend || {}),
            orientation: "h",
            x: 0,
            xanchor: "left",
            y: 1,
          },
          title: {
            ...(baseLayout.title || {}),
            x: 0.02,
            y: 0.995,
          },
          dragmode: false,
          xaxis: { ...baseLayout.xaxis, domain: [0, 1] },
          yaxis: { ...baseLayout.yaxis, domain: [0.53, 0.88] },
          xaxis2: { ...baseLayout.xaxis2, domain: [0, 1] },
          yaxis2: { ...baseLayout.yaxis2, domain: [0.08, 0.43] },
          annotations: mobileAnnotations(),
        }
      : {
          height: baseLayout.height,
          margin: baseLayout.margin,
          legend: baseLayout.legend,
          title: baseLayout.title,
          dragmode: baseLayout.dragmode,
          xaxis: baseLayout.xaxis,
          yaxis: baseLayout.yaxis,
          xaxis2: baseLayout.xaxis2,
          yaxis2: baseLayout.yaxis2,
          annotations: baseAnnotations,
        };

    graph.parentElement.style.height = `${height}px`;
    Plotly.react(graph, graph.data, { ...graph.layout, ...layout }, plotConfig);
  }

  if (!hasSecondPanel) {
    return;
  }

  let pending = false;
  function scheduleResponsiveLayout() {
    if (pending) {
      return;
    }
    pending = true;
    window.requestAnimationFrame(() => {
      pending = false;
      applyResponsiveLayout();
    });
  }

  applyResponsiveLayout();
  window.addEventListener("resize", scheduleResponsiveLayout);
})();
</script>
"""

sys.path.insert(0, str(ROOT))


@dataclass(frozen=True)
class ExportedAssignment:
    id: str
    label: str
    title: str
    figures: list[dict[str, str]]


def export_module(module_name: str) -> ExportedAssignment:
    module = importlib.import_module(module_name)
    assignment = module.ASSIGNMENT
    figures = []
    output_dir = DOCS / "visualizations" / assignment
    output_dir.mkdir(parents=True, exist_ok=True)

    for item in module.FIGURES:
        slug = item["slug"]
        title = item["title"]
        figure = item["figure"]
        output_path = output_dir / f"{slug}.html"
        figure.write_html(
            output_path,
            include_plotlyjs="cdn",
            full_html=True,
            config={
                "responsive": True,
                "displaylogo": False,
                "scrollZoom": False,
                "doubleClick": "reset",
            },
        )
        # Standalone Plotly pages need the same responsive subplot behavior because
        # they are also opened directly from the "Open graph" links.
        html = output_path.read_text(encoding="utf-8")
        html = html.replace(
            '<meta charset="utf-8" />\n    <style>html, body {height: 100%;}</style>',
            f'<meta charset="utf-8" />\n    {PLOT_PAGE_HEAD}',
        )
        html = html.replace("</body>", f"{PLOT_RESPONSIVE_SCRIPT}\n</body>")
        output_path.write_text(html, encoding="utf-8")
        figures.append(
            {
                "title": title,
                "slug": slug,
                "description": item.get("description", ""),
                "path": str(output_path.relative_to(DOCS)),
            }
        )

    return ExportedAssignment(
        id=assignment,
        label=module.ASSIGNMENT_LABEL,
        title=module.ASSIGNMENT_TITLE,
        figures=figures,
    )


def main() -> None:
    assignments = [export_module(module_name) for module_name in ASSIGNMENT_MODULES]
    manifest = {
        "assignments": [assignment.__dict__ for assignment in assignments],
    }
    manifest_path = DOCS / "assets" / "plots-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    figure_count = sum(len(assignment.figures) for assignment in assignments)
    print(f"Exported {figure_count} Plotly figure(s).")


if __name__ == "__main__":
    main()
