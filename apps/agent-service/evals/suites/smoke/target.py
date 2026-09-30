"""Smoke suite: can the profile's planner drive a tool loop, return structured output and answer in Vietnamese?"""

from __future__ import annotations

from typing import Any

from langchain.agents import create_agent
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import ToolException, tool
from pydantic import BaseModel, Field

from evals.evaluators import CaseOutput
from shop_agent import llm
from shop_agent.agents.middleware import role_middleware

STOCK = {"AO-TRANG-01": 42, "QUAN-JEAN-02": 7}
PRICES_VND = {"AO-TRANG-01": 199000, "QUAN-JEAN-02": 459000}
SYSTEM = (
    "Bạn là trợ lý của một cửa hàng thời trang. Luôn trả lời bằng tiếng Việt, ngắn gọn. "
    "Chỉ dùng số liệu lấy từ công cụ; không tự đoán số."
)


@tool
def get_stock(sku: str) -> str:
    """Return the quantity in stock for a SKU."""
    if sku not in STOCK:
        raise ToolException(f"SKU {sku} not found")
    return f"{sku}: {STOCK[sku]} chiếc"


@tool
def get_price(sku: str) -> str:
    """Return the current selling price of a SKU in VND."""
    if sku not in PRICES_VND:
        raise ToolException(f"SKU {sku} not found")
    return f"{sku}: {PRICES_VND[sku]} VND"


class StockAnswer(BaseModel):
    sku: str = Field(description="the SKU")
    quantity: int = Field(description="units in stock")


async def run_case(case: dict[str, Any], profile: str) -> CaseOutput:
    config: RunnableConfig = {"metadata": {"script_key": f"evals.smoke.{case['id']}"}}
    if case.get("mode") == "structured":
        model = llm.chat_model(llm.ModelRole.PLANNER, profile)
        method = llm.structured_output_method(llm.ModelRole.PLANNER, profile)
        parsed = await model.with_structured_output(StockAnswer, method=method).ainvoke(case["input"], config)
        structured = parsed.model_dump() if isinstance(parsed, BaseModel) else parsed
        return CaseOutput(messages=[HumanMessage(case["input"])], structured=structured)
    agent = create_agent(
        llm.chat_model(llm.ModelRole.PLANNER, profile),
        tools=[get_stock, get_price],
        system_prompt=SYSTEM,
        middleware=role_middleware(llm.ModelRole.PLANNER),
    )
    state = await agent.ainvoke({"messages": [HumanMessage(case["input"])]}, config)
    messages = state["messages"]
    final = next((m for m in reversed(messages) if isinstance(m, AIMessage) and not m.tool_calls), None)
    return CaseOutput(messages=messages, final_text=str(final.content) if final else "")
