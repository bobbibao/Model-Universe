"""Every SKILL.md (Claude Code dev skills and runtime playbooks) follows the Agent Skills frontmatter rules."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[4]
SKILL_FILES = sorted(
    [
        *REPO_ROOT.joinpath(".claude", "skills").glob("*/SKILL.md"),
        *REPO_ROOT.joinpath("apps/agent-service/skills").glob("*/SKILL.md"),
    ]
)
MAX_DESCRIPTION = 1024


def _frontmatter(path: Path) -> dict[str, object]:
    text = path.read_text(encoding="utf-8")
    assert text.startswith("---\n"), f"{path} must start with YAML frontmatter"
    _, header, _body = text.split("---\n", 2)
    data = yaml.safe_load(header)
    assert isinstance(data, dict), f"{path}: frontmatter must be a mapping"
    return data


def test_there_are_skills() -> None:
    assert SKILL_FILES, "no SKILL.md found"


@pytest.mark.parametrize("path", SKILL_FILES, ids=lambda p: f"{p.parent.parent.name}/{p.parent.name}")
def test_skill_frontmatter(path: Path) -> None:
    data = _frontmatter(path)
    assert data.get("name") == path.parent.name, f"{path}: `name` must equal the folder name"
    description = data.get("description")
    assert isinstance(description, str) and description.strip(), f"{path}: `description` is required"
    assert len(description) <= MAX_DESCRIPTION, f"{path}: description longer than {MAX_DESCRIPTION} characters"
