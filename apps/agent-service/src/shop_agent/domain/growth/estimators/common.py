"""What a growth lever is expected to earn: incremental revenue and gross profit as p10 / p50 / p90 (whole VND).

The three points come from a prior's low / mean / high (`data/growth/priors.yaml`), so they are ranges of the
assumption, not statistical intervals. `confidence` is how narrow that range is (0.1 to 0.9).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from shop_agent.domain.growth.defaults import Prior


@dataclass(frozen=True)
class GrowthEstimate:
    lever: str
    revenue_p10: int
    revenue_p50: int
    revenue_p90: int
    profit_p10: int
    profit_p50: int
    profit_p90: int
    spend_vnd: int = 0  # paid media
    discount_cost_vnd: int = 0  # margin given away on sales that would have happened anyway (p50)
    confidence: float = 0.5
    assumptions: tuple[str, ...] = field(default_factory=tuple)

    @property
    def value(self) -> float:
        """What the prioritizer ranks by: the expected incremental gross profit, weighted by confidence."""
        return self.profit_p50 * self.confidence

    def as_dict(self) -> dict[str, object]:
        return {
            "lever": self.lever,
            "revenue_vnd": {"p10": self.revenue_p10, "p50": self.revenue_p50, "p90": self.revenue_p90},
            "profit_vnd": {"p10": self.profit_p10, "p50": self.profit_p50, "p90": self.profit_p90},
            "spend_vnd": self.spend_vnd,
            "discount_cost_vnd": self.discount_cost_vnd,
            "confidence": round(self.confidence, 2),
            "assumptions": list(self.assumptions),
        }


def confidence_of(prior: Prior) -> float:
    if prior.mean <= 0:
        return 0.1
    return min(0.9, max(0.1, 1 - (prior.high - prior.low) / (2 * prior.mean)))


def combine(lever: str, parts: list[GrowthEstimate]) -> GrowthEstimate:
    """Levers run together: their figures add up; the confidence is the spend- or profit-weighted mean."""
    if not parts:
        return GrowthEstimate(lever, 0, 0, 0, 0, 0, 0, confidence=0.1)
    weights = [max(abs(p.profit_p50), 1) for p in parts]
    return GrowthEstimate(
        lever=lever,
        revenue_p10=sum(p.revenue_p10 for p in parts),
        revenue_p50=sum(p.revenue_p50 for p in parts),
        revenue_p90=sum(p.revenue_p90 for p in parts),
        profit_p10=sum(p.profit_p10 for p in parts),
        profit_p50=sum(p.profit_p50 for p in parts),
        profit_p90=sum(p.profit_p90 for p in parts),
        spend_vnd=sum(p.spend_vnd for p in parts),
        discount_cost_vnd=sum(p.discount_cost_vnd for p in parts),
        confidence=sum(p.confidence * w for p, w in zip(parts, weights, strict=True)) / sum(weights),
        assumptions=tuple(a for p in parts for a in p.assumptions),
    )
