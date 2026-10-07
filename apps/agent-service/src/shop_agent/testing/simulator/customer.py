"""Customer scenarios use the real observations/ids; writes remain editable proposals handled by the web."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

from langchain_core.messages import BaseMessage, HumanMessage

from shop_agent.testing.simulator.engine import normalize


def _request(messages: Sequence[BaseMessage]) -> dict[str, Any]:
    raw = next((str(m.content) for m in reversed(messages) if isinstance(m, HumanMessage)), "{}")
    value = json.loads(raw)
    return value if isinstance(value, dict) else {}


def respond(
    *, messages: Sequence[BaseMessage], metadata: Mapping[str, Any], tools: list[dict[str, Any]] | None
) -> dict[str, Any]:
    request = _request(messages)
    original = str(request.get("message", ""))
    text = normalize(original)
    intent = str(metadata.get("intent", "customer.fallback")).removeprefix("customer.")
    observations = request.get("observations") or []
    cart = request.get("cart") or []
    catalog: dict[int, dict[str, Any]] = {
        p["id"]: p for p in request.get("catalog") or [] if isinstance(p, dict) and "id" in p
    }
    for observation in observations:
        kind = (observation.get("tool") or {}).get("kind") or observation.get("kind")
        data = observation.get("data")
        if kind in ("product_details", "current_product") and isinstance(data, dict) and "id" in data:
            catalog[data["id"]] = {**catalog.get(data["id"], {}), **data}
        if kind == "search_products" and isinstance(data, dict):
            for product in data.get("products") or []:
                catalog[product["id"]] = {**catalog.get(product["id"], {}), **product}
    result: dict[str, Any] = {"answer": "", "reads": [], "actions": [], "productIds": []}

    def answer(value: str) -> dict[str, Any]:
        result["answer"] = value[:12000]
        return {"structured": result}

    def read(kind: str, **args: Any) -> dict[str, Any] | None:
        spec = {"kind": kind, **args}
        found = next((o for o in reversed(observations) if o.get("tool") == spec), None)
        if found is None and request.get("readsAllowed", True) and len(result["reads"]) < 4:
            result["reads"].append(spec)
        return found

    def action(kind: str, **args: Any) -> dict[str, Any]:
        result["actions"].append({"kind": kind, **{k: v for k, v in args.items() if v is not None}})
        return answer("Mình đã chuẩn bị đề xuất. Bạn kiểm tra, chỉnh sửa và bấm xác nhận để thực hiện nhé.")

    private = {
        "orders",
        "order",
        "cancel",
        "return",
        "wishlist",
        "wishlist_add",
        "wishlist_remove",
        "review",
        "profile",
        "logout",
    }
    if intent in private and not request.get("loggedIn"):
        result["actions"] = [{"kind": "navigate", "path": "/auth/signin"}]
        return answer("Bạn đăng nhập để mình hỗ trợ thông tin và thao tác trên tài khoản của bạn nhé.")
    if intent == "security":
        route = "/auth/signup" if "dang ky" in text else "/user-profile" if "mat khau" in text else "/auth/signin"
        result["actions"] = [{"kind": "navigate", "path": route}]
        return answer("Bạn sử dụng biểu mẫu bảo mật này nhé; đừng gửi mật khẩu, OTP hay số thẻ vào hội thoại.")
    if intent == "unsafe":
        return answer(
            "Mình chỉ hỗ trợ dữ liệu công khai của cửa hàng và tài khoản của bạn. "
            "Mình không truy cập dữ liệu quản trị, khách khác hoặc nghiên cứu bên ngoài cửa hàng."
        )
    if intent == "navigate":
        paths = {
            "gio hang": "/cart",
            "yeu thich": "/wishlist",
            "don hang": "/order-history",
            "lien he": "/contact",
            "gioi thieu": "/about",
            "tai khoan": "/user-profile",
            "tro ly": "/assistant",
            "trang chu": "/",
            "shop": "/shop",
            "cua hang": "/shop",
        }
        route = next((path for word, path in paths.items() if word in text), "/shop")
        return action("navigate", path=route)
    if intent == "logout":
        return action("logout")
    if intent == "cart_clear":
        return action("cart_clear")
    if intent == "coupon":
        code = re.search(r"(?:ma(?: giam gia)?|code|coupon)\s*[:=]?\s*([a-z0-9]+(?:-[a-z0-9]+)*)", text)
        return action("apply_coupon", code=code[1].upper()) if code else answer("Bạn gửi mã giảm giá muốn áp dụng nhé.")
    if intent in ("checkout", "cart"):
        observation = read("cart_quote")
        if result["reads"]:
            return answer("Mình kiểm tra giỏ và giá hiện tại trước nhé.")
        if observation and observation.get("error"):
            return answer(str(observation["error"]))
        if intent == "checkout":
            if not cart:
                return answer("Giỏ đang trống. Bạn chọn sản phẩm trước khi thanh toán nhé.")
            shipping: dict[str, str] = {}
            labels = {
                "recipientName": "nguoi nhan|người nhận",
                "phone": "so dien thoai|số điện thoại|phone",
                "address": "dia chi|địa chỉ",
                "ward": "phuong|phường",
                "district": "quan|quận",
                "city": "thanh pho|thành phố",
                "note": "ghi chu|ghi chú",
            }
            for field, label in labels.items():
                supplied = re.search(rf"(?:{label})\s*[:=]\s*([^;\n]+)", original, re.I)
                if supplied:
                    shipping[field] = supplied[1].strip()
            return action("checkout", shipping=shipping or None)
        return answer("Giỏ hàng hiện tại: " + json.dumps((observation or {}).get("data", cart), ensure_ascii=False))
    if intent == "contact":
        email = re.search(r"[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}", original)
        phone = re.search(r"(?:\+84|0)\d{9,10}\b", original)
        return action(
            "contact", email=email[0] if email else None, phone=phone[0] if phone else None, message=original[:2000]
        )
    if intent == "profile":
        phone = re.search(r"(?:\+84|0)\d{9,10}\b", original)
        address = re.search(r"(?:địa chỉ|dia chi)\s*[:=]\s*([^;\n]+)", original, re.I)
        first = re.search(r"(?:tên|ten|firstName)\s*[:=]\s*([^;\n]+)", original, re.I)
        last = re.search(r"(?:họ|ho|lastName)\s*[:=]\s*([^;\n]+)", original, re.I)
        args = {
            "phone": phone[0] if phone else None,
            "address": address[1] if address else None,
            "firstName": first[1] if first else None,
            "lastName": last[1] if last else None,
        }
        if not any(args.values()):
            return answer("Bạn gửi thông tin cần sửa theo dạng tên: …; họ: …; địa chỉ: … hoặc số điện thoại nhé.")
        return action("update_profile", **args)
    if intent in ("orders", "order", "cancel", "return"):
        order_id = re.search(r"(?:don(?: hang)?\s*#?|order\s*#?|#)\s*(\d+)", text)
        if intent == "orders" or not order_id:
            observation = read("my_orders", page=1)
            if result["reads"]:
                return answer("Mình tra các đơn hàng của bạn nhé.")
            return answer(
                str(
                    (observation or {}).get("error")
                    or "Đơn hàng của bạn: " + json.dumps((observation or {}).get("data", {}), ensure_ascii=False)
                )
                + (" Bạn cho mình mã đơn muốn xử lý nhé." if intent in ("cancel", "return") else "")
            )
        oid = int(order_id[1])
        observation = read("return_options" if intent == "return" else "my_order", orderId=oid)
        if result["reads"]:
            return answer("Mình kiểm tra trạng thái và điều kiện của đơn hàng nhé.")
        if not observation or observation.get("error"):
            return answer(str((observation or {}).get("error", "Chưa xác minh được đơn này.")))
        data = observation.get("data") or {}
        if intent == "cancel":
            if data.get("status") != "PROCESSING":
                return answer("Đơn này không còn ở trạng thái đang xử lý nên không thể hủy.")
            return action("cancel_order", orderId=oid)
        if intent == "return":
            reasons = {
                "sai size": "wrong_size",
                "sai kich": "wrong_size",
                "loi": "defective",
                "khong dung mo ta": "not_as_described",
                "doi y": "changed_mind",
            }
            reason = next((v for k, v in reasons.items() if k in text), None)
            items = [i for i in data.get("lines", []) if i.get("returnable", 0) > 0]
            if not data.get("canRequest", False) or not items:
                return answer(str(data.get("blockedReason") or "Đơn này không có sản phẩm đủ điều kiện trả."))
            if not reason:
                return answer("Bạn cho mình lý do và sản phẩm muốn trả nhé: sai size, lỗi, không đúng mô tả hay đổi ý.")
            item_id = re.search(r"(?:muc|item)\s*#?\s*(\d+)", text)
            selected = next((i for i in items if item_id and i["orderItemId"] == int(item_id[1])), None)
            if selected is None and len(items) == 1:
                selected = items[0]
            if selected is None:
                return answer("Bạn chỉ rõ mã mục (item) muốn trả trong đơn nhé.")
            quantity = re.search(r"(?:so luong|quantity)\s*[:=]?\s*(\d+)", text)
            count = int(quantity[1]) if quantity else 1
            if count > selected["returnable"]:
                return answer("Số lượng yêu cầu vượt số lượng được phép trả.")
            return action(
                "return_request",
                orderId=oid,
                returnItems=[{"orderItemId": selected["orderItemId"], "quantity": count, "reason": reason}],
                note=original[:2000],
            )
        return answer("Thông tin đơn hàng của bạn: " + json.dumps(data, ensure_ascii=False))
    if intent in ("policies", "filters", "wishlist"):
        kind = {"policies": "store_policies", "filters": "catalog_filters", "wishlist": "my_wishlist"}[intent]
        observation = read(kind)
        if result["reads"]:
            return answer("Mình tra dữ liệu cửa hàng để trả lời chính xác nhé.")
        if not observation:
            return answer("Chưa có dữ liệu xác thực cho yêu cầu này.")
        return answer(str(observation.get("error") or json.dumps(observation.get("data"), ensure_ascii=False)))
    if intent == "wishlist_remove":
        observation = read("my_wishlist")
        if result["reads"]:
            return answer("Mình xem danh sách yêu thích của bạn trước nhé.")
        data = (observation or {}).get("data") or []
        items = data if isinstance(data, list) else data.get("items", data.get("rows", []))
        matched = re.search(r"(?:item|muc)\s*#?\s*(\d+)", text)
        item = next((i for i in items if matched and i.get("id") == int(matched[1])), None)
        if item is None and len(items) == 1:
            item = items[0]
        return (
            action("wishlist_remove", wishlistItemId=item["id"])
            if item
            else answer("Bạn chọn mục muốn xóa khỏi danh sách yêu thích nhé.")
        )

    # Product ids come exclusively from catalog/current product/cart, never from a made-up seed id.
    explicit = re.search(r"(?:san pham|product|sp|#)\s*#?\s*(\d+)", text)
    path_id = re.search(r"/shop/product/(\d+)", str(request.get("path", "")))
    pid = int(explicit[1]) if explicit else int(path_id[1]) if path_id else None
    if pid is None:
        named = [p for p in catalog.values() if normalize(str(p.get("name", ""))) in text and p.get("name")]
        if len(named) == 1:
            pid = named[0]["id"]
        elif len(catalog) == 1:
            pid = next(iter(catalog))
    product = catalog.get(pid) if pid is not None else None
    if pid is None and intent in ("cart_update", "cart_remove") and len(cart) == 1:
        pid = cart[0].get("productId")
        product = catalog.get(pid) if pid else None
    if pid and not product and intent != "cart_remove":
        observation = read("product_details", productId=pid)
        if result["reads"]:
            return answer("Mình kiểm tra sản phẩm bạn chọn nhé.")
        return answer(str((observation or {}).get("error") or "Không tìm thấy sản phẩm này."))
    searched = next((o for o in reversed(observations) if (o.get("tool") or {}).get("kind") == "search_products"), None)
    if (
        intent in ("search", "research", "cart_add", "wishlist_add", "review", "details", "reviews") and not catalog
    ) or (intent == "search" and searched is None):
        if searched:
            return answer(
                str(searched.get("error") or "Chưa tìm thấy sản phẩm phù hợp. Bạn thử đổi từ khóa hoặc ngân sách nhé.")
            )
        words = re.findall(r"\b(?:nike|adidas|puma|giay|ao|quan|vay|tui|dep|sneaker|boot)\b", text)
        query = " ".join(dict.fromkeys(words)) or original[:160]
        search_args: dict[str, Any] = {"q": query, "inStock": True, "sort": "best_selling"}
        budget = re.search(r"(?:duoi|toi da|ngan sach)\s*([\d.,]+)\s*(k|nghin|ngan|trieu)?", text)
        if budget:
            amount = (
                float(budget[1].replace(",", ".")) if budget[2] else float(budget[1].replace(".", "").replace(",", ""))
            )
            search_args["maxPrice"] = int(amount * (1000000 if budget[2] == "trieu" else 1000 if budget[2] else 1))
        if " nu" in text:
            search_args["gender"] = "female"
        elif " nam" in text:
            search_args["gender"] = "male"
        read("search_products", **search_args)
        return answer(
            "Mình tìm sản phẩm trong cửa hàng theo nhu cầu của bạn nhé."
            if result["reads"]
            else "Chưa có sản phẩm để đối chiếu; bạn thử từ khóa khác nhé."
        )
    if intent in ("cart_add", "cart_update", "cart_remove", "wishlist_add", "review", "details"):
        if pid is None:
            return answer("Bạn chọn sản phẩm cụ thể hoặc mở trang sản phẩm muốn thao tác nhé.")
        result["productIds"] = [pid] if product else []
        size_match = re.search(r"\b(?:size|co|kich thuoc)\s*[:=]?\s*([a-z0-9.]+)", text)
        size = size_match[1].upper() if size_match else None
        quantity = re.search(r"(?:so luong|quantity|thanh)\s*[:=]?\s*(\d+)|\b(\d+)\s*(?:doi|cai|chiec)\b", text)
        count = int(quantity[1] or quantity[2]) if quantity else 1
        if intent in ("cart_add", "cart_update", "wishlist_add"):
            if product and intent != "wishlist_add" and product.get("stock", 1) <= 0:
                return answer("Sản phẩm đang hết hàng; mình chưa thể đề xuất thêm vào giỏ.")
            sizes = (product or {}).get("availableSizes", (product or {}).get("sizes"))
            if size and sizes and size not in [str(s).upper() for s in sizes]:
                return answer("Size bạn chọn chưa có. Bạn chọn trong các size: " + ", ".join(map(str, sizes)))
            if count < 1 or (product and product.get("stock") is not None and count > product["stock"]):
                return answer("Số lượng chưa hợp lệ hoặc vượt tồn kho hiện tại.")
            return action(intent, productId=pid, size=size, quantity=count)
        if intent == "cart_remove":
            lines = [
                line for line in cart if line.get("productId") == pid and (size is None or line.get("size") == size)
            ]
            if len(lines) != 1:
                return answer("Bạn chỉ rõ sản phẩm và size đang có trong giỏ để mình xóa đúng dòng nhé.")
            return action("cart_remove", productId=pid, size=lines[0].get("size"))
        if intent == "review":
            experience = re.search(r"(?:trải nghiệm|trai nghiem|nội dung|noi dung)\s*[:=]\s*(.+)", original, re.I)
            if not experience:
                return answer("Bạn kể trải nghiệm thật về sản phẩm nhé; mình sẽ giúp viết lại thành bản nháp đánh giá.")
            observation = read("review_eligibility", productId=pid)
            if result["reads"]:
                return answer("Mình kiểm tra điều kiện đánh giá trước nhé.")
            data = (observation or {}).get("data") or {}
            if not data.get("canReview"):
                return answer(
                    str(
                        (observation or {}).get("error")
                        or data.get("reason")
                        or "Bạn chưa đủ điều kiện đánh giá sản phẩm này."
                    )
                )
            stars = re.search(r"\b([1-5])\s*(?:sao|star)\b", text)
            return action(
                "review",
                productId=pid,
                title="Trải nghiệm của tôi",
                content=experience[1][:2000],
                rating=int(stars[1]) if stars else None,
            )
    if intent == "reviews" and pid:
        observation = read("product_reviews", productId=pid)
        if result["reads"]:
            return answer("Mình đọc đánh giá từ khách đã mua nhé.")
        return answer(
            str((observation or {}).get("error") or json.dumps((observation or {}).get("data", {}), ensure_ascii=False))
        )
    if intent in ("research", "details") or request.get("research"):
        for p in list(catalog.values())[:2]:
            read("product_details", productId=p["id"])
            read("product_reviews", productId=p["id"])
        if result["reads"]:
            return answer("Mình đọc thông tin và đánh giá của các sản phẩm để so sánh trong phạm vi cửa hàng.")
    if catalog:
        products = list(catalog.values())[:8]
        result["productIds"] = [p["id"] for p in products]
        lines = []
        for p in products:
            price = p.get("salePrice")
            facts = f" — {price:,} ₫" if isinstance(price, (int, float)) else " — chưa có giá xác thực"
            if p.get("stock") is not None:
                facts += f"; tồn kho: {p['stock']}"
            if p.get("rating") is not None:
                facts += f"; điểm đánh giá từ khách: {p['rating']}"
            if p.get("description"):
                facts += "; mô tả cửa hàng: " + str(p["description"])[:400]
            lines.append(f"[{p.get('name', 'Sản phẩm')} ](/shop/product/{p['id']}){facts}")
        if intent == "research" or request.get("research"):
            priced = [p for p in products if isinstance(p.get("salePrice"), (int, float))]
            if len(priced) > 1:
                cheapest = min(priced, key=lambda p: p["salePrice"])
                lines.append(
                    f"Nếu ưu tiên giá, {cheapest.get('name', 'sản phẩm này')} có giá thấp nhất trong các mẫu đã đọc."
                )
            for observation in observations:
                if (observation.get("tool") or {}).get("kind") == "product_reviews":
                    lines.append(
                        "Ý kiến khách hàng (không phải thông số cửa hàng): "
                        + json.dumps(observation.get("data", {}), ensure_ascii=False)[:1200]
                    )
            lines.append(
                "So sánh dựa trên giá, tồn kho và dữ liệu trên; "
                "chưa đủ thông tin xác thực để kết luận về độ bền hoặc bảo hành."
            )
        return answer("\n\n".join(lines))
    return answer(
        "Chào bạn! Mình là Agent của cửa hàng. Bạn có thể nhờ tìm sản phẩm, so sánh, sửa giỏ, "
        "tra đơn hoặc chuẩn bị thao tác. Bạn đang cần hỗ trợ gì?"
    )
