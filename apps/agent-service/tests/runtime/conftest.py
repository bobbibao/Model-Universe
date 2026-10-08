"""The prod-like runtime for the `runtime` test tier: Aegra (`aegra serve`, the production command) with its Redis
broker and a throwaway database on the local Postgres (PG_SUPERUSER_URL and AGENT_TEST_DATABASE_URL, from
`scripts/dev/pg-local.sh start`).

Redis is what gives Aegra crash recovery: a run whose worker died is picked up again once its lease expires. The
leases here are seconds long so a killed run is recovered quickly; production keeps Aegra's defaults.

The scripted model has no embedding model Aegra can load by name, so the server gets a copy of `aegra.json` without the
store index (ADR-0013).
"""

from __future__ import annotations

import contextlib
import json
import os
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

import httpx
import psycopg
import pytest
from psycopg import sql

from tests.integration.conftest import require_env
from tests.server.conftest import TEST_ACTOR_SECRET

SERVICE_ROOT = Path(__file__).resolve().parents[2]
STARTUP_TIMEOUT_S = 120.0
FAST_RECOVERY = {"LEASE_DURATION_SECONDS": "5", "HEARTBEAT_INTERVAL_SECONDS": "2", "REAPER_INTERVAL_SECONDS": "2"}


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port: int = sock.getsockname()[1]
        return port


def scripted_config(directory: Path) -> Path:
    """`aegra.json` without the store index, its paths made absolute (the copy lives outside the service)."""
    config = json.loads((SERVICE_ROOT / "aegra.json").read_text(encoding="utf-8"))
    del config["store"]
    config["graphs"] = {name: f"{SERVICE_ROOT}/{path.removeprefix('./')}" for name, path in config["graphs"].items()}
    config["auth"]["path"] = f"{SERVICE_ROOT}/{config['auth']['path'].removeprefix('./')}"
    path = directory / "aegra.json"
    path.write_text(json.dumps(config))
    return path


@contextmanager
def redis_server() -> Iterator[str]:
    binary = shutil.which("redis-server")
    if binary is None:
        pytest.fail("redis-server is needed for Aegra's broker (apt-get install redis-server)")
    port = free_port()
    command = [binary, "--port", str(port), "--bind", "127.0.0.1", "--save", "", "--appendonly", "no"]
    process = subprocess.Popen(command, stdout=subprocess.DEVNULL)  # noqa: S603 - a local test Redis
    try:
        deadline = time.monotonic() + 10
        while True:
            try:
                socket.create_connection(("127.0.0.1", port), timeout=1).close()
                break
            except OSError:
                if time.monotonic() > deadline:
                    raise
                time.sleep(0.1)
        yield f"redis://127.0.0.1:{port}/0"
    finally:
        process.terminate()
        process.wait(timeout=10)


@contextmanager
def scratch_database() -> Iterator[str]:
    """A new database for Aegra's tables, checkpoints and Store, owned by the agent's role (NOSUPERUSER, like
    `shop_agent` in production: Aegra migrates it without creating extensions); dropped afterwards."""
    superuser = require_env("PG_SUPERUSER_URL")
    agent = urlsplit(require_env("AGENT_TEST_DATABASE_URL"))
    name = f"aegra_runtime_{uuid.uuid4().hex[:8]}"
    with psycopg.connect(superuser, autocommit=True) as conn:
        owner = sql.Identifier(agent.username or "")
        conn.execute(sql.SQL("CREATE DATABASE {} OWNER {}").format(sql.Identifier(name), owner))
    try:
        yield agent._replace(path=f"/{name}").geturl()
    finally:
        with psycopg.connect(superuser, autocommit=True) as conn:
            conn.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name)))


@dataclass
class Aegra:
    process: subprocess.Popen[bytes]
    url: str
    log: Path

    def stop(self) -> None:
        """Stop `aegra serve` and the uvicorn it started (its own process group)."""
        if os.name == "nt" and self.process.poll() is None:
            subprocess.run(  # noqa: S603 - stops only the exact owned test process tree
                [
                    str(Path(os.environ["SYSTEMROOT"]) / "System32/taskkill.exe"),
                    "/PID",
                    str(self.process.pid),
                    "/T",
                    "/F",
                ],
                check=False,
                capture_output=True,
            )
            self.process.wait(timeout=15)
            return
        kill_group = getattr(os, "killpg", None)
        with contextlib.suppress(ProcessLookupError):
            if callable(kill_group):
                kill_group(self.process.pid, signal.SIGTERM)
            else:
                self.process.terminate()
        try:
            self.process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            if callable(kill_group):
                kill_group(self.process.pid, getattr(signal, "SIGKILL", signal.SIGTERM))
            else:
                self.process.kill()
            self.process.wait(timeout=10)


def start_aegra(port: int, env: dict[str, str]) -> Aegra:
    """`aegra serve` on `port` with the scripted model; `env` adds the shop, the database and Redis."""
    workdir = Path(tempfile.mkdtemp(prefix="aegra-"))
    log = SERVICE_ROOT / ".artifacts" / f"aegra-{port}-{int(time.time())}.log"
    log.parent.mkdir(exist_ok=True)
    url = f"http://127.0.0.1:{port}"
    full_env = {
        **os.environ,
        "APP_ENV": "test",
        "LLM_PROFILE": "scripted",
        "AGENT_ACTOR_SECRET": TEST_ACTOR_SECRET,
        "AGENT_SERVER_URL": url,  # Aegra has no in-process loopback: monitor reaches the server over HTTP
        "REDIS_BROKER_ENABLED": "true",
        **FAST_RECOVERY,
        **env,
    }
    command = [
        str(SERVICE_ROOT / ".venv" / ("Scripts/aegra.exe" if os.name == "nt" else "bin/aegra")),
        "serve",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--config",
        str(scripted_config(workdir)),
    ]
    with log.open("wb") as out:
        process = subprocess.Popen(  # noqa: S603 - the project's own server
            command, cwd=workdir, env=full_env, stdout=out, stderr=subprocess.STDOUT, start_new_session=os.name != "nt"
        )
    deadline = time.monotonic() + STARTUP_TIMEOUT_S
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"aegra exited early; see {log}")
        try:
            if httpx.get(f"{url}/health", timeout=1.0).status_code == 200:
                return Aegra(process, url, log)
        except httpx.HTTPError:
            pass
        time.sleep(0.5)
    Aegra(process, url, log).stop()
    raise RuntimeError(f"aegra did not start in {STARTUP_TIMEOUT_S}s; see {log}")
