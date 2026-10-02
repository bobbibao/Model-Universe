"""The brand judge (docs/GROWTH_AGENT.md section 4): the judge model scores an option's copy against a rubric taken
from `brand_guide.md`. It runs only on copy that passed the deterministic lint, and only scores: validate decides
(revise up to twice, then the option needs a person).
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from shop_agent import llm
from shop_agent.adapters.growth_files import BRAND_GUIDE
from shop_agent.agents.investigator import language_name
from shop_agent.config import get_settings

JUDGE_PROMPT = (Path(__file__).resolve().parent / "prompts" / "brand_judge.md").read_text(encoding="utf-8")
CRITERIA = ("voice", "truthful", "clarity", "rules")
MIN_SCORE = 3
MIN_MEAN = 4.0


class CriterionScore(BaseModel):
    criterion: str = Field(description="One of: voice, truthful, clarity, rules.")
    score: int = Field(ge=1, le=5)
    note: str = Field(default="", description="One short sentence.")


class BrandVerdict(BaseModel):
    scores: list[CriterionScore]

    @property
    def passed(self) -> bool:
        """Every criterion at least 3 and a mean of at least 4 (a missing criterion counts as 1)."""
        by_name = {s.criterion: s.score for s in self.scores}
        values = [by_name.get(c, 1) for c in CRITERIA]
        return min(values) >= MIN_SCORE and sum(values) / len(values) >= MIN_MEAN

    def problems(self) -> list[str]:
        return [f"brand judge: {s.criterion} {s.score}/5 - {s.note}" for s in self.scores if s.score < MIN_MEAN]


def system_prompt() -> str:
    language = language_name(get_settings().agent_language)
    return JUDGE_PROMPT.replace("{language}", language).replace("{brand_guide}", BRAND_GUIDE)


async def judge_copy(texts: Sequence[tuple[str, str]], facts: str, *, script_key: str) -> BrandVerdict:
    """Score the copy of one option: `texts` are (kind, text) pairs, `facts` the numbers its actions execute."""
    copy = "\n".join(f"[{kind}] {text}" for kind, text in texts)
    model = llm.chat_model(llm.ModelRole.JUDGE).with_structured_output(BrandVerdict, method="function_calling")
    messages = [
        SystemMessage(system_prompt()),
        HumanMessage(f"<facts>\n{facts}\n</facts>\n\n<copy>\n{copy}\n</copy>\n\nScore the copy."),
    ]
    verdict = await model.ainvoke(messages, {"metadata": {"script_key": script_key}})
    if not isinstance(verdict, BrandVerdict):
        raise RuntimeError("the brand judge returned no BrandVerdict")
    return verdict
