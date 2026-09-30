"""Starts `langgraph dev` in a subprocess for the `server` test tier.

The server runs WITHOUT `--allow-blocking`, so any synchronous I/O on the event loop fails these tests. Each server
runs in a fresh working directory (symlinks to `src/` and `langgraph.json`): the dev runtime persists threads, the
Store and crons to `.langgraph_api/` under its working directory, and tests must not see each other's state.
"""

from __future__ import annotations

import os
import socket
import subprocess
import tempfile
import time
from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest

SERVICE_ROOT = Path(__file__).resolve().parents[2]
STARTUP_TIMEOUT_S = 90.0


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port: int = sock.getsockname()[1]
        return port


def _workdir() -> Path:
    workdir = Path(tempfile.mkdtemp(prefix="langgraph-dev-"))
    for name in ("src", "langgraph.json"):
        (workdir / name).symlink_to(SERVICE_ROOT / name)
    return workdir


def start_dev_server(extra_env: dict[str, str] | None = None) -> tuple[subprocess.Popen[bytes], str, Path]:
    port = _free_port()
    log_path = SERVICE_ROOT / ".artifacts" / f"langgraph-dev-{port}.log"
    log_path.parent.mkdir(exist_ok=True)
    workdir = _workdir()
    env = {**os.environ, "APP_ENV": "test", "LLM_PROFILE": "scripted", **(extra_env or {})}
    command = [
        str(SERVICE_ROOT / ".venv" / "bin" / "langgraph"),
        "dev",
        "--no-browser",
        "--no-reload",
        "--port",
        str(port),
    ]
    with log_path.open("wb") as log:
        process = subprocess.Popen(command, cwd=workdir, env=env, stdout=log, stderr=subprocess.STDOUT)  # noqa: S603
    url = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + STARTUP_TIMEOUT_S
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"langgraph dev exited early; see {log_path}")
        try:
            if httpx.get(f"{url}/ok", timeout=1.0).status_code == 200:
                return process, url, log_path
        except httpx.HTTPError:
            pass
        time.sleep(0.5)
    process.terminate()
    raise RuntimeError(f"langgraph dev did not start in {STARTUP_TIMEOUT_S}s; see {log_path}")


def stop_dev_server(process: subprocess.Popen[bytes]) -> None:
    process.terminate()
    try:
        process.wait(timeout=15)
    except subprocess.TimeoutExpired:
        process.kill()


@pytest.fixture(scope="module")
def dev_server() -> Iterator[str]:
    process, url, _log = start_dev_server()
    try:
        yield url
    finally:
        stop_dev_server(process)
