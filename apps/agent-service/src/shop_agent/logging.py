"""Structured logging: JSON in production, readable console output in development.

Context such as `thread_id`, `run_id`, `graph`, `node` and `trace_id` is bound with
`structlog.contextvars.bind_contextvars(...)` and appears on every line logged in that context.
"""

from __future__ import annotations

import logging
import sys

import structlog


def configure_logging(app_env: str = "dev", level: int = logging.INFO) -> None:
    renderer: structlog.typing.Processor = (
        structlog.processors.JSONRenderer() if app_env == "production" else structlog.dev.ConsoleRenderer()
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stderr),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.typing.FilteringBoundLogger:
    logger: structlog.typing.FilteringBoundLogger = structlog.get_logger(name)
    return logger
