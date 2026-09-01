from __future__ import annotations

import importlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
ASSIGNMENT_MODULES = ["src.assignments.week_01"]

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
            config={"responsive": True, "displaylogo": False},
        )
        figures.append(
            {
                "title": title,
                "slug": slug,
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
