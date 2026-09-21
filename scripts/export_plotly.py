from __future__ import annotations

import argparse
import importlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSIGNMENT_MODULES = [
    "src.assignments.week_02",
    "src.assignments.week_03",
    "src.assignments.week_04",
    "src.assignments.week_05",
]
ASSIGNMENT_MODULE_BY_ID = {
    "week-02": "src.assignments.week_02",
    "week-03": "src.assignments.week_03",
    "week-04": "src.assignments.week_04",
    "week-05": "src.assignments.week_05",
}

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

        # Let Plotly.py emit the matching versioned CDN URL instead of manually
        # pinning a potentially incompatible Plotly.js version.
        figure.write_html(
            output_path,
            include_plotlyjs="cdn",
            full_html=True,
            div_id=f"{assignment}-{slug}",
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


def _load_existing_manifest() -> dict[str, Any]:
    manifest_path = DOCS / "assets" / "plots-manifest.json"
    if not manifest_path.exists():
        return {"assignments": []}
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def _write_manifest(assignments: list[dict[str, Any]]) -> None:
    manifest_path = DOCS / "assets" / "plots-manifest.json"
    manifest = {"assignments": assignments}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def _module_for_assignment(assignment_id: str) -> str:
    try:
        return ASSIGNMENT_MODULE_BY_ID[assignment_id]
    except KeyError as exc:
        raise ValueError(f"Unknown assignment id: {assignment_id}") from exc


def main() -> None:
    parser = argparse.ArgumentParser(description="Export Plotly assignment visualizations.")
    parser.add_argument(
        "--assignment",
        help="Export only one assignment id (for example, week-05) and merge it into the existing manifest.",
    )
    args = parser.parse_args()

    if args.assignment:
        module_name = _module_for_assignment(args.assignment)
        exported = export_module(module_name)
        existing = _load_existing_manifest()
        assignments = [
            item
            for item in existing.get("assignments", [])
            if item.get("id") != exported.id
        ]
        exported_dict = exported.__dict__
        # Keep the existing course order when possible.
        order = {
            assignment_id: idx
            for idx, assignment_id in enumerate(ASSIGNMENT_MODULE_BY_ID)
        }
        assignments.append(exported_dict)
        assignments.sort(key=lambda item: order.get(item.get("id"), 999))
        _write_manifest(assignments)
        print(f"Exported {len(exported.figures)} Plotly figure(s) for {exported.id}.")
        return

    exported_assignments = [export_module(module_name) for module_name in ASSIGNMENT_MODULES]
    _write_manifest([assignment.__dict__ for assignment in exported_assignments])
    figure_count = sum(len(assignment.figures) for assignment in exported_assignments)
    print(f"Exported {figure_count} Plotly figure(s).")


if __name__ == "__main__":
    main()
