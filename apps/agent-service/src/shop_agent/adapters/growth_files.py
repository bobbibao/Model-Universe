"""The growth agent's versioned data files, read once at import: thresholds (`data/growth/defaults.yaml`), lever
priors (`data/growth/priors.yaml`) and the machine-checked brand rules (`data/knowledge/brand/brand_policy.yaml`)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from shop_agent.domain.growth.brand import BrandPolicy
from shop_agent.domain.growth.defaults import GrowthDefaults, Priors

DATA_DIR = Path(__file__).resolve().parents[3] / "data"


def _yaml(path: Path) -> Any:
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def load_defaults(path: Path = DATA_DIR / "growth" / "defaults.yaml") -> GrowthDefaults:
    return GrowthDefaults.model_validate(_yaml(path))


def load_priors(path: Path = DATA_DIR / "growth" / "priors.yaml") -> Priors:
    return Priors.from_mapping(_yaml(path))


def load_brand_policy(path: Path = DATA_DIR / "knowledge" / "brand" / "brand_policy.yaml") -> BrandPolicy:
    return BrandPolicy.model_validate(_yaml(path))


GROWTH_DEFAULTS = load_defaults()
BASE_PRIORS = load_priors()
BRAND_POLICY = load_brand_policy()
BRAND_GUIDE = (DATA_DIR / "knowledge" / "brand" / "brand_guide.md").read_text(encoding="utf-8")
