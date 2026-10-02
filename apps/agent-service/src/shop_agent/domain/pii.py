"""Personal data in text customers write (return reasons, messages): what the copilot's `customer_voice` redacts in
what it reads and what the tracing mask removes before a trace leaves the process."""

from __future__ import annotations

import re

EMAIL = r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"
# A Vietnamese phone number (0 or +84, a mobile prefix, 8 more digits; spaces, dots or dashes between digits).
VN_PHONE = r"(?<!\d)(?:\+84|84|0)[35789](?:[\s.-]?\d){8}(?!\d)"

_REDACTIONS = ((re.compile(EMAIL), "[REDACTED_EMAIL]"), (re.compile(VN_PHONE), "[REDACTED_PHONE]"))


def redact(text: str) -> str:
    for pattern, label in _REDACTIONS:
        text = pattern.sub(label, text)
    return text
