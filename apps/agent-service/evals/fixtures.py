"""Isolated scripted fixtures for graph evals; these verify wiring, never model quality."""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import yaml

import shop_agent.llm as llm


@contextmanager
def graph_fixture(profile: str, key: str, payload: dict[str, Any]) -> Iterator[None]:
    if profile != "scripted":
        yield
        return
    scratch = Path(__file__).resolve().parents[1] / ".artifacts" / "eval-fixtures"
    scratch.mkdir(parents=True, exist_ok=True)
    previous = os.environ.get("SCRIPTED_LLM_DIR")
    with TemporaryDirectory(prefix="owned-", dir=scratch) as directory:
        if not Path(directory).resolve().is_relative_to(scratch.resolve()):
            raise ValueError("Eval scratch path escaped its owned directory")
        Path(directory, "case.yaml").write_text(
            yaml.safe_dump({key: [{"structured": payload}]}, allow_unicode=True), encoding="utf-8"
        )
        os.environ["SCRIPTED_LLM_DIR"] = directory
        llm.reset_caches()
        try:
            yield
        finally:
            if previous is None:
                os.environ.pop("SCRIPTED_LLM_DIR", None)
            else:
                os.environ["SCRIPTED_LLM_DIR"] = previous
            llm.reset_caches()
