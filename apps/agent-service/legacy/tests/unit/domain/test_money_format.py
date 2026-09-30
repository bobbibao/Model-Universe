"""MoneyFormat (T-03c): the default reproduces the historical text; a VND unit renders Vietnamese dong."""
import ast
import copy
import pickle
from pathlib import Path

import pytest

from ci_agent.domain.models import money as money_module
from ci_agent.domain.models.money import MoneyFormat


def test_the_module_is_pure_python_without_imports():
    tree = ast.parse(Path(money_module.__file__).read_text(encoding="utf-8"))
    assert not [node for node in ast.walk(tree) if isinstance(node, (ast.Import, ast.ImportFrom))]


@pytest.mark.parametrize("amount,spec,text", [
    (124702.37, ",.0f", "124,702"),
    (30429.52, "g", "30429.5"),
    (25107.0, "g", "25107"),
    (612.5, ".2f", "612.50"),
    (0.5, ".2f", "0.50"),
])
def test_default_reproduces_the_historical_format(amount, spec, text):
    assert MoneyFormat().text(amount, spec) == text


def test_default_never_writes_scientific_notation():
    assert format(1234567.0, "g") == "1.23457e+06"  # what the old summaries printed
    assert MoneyFormat().text(1234567.0, "g") == "1234567"
    assert MoneyFormat().text(1000000.0, "g") == "1000000"
    assert MoneyFormat().text(2500000.75, "g") == "2500000.75"


@pytest.mark.parametrize("amount,text", [
    (42891.6, "1.072.290.000 ₫"),
    (0.5, "12.500 ₫"),
    (0.0, "0 ₫"),
    (-2.0, "-50.000 ₫"),
])
def test_vnd_rendering(amount, text):
    assert MoneyFormat(25_000).text(amount, ",.0f") == text
    assert MoneyFormat(25_000).text(amount, "g") == text  # the legacy spec does not matter once VND is set


def test_value_semantics_and_validation():
    assert MoneyFormat(25_000) == MoneyFormat(25_000.0) and hash(MoneyFormat()) == hash(MoneyFormat())
    assert MoneyFormat() != MoneyFormat(25_000)
    with pytest.raises(ValueError):
        MoneyFormat(0)


def test_default_is_the_plain_format_for_every_amount_without_an_exponent():
    values = [n / 7 for n in range(-10_000, 10_000, 37)] + [12.5, 0.0, 999_999.4, 30429.52]
    for value in values:
        for spec in (",.0f", ".2f"):
            assert MoneyFormat().text(value, spec) == format(value, spec)
        if "e" not in format(value, "g"):
            assert MoneyFormat().text(value, "g") == format(value, "g")
    assert MoneyFormat().text(0.00001, "g") == "0"  # below 1e-4 "g" would also switch to an exponent


@pytest.mark.parametrize("money", [MoneyFormat(), MoneyFormat(25_000)])
@pytest.mark.parametrize("amount,text", [(float("nan"), "nan"), (float("inf"), "inf"), (float("-inf"), "-inf")])
def test_non_finite_amounts_are_written_plainly_instead_of_failing(money, amount, text):
    assert money.text(amount, ",.0f") == text
    assert money.text(amount, "g") == text


def test_immutable():
    money = MoneyFormat(25_000)
    with pytest.raises(AttributeError):
        money.unit_vnd = 1
    with pytest.raises(AttributeError):
        del money.unit_vnd
    with pytest.raises(AttributeError):
        money.other = 1
    assert not hasattr(money, "__dict__")  # __slots__: nothing can be attached, even bypassing __setattr__
    assert money.unit_vnd == 25_000


def test_an_amount_that_overflows_once_converted_is_written_plainly():
    assert MoneyFormat(25_000).text(1e305, ".2f") == format(1e305, ".2f")


def test_negative_zero_in_vnd():
    assert MoneyFormat(25_000).text(-0.0, ",.0f") == "0 ₫"


def test_copies_and_pickles_keep_the_value():
    for money in (MoneyFormat(), MoneyFormat(25_000)):
        assert copy.copy(money) == money and copy.deepcopy(money) == money
        assert pickle.loads(pickle.dumps(money)) == money
