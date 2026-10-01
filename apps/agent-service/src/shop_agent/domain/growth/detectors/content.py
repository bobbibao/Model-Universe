"""Content detectors: `content_cadence` (the Page has been quiet) and `new_arrivals` (new products not announced)."""

from __future__ import annotations

from datetime import datetime, timedelta

from shop_agent.domain.growth.defaults import GrowthDefaults
from shop_agent.domain.growth.demand import is_new_arrival, sellable_items
from shop_agent.domain.growth.detectors.base import MAX_SKUS
from shop_agent.domain.growth.snapshot import GrowthSnapshot, Post
from shop_agent.domain.models import Opportunity, Severity, make_fingerprint


def _post_time(post: Post) -> datetime | None:
    return post.published_at or post.scheduled_at


def last_post_at(snapshot: GrowthSnapshot) -> datetime | None:
    times = [t for p in snapshot.posts if p.status in ("published", "scheduled") and (t := _post_time(p)) is not None]
    return max(times, default=None)


class ContentCadenceDetector:
    kind = "content_cadence"

    def detect(self, snapshot: GrowthSnapshot, defaults: GrowthDefaults) -> list[Opportunity]:
        days = defaults.detectors.content_cadence_days
        last = last_post_at(snapshot)
        if last is not None and last > snapshot.taken_at - timedelta(days=days):
            return []
        top = sorted(sellable_items(snapshot), key=lambda i: (-i.quantity, i.sku))[:5]
        quiet = "chưa có bài nào" if last is None else f"bài gần nhất cách đây {(snapshot.taken_at - last).days} ngày"
        return [
            Opportunity(
                kind=self.kind,
                fingerprint=make_fingerprint(self.kind, ["facebook"], f"{snapshot.today:%Y-%m-%d}"),
                severity=Severity.LOW,
                title="Trang Facebook chưa có bài mới",
                summary=f"Trang Facebook của shop {quiet} (nhịp đăng tối thiểu {days} ngày một bài).",
                evidence={"days_since_post": -1 if last is None else (snapshot.taken_at - last).days},
                skus=tuple(i.sku for i in top),
                detected_at=snapshot.taken_at,
            )
        ]


class NewArrivalsDetector:
    kind = "new_arrivals"

    def detect(self, snapshot: GrowthSnapshot, defaults: GrowthDefaults) -> list[Opportunity]:
        days = defaults.detectors.new_arrival_days
        fresh = [i for i in sellable_items(snapshot) if is_new_arrival(i, snapshot, days)]
        if not fresh:
            return []
        newest = max(i.created_at for i in fresh)
        last = last_post_at(snapshot)
        if last is not None and last >= newest:
            return []  # a post went out after the newest arrival
        fresh.sort(key=lambda i: (i.created_at, i.sku), reverse=True)
        skus = tuple(i.sku for i in fresh[:MAX_SKUS])
        return [
            Opportunity(
                kind=self.kind,
                fingerprint=make_fingerprint(self.kind, skus),
                severity=Severity.MEDIUM if len(skus) >= 5 else Severity.LOW,
                title=f"{len(skus)} sản phẩm mới chưa được giới thiệu",
                summary=(
                    f"{len(skus)} sản phẩm lên kệ trong {days} ngày qua chưa có bài giới thiệu "
                    "(không giảm giá hàng mới)."
                ),
                evidence={"new_products": len(skus)},
                skus=skus,
                detected_at=snapshot.taken_at,
            )
        ]
