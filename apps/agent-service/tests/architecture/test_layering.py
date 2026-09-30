"""The dependency rule (docs/ARCHITECTURE.md section 12) is enforced by import-linter.

Contracts live in pyproject.toml ([tool.importlinter]); this test fails the build when any is broken.
"""

from __future__ import annotations

import os
from pathlib import Path

from importlinter.cli import lint_imports

SERVICE_ROOT = Path(__file__).resolve().parents[2]


def test_import_contracts_are_kept() -> None:
    cwd = Path.cwd()
    os.chdir(SERVICE_ROOT)
    try:
        exit_code = lint_imports(config_filename=str(SERVICE_ROOT / "pyproject.toml"), no_cache=True)
    finally:
        os.chdir(cwd)
    assert exit_code == 0, "an import-linter contract is broken; run `uv run lint-imports` for details"
