"""Authenticated local Chat Completions + embeddings API, implemented without an additional web framework."""

from __future__ import annotations

import base64
import hmac
import json
import time
import uuid
from collections.abc import Mapping
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, cast

from shop_agent.testing.embeddings import HashingEmbedding
from shop_agent.testing.simulator.engine import Engine, SimulatorError

MAX_BODY = 2_000_000


def completion(engine: Engine, body: Mapping[str, Any]) -> dict[str, Any]:
    choice = body.get("tool_choice")
    metadata = dict(body.get("simulator") or {})
    if isinstance(choice, dict):
        metadata["tool_choice"] = choice.get("function", {}).get("name")
    request = {**body, "simulator": metadata}
    if choice == "none":
        request["tools"] = []
    reply = engine.respond(request)
    if reply.delay_ms:
        time.sleep(reply.delay_ms / 1000)
    calls = [
        {
            "id": call["id"],
            "type": "function",
            "function": {
                "name": call["name"],
                "arguments": json.dumps(call["args"], ensure_ascii=False),
            },
        }
        for call in reply.message.tool_calls
    ]
    message: dict[str, Any] = {"role": "assistant", "content": reply.message.content or None}
    if calls:
        message["tool_calls"] = calls
    prompt_tokens = max(1, len(json.dumps(body.get("messages"), ensure_ascii=False)) // 4)
    output_tokens = max(1, len(json.dumps(message, ensure_ascii=False)) // 4)
    return {
        "id": f"chatcmpl-sim-{uuid.uuid4().hex}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": str(body.get("model") or "shop-simulator"),
        "choices": [{"index": 0, "message": message, "finish_reason": "tool_calls" if calls else "stop"}],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": output_tokens,
            "total_tokens": prompt_tokens + output_tokens,
        },
        "system_fingerprint": "shop-llm-simulator",
        "simulator": {"scenario": reply.scenario, "step": reply.step, "usage_is_estimated": True},
    }


def chunks(response: dict[str, Any], *, include_usage: bool = False) -> list[dict[str, Any]]:
    common = {k: response[k] for k in ("id", "created", "model", "system_fingerprint")}
    common["object"] = "chat.completion.chunk"

    def chunk(delta: dict[str, Any], reason: str | None = None) -> dict[str, Any]:
        return {**common, "choices": [{"index": 0, "delta": delta, "finish_reason": reason}]}

    result = [chunk({"role": "assistant", "content": ""})]
    message = response["choices"][0]["message"]
    content = message.get("content") or ""
    for offset in range(0, len(content), 80):
        result.append(chunk({"content": content[offset : offset + 80]}))
    for index, call in enumerate(message.get("tool_calls", [])):
        result.append(
            chunk(
                {
                    "tool_calls": [
                        {
                            "index": index,
                            "id": call["id"],
                            "type": "function",
                            "function": {"name": call["function"]["name"], "arguments": ""},
                        }
                    ]
                }
            )
        )
        args = call["function"]["arguments"]
        for offset in range(0, len(args), 80):
            result.append(
                chunk({"tool_calls": [{"index": index, "function": {"arguments": args[offset : offset + 80]}}]})
            )
    result.append(chunk({}, response["choices"][0]["finish_reason"]))
    if include_usage:
        result.append({**common, "choices": [], "usage": response["usage"]})
    return result


class SimulatorServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], api_key: str, engine: Engine) -> None:
        if not api_key:
            raise ValueError("Simulator API key cannot be empty")
        self.api_key = api_key
        self.engine = engine
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    @property
    def simulator(self) -> SimulatorServer:
        return cast(SimulatorServer, self.server)

    def log_message(self, format: str, *args: Any) -> None:
        # No prompts, keys or customer data in access logs.
        pass

    def _json(self, value: Any, status: int = 200) -> None:
        data = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _error(self, message: str, status: int) -> None:
        self._json(
            {"error": {"message": message, "type": "simulator_error", "param": None, "code": str(status)}}, status
        )

    def _authorized(self) -> bool:
        provided = self.headers.get("Authorization", "")
        if hmac.compare_digest(provided.encode(), f"Bearer {self.simulator.api_key}".encode()):
            return True
        self._error("Invalid simulator API key", 401)
        return False

    def do_GET(self) -> None:
        if self.path == "/health":
            self._json({"status": "ok", "provider": "simulator"})
        elif self._authorized():
            if self.path == "/v1/models":
                self._json(
                    {
                        "object": "list",
                        "data": [
                            {"id": name, "object": "model", "created": 0, "owned_by": "shop-simulator"}
                            for name in ("shop-simulator", "shop-hashing")
                        ],
                    }
                )
            elif self.path == "/v1/simulator/scenarios":
                try:
                    self._json({"data": self.simulator.engine.inventory()})
                except (ValueError, OSError) as exc:
                    self._error(str(exc), 422)
            else:
                self._error("Unknown endpoint", 404)

    def do_POST(self) -> None:
        if not self._authorized():
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= MAX_BODY:
                raise SimulatorError("Request body must be between 1 byte and 2 MB", 413)
            self.connection.settimeout(15)
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise SimulatorError("Request body must be an object", 400)
            if self.path == "/v1/embeddings":
                self._embeddings(body)
                return
            if self.path != "/v1/chat/completions":
                raise SimulatorError("Unknown endpoint", 404)
            if body.get("n", 1) != 1:
                raise SimulatorError("The simulator supports n=1", 400)
            response = completion(self.simulator.engine, body)
            if not body.get("stream"):
                self._json(response)
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            for chunk in chunks(response, include_usage=bool((body.get("stream_options") or {}).get("include_usage"))):
                self.wfile.write(("data: " + json.dumps(chunk, ensure_ascii=False) + "\n\n").encode())
                self.wfile.flush()
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        except SimulatorError as exc:
            self._error(str(exc), exc.status)
        except (ValueError, TypeError, KeyError, AttributeError) as exc:
            self._error(f"Invalid simulator request/scenario: {exc}", 400)
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass

    def _embeddings(self, body: dict[str, Any]) -> None:
        texts = body.get("input")
        if isinstance(texts, str):
            texts = [texts]
        if not isinstance(texts, list) or not texts or len(texts) > 256 or any(not isinstance(t, str) for t in texts):
            raise SimulatorError("input must be a string or 1-256 strings (token arrays are unsupported)", 400)
        size = body.get("dimensions", 1024)
        if not isinstance(size, int) or not 1 <= size <= 4096:
            raise SimulatorError("dimensions must be between 1 and 4096", 400)
        encoding = body.get("encoding_format", "float")
        if encoding not in ("float", "base64"):
            raise SimulatorError("encoding_format must be float or base64", 400)
        import struct

        vectors = HashingEmbedding(size=size).embed_documents(texts)
        data = [
            {
                "object": "embedding",
                "index": i,
                "embedding": (
                    base64.b64encode(struct.pack(f"<{size}f", *vector)).decode() if encoding == "base64" else vector
                ),
            }
            for i, vector in enumerate(vectors)
        ]
        tokens = max(1, sum(len(t) for t in texts) // 4)
        self._json(
            {
                "object": "list",
                "data": data,
                "model": body.get("model", "shop-hashing"),
                "usage": {"prompt_tokens": tokens, "total_tokens": tokens},
            }
        )
