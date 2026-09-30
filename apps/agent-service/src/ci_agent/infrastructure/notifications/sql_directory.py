"""SqlRecipientDirectory: approvers are the web app's active admins (ROADMAP T-08).

Read through the same read-only `ci_reader` connection as the shop (`analytics.ci_recipients`: id and name of
active admins, apps/web-ecommerce AnalyticsViews.ts). Every web admin approves as `owner`, as in the web console
(CiConsoleService.toCiRole), so the web decides who may approve: a deactivated admin stops receiving questions at
the next refresh.

RECIPIENTS_FILE, when set, only adds what the web does not hold, per web user id: channel handles (Telegram chat id,
email) and preferred channels. Without an entry there, a web admin gets the web inbox only, so nobody is messaged
outside the web without being listed in the file. File entries whose user id is not an active web admin are ignored.

When the view cannot be read (database down, views not created yet), the file alone is used, as before T-08. The
list is cached for `ttl_s`, failures included, so a notification burst costs one query.
"""
from __future__ import annotations

import logging
import time
from collections.abc import Callable
from typing import Any

import psycopg
from psycopg.rows import dict_row

from ci_agent.domain.models.notification import (
    ROLE_RANK,
    ChannelType,
    Recipient,
    Role,
    role_at_least,
)
from ci_agent.infrastructure.notifications.directory import StaticRecipientDirectory

logger = logging.getLogger(__name__)

RECIPIENTS_SQL = "SELECT user_id, name FROM analytics.ci_recipients ORDER BY user_id"
CONNECT_TIMEOUT_S = 5
WEB_ADMIN_ROLE = Role.OWNER  # the web console's mapping of ADMIN


class SqlRecipientDirectory:
    def __init__(self, dsn: str, overlay: StaticRecipientDirectory | None = None, ttl_s: float = 60.0,
                 monotonic: Callable[[], float] = time.monotonic, connect: Callable[..., Any] = psycopg.connect) -> None:
        self._dsn, self._overlay, self._ttl_s = dsn, overlay, ttl_s
        self._monotonic, self._connect = monotonic, connect
        self._cache: list[Recipient] = []
        self._loaded_at: float | None = None
        self.source = "none"  # "web" or "file (fallback)", for logs and tests
        self._ignored: list[str] = []

    # ------------------------------------------------------------------------------------ RecipientDirectoryPort
    def get(self, user_id: str) -> Recipient | None:
        return next((r for r in self._recipients() if r.user_id == user_id), None)

    def approvers_for(self, minimum_role: Role) -> list[Recipient]:
        return sorted((r for r in self._recipients() if role_at_least(r.role, minimum_role)),
                      key=lambda r: ROLE_RANK[r.role])

    def admins(self) -> list[Recipient]:
        return [r for r in self._recipients() if role_at_least(r.role, Role.MANAGER)]

    def resolve_identity(self, channel: ChannelType, external_id: str) -> Recipient | None:
        return next((r for r in self._recipients() if r.handles.get(channel) == external_id), None)

    def check(self) -> None:
        """Startup: load once and say where the approvers come from."""
        recipients = self._recipients()
        logger.info("Recipients: %s approver(s) from %s", len(recipients), self.source)

    # ---------------------------------------------------------------------------------------------- internals
    def _recipients(self) -> list[Recipient]:
        now = self._monotonic()
        if self._loaded_at is not None and now - self._loaded_at < self._ttl_s:
            return self._cache
        try:
            rows = self._read()
        except psycopg.Error as exc:
            fallback = self._overlay.all() if self._overlay else []
            logger.warning("Approvers could not be read from the web (%s); using RECIPIENTS_FILE (%s entries) until "
                           "they can", str(exc).strip().splitlines()[0] if str(exc).strip() else type(exc).__name__,
                           len(fallback))
            self._cache, self.source = fallback, "file (fallback)"
        else:
            self._cache, self.source = [self._merge(row) for row in rows], "web"
            self._log_ignored({row["user_id"] for row in rows})
        self._loaded_at = now
        return self._cache

    def _read(self) -> list[dict[str, Any]]:
        with self._connect(self._dsn, row_factory=dict_row, connect_timeout=CONNECT_TIMEOUT_S) as conn:
            conn.read_only = True
            return list(conn.execute(RECIPIENTS_SQL).fetchall())

    def _merge(self, row: dict[str, Any]) -> Recipient:
        user_id = str(row["user_id"])
        extra = self._overlay.get(user_id) if self._overlay else None
        return Recipient(user_id=user_id, name=str(row["name"] or user_id), role=WEB_ADMIN_ROLE,
                         handles=dict(extra.handles) if extra else {},
                         preferred_channels=extra.preferred_channels if extra else (ChannelType.WEB,))

    def _log_ignored(self, web_ids: set[str]) -> None:
        if not self._overlay:
            return
        ignored = sorted(r.user_id for r in self._overlay.all() if r.user_id not in web_ids)
        if ignored and ignored != self._ignored:  # once per change, not on every refresh
            logger.warning("RECIPIENTS_FILE lists user ids that are not active web admins (ignored): %s",
                           ", ".join(ignored))
        self._ignored = ignored
