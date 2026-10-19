import json

from shop_agent.domain.growth.brand import claims
from shop_agent.domain.growth.post_template import post_template_problems


def post(body: str) -> str:
    return (
        f"🔥 MODEL UNIVERSE 🔥\n{body}\n"
        "♻️ Trade - Thu mua - Cầm - Nhận lắp model\n"
        "📍 Gò Vấp - TP.HCM\n🚚 Ship COD toàn quốc\n📩 Inbox shop\nMODEL UNIVERSE"
    )


def test_requires_footer_and_owner_voice() -> None:
    assert post_template_problems("Kính chào quý khách, bạn hãy xem hàng.", "")
    assert not post_template_problems(post("Anh em xem bộ sưu tập mới của shop."), "")


def test_owner_short_price_notation_is_checked_as_money() -> None:
    assert [claim.value for claim in claims("2M9 / 5m4 / 1m3")] == [2900000, 5400000, 1300000]


def test_requires_every_product_condition_price_and_disclosed_defect() -> None:
    facts = json.dumps(
        {
            "products": [
                {
                    "name": "MG Unicorn",
                    "sku": "MG-01",
                    "condition": "preowned",
                    "price": "1800000 VND",
                    "defects": ["Thiếu kiếm"],
                },
                {"name": "RG Zaku", "sku": "RG-02", "condition": "new", "price": "650000 VND", "defects": []},
            ]
        }
    )
    valid = post("🆕 HÀNG NEW\n• RG Zaku — 650K\n♻️ HÀNG 2ND\n• MG Unicorn — 1.800K\n⚠️ Thiếu kiếm")
    assert not post_template_problems(valid, facts)
    assert any("defect" in problem for problem in post_template_problems(valid.replace("Thiếu kiếm", "Keng"), facts))
    assert any(
        "missing selected product" in problem
        for problem in post_template_problems(valid.replace("RG Zaku", "Khác"), facts)
    )
    assert any("price" in problem for problem in post_template_problems(valid.replace("1.800K", "IB"), facts))
