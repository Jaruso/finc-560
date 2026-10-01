"""Refresh the static, reproducible FRED snapshot used by GitHub Pages."""
from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.assignments.week_06_forecast import build_snapshot  # noqa: E402


def main() -> None:
    output = ROOT / "docs" / "week-06" / "data.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    snapshot = build_snapshot()
    # Atomic replacement prevents writing a half-complete file on failure.
    temp = output.with_suffix(".json.tmp")
    temp.write_text(json.dumps(snapshot, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temp.replace(output)
    print(
        "Published", len(snapshot["observations"]), "months, Diebold–Li 24-month baseline;",
        "latest synchronized observation:", snapshot["latest_synchronized_daily_observation"]
    )


if __name__ == "__main__":
    main()
