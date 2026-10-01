"""Moving a lever's prior towards what was measured (docs/GROWTH_AGENT.md section 6).

posterior = (n0 * prior + n * observed) / (n0 + n). The range keeps its relative width around the new mean, and the
prior's weight grows by the outcomes it absorbed, so each new outcome moves it less.
"""

from __future__ import annotations

from shop_agent.domain.growth.defaults import Prior


def update_priors(prior: Prior, observed: float, n: int = 1) -> Prior:
    if n <= 0:
        return prior
    mean = (prior.n0 * prior.mean + n * observed) / (prior.n0 + n)
    if prior.mean > 0:
        scale = mean / prior.mean
        low, high = prior.low * scale, prior.high * scale
    else:
        low, high = min(prior.low, mean), max(prior.high, mean)
    return Prior(mean=mean, low=min(low, mean), high=max(high, mean), n0=prior.n0 + n)
