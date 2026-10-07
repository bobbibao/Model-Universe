"""Deterministic copy for every admin advertising channel, using only the supplied brief/facts."""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any

from langchain_core.messages import BaseMessage, HumanMessage


def respond(
    *, messages: Sequence[BaseMessage], metadata: Mapping[str, Any], tools: list[dict[str, Any]] | None
) -> dict[str, Any]:
    raw = next(str(m.content) for m in reversed(messages) if isinstance(m, HumanMessage))
    request = json.loads(raw)
    brief = str(request.get("brief", "Khám phá cửa hàng"))
    facts = str(request.get("facts", ""))
    copy = {
        "message": "",
        "headline": "",
        "primary_text": "",
        "headlines": [],
        "descriptions": [],
        "keywords": [],
        "ad_text": "",
    }
    text = brief + ("\n" + facts if facts else "") + "\nKhám phá sản phẩm tại cửa hàng và chọn mẫu phù hợp với bạn."
    channel = request.get("channel")
    if channel == "facebook":
        copy["message"] = text[:5000]
    elif channel == "meta":
        copy.update(headline=brief[:40], primary_text=text[:2000])
    elif channel == "google":
        copy.update(
            headlines=[brief[:30], "Khám phá sản phẩm cửa hàng", "Chọn mẫu phù hợp với bạn"],
            descriptions=[brief[:90], "Xem thông tin sản phẩm và lựa chọn ngay tại cửa hàng."],
            keywords=[brief[:80]],
        )
    elif channel == "tiktok":
        copy["ad_text"] = (brief + " — Khám phá tại cửa hàng")[:100]
    else:
        raise ValueError(f"Unknown marketing channel: {channel}")
    return {"structured": copy}
