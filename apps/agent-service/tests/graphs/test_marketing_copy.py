"""The admin copy graph is a single writer call with no shop write tools."""
from unittest.mock import AsyncMock, Mock

import pytest
from pydantic import ValidationError

from shop_agent.graphs import marketing_copy


async def test_writes_editable_copy_without_tools(monkeypatch: pytest.MonkeyPatch) -> None:
    invoke = AsyncMock(return_value=marketing_copy.MarketingCopy(message="Khám phá bộ sưu tập mới"))
    model = Mock()
    model.with_structured_output.return_value.ainvoke = invoke
    factory = Mock(return_value=model)
    monkeypatch.setattr(marketing_copy.llm, "chat_model", factory)
    result = await marketing_copy.graph.ainvoke({"request": {"channel": "facebook", "brief": "Giới thiệu bộ sưu tập"}})
    assert result["copy"]["message"] == "Khám phá bộ sưu tập mới"
    factory.assert_called_once_with(marketing_copy.llm.ModelRole.WRITER)
    model.bind_tools.assert_not_called()
    assert "Do not invent discounts" in invoke.call_args.args[0][0].content


async def test_rejects_invalid_request_before_calling_model(monkeypatch: pytest.MonkeyPatch) -> None:
    model = Mock()
    monkeypatch.setattr(marketing_copy.llm, "chat_model", model)
    with pytest.raises(ValidationError):
        await marketing_copy.graph.ainvoke({"request": {"channel": "facebook", "brief": ""}})
    model.assert_not_called()


def test_google_copy_enforces_platform_character_limits() -> None:
    with pytest.raises(ValidationError):
        marketing_copy.MarketingCopy(headlines=["x" * 31])
    with pytest.raises(ValidationError):
        marketing_copy.MarketingCopy(descriptions=["x" * 91])
