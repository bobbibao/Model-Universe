"""Enforce Clean Architecture's dependency rule with a plain AST scan (no extra dependency).

domain must not import application, infrastructure or interfaces.
application must not import infrastructure or interfaces (except via Protocol ports it defines).
"""
from __future__ import annotations

import ast
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src" / "ci_agent"

FORBIDDEN = {
    "domain": {"ci_agent.application", "ci_agent.infrastructure", "ci_agent.interfaces", "ci_agent.bootstrap"},
    "application": {"ci_agent.infrastructure", "ci_agent.interfaces", "ci_agent.bootstrap"},
}


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.update(n.name for n in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            found.add(node.module)
    return found


def test_layering_rules_are_respected():
    violations = []
    for layer, forbidden in FORBIDDEN.items():
        for path in (SRC / layer).rglob("*.py"):
            for imported in _imports(path):
                if any(imported == f or imported.startswith(f + ".") for f in forbidden):
                    violations.append(f"{path.relative_to(SRC)} imports {imported}")
    assert not violations, "Layering violations:\n" + "\n".join(violations)
