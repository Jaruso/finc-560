from __future__ import annotations

import importlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSIGNMENT_MODULES = ["src.assignments.week_02", "src.assignments.week_03"]

PLOT_PAGE_HEAD = """\
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  html,
  body {
    min-height: 100%;
    margin: 0;
    background: #ffffff;
    overflow: hidden;
  }
  .plotly-graph-div {
    width: 100% !important;
  }
  .modebar {
    display: none !important;
  }
</style>
"""

PLOT_RESPONSIVE_SCRIPT = """\
<script>
(function () {
  const graph = document.querySelector(".plotly-graph-div");
  if (!graph || !window.Plotly) return;

  let pending = false;
  function resizePlot() {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(() => {
      pending = false;
      Plotly.Plots.resize(graph);
    });
  }

  window.addEventListener("resize", resizePlot);
})();
</script>
"""

sys.path.insert(0, str(ROOT))


@dataclass(frozen=True)
class ExportedAssignment:
    id: str
    label: str
    title: str
    figures: list[dict[str, Any]]
    dashboard: dict[str, Any] | None = None


def export_module(module_name: str) -> ExportedAssignment:
    module = importlib.import_module(module_name)
    assignment = module.ASSIGNMENT
    figures: list[dict[str, Any]] = []
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
                "displayModeBar": False,
                "displaylogo": False,
                "scrollZoom": False,
                "doubleClick": False,
            },
        )

        html = output_path.read_text(encoding="utf-8")
        html = html.replace(
            '<meta charset="utf-8" />',
            f'<meta charset="utf-8" />\n    {PLOT_PAGE_HEAD}',
            1,
        )
        html = html.replace("</body>", f"{PLOT_RESPONSIVE_SCRIPT}\n</body>", 1)
        output_path.write_text(html, encoding="utf-8")

        exported = {
            "title": title,
            "slug": slug,
            "description": item.get("description", ""),
            "path": str(output_path.relative_to(DOCS)),
        }
        for optional_key in ("audience", "takeaway"):
            if item.get(optional_key):
                exported[optional_key] = item[optional_key]
        figures.append(exported)

    return ExportedAssignment(
        id=assignment,
        label=module.ASSIGNMENT_LABEL,
        title=module.ASSIGNMENT_TITLE,
        figures=figures,
        dashboard=getattr(module, "DASHBOARD", None),
    )


def main() -> None:
    assignments = [export_module(module_name) for module_name in ASSIGNMENT_MODULES]
    manifest = {"assignments": [assignment.__dict__ for assignment in assignments]}
    manifest_path = DOCS / "assets" / "plots-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    figure_count = sum(len(assignment.figures) for assignment in assignments)
    print(f"Exported {figure_count} Plotly figure(s).")


if __name__ == "__main__":
    main()
