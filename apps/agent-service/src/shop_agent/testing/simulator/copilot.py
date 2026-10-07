"""Tool-driven admin conversations. Explicit JSON tool requests cover every bound tool without guessing arguments."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage

from shop_agent.testing.simulator.engine import normalize


def respond(
    *, messages: Sequence[BaseMessage], metadata: Mapping[str, Any], tools: list[dict[str, Any]] | None
) -> AIMessage:
    last_human = max((i for i, m in enumerate(messages) if isinstance(m, HumanMessage)), default=-1)
    recent = messages[last_human + 1 :]
    results = [str(m.content) for m in recent if isinstance(m, ToolMessage)]
    original = str(messages[last_human].content) if last_human >= 0 else ""
    text = normalize(original)
    bound = {t["function"]["name"]: t["function"] for t in tools or []}
    copywriter = metadata.get("lc_agent_name") == "copywriter" or (
        "check_copy" in bound and "get_sales_summary" not in bound and "find_high_return_skus" not in bound
    )
    if results:
        draft = (
            (
                "Bản nháp nội dung để bạn chỉnh sửa:\n"
                + original[:3000]
                + "\nKhám phá sản phẩm tại cửa hàng và chọn mẫu phù hợp với bạn.\n\n"
            )
            if copywriter
            else ""
        )
        return AIMessage(content=draft + "Kết quả từ công cụ:\n\n" + "\n\n".join(results)[-10000:])

    def call(name: str, args: dict[str, Any]) -> AIMessage:
        if name not in bound:
            return AIMessage(content=f"Công cụ {name} không khả dụng trong vai trò này.")
        required = set(bound[name].get("parameters", {}).get("required", []))
        missing = required - set(args)
        if missing:
            return AIMessage(
                content=f"Bạn cung cấp thêm {', '.join(sorted(missing))} để mình chuẩn bị thao tác {name} nhé."
            )
        return AIMessage(
            content="", tool_calls=[{"name": name, "args": args, "id": f"call-sim-{len(messages)}-{name}"}]
        )

    try:
        request = json.loads(original)
    except ValueError:
        request = None
    if isinstance(request, dict) and isinstance(request.get("tool"), str):
        args = request.get("args", {})
        if not isinstance(args, dict):
            return AIMessage(content="args cần là một JSON object.")
        return call(request["tool"], args)
    if copywriter:
        draft = original[:3000] + "\nKhám phá sản phẩm tại cửa hàng và chọn mẫu phù hợp với bạn."
        return call("check_copy", {"text": draft}) if "check_copy" in bound else AIMessage(content=draft)
    if re.search(r"ban tin|briefing", text):
        tasks = [
            ("get_sales_summary", {"days": 1}),
            ("get_kpis", {}),
            ("get_goal_pacing", {}),
            ("get_active_promotions", {}),
        ]
        calls = [call(name, args).tool_calls[0] for name, args in tasks if name in bound]
        if calls:
            return AIMessage(content="", tool_calls=calls)
    # Parse only values supplied by the admin. Missing write arguments produce a clarification.
    skus = re.findall(r"\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b", original)
    percent = re.search(r"(\d+(?:[.,]\d+)?)\s*%", text)
    days = re.search(r"(\d+)\s*ngay", text)
    reference = re.search(r"\bref\s*[:=]\s*([\w-]+)", original, re.I)
    values: dict[str, Any] = {}
    if skus:
        values["skus"] = skus
    if percent:
        values["percent"] = float(percent[1].replace(",", "."))
    if days:
        values["duration_days"] = int(days[1])
    if reference:
        values["ref"] = reference[1]
    if re.search(r"uoc tinh|estimate", text):
        estimates = {
            "giam gia": "estimate_discount",
            "outlet": "estimate_outlet",
            "bundle": "estimate_bundle",
            "goi": "estimate_bundle",
            "quyen gop": "estimate_donation",
            "tai che": "estimate_recycle",
            "dong goi": "estimate_repackage",
        }
        selected = next((name for phrase, name in estimates.items() if phrase in text), None)
        if selected:
            allowed = bound.get(selected, {}).get("parameters", {}).get("properties", {})
            return call(selected, {k: v for k, v in values.items() if k in allowed})
    write_patterns = [
        (r"(?:tao|them).*?(?:coupon|ma giam)", "create_coupon"),
        (r"(?:ap dung|giam gia).*%", "apply_discount"),
        (r"(?:dang|xuat ban|tao).*?(?:bai|post)", "create_post"),
        (r"(?:bat|chay|kich hoat).*quang cao", "activate_ad"),
        (r"(?:dung|tam dung).*quang cao", "pause_ad"),
        (r"(?:doi|dat|tang|giam).*ngan sach", "set_ad_budget"),
        (r"(?:ket thuc|dung).*khuyen mai", "end_promotion"),
        (r"chuyen.*(?:kenh|outlet)", "switch_channel"),
        (r"(?:cap nhat|doi).*trang thai.*kho", "adjust_inventory"),
        (r"(?:tao|giao).*?(?:cong viec|nhiem vu)", "create_task"),
        (r"cap nhat.*sop", "update_sop_checklist"),
        (r"hoan tac|revert", "revert_action"),
    ]
    write = next((name for pattern, name in write_patterns if re.search(pattern, text) and name in bound), None)
    if write:
        if write == "create_coupon":
            code = re.search(r"\bAI-[A-Z0-9]{4,12}\b", original)
            if code:
                values["code"] = code[0]
            values["title"] = original[:200]
        if write == "create_post":
            content = re.search(r"(?:noi dung|message|nội dung)\s*[:=]\s*(.+)", original, re.I)
            if content:
                values["message"] = content[1]
            values["link_path"] = "/shop"
        if write == "set_ad_budget":
            amount = re.search(r"ngan sach\s*[:=]?\s*([\d.,]+)\s*(k|nghin|ngan)?", text)
            if amount:
                values["daily_budget_vnd"] = (
                    int(float(amount[1].replace(",", ".")) * 1000)
                    if amount[2]
                    else int(amount[1].replace(".", "").replace(",", ""))
                )
        if write == "switch_channel":
            values["to_channel"] = "outlet" if "outlet" in text else "web"
        allowed = bound[write].get("parameters", {}).get("properties", {})
        return call(write, {k: v for k, v in values.items() if k in allowed})
    if "task" in bound:
        subagent = (
            "customer_voice"
            if re.search(r"tra hang|ly do.*tra|phan hoi khach", text)
            else (
                "analyst"
                if re.search(r"sql|phan tich.*du lieu|gia doi thu", text)
                else "copywriter"
                if re.search(r"viet.*(?:bai|post|quang cao)|goi y noi dung", text)
                else None
            )
        )
        if subagent:
            return call("task", {"subagent_type": subagent, "description": original})
    choices: list[tuple[str, str, dict[str, Any]]] = [
        (r"ban tin|briefing", "get_sales_summary", {"days": 1}),
        (r"doanh thu|sales|revenue", "get_sales_summary", {"days": 7}),
        (r"hang ton|ton kho lau|dead.stock", "find_dead_stock", {}),
        (r"tra hang|high.return", "find_high_return_skus", {}),
        (r"gia doi thu", "get_competitor_prices", {}),
        (r"chien dich doi thu", "get_competitor_campaigns", {}),
        (r"xu huong|trend", "get_market_trends", {}),
        (r"su kien|lich ban le", "get_upcoming_events", {}),
        (r"muc tieu|goal", "get_goal_pacing", {}),
        (r"khuyen mai dang|promotion", "get_active_promotions", {}),
        (r"hieu qua.*(?:quang cao|chien dich)|roas", "get_campaign_performance", {"days": 30}),
        (r"quy tac|gioi han|chinh sach", "get_policy_limits", {}),
        (r"tai nguyen|asset|video", "list_marketing_assets", {}),
        (r"kpi", "get_kpis", {}),
        (r"kien thuc|sop", "search_knowledge", {"query": original}),
        (r"bai hoc|case", "search_cases", {"query": original}),
        (r"tim.*san pham", "search_products", {"query": original}),
        (r"bang.*sql|list.tables", "sql_db_list_tables", {}),
        (r"kiem.*noi dung|brand", "check_copy", {"text": original}),
    ]
    for pattern, name, args in choices:
        if re.search(pattern, text) and name in bound:
            days = re.search(r"(\d+)\s*ngay", text)
            if days and "days" in args:
                args["days"] = int(days[1])
            return call(name, args)
    # Named tool requests are useful for new features; JSON arguments are passed unchanged.
    named = next((name for name in bound if name.lower() in text), None)
    if named:
        start = original.find("{")
        if start >= 0:
            try:
                value = json.loads(original[start:])
            except ValueError:
                value = None
            if isinstance(value, dict):
                return call(named, value)
        return call(named, {})
    return AIMessage(
        content="Simulator hỗ trợ các công cụ của vai trò này. Ví dụ: "
        '{"tool":"get_sales_summary","args":{"days":7}}. '
        "Với thao tác ghi, Agent vẫn chờ phê duyệt theo luồng hiện tại."
    )
